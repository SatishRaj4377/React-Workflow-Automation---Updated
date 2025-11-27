import { DiagramComponent } from '@syncfusion/ej2-react-diagrams';
import { NodeModel } from '@syncfusion/ej2-diagrams';
import { ExecutionContext, NodeExecutionResult, WorkflowExecutionOptions, WorkflowExecutionStatus } from '../types';
import { findTriggerNodes, findConnectedNodes, updateNodeStatus, resetExecutionStates, getTargetsByPort, getNodeConfig, isIfConditionNode, isLoopNode, isSwitchNode } from '../utilities';
import { showErrorToast, showSuccessToast } from '../components/Toast';
import { globalExecutorRegistry } from './ExecutorRegistry';
import { ClientSideNodeExecutor } from './ClientSideNodeExecutor';

/**
 * Service for managing workflow execution with support for both client-side
 * and server-side node execution.
 */
export class WorkflowExecutionService {
  private diagram: DiagramComponent;
  private executionStatus: WorkflowExecutionStatus;
  private executionContext: ExecutionContext;
  private options: WorkflowExecutionOptions;
  private abortController: AbortController;

  constructor(diagram: DiagramComponent, options: WorkflowExecutionOptions = {}) {
    this.diagram = diagram;
    this.options = {
      timeout: 30000,
      retryCount: 3,
      retryDelay: 1000,
      enableDebug: false,
      ...options
    };
    this.executionStatus = {
      isExecuting: false,
      executionPath: []
    };
    this.executionContext = {
      variables: {},
      results: {}
    };
    this.abortController = new AbortController();

    // Initialize executors
    this.initializeExecutors();
  }

  /**
   * Initialize and register node executors
   */
  private initializeExecutors() {
    // Register client-side executor for logical operations
    globalExecutorRegistry.registerExecutor('client', new ClientSideNodeExecutor());
  }

  /**
   * Start workflow execution from trigger nodes
   */
  async executeWorkflow(): Promise<boolean> {
    try {
      await this.prepareExecution();
      
      const triggerNodes = this.findAndValidateTriggerNodes();
      if (!triggerNodes) return false;

      // Execute each trigger node branch
      const results = await Promise.all(
        triggerNodes.map(node => this.executeBranchWithErrorHandling(node))
      );

      // Check if any branch failed or any node error was recorded
      const allBranchesOk = results.every(result => result);
      const hadError = Boolean(this.executionStatus.error);
      const success = allBranchesOk && !hadError;
      if (success) {
        showSuccessToast('Execution Complete', 'Workflow executed successfully');
      }
      return success;

    } catch (error) {
      this.handleExecutionError(error);
      return false;
    } finally {
      this.cleanupExecution();
    }
  }

  /**
   * Prepare the workflow for execution
   */
  private async prepareExecution() {
    this.resetExecution();
    this.abortController = new AbortController();
    this.executionStatus.isExecuting = true;
    // Allow client executors (AI Agent) to resolve connected nodes/port
    (this.executionContext as any).diagram = this.diagram;

    // Notify UI that a new execution cycle started (clear any previous waiting banners)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wf:trigger:clear'));
    }
  }

  /**
   * Find and validate trigger nodes
   */
  private findAndValidateTriggerNodes(): NodeModel[] | null {
    const triggerNodes = findTriggerNodes(this.diagram);
    if (triggerNodes.length === 0) {
      showErrorToast('Execution Failed', 'No trigger nodes found in the workflow');
      return null;
    }
    return triggerNodes;
  }

  /**
   * Execute a branch with error handling
   */
  private async executeBranchWithErrorHandling(node: NodeModel): Promise<boolean> {
    try {
      return await this.executeBranch(node);
    } catch (error: any) {
      // Treat user/navigation cancellations as graceful (no error paint)
      const msg = String(error?.message || error);
      const isCancelled =
        this.abortController.signal.aborted ||
        msg === 'Execution cancelled' ||
        msg === 'Form trigger cancelled';
      if (isCancelled) {
        return false; // stop traversal quietly
      }
      console.error(`Branch execution failed at node ${node.id}:`, error);
      if (node.id) {
        updateNodeStatus(this.diagram, node.id, 'error');
      }
      return false;
    }
  }

  /**
   * Execute a branch of the workflow
   */
  private async executeBranch(node: NodeModel): Promise<boolean> {
    if (!node.id) return false;

    try {
      await this.checkExecutionCancelled();
      
      // Update status and track execution
      this.updateNodeExecutionStatus(node.id);

      // Execute the node
      const result = await this.executeNodeWithTimeout(node);
      if (!result.success) {
        throw new Error(result.error || 'Node execution failed');
      }

      // If a Stop (Do Nothing) node signalled a stop, abort the entire workflow immediately
      if ((result as any)?.data?.stopped === true) {
        // Mark the node as success and stop traversal
        updateNodeStatus(this.diagram, node.id, 'success');
        // Abort the whole workflow so loops and pending branches halt
        this.abortController.abort();
        // Optionally, record a friendly reason (not treated as error)
        this.executionStatus.error = undefined;
        return true;
      }

      const cfg = getNodeConfig(node);
      if (cfg && isIfConditionNode(cfg)) {
        // Read IF result
        const out = (this.executionContext.results as Record<string, any>)[node.id];
        const isTrue = Boolean(out?.conditionResult);
        const portId = isTrue ? 'right-top-port' : 'right-bottom-port';

        // Reset once and then paint only the matched connector
        updateNodeStatus(this.diagram, node.id, 'success', { restrictToSourcePortId: portId });
      } else if (cfg && isSwitchNode(cfg)) {
        const out = (this.executionContext.results as Record<string, any>)[node.id!];
        const portId: string | null = out?.matchedPortId ?? null;
        // Reset once and then paint only the matched connector
        updateNodeStatus(this.diagram, node.id!, 'success', portId ? { restrictToSourcePortId: portId } : undefined);
      } else if (cfg && isLoopNode(cfg)) {
        // For Loop on single step exec: only mark loop body connector now; 'done' will be painted after loop handler
        const out = (this.executionContext.results as Record<string, any>)[node.id!];
        const hasItems = Array.isArray(out?.items) && out.items.length > 0;
        const portId = hasItems ? 'right-top-port' : 'right-bottom-port';
        updateNodeStatus(this.diagram, node.id!, 'success', { restrictToSourcePortId: portId });
      } else {
        // Default: Mark success and continue with connected nodes
        updateNodeStatus(this.diagram, node.id, 'success');
      }
      await this.executeConnectedNodes(node);

      return true;
    } catch (error) {
      this.handleNodeError(node.id, error);
      return false;
    }
  }

  /**
   * Execute connected nodes
   */
  private async executeConnectedNodes(node: NodeModel): Promise<void> {
    const nodeConfig = getNodeConfig(node);
    if (!nodeConfig) return;

    if (isLoopNode(nodeConfig)) {
      await this.handleLoopNode(node);
      return;
    }
    if (isIfConditionNode(nodeConfig)) {
      await this.handleIfConditionNode(node);
      return;
    }
    if (isSwitchNode(nodeConfig)) {
      await this.handleSwitchCaseNode(node);
      return;
    }
    await this.handleDefaultTraversal(node);
  }

  /**
   * Execute a single node with timeout
   */
  private async executeNodeWithTimeout(node: NodeModel): Promise<NodeExecutionResult> {
    const nodeConfig = getNodeConfig(node);
    if (!nodeConfig) {
      return { success: false, error: 'Invalid node configuration' };
    }

    const executor = this.getExecutorForNode();
    if (!executor) {
      return { success: false, error: `No executor found for node type: ${nodeConfig.nodeType}` };
    }

    try {
      // If a trigger that waits for external input (e.g., Chat/Webhook/Form), do not timeout and show waiting banner
      const isWaitingTrigger = nodeConfig.nodeType === 'Chat' || nodeConfig.nodeType === 'Webhook' || nodeConfig.nodeType === 'Form';
      if (isWaitingTrigger && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('wf:trigger:waiting', { detail: { type: nodeConfig.nodeType } })
        );
      }

      const isNoTimeoutTrigger = nodeConfig.nodeType === 'Chat' || nodeConfig.nodeType === 'Webhook' || nodeConfig.nodeType === 'Form';

      const result = isNoTimeoutTrigger
        ? await executor.executeNode(node, this.executionContext)
        : await Promise.race([
            executor.executeNode(node, this.executionContext),
            this.createTimeout()
          ]);

      // After successful execution, notify context update
      if (result.success) {
        // Clear waiting banner once the trigger resumes/completes
        if (isWaitingTrigger && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('wf:trigger:resumed'));
        }
        this.notifyContextUpdate();
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Node execution failed'
      };
    }
  }

  // --- Loop handler: Executes the branch connected to Loop's right port N times (N = items length)
  private async handleLoopNode(node: NodeModel): Promise<void> {
    const nodeId = node.id!;
    const out = (this.executionContext.results as Record<string, any>)[nodeId];
    const items: any[] = Array.isArray(out?.items) ? out.items : [];
    const total = items.length;

    // 1) Update context RIGHT AFTER the loop node executed (default view) — no 'items'
    (this.executionContext.results as any)[nodeId] = {
      currentloopitem: total > 0 ? items[0] : undefined,
      currentLoopIndex: total > 0 ? 0 : null,         // 0-based
      currentLoopIteration: total > 0 ? 1 : null,     // 1-based
      currentLoopCount: total,
      currentLoopNodeId: nodeId,                      // helpful for expressions/debug
    };
    this.notifyContextUpdate();

    // 2) If no items, still attempt to continue via 'done' branch if connected
    if (total === 0) {
      const doneTargets = getTargetsByPort(this.diagram, node.id!, 'right-bottom-port');
      await this.executeTargets(doneTargets);
      return;
    }

    // 3) Resolve downstream targets for loop body from right-top-port ("loop")
    const loopTargets = getTargetsByPort(this.diagram, node.id!, 'right-top-port');

    // 4) Iterate and publish LIVE frame (still no 'items' in context)
    for (let i = 0; i < total; i++) {
      await this.checkExecutionCancelled();

      const item = items[i];
      (this.executionContext.results as any)[nodeId] = {
        currentloopitem: item,
        currentLoopIndex: i,           // 0-based
        currentLoopIteration: i + 1,   // 1-based
        currentLoopCount: total,
        currentLoopNodeId: nodeId,
        currentLoopIsFirst: i === 0,
        currentLoopIsLast: i === total - 1,
      };
      this.notifyContextUpdate();

      try {
        // Critical: abort whole workflow on first error in this loop
        await this.executeTargets(loopTargets, { abortOnError: true });
      } catch (err) {
        // If we threw because abortController was tripped, stop looping quietly
        if (this.abortController.signal.aborted) {
          return;
        }
        throw err;
      }
    }

    // 5) After loop completes, keep a small default (first item only)
    (this.executionContext.results as any)[nodeId] = {
      currentloopitem: items[0],
      currentLoopIndex: 0,
      currentLoopIteration: 1,
      currentLoopCount: total,
      currentLoopNodeId: nodeId,
    };
    this.notifyContextUpdate();

    // 6) Continue the workflow via the 'done' branch connected to right-bottom-port
    const doneTargets = getTargetsByPort(this.diagram, node.id!, 'right-bottom-port');
    // Paint 'done' connector now that loop is finished, without clearing earlier painted loop connectors
    updateNodeStatus(this.diagram, node.id!, 'success', { restrictToSourcePortId: 'right-bottom-port', appendConnectorStatus: true });
    await this.executeTargets(doneTargets);
  }

  // IF: traverse only the chosen port (top=true, bottom=false)
  private async handleIfConditionNode(node: NodeModel): Promise<void> {
    const out = (this.executionContext.results as Record<string, any>)[node.id!];
    const isTrue = Boolean(out?.conditionResult);

    const desiredPort = isTrue ? 'right-top-port' : 'right-bottom-port';
    const targets = getTargetsByPort(this.diagram, node.id!, desiredPort);

    await this.executeTargets(targets);
  }

  // SWITCH: traverse only the matched port (or none)
  private async handleSwitchCaseNode(node: NodeModel): Promise<void> {
    const out = (this.executionContext.results as Record<string, any>)[node.id!];
    const portId: string | null = out?.matchedPortId ?? null;

    if (!portId) return; // no match → stop branch

    const targets = getTargetsByPort(this.diagram, node.id!, portId);
    await this.executeTargets(targets);
  }

  // --- Default traversal for non-conditional nodes ---
  private async handleDefaultTraversal(node: NodeModel): Promise<void> {
    updateNodeStatus(this.diagram, node.id!, 'success');
    const targets = findConnectedNodes(this.diagram as any, node.id!);
    await this.executeTargets(targets);
  }

  //  execute next nodes
  private async executeTargets(
    targets: NodeModel[],
    opts?: { abortOnError?: boolean }
  ): Promise<void> {
    for (const nxt of targets) {
      // Respect global cancellation (user cancel or programmatic abort)
      await this.checkExecutionCancelled();

      const ok = await this.executeBranchWithErrorHandling(nxt);

      if (!ok) {
        // abort the whole workflow immediately when requested
        if (opts?.abortOnError) {
          this.abortController.abort();                 // cancels everything in-flight
        }
      }
    }
  }


  // success painter for single-node runs ---
  private paintSingleNodeSuccess(node: NodeModel): void {
    const cfg = getNodeConfig(node);
    if (!cfg) return;

    if (isIfConditionNode(cfg)) {
      // Read outcome set by the IF executor
      const out = (this.executionContext.results as Record<string, any>)[node.id!];
      const isTrue = Boolean(out?.conditionResult);
      const portId = isTrue ? 'right-top-port' : 'right-bottom-port';
      // Paint ONLY the chosen connector (like your branch logic)
      updateNodeStatus(this.diagram, node.id!, 'success', { restrictToSourcePortId: portId });
      return;
    }

    if (isSwitchNode(cfg)) {
      const out = (this.executionContext.results as Record<string, any>)[node.id!];
      const portId: string | null = out?.matchedPortId ?? null;
      updateNodeStatus(this.diagram, node.id!, 'success', portId ? { restrictToSourcePortId: portId } : undefined);
      return;
    }

    // Default: just mark the node as success
    updateNodeStatus(this.diagram, node.id!, 'success');
  }

  /**
   * Execute ONLY the selected node (no upstream/downstream traversal).
   * - Intended for design-time "Execute step" to quickly see a node's output & context.
   * - If inputs are missing, the node's executor shows toasts (as implemented already).
   * - For AI Agent nodes, the executor itself will locate connected model/tools via ports,
   *   as long as `context.diagram` is present.
   */
  public async executeSingleNode(nodeId: string): Promise<{ success: boolean; error?: string; output?: any }> {
    try {
      const node = (this.diagram as any)?.getObject?.(nodeId) as NodeModel | null;
      if (!node) return { success: false, error: `Node ${nodeId} not found` };

      (this.executionContext as any).diagram = this.diagram;

      // Paint "running" for the node only (no connectors).
      updateNodeStatus(this.diagram, nodeId, 'running');

      // Reuse the existing node execution (same timeout & error path as full run).
      const result = await this.executeNodeWithTimeout(node);

      if (!result.success) {
        // Mirror your existing error handling for a single node
        this.handleNodeError(nodeId, result.error);
        return { success: false, error: result.error };
      }

      // On success, paint like in executeBranch (IF/Switch painting; else just success)
      this.paintSingleNodeSuccess(node);

      // Notify consumers (variable picker / side panels) that context changed
      this.notifyContextUpdate();

      return { success: true, output: result.data };
    } catch (err: any) {
      const message = err?.message ?? String(err);
      this.handleNodeError(nodeId, message);
      return { success: false, error: message };
    }
  }

  /**
   * Get appropriate executor for node type
   */
  private getExecutorForNode() {
    // In client-only mode always use the registered client executor
    return globalExecutorRegistry.getExecutor('client');
  }

  /**
   * Update node execution status
   */
  private updateNodeExecutionStatus(nodeId: string) {
    updateNodeStatus(this.diagram, nodeId, 'running');
    this.executionStatus.currentNodeId = nodeId;
    this.executionStatus.executionPath.push(nodeId);
  }

  /**
   * Check if execution was cancelled
   */
  private async checkExecutionCancelled() {
    if (this.abortController.signal.aborted) {
      throw new Error('Execution cancelled');
    }
  }

  /**
   * Create execution timeout
   */
  private createTimeout(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Execution timeout'));
      }, this.options.timeout);
    });
  }

  /**
   * Handle node execution error
   */
  private handleNodeError(nodeId: string, error: unknown) {
    // Ignore cancellation signals caused by Stop/Do Nothing
    const msg = error instanceof Error ? error.message : String(error);
    if (this.abortController.signal.aborted && msg === 'Execution cancelled') {
      return;
    }
    console.error(`Error executing node ${nodeId}:`, error);
    updateNodeStatus(this.diagram, nodeId, 'error');
    this.executionStatus.error = error instanceof Error ? error.message : 'Unknown error';
  }

  /**
   * Handle workflow execution error
   */
  private handleExecutionError(error: unknown) {
    console.error('Workflow execution failed:', error);
    showErrorToast(
      'Execution Failed',
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }

  /**
   * Clean up after execution
   */
  private cleanupExecution() {
    this.executionStatus.isExecuting = false;
    this.executionStatus.currentNodeId = undefined;
    // Ensure any waiting banner is cleared when execution finishes
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wf:trigger:clear'));
    }
  }

  /**
   * Reset execution state
   */
  private resetExecution() {
    this.executionStatus = {
      isExecuting: false,
      executionPath: []
    };
    this.executionContext = {
      variables: {},
      results: {}
    };
    resetExecutionStates(this.diagram);
    
    // Notify context reset
    this.notifyContextUpdate();
  }

  /**
   * Get current execution status
   */
  getExecutionStatus(): WorkflowExecutionStatus {
    return { ...this.executionStatus };
  }

  /**
   * Get execution results
   */
  getExecutionContext(): ExecutionContext {
    return { ...this.executionContext };
  }

  /**
   * Subscribe to execution context updates
   */
  private contextUpdateCallbacks: Array<(context: ExecutionContext) => void> = [];

  onExecutionContextUpdate(callback: (context: ExecutionContext) => void): void {
    this.contextUpdateCallbacks.push(callback);
  }

  private notifyContextUpdate(): void {
    const context = this.getExecutionContext();
    this.contextUpdateCallbacks.forEach(callback => callback(context));
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Clear all subscriptions
    this.contextUpdateCallbacks = [];
    
    // Stop any ongoing execution (silent to avoid toasts during unmount/navigation)
    if (this.executionStatus.isExecuting) {
      this.stopExecution(true);
    }
  }

  /**
   * Stop the current execution
   */
  stopExecution(silent?: boolean) {
    if (!this.executionStatus.isExecuting) return;

    this.abortController.abort();
    this.resetNodeStates();
    this.resetConnectorStates();
    
    this.executionStatus.isExecuting = false;
    this.executionStatus.error = 'Execution cancelled by user';

    // Only show toast when not in silent mode
    if (!silent) {
      try { showErrorToast('Execution Cancelled', 'Workflow execution was cancelled'); } catch {}
    }

    // Clear any waiting banner on cancel
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wf:trigger:clear'));
    }
  }

  /**
   * Reset node states after stopping
   */
  private resetNodeStates() {
    this.executionStatus.executionPath.forEach(nodeId => {
      updateNodeStatus(this.diagram, nodeId, 'idle');
    });
  }

  /**
   * Reset connector states after stopping
   */
  private resetConnectorStates() {
    this.diagram?.connectors?.forEach(conn => {
      const connectorPath = document.getElementById(`${conn.id}_path`);
      const connectorTargetDecorator = document.getElementById(`${conn.id}_tarDec`);

      if (connectorPath) {
        connectorPath.classList.remove(
          'workflow-connector-success',
          'workflow-connector-error'
        );
      }
      if (connectorTargetDecorator) {
        connectorTargetDecorator.classList.remove(
          'workflow-connector-targetDec-success',
          'workflow-connector-targetDec-error'
        );
      }
    });
  }
}
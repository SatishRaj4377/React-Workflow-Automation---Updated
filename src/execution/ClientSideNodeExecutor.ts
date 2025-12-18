import { getClientExecutedNodes } from '../constants/nodeRegistry';
import { BaseNodeExecutor } from './BaseExecutors';
import { ExecutionContext, NodeConfig, NodeExecutionResult } from '../types';
import { NodeModel } from '@syncfusion/ej2-react-diagrams';
import { executeTriggerCategory } from './categories/triggerNodesExecutor';
import { executeConditionCategory } from './categories/conditionNodesExecutor';
import { executeActionCategory } from './categories/actionNodesExecutor';

export class ClientSideNodeExecutor extends BaseNodeExecutor {
  executeNode(node: NodeModel, context: ExecutionContext): Promise<NodeExecutionResult> {
    const nodeConfig = this.getNodeConfig(node);
    if (!nodeConfig) {
      return Promise.reject({ success: false, error: 'Invalid node configuration' });
    }

    // Execute node logic based on type
    return this.executeClientSideLogic(node, nodeConfig, context)
      .then(result => {
        this.updateExecutionContext(node, context, result.data);
        return result;
      });
  }

  protected getSupportedNodeTypes(): string[] {
    // Return all node types that are not server-executed
    return getClientExecutedNodes();
  }

  private async executeClientSideLogic(node: NodeModel, nodeConfig: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
    // Add a small delay to simulate processing
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1500));

    switch (nodeConfig.category) {
      case 'trigger':
        return executeTriggerCategory(node, nodeConfig, context);
      case 'condition':
        return executeConditionCategory(node, nodeConfig, context);
      case 'action':
        return executeActionCategory(node, nodeConfig, context);
      default:
        return Promise.reject({ success: false, error: `Unsupported node category: ${nodeConfig.category}` });
    }
  }
}
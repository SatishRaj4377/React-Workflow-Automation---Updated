import { NodeModel } from '@syncfusion/ej2-diagrams';
import { ExecutionContext, NodeConfig, NodeExecutionResult, NodeExecutor } from '../types';

export abstract class BaseNodeExecutor implements NodeExecutor {
  abstract executeNode(node: NodeModel, context: ExecutionContext): Promise<NodeExecutionResult>;

  canExecute(node: NodeModel): boolean {
    const nodeConfig = this.getNodeConfig(node) as NodeConfig;
    return this.getSupportedNodeTypes().includes(nodeConfig?.nodeType);
  }

  protected abstract getSupportedNodeTypes(): string[];

  protected getNodeConfig(node: NodeModel): NodeConfig | undefined {
    return (node.addInfo as any)?.nodeConfig;
  }

  protected updateExecutionContext(node: NodeModel, context: ExecutionContext, data: any): void {
    if (node.id) {
      context.results[node.id] = data;
    }
  }
}

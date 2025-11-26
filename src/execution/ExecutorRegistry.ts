import { NodeExecutor, NodeExecutorRegistry } from "../types";

export class DefaultExecutorRegistry implements NodeExecutorRegistry {
  private executors: Map<string, NodeExecutor> = new Map();

  registerExecutor(nodeType: string, executor: NodeExecutor): void {
    this.executors.set(nodeType.toLowerCase(), executor);
  }

  getExecutor(nodeType: string): NodeExecutor | undefined {
    return this.executors.get(nodeType.toLowerCase());
  }
}

// Singleton instance for global access
export const globalExecutorRegistry = new DefaultExecutorRegistry();
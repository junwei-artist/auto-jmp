/**
 * Workflow Graph Manager for frontend
 * Manages node relationships, dependencies, and dynamic config updates
 */

export interface NodeContext {
  node_id: string
  predecessors: string[]  // Upstream node IDs
  successors: string[]  // Downstream node IDs
  depth: number
  execution_order: number
  upstream_outputs: Record<string, Record<string, string>>  // node_id -> {source_port: target_port}
  downstream_inputs: Record<string, Record<string, string>>  // node_id -> {source_port: target_port}
}

export interface WorkflowGraph {
  nodes: Record<string, {
    id: string
    predecessors: string[]
    successors: string[]
    depth: number
    execution_order: number
  }>
  execution_order: string[]
  connections: Array<{
    id: string
    source_node_id: string
    target_node_id: string
    source_port: string
    target_port: string
  }>
}

export class WorkflowGraphManager {
  private graph: WorkflowGraph | null = null
  private nodeContexts: Map<string, NodeContext> = new Map()
  private listeners: Map<string, Set<(context: NodeContext) => void>> = new Map()

  /**
   * Load graph structure from API
   */
  async loadGraph(workflowId: string, apiClient: any): Promise<WorkflowGraph> {
    const graph = await apiClient.get(`/v1/workflows/${workflowId}/graph`) as WorkflowGraph
    this.graph = graph
    return graph
  }

  /**
   * Load context for a specific node
   */
  async loadNodeContext(workflowId: string, nodeId: string, apiClient: any): Promise<NodeContext> {
    const context = await apiClient.get(`/v1/workflows/${workflowId}/nodes/${nodeId}/context`) as NodeContext
    this.nodeContexts.set(nodeId, context)
    return context
  }

  /**
   * Get node context (from cache or load)
   */
  async getNodeContext(workflowId: string, nodeId: string, apiClient: any): Promise<NodeContext> {
    if (this.nodeContexts.has(nodeId)) {
      return this.nodeContexts.get(nodeId)!
    }
    return await this.loadNodeContext(workflowId, nodeId, apiClient)
  }

  /**
   * Get all upstream nodes for a given node
   */
  getUpstreamNodes(nodeId: string): string[] {
    const context = this.nodeContexts.get(nodeId)
    return context?.predecessors || []
  }

  /**
   * Get all downstream nodes for a given node
   */
  getDownstreamNodes(nodeId: string): string[] {
    const context = this.nodeContexts.get(nodeId)
    return context?.successors || []
  }

  /**
   * Get execution order
   */
  getExecutionOrder(): string[] {
    return this.graph?.execution_order || []
  }

  /**
   * Get depth of a node
   */
  getNodeDepth(nodeId: string): number {
    const context = this.nodeContexts.get(nodeId)
    return context?.depth || 0
  }

  /**
   * Subscribe to node context changes
   */
  subscribe(nodeId: string, callback: (context: NodeContext) => void): () => void {
    if (!this.listeners.has(nodeId)) {
      this.listeners.set(nodeId, new Set())
    }
    this.listeners.get(nodeId)!.add(callback)

    // Return unsubscribe function
    return () => {
      this.listeners.get(nodeId)?.delete(callback)
    }
  }

  /**
   * Notify listeners of node context change
   */
  notifyNodeChange(nodeId: string, context: NodeContext) {
    this.nodeContexts.set(nodeId, context)
    this.listeners.get(nodeId)?.forEach(callback => callback(context))
  }

  /**
   * Clear all cached data
   */
  clear() {
    this.graph = null
    this.nodeContexts.clear()
    this.listeners.clear()
  }

  /**
   * Get upstream chain (all nodes that feed into this node)
   */
  getUpstreamChain(nodeId: string): string[] {
    const visited = new Set<string>()
    const result: string[] = []
    const queue: string[] = [nodeId]

    while (queue.length > 0) {
      const currentId = queue.shift()!
      if (visited.has(currentId)) continue
      visited.add(currentId)

      const context = this.nodeContexts.get(currentId)
      if (context) {
        for (const predId of context.predecessors) {
          if (!visited.has(predId)) {
            result.push(predId)
            queue.push(predId)
          }
        }
      }
    }

    return result
  }

  /**
   * Get downstream chain (all nodes that depend on this node)
   */
  getDownstreamChain(nodeId: string): string[] {
    const visited = new Set<string>()
    const result: string[] = []
    const queue: string[] = [nodeId]

    while (queue.length > 0) {
      const currentId = queue.shift()!
      if (visited.has(currentId)) continue
      visited.add(currentId)

      const context = this.nodeContexts.get(currentId)
      if (context) {
        for (const succId of context.successors) {
          if (!visited.has(succId)) {
            result.push(succId)
            queue.push(succId)
          }
        }
      }
    }

    return result
  }
}

// Global instance
export const workflowGraphManager = new WorkflowGraphManager()


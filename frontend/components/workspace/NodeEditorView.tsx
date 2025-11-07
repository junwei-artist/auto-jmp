'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, X, Zap, Database, BarChart3, Settings, Move, Trash2, ArrowUp, ArrowDown, ArrowRight } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { useSocket } from '@/lib/socket'
import toast from 'react-hot-toast'
import { workflowGraphManager, type NodeContext, type WorkflowGraph } from '@/lib/workflow-graph'
import ExcelLoaderConfig from './node-configs/ExcelLoaderConfig'
import DuckDBConvertConfig from './node-configs/DuckDBConvertConfig'
import BoxplotStatsConfig from './node-configs/BoxplotStatsConfig'

interface Node {
  id: string
  module_type: string
  module_id: string
  checkpoint_name?: string  // User note/mark for what the node is doing
  position_x: number
  position_y: number
  config: any
  state: any
}

interface Connection {
  id: string
  source_node_id: string
  target_node_id: string
  source_port: string
  target_port: string
}

interface Module {
  module_type: string
  display_name: string
  description: string
  inputs: Array<{ name: string; type: string; label: string }>
  outputs: Array<{ name: string; type: string; label: string }>
}

interface NodeEditorViewProps {
  workflowId: string
  workspaceId?: string  // Optional: workflows can be independent of workspaces
  nodes: Node[]
  connections: Connection[]
  modules: Module[]
}

interface ConnectionState {
  sourceNodeId: string | null
  sourcePort: string | null
  targetNodeId: string | null
  targetPort: string | null
  mouseX: number
  mouseY: number
}

type ConnectionStateOrNull = ConnectionState | null

const GRID_CELL_WIDTH = 220
const GRID_CELL_HEIGHT = 160
const NODE_WIDTH = 200
const NODE_HEIGHT = 120
const PORT_SIZE = 12

export default function NodeEditorView({
  workflowId,
  workspaceId,
  nodes,
  connections,
  modules
}: NodeEditorViewProps) {
  const queryClient = useQueryClient()
  const { subscribeToWorkflow, unsubscribeFromWorkflow } = useSocket()
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [isModuleDialogOpen, setIsModuleDialogOpen] = useState(false)
  const [selectedModule, setSelectedModule] = useState<Module | null>(null)
  const [checkpointName, setCheckpointName] = useState('')
  const [connectionState, setConnectionState] = useState<ConnectionStateOrNull>({
    sourceNodeId: null,
    sourcePort: null,
    targetNodeId: null,
    targetPort: null,
    mouseX: 0,
    mouseY: 0
  })
  const [isConnectionDialogOpen, setIsConnectionDialogOpen] = useState(false)
  const [pendingConnection, setPendingConnection] = useState<{
    sourceNodeId: string
    targetNodeId: string
    sourcePort: string
    targetPort: string
  } | null>(null)
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 })
  const [hoveredGridCell, setHoveredGridCell] = useState<{ x: number; y: number } | null>(null)
  const [dragState, setDragState] = useState<{ nodeId: string; startCol: number; startRow: number; currentCol: number; currentRow: number } | null>(null)
  const [nodeContext, setNodeContext] = useState<NodeContext | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Ensure connections has a default value
  const connectionsList = connections || []
  const selectedNodeData = selectedNode ? nodes.find(n => n.id === selectedNode) : null
  
  // Debug: Log connections when they change
  useEffect(() => {
    console.log('Connections updated:', connectionsList.length, connectionsList)
  }, [connectionsList])

  // Debug: Log state changes
  useEffect(() => {
    console.log('State changed - isConnectionDialogOpen:', isConnectionDialogOpen, 'pendingConnection:', pendingConnection)
  }, [isConnectionDialogOpen, pendingConnection])

  useEffect(() => {
    console.log('connectionState changed:', connectionState)
  }, [connectionState])

  // Load graph structure
  const { data: graph } = useQuery<WorkflowGraph>({
    queryKey: ['workflow-graph', workflowId],
    queryFn: async () => {
      const graph = await apiClient.get<WorkflowGraph>(`/v1/workflows/${workflowId}/graph`)
      await workflowGraphManager.loadGraph(workflowId, apiClient)
      return graph
    },
    enabled: !!workflowId
  })

  // Load node context when node is selected
  const { data: selectedNodeContext } = useQuery<NodeContext | null>({
    queryKey: ['node-context', workflowId, selectedNode],
    queryFn: async (): Promise<NodeContext | null> => {
      if (!selectedNode) return null
      const context = await workflowGraphManager.loadNodeContext(workflowId, selectedNode, apiClient)
      setNodeContext(context)
      return context
    },
    enabled: !!selectedNode && !!workflowId
  })

  const createNodeMutation = useMutation({
    mutationFn: async (data: {
      module_type: string
      checkpoint_name?: string
      position_x: number
      position_y: number
    }) => {
      return apiClient.post(`/v1/workflows/${workflowId}/nodes`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-nodes', workflowId] })
      setIsModuleDialogOpen(false)
      toast.success('Node added')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const updateNodeMutation = useMutation({
    mutationFn: async ({ nodeId, data }: { nodeId: string; data: any }) => {
      return apiClient.put(`/v1/nodes/${nodeId}`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-nodes', workflowId] })
    }
  })

  const deleteNodeMutation = useMutation<string, Error, string>({
    mutationFn: async (nodeId: string) => {
      return apiClient.delete(`/v1/nodes/${nodeId}`)
    },
    onSuccess: (_, nodeId) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-nodes', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['workflow-connections', workflowId] })
      if (selectedNode === nodeId) {
        setSelectedNode(null)
      }
      toast.success('Node deleted')
    }
  })

  const createConnectionMutation = useMutation({
    mutationFn: async (data: {
      source_node_id: string
      target_node_id: string
      source_port: string
      target_port: string
    }) => {
      console.log('Creating connection:', data)
      const response = await apiClient.post<Connection>(`/v1/workflows/${workflowId}/connections`, data)
      console.log('Connection created successfully:', response)
      return response
    },
    onSuccess: async (data) => {
      console.log('Connection mutation success:', data)
      
      // Get node names for notification
      const sourceNode = nodes.find(n => n.id === data.source_node_id)
      const targetNode = nodes.find(n => n.id === data.target_node_id)
      const sourceModule = sourceNode ? modules.find(m => m.module_type === sourceNode.module_type) : null
      const targetModule = targetNode ? modules.find(m => m.module_type === targetNode.module_type) : null
      const sourceDisplayName = sourceNode?.checkpoint_name || sourceModule?.display_name || data.source_node_id
      const targetDisplayName = targetNode?.checkpoint_name || targetModule?.display_name || data.target_node_id
      
      // Dismiss loading toast and show success
      toast.dismiss('creating-connection')
      toast.success(`✅ Path created: ${sourceDisplayName} → ${targetDisplayName}`, {
        duration: 4000,
        icon: '🔗'
      })
      
      // Clear connection state on success
      setConnectionState({
        sourceNodeId: null,
        sourcePort: null,
        targetNodeId: null,
        targetPort: null,
        mouseX: 0,
        mouseY: 0
      })
      
      // Invalidate and refetch queries to refresh UI
      await queryClient.invalidateQueries({ queryKey: ['workflow-connections', workflowId] })
      await queryClient.invalidateQueries({ queryKey: ['workflow-graph', workflowId] })
      await queryClient.invalidateQueries({ queryKey: ['node-context', workflowId] })
      
      // Force immediate refetch and wait for it
      const refetchResult = await queryClient.refetchQueries({ queryKey: ['workflow-connections', workflowId] })
      console.log('Connections refetched:', refetchResult)
      
      // Log the updated connections count
      const updatedConnections = queryClient.getQueryData<Connection[]>(['workflow-connections', workflowId])
      console.log('Updated connections after refetch:', updatedConnections?.length, updatedConnections)
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to create connection'
      
      // Dismiss loading toast and show error
      toast.dismiss('creating-connection')
      toast.error(`❌ Connection failed: ${errorMessage}`, {
        duration: 4000
      })
      
      console.error('Connection creation error:', error)
      // Clear connection state on error too
      setConnectionState({
        sourceNodeId: null,
        sourcePort: null,
        targetNodeId: null,
        targetPort: null,
        mouseX: 0,
        mouseY: 0
      })
    }
  })

  const deleteConnectionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      return apiClient.delete(`/v1/connections/${connectionId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-connections', workflowId] })
      toast.success('Connection deleted')
    }
  })

  const handleModuleSelect = (module: Module) => {
    setSelectedModule(module)
    // Generate default checkpoint name with sequence suffix
    const sameTypeNodes = nodes.filter(n => n.module_type === module.module_type)
    const nextNumber = sameTypeNodes.length + 1
    setCheckpointName(`${module.display_name} ${nextNumber}`)
  }

  const handleAddNode = () => {
    if (!selectedModule) return

    // Find first available cell (start from top-left, scan row by row)
    let col = 0
    let row = 0
    let found = false
    
    for (let r = 0; r < 20 && !found; r++) {
      for (let c = 0; c < 20 && !found; c++) {
        const isOccupied = nodes.some(n => n.position_x === c && n.position_y === r)
        if (!isOccupied) {
          col = c
          row = r
          found = true
        }
      }
    }
    
    createNodeMutation.mutate({
      module_type: selectedModule.module_type,
      // module_id will be auto-generated by backend (module_name + UUID)
      checkpoint_name: checkpointName.trim() || undefined,
      position_x: col,
      position_y: row
    })
    
    // Reset state
    setSelectedModule(null)
    setCheckpointName('')
    setIsModuleDialogOpen(false)
  }

  const handleSaveNodeConfig = (nodeId: string, config: any) => {
    updateNodeMutation.mutate({ nodeId, data: { config } })
  }

  const handleNodeClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    // Only select if not dragging
    if (!dragState) {
      setSelectedNode(selectedNode === nodeId ? null : nodeId)
    }
  }

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return

    setSelectedNode(nodeId)
    setDragState({
      nodeId,
      startCol: node.position_x,
      startRow: node.position_y,
      currentCol: node.position_x,
      currentRow: node.position_y
    })
  }

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current || e.target === svgRef.current) {
      const canvasRect = canvasRef.current?.getBoundingClientRect()
      if (!canvasRect) return

      const x = (e.clientX - canvasRect.left - viewport.x) / viewport.zoom
      const y = (e.clientY - canvasRect.top - viewport.y) / viewport.zoom

      // Calculate grid cell (column and row)
      const col = Math.floor(x / GRID_CELL_WIDTH)
      const row = Math.floor(y / GRID_CELL_HEIGHT)

      // Update drag state if dragging
      if (dragState) {
        setDragState(prev => prev ? {
          ...prev,
          currentCol: col,
          currentRow: row
        } : null)
      } else {
        setHoveredGridCell({ x: col, y: row })
      }
    }
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragState) {
      const canvasRect = canvasRef.current?.getBoundingClientRect()
      if (!canvasRect) return

      const x = (e.clientX - canvasRect.left - viewport.x) / viewport.zoom
      const y = (e.clientY - canvasRect.top - viewport.y) / viewport.zoom

      // Calculate grid cell (column and row)
      const col = Math.floor(x / GRID_CELL_WIDTH)
      const row = Math.floor(y / GRID_CELL_HEIGHT)

      setDragState(prev => prev ? {
        ...prev,
        currentCol: col,
        currentRow: row
      } : null)
    }
  }, [dragState, viewport])

  const handleConnectionMouseMove = useCallback((e: MouseEvent) => {
    // Track mouse for either flow:
    // 1. Starting from output socket (waiting for input)
    // 2. Starting from input socket (waiting for output)
    if ((connectionState?.sourceNodeId && !connectionState?.targetNodeId) || 
        (connectionState?.targetNodeId && !connectionState?.sourceNodeId)) {
      setConnectionState(prev => prev ? {
        ...prev,
        mouseX: e.clientX,
        mouseY: e.clientY
      } : null)
    }
  }, [connectionState?.sourceNodeId, connectionState?.targetNodeId])

  const handleCanvasClick = (e: React.MouseEvent) => {
    // Only handle click if not dragging
    if (!dragState && (e.target === canvasRef.current || e.target === svgRef.current)) {
      // If clicking on canvas, move selected node to that grid cell
      if (selectedNode && hoveredGridCell) {
        // Check if cell is already occupied
        const isOccupied = nodes.some(n => 
          n.id !== selectedNode && 
          n.position_x === hoveredGridCell.x && 
          n.position_y === hoveredGridCell.y
        )
        
        if (!isOccupied) {
          updateNodeMutation.mutate({
            nodeId: selectedNode,
            data: { position_x: hoveredGridCell.x, position_y: hoveredGridCell.y }
          })
        } else {
          toast.error('This cell is already occupied')
        }
      } else {
        setSelectedNode(null)
      }
    }
  }

  const handleCanvasMouseLeave = () => {
    setHoveredGridCell(null)
  }

  const handleMouseUp = useCallback(() => {
    // Handle node drag end
    if (dragState) {
      const { nodeId, currentCol, currentRow, startCol, startRow } = dragState
      
      // Only update if position changed
      if (currentCol !== startCol || currentRow !== startRow) {
        // Check if target cell is occupied
        const isOccupied = nodes.some(n => 
          n.id !== nodeId && 
          n.position_x === currentCol && 
          n.position_y === currentRow
        )
        
        if (!isOccupied) {
          updateNodeMutation.mutate({
            nodeId,
            data: { position_x: currentCol, position_y: currentRow }
          })
        } else {
          toast.error('This cell is already occupied')
        }
      }
      
      setDragState(null)
    }
    
    // Handle connection creation
    if (connectionState?.sourceNodeId && connectionState?.targetNodeId && connectionState?.sourcePort && connectionState?.targetPort) {
      createConnectionMutation.mutate({
        source_node_id: connectionState.sourceNodeId!,
        target_node_id: connectionState.targetNodeId!,
        source_port: connectionState.sourcePort!,
        target_port: connectionState.targetPort!
      })
    }
    setConnectionState({
      sourceNodeId: null,
      sourcePort: null,
      targetNodeId: null,
      targetPort: null,
      mouseX: 0,
      mouseY: 0
    })
  }, [dragState, connectionState, createConnectionMutation, nodes, updateNodeMutation])

  useEffect(() => {
    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [dragState, handleMouseMove, handleMouseUp])

  useEffect(() => {
    // Track mouse for either flow:
    // 1. Starting from output socket (waiting for input)
    // 2. Starting from input socket (waiting for output)
    if ((connectionState?.sourceNodeId && !connectionState?.targetNodeId) || 
        (connectionState?.targetNodeId && !connectionState?.sourceNodeId)) {
      window.addEventListener('mousemove', handleConnectionMouseMove)
      return () => {
        window.removeEventListener('mousemove', handleConnectionMouseMove)
      }
    }
  }, [connectionState?.sourceNodeId, connectionState?.targetNodeId, handleConnectionMouseMove])

  // Subscribe to WebSocket updates
  useEffect(() => {
    const handleWorkflowUpdate = (data: any) => {
      console.log('WebSocket update received:', data)
      
      queryClient.invalidateQueries({ queryKey: ['workflow-nodes', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['workflow-connections', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['workflow-graph', workflowId] })
      
      // Invalidate node context if the selected node or its upstream/downstream changed
      if (selectedNode) {
        queryClient.invalidateQueries({ queryKey: ['node-context', workflowId, selectedNode] })
        
        // If upstream node changed, refresh context
        if (data.type === 'node_updated' || data.type === 'node_created' || data.type === 'node_deleted') {
          const changedNodeId = data.node_id
          if (nodeContext) {
            if (nodeContext.predecessors.includes(changedNodeId) || 
                nodeContext.successors.includes(changedNodeId)) {
              // Upstream or downstream node changed, refresh context
              queryClient.invalidateQueries({ queryKey: ['node-context', workflowId, selectedNode] })
            }
          }
        }
      }
      
      if (data.type === 'node_deleted' && data.node_id === selectedNode) {
        setSelectedNode(null)
        setNodeContext(null)
      }
      
      // If connection changed, refresh graph and context
      if (data.type === 'connection_created' || data.type === 'connection_deleted') {
        queryClient.invalidateQueries({ queryKey: ['workflow-graph', workflowId] })
        if (selectedNode) {
          queryClient.invalidateQueries({ queryKey: ['node-context', workflowId, selectedNode] })
        }
        // Force immediate refetch of connections
        queryClient.refetchQueries({ queryKey: ['workflow-connections', workflowId] })
      }
    }

    subscribeToWorkflow(workflowId, handleWorkflowUpdate)
    return () => {
      unsubscribeFromWorkflow(workflowId)
    }
  }, [workflowId, subscribeToWorkflow, unsubscribeFromWorkflow, queryClient, selectedNode, nodeContext])

  const getNodeColor = (moduleType: string) => {
    const colors: Record<string, { bg: string; border: string; icon: React.ReactNode }> = {
      excel_loader: {
        bg: 'bg-gradient-to-br from-blue-500 to-blue-600',
        border: 'border-blue-400',
        icon: <Zap className="h-5 w-5" />
      },
      duckdb_convert: {
        bg: 'bg-gradient-to-br from-emerald-500 to-emerald-600',
        border: 'border-emerald-400',
        icon: <Database className="h-5 w-5" />
      },
      boxplot_stats: {
        bg: 'bg-gradient-to-br from-purple-500 to-purple-600',
        border: 'border-purple-400',
        icon: <BarChart3 className="h-5 w-5" />
      }
    }
    return colors[moduleType] || {
      bg: 'bg-gradient-to-br from-gray-500 to-gray-600',
      border: 'border-gray-400',
      icon: <Settings className="h-5 w-5" />
    }
  }

  const getPortPosition = (node: Node, portType: 'input' | 'output') => {
    // Node position in canvas coordinates (grid cell to pixel conversion)
    const nodeX = (node.position_x * GRID_CELL_WIDTH * viewport.zoom) + viewport.x + ((GRID_CELL_WIDTH - NODE_WIDTH) / 2 * viewport.zoom)
    const nodeY = (node.position_y * GRID_CELL_HEIGHT * viewport.zoom) + viewport.y + ((GRID_CELL_HEIGHT - NODE_HEIGHT) / 2 * viewport.zoom)
    
    // Socket position is at the center of the left/right edge
    const socketY = nodeY + (NODE_HEIGHT * viewport.zoom / 2)

    if (portType === 'input') {
      return { x: nodeX, y: socketY }
    } else {
      return { x: nodeX + (NODE_WIDTH * viewport.zoom), y: socketY }
    }
  }

  const getConnectionPath = (connection: Connection) => {
    const sourceNode = nodes.find(n => n.id === connection.source_node_id)
    const targetNode = nodes.find(n => n.id === connection.target_node_id)
    if (!sourceNode || !targetNode) return ''

    const sourcePos = getPortPosition(sourceNode, 'output')
    const targetPos = getPortPosition(targetNode, 'input')

    const dx = targetPos.x - sourcePos.x
    const dy = targetPos.y - sourcePos.y
    const curvature = Math.min(Math.abs(dx) * 0.5, 150)

    return `M ${sourcePos.x} ${sourcePos.y} C ${sourcePos.x + curvature} ${sourcePos.y}, ${targetPos.x - curvature} ${targetPos.y}, ${targetPos.x} ${targetPos.y}`
  }

  const getArrowMarker = (connection: Connection) => {
    const sourceNode = nodes.find(n => n.id === connection.source_node_id)
    const targetNode = nodes.find(n => n.id === connection.target_node_id)
    if (!sourceNode || !targetNode) return { x: 0, y: 0, angle: 0 }

    const sourcePos = getPortPosition(sourceNode, 'output')
    const targetPos = getPortPosition(targetNode, 'input')

    const dx = targetPos.x - sourcePos.x
    const dy = targetPos.y - sourcePos.y
    const curvature = Math.min(Math.abs(dx) * 0.5, 150)
    
    // Calculate angle at the end of the curve for arrow direction
    // For a cubic bezier, the tangent at the end is approximately the direction from the last control point to the end
    const t = 1.0 // At the end of the curve
    const angle = Math.atan2(dy, dx) * (180 / Math.PI)
    
    // Position arrow near the target port (slightly before it)
    const arrowOffset = 15
    const arrowX = targetPos.x - arrowOffset * Math.cos(angle * Math.PI / 180)
    const arrowY = targetPos.y - arrowOffset * Math.sin(angle * Math.PI / 180)

    return { x: arrowX, y: arrowY, angle }
  }

  const handleSocketClick = (e: React.MouseEvent, nodeId: string, socketType: 'input' | 'output') => {
    e.stopPropagation()
    console.log('Socket clicked:', { nodeId, socketType, connectionState })
    const node = nodes.find(n => n.id === nodeId)
    if (!node) {
      console.log('Node not found:', nodeId)
      return
    }

    const module = modules.find(m => m.module_type === node.module_type)
    const displayName = node.checkpoint_name || module?.display_name || node.module_type
    console.log('Current connectionState:', connectionState)

    if (socketType === 'output') {
      // Output socket clicked
      if (connectionState?.sourceNodeId === nodeId && connectionState?.sourcePort === 'output') {
        // Cancel connection if clicking the same output socket
        setConnectionState({
          sourceNodeId: null,
          sourcePort: null,
          targetNodeId: null,
          targetPort: null,
          mouseX: 0,
          mouseY: 0
        })
        setPendingConnection(null)
        setIsConnectionDialogOpen(false)
        toast('Connection cancelled', { icon: 'ℹ️' })
      } else if (connectionState?.targetNodeId && connectionState?.targetPort === 'input') {
        // Complete connection: output -> input (output clicked after input)
        if (connectionState.targetNodeId === nodeId) {
          // Can't connect to the same node
          toast.error('Cannot connect a node to itself')
          setConnectionState({
            sourceNodeId: null,
            sourcePort: null,
            targetNodeId: null,
            targetPort: null,
            mouseX: 0,
            mouseY: 0
          })
          setPendingConnection(null)
          setIsConnectionDialogOpen(false)
        } else {
          // Show confirmation dialog
          const pending = {
            sourceNodeId: nodeId, // Output node is the source
            targetNodeId: connectionState.targetNodeId!, // Input node is the target
            sourcePort: 'output',
            targetPort: 'input'
          }
          console.log('Setting pending connection:', pending)
          setPendingConnection(pending)
          setIsConnectionDialogOpen(true)
          console.log('Dialog should be open now, isConnectionDialogOpen:', true)
          // Force a re-render by updating state
          setTimeout(() => {
            console.log('After timeout - pendingConnection:', pending)
            console.log('After timeout - isConnectionDialogOpen:', true)
          }, 100)
        }
      } else {
        // Start connection from output socket
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setConnectionState({
          sourceNodeId: nodeId,
          sourcePort: 'output',
          targetNodeId: null,
          targetPort: null,
          mouseX: rect.left + rect.width / 2,
          mouseY: rect.top + rect.height / 2
        })
        toast.success(`Output selected: ${displayName} → Click an input socket to connect`, {
          duration: 3000
        })
      }
    } else {
      // Input socket clicked
      if (connectionState?.targetNodeId === nodeId && connectionState?.targetPort === 'input') {
        // Cancel connection if clicking the same input socket
        setConnectionState({
          sourceNodeId: null,
          sourcePort: null,
          targetNodeId: null,
          targetPort: null,
          mouseX: 0,
          mouseY: 0
        })
        setPendingConnection(null)
        setIsConnectionDialogOpen(false)
        toast('Connection cancelled', { icon: 'ℹ️' })
      } else if (connectionState?.sourceNodeId && connectionState?.sourcePort === 'output') {
        // Complete connection: output -> input (input clicked after output)
        if (connectionState.sourceNodeId === nodeId) {
          // Can't connect to the same node
          toast.error('Cannot connect a node to itself')
          setConnectionState({
            sourceNodeId: null,
            sourcePort: null,
            targetNodeId: null,
            targetPort: null,
            mouseX: 0,
            mouseY: 0
          })
          setPendingConnection(null)
          setIsConnectionDialogOpen(false)
        } else {
          // Show confirmation dialog
          const pending = {
            sourceNodeId: connectionState.sourceNodeId!, // Output node is the source
            targetNodeId: nodeId, // Input node is the target
            sourcePort: 'output',
            targetPort: 'input'
          }
          console.log('Setting pending connection:', pending)
          setPendingConnection(pending)
          setIsConnectionDialogOpen(true)
          console.log('Dialog should be open now, isConnectionDialogOpen:', true)
          // Force a re-render by updating state
          setTimeout(() => {
            console.log('After timeout - pendingConnection:', pending)
            console.log('After timeout - isConnectionDialogOpen:', true)
          }, 100)
        }
      } else {
        // Start connection from input socket (waiting for output)
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setConnectionState({
          sourceNodeId: null,
          sourcePort: null,
          targetNodeId: nodeId,
          targetPort: 'input',
          mouseX: rect.left + rect.width / 2,
          mouseY: rect.top + rect.height / 2
        })
        toast.success(`Input selected: ${displayName} ← Click an output socket to connect`, {
          duration: 3000
        })
      }
    }
  }

  const handleConfirmConnection = () => {
    if (!pendingConnection) return
    
    toast.loading('Creating connection...', { id: 'creating-connection' })
    createConnectionMutation.mutate({
      source_node_id: pendingConnection.sourceNodeId,
      target_node_id: pendingConnection.targetNodeId,
      source_port: pendingConnection.sourcePort,
      target_port: pendingConnection.targetPort
    })
    
    // Clear state
    setConnectionState({
      sourceNodeId: null,
      sourcePort: null,
      targetNodeId: null,
      targetPort: null,
      mouseX: 0,
      mouseY: 0
    })
    setPendingConnection(null)
    setIsConnectionDialogOpen(false)
  }

  const handleCancelConnection = () => {
    setConnectionState({
      sourceNodeId: null,
      sourcePort: null,
      targetNodeId: null,
      targetPort: null,
      mouseX: 0,
      mouseY: 0
    })
    setPendingConnection(null)
    setIsConnectionDialogOpen(false)
    toast('Connection cancelled', { icon: 'ℹ️' })
  }

  const renderNodeConfig = () => {
    if (!selectedNodeData) {
      return (
        <div className="flex items-center justify-center h-full text-slate-500">
          <div className="text-center">
            <Settings className="h-12 w-12 mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-medium">Select a node to configure</p>
            <p className="text-sm mt-2">Click a node to select it, then click a grid cell to move it</p>
          </div>
        </div>
      )
    }

    const module = modules.find(m => m.module_type === selectedNodeData.module_type)
    const currentNodeContext: NodeContext | null = nodeContext || selectedNodeContext || null

    // Get upstream and downstream node names
    const upstreamNodes = currentNodeContext?.predecessors?.map((predId: string) => {
      const node = nodes.find(n => n.id === predId)
      return {
        id: predId,
        name: node?.checkpoint_name || node?.module_id || predId,
        moduleType: node?.module_type
      }
    }) || []

    const downstreamNodes = currentNodeContext?.successors?.map((succId: string) => {
      const node = nodes.find(n => n.id === succId)
      return {
        id: succId,
        name: node?.checkpoint_name || node?.module_id || succId,
        moduleType: node?.module_type
      }
    }) || []

    switch (selectedNodeData.module_type) {
      case 'excel_loader':
        return (
          <div className="h-full flex flex-col">
            {/* Connection Info - Input Sources and Output Destinations */}
            <div className="p-4 border-b border-slate-700 bg-slate-800/50">
              <h3 className="text-sm font-semibold text-white mb-3">Connections</h3>
              
              {/* Input Sources */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowDown className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-medium text-slate-300">Input Sources</span>
                  <span className="text-xs text-slate-500">({upstreamNodes.length})</span>
                </div>
                {upstreamNodes.length > 0 ? (
                  <div className="space-y-1.5">
                    {upstreamNodes.map((upstreamNode: { id: string; name: string; moduleType?: string }) => {
                      const upstreamModule = modules.find(m => m.module_type === upstreamNode.moduleType)
                      const upstreamNodeColor = getNodeColor(upstreamNode.moduleType || '')
                      return (
                        <div
                          key={upstreamNode.id}
                          className="flex items-center gap-2 p-2 rounded-md bg-slate-700/50 hover:bg-slate-700 cursor-pointer transition-colors"
                          onClick={() => setSelectedNode(upstreamNode.id)}
                        >
                          <div className={`p-1 rounded ${upstreamNodeColor.bg} text-white`}>
                            {upstreamNodeColor.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">
                              {upstreamNode.name}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {upstreamModule?.display_name || upstreamNode.moduleType}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No input sources</p>
                )}
              </div>

              {/* Output Destinations */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ArrowUp className="h-4 w-4 text-blue-400" />
                  <span className="text-xs font-medium text-slate-300">Output Destinations</span>
                  <span className="text-xs text-slate-500">({downstreamNodes.length})</span>
                </div>
                {downstreamNodes.length > 0 ? (
                  <div className="space-y-1.5">
                    {downstreamNodes.map((downstreamNode: { id: string; name: string; moduleType?: string }) => {
                      const downstreamModule = modules.find(m => m.module_type === downstreamNode.moduleType)
                      const downstreamNodeColor = getNodeColor(downstreamNode.moduleType || '')
                      return (
                        <div
                          key={downstreamNode.id}
                          className="flex items-center gap-2 p-2 rounded-md bg-slate-700/50 hover:bg-slate-700 cursor-pointer transition-colors"
                          onClick={() => setSelectedNode(downstreamNode.id)}
                        >
                          <div className={`p-1 rounded ${downstreamNodeColor.bg} text-white`}>
                            {downstreamNodeColor.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">
                              {downstreamNode.name}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {downstreamModule?.display_name || downstreamNode.moduleType}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No output destinations</p>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ExcelLoaderConfig
                node={selectedNodeData}
                workspaceId={workspaceId}
                workflowId={workflowId}
                nodeContext={currentNodeContext}
                onSave={(config) => handleSaveNodeConfig(selectedNodeData.id, config)}
              />
            </div>
          </div>
        )
      case 'duckdb_convert':
        return (
          <div className="h-full flex flex-col">
            {/* Connection Info - Input Sources and Output Destinations */}
            <div className="p-4 border-b border-slate-700 bg-slate-800/50">
              <h3 className="text-sm font-semibold text-white mb-3">Connections</h3>
              
              {/* Input Sources */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowDown className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-medium text-slate-300">Input Sources</span>
                  <span className="text-xs text-slate-500">({upstreamNodes.length})</span>
                </div>
                {upstreamNodes.length > 0 ? (
                  <div className="space-y-1.5">
                    {upstreamNodes.map((upstreamNode: { id: string; name: string; moduleType?: string }) => {
                      const upstreamModule = modules.find(m => m.module_type === upstreamNode.moduleType)
                      const upstreamNodeColor = getNodeColor(upstreamNode.moduleType || '')
                      return (
                        <div
                          key={upstreamNode.id}
                          className="flex items-center gap-2 p-2 rounded-md bg-slate-700/50 hover:bg-slate-700 cursor-pointer transition-colors"
                          onClick={() => setSelectedNode(upstreamNode.id)}
                        >
                          <div className={`p-1 rounded ${upstreamNodeColor.bg} text-white`}>
                            {upstreamNodeColor.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">
                              {upstreamNode.name}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {upstreamModule?.display_name || upstreamNode.moduleType}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No input sources</p>
                )}
              </div>

              {/* Output Destinations */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ArrowUp className="h-4 w-4 text-blue-400" />
                  <span className="text-xs font-medium text-slate-300">Output Destinations</span>
                  <span className="text-xs text-slate-500">({downstreamNodes.length})</span>
                </div>
                {downstreamNodes.length > 0 ? (
                  <div className="space-y-1.5">
                    {downstreamNodes.map((downstreamNode: { id: string; name: string; moduleType?: string }) => {
                      const downstreamModule = modules.find(m => m.module_type === downstreamNode.moduleType)
                      const downstreamNodeColor = getNodeColor(downstreamNode.moduleType || '')
                      return (
                        <div
                          key={downstreamNode.id}
                          className="flex items-center gap-2 p-2 rounded-md bg-slate-700/50 hover:bg-slate-700 cursor-pointer transition-colors"
                          onClick={() => setSelectedNode(downstreamNode.id)}
                        >
                          <div className={`p-1 rounded ${downstreamNodeColor.bg} text-white`}>
                            {downstreamNodeColor.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">
                              {downstreamNode.name}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {downstreamModule?.display_name || downstreamNode.moduleType}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No output destinations</p>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <DuckDBConvertConfig
                node={selectedNodeData}
                nodeContext={currentNodeContext}
                onSave={(config) => handleSaveNodeConfig(selectedNodeData.id, config)}
              />
            </div>
          </div>
        )
      case 'boxplot_stats':
        return (
          <div className="h-full flex flex-col">
            {/* Connection Info - Input Sources and Output Destinations */}
            <div className="p-4 border-b border-slate-700 bg-slate-800/50">
              <h3 className="text-sm font-semibold text-white mb-3">Connections</h3>
              
              {/* Input Sources */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowDown className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-medium text-slate-300">Input Sources</span>
                  <span className="text-xs text-slate-500">({upstreamNodes.length})</span>
                </div>
                {upstreamNodes.length > 0 ? (
                  <div className="space-y-1.5">
                    {upstreamNodes.map((upstreamNode: { id: string; name: string; moduleType?: string }) => {
                      const upstreamModule = modules.find(m => m.module_type === upstreamNode.moduleType)
                      const upstreamNodeColor = getNodeColor(upstreamNode.moduleType || '')
                      return (
                        <div
                          key={upstreamNode.id}
                          className="flex items-center gap-2 p-2 rounded-md bg-slate-700/50 hover:bg-slate-700 cursor-pointer transition-colors"
                          onClick={() => setSelectedNode(upstreamNode.id)}
                        >
                          <div className={`p-1 rounded ${upstreamNodeColor.bg} text-white`}>
                            {upstreamNodeColor.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">
                              {upstreamNode.name}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {upstreamModule?.display_name || upstreamNode.moduleType}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No input sources</p>
                )}
              </div>

              {/* Output Destinations */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ArrowUp className="h-4 w-4 text-blue-400" />
                  <span className="text-xs font-medium text-slate-300">Output Destinations</span>
                  <span className="text-xs text-slate-500">({downstreamNodes.length})</span>
                </div>
                {downstreamNodes.length > 0 ? (
                  <div className="space-y-1.5">
                    {downstreamNodes.map((downstreamNode: { id: string; name: string; moduleType?: string }) => {
                      const downstreamModule = modules.find(m => m.module_type === downstreamNode.moduleType)
                      const downstreamNodeColor = getNodeColor(downstreamNode.moduleType || '')
                      return (
                        <div
                          key={downstreamNode.id}
                          className="flex items-center gap-2 p-2 rounded-md bg-slate-700/50 hover:bg-slate-700 cursor-pointer transition-colors"
                          onClick={() => setSelectedNode(downstreamNode.id)}
                        >
                          <div className={`p-1 rounded ${downstreamNodeColor.bg} text-white`}>
                            {downstreamNodeColor.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">
                              {downstreamNode.name}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {downstreamModule?.display_name || downstreamNode.moduleType}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No output destinations</p>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <BoxplotStatsConfig
                node={selectedNodeData}
                nodeContext={currentNodeContext}
                onSave={(config) => handleSaveNodeConfig(selectedNodeData.id, config)}
              />
            </div>
          </div>
        )
      default:
        return (
          <div className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Node Configuration</h3>
            <p className="text-slate-600">No configuration available for this node type.</p>
          </div>
        )
    }
  }

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex overflow-hidden">
      {/* Left Panel - Toolbar */}
      <div className="w-64 border-r border-slate-700 bg-slate-800/50 flex flex-col">
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Workflow</h2>
            <Dialog 
              open={isModuleDialogOpen} 
                onOpenChange={(open) => {
                  setIsModuleDialogOpen(open)
                  if (!open) {
                    setSelectedModule(null)
                    setCheckpointName('')
                  }
                }}
            >
              <DialogTrigger asChild>
                <Button 
                  size="sm"
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Node
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-slate-800 text-white border-slate-700">
                <DialogHeader>
                  <DialogTitle className="text-2xl text-white">Add Node</DialogTitle>
                <DialogDescription className="text-slate-400">
                  {selectedModule ? 'Enter a checkpoint name to mark what this node is doing' : 'Select a module to add to your workflow'}
                </DialogDescription>
                </DialogHeader>
                
                {!selectedModule ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {modules.map((module) => {
                      const nodeColor = getNodeColor(module.module_type)
                      return (
                        <Card
                          key={module.module_type}
                          className="cursor-pointer bg-slate-700 border-slate-600 hover:border-indigo-500 hover:bg-slate-600 transition-all duration-300 hover:scale-105"
                          onClick={() => handleModuleSelect(module)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center space-x-3 mb-2">
                              <div className={`p-2 rounded-lg ${nodeColor.bg} text-white`}>
                                {nodeColor.icon}
                              </div>
                              <h3 className="font-semibold text-white">{module.display_name}</h3>
                            </div>
                            <p className="text-sm text-slate-300 mb-2">{module.description}</p>
                            <div className="flex items-center space-x-4 text-xs text-slate-400">
                              <span>{module.inputs.length} inputs</span>
                              <span>{module.outputs.length} outputs</span>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Checkpoint Name
                      </label>
                      <p className="text-xs text-slate-400 mb-2">Mark what this node is doing (optional note for your reference)</p>
                      <input
                        type="text"
                        value={checkpointName}
                        onChange={(e) => setCheckpointName(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Enter checkpoint name (e.g., 'Load sales data', 'Calculate metrics')"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleAddNode()
                          } else if (e.key === 'Escape') {
                            setSelectedModule(null)
                            setCheckpointName('')
                          }
                        }}
                      />
                    </div>
                    <div className="flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSelectedModule(null)
                          setCheckpointName('')
                        }}
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        Back
                      </Button>
                      <Button
                        onClick={handleAddNode}
                        className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
                      >
                        Add Node
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

          </div>
        </div>

        {/* Node List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {nodes.map((node) => {
            const module = modules.find(m => m.module_type === node.module_type)
            const isSelected = selectedNode === node.id
            const nodeColor = getNodeColor(node.module_type)
            
            // Get connections for this node
            const inputConnections = connectionsList.filter(c => c.target_node_id === node.id)
            const outputConnections = connectionsList.filter(c => c.source_node_id === node.id)
            
            return (
              <Card
                key={node.id}
                className={`cursor-pointer transition-all duration-200 ${
                  isSelected 
                    ? 'bg-indigo-600 border-indigo-400' 
                    : 'bg-slate-700 border-slate-600 hover:bg-slate-600'
                }`}
                onClick={() => setSelectedNode(isSelected ? null : node.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center space-x-2">
                    <div className={`p-1.5 rounded ${nodeColor.bg} text-white`}>
                      {nodeColor.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {node.checkpoint_name || module?.display_name || node.module_type}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{node.module_id}</p>
                    </div>
                  </div>
                  
                  {/* Show connection counts */}
                  {(inputConnections.length > 0 || outputConnections.length > 0) && (
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      {inputConnections.length > 0 && (
                        <div className="flex items-center gap-1 text-emerald-400">
                          <ArrowDown className="h-3 w-3" />
                          <span>{inputConnections.length} input{inputConnections.length > 1 ? 's' : ''}</span>
                        </div>
                      )}
                      {outputConnections.length > 0 && (
                        <div className="flex items-center gap-1 text-blue-400">
                          <ArrowUp className="h-3 w-3" />
                          <span>{outputConnections.length} output{outputConnections.length > 1 ? 's' : ''}</span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Center - Canvas */}
      <div 
        className="flex-1 relative overflow-hidden" 
        ref={canvasRef} 
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={handleCanvasMouseLeave}
      >
        {/* Grid Background - Cell-based */}
        <div 
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `
              linear-gradient(rgba(99, 102, 241, 0.4) 2px, transparent 2px),
              linear-gradient(90deg, rgba(99, 102, 241, 0.4) 2px, transparent 2px)
            `,
            backgroundSize: `${GRID_CELL_WIDTH * viewport.zoom}px ${GRID_CELL_HEIGHT * viewport.zoom}px`,
            backgroundPosition: `${viewport.x % (GRID_CELL_WIDTH * viewport.zoom)}px ${viewport.y % (GRID_CELL_HEIGHT * viewport.zoom)}px`
          }}
        />
        
        {/* Grid Cell Highlight on Hover (when not dragging) */}
        {hoveredGridCell && !dragState && (
          <div
            className="absolute border-2 border-dashed border-indigo-400 bg-indigo-400/20 pointer-events-none transition-all duration-100"
            style={{
              left: (hoveredGridCell.x * GRID_CELL_WIDTH * viewport.zoom) + viewport.x,
              top: (hoveredGridCell.y * GRID_CELL_HEIGHT * viewport.zoom) + viewport.y,
              width: `${GRID_CELL_WIDTH * viewport.zoom}px`,
              height: `${GRID_CELL_HEIGHT * viewport.zoom}px`
            }}
          />
        )}
        
        {/* Grid Cell Highlight during drag */}
        {dragState && (
          <div
            className="absolute border-2 border-solid border-indigo-500 bg-indigo-500/30 pointer-events-none transition-all duration-100 z-40"
            style={{
              left: (dragState.currentCol * GRID_CELL_WIDTH * viewport.zoom) + viewport.x,
              top: (dragState.currentRow * GRID_CELL_HEIGHT * viewport.zoom) + viewport.y,
              width: `${GRID_CELL_WIDTH * viewport.zoom}px`,
              height: `${GRID_CELL_HEIGHT * viewport.zoom}px`
            }}
          />
        )}

        {/* SVG for Connections */}
        <svg
          ref={svgRef}
          className="absolute inset-0 pointer-events-none"
          style={{ width: '100%', height: '100%' }}
        >
          {/* Arrow marker definition */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L9,3 z" fill="rgba(99, 102, 241, 0.8)" />
            </marker>
            <marker
              id="arrowhead-hover"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L9,3 z" fill="rgba(139, 92, 246, 1)" />
            </marker>
            <linearGradient id="connectionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#3B82F6" />
            </linearGradient>
          </defs>

          {/* Existing Connections */}
          {connectionsList.map((connection) => {
            const path = getConnectionPath(connection)
            if (!path) return null
            
            return (
              <g key={connection.id} className="group">
                <path
                  d={path}
                  fill="none"
                  stroke="url(#connectionGradient)"
                  strokeWidth="3"
                  markerEnd="url(#arrowhead)"
                  className="group-hover:stroke-indigo-400 group-hover:marker-end-[url(#arrowhead-hover)] cursor-pointer transition-all duration-200"
                  style={{ pointerEvents: 'auto' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteConnectionMutation.mutate(connection.id)
                  }}
                />
                {/* Invisible wider path for easier clicking */}
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="15"
                  style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteConnectionMutation.mutate(connection.id)
                  }}
                />
              </g>
            )
          })}

          {/* Temporary Connection Line */}
          {((connectionState?.sourceNodeId && !connectionState?.targetNodeId) || 
            (connectionState?.targetNodeId && !connectionState?.sourceNodeId)) && 
            connectionState.mouseX !== 0 && (
            (() => {
              const canvasRect = canvasRef.current?.getBoundingClientRect()
              if (!canvasRect || !connectionState) return null
              
              const mouseX = (connectionState.mouseX - canvasRect.left - viewport.x) / viewport.zoom
              const mouseY = (connectionState.mouseY - canvasRect.top - viewport.y) / viewport.zoom
              
              // Determine start and end positions based on flow direction
              let startPos, endPos
              
              if (connectionState.sourceNodeId && !connectionState.targetNodeId) {
                // Flow: Output -> Input (started from output)
                const sourceNode = nodes.find(n => n.id === connectionState.sourceNodeId)
                if (!sourceNode) return null
                startPos = getPortPosition(sourceNode, 'output')
                endPos = { x: mouseX, y: mouseY }
              } else if (connectionState.targetNodeId && !connectionState.sourceNodeId) {
                // Flow: Output -> Input (started from input, waiting for output)
                const targetNode = nodes.find(n => n.id === connectionState.targetNodeId)
                if (!targetNode) return null
                startPos = { x: mouseX, y: mouseY }
                endPos = getPortPosition(targetNode, 'input')
              } else {
                return null
              }
              
              const dx = endPos.x - startPos.x
              const dy = endPos.y - startPos.y
              const curvature = Math.min(Math.abs(dx) * 0.5, 150)
              
              // Draw from start to end (always output -> input direction)
              const path = `M ${startPos.x} ${startPos.y} C ${startPos.x + curvature} ${startPos.y}, ${endPos.x - curvature} ${endPos.y}, ${endPos.x} ${endPos.y}`
              
              return (
                <path
                  d={path}
                  fill="none"
                  stroke="url(#connectionGradient)"
                  strokeWidth="3"
                  strokeDasharray="8 4"
                  markerEnd="url(#arrowhead)"
                  opacity="0.7"
                />
              )
            })()
          )}
        </svg>

        {/* Nodes */}
        <div className="absolute inset-0" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
          {nodes.map((node) => {
            const module = modules.find(m => m.module_type === node.module_type)
            const isSelected = selectedNode === node.id
            const isDragging = dragState?.nodeId === node.id
            const nodeColor = getNodeColor(node.module_type)

            // Use drag position if dragging, otherwise use node position
            let col = node.position_x
            let row = node.position_y
            if (isDragging && dragState) {
              col = dragState.currentCol
              row = dragState.currentRow
            }

            // Convert grid cell (col, row) to pixel position
            const nodeX = col * GRID_CELL_WIDTH + (GRID_CELL_WIDTH - NODE_WIDTH) / 2
            const nodeY = row * GRID_CELL_HEIGHT + (GRID_CELL_HEIGHT - NODE_HEIGHT) / 2

            return (
              <div
                key={node.id}
                className={`absolute transition-none ${
                  isSelected ? 'ring-4 ring-indigo-400 shadow-2xl shadow-indigo-500/50 z-50' : 'z-10 hover:ring-2 hover:ring-indigo-300'
                } ${isDragging ? 'opacity-80 cursor-grabbing' : 'cursor-grab'}`}
                style={{
                  left: nodeX,
                  top: nodeY,
                  width: NODE_WIDTH,
                  height: NODE_HEIGHT
                }}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                onClick={(e) => handleNodeClick(e, node.id)}
              >
                <Card className={`h-full ${nodeColor.bg} border-2 ${nodeColor.border} shadow-lg cursor-pointer`}>
                  <CardContent className="p-3 h-full flex flex-col">
                    {/* Node Header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <div className="text-white">{nodeColor.icon}</div>
                        <h3 className="text-sm font-semibold text-white truncate">
                          {node.checkpoint_name || module?.display_name || node.module_type}
                        </h3>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-white hover:text-red-400 hover:bg-red-500/20"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteNodeMutation.mutate(node.id)
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* Node Content - Center */}
                    <div className="flex-1 flex items-center justify-center text-xs text-white/60">
                      <span className="truncate">{module?.description || node.module_type}</span>
                    </div>

                    {/* Input Socket Button - Left Side */}
                    <div
                      className={`absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 z-20 transition-all duration-200 flex items-center justify-center ${
                        connectionState?.targetNodeId === node.id && 
                        connectionState?.targetPort === 'input'
                          ? 'bg-emerald-500 border-emerald-200 scale-125 shadow-lg shadow-emerald-500/50 cursor-pointer'
                          : connectionState?.sourceNodeId && 
                            connectionState.sourceNodeId !== node.id &&
                            !connectionState.targetNodeId
                          ? 'bg-emerald-400 border-emerald-100 hover:bg-emerald-300 hover:scale-125 shadow-lg shadow-emerald-500/50 cursor-pointer'
                          : 'bg-emerald-400 border-white hover:bg-emerald-300 hover:scale-110 cursor-pointer'
                      }`}
                      onClick={(e) => handleSocketClick(e, node.id, 'input')}
                      onMouseEnter={(e) => {
                        if (connectionState?.targetNodeId === node.id && connectionState?.targetPort === 'input') {
                          e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.4)'
                        } else if (connectionState?.sourceNodeId && connectionState.sourceNodeId !== node.id) {
                          e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.3)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translate(-50%, -50%)'
                      }}
                      title={connectionState?.targetNodeId === node.id && connectionState?.targetPort === 'input'
                        ? 'Click to cancel connection' 
                        : connectionState?.sourceNodeId && connectionState.sourceNodeId !== node.id
                        ? 'Click to complete connection (output -> input)'
                        : 'Input Socket - Click to start or complete connection'}
                    >
                      <div className="w-2 h-2 rounded-full bg-white"></div>
                    </div>

                    {/* Output Socket Button - Right Side */}
                    <div
                      className={`absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 z-20 transition-all duration-200 flex items-center justify-center ${
                        connectionState?.sourceNodeId === node.id && 
                        connectionState?.sourcePort === 'output'
                          ? 'bg-indigo-500 border-indigo-300 scale-125 shadow-lg shadow-indigo-500/50 cursor-pointer'
                          : connectionState?.targetNodeId && 
                            connectionState.targetNodeId !== node.id &&
                            !connectionState.sourceNodeId
                          ? 'bg-indigo-500 border-indigo-200 hover:bg-indigo-400 hover:scale-125 shadow-lg shadow-indigo-500/50 cursor-pointer'
                          : 'bg-blue-400 border-white hover:bg-blue-300 hover:scale-110 cursor-pointer'
                      }`}
                      onClick={(e) => handleSocketClick(e, node.id, 'output')}
                      onMouseEnter={(e) => {
                        if (connectionState?.sourceNodeId === node.id && connectionState?.sourcePort === 'output') {
                          e.currentTarget.style.transform = 'translate(50%, -50%) scale(1.4)'
                        } else if (connectionState?.targetNodeId && connectionState.targetNodeId !== node.id) {
                          e.currentTarget.style.transform = 'translate(50%, -50%) scale(1.3)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translate(50%, -50%)'
                      }}
                      title={connectionState?.sourceNodeId === node.id && connectionState?.sourcePort === 'output'
                        ? 'Click to cancel connection'
                        : connectionState?.targetNodeId && connectionState.targetNodeId !== node.id
                        ? 'Click to complete connection (output -> input)'
                        : 'Output Socket - Click to start or complete connection'}
                    >
                      <div className="w-2 h-2 rounded-full bg-white"></div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right Panel - Node Configuration */}
      <div className="w-96 border-l border-slate-700 bg-slate-800/50 overflow-y-auto">
        {renderNodeConfig()}
      </div>

      {/* Connection Confirmation Dialog - Root level - Always visible for debugging */}
      <Dialog open={true} onOpenChange={(open) => {
        console.log('Dialog onOpenChange called with:', open)
        setIsConnectionDialogOpen(open)
      }}>
        <DialogContent className="sm:max-w-md bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Confirm Connection (Debug Mode - Always Visible)</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-slate-400 mb-4 p-2 bg-slate-900 rounded">
            <div>isConnectionDialogOpen: {String(isConnectionDialogOpen)}</div>
            <div>pendingConnection: {pendingConnection ? JSON.stringify(pendingConnection, null, 2) : 'null'}</div>
            <div>connectionState: {connectionState ? JSON.stringify(connectionState, null, 2) : 'null'}</div>
          </div>
          {pendingConnection ? (() => {
            const sourceNode = nodes.find(n => n.id === pendingConnection.sourceNodeId)
            const targetNode = nodes.find(n => n.id === pendingConnection.targetNodeId)
            const sourceModule = sourceNode ? modules.find(m => m.module_type === sourceNode.module_type) : null
            const targetModule = targetNode ? modules.find(m => m.module_type === targetNode.module_type) : null
            const sourceDisplayName = sourceNode?.checkpoint_name || sourceModule?.display_name || pendingConnection.sourceNodeId
            const targetDisplayName = targetNode?.checkpoint_name || targetModule?.display_name || pendingConnection.targetNodeId
            
            return (
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-center space-x-4">
                  {/* Source Node */}
                  <div className="flex flex-col items-center space-y-2 p-4 bg-slate-700 rounded-lg border border-slate-600">
                    <div className="text-xs text-slate-400 uppercase tracking-wide">Source</div>
                    <div className="text-sm font-medium text-white text-center max-w-[150px] truncate">
                      {sourceDisplayName}
                    </div>
                    <div className="text-xs text-slate-400">
                      {sourceModule?.display_name || sourceNode?.module_type}
                    </div>
                  </div>
                  
                  {/* Arrow */}
                  <div className="flex items-center">
                    <ArrowRight className="h-6 w-6 text-indigo-400" />
                  </div>
                  
                  {/* Target Node */}
                  <div className="flex flex-col items-center space-y-2 p-4 bg-slate-700 rounded-lg border border-slate-600">
                    <div className="text-xs text-slate-400 uppercase tracking-wide">Target</div>
                    <div className="text-sm font-medium text-white text-center max-w-[150px] truncate">
                      {targetDisplayName}
                    </div>
                    <div className="text-xs text-slate-400">
                      {targetModule?.display_name || targetNode?.module_type}
                    </div>
                  </div>
                </div>
                
                <div className="text-sm text-slate-300 text-center">
                  Create connection from <span className="font-semibold text-indigo-400">{sourceDisplayName}</span> to <span className="font-semibold text-indigo-400">{targetDisplayName}</span>?
                </div>
              </div>
            )
          })() : (
            <div className="space-y-4 py-4">
              <div className="text-sm text-slate-300 text-center">
                No pending connection. Click an output socket, then an input socket to create a connection.
              </div>
              <div className="text-xs text-slate-400 text-center">
                Debug: isConnectionDialogOpen = {isConnectionDialogOpen ? 'true' : 'false'}, 
                pendingConnection = {pendingConnection ? JSON.stringify(pendingConnection) : 'null'}
              </div>
            </div>
          )}
          <div className="flex justify-end space-x-2 pt-4 border-t border-slate-700">
            <Button
              variant="outline"
              onClick={handleCancelConnection}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmConnection}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
            >
              Confirm Connection
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

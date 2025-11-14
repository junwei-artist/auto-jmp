'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, X, Zap, Database, BarChart3, Settings, Move, Trash2, ArrowUp, ArrowDown, ArrowRight, Palette, ZoomIn, ZoomOut, Maximize2, Hash, Upload, FolderOpen, Trash, Play, FileText, Table, FileSpreadsheet } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { apiClient } from '@/lib/api'
import { useSocket } from '@/lib/socket'
import toast from 'react-hot-toast'
import { workflowGraphManager, type NodeContext, type WorkflowGraph } from '@/lib/workflow-graph'
import ExcelLoaderConfig from './node-configs/ExcelLoaderConfig'
import DuckDBConvertConfig from './node-configs/DuckDBConvertConfig'
import BoxplotStatsConfig from './node-configs/BoxplotStatsConfig'
import ExcelToNumericConfig from './node-configs/ExcelToNumericConfig'
import FileUploaderConfig from './node-configs/FileUploaderConfig'
import ExcelViewerConfig from './node-configs/ExcelViewerConfig'
import { ExcelToNumericEmbedded, FileUploaderEmbedded, ExcelViewerEmbedded, OutlierRemoverEmbedded, DuckDBConvertEmbedded, Excel2JMPEmbedded } from './node-embedded'
import AndonStatus, { type AndonStatus as AndonStatusType } from './node-embedded/AndonStatus'

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
const NODE_WIDTH = 160  // Reduced from 200 to leave more space for arrows
const NODE_HEIGHT = 100  // Reduced from 120 to leave more space for arrows
const PORT_SIZE = 12

// Theme definitions
type ThemeName = 'dark' | 'light' | 'colorful' | 'ocean' | 'forest' | 'sunset'

interface EditorTheme {
  name: ThemeName
  displayName: string
  background: string
  panel: string
  panelBorder: string
  text: string
  textSecondary: string
  textMuted: string
  grid: string
  gridHover: string
  nodeCard: string
  nodeCardSelected: string
  connection: string
  connectionHover: string
  button: string
  buttonHover: string
}

const themes: Record<ThemeName, EditorTheme> = {
  dark: {
    name: 'dark',
    displayName: 'Dark',
    background: 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900',
    panel: 'bg-slate-800/50',
    panelBorder: 'border-slate-700',
    text: 'text-white',
    textSecondary: 'text-slate-300',
    textMuted: 'text-slate-400',
    grid: 'rgba(99, 102, 241, 0.4)',
    gridHover: 'rgba(99, 102, 241, 0.6)',
    nodeCard: 'bg-slate-700',
    nodeCardSelected: 'bg-indigo-600',
    connection: 'rgba(99, 102, 241, 0.8)',
    connectionHover: 'rgba(239, 68, 68, 1)',
    button: 'bg-gradient-to-r from-indigo-600 to-purple-600',
    buttonHover: 'hover:from-indigo-700 hover:to-purple-700',
  },
  light: {
    name: 'light',
    displayName: 'Light',
    background: 'bg-gradient-to-br from-gray-50 via-white to-gray-100',
    panel: 'bg-white/80',
    panelBorder: 'border-gray-300',
    text: 'text-gray-900',
    textSecondary: 'text-gray-700',
    textMuted: 'text-gray-500',
    grid: 'rgba(99, 102, 241, 0.2)',
    gridHover: 'rgba(99, 102, 241, 0.4)',
    nodeCard: 'bg-white',
    nodeCardSelected: 'bg-indigo-100',
    connection: 'rgba(99, 102, 241, 0.6)',
    connectionHover: 'rgba(239, 68, 68, 0.8)',
    button: 'bg-gradient-to-r from-indigo-500 to-purple-500',
    buttonHover: 'hover:from-indigo-600 hover:to-purple-600',
  },
  colorful: {
    name: 'colorful',
    displayName: 'Colorful',
    background: 'bg-gradient-to-br from-purple-900 via-pink-800 to-indigo-900',
    panel: 'bg-purple-800/50',
    panelBorder: 'border-purple-600',
    text: 'text-white',
    textSecondary: 'text-purple-200',
    textMuted: 'text-purple-300',
    grid: 'rgba(168, 85, 247, 0.4)',
    gridHover: 'rgba(168, 85, 247, 0.6)',
    nodeCard: 'bg-purple-700',
    nodeCardSelected: 'bg-pink-600',
    connection: 'rgba(168, 85, 247, 0.8)',
    connectionHover: 'rgba(236, 72, 153, 1)',
    button: 'bg-gradient-to-r from-pink-600 to-purple-600',
    buttonHover: 'hover:from-pink-700 hover:to-purple-700',
  },
  ocean: {
    name: 'ocean',
    displayName: 'Ocean',
    background: 'bg-gradient-to-br from-cyan-900 via-blue-900 to-teal-900',
    panel: 'bg-cyan-800/50',
    panelBorder: 'border-cyan-600',
    text: 'text-white',
    textSecondary: 'text-cyan-200',
    textMuted: 'text-cyan-300',
    grid: 'rgba(6, 182, 212, 0.4)',
    gridHover: 'rgba(6, 182, 212, 0.6)',
    nodeCard: 'bg-cyan-700',
    nodeCardSelected: 'bg-teal-600',
    connection: 'rgba(6, 182, 212, 0.8)',
    connectionHover: 'rgba(20, 184, 166, 1)',
    button: 'bg-gradient-to-r from-cyan-600 to-teal-600',
    buttonHover: 'hover:from-cyan-700 hover:to-teal-700',
  },
  forest: {
    name: 'forest',
    displayName: 'Forest',
    background: 'bg-gradient-to-br from-green-900 via-emerald-900 to-teal-900',
    panel: 'bg-green-800/50',
    panelBorder: 'border-green-600',
    text: 'text-white',
    textSecondary: 'text-green-200',
    textMuted: 'text-green-300',
    grid: 'rgba(34, 197, 94, 0.4)',
    gridHover: 'rgba(34, 197, 94, 0.6)',
    nodeCard: 'bg-green-700',
    nodeCardSelected: 'bg-emerald-600',
    connection: 'rgba(34, 197, 94, 0.8)',
    connectionHover: 'rgba(16, 185, 129, 1)',
    button: 'bg-gradient-to-r from-green-600 to-emerald-600',
    buttonHover: 'hover:from-green-700 hover:to-emerald-700',
  },
  sunset: {
    name: 'sunset',
    displayName: 'Sunset',
    background: 'bg-gradient-to-br from-orange-900 via-red-800 to-pink-900',
    panel: 'bg-orange-800/50',
    panelBorder: 'border-orange-600',
    text: 'text-white',
    textSecondary: 'text-orange-200',
    textMuted: 'text-orange-300',
    grid: 'rgba(249, 115, 22, 0.4)',
    gridHover: 'rgba(249, 115, 22, 0.6)',
    nodeCard: 'bg-orange-700',
    nodeCardSelected: 'bg-red-600',
    connection: 'rgba(249, 115, 22, 0.8)',
    connectionHover: 'rgba(239, 68, 68, 1)',
    button: 'bg-gradient-to-r from-orange-600 to-red-600',
    buttonHover: 'hover:from-orange-700 hover:to-red-700',
  },
}

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
  const [pendingConnection, setPendingConnection] = useState<{
    sourceNodeId: string
    targetNodeId: string
    sourcePort: string
    targetPort: string
  } | null>(null)
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 })
  const [hoveredGridCell, setHoveredGridCell] = useState<{ x: number; y: number } | null>(null)
  const [dragState, setDragState] = useState<{ nodeId: string; startCol: number; startRow: number; currentCol: number; currentRow: number } | null>(null)
  const dragMovedRef = useRef(false) // Track if mouse actually moved during drag
  const nodeSelectedOnMouseDownRef = useRef<string | null>(null) // Track which node was selected on mousedown
  const [nodeContext, setNodeContext] = useState<NodeContext | null>(null)
  const [editingCheckpointName, setEditingCheckpointName] = useState(false)
  const [tempCheckpointName, setTempCheckpointName] = useState('')
  const [showNodeFolderDialog, setShowNodeFolderDialog] = useState(false)
  const [showNodeSummaryDialog, setShowNodeSummaryDialog] = useState(false)
  const [showDuckDBTablesDialog, setShowDuckDBTablesDialog] = useState(false)
  const [theme, setTheme] = useState<ThemeName>(() => {
    // Load theme from localStorage or default to 'dark'
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('node-editor-theme') as ThemeName
      return savedTheme && themes[savedTheme] ? savedTheme : 'dark'
    }
    return 'dark'
  })
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const currentTheme = themes[theme]

  // Save theme to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('node-editor-theme', theme)
    }
  }, [theme])

  // Ensure connections has a default value
  const connectionsList = connections || []
  const selectedNodeData = selectedNode ? nodes.find(n => n.id === selectedNode) : null

  // Update tempCheckpointName when selectedNodeData changes
  useEffect(() => {
    if (selectedNodeData) {
      setTempCheckpointName(selectedNodeData.checkpoint_name || '')
      setEditingCheckpointName(false) // Reset editing state when node changes
    }
  }, [selectedNodeData?.checkpoint_name, selectedNode])
  
  // Debug: Log connections when they change
  useEffect(() => {
    console.log('Connections updated:', connectionsList.length, connectionsList)
  }, [connectionsList])

  // Debug: Log state changes
  useEffect(() => {
    console.log('=== pendingConnection STATE CHANGED ===')
    console.log('pendingConnection:', pendingConnection)
    console.log('Type:', typeof pendingConnection)
    console.log('Is null?', pendingConnection === null)
    console.log('Is undefined?', pendingConnection === undefined)
    console.log('========================================')
  }, [pendingConnection])

  useEffect(() => {
    console.log('=== connectionState CHANGED ===')
    console.log('connectionState:', connectionState)
    console.log('sourceNodeId:', connectionState?.sourceNodeId)
    console.log('targetNodeId:', connectionState?.targetNodeId)
    console.log('===============================')
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

  const [connectionToDelete, setConnectionToDelete] = useState<Connection | null>(null)

  const executeNodeMutation = useMutation({
    mutationFn: async (nodeId: string) => {
      return apiClient.post<{
        workflow_id: string
        node_id: string
        processed_files: Array<{
          filename: string
          size: number
          type: string
          input_path: string
          output_path: string
        }>
        processed_count: number
        errors?: Array<{ filename: string; error: string }>
        summary: {
          total_files: number
          successful: number
          failed: number
          total_size: number
        }
      }>(`/v1/workflows/${workflowId}/nodes/${nodeId}/execute`)
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['node-files', workflowId, data.node_id] })
      queryClient.invalidateQueries({ queryKey: ['workflow-nodes', workflowId] })
      toast.success(`Executed node: ${data.processed_count} file(s) processed successfully`)
      if (data.errors && data.errors.length > 0) {
        toast.error(`${data.errors.length} file(s) failed to process`)
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to execute node')
    }
  })

  const handleExecuteNode = (nodeId: string) => {
    if (!confirm('Are you sure you want to execute this node? This will examine input files, validate them, and move them to the output folder.')) {
      return
    }
    executeNodeMutation.mutate(nodeId)
  }

  const executeDuckDBMutation = useMutation({
    mutationFn: async (nodeId: string) => {
      return apiClient.post<{
        workflow_id: string
        node_id: string
        collected_files: Array<{ filename: string; source_node: string; size: number }>
        converted_tables: Array<{
          table_name: string
          source_file: string
          sheet: string
          rows: number
          columns: string[]
        }>
        db_path: string
        errors?: Array<{ filename: string; error: string }>
        summary: {
          files_collected: number
          tables_created: number
          errors: number
        }
      }>(`/v1/workflows/${workflowId}/nodes/${nodeId}/execute-duckdb`)
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['node-files', workflowId, data.node_id] })
      queryClient.invalidateQueries({ queryKey: ['duckdb-tables', workflowId, data.node_id] })
      queryClient.invalidateQueries({ queryKey: ['workflow-nodes', workflowId] })
      toast.success(`DuckDB execution complete: ${data.summary.tables_created} table(s) created from ${data.summary.files_collected} file(s)`)
      if (data.errors && data.errors.length > 0) {
        toast.error(`${data.errors.length} file(s) failed to process`)
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to execute DuckDB node')
    }
  })

  const handleExecuteDuckDBNode = (nodeId: string) => {
    if (!confirm('Are you sure you want to execute this DuckDB node? This will collect files from input nodes, convert Excel files to DuckDB format, and save to the output folder.')) {
      return
    }
    executeDuckDBMutation.mutate(nodeId)
  }

  const deleteConnectionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      return apiClient.delete(`/v1/connections/${connectionId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-connections', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['workflow-graph', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['node-context', workflowId] })
      setConnectionToDelete(null)
      toast.success('Connection deleted')
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete connection: ${error.message}`)
      setConnectionToDelete(null)
    }
  })

  const handleDeleteConnection = (connection: Connection) => {
    setConnectionToDelete(connection)
  }

  const confirmDeleteConnection = () => {
    if (connectionToDelete) {
      deleteConnectionMutation.mutate(connectionToDelete.id)
    }
  }

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

  const handleUpdateCheckpointName = (nodeId: string, checkpointName: string) => {
    updateNodeMutation.mutate({ 
      nodeId, 
      data: { checkpoint_name: checkpointName.trim() || null } 
    })
  }

  const handleNodeClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    // Only handle selection if it was a click (not a drag)
    // If dragMovedRef is false, it means the mouse didn't move, so it was just a click
    if (!dragMovedRef.current) {
      // If this node was just selected on mousedown, keep it selected (don't toggle)
      if (nodeSelectedOnMouseDownRef.current === nodeId) {
        // Node was just selected on mousedown, keep it selected
        setSelectedNode(nodeId)
        nodeSelectedOnMouseDownRef.current = null // Clear the ref
      } else {
        // This is a click on a different node or a second click, toggle selection
        setSelectedNode(selectedNode === nodeId ? null : nodeId)
      }
    }
    // If it was a drag, the selection was already set in mousedown, so don't toggle
  }

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return

    // Reset drag moved flag
    dragMovedRef.current = false
    
    // Track which node was selected on mousedown (to prevent toggle on click)
    nodeSelectedOnMouseDownRef.current = nodeId
    
    // Select the node immediately on mousedown
    setSelectedNode(nodeId)
    
    // Initialize drag state (will be used to detect if it's a drag or click)
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

      // Check if position changed (actual drag occurred)
      if (col !== dragState.currentCol || row !== dragState.currentRow) {
        dragMovedRef.current = true
      }

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

  const handleMouseUp = useCallback((e?: MouseEvent) => {
    // Handle node drag end
    if (dragState) {
      const { nodeId, currentCol, currentRow, startCol, startRow } = dragState
      
      // Only update if position changed (actual drag occurred)
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
        // If it was a drag, clear the mousedown selection ref
        nodeSelectedOnMouseDownRef.current = null
      }
      // If position didn't change, it was just a click, not a drag
      // The click handler will handle selection
      
      setDragState(null)
    }
    
    // Handle connection creation - only if both sockets are selected
    // Note: We don't auto-create connections on mouseup anymore
    // Connections are created via the pendingConnection confirmation window
    // So we only clear connectionState if we're not in a connection flow
    // (The connectionState is managed by handleSocketClick now)
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
      },
      excel_to_numeric: {
        bg: 'bg-gradient-to-br from-pink-500 to-purple-600',
        border: 'border-pink-400',
        icon: <Hash className="h-5 w-5" />
      },
      file_uploader: {
        bg: 'bg-gradient-to-br from-blue-500 to-cyan-600',
        border: 'border-blue-400',
        icon: <Upload className="h-5 w-5" />
      },
      excel_viewer: {
        bg: 'bg-gradient-to-br from-indigo-500 to-purple-600',
        border: 'border-indigo-400',
        icon: <FileSpreadsheet className="h-5 w-5" />
      },
      outlier_remover: {
        bg: 'bg-gradient-to-br from-orange-500 to-red-600',
        border: 'border-orange-400',
        icon: <FileSpreadsheet className="h-5 w-5" />
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

  // Hook to get node files for Andon status checking
  const useNodeFilesForAndon = (nodeId: string) => {
    return useQuery({
      queryKey: ['node-files', workflowId, nodeId],
      queryFn: async () => {
        return apiClient.get<{
          workflow_id: string
          node_id: string
          node_path: string
          folders: {
            input: Array<{ name: string; size: number; modified: string; path: string }>
            wip: Array<{ name: string; size: number; modified: string; path: string }>
            output: Array<{ name: string; size: number; modified: string; path: string }>
          }
        }>(`/v1/workflows/${workflowId}/nodes/${nodeId}/files`)
      },
      enabled: !!nodeId && !!workflowId,
      staleTime: 10000, // Cache for 10 seconds
      refetchInterval: 5000, // Refetch every 5 seconds to keep status updated
    })
  }

  // Determine Andon status for a node
  const getNodeAndonStatus = (node: Node): {
    inputStatus: AndonStatusType
    processStatus: AndonStatusType
    outputStatus: AndonStatusType
  } => {
    const hasInputConnections = connections.some(conn => conn.target_node_id === node.id)
    const hasOutputConnections = connections.some(conn => conn.source_node_id === node.id)
    
    // Check node state for execution status
    const nodeState = node.state || {}
    const isProcessing = nodeState.status === 'processing' || nodeState.status === 'running'
    const hasError = nodeState.error || nodeState.status === 'error' || nodeState.status === 'failed'
    const hasOutputs = nodeState.outputs && Object.keys(nodeState.outputs).length > 0
    const isComplete = nodeState.success === true || nodeState.status === 'completed'
    
    // Check for files in folders - we'll use a hook component for this
    // For now, we'll check if we can get file info from a cached query
    const nodeFilesQuery = queryClient.getQueryData<{
      workflow_id: string
      node_id: string
      node_path: string
      folders: {
        input: Array<{ name: string; size: number; modified: string; path: string }>
        wip: Array<{ name: string; size: number; modified: string; path: string }>
        output: Array<{ name: string; size: number; modified: string; path: string }>
      }
    }>(['node-files', workflowId, node.id])
    
    const hasInputFiles = nodeFilesQuery?.folders.input && nodeFilesQuery.folders.input.length > 0
    const hasWipFiles = nodeFilesQuery?.folders.wip && nodeFilesQuery.folders.wip.length > 0
    const hasOutputFiles = nodeFilesQuery?.folders.output && nodeFilesQuery.folders.output.length > 0
    
    // Determine input status
    let inputStatus: AndonStatusType = 'idle'
    if (hasInputConnections) {
      // Check if upstream nodes have outputs (inputs are ready)
      const upstreamNodes = connections
        .filter(conn => conn.target_node_id === node.id)
        .map(conn => nodes.find(n => n.id === conn.source_node_id))
        .filter(Boolean) as Node[]
      
      const allUpstreamReady = upstreamNodes.every(upstreamNode => {
        const upstreamState = upstreamNode?.state || {}
        // Check if upstream node has output files
        const upstreamFilesQuery = queryClient.getQueryData<{
          folders: {
            output: Array<{ name: string; size: number; modified: string; path: string }>
          }
        }>(['node-files', workflowId, upstreamNode.id])
        const upstreamHasOutputFiles = upstreamFilesQuery?.folders.output && upstreamFilesQuery.folders.output.length > 0
        return (upstreamState.outputs && Object.keys(upstreamState.outputs).length > 0) || upstreamHasOutputFiles
      })
      
      if (allUpstreamReady && upstreamNodes.length > 0) {
        inputStatus = 'ready'
      } else {
        // No upstream files ready - show idle (grey)
        inputStatus = 'idle'
      }
    } else {
      // No input connections - check if node has files in input folder or file/config ready
      if (hasInputFiles) {
        inputStatus = 'ready'
      } else {
        const hasFile = node.config?.file_key
        const hasConfig = node.config && Object.keys(node.config).length > 0
        if (hasFile || hasConfig) {
          inputStatus = 'ready'
        } else {
          // No files in input folder - show idle (grey)
          inputStatus = 'idle'
        }
      }
    }
    
    // Determine process status
    let processStatus: AndonStatusType = 'idle'
    if (isProcessing) {
      processStatus = 'processing'
    } else if (hasError) {
      processStatus = 'error'
    } else if (isComplete) {
      processStatus = 'complete'
    } else if (hasWipFiles) {
      // If there are files in WIP folder, process is in progress
      processStatus = 'processing'
    } else if (inputStatus === 'ready') {
      processStatus = 'ready'
    } else {
      // No files in WIP folder and input not ready - show idle (grey)
      processStatus = 'idle'
    }
    
    // Determine output status
    let outputStatus: AndonStatusType = 'idle'
    if (hasError) {
      outputStatus = 'error'
    } else if (hasOutputFiles) {
      // If there are files in output folder, output is ready
      outputStatus = 'ready'
    } else if (hasOutputs || isComplete) {
      outputStatus = 'ready'
    } else if (isProcessing || hasWipFiles) {
      outputStatus = 'idle'
    } else if (processStatus === 'complete') {
      outputStatus = 'ready'
    } else {
      // No files in output folder - show idle (grey)
      outputStatus = 'idle'
    }
    
    return { inputStatus, processStatus, outputStatus }
  }

  // Component to fetch node files and display Andon status
  const NodeAndonStatus = ({ 
    node, 
    nodes, 
    connections, 
    workflowId, 
    queryClient,
    getNodeAndonStatus
  }: {
    node: Node
    nodes: Node[]
    connections: Connection[]
    workflowId: string
    queryClient: ReturnType<typeof useQueryClient>
    getNodeAndonStatus: (node: Node) => { inputStatus: AndonStatusType; processStatus: AndonStatusType; outputStatus: AndonStatusType }
  }) => {
    // Fetch node files for this node
    const { data: nodeFiles } = useQuery({
      queryKey: ['node-files', workflowId, node.id],
      queryFn: async () => {
        return apiClient.get<{
          workflow_id: string
          node_id: string
          node_path: string
          folders: {
            input: Array<{ name: string; size: number; modified: string; path: string }>
            wip: Array<{ name: string; size: number; modified: string; path: string }>
            output: Array<{ name: string; size: number; modified: string; path: string }>
          }
        }>(`/v1/workflows/${workflowId}/nodes/${node.id}/files`)
      },
      enabled: !!node.id && !!workflowId,
      staleTime: 10000, // Cache for 10 seconds
      refetchInterval: 5000, // Refetch every 5 seconds to keep status updated
    })

    // Update query cache with fetched data so getNodeAndonStatus can use it
    useEffect(() => {
      if (nodeFiles) {
        queryClient.setQueryData(['node-files', workflowId, node.id], nodeFiles)
      }
    }, [nodeFiles, workflowId, node.id, queryClient])

    const andonStatus = getNodeAndonStatus(node)

    return (
      <AndonStatus
        inputStatus={andonStatus.inputStatus}
        processStatus={andonStatus.processStatus}
        outputStatus={andonStatus.outputStatus}
        size="sm"
        onInputClick={() => {
          const fileCount = nodeFiles?.folders.input.length || 0
          toast(`Input Status: ${andonStatus.inputStatus} (${fileCount} file${fileCount !== 1 ? 's' : ''})`)
        }}
        onProcessClick={() => {
          const fileCount = nodeFiles?.folders.wip.length || 0
          toast(`Process Status: ${andonStatus.processStatus} (${fileCount} file${fileCount !== 1 ? 's' : ''} in WIP)`)
        }}
        onOutputClick={() => {
          const fileCount = nodeFiles?.folders.output.length || 0
          toast(`Output Status: ${andonStatus.outputStatus} (${fileCount} file${fileCount !== 1 ? 's' : ''})`)
        }}
      />
    )
  }

  // Render embedded interface for a node
  const renderEmbeddedInterface = (node: Node) => {
    // Check if node has input sources (connections where this node is the target)
    const hasInputSource = connections.some(conn => conn.target_node_id === node.id)

    // Handle config update - use the same handler as the side panel
    const handleConfigUpdate = (newConfig: any) => {
      handleSaveNodeConfig(node.id, newConfig)
    }

    // Handle process action
    const handleProcess = () => {
      // Trigger workflow execution or node processing
      toast.success('Processing node...')
      // TODO: Implement actual processing logic
    }

    switch (node.module_type) {
      case 'excel_to_numeric':
        return (
          <ExcelToNumericEmbedded
            node={node}
            workspaceId={workspaceId}
            workflowId={workflowId}
            hasInputSource={hasInputSource}
            onConfigUpdate={handleConfigUpdate}
            onProcess={handleProcess}
          />
        )
      case 'file_uploader':
        return (
          <FileUploaderEmbedded
            node={node}
            workspaceId={workspaceId}
            workflowId={workflowId}
            hasInputSource={hasInputSource}
            onConfigUpdate={handleConfigUpdate}
            onProcess={handleProcess}
          />
        )
      case 'excel_viewer':
        return (
          <ExcelViewerEmbedded
            node={node}
            workspaceId={workspaceId}
            workflowId={workflowId}
            hasInputSource={hasInputSource}
            onConfigUpdate={handleConfigUpdate}
            onProcess={handleProcess}
          />
        )
      case 'outlier_remover':
        return (
          <OutlierRemoverEmbedded
            node={node}
            workspaceId={workspaceId}
            workflowId={workflowId}
            hasInputSource={hasInputSource}
            onConfigUpdate={handleConfigUpdate}
            onProcess={handleProcess}
          />
        )
      case 'duckdb_convert':
        return (
          <DuckDBConvertEmbedded
            node={node}
            workflowId={workflowId}
            onConfigUpdate={handleConfigUpdate}
          />
        )
      case 'excel2jmp':
        return (
          <Excel2JMPEmbedded
            node={node}
            workflowId={workflowId}
            onConfigUpdate={handleConfigUpdate}
          />
        )
      default:
        return null
    }
  }

  // Zoom handlers
  const handleZoomIn = () => {
    setViewport(prev => ({
      ...prev,
      zoom: Math.min(prev.zoom + 0.1, 2) // Max zoom 2x
    }))
  }

  const handleZoomOut = () => {
    setViewport(prev => ({
      ...prev,
      zoom: Math.max(prev.zoom - 0.1, 0.5) // Min zoom 0.5x
    }))
  }

  const handleZoomReset = () => {
    setViewport(prev => ({
      ...prev,
      zoom: 1,
      x: 0,
      y: 0
    }))
  }

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      setViewport(prev => ({
        ...prev,
        zoom: Math.max(0.5, Math.min(2, prev.zoom + delta))
      }))
    }
  }, [])

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
    console.log('=== SOCKET CLICKED ===')
    console.log('nodeId:', nodeId)
    console.log('socketType:', socketType)
    console.log('connectionState:', connectionState)
    console.log('pendingConnection:', pendingConnection)
    
    const node = nodes.find(n => n.id === nodeId)
    if (!node) {
      console.log('ERROR: Node not found:', nodeId)
      return
    }

    const module = modules.find(m => m.module_type === node.module_type)
    const displayName = node.checkpoint_name || module?.display_name || node.module_type
    console.log('Node found:', { nodeId, displayName, moduleType: node.module_type })

    if (socketType === 'output') {
      console.log('OUTPUT socket clicked')
      // Output socket clicked
      if (connectionState?.sourceNodeId === nodeId && connectionState?.sourcePort === 'output') {
        console.log('Same output socket clicked - cancelling')
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
        toast('Connection cancelled', { icon: 'ℹ️' })
      } else if (connectionState?.targetNodeId && connectionState?.targetPort === 'input') {
        console.log('Input already selected, completing connection')
        // Complete connection: output -> input (output clicked after input)
        if (connectionState.targetNodeId === nodeId) {
          console.log('ERROR: Cannot connect to same node')
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
        } else {
          console.log('Creating pending connection from output to input')
          // Show confirmation window
          const pending = {
            sourceNodeId: nodeId, // Output node is the source
            targetNodeId: connectionState.targetNodeId!, // Input node is the target
            sourcePort: 'output',
            targetPort: 'input'
          }
          console.log('Setting pending connection:', pending)
          setPendingConnection(pending)
          // Also update connectionState to show both sockets are selected
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
          setConnectionState({
            sourceNodeId: nodeId,
            sourcePort: 'output',
            targetNodeId: connectionState.targetNodeId,
            targetPort: 'input',
            mouseX: rect.left + rect.width / 2,
            mouseY: rect.top + rect.height / 2
          })
          console.log('State updated - pendingConnection should be:', pending)
        }
      } else {
        console.log('Starting connection from output socket')
        // Start connection from output socket
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const newState = {
          sourceNodeId: nodeId,
          sourcePort: 'output',
          targetNodeId: null,
          targetPort: null,
          mouseX: rect.left + rect.width / 2,
          mouseY: rect.top + rect.height / 2
        }
        console.log('Setting connectionState:', newState)
        setConnectionState(newState)
        toast.success(`Output selected: ${displayName} → Click an input socket to connect`, {
          duration: 3000
        })
      }
    } else {
      console.log('INPUT socket clicked')
      // Input socket clicked
      if (connectionState?.targetNodeId === nodeId && connectionState?.targetPort === 'input') {
        console.log('Same input socket clicked - cancelling')
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
        toast('Connection cancelled', { icon: 'ℹ️' })
      } else if (connectionState?.sourceNodeId && connectionState?.sourcePort === 'output') {
        console.log('Output already selected, completing connection')
        // Complete connection: output -> input (input clicked after output)
        if (connectionState.sourceNodeId === nodeId) {
          console.log('ERROR: Cannot connect to same node')
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
        } else {
          console.log('Creating pending connection from output to input')
          // Show confirmation window
          const pending = {
            sourceNodeId: connectionState.sourceNodeId!, // Output node is the source
            targetNodeId: nodeId, // Input node is the target
            sourcePort: 'output',
            targetPort: 'input'
          }
          console.log('Setting pending connection:', pending)
          setPendingConnection(pending)
          // Also update connectionState to show both sockets are selected
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
          setConnectionState({
            sourceNodeId: connectionState.sourceNodeId,
            sourcePort: 'output',
            targetNodeId: nodeId,
            targetPort: 'input',
            mouseX: rect.left + rect.width / 2,
            mouseY: rect.top + rect.height / 2
          })
          console.log('State updated - pendingConnection should be:', pending)
        }
      } else {
        console.log('Starting connection from input socket')
        // Start connection from input socket (waiting for output)
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const newState = {
          sourceNodeId: null,
          sourcePort: null,
          targetNodeId: nodeId,
          targetPort: 'input',
          mouseX: rect.left + rect.width / 2,
          mouseY: rect.top + rect.height / 2
        }
        console.log('Setting connectionState:', newState)
        setConnectionState(newState)
        toast.success(`Input selected: ${displayName} ← Click an output socket to connect`, {
          duration: 3000
        })
      }
    }
    console.log('=== END SOCKET CLICK ===')
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
    toast('Connection cancelled', { icon: 'ℹ️' })
  }

  const renderNodeConfig = () => {
    // Show connection confirmation dialog if pending
    if (pendingConnection) {
      const sourceNode = nodes.find(n => n.id === pendingConnection.sourceNodeId)
      const targetNode = nodes.find(n => n.id === pendingConnection.targetNodeId)
      const sourceModule = sourceNode ? modules.find(m => m.module_type === sourceNode.module_type) : null
      const targetModule = targetNode ? modules.find(m => m.module_type === targetNode.module_type) : null
      const sourceDisplayName = sourceNode?.checkpoint_name || sourceModule?.display_name || pendingConnection.sourceNodeId
      const targetDisplayName = targetNode?.checkpoint_name || targetModule?.display_name || pendingConnection.targetNodeId
      
      return (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="h-full flex flex-col p-8 bg-white"
        >
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-2xl font-semibold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">Confirm Connection</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelConnection}
              className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center space-y-8">
            {/* Vertical Layout */}
            <div className="flex flex-col items-center justify-center space-y-6 w-full">
              {/* Source Node */}
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: -20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex flex-col items-center space-y-3 p-6 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl border-2 border-teal-200 w-full max-w-xs shadow-sm"
              >
                <div className="text-xs font-semibold text-teal-600 uppercase tracking-wide">Source</div>
                <div className="text-base font-semibold text-gray-800 text-center truncate w-full">
                  {sourceDisplayName}
                </div>
                <div className="text-xs text-gray-500">
                  {sourceModule?.display_name || sourceNode?.module_type}
                </div>
              </motion.div>
              
              {/* Arrow - Vertical */}
              <motion.div 
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2 }}
                className="flex items-center justify-center py-2"
              >
                <ArrowDown className="h-8 w-8 text-teal-400" />
              </motion.div>
              
              {/* Target Node */}
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col items-center space-y-3 p-6 bg-gradient-to-br from-cyan-50 to-teal-50 rounded-xl border-2 border-cyan-200 w-full max-w-xs shadow-sm"
              >
                <div className="text-xs font-semibold text-cyan-600 uppercase tracking-wide">Target</div>
                <div className="text-base font-semibold text-gray-800 text-center truncate w-full">
                  {targetDisplayName}
                </div>
                <div className="text-xs text-gray-500">
                  {targetModule?.display_name || targetNode?.module_type}
                </div>
              </motion.div>
            </div>
            
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-sm text-gray-600 text-center px-4"
            >
              Create connection from <span className="font-semibold text-teal-600">{sourceDisplayName}</span> to <span className="font-semibold text-cyan-600">{targetDisplayName}</span>?
            </motion.p>
            
            <div className="flex justify-end space-x-3 pt-6 border-t border-teal-100 w-full">
              <Button
                variant="outline"
                onClick={handleCancelConnection}
                className="border-teal-200 text-gray-600 hover:bg-teal-50 hover:border-teal-300"
              >
                Cancel
              </Button>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  onClick={handleConfirmConnection}
                  disabled={createConnectionMutation.isPending}
                  className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white shadow-md shadow-teal-200/50"
                >
                  {createConnectionMutation.isPending ? 'Creating...' : 'Confirm Connection'}
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>
      )
    }

    if (!selectedNodeData) {
      return (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-center h-full text-gray-400"
        >
          <div className="text-center space-y-4">
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
            >
              <Settings className="h-16 w-16 mx-auto mb-4 text-teal-300" />
            </motion.div>
            <p className="text-lg font-semibold text-gray-600">Select a node to configure</p>
            <p className="text-sm text-gray-400 mt-2">Click a node to select it, then click a grid cell to move it</p>
          </div>
        </motion.div>
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

    // Common header with editable checkpoint name for all node types
    const handleCheckpointNameBlur = () => {
      setEditingCheckpointName(false)
      if (tempCheckpointName !== (selectedNodeData.checkpoint_name || '')) {
        handleUpdateCheckpointName(selectedNodeData.id, tempCheckpointName)
      }
    }

    const handleCheckpointNameKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleCheckpointNameBlur()
      } else if (e.key === 'Escape') {
        setTempCheckpointName(selectedNodeData.checkpoint_name || '')
        setEditingCheckpointName(false)
      }
    }

    const nodeConfigHeader = (
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 border-b border-teal-100 bg-gradient-to-br from-teal-50/50 to-cyan-50/30"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-400 text-white shadow-sm">
            {getNodeColor(selectedNodeData.module_type).icon}
          </div>
          <div className="flex-1">
            {/* Module Name - Always shown */}
            <div className="text-base font-semibold text-gray-800">
              {module?.display_name || selectedNodeData.module_type}
            </div>
            {/* Checkpoint Name - User-defined, editable */}
            {editingCheckpointName ? (
              <input
                type="text"
                value={tempCheckpointName}
                onChange={(e) => setTempCheckpointName(e.target.value)}
                onBlur={handleCheckpointNameBlur}
                onKeyDown={handleCheckpointNameKeyDown}
                className="w-full px-3 py-2 mt-2 bg-white border-2 border-teal-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-300 transition-all duration-200"
                placeholder="Enter checkpoint name (optional)"
                autoFocus
              />
            ) : (
              <div
                className="text-sm text-gray-500 mt-2 cursor-pointer hover:text-teal-600 transition-colors"
                onClick={() => setEditingCheckpointName(true)}
                title="Click to edit checkpoint name"
              >
                {selectedNodeData.checkpoint_name || 'Click to add checkpoint name'}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    )

    switch (selectedNodeData.module_type) {
      case 'excel_loader':
        return (
          <div className="h-full flex flex-col">
            {/* Node Header with Editable Checkpoint Name */}
            {nodeConfigHeader}
            
            {/* Connection Info - Input Sources and Output Destinations */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="p-6 border-b border-teal-100 bg-white/50"
            >
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Connections</h3>
              
              {/* Input Sources */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowDown className="h-4 w-4 text-teal-500" />
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Input Sources</span>
                  <span className="text-xs text-gray-400">({upstreamNodes.length})</span>
                </div>
                {upstreamNodes.length > 0 ? (
                  <div className="space-y-2">
                    {upstreamNodes.map((upstreamNode: { id: string; name: string; moduleType?: string }) => {
                      const upstreamModule = modules.find(m => m.module_type === upstreamNode.moduleType)
                      const upstreamNodeColor = getNodeColor(upstreamNode.moduleType || '')
                      return (
                        <motion.div
                          key={upstreamNode.id}
                          whileHover={{ scale: 1.02, x: 4 }}
                          className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-100 hover:border-teal-200 hover:shadow-sm cursor-pointer transition-all duration-200"
                          onClick={() => setSelectedNode(upstreamNode.id)}
                        >
                          <div className="p-2 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-400 text-white shadow-sm">
                            {upstreamNodeColor.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {upstreamNode.name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {upstreamModule?.display_name || upstreamNode.moduleType}
                            </p>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No input sources</p>
                )}
              </div>

              {/* Output Destinations */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ArrowUp className="h-4 w-4 text-cyan-500" />
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Output Destinations</span>
                  <span className="text-xs text-gray-400">({downstreamNodes.length})</span>
                </div>
                {downstreamNodes.length > 0 ? (
                  <div className="space-y-2">
                    {downstreamNodes.map((downstreamNode: { id: string; name: string; moduleType?: string }) => {
                      const downstreamModule = modules.find(m => m.module_type === downstreamNode.moduleType)
                      const downstreamNodeColor = getNodeColor(downstreamNode.moduleType || '')
                      return (
                        <motion.div
                          key={downstreamNode.id}
                          whileHover={{ scale: 1.02, x: 4 }}
                          className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-cyan-50 to-teal-50 border border-cyan-100 hover:border-cyan-200 hover:shadow-sm cursor-pointer transition-all duration-200"
                          onClick={() => setSelectedNode(downstreamNode.id)}
                        >
                          <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-400 to-teal-400 text-white shadow-sm">
                            {downstreamNodeColor.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {downstreamNode.name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {downstreamModule?.display_name || downstreamNode.moduleType}
                            </p>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No output destinations</p>
                )}
              </div>
            </motion.div>
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
            {/* Node Header with Editable Checkpoint Name */}
            {nodeConfigHeader}
            
            {/* Connection Info - Input Sources and Output Destinations */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="p-6 border-b border-teal-100 bg-white/50"
            >
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Connections</h3>
              
              {/* Input Sources */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowDown className="h-4 w-4 text-teal-500" />
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Input Sources</span>
                  <span className="text-xs text-gray-400">({upstreamNodes.length})</span>
                </div>
                {upstreamNodes.length > 0 ? (
                  <div className="space-y-2">
                    {upstreamNodes.map((upstreamNode: { id: string; name: string; moduleType?: string }) => {
                      const upstreamModule = modules.find(m => m.module_type === upstreamNode.moduleType)
                      const upstreamNodeColor = getNodeColor(upstreamNode.moduleType || '')
                      return (
                        <motion.div
                          key={upstreamNode.id}
                          whileHover={{ scale: 1.02, x: 4 }}
                          className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-100 hover:border-teal-200 hover:shadow-sm cursor-pointer transition-all duration-200"
                          onClick={() => setSelectedNode(upstreamNode.id)}
                        >
                          <div className="p-2 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-400 text-white shadow-sm">
                            {upstreamNodeColor.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {upstreamNode.name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {upstreamModule?.display_name || upstreamNode.moduleType}
                            </p>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No input sources</p>
                )}
              </div>

              {/* Output Destinations */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ArrowUp className="h-4 w-4 text-cyan-500" />
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Output Destinations</span>
                  <span className="text-xs text-gray-400">({downstreamNodes.length})</span>
                </div>
                {downstreamNodes.length > 0 ? (
                  <div className="space-y-2">
                    {downstreamNodes.map((downstreamNode: { id: string; name: string; moduleType?: string }) => {
                      const downstreamModule = modules.find(m => m.module_type === downstreamNode.moduleType)
                      const downstreamNodeColor = getNodeColor(downstreamNode.moduleType || '')
                      return (
                        <motion.div
                          key={downstreamNode.id}
                          whileHover={{ scale: 1.02, x: 4 }}
                          className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-cyan-50 to-teal-50 border border-cyan-100 hover:border-cyan-200 hover:shadow-sm cursor-pointer transition-all duration-200"
                          onClick={() => setSelectedNode(downstreamNode.id)}
                        >
                          <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-400 to-teal-400 text-white shadow-sm">
                            {downstreamNodeColor.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {downstreamNode.name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {downstreamModule?.display_name || downstreamNode.moduleType}
                            </p>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No output destinations</p>
                )}
              </div>
            </motion.div>
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
            {/* Node Header with Editable Checkpoint Name */}
            {nodeConfigHeader}
            
            {/* Connection Info - Input Sources and Output Destinations */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="p-6 border-b border-teal-100 bg-white/50"
            >
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Connections</h3>
              
              {/* Input Sources */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowDown className="h-4 w-4 text-teal-500" />
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Input Sources</span>
                  <span className="text-xs text-gray-400">({upstreamNodes.length})</span>
                </div>
                {upstreamNodes.length > 0 ? (
                  <div className="space-y-2">
                    {upstreamNodes.map((upstreamNode: { id: string; name: string; moduleType?: string }) => {
                      const upstreamModule = modules.find(m => m.module_type === upstreamNode.moduleType)
                      const upstreamNodeColor = getNodeColor(upstreamNode.moduleType || '')
                      return (
                        <motion.div
                          key={upstreamNode.id}
                          whileHover={{ scale: 1.02, x: 4 }}
                          className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-100 hover:border-teal-200 hover:shadow-sm cursor-pointer transition-all duration-200"
                          onClick={() => setSelectedNode(upstreamNode.id)}
                        >
                          <div className="p-2 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-400 text-white shadow-sm">
                            {upstreamNodeColor.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {upstreamNode.name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {upstreamModule?.display_name || upstreamNode.moduleType}
                            </p>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No input sources</p>
                )}
              </div>

              {/* Output Destinations */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ArrowUp className="h-4 w-4 text-cyan-500" />
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Output Destinations</span>
                  <span className="text-xs text-gray-400">({downstreamNodes.length})</span>
                </div>
                {downstreamNodes.length > 0 ? (
                  <div className="space-y-2">
                    {downstreamNodes.map((downstreamNode: { id: string; name: string; moduleType?: string }) => {
                      const downstreamModule = modules.find(m => m.module_type === downstreamNode.moduleType)
                      const downstreamNodeColor = getNodeColor(downstreamNode.moduleType || '')
                      return (
                        <motion.div
                          key={downstreamNode.id}
                          whileHover={{ scale: 1.02, x: 4 }}
                          className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-cyan-50 to-teal-50 border border-cyan-100 hover:border-cyan-200 hover:shadow-sm cursor-pointer transition-all duration-200"
                          onClick={() => setSelectedNode(downstreamNode.id)}
                        >
                          <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-400 to-teal-400 text-white shadow-sm">
                            {downstreamNodeColor.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {downstreamNode.name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {downstreamModule?.display_name || downstreamNode.moduleType}
                            </p>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No output destinations</p>
                )}
              </div>
            </motion.div>
            <div className="flex-1 overflow-y-auto">
              <BoxplotStatsConfig
                node={selectedNodeData}
                nodeContext={currentNodeContext}
                onSave={(config) => handleSaveNodeConfig(selectedNodeData.id, config)}
              />
            </div>
          </div>
        )
      case 'excel_to_numeric':
        return (
          <div className="h-full flex flex-col">
            {/* Node Header with Editable Checkpoint Name */}
            {nodeConfigHeader}
            
            {/* Connection Info - Input Sources and Output Destinations */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="p-6 border-b border-purple-100 bg-white/50"
            >
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Connections</h3>
              
              {/* Input Sources */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowDown className="h-4 w-4 text-purple-500" />
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Input Sources</span>
                  <span className="text-xs text-gray-400">({upstreamNodes.length})</span>
                </div>
                {upstreamNodes.length > 0 ? (
                  <div className="space-y-2">
                    {upstreamNodes.map((upstreamNode: { id: string; name: string; moduleType?: string }) => {
                      const upstreamModule = modules.find(m => m.module_type === upstreamNode.moduleType)
                      const upstreamNodeColor = getNodeColor(upstreamNode.moduleType || '')
                      return (
                        <motion.div
                          key={upstreamNode.id}
                          whileHover={{ scale: 1.02, x: 4 }}
                          className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-100 hover:border-purple-200 hover:shadow-sm cursor-pointer transition-all duration-200"
                          onClick={() => setSelectedNode(upstreamNode.id)}
                        >
                          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-400 to-pink-400 text-white shadow-sm">
                            {upstreamNodeColor.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {upstreamNode.name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {upstreamModule?.display_name || upstreamNode.moduleType}
                            </p>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No input sources</p>
                )}
              </div>

              {/* Output Destinations */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ArrowUp className="h-4 w-4 text-pink-500" />
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Output Destinations</span>
                  <span className="text-xs text-gray-400">({downstreamNodes.length})</span>
                </div>
                {downstreamNodes.length > 0 ? (
                  <div className="space-y-2">
                    {downstreamNodes.map((downstreamNode: { id: string; name: string; moduleType?: string }) => {
                      const downstreamModule = modules.find(m => m.module_type === downstreamNode.moduleType)
                      const downstreamNodeColor = getNodeColor(downstreamNode.moduleType || '')
                      return (
                        <motion.div
                          key={downstreamNode.id}
                          whileHover={{ scale: 1.02, x: 4 }}
                          className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-pink-50 to-purple-50 border border-pink-100 hover:border-pink-200 hover:shadow-sm cursor-pointer transition-all duration-200"
                          onClick={() => setSelectedNode(downstreamNode.id)}
                        >
                          <div className="p-2 rounded-lg bg-gradient-to-br from-pink-400 to-purple-400 text-white shadow-sm">
                            {downstreamNodeColor.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {downstreamNode.name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {downstreamModule?.display_name || downstreamNode.moduleType}
                            </p>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No output destinations</p>
                )}
              </div>
            </motion.div>
            <div className="flex-1 overflow-y-auto">
              <ExcelToNumericConfig
                node={selectedNodeData}
                workspaceId={workspaceId}
                workflowId={workflowId}
                nodeContext={currentNodeContext}
                onSave={(config) => handleSaveNodeConfig(selectedNodeData.id, config)}
              />
            </div>
          </div>
        )
      case 'file_uploader':
        return (
          <div className="h-full flex flex-col">
            {/* Node Header with Editable Checkpoint Name */}
            {nodeConfigHeader}
            
            {/* Connection Info - Input Sources and Output Destinations */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="p-6 border-b border-blue-100 bg-white/50"
            >
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Connections</h3>
              
              {/* Input Sources */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowDown className="h-4 w-4 text-blue-500" />
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Input Sources</span>
                  <span className="text-xs text-gray-400">({upstreamNodes.length})</span>
                </div>
                {upstreamNodes.length > 0 ? (
                  <div className="space-y-2">
                    {upstreamNodes.map((upstreamNode: { id: string; name: string; moduleType?: string }) => {
                      const upstreamModule = modules.find(m => m.module_type === upstreamNode.moduleType)
                      return (
                        <div key={upstreamNode.id} className="flex items-center gap-2 p-2 bg-blue-50 rounded border border-blue-100">
                          <div className="flex-1">
                            <p className="text-xs font-medium text-gray-800">{upstreamNode.name || 'Unnamed Node'}</p>
                            {upstreamModule && (
                              <p className="text-xs text-gray-500">{upstreamModule.display_name}</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No input sources</p>
                )}
              </div>
              
              {/* Output Destinations */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ArrowUp className="h-4 w-4 text-blue-500" />
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Output Destinations</span>
                  <span className="text-xs text-gray-400">({downstreamNodes.length})</span>
                </div>
                {downstreamNodes.length > 0 ? (
                  <div className="space-y-2">
                    {downstreamNodes.map((downstreamNode: { id: string; name: string; moduleType?: string }) => {
                      const downstreamModule = modules.find(m => m.module_type === downstreamNode.moduleType)
                      return (
                        <div key={downstreamNode.id} className="flex items-center gap-2 p-2 bg-blue-50 rounded border border-blue-100">
                          <div className="flex-1">
                            <p className="text-xs font-medium text-gray-800">{downstreamNode.name || 'Unnamed Node'}</p>
                            {downstreamModule && (
                              <p className="text-xs text-gray-500">{downstreamModule.display_name}</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No output destinations</p>
                )}
              </div>
            </motion.div>
            <div className="flex-1 overflow-y-auto">
              <FileUploaderConfig
                node={selectedNodeData}
                workspaceId={workspaceId}
                workflowId={workflowId}
                nodeContext={currentNodeContext}
                onSave={(config) => handleSaveNodeConfig(selectedNodeData.id, config)}
              />
            </div>
          </div>
        )
      default:
        return (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-8 bg-white"
          >
            <h3 className="text-lg font-semibold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent mb-4">Node Configuration</h3>
            <p className="text-gray-600">No configuration available for this node type.</p>
          </motion.div>
        )
    }
  }

  // Close theme menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isThemeMenuOpen && !(event.target as Element).closest('.theme-menu-container')) {
        setIsThemeMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isThemeMenuOpen])

  // Line-based abstract illustration component
  const AbstractIllustration = () => (
    <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-5" preserveAspectRatio="none">
      <defs>
        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.3" />
          <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      {/* Flowing curved lines */}
      <motion.path
        d="M0,200 Q300,100 600,200 T1200,200"
        stroke="url(#lineGradient)"
        strokeWidth="1.5"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.4 }}
        transition={{ duration: 3, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" }}
      />
      <motion.path
        d="M0,400 Q400,300 800,400 T1600,400"
        stroke="url(#lineGradient)"
        strokeWidth="1.5"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.3 }}
        transition={{ duration: 4, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", delay: 0.5 }}
      />
      <motion.path
        d="M0,600 Q500,500 1000,600 T2000,600"
        stroke="url(#lineGradient)"
        strokeWidth="1.5"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.2 }}
        transition={{ duration: 5, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", delay: 1 }}
      />
      {/* Geometric line patterns */}
      {[...Array(8)].map((_, i) => (
        <motion.line
          key={i}
          x1={i * 200}
          y1={0}
          x2={i * 200 + 100}
          y2="100%"
          stroke="url(#lineGradient)"
          strokeWidth="0.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.2, 0] }}
          transition={{ duration: 4, repeat: Infinity, delay: i * 0.3 }}
        />
      ))}
    </svg>
  )

  return (
    <div className="relative w-full h-full bg-white flex overflow-hidden">
      {/* Abstract Line Illustrations Background */}
      <AbstractIllustration />
      
      {/* Left Panel - Toolbar */}
      <motion.div 
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-64 border-r border-teal-100 bg-gradient-to-b from-teal-50/30 to-cyan-50/20 backdrop-blur-sm flex flex-col shadow-sm"
      >
        <div className="p-6 border-b border-teal-100/50">
          <div className="flex items-center justify-between mb-6">
            <motion.h2 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="text-xl font-semibold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent"
            >
              Workflow
            </motion.h2>
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
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button 
                    size="sm"
                    className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white shadow-md shadow-teal-200/50 transition-all duration-300"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Node
                  </Button>
                </motion.div>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-white border-teal-100 shadow-xl">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-semibold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">Add Node</DialogTitle>
                <DialogDescription className="text-gray-500">
                  {selectedModule ? 'Enter a checkpoint name to mark what this node is doing' : 'Select a module to add to your workflow'}
                </DialogDescription>
                </DialogHeader>
                
                {!selectedModule ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    <AnimatePresence>
                      {modules.map((module, index) => {
                        const nodeColor = getNodeColor(module.module_type)
                        return (
                          <motion.div
                            key={module.module_type}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3, delay: index * 0.1 }}
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <Card
                              className="cursor-pointer bg-white border-2 border-teal-100 hover:border-teal-300 hover:shadow-lg transition-all duration-300 group"
                              onClick={() => handleModuleSelect(module)}
                            >
                              <CardContent className="p-5">
                                <div className="flex items-center space-x-3 mb-3">
                                  <div className={`p-2.5 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-400 text-white shadow-sm group-hover:shadow-md transition-shadow`}>
                                    {nodeColor.icon}
                                  </div>
                                  <h3 className="font-semibold text-gray-800">{module.display_name}</h3>
                                </div>
                                <p className="text-sm text-gray-600 mb-3 leading-relaxed">{module.description}</p>
                                <div className="flex items-center space-x-4 text-xs text-gray-400">
                                  <span>{module.inputs.length} inputs</span>
                                  <span>{module.outputs.length} outputs</span>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Checkpoint Name
                      </label>
                      <p className="text-xs text-gray-500 mb-3">Mark what this node is doing (optional note for your reference)</p>
                      <input
                        type="text"
                        value={checkpointName}
                        onChange={(e) => setCheckpointName(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border-2 border-teal-100 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-300 transition-all duration-200"
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
                    <div className="flex justify-end space-x-3 pt-4">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSelectedModule(null)
                          setCheckpointName('')
                        }}
                        className="border-teal-200 text-gray-600 hover:bg-teal-50 hover:border-teal-300"
                      >
                        Back
                      </Button>
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Button
                          onClick={handleAddNode}
                          className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white shadow-md shadow-teal-200/50"
                        >
                          Add Node
                        </Button>
                      </motion.div>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

          </div>
        </div>

        {/* Node List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
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
                      {/* Module Name - Always shown */}
                      <p className="text-sm font-medium text-white truncate">
                        {module?.display_name || node.module_type}
                      </p>
                      {/* Checkpoint Name - User-defined, shown if exists */}
                      {node.checkpoint_name ? (
                        <p className="text-xs text-slate-300 truncate mt-0.5">
                          {node.checkpoint_name}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500 truncate mt-0.5 italic">
                          No checkpoint name
                        </p>
                      )}
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
      </motion.div>

      {/* Center - Canvas */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="flex-1 relative bg-white overflow-auto" 
        ref={canvasRef} 
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={handleCanvasMouseLeave}
        onWheel={handleWheel}
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#000000 #f0f0f0'
        }}
      >
        {/* Zoom Controls - Fixed position in top-right corner */}
        <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 bg-white/90 backdrop-blur-sm rounded-lg border border-gray-200 shadow-lg p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            disabled={viewport.zoom >= 2}
            className="h-8 w-8 p-0 hover:bg-gray-100 disabled:opacity-50"
            title="Zoom In (Ctrl/Cmd + Scroll)"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="text-xs text-center text-gray-600 font-medium min-w-[3rem] py-1">
            {Math.round(viewport.zoom * 100)}%
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomOut}
            disabled={viewport.zoom <= 0.5}
            className="h-8 w-8 p-0 hover:bg-gray-100 disabled:opacity-50"
            title="Zoom Out (Ctrl/Cmd + Scroll)"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomReset}
            className="h-8 w-8 p-0 hover:bg-gray-100"
            title="Reset Zoom"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
        {/* Subtle Grid Background - Cell-based with dashed black lines */}
        <svg
          key={`grid-${viewport.x}-${viewport.y}-${viewport.zoom}`}
          className="absolute inset-0 pointer-events-none"
          style={{ width: '100%', height: '100%', opacity: 0.3 }}
        >
          <defs>
            <pattern
              id="grid-pattern"
              x={viewport.x % (GRID_CELL_WIDTH * viewport.zoom)}
              y={viewport.y % (GRID_CELL_HEIGHT * viewport.zoom)}
              width={GRID_CELL_WIDTH * viewport.zoom}
              height={GRID_CELL_HEIGHT * viewport.zoom}
              patternUnits="userSpaceOnUse"
            >
              {/* Horizontal dashed lines */}
              <path
                d={`M 0 0 L ${GRID_CELL_WIDTH * viewport.zoom} 0`}
                stroke="#000000"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              {/* Vertical dashed lines */}
              <path
                d={`M 0 0 L 0 ${GRID_CELL_HEIGHT * viewport.zoom}`}
                stroke="#000000"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-pattern)" />
        </svg>
        
        {/* Grid Cell Highlight on Hover (when not dragging) */}
        {hoveredGridCell && !dragState && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute border-2 border-dashed border-teal-300 pointer-events-none rounded-lg"
            style={{
              left: (hoveredGridCell.x * GRID_CELL_WIDTH * viewport.zoom) + viewport.x,
              top: (hoveredGridCell.y * GRID_CELL_HEIGHT * viewport.zoom) + viewport.y,
              width: `${GRID_CELL_WIDTH * viewport.zoom}px`,
              height: `${GRID_CELL_HEIGHT * viewport.zoom}px`,
              backgroundColor: 'rgba(20, 184, 166, 0.08)'
            }}
          />
        )}
        
        {/* Grid Cell Highlight during drag */}
        {dragState && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute border-2 border-teal-400 pointer-events-none rounded-lg z-40 shadow-lg"
            style={{
              left: (dragState.currentCol * GRID_CELL_WIDTH * viewport.zoom) + viewport.x,
              top: (dragState.currentRow * GRID_CELL_HEIGHT * viewport.zoom) + viewport.y,
              width: `${GRID_CELL_WIDTH * viewport.zoom}px`,
              height: `${GRID_CELL_HEIGHT * viewport.zoom}px`,
              backgroundColor: 'rgba(20, 184, 166, 0.12)'
            }}
          />
        )}

        {/* SVG for Connections - Must be above nodes for clicking, but below dialogs */}
        <svg
          ref={svgRef}
          className="absolute inset-0"
          style={{ width: '100%', height: '100%', pointerEvents: 'none', zIndex: 20 }}
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
              <path d="M0,0 L0,6 L9,3 z" fill="#000000" />
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
              <path d="M0,0 L0,6 L9,3 z" fill="#000000" />
            </marker>
          </defs>

          {/* Existing Connections */}
          {connectionsList.map((connection) => {
            const path = getConnectionPath(connection)
            if (!path) return null
            
            return (
              <g key={connection.id} className="group" style={{ pointerEvents: 'auto' }}>
                {/* Invisible wider path for easier clicking - must be first so it's below the visible path */}
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="20"
                  style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    console.log('Connection clicked for deletion:', connection.id)
                    handleDeleteConnection(connection)
                  }}
                >
                  <title>Click to delete connection</title>
                </path>
                {/* Visible path */}
                <motion.path
                  d={path}
                  fill="none"
                  stroke="#000000"
                  strokeWidth="2.5"
                  markerEnd="url(#arrowhead)"
                  className="cursor-pointer"
                  style={{ pointerEvents: 'auto' }}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.5, ease: "easeInOut" }}
                  whileHover={{ strokeWidth: 3.5, opacity: 0.9 }}
                  onMouseEnter={(e) => {
                    e.currentTarget.setAttribute('marker-end', 'url(#arrowhead-hover)')
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.setAttribute('marker-end', 'url(#arrowhead)')
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    console.log('Connection clicked for deletion:', connection.id)
                    handleDeleteConnection(connection)
                  }}
                >
                  <title>Click to delete connection</title>
                </motion.path>
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
                <motion.path
                  d={path}
                  fill="none"
                  stroke="#000000"
                  strokeWidth="2.5"
                  strokeDasharray="8 4"
                  markerEnd="url(#arrowhead)"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.6 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                />
              )
            })()
          )}
        </svg>

        {/* Canvas Content Container - Sized to enable scrolling */}
        <div 
          className="relative"
          style={{ 
            minWidth: '200%',
            minHeight: '200%',
            width: `${Math.max(2000, nodes.length * GRID_CELL_WIDTH * 1.5)}px`,
            height: `${Math.max(2000, nodes.length * GRID_CELL_HEIGHT * 1.5)}px`
          }}
        >
          {/* Nodes */}
          <motion.div 
            className="absolute" 
            style={{ 
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
              transformOrigin: '0 0',
              zIndex: 10
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
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
              <motion.div
                key={node.id}
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -20 }}
                whileHover={{ scale: 1.05, y: -4 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className={`absolute ${
                  isSelected ? 'z-50' : 'z-10'
                } ${isDragging ? 'opacity-90 cursor-grabbing' : 'cursor-grab'}`}
                style={{
                  left: nodeX,
                  top: nodeY,
                  width: NODE_WIDTH,
                  height: NODE_HEIGHT
                }}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                onClick={(e) => handleNodeClick(e, node.id)}
              >
                <Card className={`h-full bg-white border-2 ${
                  isSelected 
                    ? 'border-teal-400 shadow-xl shadow-teal-200/50' 
                    : 'border-teal-200 hover:border-teal-300 shadow-md hover:shadow-lg'
                } cursor-pointer transition-all duration-300`}>
                  <CardContent className="p-3 h-full flex flex-col">
                    {/* Node Header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        {/* Module Name - Always shown */}
                        <h3 className={`text-xs font-semibold truncate ${
                          isSelected ? 'text-teal-700' : 'text-gray-800'
                        }`}>
                          {module?.display_name || node.module_type}
                        </h3>
                        {/* Checkpoint Name - User-defined, shown if exists */}
                        {node.checkpoint_name && (
                          <p className={`text-[10px] truncate mt-0.5 ${
                            isSelected ? 'text-teal-600' : 'text-gray-500'
                          }`}>
                            {node.checkpoint_name}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0 text-gray-400 hover:text-blue-400 hover:bg-blue-50"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedNode(node.id)
                            setShowNodeFolderDialog(true)
                          }}
                          title="Show node folder"
                        >
                          <FolderOpen className="h-2.5 w-2.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0 text-gray-400 hover:text-green-400 hover:bg-green-50"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedNode(node.id)
                            setShowNodeSummaryDialog(true)
                          }}
                          title="Show file summary"
                        >
                          <FileText className="h-2.5 w-2.5" />
                        </Button>
                        {/* DuckDB-specific buttons */}
                        {node.module_type === 'duckdb_convert' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 w-4 p-0 text-gray-400 hover:text-cyan-400 hover:bg-cyan-50"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedNode(node.id)
                                setShowDuckDBTablesDialog(true)
                              }}
                              title="View DuckDB tables"
                            >
                              <Table className="h-2.5 w-2.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 w-4 p-0 text-gray-400 hover:text-purple-400 hover:bg-purple-50"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedNode(node.id)
                                handleExecuteDuckDBNode(node.id)
                              }}
                              title="Execute DuckDB node"
                              disabled={executeDuckDBMutation.isPending}
                            >
                              <Play className="h-2.5 w-2.5" />
                            </Button>
                          </>
                        )}
                        {/* Regular execute button for non-DuckDB nodes */}
                        {node.module_type !== 'duckdb_convert' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0 text-gray-400 hover:text-purple-400 hover:bg-purple-50"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedNode(node.id)
                              handleExecuteNode(node.id)
                            }}
                            title="Execute node"
                          >
                            <Play className="h-2.5 w-2.5" />
                          </Button>
                        )}
                        {/* Config button - only show when no input source */}
                        {(() => {
                          const hasInputSource = connections.some(conn => conn.target_node_id === node.id)
                          return !hasInputSource && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 w-4 p-0 text-gray-400 hover:text-orange-400 hover:bg-orange-50"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedNode(node.id)
                                // Config dialog is shown when node is selected
                              }}
                              title="Configure node"
                            >
                              <Settings className="h-2.5 w-2.5" />
                            </Button>
                          )
                        })()}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0 text-gray-400 hover:text-red-400 hover:bg-red-50"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteNodeMutation.mutate(node.id)
                          }}
                        >
                          <X className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Node Content - Center - Embedded Interface or Description with Andon */}
                    <div className="flex-1 flex items-center justify-center gap-2 text-xs text-gray-400">
                      {/* Andon Status Indicator - Three Buttons */}
                      <NodeAndonStatus
                        node={node}
                        nodes={nodes}
                        connections={connections}
                        workflowId={workflowId}
                        queryClient={queryClient}
                        getNodeAndonStatus={getNodeAndonStatus}
                      />
                      {renderEmbeddedInterface(node) || (
                        <span className="truncate">{module?.description || node.module_type}</span>
                      )}
                    </div>

                    {/* Input Socket Button - Left Side */}
                    <motion.div
                      className={`absolute -left-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border border-white shadow-sm z-20 flex items-center justify-center ${
                        connectionState?.targetNodeId === node.id && 
                        connectionState?.targetPort === 'input'
                          ? 'bg-gradient-to-br from-teal-500 to-teal-600 ring-1 ring-teal-300'
                          : 'bg-gradient-to-br from-teal-400 to-teal-500 hover:from-teal-500 hover:to-teal-600'
                      } cursor-pointer transition-all duration-200`}
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 1.05 }}
                      onClick={(e) => handleSocketClick(e, node.id, 'input')}
                      title={connectionState?.targetNodeId === node.id && connectionState?.targetPort === 'input'
                        ? 'Click to cancel connection' 
                        : connectionState?.sourceNodeId && connectionState.sourceNodeId !== node.id
                        ? 'Click to complete connection (output -> input)'
                        : 'Input Socket - Click to start or complete connection'}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                    </motion.div>

                    {/* Output Socket Button - Right Side */}
                    <motion.div
                      className={`absolute -right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border border-white shadow-sm z-20 flex items-center justify-center ${
                        connectionState?.sourceNodeId === node.id && 
                        connectionState?.sourcePort === 'output'
                          ? 'bg-gradient-to-br from-cyan-500 to-cyan-600 ring-1 ring-cyan-300'
                          : 'bg-gradient-to-br from-cyan-400 to-cyan-500 hover:from-cyan-500 hover:to-cyan-600'
                      } cursor-pointer transition-all duration-200`}
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 1.05 }}
                      onClick={(e) => handleSocketClick(e, node.id, 'output')}
                      title={connectionState?.sourceNodeId === node.id && connectionState?.sourcePort === 'output'
                        ? 'Click to cancel connection'
                        : connectionState?.targetNodeId && connectionState.targetNodeId !== node.id
                        ? 'Click to complete connection (output -> input)'
                        : 'Output Socket - Click to start or complete connection'}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
          </motion.div>
        </div>
      </motion.div>

      {/* Right Panel - Node Configuration */}
      <div className={`w-96 border-l ${currentTheme.panelBorder} ${currentTheme.panel} overflow-y-auto`}>
        {renderNodeConfig()}
      </div>

      {/* Delete Connection Confirmation Dialog */}
      <AnimatePresence>
        {connectionToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/30 backdrop-blur-sm"
            onClick={() => setConnectionToDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white border-2 border-red-200 rounded-xl shadow-2xl p-8 max-w-md w-full mx-4"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-gray-800">Delete Connection</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConnectionToDelete(null)}
                  className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              {(() => {
                const sourceNode = nodes.find(n => n.id === connectionToDelete.source_node_id)
                const targetNode = nodes.find(n => n.id === connectionToDelete.target_node_id)
                const sourceModule = sourceNode ? modules.find(m => m.module_type === sourceNode.module_type) : null
                const targetModule = targetNode ? modules.find(m => m.module_type === targetNode.module_type) : null
                const sourceDisplayName = sourceNode?.checkpoint_name || sourceModule?.display_name || connectionToDelete.source_node_id
                const targetDisplayName = targetNode?.checkpoint_name || targetModule?.display_name || connectionToDelete.target_node_id
                
                return (
                  <div className="space-y-6">
                    <p className="text-sm text-gray-600 leading-relaxed">
                      Are you sure you want to delete the connection from <span className="font-semibold text-teal-600">{sourceDisplayName}</span> to <span className="font-semibold text-cyan-600">{targetDisplayName}</span>?
                    </p>
                    
                    <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                      <Button
                        variant="outline"
                        onClick={() => setConnectionToDelete(null)}
                        className="border-teal-200 text-gray-600 hover:bg-teal-50 hover:border-teal-300"
                      >
                        Cancel
                      </Button>
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Button
                          onClick={confirmDeleteConnection}
                          disabled={deleteConnectionMutation.isPending}
                          className="bg-red-500 hover:bg-red-600 text-white shadow-md shadow-red-200/50"
                        >
                          {deleteConnectionMutation.isPending ? 'Deleting...' : 'Delete Connection'}
                        </Button>
                      </motion.div>
                    </div>
                  </div>
                )
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Node Folder Dialog */}
      {showNodeFolderDialog && selectedNode && (
        <NodeFolderDialog
          workflowId={workflowId}
          nodeId={selectedNode}
          open={showNodeFolderDialog}
          onOpenChange={setShowNodeFolderDialog}
        />
      )}
      {showNodeSummaryDialog && selectedNode && (
        <NodeSummaryDialog
          workflowId={workflowId}
          nodeId={selectedNode}
          open={showNodeSummaryDialog}
          onOpenChange={setShowNodeSummaryDialog}
        />
      )}
      {showDuckDBTablesDialog && selectedNode && (
        <DuckDBTablesDialog
          workflowId={workflowId}
          nodeId={selectedNode}
          open={showDuckDBTablesDialog}
          onOpenChange={setShowDuckDBTablesDialog}
        />
      )}

    </div>
  )
}

// Node Folder Dialog Component
interface NodeFolderDialogProps {
  workflowId: string
  nodeId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function NodeFolderDialog({ workflowId, nodeId, open, onOpenChange }: NodeFolderDialogProps) {
  const queryClient = useQueryClient()
  const [clearingFiles, setClearingFiles] = useState(false)
  const [folderToClear, setFolderToClear] = useState<string | null>(null)
  
  const { data: nodeFiles, isLoading, error, refetch } = useQuery({
    queryKey: ['node-files', workflowId, nodeId],
    queryFn: async () => {
      return apiClient.get<{
        workflow_id: string
        node_id: string
        node_path: string
        folders: {
          input: Array<{ name: string; size: number; modified: string; path: string }>
          wip: Array<{ name: string; size: number; modified: string; path: string }>
          output: Array<{ name: string; size: number; modified: string; path: string }>
        }
      }>(`/v1/workflows/${workflowId}/nodes/${nodeId}/files`)
    },
    enabled: open && !!nodeId,
    staleTime: 30000 // Cache for 30 seconds
  })

  const clearFilesMutation = useMutation({
    mutationFn: async (folder: string | null) => {
      const url = folder 
        ? `/v1/workflows/${workflowId}/nodes/${nodeId}/files?folder=${folder}`
        : `/v1/workflows/${workflowId}/nodes/${nodeId}/files`
      return apiClient.delete<{
        workflow_id: string
        node_id: string
        folders_cleared: string[]
        deleted_files: Array<{ name: string; folder: string; path: string }>
        deleted_count: number
        errors?: Array<{ name: string; folder: string; error: string }>
      }>(url)
    },
    onSuccess: (data) => {
      toast.success(`Cleared ${data.deleted_count} file(s) from ${data.folders_cleared.join(', ')} folder(s)`)
      queryClient.invalidateQueries({ queryKey: ['node-files', workflowId, nodeId] })
      queryClient.invalidateQueries({ queryKey: ['workflow-nodes', workflowId] })
      setFolderToClear(null)
      refetch()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to clear files')
      setFolderToClear(null)
    },
    onSettled: () => {
      setClearingFiles(false)
    }
  })

  const handleClearFiles = async (folder: string | null = null) => {
    if (!confirm(`Are you sure you want to clear all files from ${folder ? `the ${folder} folder` : 'all folders'}? This action cannot be undone.`)) {
      return
    }
    
    setClearingFiles(true)
    setFolderToClear(folder)
    clearFilesMutation.mutate(folder)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  const totalFiles = nodeFiles 
    ? nodeFiles.folders.input.length + nodeFiles.folders.wip.length + nodeFiles.folders.output.length
    : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Node Folder Contents</DialogTitle>
              <DialogDescription>
                Files in the node folder: {nodeFiles?.node_path || 'Loading...'}
                {totalFiles > 0 && ` (${totalFiles} file${totalFiles !== 1 ? 's' : ''} total)`}
              </DialogDescription>
            </div>
            {totalFiles > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleClearFiles(null)}
                disabled={clearingFiles}
                className="flex items-center gap-2"
              >
                <Trash className="h-4 w-4" />
                {clearingFiles && !folderToClear ? 'Clearing...' : 'Clear All Files'}
              </Button>
            )}
          </div>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">Loading folder contents...</div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-8">
            <div className="text-red-500">Error loading folder contents: {error instanceof Error ? error.message : 'Unknown error'}</div>
          </div>
        )}

        {nodeFiles && (
          <div className="space-y-6">
            {/* Input Folder */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-blue-500" />
                  Input Folder ({nodeFiles.folders.input.length} file{nodeFiles.folders.input.length !== 1 ? 's' : ''})
                </h3>
                {nodeFiles.folders.input.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleClearFiles('input')}
                    disabled={clearingFiles && folderToClear === 'input'}
                    className="h-7 text-xs"
                  >
                    <Trash className="h-3 w-3 mr-1" />
                    {clearingFiles && folderToClear === 'input' ? 'Clearing...' : 'Clear'}
                  </Button>
                )}
              </div>
              {nodeFiles.folders.input.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Name</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Size</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Modified</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {nodeFiles.folders.input.map((file, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-800">{file.name}</td>
                          <td className="px-4 py-2 text-gray-600">{formatFileSize(file.size)}</td>
                          <td className="px-4 py-2 text-gray-600">{formatDate(file.modified)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No files in input folder</p>
              )}
            </div>

            {/* WIP Folder */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-yellow-500" />
                  WIP Folder ({nodeFiles.folders.wip.length} file{nodeFiles.folders.wip.length !== 1 ? 's' : ''})
                </h3>
                {nodeFiles.folders.wip.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleClearFiles('wip')}
                    disabled={clearingFiles && folderToClear === 'wip'}
                    className="h-7 text-xs"
                  >
                    <Trash className="h-3 w-3 mr-1" />
                    {clearingFiles && folderToClear === 'wip' ? 'Clearing...' : 'Clear'}
                  </Button>
                )}
              </div>
              {nodeFiles.folders.wip.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Name</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Size</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Modified</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {nodeFiles.folders.wip.map((file, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-800">{file.name}</td>
                          <td className="px-4 py-2 text-gray-600">{formatFileSize(file.size)}</td>
                          <td className="px-4 py-2 text-gray-600">{formatDate(file.modified)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No files in WIP folder</p>
              )}
            </div>

            {/* Output Folder */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-green-500" />
                  Output Folder ({nodeFiles.folders.output.length} file{nodeFiles.folders.output.length !== 1 ? 's' : ''})
                </h3>
                {nodeFiles.folders.output.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleClearFiles('output')}
                    disabled={clearingFiles && folderToClear === 'output'}
                    className="h-7 text-xs"
                  >
                    <Trash className="h-3 w-3 mr-1" />
                    {clearingFiles && folderToClear === 'output' ? 'Clearing...' : 'Clear'}
                  </Button>
                )}
              </div>
              {nodeFiles.folders.output.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Name</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Size</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Modified</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {nodeFiles.folders.output.map((file, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-800">{file.name}</td>
                          <td className="px-4 py-2 text-gray-600">{formatFileSize(file.size)}</td>
                          <td className="px-4 py-2 text-gray-600">{formatDate(file.modified)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No files in output folder</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface NodeSummaryDialogProps {
  workflowId: string
  nodeId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function NodeSummaryDialog({ workflowId, nodeId, open, onOpenChange }: NodeSummaryDialogProps) {
  const { data: nodeFiles, isLoading, error } = useQuery({
    queryKey: ['node-files', workflowId, nodeId],
    queryFn: async () => {
      return apiClient.get<{
        workflow_id: string
        node_id: string
        node_path: string
        folders: {
          input: Array<{ name: string; size: number; modified: string; path: string }>
          wip: Array<{ name: string; size: number; modified: string; path: string }>
          output: Array<{ name: string; size: number; modified: string; path: string }>
        }
      }>(`/v1/workflows/${workflowId}/nodes/${nodeId}/files`)
    },
    enabled: open && !!nodeId,
    staleTime: 30000 // Cache for 30 seconds
  })

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileType = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || 'unknown'
    return ext
  }

  const allFiles = nodeFiles 
    ? [
        ...nodeFiles.folders.input.map(f => ({ ...f, folder: 'input' })),
        ...nodeFiles.folders.wip.map(f => ({ ...f, folder: 'wip' })),
        ...nodeFiles.folders.output.map(f => ({ ...f, folder: 'output' }))
      ]
    : []

  const summary = {
    totalFiles: allFiles.length,
    totalSize: allFiles.reduce((sum, f) => sum + f.size, 0),
    byFolder: {
      input: nodeFiles?.folders.input.length || 0,
      wip: nodeFiles?.folders.wip.length || 0,
      output: nodeFiles?.folders.output.length || 0
    },
    byType: allFiles.reduce((acc, f) => {
      const type = getFileType(f.name)
      acc[type] = (acc[type] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>File Summary</DialogTitle>
          <DialogDescription>
            Summary of files in the node folder: {nodeFiles?.node_path || 'Loading...'}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">Loading file summary...</div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-8">
            <div className="text-red-500">Error loading file summary: {error instanceof Error ? error.message : 'Unknown error'}</div>
          </div>
        )}

        {nodeFiles && (
          <div className="space-y-6">
            {/* Summary Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{summary.totalFiles}</div>
                <div className="text-sm text-gray-600">Total Files</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{formatFileSize(summary.totalSize)}</div>
                <div className="text-sm text-gray-600">Total Size</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{Object.keys(summary.byType).length}</div>
                <div className="text-sm text-gray-600">File Types</div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">{summary.byFolder.input}</div>
                <div className="text-sm text-gray-600">Input Files</div>
              </div>
            </div>

            {/* Files by Folder */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700">Files by Folder</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="border rounded-lg p-4">
                  <div className="text-lg font-semibold text-blue-600">{summary.byFolder.input}</div>
                  <div className="text-xs text-gray-500">Input</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {formatFileSize(nodeFiles.folders.input.reduce((sum, f) => sum + f.size, 0))}
                  </div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-lg font-semibold text-yellow-600">{summary.byFolder.wip}</div>
                  <div className="text-xs text-gray-500">WIP</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {formatFileSize(nodeFiles.folders.wip.reduce((sum, f) => sum + f.size, 0))}
                  </div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-lg font-semibold text-green-600">{summary.byFolder.output}</div>
                  <div className="text-xs text-gray-500">Output</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {formatFileSize(nodeFiles.folders.output.reduce((sum, f) => sum + f.size, 0))}
                  </div>
                </div>
              </div>
            </div>

            {/* Files by Type */}
            {Object.keys(summary.byType).length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700">Files by Type</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">File Type</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {Object.entries(summary.byType)
                        .sort((a, b) => b[1] - a[1])
                        .map(([type, count]) => (
                          <tr key={type} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-800">
                              <span className="font-mono text-xs">.{type}</span>
                            </td>
                            <td className="px-4 py-2 text-gray-600">{count}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* File List */}
            {allFiles.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700">All Files</h3>
                <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Name</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Type</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Size</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Folder</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {allFiles.map((file, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-800 truncate max-w-xs">{file.name}</td>
                          <td className="px-4 py-2 text-gray-600">
                            <span className="font-mono text-xs">.{getFileType(file.name)}</span>
                          </td>
                          <td className="px-4 py-2 text-gray-600">{formatFileSize(file.size)}</td>
                          <td className="px-4 py-2 text-gray-600">
                            <span className={`text-xs px-2 py-1 rounded ${
                              file.folder === 'input' ? 'bg-blue-100 text-blue-700' :
                              file.folder === 'wip' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {file.folder}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {allFiles.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                No files found in this node folder
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface DuckDBTablesDialogProps {
  workflowId: string
  nodeId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function DuckDBTablesDialog({ workflowId, nodeId, open, onOpenChange }: DuckDBTablesDialogProps) {
  const { data: duckDBData, isLoading, error, refetch } = useQuery({
    queryKey: ['duckdb-tables', workflowId, nodeId],
    queryFn: async () => {
      return apiClient.get<{
        workflow_id: string
        node_id: string
        db_path: string
        tables: Array<{
          name: string
          row_count: number
          columns: Array<{ name: string; type: string }>
          error?: string
        }>
      }>(`/v1/workflows/${workflowId}/nodes/${nodeId}/duckdb-tables`)
    },
    enabled: open && !!nodeId,
    staleTime: 30000 // Cache for 30 seconds
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>DuckDB Tables</DialogTitle>
          <DialogDescription>
            Tables in DuckDB database: {duckDBData?.db_path || 'Loading...'}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">Loading DuckDB tables...</div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-8">
            <div className="text-red-500">Error loading DuckDB tables: {error instanceof Error ? error.message : 'Unknown error'}</div>
          </div>
        )}

        {duckDBData && (
          <div className="space-y-6">
            {duckDBData.tables.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                No tables found in DuckDB database. Execute the node to create tables.
              </div>
            ) : (
              <div className="space-y-4">
                {duckDBData.tables.map((table, idx) => (
                  <div key={idx} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                        <Table className="h-5 w-5 text-cyan-600" />
                        {table.name}
                      </h3>
                      <div className="text-sm text-gray-600">
                        {table.row_count.toLocaleString()} row{table.row_count !== 1 ? 's' : ''}
                      </div>
                    </div>
                    {table.error ? (
                      <div className="text-red-500 text-sm">{table.error}</div>
                    ) : (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-gray-700">Columns:</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {table.columns.map((col, colIdx) => (
                            <div key={colIdx} className="bg-gray-50 p-2 rounded text-sm">
                              <div className="font-mono text-xs text-gray-800">{col.name}</div>
                              <div className="text-xs text-gray-500">{col.type}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

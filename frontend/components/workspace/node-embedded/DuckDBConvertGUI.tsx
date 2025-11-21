'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Database, Upload, Play, Loader2, FileText, Search, FileSpreadsheet, ArrowLeft, Download, ArrowRight, Trash2 } from 'lucide-react'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { Progress } from '@/components/ui/progress'
import { useSocket } from '@/lib/socket'

interface DuckDBConvertGUIProps {
  node: {
    id: string
    module_type: string
    config: any
  }
  workflowId: string
  onConfigUpdate?: (config: any) => void
  onProcess?: () => void
  isStandalone?: boolean
}

interface TableInfo {
  name: string
  row_count: number
  columns: Array<{ name: string; type: string }>
  error?: string
}

interface TableData {
  workflow_id: string
  node_id: string
  table_name: string
  columns: string[]
  data: Array<Record<string, any>>
  total_rows: number
  displayed_rows: number
  limit: number
  offset: number
}

export default function DuckDBConvertGUI({
  node,
  workflowId,
  onConfigUpdate,
  onProcess,
  isStandalone = false
}: DuckDBConvertGUIProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { subscribeToWorkflow, unsubscribeFromWorkflow } = useSocket()
  
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showInputFileDialog, setShowInputFileDialog] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(20) // 20 rows per page
  const [showNextNodeDialog, setShowNextNodeDialog] = useState(false)
  const [selectedNextModule, setSelectedNextModule] = useState<string>('')
  const [showExistingNodeDialog, setShowExistingNodeDialog] = useState(false)
  const [selectedExistingModule, setSelectedExistingModule] = useState<string>('')
  
  // Progress tracking
  const [uploadProgress, setUploadProgress] = useState<{ 
    progress: number
    message: string
    status: string
    speed?: string
    uploaded?: number
    total?: number
  } | null>(null)
  const uploadStartTimeRef = useRef<number | null>(null)
  const lastLoadedRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  
  // Conversion progress tracking (updated via WebSocket)
  const [conversionProgress, setConversionProgress] = useState<{ 
    progress: number
    message: string
    status: string
  } | null>(null)

  // Fetch DuckDB tables
  const { data: tablesData, refetch: refetchTables, isLoading: loadingTables } = useQuery({
    queryKey: ['duckdb-tables', workflowId, node.id],
    queryFn: async () => {
      return apiClient.get<{
        workflow_id: string
        node_id: string
        db_path: string
        tables: TableInfo[]
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/duckdb-tables`)
    },
    enabled: !!workflowId && !!node.id,
    staleTime: 30000
  })

  // Fetch table data with pagination
  const { data: tableData, isLoading: loadingTableData } = useQuery<TableData | null>({
    queryKey: ['duckdb-table-data', workflowId, node.id, selectedTable, currentPage, pageSize],
    queryFn: async (): Promise<TableData | null> => {
      if (!selectedTable) return null
      const offset = (currentPage - 1) * pageSize
      const params = new URLSearchParams({
        table_name: selectedTable,
        limit: pageSize.toString(),
        offset: offset.toString()
      })
      const result = await apiClient.get<TableData>(
        `/v1/workflows/${workflowId}/nodes/${node.id}/duckdb-table-data?${params.toString()}`
      )
      return result || null
    },
    enabled: !!selectedTable && !!workflowId && !!node.id,
    staleTime: 30000
  })

  // Fetch input files
  const { data: inputFilesData, refetch: refetchInputFiles } = useQuery({
    queryKey: ['node-files', workflowId, node.id],
    queryFn: async () => {
      return apiClient.get<{
        workflow_id: string
        node_id: string
        folders: {
          input: Array<{
            name: string
            size: number
            modified: string
            path: string
            metadata?: {
              original_filename: string
              file_type: string
              uploaded_time: string
              workflow_id: string
              node_id: string
              uuid_filename: string
              file_size: number
            }
          }>
        }
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/files`)
    },
    enabled: !!workflowId && !!node.id,
    staleTime: 30000
  })

  // File upload mutation with progress tracking
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      
      // Initialize progress tracking
      uploadStartTimeRef.current = Date.now()
      lastLoadedRef.current = 0
      lastTimeRef.current = Date.now()
      setUploadProgress({ 
        progress: 0, 
        message: 'Starting upload...', 
        status: 'uploading',
        speed: '0 MB/s',
        uploaded: 0,
        total: file.size
      })
      
      const xhr = new XMLHttpRequest()
      return new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100)
            const currentTime = Date.now()
            const timeDelta = (currentTime - lastTimeRef.current) / 1000 // seconds
            const loadedDelta = e.loaded - lastLoadedRef.current // bytes
            
            // Calculate speed
            let speed = '0 MB/s'
            if (timeDelta > 0) {
              const bytesPerSecond = loadedDelta / timeDelta
              const mbPerSecond = bytesPerSecond / (1024 * 1024)
              speed = `${mbPerSecond.toFixed(2)} MB/s`
            }
            
            // Calculate time remaining
            const elapsed = (currentTime - (uploadStartTimeRef.current || currentTime)) / 1000
            const remainingBytes = e.total - e.loaded
            let timeRemaining = ''
            if (e.loaded > 0 && elapsed > 0) {
              const avgSpeed = e.loaded / elapsed
              const remainingSeconds = remainingBytes / avgSpeed
              if (remainingSeconds < 60) {
                timeRemaining = `${Math.round(remainingSeconds)}s remaining`
              } else {
                const minutes = Math.floor(remainingSeconds / 60)
                const seconds = Math.round(remainingSeconds % 60)
                timeRemaining = `${minutes}m ${seconds}s remaining`
              }
            }
            
            const uploadedMB = (e.loaded / (1024 * 1024)).toFixed(2)
            const totalMB = (e.total / (1024 * 1024)).toFixed(2)
            
            setUploadProgress({ 
              progress, 
              message: timeRemaining || `Uploading... ${uploadedMB} MB / ${totalMB} MB`, 
              status: 'uploading',
              speed,
              uploaded: e.loaded,
              total: e.total
            })
            
            lastLoadedRef.current = e.loaded
            lastTimeRef.current = currentTime
          }
        })
        
        xhr.addEventListener('load', () => {
          if (xhr.status === 200 || xhr.status === 201) {
            setUploadProgress({ 
              progress: 100, 
              message: 'Upload complete!', 
              status: 'completed',
              speed: '0 MB/s'
            })
            setTimeout(() => setUploadProgress(null), 2000)
            try {
              const response = JSON.parse(xhr.responseText)
              resolve(response)
            } catch (e) {
              // If response is not JSON, create a response object
              resolve({ storage_key: xhr.responseText, filename: file.name })
            }
          } else {
            setUploadProgress(null)
            let errorMessage = 'Upload failed'
            try {
              const errorData = JSON.parse(xhr.responseText)
              errorMessage = errorData.detail || errorData.message || errorMessage
            } catch (e) {
              errorMessage = xhr.statusText || errorMessage
            }
            reject(new Error(errorMessage))
          }
        })
        
        xhr.addEventListener('error', () => {
          setUploadProgress(null)
          reject(new Error('Network error during upload'))
        })
        
        xhr.addEventListener('abort', () => {
          setUploadProgress(null)
          reject(new Error('Upload cancelled'))
        })
        
        const token = localStorage.getItem('access_token')
        // Use the same URL format as apiClient (without /api prefix since it's added by the proxy)
        xhr.open('POST', `/api/v1/workflows/${workflowId}/nodes/${node.id}/upload`)
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        }
        // Don't set Content-Type - browser will set it automatically with boundary for FormData
        xhr.send(formData)
      })
    },
    onSuccess: () => {
      refetchInputFiles()
      toast.success('File uploaded successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to upload file')
    }
  })

  // Subscribe to WebSocket updates for conversion progress
  useEffect(() => {
    if (!workflowId) return

    const handleWorkflowUpdate = (data: any) => {
      // Listen for conversion progress updates
      if (data.type === 'node_conversion_progress' && data.node_id === node.id) {
        setConversionProgress({
          progress: data.progress || 0,
          message: data.message || 'Processing...',
          status: data.status || 'processing'
        })

        // Handle completion
        if (data.status === 'completed') {
          queryClient.invalidateQueries({ queryKey: ['duckdb-tables', workflowId, node.id] })
          // Clear progress after a delay
          setTimeout(() => {
            setConversionProgress(null)
          }, 2000)
        }

        // Handle errors
        if (data.status === 'error') {
          // Clear error progress after a delay
          setTimeout(() => {
            setConversionProgress(null)
          }, 3000)
        }
      }
    }

    subscribeToWorkflow(workflowId, handleWorkflowUpdate)

    return () => {
      unsubscribeFromWorkflow(workflowId)
    }
  }, [workflowId, node.id, subscribeToWorkflow, unsubscribeFromWorkflow, queryClient])

  // Execute DuckDB conversion mutation
  const executeMutation = useMutation({
    mutationFn: async () => {
      // Progress will be updated via WebSocket, so we just start the conversion
      return apiClient.post<{
        workflow_id: string
        node_id: string
        converted_tables: Array<{
          table_name: string
          source_file: string
          sheet: string
          rows: number
          columns: string[]
        }>
        db_path: string
        summary: {
          files_collected: number
          tables_created: number
          errors: number
        }
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/execute-duckdb`)
    },
    onSuccess: (data) => {
      // Progress updates come via WebSocket, so we just handle the success case
      queryClient.invalidateQueries({ queryKey: ['duckdb-tables', workflowId, node.id] })
      toast.success(`Conversion complete! Created ${data.summary.tables_created} tables.`)
      // Auto-select first table if available
      if (data.converted_tables && data.converted_tables.length > 0) {
        setSelectedTable(data.converted_tables[0].table_name)
      }
    },
    onError: (error: any) => {
      // Error progress updates come via WebSocket, but we still show the error toast
      toast.error(error.message || 'Failed to execute conversion')
    }
  })

  // Download DuckDB file mutation
  const downloadDuckDBMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/v1/workflows/${workflowId}/nodes/${node.id}/download-duckdb`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to download file' }))
        throw new Error(errorData.detail || 'Failed to download file')
      }
      
      return await response.blob()
    },
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // Extract filename from db_path if available, otherwise use default
      const filename = tablesData?.db_path 
        ? tablesData.db_path.split('/').pop() || 'converted.duckdb'
        : 'converted.duckdb'
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('DuckDB file downloaded successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to download file')
    }
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.name.match(/\.(xlsx|xls)$/i)) {
        toast.error('Please select a valid Excel file (.xlsx or .xls)')
        return
      }
      uploadMutation.mutate(file)
      e.target.value = ''
    }
  }

  const handleSwitchInputFile = () => {
    setShowInputFileDialog(true)
    refetchInputFiles()
  }

  const handleSelectInputFile = (file: { path: string; metadata?: any }) => {
    setShowInputFileDialog(false)
    // File is selected, user can now execute conversion
  }

  // Delete file mutation
  const deleteFileMutation = useMutation({
    mutationFn: async (filePath: string) => {
      await apiClient.delete(`/v1/workflows/${workflowId}/nodes/${node.id}/files/${filePath}`)
    },
    onSuccess: () => {
      toast.success('File deleted successfully')
      // Refresh file list
      refetchInputFiles()
    },
    onError: (error: any) => {
      toast.error(`Failed to delete file: ${error.message || 'Unknown error'}`)
    }
  })

  const handleDeleteFile = (e: React.MouseEvent, file: { path: string; name: string }) => {
    e.stopPropagation() // Prevent triggering file selection
    if (confirm(`Are you sure you want to delete "${file.name}"? This action cannot be undone.`)) {
      deleteFileMutation.mutate(file.path)
    }
  }

  const handleExecute = () => {
    executeMutation.mutate()
  }

  // Auto-select first table when tables load
  useEffect(() => {
    if (tablesData?.tables && tablesData.tables.length > 0 && !selectedTable) {
      setSelectedTable(tablesData.tables[0].name)
    }
  }, [tablesData, selectedTable])

  // Reset to page 1 when table changes
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedTable])

  // Reset to page 1 when search query changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  // Calculate pagination info
  const totalPages = tableData?.total_rows ? Math.ceil(tableData.total_rows / pageSize) : 0
  const startRow = (currentPage - 1) * pageSize + 1
  const endRow = Math.min(currentPage * pageSize, tableData?.total_rows || 0)

  const filteredTableData = tableData?.data ? (() => {
    if (!searchQuery.trim()) return tableData.data
    
    const query = searchQuery.toLowerCase()
    return tableData.data.filter((row: Record<string, any>) => {
      return tableData.columns.some((col: string) => {
        const value = row[col]
        if (value === null || value === undefined) return false
        return String(value).toLowerCase().includes(query)
      })
    })
  })() : []

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1)
    }
  }

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }

  // Move to next node mutation
  const moveToNextNodeMutation = useMutation({
    mutationFn: async (nextModuleType: string) => {
      return apiClient.post<{
        workflow_id: string
        source_node_id: string
        new_node_id: string
        new_node_module_type: string
        file_copied: string
        original_filename: string
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/move-to-next-node`, {
        next_module_type: nextModuleType
      })
    },
    onSuccess: (data) => {
      toast.success(`Created new ${data.new_node_module_type} node and moved file`)
      // Open new window with the module interface and auto-select the file
      const newUrl = `/modules/${data.new_node_module_type}?workflow=${data.workflow_id}&node=${data.new_node_id}&file=${encodeURIComponent(data.file_copied)}`
      window.open(newUrl, '_blank')
      setShowNextNodeDialog(false)
      setSelectedNextModule('')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to move to next node')
    }
  })

  const handleMoveToNextNode = () => {
    if (!selectedNextModule) {
      toast.error('Please select a module')
      return
    }
    if (!tablesData?.tables || tablesData.tables.length === 0) {
      toast.error('No converted data available. Please execute conversion first.')
      return
    }
    moveToNextNodeMutation.mutate(selectedNextModule)
  }

  // Fetch nodes by module type in current workflow
  const { data: existingNodes, refetch: refetchExistingNodes } = useQuery<Array<{
    id: string
    workflow_id: string
    module_type: string
    checkpoint_name?: string
  }>>({
    queryKey: ['workflow-nodes-by-module', workflowId, selectedExistingModule],
    queryFn: async () => {
      if (!selectedExistingModule) return []
      return apiClient.get(`/v1/workflows/${workflowId}/nodes?module_type=${selectedExistingModule}`)
    },
    enabled: !!workflowId && !!selectedExistingModule,
    staleTime: 30000
  })

  // Move to existing node mutation
  const moveToExistingNodeMutation = useMutation({
    mutationFn: async (targetNodeId: string) => {
      return apiClient.post<{
        workflow_id: string
        source_node_id: string
        target_node_id: string
        target_node_module_type: string
        file_copied: string
        original_filename: string
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/move-to-existing-node`, {
        target_node_id: targetNodeId
      })
    },
    onSuccess: (data) => {
      toast.success(`Moved file to existing ${data.target_node_module_type} node`)
      // Open new window with the module interface and auto-select the file
      const newUrl = `/modules/${data.target_node_module_type}?workflow=${data.workflow_id}&node=${data.target_node_id}&file=${encodeURIComponent(data.file_copied)}`
      window.open(newUrl, '_blank')
      setShowExistingNodeDialog(false)
      setSelectedExistingModule('')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to move to existing node')
    }
  })

  const handleMoveToExistingNode = (targetNodeId: string) => {
    if (!tablesData?.tables || tablesData.tables.length === 0) {
      toast.error('No converted data available. Please execute conversion first.')
      return
    }
    moveToExistingNodeMutation.mutate(targetNodeId)
  }

  return (
    <div className={`${isStandalone ? 'h-full' : 'h-screen'} flex flex-col bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50`}>
      {/* Top Menu Bar - macOS style with frosted glass */}
      <div className="bg-white/70 backdrop-blur-xl border-b border-white/20 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          {isStandalone && (
            <Link href="/modules">
              <Button 
                variant="outline" 
                size="sm"
                className="rounded-full bg-white/60 backdrop-blur-sm border-white/30 hover:bg-white/80 hover:border-white/50 shadow-sm transition-all duration-200"
              >
                <div className="rounded-full bg-gradient-to-br from-blue-400 to-blue-500 p-1.5 mr-2">
                  <ArrowLeft className="h-3 w-3 text-white" />
                </div>
                <span className="font-medium">Back to Modules</span>
              </Button>
            </Link>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSwitchInputFile}
            className="rounded-full bg-white/60 backdrop-blur-sm border-white/30 hover:bg-white/80 hover:border-white/50 shadow-sm transition-all duration-200 flex items-center space-x-2"
          >
            <div className="rounded-full bg-gradient-to-br from-purple-400 to-purple-500 p-1.5">
              <FileText className="h-3 w-3 text-white" />
            </div>
            <span className="font-medium">Switch Input File</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleExecute}
            disabled={executeMutation.isPending}
            className="rounded-full bg-gradient-to-r from-green-400 to-emerald-500 text-white border-0 hover:from-green-500 hover:to-emerald-600 shadow-md hover:shadow-lg transition-all duration-200 flex items-center space-x-2"
          >
            {executeMutation.isPending ? (
              <>
                <div className="rounded-full bg-white/20 p-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                </div>
                <span className="font-medium">Converting...</span>
              </>
            ) : (
              <>
                <div className="rounded-full bg-white/20 p-1.5">
                  <Play className="h-3 w-3" />
                </div>
                <span className="font-medium">Execute Conversion</span>
              </>
            )}
          </Button>
          {tablesData?.tables && tablesData.tables.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadDuckDBMutation.mutate()}
                disabled={downloadDuckDBMutation.isPending}
                className="rounded-full bg-white/60 backdrop-blur-sm border-white/30 hover:bg-white/80 hover:border-white/50 shadow-sm transition-all duration-200 flex items-center space-x-2"
              >
                <div className="rounded-full bg-gradient-to-br from-cyan-400 to-cyan-500 p-1.5">
                  {downloadDuckDBMutation.isPending ? (
                    <Loader2 className="h-3 w-3 text-white animate-spin" />
                  ) : (
                    <Download className="h-3 w-3 text-white" />
                  )}
                </div>
                <span className="font-medium">Download DuckDB</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNextNodeDialog(true)}
                className="rounded-full bg-white/60 backdrop-blur-sm border-white/30 hover:bg-white/80 hover:border-white/50 shadow-sm transition-all duration-200 flex items-center space-x-2"
              >
                <div className="rounded-full bg-gradient-to-br from-orange-400 to-orange-500 p-1.5">
                  <ArrowRight className="h-3 w-3 text-white" />
                </div>
                <span className="font-medium">Move to Next Node</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowExistingNodeDialog(true)
                  setSelectedExistingModule('')
                }}
                className="rounded-full bg-white/60 backdrop-blur-sm border-white/30 hover:bg-white/80 hover:border-white/50 shadow-sm transition-all duration-200 flex items-center space-x-2"
              >
                <div className="rounded-full bg-gradient-to-br from-indigo-400 to-indigo-500 p-1.5">
                  <ArrowRight className="h-3 w-3 text-white" />
                </div>
                <span className="font-medium">Move to Existing Node</span>
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {tablesData?.db_path && (
            <span className="text-sm text-gray-700 flex items-center space-x-2 bg-white/50 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/30 shadow-sm">
              <div className="rounded-full bg-gradient-to-br from-indigo-400 to-indigo-500 p-1">
                <Database className="h-3 w-3 text-white" />
              </div>
              <span className="font-medium">{tablesData.db_path.split('/').pop()}</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden p-4 gap-4">
        {/* Left Panel - Tables List */}
        <div className="w-80 bg-white/60 backdrop-blur-xl border border-white/30 rounded-2xl shadow-lg flex flex-col overflow-hidden">
          {loadingTables ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-blue-500 border-t-transparent mx-auto mb-3"></div>
                <p className="text-sm text-gray-700 font-medium">Loading tables...</p>
              </div>
            </div>
          ) : !tablesData || tablesData.tables.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <div className="rounded-full bg-gradient-to-br from-blue-200 to-purple-200 p-4 mx-auto mb-4 w-20 h-20 flex items-center justify-center">
                  <Database className="h-10 w-10 text-blue-500" />
                </div>
                <p className="text-gray-700 mb-2 font-medium">No tables found</p>
                <p className="text-sm text-gray-500">Execute conversion to create tables</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="border-b border-white/30 p-5 bg-gradient-to-r from-blue-50/50 to-purple-50/50 backdrop-blur-sm">
                <div className="flex items-center space-x-3 mb-2">
                  <div className="rounded-full bg-gradient-to-br from-blue-500 to-purple-500 p-2">
                    <Database className="h-4 w-4 text-white" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-800">Tables</h3>
                </div>
                <p className="text-xs text-gray-600 ml-11">
                  {tablesData.tables.length} table{tablesData.tables.length !== 1 ? 's' : ''} found
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <div className="space-y-2">
                  {tablesData.tables.map((table) => (
                    <button
                      key={table.name}
                      onClick={() => setSelectedTable(table.name)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 ${
                        selectedTable === table.name
                          ? 'bg-gradient-to-r from-blue-400/20 to-purple-400/20 border-blue-300/50 shadow-md backdrop-blur-sm'
                          : 'bg-white/40 border-white/30 hover:bg-white/60 hover:border-white/50 hover:shadow-sm backdrop-blur-sm'
                      }`}
                    >
                      <div className="flex items-center space-x-2 mb-1">
                        <div className={`rounded-full p-1.5 ${
                          selectedTable === table.name
                            ? 'bg-gradient-to-br from-blue-500 to-purple-500'
                            : 'bg-gradient-to-br from-gray-300 to-gray-400'
                        }`}>
                          <FileSpreadsheet className="h-3 w-3 text-white" />
                        </div>
                        <div className="font-semibold text-sm text-gray-800">{table.name}</div>
                      </div>
                      {table.error ? (
                        <div className="text-xs text-red-500 mt-1 ml-8">Error: {table.error}</div>
                      ) : (
                        <div className="text-xs text-gray-600 mt-1 ml-8">
                          {table.row_count.toLocaleString()} row{table.row_count !== 1 ? 's' : ''} • {table.columns.length} column{table.columns.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Table Viewer */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white/60 backdrop-blur-xl border border-white/30 rounded-2xl shadow-lg">
          {!selectedTable ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="rounded-full bg-gradient-to-br from-blue-200 via-purple-200 to-pink-200 p-6 mx-auto mb-4 w-28 h-28 flex items-center justify-center">
                  <Database className="h-14 w-14 text-blue-500" />
                </div>
                <p className="text-lg font-semibold text-gray-700 mb-2">No table selected</p>
                <p className="text-sm text-gray-500">Select a table from the left panel to view data</p>
              </div>
            </div>
          ) : loadingTableData ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-14 w-14 border-[3px] border-blue-500 border-t-transparent mx-auto mb-4"></div>
                <p className="text-gray-700 font-medium">Loading table data...</p>
              </div>
            </div>
          ) : !tableData || !tableData.data || tableData.data.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="rounded-full bg-gradient-to-br from-orange-200 to-red-200 p-4 mx-auto mb-4 w-20 h-20 flex items-center justify-center">
                  <FileSpreadsheet className="h-10 w-10 text-orange-500" />
                </div>
                <p className="text-gray-700 font-medium">No data available in table "{selectedTable}"</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Table Header and Search Bar */}
              <div className="border-b border-white/30 px-6 py-4 space-y-3 bg-gradient-to-r from-blue-50/50 to-purple-50/50 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="rounded-full bg-gradient-to-br from-green-500 to-emerald-500 p-2">
                      <FileSpreadsheet className="h-4 w-4 text-white" />
                    </div>
                    <h3 className="text-sm font-bold text-gray-800">{selectedTable}</h3>
                  </div>
                  <span className="text-xs text-gray-600 bg-white/60 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/30 font-medium">
                    {tableData.total_rows.toLocaleString()} total row{tableData.total_rows !== 1 ? 's' : ''}
                  </span>
                </div>
                {/* Search Bar */}
                <div className="relative">
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                    <div className="rounded-full bg-gradient-to-br from-cyan-400 to-cyan-500 p-1.5">
                      <Search className="h-3.5 w-3.5 text-white" />
                    </div>
                  </div>
                  <Input
                    type="text"
                    placeholder="Search values in table..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-11 h-10 text-sm rounded-full bg-white/70 backdrop-blur-sm border-white/30 focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-auto p-4">
                <div className="border border-white/30 rounded-2xl overflow-x-auto bg-white/40 backdrop-blur-sm shadow-inner">
                  <table className="min-w-full text-sm border-collapse">
                    <thead className="bg-gradient-to-r from-blue-100/60 to-purple-100/60 backdrop-blur-sm sticky top-0">
                      <tr>
                        {tableData.columns.map((col: string, colIdx: number) => (
                          <th
                            key={colIdx}
                            className="border border-white/30 px-4 py-3 text-left font-bold text-gray-700"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTableData.length === 0 ? (
                        <tr>
                          <td
                            colSpan={tableData.columns.length}
                            className="border border-white/30 px-4 py-12 text-center text-gray-500"
                          >
                            {searchQuery.trim() 
                              ? `No results found for "${searchQuery}"` 
                              : 'No data to display'}
                          </td>
                        </tr>
                      ) : (
                        filteredTableData.map((row: Record<string, any>, rowIdx: number) => (
                          <tr key={rowIdx} className="hover:bg-white/60 transition-colors duration-150">
                            {tableData.columns.map((col: string, colIdx: number) => {
                              const cellValue = row[col]
                              const cellStr = cellValue !== null && cellValue !== undefined
                                ? String(cellValue)
                                : ''
                              const isMatch = searchQuery.trim() && cellStr.toLowerCase().includes(searchQuery.toLowerCase())
                              
                              return (
                                <td
                                  key={colIdx}
                                  className={`border border-white/30 px-4 py-2.5 text-gray-800 ${
                                    isMatch ? 'bg-gradient-to-r from-yellow-200/60 to-orange-200/60 font-semibold backdrop-blur-sm' : ''
                                  }`}
                                >
                                  {cellStr}
                                </td>
                              )
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  {/* Pagination Controls */}
                  <div className="bg-gradient-to-r from-gray-50/80 to-gray-100/80 backdrop-blur-sm px-6 py-4 border-t border-white/30">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-600 font-medium">
                        {searchQuery.trim() ? (
                          <>Showing {filteredTableData.length} matching row{filteredTableData.length !== 1 ? 's' : ''} (of {tableData.displayed_rows} displayed, {tableData.total_rows} total)</>
                        ) : (
                          <>Showing {startRow.toLocaleString()} - {endRow.toLocaleString()} of {tableData.total_rows.toLocaleString()} rows</>
                        )}
                      </div>
                      {!searchQuery.trim() && totalPages > 1 && (
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handlePreviousPage}
                            disabled={currentPage === 1}
                            className="h-8 px-3 rounded-full bg-white/60 backdrop-blur-sm border-white/30 hover:bg-white/80 disabled:opacity-50"
                          >
                            Previous
                          </Button>
                          <div className="flex items-center space-x-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                              let pageNum: number
                              if (totalPages <= 5) {
                                pageNum = i + 1
                              } else if (currentPage <= 3) {
                                pageNum = i + 1
                              } else if (currentPage >= totalPages - 2) {
                                pageNum = totalPages - 4 + i
                              } else {
                                pageNum = currentPage - 2 + i
                              }
                              
                              return (
                                <Button
                                  key={pageNum}
                                  variant={currentPage === pageNum ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => handlePageChange(pageNum)}
                                  className={`h-8 w-8 p-0 rounded-full ${
                                    currentPage === pageNum
                                      ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white border-0 shadow-md'
                                      : 'bg-white/60 backdrop-blur-sm border-white/30 hover:bg-white/80'
                                  }`}
                                >
                                  {pageNum}
                                </Button>
                              )
                            })}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleNextPage}
                            disabled={currentPage === totalPages}
                            className="h-8 px-3 rounded-full bg-white/60 backdrop-blur-sm border-white/30 hover:bg-white/80 disabled:opacity-50"
                          >
                            Next
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input File Selection Dialog */}
      <Dialog open={showInputFileDialog} onOpenChange={(open) => {
        // Prevent closing dialog during upload
        if (!open && uploadProgress && uploadProgress.status === 'uploading') {
          return
        }
        setShowInputFileDialog(open)
      }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-white/80 backdrop-blur-2xl border-white/30 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-3">
              <div className="rounded-full bg-gradient-to-br from-purple-500 to-pink-500 p-2">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold">Select Input File</span>
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              Choose an input file from the node's input folder. Files are shown with their metadata.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white border-0 hover:from-blue-600 hover:to-purple-600 shadow-md hover:shadow-lg transition-all duration-200"
              disabled={uploadProgress?.status === 'uploading'}
            >
              <div className="rounded-full bg-white/20 p-1.5 mr-2">
                <Upload className="h-4 w-4" />
              </div>
              <span className="font-medium">Upload New File</span>
            </Button>
            {uploadProgress && uploadProgress.status === 'uploading' && (
              <div className="p-5 bg-gradient-to-r from-blue-50/80 to-cyan-50/80 backdrop-blur-sm rounded-2xl border border-blue-200/50 shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-blue-900">Uploading file...</span>
                  <span className="text-sm text-blue-700 font-semibold">{uploadProgress.progress}%</span>
                </div>
                <Progress value={uploadProgress.progress} className="h-2.5 mb-3 rounded-full" />
                <div className="flex items-center justify-between text-xs">
                  <p className="text-blue-600 font-medium">{uploadProgress.message}</p>
                  {uploadProgress.speed && (
                    <p className="text-blue-600 font-bold">{uploadProgress.speed}</p>
                  )}
                </div>
              </div>
            )}
            {inputFilesData?.folders?.input && inputFilesData.folders.input.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-800 flex items-center space-x-2">
                  <div className="rounded-full bg-gradient-to-br from-green-400 to-emerald-500 p-1.5">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span>Existing Input Files:</span>
                </h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {inputFilesData.folders.input.map((file) => (
                    <div
                      key={file.name}
                      className="relative w-full px-5 py-4 rounded-2xl border border-white/30 bg-white/60 backdrop-blur-sm hover:bg-white/80 hover:border-white/50 transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      <button
                        onClick={() => handleSelectInputFile(file)}
                        className="w-full text-left pr-10"
                      >
                        <div className="flex items-start space-x-3">
                          <div className="rounded-full bg-gradient-to-br from-orange-400 to-pink-500 p-2.5 mt-0.5">
                            <FileSpreadsheet className="h-4 w-4 text-white" />
                          </div>
                          <div className="flex-1">
                            {file.metadata ? (
                              <>
                                <div className="font-semibold text-gray-900">{file.metadata.original_filename}</div>
                                <div className="text-xs text-gray-600 mt-2 space-y-1">
                                  <div className="flex items-center space-x-2">
                                    <span className="font-medium">Type:</span>
                                    <span className="bg-blue-100/60 text-blue-700 px-2 py-0.5 rounded-full text-xs">{file.metadata.file_type}</span>
                                  </div>
                                  <div>Uploaded: {new Date(file.metadata.uploaded_time).toLocaleString()}</div>
                                  <div>Size: {(file.metadata.file_size / 1024).toFixed(2)} KB</div>
                                  <div className="text-gray-500">UUID: {file.metadata.uuid_filename}</div>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="font-semibold text-gray-900">{file.name}</div>
                                <div className="text-xs text-gray-600 mt-2">
                                  Size: {(file.size / 1024).toFixed(2)} KB
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={(e) => handleDeleteFile(e, file)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white hover:bg-gradient-to-br hover:from-red-400 hover:to-red-500 rounded-full transition-all duration-200 shadow-sm hover:shadow-md"
                        title="Delete file"
                        disabled={deleteFileMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="rounded-full bg-gradient-to-br from-gray-200 to-gray-300 p-4 mx-auto mb-3 w-16 h-16 flex items-center justify-center">
                  <FileSpreadsheet className="h-8 w-8 text-gray-400" />
                </div>
                <p className="text-sm text-gray-600 font-medium">No input files found. Upload a file to get started.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Move to Next Node Dialog */}
      <Dialog open={showNextNodeDialog} onOpenChange={setShowNextNodeDialog}>
        <DialogContent className="max-w-md bg-white/80 backdrop-blur-2xl border-white/30 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-3">
              <div className="rounded-full bg-gradient-to-br from-orange-500 to-red-500 p-2">
                <ArrowRight className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold">Move to Next Node</span>
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              Select a compatible module to create a new node and move the processed DuckDB file to it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="next-module" className="text-gray-700 font-semibold">Select Module</Label>
              <Select value={selectedNextModule} onValueChange={setSelectedNextModule}>
                <SelectTrigger id="next-module" className="rounded-xl bg-white/70 backdrop-blur-sm border-white/30">
                  <SelectValue placeholder="Choose a module..." />
                </SelectTrigger>
                <SelectContent className="bg-white/90 backdrop-blur-xl border-white/30 rounded-xl">
                  <SelectItem value="outlier_remover_duckdb" className="rounded-lg">Outlier Remover (DuckDB)</SelectItem>
                  <SelectItem value="duckdb2jmp" className="rounded-lg">DuckDB to JMP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end space-x-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowNextNodeDialog(false)
                  setSelectedNextModule('')
                }}
                className="rounded-full bg-white/60 backdrop-blur-sm border-white/30 hover:bg-white/80"
              >
                Cancel
              </Button>
              <Button
                onClick={handleMoveToNextNode}
                disabled={!selectedNextModule || moveToNextNodeMutation.isPending}
                className="rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white border-0 hover:from-orange-600 hover:to-red-600 shadow-md hover:shadow-lg transition-all duration-200"
              >
                {moveToNextNodeMutation.isPending ? (
                  <>
                    <div className="rounded-full bg-white/20 p-1 mr-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    </div>
                    <span className="font-medium">Creating...</span>
                  </>
                ) : (
                  <>
                    <div className="rounded-full bg-white/20 p-1 mr-2">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                    <span className="font-medium">Create Node</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move to Existing Node Dialog */}
      <Dialog open={showExistingNodeDialog} onOpenChange={setShowExistingNodeDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-white/80 backdrop-blur-2xl border-white/30 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-3">
              <div className="rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 p-2">
                <ArrowRight className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold">Move to Existing Node</span>
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              Select a module type, then choose an existing node in the current workflow to move the processed DuckDB file to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="existing-module" className="text-gray-700 font-semibold">Select Module Type</Label>
              <Select 
                value={selectedExistingModule} 
                onValueChange={(value) => {
                  setSelectedExistingModule(value)
                }}
              >
                <SelectTrigger id="existing-module" className="rounded-xl bg-white/70 backdrop-blur-sm border-white/30">
                  <SelectValue placeholder="Choose a module type..." />
                </SelectTrigger>
                <SelectContent className="bg-white/90 backdrop-blur-xl border-white/30 rounded-xl">
                  <SelectItem value="outlier_remover_duckdb" className="rounded-lg">Outlier Remover (DuckDB)</SelectItem>
                  <SelectItem value="duckdb2jmp" className="rounded-lg">DuckDB to JMP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {selectedExistingModule && (
              <div className="space-y-2">
                <Label className="text-gray-700 font-semibold">Select Node</Label>
                {existingNodes && existingNodes.length > 0 ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto border border-white/30 rounded-xl p-3 bg-white/40 backdrop-blur-sm">
                    {existingNodes.map((existingNode) => (
                      <button
                        key={existingNode.id}
                        onClick={() => handleMoveToExistingNode(existingNode.id)}
                        disabled={moveToExistingNodeMutation.isPending || existingNode.id === node.id}
                        className="w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 bg-white/60 backdrop-blur-sm border-white/30 hover:bg-white/80 hover:border-white/50 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div className="rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 p-1.5">
                              <Database className="h-3 w-3 text-white" />
                            </div>
                            <div>
                              <div className="font-semibold text-sm text-gray-800">
                                {existingNode.checkpoint_name || `${existingNode.module_type} Node`}
                              </div>
                              <div className="text-xs text-gray-600 mt-1">
                                ID: {existingNode.id.substring(0, 8)}...
                              </div>
                            </div>
                          </div>
                          {moveToExistingNodeMutation.isPending && (
                            <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 border border-white/30 rounded-xl bg-white/40 backdrop-blur-sm">
                    <div className="rounded-full bg-gradient-to-br from-gray-200 to-gray-300 p-4 mx-auto mb-3 w-16 h-16 flex items-center justify-center">
                      <Database className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-600 font-medium">
                      No {selectedExistingModule} nodes found in this workflow
                    </p>
                  </div>
                )}
              </div>
            )}
            
            <div className="flex justify-end space-x-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowExistingNodeDialog(false)
                  setSelectedExistingModule('')
                }}
                className="rounded-full bg-white/60 backdrop-blur-sm border-white/30 hover:bg-white/80"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Conversion Progress Dialog */}
      <Dialog 
        open={!!conversionProgress && conversionProgress.status === 'processing'} 
        onOpenChange={() => {
          // Prevent closing during conversion
          if (conversionProgress?.status === 'processing') {
            return
          }
        }}
      >
        <DialogContent className="max-w-md bg-white/80 backdrop-blur-2xl border-white/30 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-3">
              <div className="rounded-full bg-gradient-to-br from-green-500 to-emerald-500 p-2">
                <Loader2 className="h-5 w-5 text-white animate-spin" />
              </div>
              <span className="text-xl font-bold">Converting Files</span>
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              Please wait while files are being converted to DuckDB format...
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-700 font-medium">{conversionProgress?.message || 'Processing...'}</span>
                <span className="text-gray-700 font-bold">{conversionProgress?.progress || 0}%</span>
              </div>
              <Progress value={conversionProgress?.progress || 0} className="h-3 rounded-full" />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Progress Dialog */}
      <Dialog 
        open={!!uploadProgress && uploadProgress.status === 'uploading'} 
        onOpenChange={() => {
          // Prevent closing during upload
          if (uploadProgress?.status === 'uploading') {
            return
          }
        }}
      >
        <DialogContent className="max-w-md bg-white/80 backdrop-blur-2xl border-white/30 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-3">
              <div className="rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 p-2">
                <Upload className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold">Uploading File</span>
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              Please wait while your file is being uploaded. This may take a while for large files.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-700 font-medium">Progress</span>
                <span className="font-bold text-gray-900">{uploadProgress?.progress || 0}%</span>
              </div>
              <Progress value={uploadProgress?.progress || 0} className="h-3 rounded-full" />
            </div>
            <div className="space-y-2 bg-gradient-to-r from-blue-50/60 to-cyan-50/60 backdrop-blur-sm p-4 rounded-xl border border-blue-200/50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-700 font-medium">Speed</span>
                <span className="font-bold text-blue-600">{uploadProgress?.speed || '0 MB/s'}</span>
              </div>
              {uploadProgress?.uploaded && uploadProgress?.total && (
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span className="font-medium">
                    {(uploadProgress.uploaded / (1024 * 1024)).toFixed(2)} MB / {(uploadProgress.total / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
              )}
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-700 font-medium">{uploadProgress?.message || 'Uploading...'}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}


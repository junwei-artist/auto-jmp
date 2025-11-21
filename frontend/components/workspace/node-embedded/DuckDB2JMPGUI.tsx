'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Database, Upload, Play, Loader2, FileText, ArrowLeft, Search, Download, Check, FileSpreadsheet, ArrowUp, ArrowDown, GripVertical, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface DuckDB2JMPGUIProps {
  node: {
    id: string
    module_type: string
    config: any
  }
  workflowId: string
  onConfigUpdate?: (config: any) => void
  onProcess?: () => void
  isStandalone?: boolean
  autoSelectFile?: string  // File path to auto-select when component loads
}

interface JSLCSVPair {
  pair_id: string
  table_name: string
  pair_folder: string
  csv_path: string
  jsl_path: string
  csv_filename: string
  jsl_filename: string
  metadata: any
}

export default function DuckDB2JMPGUI({
  node,
  workflowId,
  onConfigUpdate,
  onProcess,
  isStandalone = false,
  autoSelectFile
}: DuckDB2JMPGUIProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [selectedPair, setSelectedPair] = useState<JSLCSVPair | null>(null)
  const [catVar, setCatVar] = useState<string>(node.config?.cat_var || 'Stage')
  const [colorBy, setColorBy] = useState<string>(node.config?.color_by || '')
  const [chunkSize, setChunkSize] = useState<number>(node.config?.chunk_size || 100000)
  const [showInputFileDialog, setShowInputFileDialog] = useState(false)
  const [uploadedFileKey, setUploadedFileKey] = useState<string | null>(node.config?.file_key || null)
  const [selectedTables, setSelectedTables] = useState<string[]>(node.config?.selected_tables || [])
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'original' | 'processed'>('original')
  const [selectedTableName, setSelectedTableName] = useState<string>('')
  const [tableSearchQuery, setTableSearchQuery] = useState('')
  const [catVarOrder, setCatVarOrder] = useState<string[]>(node.config?.cat_var_order || [])
  const [tablePage, setTablePage] = useState<number>(1)
  const [csvPage, setCsvPage] = useState<number>(1)
  const rowsPerPage = 20

  // Section expand/collapse states
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(true)
  const [isCatVarSettingsExpanded, setIsCatVarSettingsExpanded] = useState(true)
  const [isCaptionBoxExpanded, setIsCaptionBoxExpanded] = useState(true)
  const [isTablesExpanded, setIsTablesExpanded] = useState(true)
  const [isPairsExpanded, setIsPairsExpanded] = useState(true)

  // Available statistics for caption box
  const availableStatistics = [
    { value: 'Mean', label: 'Mean', legend: 12 },
    { value: 'Min', label: 'Min', legend: 12 },
    { value: 'Median', label: 'Median', legend: 12 },
    { value: 'Max', label: 'Max', legend: 12 },
    { value: 'Std Dev', label: 'Std Dev', legend: 13 },
    { value: 'N', label: 'N (Count)', legend: 12 }
  ]
  
  // Initialize caption box statistics from config or use defaults
  const [captionBoxStatistics, setCaptionBoxStatistics] = useState<Array<{value: string, label: string, legend: number}>>(
    node.config?.caption_box_statistics && node.config.caption_box_statistics.length > 0
      ? node.config.caption_box_statistics.map((stat: string) => {
          const found = availableStatistics.find(s => s.value === stat)
          return found || { value: stat, label: stat, legend: 12 }
        })
      : availableStatistics // Default: all statistics
  )

  // Fetch workflow data
  const { data: workflowData } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: async () => {
      return apiClient.get<{
        id: string
        name: string
        description?: string
      }>(`/v1/workflows/${workflowId}`)
    },
    enabled: !!workflowId,
    staleTime: 30000
  })

  // Fetch DuckDB tables
  const { data: tablesData, refetch: refetchTables, isLoading: loadingTables } = useQuery({
    queryKey: ['duckdb-tables', workflowId, node.id],
    queryFn: async () => {
      return apiClient.get<{
        workflow_id: string
        node_id: string
        db_path: string
        tables: Array<{
          name: string
          row_count: number
          columns: Array<{ name: string; type: string }>
        }>
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/duckdb-tables`)
    },
    enabled: !!workflowId && !!node.id && !!uploadedFileKey,
    staleTime: 30000
  })

  // Find the "data" table and get its columns
  const dataTable = useMemo(() => {
    if (!tablesData?.tables) return null
    return tablesData.tables.find(t => t.name.toLowerCase() === 'data')
  }, [tablesData])

  // Get available categorical columns from the "data" table
  const availableCatColumns = useMemo(() => {
    if (!dataTable?.columns) return []
    
    // Filter columns that start with "category_" or are named "Stage" (case-insensitive)
    const stageCol = dataTable.columns.find(col => col.name.toLowerCase() === 'stage')
    const stageColName = stageCol ? stageCol.name : null
    
    return dataTable.columns
      .filter(col => {
        const colName = col.name
        return colName.toLowerCase().startsWith('category_') || colName.toLowerCase() === 'stage'
      })
      .map(col => col.name)
      .sort((a, b) => {
        // Put "Stage" (case-insensitive) first if it exists
        if (a.toLowerCase() === 'stage') return -1
        if (b.toLowerCase() === 'stage') return 1
        return a.localeCompare(b)
      })
  }, [dataTable])

  // Auto-set categorical variable to "Stage" (case-insensitive) if available, otherwise first category_ column
  useEffect(() => {
    if (availableCatColumns.length > 0) {
      // Only auto-set if catVar is not already set or is not in the available columns
      if (!catVar || !availableCatColumns.includes(catVar)) {
        const defaultCol = availableCatColumns.find(col => col.toLowerCase() === 'stage') || availableCatColumns[0]
        setCatVar(defaultCol)
      }
    }
  }, [availableCatColumns, catVar])

  // Fetch unique values for categorical variable
  const { data: catVarUniqueValuesData } = useQuery({
    queryKey: ['duckdb-column-unique-values', workflowId, node.id, catVar, dataTable?.name],
    queryFn: async () => {
      if (!catVar || !dataTable) return null
      
      const params = new URLSearchParams({
        column_name: catVar,
        table_name: dataTable.name
      })
      
      return apiClient.get<{
        workflow_id: string
        node_id: string
        table_name: string
        column_name: string
        unique_values: string[]
        count: number
        total_rows: number
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/duckdb-column-unique-values?${params.toString()}`)
    },
    enabled: !!catVar && !!dataTable && !!workflowId && !!node.id && !!uploadedFileKey,
    staleTime: 30000
  })

  // Extract unique values from the API response
  const catVarUniqueValues = useMemo(() => {
    if (catVarUniqueValuesData?.unique_values) {
      return catVarUniqueValuesData.unique_values
    }
    return []
  }, [catVarUniqueValuesData])

  // Track the last categorical variable to detect changes
  const prevCatVarRef = useRef<string>(catVar)
  
  // Initialize catVarOrder when catVar or values change
  useEffect(() => {
    const catVarChanged = prevCatVarRef.current !== catVar
    
    if (catVarUniqueValues.length > 0) {
      // If categorical variable changed, reset to default order
      if (catVarChanged) {
        setCatVarOrder([...catVarUniqueValues])
        prevCatVarRef.current = catVar
      } else if (catVarOrder.length === 0) {
        // If no order set yet, try to use saved order from config, otherwise use default
        const savedOrder = node.config?.cat_var_order || []
        if (savedOrder.length > 0 && savedOrder.every((v: string) => catVarUniqueValues.includes(v))) {
          setCatVarOrder(savedOrder)
        } else {
          setCatVarOrder([...catVarUniqueValues])
        }
      }
      // If catVarOrder already has values and catVar hasn't changed, preserve it
    } else {
      // Clear if no values available
      setCatVarOrder([])
    }
  }, [catVarUniqueValues, catVar])

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
            }
          }>
        }
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/files`)
    },
    enabled: !!workflowId && !!node.id,
    staleTime: 30000
  })

  // Auto-select file when autoSelectFile prop is provided and files are loaded
  const hasAutoSelectedRef = useRef(false)
  useEffect(() => {
    if (autoSelectFile && inputFilesData && !hasAutoSelectedRef.current && !uploadedFileKey) {
      const inputFiles = inputFilesData.folders?.input || []
      // Find file matching the autoSelectFile path (can be full path or just filename)
      const targetFile = inputFiles.find(file => {
        const filePath = file.path
        const autoSelectPath = autoSelectFile
        // Match exact path or match by filename
        return filePath === autoSelectPath || 
               filePath.endsWith(autoSelectPath) || 
               filePath.endsWith(autoSelectPath.split('/').pop() || '')
      })
      if (targetFile) {
        hasAutoSelectedRef.current = true
        handleSelectInputFile({
          path: targetFile.path
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSelectFile, inputFilesData, uploadedFileKey])

  // Auto-select all tables when tables are loaded
  useEffect(() => {
    if (tablesData?.tables && selectedTables.length === 0) {
      const tableNames = tablesData.tables.map(t => t.name)
      setSelectedTables(tableNames)
    }
    // Auto-select first table for original view
    if (tablesData?.tables && tablesData.tables.length > 0 && !selectedTableName) {
      setSelectedTableName(tablesData.tables[0].name)
    }
  }, [tablesData])

  // Fetch pairs list
  const { data: pairsData, refetch: refetchPairs, isLoading: loadingPairs } = useQuery({
    queryKey: ['jsl-csv-pairs', workflowId, node.id, uploadedFileKey],
    queryFn: async () => {
      const queryString = uploadedFileKey
        ? new URLSearchParams({
            input_file_path: uploadedFileKey
          }).toString()
        : ''
      const url = `/v1/workflows/${workflowId}/nodes/${node.id}/jsl-csv-pairs${queryString ? `?${queryString}` : ''}`
      return apiClient.get<{
        workflow_id: string
        node_id: string
        pairs: Array<{
          pair_id: string
          pair_folder: string
          csv_path: string
          jsl_path: string
          csv_filename: string
          jsl_filename: string
          csv_size: number
          jsl_size: number
          created_at: string
          cat_var: string
          color_by?: string
          input_file?: {
            uuid_filename: string
            original_filename: string
            file_path: string
          }
          metadata: any
        }>
      }>(url)
    },
    enabled: !!workflowId && !!node.id,
    staleTime: 30000
  })

  // Fetch DuckDB table data for original view
  const { data: tableData, isLoading: loadingTableData } = useQuery({
    queryKey: ['duckdb-table-data', workflowId, node.id, selectedTableName, tablePage],
    queryFn: async () => {
      if (!selectedTableName) return null
      const offset = (tablePage - 1) * rowsPerPage
      const params = new URLSearchParams({
        table_name: selectedTableName,
        limit: rowsPerPage.toString(),
        offset: offset.toString()
      })
      return apiClient.get<{
        workflow_id: string
        node_id: string
        table_name: string
        columns: string[]
        data: Array<Record<string, any>>
        total_rows: number
        displayed_rows: number
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/duckdb-table-data?${params.toString()}`)
    },
    enabled: !!workflowId && !!node.id && !!selectedTableName && viewMode === 'original',
    staleTime: 30000
  })

  // Reset to page 1 when table changes
  useEffect(() => {
    setTablePage(1)
  }, [selectedTableName])

  // Fetch CSV data for processed view
  const { data: csvData, isLoading: loadingCSVData } = useQuery({
    queryKey: ['csv-data', workflowId, node.id, selectedPair?.pair_id, csvPage],
    queryFn: async () => {
      if (!selectedPair) return null
      const offset = (csvPage - 1) * rowsPerPage
      const params = new URLSearchParams({
        pair_id: selectedPair.pair_id,
        limit: rowsPerPage.toString(),
        offset: offset.toString()
      })
      return apiClient.get<{
        workflow_id: string
        node_id: string
        pair_id: string
        csv_filename: string
        columns: string[]
        data: Array<Record<string, any>>
        total_rows: number
        displayed_rows: number
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/csv-data?${params.toString()}`)
    },
    enabled: !!selectedPair && !!workflowId && !!node.id && viewMode === 'processed',
    staleTime: 30000
  })

  // Reset to page 1 when pair changes
  useEffect(() => {
    setCsvPage(1)
  }, [selectedPair?.pair_id])

  // Fetch JSL content for processed view
  const { data: jslData, isLoading: loadingJSLData } = useQuery({
    queryKey: ['jsl-content', workflowId, node.id, selectedPair?.pair_id],
    queryFn: async () => {
      if (!selectedPair) return null
      const params = new URLSearchParams({
        pair_id: selectedPair.pair_id
      })
      return apiClient.get<{
        workflow_id: string
        node_id: string
        pair_id: string
        jsl_filename: string
        content: string
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/jsl-content?${params.toString()}`)
    },
    enabled: !!selectedPair && !!workflowId && !!node.id && viewMode === 'processed',
    staleTime: 30000
  })

  // File upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return apiClient.post<{
        storage_key: string
        filename: string
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/upload`, formData)
    },
    onSuccess: (data) => {
      setUploadedFileKey(data.storage_key)
      refetchInputFiles()
      refetchTables()
      toast.success('File uploaded successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to upload file')
    }
  })

  // Execute conversion mutation
  const executeMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData()
      formData.append('cat_var', catVar)
      if (colorBy) {
        formData.append('color_by', colorBy)
      }
      formData.append('chunk_size', chunkSize.toString())
      if (selectedTables.length > 0) {
        formData.append('selected_tables', JSON.stringify(selectedTables))
      }
      if (captionBoxStatistics.length > 0) {
        formData.append('caption_box_statistics', JSON.stringify(captionBoxStatistics.map(s => s.value)))
      }
      if (catVarOrder.length > 0) {
        formData.append('list_check_values', JSON.stringify(catVarOrder))
        formData.append('value_order', JSON.stringify(catVarOrder))
      }
      return apiClient.post<{
        workflow_id: string
        node_id: string
        pairs: JSLCSVPair[]
        total_pairs: number
        tables_processed: number
        total_tables: number
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/execute-duckdb2jmp`, formData)
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['jsl-csv-pairs', workflowId, node.id] })
      refetchPairs()
      toast.success(`Conversion complete! Created ${data.total_pairs} pair(s) from ${data.tables_processed} table(s)`)
      if (data.pairs && data.pairs.length > 0) {
        // Use the pair from the response directly since it's already a complete JSLCSVPair
        const newPair: JSLCSVPair = data.pairs[0]
        setSelectedPair(newPair)
        setViewMode('processed')
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to execute conversion')
    }
  })

  // Run JMP mutation (automatically creates project)
  const runJMPMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPair) return
      const formData = new FormData()
      formData.append('pair_id', selectedPair.pair_id)
      // Don't send project_id - backend will auto-create a project
      // Optionally send project name/description if workflow data is available
      if (workflowData) {
        const projectName = `${workflowData.name} - JMP Analysis (${workflowId.slice(0, 8)})`
        const projectDescription = `JMP analysis from workflow: ${workflowData.name} (ID: ${workflowId})`
        formData.append('project_name', projectName)
        formData.append('project_description', projectDescription)
      }
      return apiClient.post<{
        success: boolean
        run_id: string
        project_id: string
        status: string
        jmp_task_id: string
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/run-jmp`, formData)
    },
    onSuccess: (data) => {
      if (data?.run_id && data?.project_id) {
        toast.success(`JMP run queued! Run ID: ${data.run_id}, Project ID: ${data.project_id}`)
        // Open project page in a new window
        const projectUrl = `/projects/${data.project_id}`
        window.open(projectUrl, '_blank', 'noopener,noreferrer')
      } else {
        toast.success('JMP run queued!')
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to run JMP')
    }
  })

  const handleRunJMP = () => {
    if (!selectedPair) {
      toast.error('Please select a JSL/CSV pair first')
      return
    }
    runJMPMutation.mutate()
  }

  const handleDownloadPair = async () => {
    if (!selectedPair) {
      toast.error('Please select a JSL/CSV pair first')
      return
    }
    
    try {
      const params = new URLSearchParams({
        pair_id: selectedPair.pair_id
      })
      const url = `/api/v1/workflows/${workflowId}/nodes/${node.id}/download-pair?${params.toString()}`
      
      // Get token from localStorage (same as apiClient)
      const token = localStorage.getItem('access_token')
      if (!token) {
        toast.error('Authentication required. Please log in again.')
        return
      }
      
      // Fetch the file with authentication
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (!response.ok) {
        if (response.status === 401) {
          toast.error('Authentication failed. Please log in again.')
          return
        }
        const errorData = await response.json().catch(() => ({ detail: 'Failed to download file' }))
        throw new Error(errorData.detail || 'Failed to download file')
      }
      
      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = `${selectedPair.pair_folder}.zip`
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/)
        if (filenameMatch) {
          filename = filenameMatch[1]
        }
      }
      
      // Get the blob
      const blob = await response.blob()
      
      // Create a temporary URL and trigger download
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(blobUrl)
      
      toast.success('Download started')
    } catch (error: any) {
      toast.error(error.message || 'Failed to download pair')
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.name.match(/\.(duckdb)$/i)) {
        toast.error('Please select a valid DuckDB file (.duckdb)')
        return
      }
      uploadMutation.mutate(file)
      e.target.value = ''
    }
  }

  const handleSwitchInputFile = () => {
    setShowInputFileDialog(true)
  }

  const handleSelectInputFile = (file: { path: string }) => {
    setUploadedFileKey(file.path)
    refetchTables()
    setShowInputFileDialog(false)
  }

  // Delete file mutation
  const deleteFileMutation = useMutation({
    mutationFn: async (filePath: string) => {
      // filePath is relative to node folder (e.g., "input/filename.duckdb")
      await apiClient.delete(`/v1/workflows/${workflowId}/nodes/${node.id}/files/${filePath}`)
    },
    onSuccess: () => {
      toast.success('File deleted successfully')
      // Refresh file list
      refetchInputFiles()
      // If the deleted file was the current one, clear it
      if (uploadedFileKey && inputFilesData?.folders?.input) {
        const deletedFile = inputFilesData.folders.input.find(f => f.path === uploadedFileKey)
        if (deletedFile) {
          setUploadedFileKey(null)
          // tablesData will automatically update when uploadedFileKey changes
        }
      }
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
    if (!uploadedFileKey) {
      toast.error('Please upload a DuckDB file first')
      return
    }
    if (selectedTables.length === 0) {
      toast.error('Please select at least one table to process')
      return
    }
    executeMutation.mutate()
  }

  const toggleTableSelection = (tableName: string) => {
    if (selectedTables.includes(tableName)) {
      setSelectedTables(selectedTables.filter(t => t !== tableName))
    } else {
      setSelectedTables([...selectedTables, tableName])
    }
  }

  const filteredPairs = useMemo(() => {
    if (!pairsData?.pairs) return []
    return pairsData.pairs
  }, [pairsData])

  const filteredTables = useMemo(() => {
    if (!tablesData?.tables) return []
    if (!searchQuery) return tablesData.tables
    const query = searchQuery.toLowerCase()
    return tablesData.tables.filter(table => 
      table.name.toLowerCase().includes(query)
    )
  }, [tablesData, searchQuery])

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      {/* Top Menu Bar - Frosted Glass */}
      <div className="backdrop-blur-xl bg-white/70 border-b border-white/20 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          {isStandalone && (
            <Link href="/modules">
              <Button 
                variant="outline" 
                size="sm"
                className="rounded-full bg-white/60 backdrop-blur-sm border-white/30 hover:bg-white/80 shadow-sm transition-all"
              >
                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center mr-2">
                  <ArrowLeft className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="font-medium">Back to Modules</span>
              </Button>
            </Link>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSwitchInputFile}
            className="flex items-center space-x-2 rounded-full bg-white/60 backdrop-blur-sm border-white/30 hover:bg-white/80 shadow-sm transition-all"
          >
            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
              <FileText className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-medium">Switch Input File</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".duckdb"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="flex items-center space-x-2 bg-white/40 backdrop-blur-sm rounded-full p-1 border border-white/30">
            <Button
              variant={viewMode === 'original' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('original')}
              disabled={!uploadedFileKey}
              className={`rounded-full transition-all ${
                viewMode === 'original' 
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-md hover:shadow-lg' 
                  : 'hover:bg-white/60'
              }`}
            >
              Original
            </Button>
            <Button
              variant={viewMode === 'processed' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('processed')}
              disabled={!selectedPair}
              className={`rounded-full transition-all ${
                viewMode === 'processed' 
                  ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-md hover:shadow-lg' 
                  : 'hover:bg-white/60'
              }`}
            >
              Processed
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExecute}
            disabled={executeMutation.isPending || !uploadedFileKey || selectedTables.length === 0}
            className="flex items-center space-x-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white border-0 hover:from-indigo-600 hover:to-purple-700 shadow-md hover:shadow-lg transition-all disabled:opacity-50"
          >
            {executeMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Converting...</span>
              </>
            ) : (
              <>
                <div className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center">
                  <Play className="h-3 w-3" />
                </div>
                <span className="font-semibold">Execute Conversion</span>
              </>
            )}
          </Button>
        </div>
        <div className="text-sm font-medium bg-white/50 backdrop-blur-sm px-4 py-1.5 rounded-full border border-white/30">
          {workflowData?.name && <span className="text-gray-700">Workflow: {workflowData.name}</span>}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Panel - Tables and Settings */}
        <div className="w-80 backdrop-blur-xl bg-white/60 border-r border-white/20 flex flex-col min-h-0 overflow-hidden shadow-lg">
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
          {/* Settings Section */}
          <div className="rounded-xl border border-white/30 bg-gradient-to-br from-white/40 to-white/20 backdrop-blur-sm shadow-md overflow-hidden">
            <button
              onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
              className="w-full p-5 flex items-center justify-between hover:bg-white/20 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center shadow-md">
                  <Database className="h-4 w-4 text-white" />
                </div>
                <h3 className="font-semibold text-base text-gray-800">Settings</h3>
              </div>
              {isSettingsExpanded ? (
                <ChevronUp className="h-5 w-5 text-gray-600" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-600" />
              )}
            </button>
            {isSettingsExpanded && (
              <div className="px-5 pb-5 space-y-4">
              <div>
                <Label htmlFor="cat-var" className="text-xs font-medium text-gray-700 mb-2 block">Categorical Variable</Label>
                {availableCatColumns.length > 0 ? (
                  <Select value={catVar} onValueChange={setCatVar}>
                    <SelectTrigger id="cat-var" className="mt-1 h-9 text-sm rounded-xl bg-white/80 backdrop-blur-sm border-white/40 shadow-sm hover:bg-white/90 transition-all">
                      <SelectValue placeholder="Select categorical variable" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl backdrop-blur-xl bg-white/95 border-white/30 shadow-xl">
                      {availableCatColumns.map((col) => (
                        <SelectItem key={col} value={col} className="rounded-lg">
                          {col}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="cat-var"
                    value={catVar}
                    onChange={(e) => setCatVar(e.target.value)}
                    placeholder="Stage"
                    className="mt-1 text-sm rounded-xl bg-white/80 backdrop-blur-sm border-white/40 shadow-sm focus:ring-2 focus:ring-blue-400/50 transition-all"
                    disabled={!dataTable}
                  />
                )}
                {!dataTable && (
                  <p className="text-xs text-gray-500 mt-1">Waiting for "data" table...</p>
                )}
                {dataTable && availableCatColumns.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">No category_ columns or Stage found in "data" table</p>
                )}
              </div>
              <div>
                <Label htmlFor="color-by" className="text-xs font-medium text-gray-700 mb-2 block">Color By (Optional)</Label>
                <Input
                  id="color-by"
                  value={colorBy}
                  onChange={(e) => setColorBy(e.target.value)}
                  placeholder="Leave empty to use categorical variable"
                  className="mt-1 text-sm rounded-xl bg-white/80 backdrop-blur-sm border-white/40 shadow-sm focus:ring-2 focus:ring-purple-400/50 transition-all"
                />
              </div>
              <div>
                <Label htmlFor="chunk-size" className="text-xs font-medium text-gray-700 mb-2 block">Chunk Size</Label>
                <Input
                  id="chunk-size"
                  type="number"
                  value={chunkSize}
                  onChange={(e) => setChunkSize(parseInt(e.target.value) || 100000)}
                  placeholder="100000"
                  className="mt-1 text-sm rounded-xl bg-white/80 backdrop-blur-sm border-white/40 shadow-sm focus:ring-2 focus:ring-pink-400/50 transition-all"
                />
                <p className="text-xs text-gray-500 mt-1.5">Rows per chunk for large datasets</p>
              </div>
              <Button
                onClick={() => {
                  const config = {
                    cat_var: catVar,
                    color_by: colorBy || undefined,
                    chunk_size: chunkSize,
                    cat_var_order: catVarOrder.length > 0 ? catVarOrder : undefined,
                    caption_box_statistics: captionBoxStatistics.length > 0 ? captionBoxStatistics.map(s => s.value) : undefined
                  }
                  if (onConfigUpdate) {
                    onConfigUpdate(config)
                  }
                  toast.success('Settings saved')
                }}
                disabled={!catVar}
                className="w-full h-9 text-sm rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-0 hover:from-emerald-600 hover:to-teal-700 shadow-md hover:shadow-lg transition-all disabled:opacity-50 font-semibold"
                size="sm"
              >
                Save Settings
              </Button>
              </div>
            )}
          </div>

          {/* Categorical Variable Settings */}
          {catVar && (
            <div className="rounded-xl border border-white/30 bg-gradient-to-br from-purple-50/50 to-pink-50/50 backdrop-blur-sm shadow-md overflow-hidden">
              <button
                onClick={() => setIsCatVarSettingsExpanded(!isCatVarSettingsExpanded)}
                className="w-full p-5 flex items-center justify-between hover:bg-white/20 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center shadow-md">
                    <FileText className="h-3.5 w-3.5 text-white" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-800">Categorical Variable Settings</h3>
                </div>
                {isCatVarSettingsExpanded ? (
                  <ChevronUp className="h-5 w-5 text-gray-600" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-600" />
                )}
              </button>
              {isCatVarSettingsExpanded && (
                <div className="px-5 pb-5 space-y-4">
                  <div className="text-xs text-gray-600 mb-2 bg-white/60 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/30 inline-block">
                    Column: <span className="font-mono font-semibold text-purple-600">{catVar}</span>
                  </div>
                  
                  {catVarUniqueValues.length === 0 ? (
                <div className="text-xs text-gray-500 italic">
                  {uploadedFileKey && dataTable ? "Loading values from DuckDB table..." : "Upload a DuckDB file to see values"}
                </div>
              ) : (
                <div>
                  <Label className="text-xs font-medium text-gray-700 mb-2 block">Value Order (used for List Check and Value Order)</Label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto border border-white/40 rounded-xl p-3 bg-white/60 backdrop-blur-sm custom-scrollbar">
                    {catVarOrder.length === 0 ? (
                      <div className="text-xs text-gray-400 italic p-2 text-center">No values available</div>
                    ) : (
                      catVarOrder.map((value, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 hover:bg-white/80 rounded-lg transition-all border border-transparent hover:border-purple-200/50">
                          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-purple-300 to-pink-300 flex items-center justify-center flex-shrink-0">
                            <GripVertical className="h-3.5 w-3.5 text-purple-600" />
                          </div>
                          <span className="flex-1 text-xs font-medium text-gray-700">{value}</span>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 rounded-full hover:bg-blue-100/80 transition-all"
                              onClick={() => {
                                if (index > 0) {
                                  const newValues = [...catVarOrder]
                                  ;[newValues[index - 1], newValues[index]] = [newValues[index], newValues[index - 1]]
                                  setCatVarOrder(newValues)
                                }
                              }}
                              disabled={index === 0}
                            >
                              <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 rounded-full hover:bg-pink-100/80 transition-all"
                              onClick={() => {
                                if (index < catVarOrder.length - 1) {
                                  const newValues = [...catVarOrder]
                                  ;[newValues[index], newValues[index + 1]] = [newValues[index + 1], newValues[index]]
                                  setCatVarOrder(newValues)
                                }
                              }}
                              disabled={index === catVarOrder.length - 1}
                            >
                              <ArrowDown className="h-3.5 w-3.5 text-pink-600" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full h-8 text-xs rounded-xl bg-white/60 backdrop-blur-sm border-white/40 hover:bg-white/80 shadow-sm transition-all"
                    onClick={() => {
                      setCatVarOrder([...catVarUniqueValues])
                    }}
                    disabled={catVarUniqueValues.length === 0}
                  >
                    Reset to Default
                  </Button>
                </div>
              )}
                </div>
              )}
            </div>
          )}

          {/* Caption Box Statistics Settings */}
          <div className="rounded-xl border border-white/30 bg-gradient-to-br from-cyan-50/50 to-blue-50/50 backdrop-blur-sm shadow-md overflow-hidden">
            <button
              onClick={() => setIsCaptionBoxExpanded(!isCaptionBoxExpanded)}
              className="w-full p-5 flex items-center justify-between hover:bg-white/20 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-md">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-white" />
                </div>
                <h3 className="text-sm font-semibold text-gray-800">Caption Box Statistics</h3>
              </div>
              {isCaptionBoxExpanded ? (
                <ChevronUp className="h-5 w-5 text-gray-600" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-600" />
              )}
            </button>
            {isCaptionBoxExpanded && (
              <div className="px-5 pb-5 space-y-3">
                <p className="text-xs text-gray-600 mb-2">Select and reorder summary statistics to display</p>
                
                <div className="space-y-2 max-h-60 overflow-y-auto border border-white/40 rounded-xl p-3 bg-white/60 backdrop-blur-sm custom-scrollbar">
              {/* Show selected statistics first in their order */}
              {captionBoxStatistics.map((stat, orderIndex) => (
                <div key={stat.value} className="flex items-center gap-2 p-2.5 hover:bg-white/80 rounded-lg transition-all border border-transparent hover:border-cyan-200/50">
                  <div className="h-5 w-5 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center flex-shrink-0">
                    <Checkbox
                      checked={true}
                      onCheckedChange={(checked) => {
                        if (!checked) {
                          // Remove from list
                          setCaptionBoxStatistics(captionBoxStatistics.filter(s => s.value !== stat.value))
                        }
                      }}
                      className="border-white"
                    />
                  </div>
                  <span className="flex-1 text-xs font-medium text-gray-700">{stat.label}</span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 rounded-full hover:bg-blue-100/80 transition-all"
                      onClick={() => {
                        if (orderIndex > 0) {
                          const newStats = [...captionBoxStatistics]
                          ;[newStats[orderIndex - 1], newStats[orderIndex]] = [newStats[orderIndex], newStats[orderIndex - 1]]
                          setCaptionBoxStatistics(newStats)
                        }
                      }}
                      disabled={orderIndex === 0}
                    >
                      <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 rounded-full hover:bg-cyan-100/80 transition-all"
                      onClick={() => {
                        if (orderIndex < captionBoxStatistics.length - 1) {
                          const newStats = [...captionBoxStatistics]
                          ;[newStats[orderIndex], newStats[orderIndex + 1]] = [newStats[orderIndex + 1], newStats[orderIndex]]
                          setCaptionBoxStatistics(newStats)
                        }
                      }}
                      disabled={orderIndex === captionBoxStatistics.length - 1}
                    >
                      <ArrowDown className="h-3.5 w-3.5 text-cyan-600" />
                    </Button>
                  </div>
                </div>
              ))}
              {/* Show unselected statistics */}
              {availableStatistics
                .filter(stat => !captionBoxStatistics.some(s => s.value === stat.value))
                .map((stat) => (
                  <div key={stat.value} className="flex items-center gap-2 p-2.5 hover:bg-white/80 rounded-lg transition-all border border-transparent hover:border-cyan-200/50">
                    <Checkbox
                      checked={false}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          // Add to end of list
                          setCaptionBoxStatistics([...captionBoxStatistics, stat])
                        }
                      }}
                      className="border-gray-300"
                    />
                    <span className="flex-1 text-xs text-gray-600">{stat.label}</span>
                  </div>
                ))}
            </div>
            
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs rounded-xl bg-white/60 backdrop-blur-sm border-white/40 hover:bg-white/80 shadow-sm transition-all"
              onClick={() => {
                setCaptionBoxStatistics([...availableStatistics])
              }}
            >
              Select All
            </Button>
              </div>
            )}
          </div>

          {/* Tables Section */}
          <div className="rounded-xl border border-white/30 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 backdrop-blur-sm shadow-md overflow-hidden">
            <button
              onClick={() => setIsTablesExpanded(!isTablesExpanded)}
              className="w-full p-5 flex items-center justify-between hover:bg-white/20 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center shadow-md">
                  <Database className="h-3.5 w-3.5 text-white" />
                </div>
                <h3 className="font-semibold text-sm text-gray-800">Tables</h3>
                {tablesData?.tables && (
                  <span className="text-xs font-medium bg-white/60 backdrop-blur-sm px-2.5 py-1 rounded-full border border-white/30 text-gray-700 ml-2">
                    {selectedTables.length}/{tablesData.tables.length} selected
                  </span>
                )}
              </div>
              {isTablesExpanded ? (
                <ChevronUp className="h-5 w-5 text-gray-600" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-600" />
              )}
            </button>
            {isTablesExpanded && (
              <div className="px-5 pb-5 space-y-3">
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-gradient-to-br from-indigo-300 to-purple-400 flex items-center justify-center">
                    <Search className="h-3 w-3 text-white" />
                  </div>
                  <Input
                    placeholder="Search tables..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 text-sm rounded-xl bg-white/80 backdrop-blur-sm border-white/40 shadow-sm focus:ring-2 focus:ring-indigo-400/50 transition-all"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto custom-scrollbar">
              {loadingTables ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Loading tables...
                </div>
              ) : filteredTables.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  {uploadedFileKey ? 'No tables found' : 'Upload a DuckDB file to see tables'}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredTables.map((table) => (
                    <div
                      key={table.name}
                      className={`flex items-center space-x-3 p-3 rounded-xl cursor-pointer transition-all border ${
                        selectedTables.includes(table.name) 
                          ? 'bg-gradient-to-r from-indigo-100/80 to-purple-100/80 border-indigo-300/50 shadow-md' 
                          : 'bg-white/60 backdrop-blur-sm border-white/40 hover:bg-white/80 hover:border-indigo-200/50 hover:shadow-sm'
                      }`}
                      onClick={() => toggleTableSelection(table.name)}
                    >
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        selectedTables.includes(table.name)
                          ? 'bg-gradient-to-br from-indigo-500 to-purple-600'
                          : 'bg-gray-200'
                      }`}>
                        <Checkbox
                          checked={selectedTables.includes(table.name)}
                          onCheckedChange={() => toggleTableSelection(table.name)}
                          className={selectedTables.includes(table.name) ? 'border-white' : ''}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate text-gray-800">{table.name}</div>
                        <div className="text-xs text-gray-600 font-medium">
                          {table.row_count.toLocaleString()} rows
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
                </div>
              </div>
            )}
          </div>

          {/* Pairs List */}
          <div className="rounded-xl border border-white/30 bg-gradient-to-br from-emerald-50/50 to-teal-50/50 backdrop-blur-sm shadow-md overflow-hidden">
            <button
              onClick={() => setIsPairsExpanded(!isPairsExpanded)}
              className="w-full p-5 flex items-center justify-between hover:bg-white/20 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-md">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-white" />
                </div>
                <h3 className="font-semibold text-sm text-gray-800">JSL/CSV Pairs</h3>
                <span className="text-xs font-medium bg-white/60 backdrop-blur-sm px-2.5 py-1 rounded-full border border-white/30 text-gray-700 ml-2">
                  {filteredPairs.length} pair{filteredPairs.length !== 1 ? 's' : ''} available
                </span>
              </div>
              {isPairsExpanded ? (
                <ChevronUp className="h-5 w-5 text-gray-600" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-600" />
              )}
            </button>
            {isPairsExpanded && (
              <div className="p-3">
                {loadingPairs ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
                      <p className="text-sm text-gray-600">Loading pairs...</p>
                    </div>
                  </div>
                ) : filteredPairs.length === 0 ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="text-center">
                      <FileSpreadsheet className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                      <p className="text-gray-600 mb-2">No pairs found</p>
                      <p className="text-sm text-gray-400">
                        {uploadedFileKey 
                          ? `No pairs found for current input file. Execute conversion to create JSL/CSV pairs.`
                          : 'Execute conversion to create JSL/CSV pairs'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                  {filteredPairs.map((pair) => (
                    <button
                      key={pair.pair_id}
                      onClick={() => {
                        setSelectedPair({
                          pair_id: pair.pair_id,
                          table_name: pair.metadata?.table_name || '',
                          pair_folder: pair.pair_folder,
                          csv_path: pair.csv_path,
                          jsl_path: pair.jsl_path,
                          csv_filename: pair.csv_filename,
                          jsl_filename: pair.jsl_filename,
                          metadata: pair.metadata
                        })
                        setViewMode('processed')
                      }}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                        selectedPair?.pair_id === pair.pair_id
                          ? 'bg-gradient-to-r from-emerald-100/90 to-teal-100/90 border-emerald-300/60 shadow-lg'
                          : 'bg-white/60 backdrop-blur-sm border-white/40 hover:bg-white/80 hover:border-emerald-200/50 hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-center space-x-2 mb-1.5">
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                          selectedPair?.pair_id === pair.pair_id
                            ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                            : 'bg-gradient-to-br from-emerald-300 to-teal-400'
                        }`}>
                          <FileSpreadsheet className="h-3.5 w-3.5 text-white" />
                        </div>
                        <div className="font-semibold text-sm text-gray-900">{pair.pair_folder}</div>
                      </div>
                      {pair.metadata?.table_name && (
                        <div className="text-xs text-gray-700 mt-1.5 font-medium bg-white/60 backdrop-blur-sm px-2 py-1 rounded-lg inline-block">
                          Table: {pair.metadata.table_name}
                        </div>
                      )}
                      <div className="text-xs text-gray-600 mt-1.5 font-medium">
                        {new Date(pair.created_at).toLocaleString()}
                      </div>
                      {pair.input_file && (
                        <div className="text-xs text-gray-500 mt-1">
                          From: {pair.input_file.original_filename}
                        </div>
                      )}
                      <div className="text-xs text-gray-600 mt-1.5 font-medium">
                        Cat: {pair.cat_var} {pair.color_by ? `• Color: ${pair.color_by}` : ''}
                      </div>
                    </button>
                  ))}
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Right Panel - Original (DuckDB) or Processed (CSV + JSL) View */}
        <div className="flex-1 flex flex-col overflow-hidden backdrop-blur-xl bg-white/50 min-h-0">
          {viewMode === 'original' && uploadedFileKey && tableData ? (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Table Selector and Search Bar */}
              <div className="border-b border-white/20 px-5 py-3 space-y-3 bg-gradient-to-r from-blue-50/60 to-purple-50/60 backdrop-blur-sm">
                <div className="flex items-center space-x-2 overflow-x-auto custom-scrollbar pb-1">
                  {tablesData?.tables.map((table) => (
                    <Button
                      key={table.name}
                      variant={selectedTableName === table.name ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedTableName(table.name)}
                      className={`text-xs rounded-full transition-all ${
                        selectedTableName === table.name
                          ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-md hover:shadow-lg'
                          : 'bg-white/60 backdrop-blur-sm border-white/40 hover:bg-white/80'
                      }`}
                    >
                      {table.name} ({table.row_count.toLocaleString()} rows)
                    </Button>
                  ))}
                </div>
                {/* Search Bar */}
                <div className="relative">
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 rounded-full bg-gradient-to-br from-blue-300 to-purple-400 flex items-center justify-center">
                    <Search className="h-3 w-3 text-white" />
                  </div>
                  <Input
                    type="text"
                    placeholder="Search values in table..."
                    value={tableSearchQuery}
                    onChange={(e) => setTableSearchQuery(e.target.value)}
                    className="pl-10 h-9 text-sm rounded-xl bg-white/80 backdrop-blur-sm border-white/40 shadow-sm focus:ring-2 focus:ring-blue-400/50 transition-all"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-auto p-5 min-h-0 custom-scrollbar">
                {tableData ? (
                  <div className="border border-white/40 rounded-2xl overflow-x-auto bg-white/70 backdrop-blur-sm shadow-xl">
                    <table className="min-w-full text-sm border-collapse">
                      <thead className="bg-gradient-to-r from-blue-100/80 to-purple-100/80 backdrop-blur-sm sticky top-0">
                        <tr>
                          {tableData.columns.map((col, colIdx) => (
                            <th
                              key={colIdx}
                              className="border border-white/40 px-4 py-3 text-left font-semibold text-gray-800"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          // Filter data based on search query
                          let filteredData = tableData.data
                          if (tableSearchQuery.trim()) {
                            const query = tableSearchQuery.toLowerCase()
                            filteredData = tableData.data.filter((row) => {
                              return tableData.columns.some((col) => {
                                const value = row[col]
                                if (value === null || value === undefined) return false
                                return String(value).toLowerCase().includes(query)
                              })
                            })
                          }
                          
                          if (filteredData.length === 0) {
                            return (
                              <tr>
                                <td
                                  colSpan={tableData.columns.length}
                                  className="border border-gray-200 px-3 py-8 text-center text-gray-400"
                                >
                                  {tableSearchQuery.trim() 
                                    ? `No results found for "${tableSearchQuery}"` 
                                    : 'No data to display'}
                                </td>
                              </tr>
                            )
                          }
                          
                          return filteredData.map((row, rowIdx) => (
                            <tr key={rowIdx} className="hover:bg-white/60 transition-colors border-b border-white/30">
                              {tableData.columns.map((col, colIdx) => {
                                const cellValue = row[col]
                                const cellStr = cellValue !== null && cellValue !== undefined
                                  ? String(cellValue)
                                  : ''
                                const isMatch = tableSearchQuery.trim() && cellStr.toLowerCase().includes(tableSearchQuery.toLowerCase())
                                
                                return (
                                  <td
                                    key={colIdx}
                                    className={`border-r border-white/30 px-4 py-2.5 text-gray-800 ${
                                      isMatch ? 'bg-gradient-to-r from-yellow-200/80 to-orange-200/80 font-semibold rounded-lg' : ''
                                    }`}
                                  >
                                    {cellStr}
                                  </td>
                                )
                              })}
                            </tr>
                          ))
                        })()}
                      </tbody>
                    </table>
                    <div className="bg-gradient-to-r from-blue-50/80 to-purple-50/80 backdrop-blur-sm px-5 py-3 border-t border-white/40 flex items-center justify-between rounded-b-2xl">
                      <div className="text-xs text-gray-500">
                        {tableSearchQuery.trim() ? (
                          <>Showing {tableData.data.filter((row) => {
                            const query = tableSearchQuery.toLowerCase()
                            return tableData.columns.some((col) => {
                              const value = row[col]
                              if (value === null || value === undefined) return false
                              return String(value).toLowerCase().includes(query)
                            })
                          }).length} matching row{tableData.data.filter((row) => {
                            const query = tableSearchQuery.toLowerCase()
                            return tableData.columns.some((col) => {
                              const value = row[col]
                              if (value === null || value === undefined) return false
                              return String(value).toLowerCase().includes(query)
                            })
                          }).length !== 1 ? 's' : ''} (of {tableData.displayed_rows} displayed, {tableData.total_rows} total)</>
                        ) : (
                          <>Showing {((tablePage - 1) * rowsPerPage) + 1}-{Math.min(tablePage * rowsPerPage, tableData.total_rows)} of {tableData.total_rows} rows</>
                        )}
                      </div>
                      {!tableSearchQuery.trim() && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs rounded-full bg-white/60 backdrop-blur-sm border-white/40 hover:bg-white/80 shadow-sm transition-all"
                            onClick={() => setTablePage(p => Math.max(1, p - 1))}
                            disabled={tablePage === 1 || loadingTableData}
                          >
                            Previous
                          </Button>
                          <span className="text-xs font-medium text-gray-700 bg-white/60 backdrop-blur-sm px-3 py-1 rounded-full border border-white/30">
                            Page {tablePage} of {Math.ceil(tableData.total_rows / rowsPerPage) || 1}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs rounded-full bg-white/60 backdrop-blur-sm border-white/40 hover:bg-white/80 shadow-sm transition-all"
                            onClick={() => setTablePage(p => p + 1)}
                            disabled={tablePage >= Math.ceil(tableData.total_rows / rowsPerPage) || loadingTableData}
                          >
                            Next
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-400">Select a table to view data</p>
                  </div>
                )}
              </div>
            </div>
          ) : uploadedFileKey && loadingTableData ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center backdrop-blur-xl bg-white/40 rounded-3xl p-10 border border-white/30 shadow-2xl">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                <p className="text-gray-700 font-medium">Loading table data...</p>
              </div>
            </div>
          ) : !uploadedFileKey ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center backdrop-blur-xl bg-white/40 rounded-3xl p-10 border border-white/30 shadow-2xl">
                <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-6 shadow-xl">
                  <FileSpreadsheet className="h-10 w-10 text-white" />
                </div>
                <p className="text-xl font-semibold text-gray-800 mb-2">No file opened</p>
                <p className="text-sm text-gray-600 mb-6">Click "Switch Input File" to load a DuckDB file</p>
                <Button onClick={handleSwitchInputFile} variant="default" className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white border-0 hover:from-indigo-600 hover:to-purple-700 shadow-md hover:shadow-lg transition-all">
                  <div className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center mr-2">
                    <FileText className="h-3 w-3" />
                  </div>
                  Switch Input File
                </Button>
              </div>
            </div>
          ) : viewMode === 'processed' && selectedPair ? (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Pair Header */}
              <div className="border-b border-white/20 px-5 py-3 flex items-center justify-between bg-gradient-to-r from-emerald-50/60 to-teal-50/60 backdrop-blur-sm">
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-md">
                      <FileSpreadsheet className="h-3.5 w-3.5 text-white" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">{selectedPair.pair_folder}</h3>
                  </div>
                  <p className="text-xs text-gray-600 mt-1.5 font-medium bg-white/60 backdrop-blur-sm px-2.5 py-1 rounded-full border border-white/30 inline-block">
                    Created: {new Date(selectedPair.metadata?.created_at || Date.now()).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    onClick={handleDownloadPair}
                    variant="outline"
                    size="sm"
                    className="rounded-full bg-white/60 backdrop-blur-sm border-white/40 hover:bg-white/80 shadow-sm transition-all"
                  >
                    <div className="h-5 w-5 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center mr-2">
                      <Download className="h-3 w-3 text-white" />
                    </div>
                    Download
                  </Button>
                  <Button
                    onClick={handleRunJMP}
                    disabled={runJMPMutation.isPending}
                    size="sm"
                    className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white border-0 hover:from-indigo-600 hover:to-purple-700 shadow-md hover:shadow-lg transition-all"
                  >
                    {runJMPMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <div className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center mr-2">
                          <Play className="h-3 w-3" />
                        </div>
                        Run JMP
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* CSV Table and JSL Viewer */}
              <div className="flex-1 flex overflow-hidden min-h-0">
                {/* CSV Table Viewer */}
                <div className="flex-1 flex flex-col overflow-hidden border-r border-white/20 min-h-0">
                  <div className="border-b border-white/20 px-5 py-3 bg-gradient-to-r from-cyan-50/60 to-blue-50/60 backdrop-blur-sm">
                    <div className="flex items-center space-x-2 mb-1">
                      <div className="h-6 w-6 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-md">
                        <FileSpreadsheet className="h-3 w-3 text-white" />
                      </div>
                      <h4 className="text-sm font-semibold text-gray-800">CSV Data</h4>
                    </div>
                    <p className="text-xs text-gray-600 font-medium bg-white/60 backdrop-blur-sm px-2.5 py-1 rounded-full border border-white/30 inline-block">{selectedPair.csv_filename}</p>
                  </div>
                  {loadingCSVData ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
                        <p className="text-sm text-gray-600">Loading CSV data...</p>
                      </div>
                    </div>
                  ) : csvData ? (
                    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                      {/* Search Bar */}
                      <div className="border-b border-white/20 px-5 py-3 bg-gradient-to-r from-cyan-50/40 to-blue-50/40 backdrop-blur-sm">
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 rounded-full bg-gradient-to-br from-cyan-300 to-blue-400 flex items-center justify-center">
                            <Search className="h-3 w-3 text-white" />
                          </div>
                          <Input
                            type="text"
                            placeholder="Search values in CSV..."
                            value={tableSearchQuery}
                            onChange={(e) => setTableSearchQuery(e.target.value)}
                            className="pl-10 h-9 text-sm rounded-xl bg-white/80 backdrop-blur-sm border-white/40 shadow-sm focus:ring-2 focus:ring-cyan-400/50 transition-all"
                          />
                        </div>
                      </div>
                      {/* CSV Table */}
                      <div className="flex-1 overflow-auto p-5 min-h-0 custom-scrollbar">
                        <div className="border border-white/40 rounded-2xl overflow-x-auto bg-white/70 backdrop-blur-sm shadow-xl">
                          <table className="min-w-full text-sm border-collapse">
                            <thead className="bg-gradient-to-r from-cyan-100/80 to-blue-100/80 backdrop-blur-sm sticky top-0">
                              <tr>
                                {csvData.columns.map((col: string, colIdx: number) => (
                                  <th
                                    key={colIdx}
                                    className="border border-white/40 px-4 py-3 text-left font-semibold text-gray-800"
                                  >
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                let filteredData = csvData.data
                                if (tableSearchQuery.trim()) {
                                  const query = tableSearchQuery.toLowerCase()
                                  filteredData = csvData.data.filter((row: Record<string, any>) => {
                                    return csvData.columns.some((col: string) => {
                                      const value = row[col]
                                      if (value === null || value === undefined) return false
                                      return String(value).toLowerCase().includes(query)
                                    })
                                  })
                                }
                                
                                if (filteredData.length === 0) {
                                  return (
                                    <tr>
                                      <td
                                        colSpan={csvData.columns.length}
                                        className="border border-gray-200 px-3 py-8 text-center text-gray-400"
                                      >
                                        {tableSearchQuery.trim() 
                                          ? `No results found for "${tableSearchQuery}"` 
                                          : 'No data to display'}
                                      </td>
                                    </tr>
                                  )
                                }
                                
                                return filteredData.map((row: Record<string, any>, rowIdx: number) => (
                                  <tr key={rowIdx} className="hover:bg-white/60 transition-colors border-b border-white/30">
                                    {csvData.columns.map((col: string, colIdx: number) => {
                                      const cellValue = row[col]
                                      const cellStr = cellValue !== null && cellValue !== undefined
                                        ? String(cellValue)
                                        : ''
                                      const isMatch = tableSearchQuery.trim() && cellStr.toLowerCase().includes(tableSearchQuery.toLowerCase())
                                      
                                      return (
                                        <td
                                          key={colIdx}
                                          className={`border-r border-white/30 px-4 py-2.5 text-gray-800 ${
                                            isMatch ? 'bg-gradient-to-r from-yellow-200/80 to-orange-200/80 font-semibold rounded-lg' : ''
                                          }`}
                                        >
                                          {cellStr}
                                        </td>
                                      )
                                    })}
                                  </tr>
                                ))
                              })()}
                            </tbody>
                          </table>
                          <div className="bg-gradient-to-r from-cyan-50/80 to-blue-50/80 backdrop-blur-sm px-5 py-3 border-t border-white/40 flex items-center justify-between rounded-b-2xl">
                            <div className="text-xs text-gray-500">
                              {tableSearchQuery.trim() ? (
                                <>Showing {csvData.data.filter((row: Record<string, any>) => {
                                  const query = tableSearchQuery.toLowerCase()
                                  return csvData.columns.some((col: string) => {
                                    const value = row[col]
                                    if (value === null || value === undefined) return false
                                    return String(value).toLowerCase().includes(query)
                                  })
                                }).length} matching row{csvData.data.filter((row: Record<string, any>) => {
                                  const query = tableSearchQuery.toLowerCase()
                                  return csvData.columns.some((col: string) => {
                                    const value = row[col]
                                    if (value === null || value === undefined) return false
                                    return String(value).toLowerCase().includes(query)
                                  })
                                }).length !== 1 ? 's' : ''} (of {csvData.displayed_rows} displayed, {csvData.total_rows} total)</>
                              ) : (
                                <>Showing {((csvPage - 1) * rowsPerPage) + 1}-{Math.min(csvPage * rowsPerPage, csvData.total_rows)} of {csvData.total_rows} rows</>
                              )}
                            </div>
                            {!tableSearchQuery.trim() && (
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs rounded-full bg-white/60 backdrop-blur-sm border-white/40 hover:bg-white/80 shadow-sm transition-all"
                                  onClick={() => setCsvPage(p => Math.max(1, p - 1))}
                                  disabled={csvPage === 1 || loadingCSVData}
                                >
                                  Previous
                                </Button>
                                <span className="text-xs font-medium text-gray-700 bg-white/60 backdrop-blur-sm px-3 py-1 rounded-full border border-white/30">
                                  Page {csvPage} of {Math.ceil(csvData.total_rows / rowsPerPage) || 1}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs rounded-full bg-white/60 backdrop-blur-sm border-white/40 hover:bg-white/80 shadow-sm transition-all"
                                  onClick={() => setCsvPage(p => p + 1)}
                                  disabled={csvPage >= Math.ceil(csvData.total_rows / rowsPerPage) || loadingCSVData}
                                >
                                  Next
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-gray-400">No CSV data available</p>
                    </div>
                  )}
                </div>

                {/* JSL Script Viewer */}
                <div className="w-1/2 flex flex-col overflow-hidden min-h-0">
                  <div className="border-b border-white/20 px-5 py-3 bg-gradient-to-r from-purple-50/60 to-pink-50/60 backdrop-blur-sm">
                    <div className="flex items-center space-x-2 mb-1">
                      <div className="h-6 w-6 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center shadow-md">
                        <FileText className="h-3 w-3 text-white" />
                      </div>
                      <h4 className="text-sm font-semibold text-gray-800">JSL Script</h4>
                    </div>
                    <p className="text-xs text-gray-600 font-medium bg-white/60 backdrop-blur-sm px-2.5 py-1 rounded-full border border-white/30 inline-block">{selectedPair.jsl_filename}</p>
                  </div>
                  {loadingJSLData ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-2"></div>
                        <p className="text-sm text-gray-600 font-medium">Loading JSL script...</p>
                      </div>
                    </div>
                  ) : jslData ? (
                    <div className="flex-1 overflow-auto p-5 min-h-0 custom-scrollbar">
                      <pre className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-100 p-5 rounded-2xl text-xs font-mono overflow-x-auto shadow-xl border border-white/20 backdrop-blur-sm">
                        <code>{jslData.content}</code>
                      </pre>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-gray-400 font-medium">No JSL script available</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center backdrop-blur-xl bg-white/40 rounded-3xl p-10 border border-white/30 shadow-2xl">
                <div className="h-20 w-20 rounded-full bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-500 flex items-center justify-center mx-auto mb-6 shadow-xl">
                  <FileSpreadsheet className="h-10 w-10 text-white" />
                </div>
                <p className="text-xl font-semibold text-gray-800 mb-2">No data available</p>
                <p className="text-sm text-gray-600">Please upload a file or select a pair</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input File Dialog */}
      <Dialog open={showInputFileDialog} onOpenChange={setShowInputFileDialog}>
        <DialogContent className="backdrop-blur-xl bg-white/90 border-white/30 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                <Database className="h-4 w-4 text-white" />
              </div>
              <span>Select Input File</span>
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              Choose a DuckDB file to process
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-0 hover:from-emerald-600 hover:to-teal-700 shadow-md hover:shadow-lg transition-all"
              disabled={uploadMutation.isPending}
            >
              <div className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center mr-2">
                <Upload className="h-3 w-3" />
              </div>
              {uploadMutation.isPending ? 'Uploading...' : 'Upload New File'}
            </Button>
            {inputFilesData?.folders?.input && inputFilesData.folders.input.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {inputFilesData.folders.input
                  .filter(file => file.name.endsWith('.duckdb'))
                  .map((file) => (
                    <div
                      key={file.name}
                      className={`relative w-full px-4 py-3 rounded-xl border transition-all backdrop-blur-sm ${
                        file.path === uploadedFileKey 
                          ? 'bg-gradient-to-r from-indigo-100/80 to-purple-100/80 border-indigo-300/50 shadow-md' 
                          : 'bg-white/60 border-white/40 hover:bg-white/80 hover:border-indigo-200/50 hover:shadow-sm'
                      }`}
                    >
                      <button
                        onClick={() => handleSelectInputFile(file)}
                        className="w-full text-left pr-8"
                      >
                        <div className="flex items-start space-x-3">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            file.path === uploadedFileKey
                              ? 'bg-gradient-to-br from-indigo-500 to-purple-600'
                              : 'bg-gradient-to-br from-blue-300 to-purple-400'
                          }`}>
                            <Database className="h-5 w-5 text-white" />
                          </div>
                          <div className="flex-1">
                            {file.metadata ? (
                              <>
                                <div className="font-semibold text-gray-900">{file.metadata.original_filename}</div>
                                <div className="text-xs text-gray-600 mt-1 font-medium">
                                  Type: {file.metadata.file_type} • Uploaded: {new Date(file.metadata.uploaded_time).toLocaleString()}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="font-semibold text-gray-900">{file.name}</div>
                                <div className="text-xs text-gray-600 mt-1 font-medium">
                                  Size: {(file.size / 1024).toFixed(2)} KB
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={(e) => handleDeleteFile(e, file)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50/80 rounded-full transition-all"
                        title="Delete file"
                        disabled={deleteFileMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}


'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { FileSpreadsheet, Upload, Database, Play, Plus, X, Download, FolderOpen, Save, Search, FileText, ArrowRight, Loader2, Trash2, Pencil, ChevronUp, ChevronDown } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'
import { Progress } from '@/components/ui/progress'

interface OutlierRemoverDuckDBGUIProps {
  node: {
    id: string
    module_type: string
    config: any
    state: any
  }
  workflowId: string
  onConfigUpdate?: (config: any) => void
  onProcess?: () => void
  isStandalone?: boolean  // Whether this is in standalone mode (modules page) vs editor mode
  autoSelectFile?: string  // File path to auto-select when component loads
  onCreateNewWorkflow?: (file?: File) => void
}

export default function OutlierRemoverDuckDBGUI({
  node,
  workflowId,
  onConfigUpdate,
  onProcess,
  isStandalone = false,
  autoSelectFile,
  onCreateNewWorkflow
}: OutlierRemoverDuckDBGUIProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastValidatedFileRef = useRef<string | null>(null) // Track last validated file to avoid duplicate validations
  const justUpdatedRulesRef = useRef<boolean>(false) // Track if we just updated rules to prevent config from overwriting
  
  // Load config from file on mount
  const { data: loadedConfig, refetch: refetchConfig } = useQuery({
    queryKey: ['node-config', workflowId, node.id],
    queryFn: async () => {
      return apiClient.get<{ config: any }>(`/v1/workflows/${workflowId}/nodes/${node.id}/config`)
    },
    enabled: !!workflowId && !!node.id,
    staleTime: 0 // Always refetch to get latest config
  })

  // Use loaded config or fallback to node.config
  const effectiveConfig = loadedConfig?.config || node.config || {}
  
  const [uploadedFileKey, setUploadedFileKey] = useState<string | null>(effectiveConfig.file_key || null)
  const [filename, setFilename] = useState<string>(effectiveConfig.filename || '')
  const [outlierRules, setOutlierRules] = useState<Array<{
    sequence?: number  // Order/sequence of rule application (lower number = applied first)
    sheets?: string[]  // Array of sheet names, undefined means all sheets
    columns?: Record<string, string[]>  // {sheetName: [columnNames]}, undefined means all columns
    sheet?: string  // Legacy: single sheet (for backward compatibility)
    column?: string  // Legacy: single column (for backward compatibility)
    condition: string
    value: string
    action?: 'clear_cell' | 'remove_row'  // Action to take: clear cell or remove entire row
  }>>(() => {
    // Initialize rules with sequence numbers if not present
    const rules = effectiveConfig.outlier_rules || []
    return rules.map((rule: any, index: number) => ({
      ...rule,
      sequence: rule.sequence !== undefined ? rule.sequence : index
    })).sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0))
  })
  const [selectedTable, setSelectedTable] = useState<string>('')
  const [selectedColumn, setSelectedColumn] = useState<string>('')
  const [viewVersion, setViewVersion] = useState<'original' | 'processed'>('original')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [showInputFileDialog, setShowInputFileDialog] = useState(false)
  const [showNextNodeDialog, setShowNextNodeDialog] = useState(false)
  const [showExistingNodeDialog, setShowExistingNodeDialog] = useState(false)
  const [selectedExistingModule, setSelectedExistingModule] = useState<string>('')
  const [showRuleDialog, setShowRuleDialog] = useState(false)
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null)
  const [tempRule, setTempRule] = useState<{
    applyToAllSheets: boolean  // If true, apply to all sheets (sheets not selectable)
    selectedSheets: string[]
    applyToAllColumns: Record<string, boolean>  // {sheetName: boolean} - if true, apply to all columns for that sheet
    selectedColumns: Record<string, string[]> // {sheetName: [columnNames]}
    condition: string
    value: string
    action?: 'clear_cell' | 'remove_row'
  } | null>(null)
  const [tablePage, setTablePage] = useState<Record<string, number>>({}) // Track current page for each table
  const [tableLimit] = useState(20) // Load 20 rows per page
  
  // Progress tracking
  const [uploadProgress, setUploadProgress] = useState<{ progress: number; message: string; status: string } | null>(null)
  const [processingProgress, setProcessingProgress] = useState<{ progress: number; message: string; status: string } | null>(null)
  const [csvConversionState, setCsvConversionState] = useState<{ status: 'idle' | 'processing' | 'completed' | 'error'; message: string }>({ status: 'idle', message: '' })
  const [csvPackageInfo, setCsvPackageInfo] = useState<{ filename: string; tableCount: number } | null>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [validationAlert, setValidationAlert] = useState<{
    open: boolean
    invalidRules: Array<{
      ruleIndex: number
      rule: typeof outlierRules[0]
      missingSheet?: string
      missingColumn?: string
    }>
    onUpdate: (selectedIndices: number[]) => void
    onKeep: () => void
  }>({
    open: false,
    invalidRules: [],
    onUpdate: () => {},
    onKeep: () => {}
  })
  const [selectedRulesToUpdate, setSelectedRulesToUpdate] = useState<Set<number>>(new Set())
  const [ruleUpdates, setRuleUpdates] = useState<Map<number, { sheet?: string; column?: string; remove?: boolean }>>(new Map())

  // Fetch input files with metadata
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

  // Fetch list of all tables (for column selection panel) - always fetch without table_name
  const { data: tablesListData, isLoading: loadingTablesList } = useQuery({
    queryKey: ['duckdb-tables-list', workflowId, node.id, viewVersion, uploadedFileKey],
    queryFn: async () => {
      // Build query parameters - never include table_name to always get list of tables
      const params = new URLSearchParams({
        version: viewVersion
      })
      
      // Always pass the input file path so backend can match processed files to input files
      if (uploadedFileKey) {
        const filename = uploadedFileKey.split('/').pop() || uploadedFileKey
        params.append('file_path', filename)
      }
      
      const response = await apiClient.get<{
        workflow_id: string
        node_id: string
        file_path: string
        filename: string
        version: string
        tables?: Array<{
          name: string
          row_count: number
          columns: string[]
        }>
        message?: string
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/duckdb-data?${params.toString()}`)
      console.log('DuckDB tables list response:', { 
        version: viewVersion, 
        tablesCount: response.tables?.length, 
        message: response.message 
      })
      return response
    },
    enabled: !!uploadedFileKey,
    staleTime: 0 // Set to 0 to always refetch when switching versions
  })

  // Fetch specific table data (for table viewer) - only when a table is selected
  const currentPage = selectedTable ? (tablePage[selectedTable] || 1) : 1
  const currentOffset = (currentPage - 1) * tableLimit
  
  const { data: tableData, isLoading: loadingTableData, refetch: refetchData } = useQuery({
    queryKey: ['duckdb-table-data', workflowId, node.id, viewVersion, selectedTable, currentPage, uploadedFileKey],
    queryFn: async () => {
      if (!selectedTable) return null
      
      // Build query parameters
      const params = new URLSearchParams({
        version: viewVersion,
        table_name: selectedTable,
        limit: tableLimit.toString(),
        offset: currentOffset.toString()
      })
      
      // Always pass the input file path so backend can match processed files to input files
      if (uploadedFileKey) {
        const filename = uploadedFileKey.split('/').pop() || uploadedFileKey
        params.append('file_path', filename)
      }
      
      const response = await apiClient.get<{
        workflow_id: string
        node_id: string
        file_path: string
        filename: string
        version: string
        table_name?: string
        columns?: string[]
        data?: any[]
        total_rows?: number
        displayed_rows?: number
        limit?: number
        offset?: number
        message?: string
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/duckdb-data?${params.toString()}`)
      console.log('DuckDB table data response:', { 
        version: viewVersion, 
        selectedTable,
        tableName: response.table_name,
        dataRows: response.data?.length,
        totalRows: response.total_rows,
        message: response.message 
      })
      return response
    },
    enabled: !!uploadedFileKey && !!selectedTable,
    staleTime: 0
  })

  // Use tablesListData for tables list, tableData for specific table data
  const loadingData = loadingTablesList || loadingTableData

  // Fetch processing progress
  const { data: progressData } = useQuery({
    queryKey: ['duckdb-progress', workflowId, node.id],
    queryFn: async () => {
      return apiClient.get<{ status: string; progress: number; message: string }>(
        `/v1/workflows/${workflowId}/nodes/${node.id}/duckdb-progress`
      )
    },
    enabled: !!workflowId && !!node.id && processingProgress?.status === 'processing',
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'processing' ? 500 : false
    }
  })

  useEffect(() => {
    if (progressData) {
      setProcessingProgress(progressData)
      if (progressData.status === 'completed' || progressData.status === 'error') {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current)
          progressIntervalRef.current = null
        }
        if (progressData.status === 'completed') {
          refetchData()
          queryClient.invalidateQueries({ queryKey: ['duckdb-data', workflowId, node.id] })
        }
      }
    }
  }, [progressData, refetchData, queryClient, workflowId, node.id])

  // File upload mutation with progress tracking
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      
      setUploadProgress({ progress: 0, message: 'Uploading...', status: 'uploading' })
      
      const xhr = new XMLHttpRequest()
      return new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100)
            setUploadProgress({ progress, message: `Uploading... ${progress}%`, status: 'uploading' })
          }
        })
        
        xhr.addEventListener('load', () => {
          if (xhr.status === 200 || xhr.status === 201) {
            setUploadProgress({ progress: 100, message: 'Upload complete', status: 'completed' })
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
    onSuccess: (data: any) => {
      setUploadedFileKey(data.storage_key)
      setFilename(data.filename)
      if (onConfigUpdate) {
        onConfigUpdate({
          ...node.config,
          file_key: data.storage_key,
          filename: data.filename
        })
      }
      // Save config to file
      const configToSave = {
        file_key: data.storage_key,
        filename: data.filename,
        outlier_rules: outlierRules
      }
      saveConfigToFile(configToSave)
      
      // Also save to database
      apiClient.put(`/v1/nodes/${node.id}`, {
        config: {
          ...node.config,
          ...configToSave
        }
      }).catch(err => {
        console.error('Failed to save config to database:', err)
      })
      queryClient.invalidateQueries({ queryKey: ['duckdb-data', workflowId, node.id] })
      queryClient.invalidateQueries({ queryKey: ['node-files', workflowId, node.id] })
      toast.success('File opened successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to open file')
    }
  })

  // Process mutation
  const processMutation = useMutation({
    mutationFn: async (data: { rules: any[] }) => {
      // Extract filename from uploadedFileKey if it's a full path
      let fileKeyToSend = uploadedFileKey
      if (uploadedFileKey && uploadedFileKey.includes('/')) {
        // Extract just the filename from the path
        fileKeyToSend = uploadedFileKey.split('/').pop() || uploadedFileKey
      }
      console.log('Processing with file_key:', fileKeyToSend, 'from uploadedFileKey:', uploadedFileKey)
      return apiClient.post<{
        workflow_id: string
        node_id: string
        original_file: string
        processed_file: string
        filename: string
        tables_processed: string[]
        summary_table: string
        total_removals: number
        removal_summary: any[]
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/process-outlier-remover-duckdb`, {
        outlier_rules: data.rules,
        file_key: fileKeyToSend // Pass the current file_key explicitly (just filename)
      })
    },
    onSuccess: (data) => {
      console.log('Processing result:', data)
      toast.success(`Processing completed successfully. ${data.total_removals || 0} removals applied.`)
      queryClient.invalidateQueries({ queryKey: ['duckdb-data', workflowId, node.id] })
      setViewVersion('processed')
      // Refetch data after a short delay to ensure file is written
      setTimeout(() => {
        refetchData()
      }, 500)
      // Save config to file after processing
      saveConfigToFile({
        file_key: uploadedFileKey,
        filename: filename,
        outlier_rules: outlierRules
      })
      
      if (onConfigUpdate) {
        onConfigUpdate({
          ...node.config,
          outlier_rules: outlierRules
        })
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to process file')
      setProcessingProgress(null)
    }
  })

  // Download processed DuckDB mutation
  const downloadDuckDBMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/v1/workflows/${workflowId}/nodes/${node.id}/download-processed-duckdb`, {
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
      a.download = filename || 'processed.duckdb'
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

  // Convert processed DuckDB tables to CSV zip
  const convertToCsvMutation = useMutation({
    mutationFn: async () => {
      setCsvConversionState({ status: 'processing', message: 'Generating CSV files. This may take a while...' })
      setCsvPackageInfo(null)
      return apiClient.post<{
        workflow_id: string
        node_id: string
        csv_zip_file: string
        zip_filename: string
        tables_converted: string[]
        csv_count: number
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/convert-duckdb-to-csv`)
    },
    onSuccess: (data) => {
      toast.success(`CSV package ready. ${data.csv_count} tables exported.`)
      setCsvConversionState({ status: 'completed', message: `${data.csv_count} tables exported.` })
      setCsvPackageInfo({
        filename: data.zip_filename,
        tableCount: data.csv_count
      })
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to convert to CSV')
      setCsvConversionState({ status: 'error', message: error.message || 'Failed to convert to CSV' })
      setCsvPackageInfo(null)
    }
  })

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
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to move to next node')
    }
  })

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
    if (!tablesListData?.tables || tablesListData.tables.length === 0) {
      toast.error('No processed data available. Please execute processing first.')
      return
    }
    moveToExistingNodeMutation.mutate(targetNodeId)
  }

  // Download CSV zip mutation
  const downloadCsvZipMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/v1/workflows/${workflowId}/nodes/${node.id}/download-csv-zip-from-duckdb`, {
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
      a.download = csvPackageInfo?.filename || 'processed_tables.zip'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('CSV zip downloaded successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to download CSV zip')
    }
  })

  const handleSwitchInputFile = () => {
    setShowInputFileDialog(true)
    refetchInputFiles()
  }

  const handleSelectInputFile = async (file: { name: string; path: string; metadata?: any }) => {
    try {
      // Step 1: Update file key and filename FIRST
      const fileKey = file.path
      const originalFilename = file.metadata?.original_filename || file.name
      
      // Update state immediately
      setUploadedFileKey(fileKey)
      setFilename(originalFilename)
      
      // Step 2: Save file_key and filename to config FIRST (before other operations)
      const currentRules = outlierRules.map(rule => {
        const ruleObj: any = {
          condition: rule.condition,
          value: rule.value,
          action: rule.action || 'clear_cell'
        }
        // Always include sheet and column fields
        ruleObj.sheet = (rule.sheet && rule.sheet.trim() !== '') ? rule.sheet : null
        ruleObj.column = (rule.column && rule.column.trim() !== '') ? rule.column : null
        return ruleObj
      })
      
      const configToSave = {
        file_key: fileKey,
        filename: originalFilename,
        outlier_rules: currentRules
      }
      
      await saveConfigToFile(configToSave)
      
      // Also update parent component's config
      if (onConfigUpdate) {
        onConfigUpdate({
          ...node.config,
          ...configToSave
        })
      }
      
      // Step 3: Reset state for new file - column selections reset, but keep rules
      setSelectedTable('')
      setSearchQuery('')
      setViewVersion('original') // Reset to original view when switching files
      setTablePage({}) // Reset pagination
      
      // Reset validation tracking for new file
      lastValidatedFileRef.current = null
      
      // Step 4: Invalidate queries to reload data - the query will automatically refetch because uploadedFileKey changed
      queryClient.invalidateQueries({ queryKey: ['duckdb-data', workflowId, node.id] })
      queryClient.invalidateQueries({ queryKey: ['node-files', workflowId, node.id] })
      queryClient.invalidateQueries({ queryKey: ['node-config', workflowId, node.id] })
      
      // Wait for excel data to load before validating
      // We'll validate in a useEffect that watches tablesListData
      
      setShowInputFileDialog(false)
      toast.success(`Switched to file: ${originalFilename}`)
    } catch (error: any) {
      toast.error(`Failed to switch file: ${error.message || 'Unknown error'}`)
    }
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
      // If the deleted file was the current one, clear it
      if (uploadedFileKey && inputFilesData?.folders?.input) {
        const deletedFile = inputFilesData.folders.input.find(f => f.path === uploadedFileKey)
        if (deletedFile) {
          setUploadedFileKey(null)
          setSelectedTable('')
          setSearchQuery('')
          setViewVersion('original')
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

  // Function to save config to file
  const saveConfigToFile = async (config: any) => {
    try {
      await apiClient.post(`/v1/workflows/${workflowId}/nodes/${node.id}/config`, config)
    } catch (error: any) {
      console.error('Failed to save config to file:', error)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.name.match(/\.duckdb$/i)) {
        toast.error('Please select a valid DuckDB file (.duckdb)')
        return
      }
      uploadMutation.mutate(file)
      // Reset input so same file can be selected again
      e.target.value = ''
    }
  }


  const handleAddRule = () => {
    setTempRule({
      applyToAllSheets: true,  // Default to apply to all sheets
      selectedSheets: [],
      applyToAllColumns: {},
      selectedColumns: {},
      condition: 'greater_than',
      value: '',
      action: 'clear_cell'
    })
    setEditingRuleIndex(null)
    setShowRuleDialog(true)
  }

  // Update value when condition changes to set defaults
  useEffect(() => {
    if (tempRule && showRuleDialog) {
      if (tempRule.condition === 'iqr' && !tempRule.value) {
        setTempRule({ ...tempRule, value: '1.5' })
      } else if (tempRule.condition === 'sigma' && !tempRule.value) {
        setTempRule({ ...tempRule, value: '3' })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tempRule?.condition, showRuleDialog])

  const handleEditRule = (index: number) => {
    const rule = outlierRules[index]
    // Convert to new format (arrays)
    // Support both new format (sheets/columns) and legacy format (sheet/column)
    let selectedSheets: string[] = []
    let selectedColumns: Record<string, string[]> = {}
    let applyToAllColumns: Record<string, boolean> = {}
    
    if (rule.sheets && rule.sheets.length > 0) {
      // New format
      selectedSheets = [...rule.sheets]
      selectedColumns = rule.columns ? { ...rule.columns } : {}
      // For each selected sheet, if no columns specified, apply to all columns
      selectedSheets.forEach(sheet => {
        applyToAllColumns[sheet] = !selectedColumns[sheet] || selectedColumns[sheet].length === 0
      })
    } else if (rule.sheet) {
      // Legacy format - convert to new format
      selectedSheets = [rule.sheet]
      if (rule.column) {
        selectedColumns[rule.sheet] = [rule.column]
        applyToAllColumns[rule.sheet] = false
      } else {
        applyToAllColumns[rule.sheet] = true
      }
    }
    
    setTempRule({
      applyToAllSheets: selectedSheets.length === 0,  // If no sheets selected, apply to all
      selectedSheets,
      applyToAllColumns,
      selectedColumns,
      condition: rule.condition,
      value: rule.value,
      action: rule.action || 'clear_cell'
    })
    setEditingRuleIndex(index)
    setShowRuleDialog(true)
  }

  const handleSaveRule = () => {
    if (!tempRule || !tempRule.condition) {
      toast.error('Please select a condition')
      return
    }
    // For IQR and sigma, use default values if not provided
    if ((tempRule.condition === 'iqr' || tempRule.condition === 'sigma') && !tempRule.value) {
      const defaultValue = tempRule.condition === 'iqr' ? '1.5' : '3'
      setTempRule({ ...tempRule, value: defaultValue })
    }
    // standardized_to_nominal doesn't require a value
    if (!tempRule.value && tempRule.condition !== 'iqr' && tempRule.condition !== 'sigma' && tempRule.condition !== 'standardized_to_nominal') {
      toast.error('Please fill in value')
      return
    }

    // Create a single rule with sheets and columns
    // Ensure value is always a string (use empty string for conditions that don't need a value)
    const ruleValue = tempRule.condition === 'standardized_to_nominal' ? '' : (tempRule.value || '')
    
    const newRule: {
      sequence?: number
      sheets?: string[]
      columns?: Record<string, string[]>
      sheet?: string
      column?: string
      condition: string
      value: string
      action?: 'clear_cell' | 'remove_row'
    } = {
      condition: tempRule.condition,
      value: ruleValue,
      action: tempRule.condition === 'standardized_to_nominal' ? undefined : (tempRule.action || 'clear_cell')
    }

    // Only include sheets if not applying to all sheets
    if (!tempRule.applyToAllSheets && tempRule.selectedSheets.length > 0) {
      newRule.sheets = [...tempRule.selectedSheets]
      
      // Only include columns for sheets that don't have "apply to all columns" enabled
      const columnsToSave: Record<string, string[]> = {}
      for (const sheet of tempRule.selectedSheets) {
        // If applyToAllColumns is false for this sheet, include selected columns
        if (!tempRule.applyToAllColumns[sheet]) {
          const cols = tempRule.selectedColumns[sheet] || []
          if (cols.length > 0) {
            columnsToSave[sheet] = [...cols]
          }
        }
        // If applyToAllColumns is true, don't include columns (means all columns)
      }
      if (Object.keys(columnsToSave).length > 0) {
        newRule.columns = columnsToSave
      }
    }
    // If applyToAllSheets is true, don't include sheets (means all sheets)

    const updatedRules = [...outlierRules]
    if (editingRuleIndex !== null) {
      // Update existing rule - preserve sequence
      const existingRule = updatedRules[editingRuleIndex]
      updatedRules[editingRuleIndex] = {
        ...newRule,
        sequence: existingRule.sequence !== undefined ? existingRule.sequence : editingRuleIndex
      }
    } else {
      // Add new rule - assign next sequence number
      const maxSequence = updatedRules.length > 0 
        ? Math.max(...updatedRules.map(r => r.sequence || 0))
        : -1
      updatedRules.push({
        ...newRule,
        sequence: maxSequence + 1
      })
    }
    
    // Sort by sequence before saving
    const sortedRules = updatedRules.sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
    setOutlierRules(sortedRules)
    saveRulesToConfig(sortedRules)
    setShowRuleDialog(false)
    setTempRule(null)
    setEditingRuleIndex(null)
  }

  const handleCancelRule = () => {
    setShowRuleDialog(false)
    setTempRule(null)
    setEditingRuleIndex(null)
  }

  const handleRemoveRule = (index: number) => {
    const newRules = outlierRules.filter((_, i) => i !== index)
    // Reassign sequence numbers to maintain order
    const reorderedRules = newRules.map((rule, i) => ({
      ...rule,
      sequence: i
    }))
    setOutlierRules(reorderedRules)
    saveRulesToConfig(reorderedRules)
  }

  const handleMoveRuleUp = (index: number) => {
    if (index === 0) return // Can't move first rule up
    
    const newRules = [...outlierRules]
    const currentRule = newRules[index]
    const previousRule = newRules[index - 1]
    
    // Swap sequence numbers
    const tempSequence = currentRule.sequence || index
    newRules[index] = { ...currentRule, sequence: previousRule.sequence || (index - 1) }
    newRules[index - 1] = { ...previousRule, sequence: tempSequence }
    
    // Sort by sequence
    const sortedRules = newRules.sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
    setOutlierRules(sortedRules)
    saveRulesToConfig(sortedRules)
  }

  const handleMoveRuleDown = (index: number) => {
    if (index === outlierRules.length - 1) return // Can't move last rule down
    
    const newRules = [...outlierRules]
    const currentRule = newRules[index]
    const nextRule = newRules[index + 1]
    
    // Swap sequence numbers
    const tempSequence = currentRule.sequence || index
    newRules[index] = { ...currentRule, sequence: nextRule.sequence || (index + 1) }
    newRules[index + 1] = { ...nextRule, sequence: tempSequence }
    
    // Sort by sequence
    const sortedRules = newRules.sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
    setOutlierRules(sortedRules)
    saveRulesToConfig(sortedRules)
  }

  // Helper function to save rules (including sheet and column) to config
  const saveRulesToConfig = async (rules: typeof outlierRules) => {
    if (!uploadedFileKey) return
    
    // Save condition, value, action, sequence, sheets/columns (new format) or sheet/column (legacy)
    const rulesToSave = rules.map(rule => {
      const ruleObj: any = {
        sequence: rule.sequence !== undefined ? rule.sequence : rules.indexOf(rule),
        condition: rule.condition,
        value: rule.value,
        action: rule.action || 'clear_cell'
      }
      
      // Save new format (sheets/columns arrays) if present
      if (rule.sheets && rule.sheets.length > 0) {
        ruleObj.sheets = rule.sheets
        if (rule.columns && Object.keys(rule.columns).length > 0) {
          ruleObj.columns = rule.columns
        }
      }
      
      // Also save legacy format for backward compatibility
      ruleObj.sheet = (rule.sheet && rule.sheet.trim() !== '') ? rule.sheet : null
      ruleObj.column = (rule.column && rule.column.trim() !== '') ? rule.column : null
      
      return ruleObj
    })
    
    try {
      const configToSave = {
        file_key: uploadedFileKey,
        filename: filename,
        outlier_rules: rulesToSave
        // Don't save selected_columns
      }
      await saveConfigToFile(configToSave)
      
      // Also update parent component's config
      if (onConfigUpdate) {
        onConfigUpdate({
          ...node.config,
          ...configToSave
        })
      }
    } catch (error: any) {
      console.error('Failed to save rules to config:', error)
    }
  }

  const handleApply = async () => {
    if (outlierRules.length === 0) {
      toast.error('Please add at least one outlier removal rule')
      return
    }
    
    if (!uploadedFileKey) {
      toast.error('Please select an input file first')
      return
    }
    
    // Save rules (including sheets/columns and sequence) before processing
    const rulesToSave = outlierRules.map(rule => {
      const ruleObj: any = {
        sequence: rule.sequence !== undefined ? rule.sequence : outlierRules.indexOf(rule),
        condition: rule.condition,
        value: rule.value,
        action: rule.action || 'clear_cell'
      }
      
      // Save new format (sheets/columns arrays) if present
      if (rule.sheets && rule.sheets.length > 0) {
        ruleObj.sheets = rule.sheets
        if (rule.columns && Object.keys(rule.columns).length > 0) {
          ruleObj.columns = rule.columns
        }
      }
      
      // Also save legacy format for backward compatibility
      ruleObj.sheet = (rule.sheet && rule.sheet.trim() !== '') ? rule.sheet : null
      ruleObj.column = (rule.column && rule.column.trim() !== '') ? rule.column : null
      
      return ruleObj
    })
    
    const configToSave = {
      file_key: uploadedFileKey,
      filename: filename,
      outlier_rules: rulesToSave
      // Don't save selected_columns - they default to all
    }
    
    try {
      // Save to file and database
      await saveConfigToFile(configToSave)
      
      // Also update parent component's config
      if (onConfigUpdate) {
        onConfigUpdate({
          ...node.config,
          ...configToSave
        })
      }
      
      console.log('Config saved before processing:', configToSave)
    } catch (error: any) {
      console.error('Failed to save config before processing:', error)
      toast.error('Failed to save settings. Please try again.')
      return
    }
    
    // Proceed with processing after config is saved
    processMutation.mutate({ rules: outlierRules })
  }

  // Load config when component mounts or config is loaded
  // Load rules (including sheet and column) regardless of file - they persist across files
  useEffect(() => {
    if (loadedConfig?.config) {
      const config = loadedConfig.config
      const configFileKey = config.file_key
      
      // Always load rules (including sheet and column) from config - they persist across files
      // Skip loading if we just updated rules to prevent overwriting the update
      if (justUpdatedRulesRef.current) {
        console.log('Skipping config load - rules were just updated')
        return
      }
      
      if (config.outlier_rules && Array.isArray(config.outlier_rules) && config.outlier_rules.length > 0) {
        const loadedRules = config.outlier_rules.map((rule: any, index: number) => ({
          // Sequence/order
          sequence: rule.sequence !== undefined ? rule.sequence : index,
          // New format
          sheets: rule.sheets && Array.isArray(rule.sheets) && rule.sheets.length > 0 ? rule.sheets : undefined,
          columns: rule.columns && typeof rule.columns === 'object' && Object.keys(rule.columns).length > 0 ? rule.columns : undefined,
          // Legacy format (for backward compatibility)
          sheet: rule.sheet && rule.sheet !== null ? rule.sheet : undefined,
          column: rule.column && rule.column !== null ? rule.column : undefined,
          condition: rule.condition || 'greater_than',
          value: rule.value || '',
          action: rule.action || 'clear_cell'
        })).sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0))
        // Only update if rules have changed to avoid unnecessary re-renders
        // Use a more robust comparison that handles object order
        const normalizeRules = (rules: typeof outlierRules) => {
          return JSON.stringify(rules.map(r => ({
            // Include sequence, new and legacy format for comparison
            sequence: r.sequence !== undefined ? r.sequence : rules.indexOf(r),
            sheets: r.sheets ? JSON.stringify(r.sheets.sort()) : '',
            columns: r.columns ? JSON.stringify(r.columns) : '',
            sheet: r.sheet || '',
            column: r.column || '',
            condition: r.condition,
            value: r.value,
            action: r.action || 'clear_cell'
          })).sort((a, b) => {
            // Sort by sequence first, then condition, then value for consistent comparison
            if (a.sequence !== b.sequence) return (a.sequence || 0) - (b.sequence || 0)
            if (a.condition !== b.condition) return a.condition.localeCompare(b.condition)
            return a.value.localeCompare(b.value)
          }))
        }
        
        const currentRulesStr = normalizeRules(outlierRules)
        const loadedRulesStr = normalizeRules(loadedRules)
        
        // Only update if rules are actually different
        // Skip update if we just updated rules (they should match what we saved)
        if (currentRulesStr !== loadedRulesStr) {
          // Check if the difference is significant enough to warrant an update
          // If current rules are empty or count differs, definitely update
          if (outlierRules.length === 0 || outlierRules.length !== loadedRules.length) {
            console.log('Loading rules from config (count differs):', loadedRules)
            setOutlierRules(loadedRules.map((r: typeof outlierRules[0]) => ({ ...r })))
          } else {
            // Rules count matches - check if content is significantly different
            // Only update if there are meaningful differences (not just order)
            const currentRulesMap = new Map(outlierRules.map((r: typeof outlierRules[0], i: number) => [i, normalizeRules([r])]))
            const loadedRulesMap = new Map(loadedRules.map((r: typeof outlierRules[0], i: number) => [i, normalizeRules([r])]))
            
            let hasSignificantDiff = false
            for (let i = 0; i < Math.max(outlierRules.length, loadedRules.length); i++) {
              const currentRule = currentRulesMap.get(i)
              const loadedRule = loadedRulesMap.get(i)
              if (currentRule !== loadedRule) {
                hasSignificantDiff = true
                break
              }
            }
            
            if (hasSignificantDiff) {
              console.log('Loading rules from config (content differs):', loadedRules)
              setOutlierRules(loadedRules.map((r: typeof outlierRules[0]) => ({ ...r })))
            } else {
              console.log('Skipping config load - rules match current state')
            }
          }
        }
      } else if (!config.outlier_rules || config.outlier_rules.length === 0) {
        // If no rules in config, keep current rules (don't clear them)
        // This allows rules to persist even if config doesn't have them yet
      }
      
      // Only load file-specific settings if config matches current file
      if (configFileKey && configFileKey === uploadedFileKey) {
        if (config.filename) setFilename(config.filename)
        // Don't load selected_columns - they default to all
      } else if (configFileKey && !uploadedFileKey) {
        // If no file is currently selected, load the file info
        if (config.file_key) setUploadedFileKey(config.file_key)
        if (config.filename) setFilename(config.filename)
        // Don't load selected_columns - they default to all
      }
    }
  }, [loadedConfig, uploadedFileKey])

  // Auto-select first table when tables list loads
  useEffect(() => {
    if (tablesListData && tablesListData.tables && tablesListData.tables.length > 0 && !selectedTable && !tableData?.table_name) {
      const firstTable = tablesListData.tables[0]
      if (firstTable) {
        setSelectedTable(firstTable.name)
        // Reset to page 1 when selecting a new table
        setTablePage(prev => ({ ...prev, [firstTable.name]: 1 }))
      }
    }
  }, [tablesListData, selectedTable, tableData])
  
  // Reset to page 1 when switching tables
  useEffect(() => {
    if (selectedTable && tablePage[selectedTable] === undefined) {
      setTablePage(prev => ({ ...prev, [selectedTable]: 1 }))
    }
  }, [selectedTable, tablePage])

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
        // Call async function without blocking
        handleSelectInputFile({
          name: targetFile.name,
          path: targetFile.path,
          metadata: targetFile.metadata
        }).catch(err => {
          console.error('Failed to auto-select file:', err)
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSelectFile, inputFilesData, uploadedFileKey])

  // Validate rules when tablesListData loads after file switch
  // This validates ALL rules to ensure they can be applied to the current file
  useEffect(() => {
    if (!tablesListData || !tablesListData.tables || tablesListData.tables?.length === 0) return
    if (outlierRules.length === 0) return
    if (!uploadedFileKey) return
    
    // Skip validation if we've already validated this file (unless validation dialog was just closed)
    // We'll reset this when validation completes
    if (lastValidatedFileRef.current === uploadedFileKey) return
    
    const availableTableNames = new Set(tablesListData.tables?.map(t => t.name) || [])
    const tableColumnsMap = new Map<string, Set<string>>()
    tablesListData.tables?.forEach(table => {
      tableColumnsMap.set(table.name, new Set(table.columns))
    })
    
    const invalidRules: Array<{
      ruleIndex: number
      rule: typeof outlierRules[0]
      missingSheet?: string
      missingColumn?: string
    }> = []
    
    outlierRules.forEach((rule, index) => {
      let missingSheet: string | undefined
      let missingColumn: string | undefined
      
      // Check new format (sheets/columns arrays)
      if (rule.sheets && rule.sheets.length > 0) {
        // Check if all sheets exist
        for (const sheet of rule.sheets) {
          if (!availableTableNames.has(sheet)) {
            missingSheet = sheet
            break
          }
        }
        
        // Check columns if specified
        if (rule.columns && !missingSheet) {
          for (const [sheet, columns] of Object.entries(rule.columns)) {
            if (rule.sheets.includes(sheet)) {
              const availableColumns = tableColumnsMap.get(sheet)
              if (availableColumns) {
                for (const col of columns) {
                  if (!availableColumns.has(col)) {
                    missingColumn = col
                    break
                  }
                }
              }
            }
            if (missingColumn) break
          }
        }
      } else if (rule.sheet) {
        // Legacy format: check if table exists
        if (!availableTableNames.has(rule.sheet)) {
          missingSheet = rule.sheet
        }
        
        // Check if column exists in the specified table
        if (rule.column && !missingSheet) {
          const columns = tableColumnsMap.get(rule.sheet)
          if (!columns || !columns.has(rule.column)) {
            missingColumn = rule.column
          }
        }
      } else if (rule.column) {
        // Legacy format: column without sheet - check if exists in any table
        let found = false
        for (const tableName of Array.from(tableColumnsMap.keys())) {
          const columns = tableColumnsMap.get(tableName)
          if (columns && columns.has(rule.column)) {
            found = true
            break
          }
        }
        if (!found) {
          missingColumn = rule.column
        }
      }
      
      // If this rule has invalid references, add it to the list
      if (missingSheet || missingColumn) {
        invalidRules.push({
          ruleIndex: index,
          rule,
          missingSheet,
          missingColumn
        })
      }
    })
    
    // If there are invalid rules, show alert
    // Don't mark as validated yet - wait until user resolves issues
    if (invalidRules.length > 0) {
      // Select all rules by default
      setSelectedRulesToUpdate(new Set(invalidRules.map(ir => ir.ruleIndex)))
      // Reset rule updates
      setRuleUpdates(new Map())
      
      setValidationAlert({
        open: true,
        invalidRules,
        onUpdate: async (selectedIndices: number[]) => {
          // Apply updates: remove rules marked for removal, update others with new sheet/column
          const rulesToRemove = new Set<number>()
          
          // First, identify all rules to remove
          ruleUpdates.forEach((update, index) => {
            if (update.remove) {
              rulesToRemove.add(index)
            }
          })
          
          // Track which rules have user updates (sheet/column changes)
          const rulesWithUserUpdates = new Set<number>()
          ruleUpdates.forEach((update, index) => {
            if (update && !update.remove && ('sheet' in update || 'column' in update)) {
              rulesWithUserUpdates.add(index)
            }
          })
          
          const updatedRules = outlierRules.map((rule, index) => {
            // Check if this rule should be removed
            if (rulesToRemove.has(index)) {
              return null // Mark for removal
            }
            
            let updatedRule = { ...rule }
            
            // Apply user's updates if any (regardless of selection - user explicitly changed it)
            const userUpdate = ruleUpdates.get(index)
            if (userUpdate && !userUpdate.remove) {
              // Apply sheet update if it exists in the update (even if undefined - user cleared it)
              if ('sheet' in userUpdate) {
                updatedRule.sheet = userUpdate.sheet || undefined
              }
              // Apply column update if it exists in the update (even if undefined - user cleared it)
              if ('column' in userUpdate) {
                updatedRule.column = userUpdate.column || undefined
              }
            }
            
            // For selected rules without user updates, apply fallback: remove invalid references
            if (selectedIndices.includes(index) && !rulesWithUserUpdates.has(index)) {
              // Find the invalid rule info
              const invalidRule = invalidRules.find(ir => ir.ruleIndex === index)
              if (invalidRule) {
                // Fallback: remove invalid sheet/column if no user update
                if (invalidRule.missingSheet) {
                  updatedRule.sheet = undefined
                }
                if (invalidRule.missingColumn) {
                  updatedRule.column = undefined
                }
              }
            }
            
            return updatedRule
          }).filter((rule) => rule !== null) as typeof outlierRules
          
          // Save updated rules to config first
          if (uploadedFileKey) {
            const configToSave = {
              file_key: uploadedFileKey,
              filename: filename,
              outlier_rules: updatedRules.map(rule => {
                const ruleObj: any = {
                  condition: rule.condition,
                  value: rule.value,
                  action: rule.action || 'clear_cell'
                }
                // Always include sheet and column fields
                // Use null for empty/undefined, otherwise use the actual value
                ruleObj.sheet = (rule.sheet && rule.sheet.trim() !== '') ? rule.sheet : null
                ruleObj.column = (rule.column && rule.column.trim() !== '') ? rule.column : null
                return ruleObj
              })
            }
            
            await saveConfigToFile(configToSave)
            
            // Also update parent component's config
            if (onConfigUpdate) {
              onConfigUpdate({
                ...node.config,
                ...configToSave
              })
            }
          }
          
          // Update rules state AFTER saving to config
          // This ensures the state matches what's saved and triggers re-render
          // Create new references for both array and each rule object to ensure React detects the change
          console.log('Updating rules in state:', updatedRules)
          console.log('Rule updates applied:', Array.from(ruleUpdates.entries()))
          const newRules = updatedRules.map(rule => ({ ...rule }))
          
          // Mark that we just updated rules to prevent config loading from overwriting
          justUpdatedRulesRef.current = true
          setOutlierRules(newRules)
          
          // Mark file as validated after successful update
          lastValidatedFileRef.current = uploadedFileKey
          
          // Reset validation state
          setValidationAlert({ ...validationAlert, open: false })
          setSelectedRulesToUpdate(new Set())
          setRuleUpdates(new Map())
          
          // Clear the flag after a short delay to allow state to settle
          setTimeout(() => {
            justUpdatedRulesRef.current = false
          }, 500)
          
          // Invalidate config query in background (don't await) to sync with server
          // But don't refetch immediately to avoid overwriting our just-updated state
          queryClient.invalidateQueries({ queryKey: ['node-config', workflowId, node.id] })
          
          const removedCount = rulesToRemove.size
          // Count rules that are updated but not removed
          const updatedCount = rulesWithUserUpdates.size + selectedIndices.filter(idx => !rulesToRemove.has(idx) && !rulesWithUserUpdates.has(idx)).length
          if (removedCount > 0 && updatedCount > 0) {
            toast.success(`Removed ${removedCount} rule(s) and updated ${updatedCount} rule(s)`)
          } else if (removedCount > 0) {
            toast.success(`Removed ${removedCount} rule(s)`)
          } else {
            toast.success(`Updated ${updatedCount} rule(s)`)
          }
        },
        onKeep: () => {
          // Keep the rules as-is (user chose to keep invalid references)
          // Mark as validated even though there are issues - user chose to keep them
          lastValidatedFileRef.current = uploadedFileKey
          
          setValidationAlert({ ...validationAlert, open: false })
          setSelectedRulesToUpdate(new Set())
          setRuleUpdates(new Map())
          toast('Keeping rules as-is. Please update manually if needed.', { icon: 'ℹ️' })
        }
      })
    } else {
      // No invalid rules - all rules are valid for this file
      // Mark as validated
      lastValidatedFileRef.current = uploadedFileKey
    }
  }, [tablesListData, outlierRules, uploadedFileKey]) // Validate when tablesListData or rules change

  // Reset to page 1 when version changes or file changes
  useEffect(() => {
    setTablePage({})
  }, [viewVersion, uploadedFileKey])

  useEffect(() => {
    setCsvPackageInfo(null)
    setCsvConversionState({ status: 'idle', message: '' })
  }, [uploadedFileKey])

  // When viewing table data, currentTable comes from tableData directly (has data, columns, total_rows, displayed_rows)
  // When listing tables, we get it from the tables array (has name, row_count, columns)
  
  // Type guard to check if currentTable has data (is table data view)
  const isTableDataView = (t: any): t is { name: string; columns: string[]; data: any[]; total_rows: number; displayed_rows: number } => {
    return t && 'data' in t && 'total_rows' in t
  }
  
  // Build currentTable from tableData (for viewing) or tablesListData (for listing)
  const currentTable = selectedTable && tableData?.table_name === selectedTable
    ? {
        name: tableData?.table_name!,
        columns: tableData?.columns || [],
        data: tableData?.data || [], // Use only current page data
        total_rows: tableData?.total_rows || 0,
        displayed_rows: tableData?.data?.length || 0,
        limit: tableData?.limit || tableLimit,
        offset: tableData?.offset || 0
      } as { name: string; columns: string[]; data: any[]; total_rows: number; displayed_rows: number; limit?: number; offset?: number }
    : tablesListData?.tables?.find((t: { name: string; columns: string[] }) => t.name === selectedTable)

  // Pagination handlers
  const handlePreviousPage = () => {
    if (selectedTable && currentPage > 1) {
      setTablePage(prev => ({ ...prev, [selectedTable]: currentPage - 1 }))
    }
  }

  const handleNextPage = () => {
    if (selectedTable && currentTable && isTableDataView(currentTable)) {
      const totalPages = Math.ceil(currentTable.total_rows / tableLimit)
      if (currentPage < totalPages) {
        setTablePage(prev => ({ ...prev, [selectedTable]: currentPage + 1 }))
      }
    }
  }

  const handleGoToPage = (page: number) => {
    if (selectedTable) {
      setTablePage(prev => ({ ...prev, [selectedTable]: page }))
    }
  }

  return (
    <div className={`${isStandalone ? 'h-full' : 'h-screen'} flex flex-col bg-gray-50`}>
      {/* Top Menu Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSwitchInputFile}
            className="flex items-center space-x-2"
          >
            <FileText className="h-4 w-4" />
            <span>Switch Input File</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".duckdb"
            onChange={handleFileSelect}
            className="hidden"
          />
          {uploadedFileKey && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleApply}
                disabled={processMutation.isPending || outlierRules.length === 0}
                className="flex items-center space-x-2"
              >
                <Play className="h-4 w-4" />
                <span>Apply Rules</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadDuckDBMutation.mutate()}
                disabled={downloadDuckDBMutation.isPending || viewVersion !== 'processed'}
                className="flex items-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span>Download DuckDB</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => convertToCsvMutation.mutate()}
                disabled={convertToCsvMutation.isPending || viewVersion !== 'processed'}
                className="flex items-center space-x-2"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span>Convert to CSV Zip</span>
              </Button>
              {csvPackageInfo && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCsvZipMutation.mutate()}
                  disabled={downloadCsvZipMutation.isPending}
                  className="flex items-center space-x-2"
                >
                  <Download className="h-4 w-4" />
                  <span>Download CSV Zip</span>
                </Button>
              )}
              {csvConversionState.status === 'error' && (
                <span className="text-xs text-red-600">
                  {csvConversionState.message}
                </span>
              )}
              {viewVersion === 'processed' && tablesListData?.tables && tablesListData.tables.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNextNodeDialog(true)}
                    className="flex items-center space-x-2"
                  >
                    <ArrowRight className="h-4 w-4" />
                    <span>Move to Next Node</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowExistingNodeDialog(true)
                      setSelectedExistingModule('')
                    }}
                    className="flex items-center space-x-2"
                  >
                    <ArrowRight className="h-4 w-4" />
                    <span>Move to Existing Node</span>
                  </Button>
                </>
              )}
            </>
          )}
          {processingProgress && (
            <div className="flex items-center space-x-2 text-sm mt-2">
              <Progress value={processingProgress.progress} className="w-48" />
              <span className="text-xs text-gray-600">{processingProgress.message}</span>
            </div>
          )}
          {uploadProgress && (
            <div className="flex items-center space-x-2 text-sm mt-2">
              <Progress value={uploadProgress.progress} className="w-48" />
              <span className="text-xs text-gray-600">{uploadProgress.message}</span>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {filename && (
            <span className="text-sm text-gray-600 flex items-center space-x-2">
              <FileSpreadsheet className="h-4 w-4" />
              <span>{filename}</span>
            </span>
          )}
          {uploadedFileKey && (
            <div className="flex items-center space-x-2">
              <Button
                variant={viewVersion === 'original' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewVersion('original')}
              >
                Original
              </Button>
              <Button
                variant={viewVersion === 'processed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewVersion('processed')}
                disabled={viewVersion === 'processed' && !tablesListData}
              >
                Processed
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Rules and Column Selection */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          {!uploadedFileKey ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <FileSpreadsheet className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-600 mb-2">No file opened</p>
                <p className="text-sm text-gray-400">Open an DuckDB file to get started</p>
              </div>
            </div>
          ) : loadingData ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600">Loading data...</p>
              </div>
            </div>
          ) : !tablesListData ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <p className="text-gray-600">No data available</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Save Rules Button */}
              <div className="border-b border-gray-200 p-3 bg-gray-50">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!uploadedFileKey) {
                      toast.error('Please select an input file first')
                      return
                    }
                    try {
                      // Save all rule fields including sheet and column
                      // Use null instead of undefined so fields are preserved in JSON
                      const rulesToSave = outlierRules.map(rule => {
                        const ruleObj: any = {
                          condition: rule.condition,
                          value: rule.value,
                          action: rule.action || 'clear_cell'
                        }
                        // Always include sheet and column fields
                        // Use null for empty/undefined, otherwise use the actual value
                        ruleObj.sheet = (rule.sheet && rule.sheet.trim() !== '') ? rule.sheet : null
                        ruleObj.column = (rule.column && rule.column.trim() !== '') ? rule.column : null
                        return ruleObj
                      })
                      const configToSave = {
                        file_key: uploadedFileKey,
                        filename: filename,
                        outlier_rules: rulesToSave
                        // Don't save selected_columns - they default to all
                      }
                      await saveConfigToFile(configToSave)
                      if (onConfigUpdate) {
                        onConfigUpdate({
                          ...node.config,
                          ...configToSave
                        })
                      }
                      toast.success('Rules saved successfully')
                    } catch (error: any) {
                      console.error('Failed to save settings:', error)
                      toast.error('Failed to save settings. Please try again.')
                    }
                  }}
                  className="w-full flex items-center justify-center space-x-2"
                  disabled={!uploadedFileKey}
                >
                  <Save className="h-4 w-4" />
                  <span>Save Rules</span>
                </Button>
              </div>

              {/* Search Bar */}
              {uploadedFileKey && tablesListData && tablesListData.tables && tablesListData.tables.length > 0 && (
                <div className="border-b border-gray-200 p-3 bg-gray-50">
                  <Label className="text-xs font-semibold mb-2 block">Search in Table</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="Search values in table..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-8 text-sm"
                    />
                  </div>
                </div>
              )}
              
              {/* Rules Configuration */}
              <div className="flex-1 overflow-y-auto p-4 min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Outlier Removal Rules</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddRule}
                    className="h-7 px-2"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Each rule can target specific sheets and columns. Rules are applied in the order shown. Use the up/down arrows to reorder.
                </p>
                <div className="space-y-2">
                  {outlierRules.length === 0 ? (
                    <div className="text-center py-8 text-sm text-gray-400">
                      No rules defined. Add a rule to get started.
                    </div>
                  ) : (
                    outlierRules.map((rule, index) => {
                      // Determine scope description for this rule
                      const scopeDescription = (() => {
                        // New format: sheets and columns arrays
                        if (rule.sheets && rule.sheets.length > 0) {
                          const sheetList = rule.sheets.length === 1 ? rule.sheets[0] : `${rule.sheets.length} sheets`
                          if (rule.columns && Object.keys(rule.columns).length > 0) {
                            // Has specific columns
                            const columnCounts = rule.sheets.map(sheet => {
                              const cols = rule.columns![sheet] || []
                              return cols.length > 0 ? `${cols.length} cols` : 'all cols'
                            })
                            return `${sheetList} (${columnCounts.join(', ')})`
                          } else {
                            return `all columns in ${sheetList}`
                          }
                        }
                        // Legacy format: single sheet/column
                        if (rule.sheet && rule.column) {
                          return `${rule.column} in ${rule.sheet}`
                        } else if (rule.sheet) {
                          return `all columns in ${rule.sheet}`
                        } else if (rule.column) {
                          return `${rule.column} in all sheets`
                        } else {
                          return `all columns in all sheets`
                        }
                      })()
                      
                      const conditionLabel = (() => {
                        switch (rule.condition) {
                          case 'greater_than': return '>'
                          case 'less_than': return '<'
                          case 'equals': return '='
                          case 'contains': return 'contains'
                          case 'iqr': return `IQR (${rule.value || '1.5'})`
                          case 'sigma': return `Sigma (${rule.value || '3'})`
                          default: return rule.condition
                        }
                      })()
                      
                      return (
                        <Card key={index} className="p-3 hover:bg-gray-50 transition-colors">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold text-gray-700">Rule {index + 1}</span>
                                <span className="text-xs text-gray-400">(Order: {rule.sequence !== undefined ? rule.sequence + 1 : index + 1})</span>
                              </div>
                              <div className="text-xs text-gray-600 space-y-0.5">
                                <div className="truncate">
                                  <span className="font-medium">Scope:</span> {scopeDescription}
                                </div>
                                <div>
                                  <span className="font-medium">Condition:</span> {conditionLabel} {rule.value}
                                </div>
                                <div>
                                  <span className="font-medium">Action:</span> {rule.action === 'remove_row' ? 'Remove Row' : 'Clear Cell'}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col items-center gap-1 ml-2 flex-shrink-0">
                              <div className="flex items-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleMoveRuleUp(index)}
                                  disabled={index === 0}
                                  className="h-6 w-6 p-0 text-gray-600 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Move up"
                                >
                                  <ChevronUp className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleMoveRuleDown(index)}
                                  disabled={index === outlierRules.length - 1}
                                  className="h-6 w-6 p-0 text-gray-600 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Move down"
                                >
                                  <ChevronDown className="h-3 w-3" />
                                </Button>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditRule(index)}
                                  className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                  title="Edit rule"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveRule(index)}
                                  className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  title="Delete rule"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </Card>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Table Viewer */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {!uploadedFileKey ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <FileSpreadsheet className="h-24 w-24 mx-auto text-gray-300 mb-4" />
                <p className="text-lg font-medium text-gray-600 mb-2">No file opened</p>
                <p className="text-sm text-gray-400 mb-4">Click "Switch Input File" to load an DuckDB file</p>
                <Button onClick={handleSwitchInputFile} variant="default">
                  <FileText className="h-4 w-4 mr-2" />
                  Switch Input File
                </Button>
              </div>
            </div>
          ) : loadingData ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading Excel data...</p>
              </div>
            </div>
          ) : !tablesListData || tablesListData.tables?.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-gray-600">
                  {tablesListData?.message || 'No data available'}
                </p>
                {viewVersion === 'processed' && !tablesListData?.tables?.length && (
                  <p className="text-sm text-gray-400 mt-2">
                    Please process the file first to view the processed version.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Sheet Selector */}
              <div className="border-b border-gray-200 px-4 py-2">
                <div className="flex items-center space-x-2 overflow-x-auto">
                  {tablesListData?.tables?.map((table: { name: string; row_count: number; columns: string[] }) => (
                    <Button
                      key={table.name}
                      variant={selectedTable === table.name ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setSelectedTable(table.name)
                        // Reset to page 1 when switching tables
                        setTablePage(prev => ({ ...prev, [table.name]: 1 }))
                      }}
                      className="text-xs"
                    >
                      {table.name} ({table.row_count} rows)
                    </Button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-auto p-4">
                {currentTable && isTableDataView(currentTable) ? (
                  <div className="border border-gray-200 rounded-lg overflow-x-auto">
                    <table className="min-w-full text-sm border-collapse">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          {currentTable.columns.map((col, colIdx) => (
                            <th
                              key={colIdx}
                              className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-700 bg-gray-50"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          // Filter data based on search query
                          let filteredData = currentTable.data
                          if (searchQuery.trim()) {
                            const query = searchQuery.toLowerCase()
                            filteredData = currentTable.data.filter((row) => {
                              return currentTable.columns.some((col) => {
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
                                  colSpan={currentTable.columns.length}
                                  className="border border-gray-200 px-3 py-8 text-center text-gray-400"
                                >
                                  {searchQuery.trim() 
                                    ? `No results found for "${searchQuery}"` 
                                    : 'No data to display'}
                                </td>
                              </tr>
                            )
                          }
                          
                          return filteredData.map((row, rowIdx) => (
                            <tr key={rowIdx} className="hover:bg-gray-50">
                              {currentTable.columns.map((col, colIdx) => {
                                const cellValue = row[col]
                                const cellStr = cellValue !== null && cellValue !== undefined
                                  ? String(cellValue)
                                  : ''
                                const isMatch = searchQuery.trim() && cellStr.toLowerCase().includes(searchQuery.toLowerCase())
                                
                                return (
                                  <td
                                    key={colIdx}
                                    className={`border border-gray-200 px-3 py-2 text-gray-800 ${
                                      isMatch ? 'bg-yellow-100 font-medium' : ''
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
                    {/* Pagination Controls */}
                    {(() => {
                      const totalPages = Math.ceil(currentTable.total_rows / tableLimit)
                      const startRow = currentOffset + 1
                      const endRow = Math.min(currentOffset + tableLimit, currentTable.total_rows)
                      const filteredCount = searchQuery.trim() 
                        ? currentTable.data.filter((row) => {
                            const query = searchQuery.toLowerCase()
                            return currentTable.columns.some((col) => {
                              const value = row[col]
                              if (value === null || value === undefined) return false
                              return String(value).toLowerCase().includes(query)
                            })
                          }).length
                        : currentTable.displayed_rows
                      
                      // Calculate page numbers to show (show up to 5 page numbers)
                      const getPageNumbers = () => {
                        const pages: (number | string)[] = []
                        if (totalPages <= 7) {
                          // Show all pages if 7 or fewer
                          for (let i = 1; i <= totalPages; i++) {
                            pages.push(i)
                          }
                        } else {
                          // Show first, last, current, and neighbors
                          if (currentPage <= 3) {
                            for (let i = 1; i <= 4; i++) pages.push(i)
                            pages.push('...')
                            pages.push(totalPages)
                          } else if (currentPage >= totalPages - 2) {
                            pages.push(1)
                            pages.push('...')
                            for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i)
                          } else {
                            pages.push(1)
                            pages.push('...')
                            for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i)
                            pages.push('...')
                            pages.push(totalPages)
                          }
                        }
                        return pages
                      }
                      
                      return (
                        <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                          <div className="text-sm text-gray-600">
                            {searchQuery.trim() ? (
                              <>Showing {filteredCount} matching row{filteredCount !== 1 ? 's' : ''} (of {currentTable.total_rows} total)</>
                            ) : (
                              <>Showing {startRow}-{endRow} of {currentTable.total_rows} rows</>
                            )}
                          </div>
                          {!searchQuery.trim() && totalPages > 1 && (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handlePreviousPage}
                                disabled={currentPage === 1 || loadingData}
                                className="h-8 px-3"
                              >
                                Previous
                              </Button>
                              <div className="flex items-center gap-1">
                                {getPageNumbers().map((page, idx) => {
                                  if (page === '...') {
                                    return <span key={`ellipsis-${idx}`} className="px-2 text-gray-400">...</span>
                                  }
                                  const pageNum = page as number
                                  return (
                                    <Button
                                      key={pageNum}
                                      variant={currentPage === pageNum ? "default" : "ghost"}
                                      size="sm"
                                      onClick={() => handleGoToPage(pageNum)}
                                      disabled={loadingData}
                                      className="h-8 w-8 p-0"
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
                                disabled={currentPage >= totalPages || loadingData}
                                className="h-8 px-3"
                              >
                                Next
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                ) : selectedTable ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      {loadingData ? (
                        <>
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
                          <p className="text-gray-400">Loading table data...</p>
                        </>
                      ) : (
                        <p className="text-gray-400">Loading table data...</p>
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
          )}
        </div>
      </div>

      {/* CSV Conversion Progress Dialog */}
      <Dialog open={csvConversionState.status === 'processing'} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Generating CSV Files</DialogTitle>
            <DialogDescription>
              Large tables may take several minutes to export. Please keep this window open until completion.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center space-y-3 py-4">
            <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
            <p className="text-sm text-gray-700 text-center">
              {csvConversionState.message || 'Preparing CSV package...'}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Input File Selection Dialog */}
      <Dialog open={showInputFileDialog} onOpenChange={(open) => {
        // Prevent closing dialog during upload
        if (!open && uploadProgress && uploadProgress.status === 'uploading') {
          return
        }
        setShowInputFileDialog(open)
      }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Input File</DialogTitle>
            <DialogDescription>
              Choose an input file from the node's input folder. Files are shown with their metadata.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
              disabled={uploadProgress?.status === 'uploading'}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload New File
            </Button>
            {uploadProgress && uploadProgress.status === 'uploading' && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-900">Uploading file...</span>
                  <span className="text-sm text-blue-700">{uploadProgress.progress}%</span>
                </div>
                <Progress value={uploadProgress.progress} className="h-2" />
                <p className="text-xs text-blue-600 mt-2">{uploadProgress.message}</p>
              </div>
            )}
            {inputFilesData?.folders?.input && inputFilesData.folders.input.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Existing Input Files:</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {inputFilesData.folders.input.map((file) => (
                    <div
                      key={file.name}
                      className={`relative w-full px-4 py-3 rounded-lg border hover:bg-gray-50 transition-all ${
                        file.path === uploadedFileKey ? 'bg-indigo-50 border-indigo-200' : 'border-gray-200'
                      }`}
                    >
                      <button
                        onClick={() => handleSelectInputFile(file)}
                        className="w-full text-left pr-8"
                      >
                        <div className="flex items-start space-x-3">
                          <FileSpreadsheet className="h-5 w-5 text-gray-400 mt-0.5" />
                          <div className="flex-1">
                            {file.metadata ? (
                              <>
                                <div className="font-medium text-gray-900">{file.metadata.original_filename}</div>
                                <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                                  <div>Type: {file.metadata.file_type}</div>
                                  <div>Uploaded: {new Date(file.metadata.uploaded_time).toLocaleString()}</div>
                                  <div>Size: {(file.metadata.file_size / 1024).toFixed(2)} KB</div>
                                  <div>UUID: {file.metadata.uuid_filename}</div>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="font-medium text-gray-900">{file.name}</div>
                                <div className="text-xs text-gray-500 mt-1">
                                  Size: {(file.size / 1024).toFixed(2)} KB
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={(e) => handleDeleteFile(e, file)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
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
              <p className="text-sm text-gray-500 text-center py-4">No input files found. Upload a file to get started.</p>
            )}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Uploading File</DialogTitle>
            <DialogDescription>
              Please wait while your file is being uploaded. This may take a while for large files.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Progress</span>
                <span className="font-medium text-gray-900">{uploadProgress?.progress || 0}%</span>
              </div>
              <Progress value={uploadProgress?.progress || 0} className="h-3" />
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">{uploadProgress?.message || 'Uploading...'}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Validation Alert Dialog */}
      <AlertDialog open={validationAlert.open} onOpenChange={(open) => {
        if (!open) {
          setValidationAlert({ ...validationAlert, open: false })
          setSelectedRulesToUpdate(new Set())
          setRuleUpdates(new Map())
        }
      }}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Invalid Sheet/Column References</AlertDialogTitle>
            <AlertDialogDescription>
              Some rules reference sheets or columns that don't exist in the current file.
              Select which rules you want to update:
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="mt-4 space-y-3 max-h-[400px] overflow-y-auto">
            {validationAlert.invalidRules.map((invalidRule) => {
              const rule = invalidRule.rule
              const isSelected = selectedRulesToUpdate.has(invalidRule.ruleIndex)
              const update = ruleUpdates.get(invalidRule.ruleIndex)
              const isMarkedForRemoval = update?.remove === true
              
              // Get current sheet/column (user update or original)
              // Check if property exists in update (even if value is undefined - user cleared it)
              const currentTable = update && 'sheet' in update ? update.sheet : rule.sheet
              const currentColumn = update && 'column' in update ? update.column : rule.column
              
              // Get available columns for the selected table
              const selectedTableData = tablesListData?.tables?.find(t => t.name === currentTable)
              const availableColumns = selectedTableData?.columns || []
              
              return (
                <div
                  key={invalidRule.ruleIndex}
                  className={`border rounded-lg p-3 ${isMarkedForRemoval ? 'bg-red-50 border-red-200' : 'bg-gray-50'}`}
                >
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      checked={isSelected && !isMarkedForRemoval}
                      disabled={isMarkedForRemoval}
                      onCheckedChange={(checked) => {
                        const newSelected = new Set(selectedRulesToUpdate)
                        if (checked) {
                          newSelected.add(invalidRule.ruleIndex)
                        } else {
                          newSelected.delete(invalidRule.ruleIndex)
                        }
                        setSelectedRulesToUpdate(newSelected)
                      }}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-sm text-gray-900">
                          Rule {invalidRule.ruleIndex + 1}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const newUpdates = new Map(ruleUpdates)
                            if (isMarkedForRemoval) {
                              // Unmark for removal
                              const existing = newUpdates.get(invalidRule.ruleIndex)
                              if (existing) {
                                const { remove, ...rest } = existing
                                if (Object.keys(rest).length > 0) {
                                  newUpdates.set(invalidRule.ruleIndex, rest)
                                } else {
                                  newUpdates.delete(invalidRule.ruleIndex)
                                }
                              } else {
                                newUpdates.delete(invalidRule.ruleIndex)
                              }
                            } else {
                              // Mark for removal
                              newUpdates.set(invalidRule.ruleIndex, { ...update, remove: true })
                              // Also deselect from update
                              const newSelected = new Set(selectedRulesToUpdate)
                              newSelected.delete(invalidRule.ruleIndex)
                              setSelectedRulesToUpdate(newSelected)
                            }
                            setRuleUpdates(newUpdates)
                          }}
                          className={`h-6 px-2 text-xs ${isMarkedForRemoval ? 'text-red-600 hover:text-red-700' : 'text-gray-600 hover:text-red-600'}`}
                        >
                          {isMarkedForRemoval ? 'Restore' : 'Remove Rule'}
                        </Button>
                      </div>
                      
                      {!isMarkedForRemoval && (
                        <>
                          <div className="mt-1 text-xs text-gray-600 space-y-1 mb-3">
                            <div>
                              <span className="font-medium">Condition:</span> {rule.condition.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </div>
                            <div>
                              <span className="font-medium">Value:</span> {rule.value || '(empty)'}
                            </div>
                            <div>
                              <span className="font-medium">Action:</span> {(rule.action || 'clear_cell').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </div>
                          </div>
                          
                          {/* Sheet Selection */}
                          <div className="mt-2">
                            <Label className="text-xs font-medium">Sheet (optional)</Label>
                            <select
                              value={currentTable || ''}
                              onChange={(e) => {
                                const newSheet = e.target.value || undefined
                                const newUpdates = new Map(ruleUpdates)
                                const existing = newUpdates.get(invalidRule.ruleIndex) || {}
                                newUpdates.set(invalidRule.ruleIndex, {
                                  ...existing,
                                  sheet: newSheet,
                                  // Clear column if sheet changes and column doesn't exist in new sheet
                                  column: newSheet ? existing.column : undefined
                                })
                                setRuleUpdates(newUpdates)
                              }}
                              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                            >
                              <option value="">All Sheets</option>
                              {tablesListData?.tables?.map((table, idx) => (
                                <option key={idx} value={table.name}>{table.name}</option>
                              ))}
                            </select>
                            {invalidRule.missingSheet && !currentTable && (
                              <span className="text-xs text-red-600 mt-1 block">
                                Original sheet "{invalidRule.missingSheet}" not found
                              </span>
                            )}
                          </div>
                          
                          {/* Column Selection */}
                          <div className="mt-2">
                            <Label className="text-xs font-medium">Column (optional)</Label>
                            <select
                              value={currentColumn || ''}
                              onChange={(e) => {
                                const newColumn = e.target.value || undefined
                                const newUpdates = new Map(ruleUpdates)
                                const existing = newUpdates.get(invalidRule.ruleIndex) || {}
                                newUpdates.set(invalidRule.ruleIndex, {
                                  ...existing,
                                  column: newColumn
                                })
                                setRuleUpdates(newUpdates)
                              }}
                              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                              disabled={!currentTable}
                            >
                              <option value="">All Columns (default)</option>
                              {currentTable && availableColumns.map((col, idx) => (
                                <option key={idx} value={col}>{col}</option>
                              ))}
                              {!currentTable && tablesListData?.tables?.flatMap(table => 
                                (table.columns || []).map((col, idx) => (
                                  <option key={`${table.name}-${idx}`} value={col}>
                                    {col} ({table.name})
                                  </option>
                                ))
                              )}
                            </select>
                            {invalidRule.missingColumn && !currentColumn && (
                              <span className="text-xs text-red-600 mt-1 block">
                                Original column "{invalidRule.missingColumn}" not found{currentTable ? ` in "${currentTable}"` : ' in any sheet'}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                      
                      {isMarkedForRemoval && (
                        <div className="mt-2 text-sm text-red-600 font-medium">
                          This rule will be removed
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {(() => {
                const removedCount = Array.from(ruleUpdates.values()).filter(u => u.remove).length
                const selectedCount = selectedRulesToUpdate.size
                const totalActions = removedCount + selectedCount
                
                if (totalActions === 0) {
                  return <span className="text-orange-600">Please select rules to update or remove</span>
                }
                
                const parts: string[] = []
                if (selectedCount > 0) {
                  parts.push(`${selectedCount} to update`)
                }
                if (removedCount > 0) {
                  parts.push(`${removedCount} to remove`)
                }
                return <span>{parts.join(', ')} of {validationAlert.invalidRules.length} rule(s)</span>
              })()}
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Select all
                  setSelectedRulesToUpdate(new Set(validationAlert.invalidRules.map(ir => ir.ruleIndex)))
                }}
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Deselect all
                  setSelectedRulesToUpdate(new Set())
                }}
              >
                Deselect All
              </Button>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={validationAlert.onKeep}>
              Keep As-Is
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const selectedIndices = Array.from(selectedRulesToUpdate)
                const removedCount = Array.from(ruleUpdates.values()).filter(u => u.remove).length
                
                if (selectedIndices.length > 0 || removedCount > 0) {
                  validationAlert.onUpdate(selectedIndices)
                } else {
                  toast.error('Please select at least one rule to update or remove')
                }
              }}
              disabled={selectedRulesToUpdate.size === 0 && Array.from(ruleUpdates.values()).filter(u => u.remove).length === 0}
            >
              {(() => {
                const removedCount = Array.from(ruleUpdates.values()).filter(u => u.remove).length
                const selectedCount = selectedRulesToUpdate.size
                if (removedCount > 0 && selectedCount > 0) {
                  return `Apply Changes (${selectedCount} update, ${removedCount} remove)`
                } else if (removedCount > 0) {
                  return `Remove ${removedCount} Rule(s)`
                } else {
                  return `Update ${selectedCount} Rule(s)`
                }
              })()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move to Next Node Dialog */}
      <Dialog open={showNextNodeDialog} onOpenChange={setShowNextNodeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Move to Next Node</DialogTitle>
            <DialogDescription>
              Select a compatible module to create a new node and move the processed DuckDB file to it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="next-module">Select Module</Label>
              <Select value="duckdb2jmp" onValueChange={(value) => moveToNextNodeMutation.mutate(value)}>
                <SelectTrigger id="next-module">
                  <SelectValue placeholder="Choose a module..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="duckdb2jmp">DuckDB to JMP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowNextNodeDialog(false)
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => moveToNextNodeMutation.mutate('duckdb2jmp')}
                disabled={moveToNextNodeMutation.isPending}
              >
                {moveToNextNodeMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Create Node
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move to Existing Node Dialog */}
      <Dialog open={showExistingNodeDialog} onOpenChange={setShowExistingNodeDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Move to Existing Node</DialogTitle>
            <DialogDescription>
              Select a module type, then choose an existing node in the current workflow to move the processed DuckDB file to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="existing-module">Select Module Type</Label>
              <Select 
                value={selectedExistingModule} 
                onValueChange={(value) => {
                  setSelectedExistingModule(value)
                }}
              >
                <SelectTrigger id="existing-module">
                  <SelectValue placeholder="Choose a module type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="duckdb2jmp">DuckDB to JMP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {selectedExistingModule && (
              <div className="space-y-2">
                <Label>Select Node</Label>
                {existingNodes && existingNodes.length > 0 ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-3">
                    {existingNodes.map((existingNode) => (
                      <button
                        key={existingNode.id}
                        onClick={() => handleMoveToExistingNode(existingNode.id)}
                        disabled={moveToExistingNodeMutation.isPending || existingNode.id === node.id}
                        className="w-full text-left px-4 py-3 rounded-lg border transition-all duration-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Database className="h-4 w-4 text-gray-500" />
                            <div>
                              <div className="font-semibold text-sm">
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
                  <div className="text-center py-8 border rounded-lg">
                    <Database className="h-8 w-8 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm text-gray-600">
                      No {selectedExistingModule} nodes found in this workflow
                    </p>
                  </div>
                )}
              </div>
            )}
            
            <div className="flex justify-end space-x-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowExistingNodeDialog(false)
                  setSelectedExistingModule('')
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rule Add/Edit Dialog */}
      <Dialog open={showRuleDialog} onOpenChange={(open) => {
        if (!open) {
          handleCancelRule()
        } else {
          setShowRuleDialog(true)
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRuleIndex !== null ? 'Edit Rule' : 'Add Rule'}</DialogTitle>
            <DialogDescription>
              Configure the outlier removal rule. Use "Apply to all" options to target all sheets/columns, or select specific ones.
            </DialogDescription>
          </DialogHeader>
          {tempRule && (
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-sm flex items-center gap-1 mb-2">
                  Sheets
                </Label>
                <div className="border border-gray-200 rounded-md p-3 max-h-48 overflow-y-auto bg-gray-50">
                  {tablesListData?.tables && tablesListData.tables.length > 0 ? (
                    <div className="space-y-3">
                      {/* Apply to all sheets option */}
                      <div className="pb-2 border-b border-gray-300">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="apply-to-all-sheets"
                            checked={tempRule.applyToAllSheets}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                // Apply to all sheets - clear selections
                                setTempRule({
                                  ...tempRule,
                                  applyToAllSheets: true,
                                  selectedSheets: [],
                                  selectedColumns: {},
                                  applyToAllColumns: {}
                                })
                              } else {
                                // Allow sheet selection
                                setTempRule({
                                  ...tempRule,
                                  applyToAllSheets: false
                                })
                              }
                            }}
                          />
                          <Label
                            htmlFor="apply-to-all-sheets"
                            className="text-sm font-medium cursor-pointer flex-1"
                          >
                            Apply to all sheets
                          </Label>
                        </div>
                      </div>
                      
                      {/* Individual sheets */}
                      <div className="space-y-2">
                        {tablesListData.tables.map((table: { name: string; columns: string[] }) => {
                          const isSheetSelected = tempRule.selectedSheets.includes(table.name)
                          const applyToAllCols = tempRule.applyToAllColumns[table.name] || false
                          return (
                            <div key={table.name} className="space-y-2">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={`sheet-${table.name}`}
                                  checked={isSheetSelected}
                                  disabled={tempRule.applyToAllSheets}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      // Add sheet with default "apply to all columns"
                                      setTempRule({
                                        ...tempRule,
                                        selectedSheets: [...tempRule.selectedSheets, table.name],
                                        applyToAllColumns: {
                                          ...tempRule.applyToAllColumns,
                                          [table.name]: true  // Default to apply to all columns
                                        },
                                        selectedColumns: {
                                          ...tempRule.selectedColumns,
                                          [table.name]: []
                                        }
                                      })
                                    } else {
                                      // Remove sheet and its columns
                                      const newSelectedSheets = tempRule.selectedSheets.filter(s => s !== table.name)
                                      const newSelectedColumns = { ...tempRule.selectedColumns }
                                      const newApplyToAllColumns = { ...tempRule.applyToAllColumns }
                                      delete newSelectedColumns[table.name]
                                      delete newApplyToAllColumns[table.name]
                                      setTempRule({
                                        ...tempRule,
                                        selectedSheets: newSelectedSheets,
                                        selectedColumns: newSelectedColumns,
                                        applyToAllColumns: newApplyToAllColumns
                                      })
                                    }
                                  }}
                                />
                                <Label
                                  htmlFor={`sheet-${table.name}`}
                                  className={`text-sm font-medium flex-1 ${tempRule.applyToAllSheets ? 'text-gray-400 cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                  {table.name}
                                </Label>
                              </div>
                              {/* Show columns when sheet is checked */}
                              {isSheetSelected && !tempRule.applyToAllSheets && (
                                <div className="ml-6 space-y-1.5 border-l-2 border-gray-300 pl-3">
                                  {/* Apply to all columns option */}
                                  <div className="pb-1.5 border-b border-gray-200">
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`apply-to-all-cols-${table.name}`}
                                        checked={applyToAllCols}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            // Apply to all columns - clear column selections
                                            setTempRule({
                                              ...tempRule,
                                              applyToAllColumns: {
                                                ...tempRule.applyToAllColumns,
                                                [table.name]: true
                                              },
                                              selectedColumns: {
                                                ...tempRule.selectedColumns,
                                                [table.name]: []
                                              }
                                            })
                                          } else {
                                            // Allow column selection
                                            setTempRule({
                                              ...tempRule,
                                              applyToAllColumns: {
                                                ...tempRule.applyToAllColumns,
                                                [table.name]: false
                                              }
                                            })
                                          }
                                        }}
                                      />
                                      <Label
                                        htmlFor={`apply-to-all-cols-${table.name}`}
                                        className="text-xs font-medium cursor-pointer flex-1"
                                      >
                                        Apply to all columns
                                      </Label>
                                    </div>
                                  </div>
                                  
                                  {/* Column selection (only if not applying to all columns) */}
                                  {!applyToAllCols && (
                                    <>
                                      <div className="flex items-center justify-between mb-1 pt-1">
                                        <div className="text-xs text-gray-500">
                                          Select specific columns:
                                        </div>
                                        <div className="flex gap-1">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                              // Select all columns for this sheet
                                              setTempRule({
                                                ...tempRule,
                                                selectedColumns: {
                                                  ...tempRule.selectedColumns,
                                                  [table.name]: [...table.columns]
                                                }
                                              })
                                            }}
                                            className="h-6 px-2 text-xs"
                                          >
                                            All
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                              // Unselect all columns for this sheet
                                              setTempRule({
                                                ...tempRule,
                                                selectedColumns: {
                                                  ...tempRule.selectedColumns,
                                                  [table.name]: []
                                                }
                                              })
                                            }}
                                            className="h-6 px-2 text-xs"
                                          >
                                            None
                                          </Button>
                                        </div>
                                      </div>
                                      {table.columns.map((col: string) => {
                                        const isColumnSelected = (tempRule.selectedColumns[table.name] || []).includes(col)
                                        return (
                                          <div key={col} className="flex items-center space-x-2">
                                            <Checkbox
                                              id={`col-${table.name}-${col}`}
                                              checked={isColumnSelected}
                                              disabled={applyToAllCols}
                                              onCheckedChange={(checked) => {
                                                const currentColumns = tempRule.selectedColumns[table.name] || []
                                                if (checked) {
                                                  // Add column
                                                  setTempRule({
                                                    ...tempRule,
                                                    selectedColumns: {
                                                      ...tempRule.selectedColumns,
                                                      [table.name]: [...currentColumns, col]
                                                    }
                                                  })
                                                } else {
                                                  // Remove column
                                                  setTempRule({
                                                    ...tempRule,
                                                    selectedColumns: {
                                                      ...tempRule.selectedColumns,
                                                      [table.name]: currentColumns.filter(c => c !== col)
                                                    }
                                                  })
                                                }
                                              }}
                                            />
                                            <Label
                                              htmlFor={`col-${table.name}-${col}`}
                                              className={`text-xs flex-1 ${applyToAllCols ? 'text-gray-400 cursor-not-allowed' : 'cursor-pointer'}`}
                                            >
                                              {col}
                                            </Label>
                                          </div>
                                        )
                                      })}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400 text-center py-2">No tables available</div>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-sm">Condition *</Label>
                <select
                  value={tempRule.condition}
                  onChange={(e) => setTempRule({ ...tempRule, condition: e.target.value })}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="greater_than">Greater Than</option>
                  <option value="less_than">Less Than</option>
                  <option value="equals">Equals</option>
                  <option value="contains">Contains</option>
                  <option value="iqr">IQR (Interquartile Range)</option>
                  <option value="sigma">Sigma (Standard Deviation)</option>
                  <option value="standardized_to_nominal">Standardized to Nominal</option>
                </select>
              </div>
              <div>
                <Label className="text-sm">
                  {tempRule.condition === 'iqr' ? 'IQR Multiplier *' : 
                   tempRule.condition === 'sigma' ? 'Sigma Multiplier *' : 
                   tempRule.condition === 'standardized_to_nominal' ? 'Value (not required)' :
                   'Value *'}
                </Label>
                <Input
                  value={tempRule.value}
                  onChange={(e) => setTempRule({ ...tempRule, value: e.target.value })}
                  placeholder={
                    tempRule.condition === 'iqr' ? '1.5 (default)' :
                    tempRule.condition === 'sigma' ? '3 (default)' :
                    tempRule.condition === 'standardized_to_nominal' ? 'Not required for standardization' :
                    'Value to compare'
                  }
                  type={tempRule.condition === 'iqr' || tempRule.condition === 'sigma' ? 'number' : 'text'}
                  step={tempRule.condition === 'iqr' || tempRule.condition === 'sigma' ? '0.1' : undefined}
                  disabled={tempRule.condition === 'standardized_to_nominal'}
                  className="mt-1 h-9 text-sm"
                />
                {tempRule.condition === 'iqr' && (
                  <p className="text-xs text-gray-500 mt-1">
                    Values outside [Q1 - {tempRule.value || '1.5'} × IQR, Q3 + {tempRule.value || '1.5'} × IQR] will be treated as outliers
                  </p>
                )}
                {tempRule.condition === 'sigma' && (
                  <p className="text-xs text-gray-500 mt-1">
                    Values outside [mean - {tempRule.value || '3'}σ, mean + {tempRule.value || '3'}σ] will be treated as outliers
                  </p>
                )}
                {tempRule.condition === 'standardized_to_nominal' && (
                  <p className="text-xs text-gray-500 mt-1">
                    Each value will be replaced with (value - mean). The mean is calculated for each selected column.
                  </p>
                )}
              </div>
              <div>
                <Label className="text-sm">Action</Label>
                <select
                  value={tempRule.action || 'clear_cell'}
                  onChange={(e) => setTempRule({ ...tempRule, action: e.target.value as 'clear_cell' | 'remove_row' })}
                  disabled={tempRule.condition === 'standardized_to_nominal'}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="clear_cell">Clear Cell</option>
                  <option value="remove_row">Remove Row</option>
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={handleCancelRule}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveRule}
                  disabled={!tempRule.condition || (tempRule.condition !== 'standardized_to_nominal' && !tempRule.value)}
                >
                  {editingRuleIndex !== null ? 'Save Changes' : 'Add Rule'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}


'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileSpreadsheet, Upload, Play, Loader2, FileText, ArrowLeft, Database, Search, Download, ArrowUp, ArrowDown, GripVertical, Check } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface Excel2JMPGUIProps {
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

interface JSLCSVPair {
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
}

export default function Excel2JMPGUI({
  node,
  workflowId,
  onConfigUpdate,
  onProcess,
  isStandalone = false
}: Excel2JMPGUIProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [selectedPair, setSelectedPair] = useState<JSLCSVPair | null>(null)
  const [catVar, setCatVar] = useState<string>(node.config?.cat_var || 'Stage')
  const [colorBy, setColorBy] = useState<string>(node.config?.color_by || '')
  const [showInputFileDialog, setShowInputFileDialog] = useState(false)
  const [uploadedFileKey, setUploadedFileKey] = useState<string | null>(node.config?.file_key || null)
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'original' | 'processed'>('original')
  const [catVarOrder, setCatVarOrder] = useState<string[]>(node.config?.cat_var_order || [])
  
  // Available caption box statistics
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

  // Fetch workflow data for project name generation
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

  // Fetch JSL/CSV pairs (filtered by input file if available)
  const { data: pairsData, refetch: refetchPairs, isLoading: loadingPairs } = useQuery({
    queryKey: ['jsl-csv-pairs', workflowId, node.id, uploadedFileKey],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (uploadedFileKey) {
        params.append('input_file_path', uploadedFileKey)
      }
      const queryString = params.toString()
      const url = `/v1/workflows/${workflowId}/nodes/${node.id}/jsl-csv-pairs${queryString ? `?${queryString}` : ''}`
      return apiClient.get<{
        workflow_id: string
        node_id: string
        pairs: JSLCSVPair[]
      }>(url)
    },
    enabled: !!workflowId && !!node.id,
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
            }
          }>
        }
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/files`)
    },
    enabled: !!workflowId && !!node.id,
    staleTime: 30000
  })

  // Fetch Excel data for table viewer and column selection
  const { data: excelData, isLoading: loadingExcelData, refetch: refetchExcelData } = useQuery({
    queryKey: ['excel-data', workflowId, node.id, uploadedFileKey],
    queryFn: async () => {
      return apiClient.get<{
        workflow_id: string
        node_id: string
        file_path: string
        filename: string
        version: string
        sheets: Array<{
          name: string
          rows: number
          columns: string[]
          data: any[]
          total_rows: number
          displayed_rows: number
        }>
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/excel-data?version=original`)
    },
    enabled: !!uploadedFileKey && !!workflowId && !!node.id,
    staleTime: 30000
  })

  // Get available columns from Excel data (excluding columns containing "FAI")
  const availableColumns = useMemo(() => {
    if (!excelData || !excelData.sheets || excelData.sheets.length === 0) {
      return []
    }
    
    // Try to find a sheet named "data" (case-insensitive), otherwise use the first sheet
    const dataSheet = excelData.sheets.find(s => s.name.toLowerCase() === 'data') || excelData.sheets[0]
    
    if (!dataSheet || !dataSheet.columns) {
      return []
    }
    
    // Filter out columns containing "FAI" (case-insensitive)
    return dataSheet.columns.filter(col => !col.toUpperCase().includes('FAI'))
  }, [excelData])

  // Fetch unique values from the selected categorical variable (all rows, not just first 1000)
  const { data: catVarUniqueValuesData } = useQuery({
    queryKey: ['cat-var-unique-values', workflowId, node.id, catVar, uploadedFileKey],
    queryFn: async () => {
      if (!catVar || !uploadedFileKey) return null
      
      // Determine sheet name (prefer 'data' sheet)
      let sheetName: string | undefined = undefined
      if (excelData?.sheets) {
        const dataSheet = excelData.sheets.find(s => s.name.toLowerCase() === 'data') || excelData.sheets[0]
        if (dataSheet) {
          sheetName = dataSheet.name
        }
      }
      
      const params = new URLSearchParams({
        column_name: catVar
      })
      if (sheetName) {
        params.append('sheet_name', sheetName)
      }
      // Extract filename from uploadedFileKey if it's a storage_key path
      // uploadedFileKey format: "workflows/{workflow_id}/nodes/{node_id}/input/{filename}"
      // We need just the filename part for file_path
      if (uploadedFileKey) {
        // If it's a storage_key path, extract the filename
        const pathParts = uploadedFileKey.split('/')
        const filename = pathParts[pathParts.length - 1]
        // file_path should be relative to node_path, so "input/{filename}"
        params.append('file_path', `input/${filename}`)
      }
      
      return apiClient.get<{
        workflow_id: string
        node_id: string
        column_name: string
        sheet_name: string
        unique_values: string[]
        count: number
        total_rows: number
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/excel-column-unique-values?${params.toString()}`)
    },
    enabled: !!catVar && !!uploadedFileKey && !!workflowId && !!node.id,
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
        if (savedOrder.length > 0 && savedOrder.every(v => catVarUniqueValues.includes(v))) {
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

  // Fetch CSV data for processed view
  const { data: csvData, isLoading: loadingCSVData } = useQuery({
    queryKey: ['csv-data', workflowId, node.id, selectedPair?.pair_id],
    queryFn: async () => {
      if (!selectedPair) return null
      const params = new URLSearchParams({
        pair_id: selectedPair.pair_id,
        limit: '1000',
        offset: '0'
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
      queryClient.invalidateQueries({ queryKey: ['excel-data', workflowId, node.id] })
      queryClient.invalidateQueries({ queryKey: ['jsl-csv-pairs', workflowId, node.id] })
      setSelectedPair(null) // Clear selected pair when uploading new file
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
      if (catVarOrder.length > 0) {
        // Use the same order for both list check and value order
        formData.append('list_check_values', JSON.stringify(catVarOrder))
        formData.append('value_order', JSON.stringify(catVarOrder))
      }
      if (captionBoxStatistics.length > 0) {
        // Send selected caption box statistics
        formData.append('caption_box_statistics', JSON.stringify(captionBoxStatistics.map(s => s.value)))
      }
      return apiClient.post<{
        workflow_id: string
        node_id: string
        pair_id: string
        pair_folder: string
        csv_filename: string
        jsl_filename: string
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/execute-excel2jmp`, formData)
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['jsl-csv-pairs', workflowId, node.id] })
      toast.success(`Conversion complete! Created pair: ${data.pair_folder}`)
      // Auto-select the new pair
      refetchPairs()
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

  const handleSelectInputFile = async (file: { name: string; path: string; metadata?: any }) => {
    try {
      setUploadedFileKey(file.path)
      queryClient.invalidateQueries({ queryKey: ['excel-data', workflowId, node.id] })
      queryClient.invalidateQueries({ queryKey: ['jsl-csv-pairs', workflowId, node.id] })
      setSelectedPair(null) // Clear selected pair when switching files
      setShowInputFileDialog(false)
      toast.success(`Switched to file: ${file.metadata?.original_filename || file.name}`)
    } catch (error: any) {
      toast.error(`Failed to switch file: ${error.message || 'Unknown error'}`)
    }
  }

  // Auto-select first sheet when data loads
  useEffect(() => {
    if (excelData && excelData.sheets.length > 0 && !selectedSheet) {
      setSelectedSheet(excelData.sheets[0].name)
    }
  }, [excelData, selectedSheet])

  // Auto-select first available column if current catVar is not in available columns
  useEffect(() => {
    if (availableColumns.length > 0 && catVar && !availableColumns.includes(catVar)) {
      // If current catVar is not in available columns, select the first one
      setCatVar(availableColumns[0])
    } else if (availableColumns.length > 0 && !catVar) {
      // If no catVar is set, select the first available column
      setCatVar(availableColumns[0])
    }
  }, [availableColumns, catVar])

  const handleExecute = () => {
    executeMutation.mutate()
  }

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
      toast.error(`Failed to download pair: ${error.message || 'Unknown error'}`)
    }
  }

  // Initialize uploadedFileKey from config
  useEffect(() => {
    if (node.config?.file_key && !uploadedFileKey) {
      setUploadedFileKey(node.config.file_key)
    }
  }, [node.config?.file_key, uploadedFileKey])

  // Auto-select first pair when pairs load (but don't override if Excel viewer is showing)
  useEffect(() => {
    if (pairsData?.pairs && pairsData.pairs.length > 0 && !selectedPair && !uploadedFileKey) {
      setSelectedPair(pairsData.pairs[0])
    }
  }, [pairsData, selectedPair, uploadedFileKey])

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Top Menu Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {isStandalone && (
            <Link href="/modules">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Modules
              </Button>
            </Link>
          )}
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
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="flex items-center space-x-2">
            <Button
              variant={viewMode === 'original' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('original')}
              disabled={!uploadedFileKey}
            >
              Original
            </Button>
            <Button
              variant={viewMode === 'processed' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('processed')}
              disabled={!selectedPair}
            >
              Processed
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExecute}
            disabled={executeMutation.isPending}
            className="flex items-center space-x-2"
          >
            {executeMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Converting...</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                <span>Execute Conversion</span>
              </>
            )}
          </Button>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-600">
            {pairsData?.pairs?.length || 0} pair{pairsData?.pairs?.length !== 1 ? 's' : ''} available
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Settings and Pairs List */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto pb-4">
            {/* Settings Section */}
            <div className="border-b border-gray-200 p-4">
            <h3 className="text-sm font-semibold mb-3">Settings</h3>
            <div className="space-y-3">
              <div>
                <Label htmlFor="left-cat-var" className="text-xs">Categorical Variable *</Label>
                {availableColumns.length > 0 ? (
                  <Select value={catVar} onValueChange={setCatVar}>
                    <SelectTrigger id="left-cat-var" className="mt-1 h-8 text-sm">
                      <SelectValue placeholder="Select a column" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableColumns.map((col) => (
                        <SelectItem key={col} value={col}>
                          {col}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="left-cat-var"
                    value={catVar}
                    onChange={(e) => setCatVar(e.target.value)}
                    placeholder={uploadedFileKey ? "Loading columns..." : "Upload Excel file first"}
                    className="mt-1 h-8 text-sm"
                    disabled={!uploadedFileKey}
                  />
                )}
                {availableColumns.length === 0 && uploadedFileKey && (
                  <p className="text-xs text-gray-500 mt-1">No columns found (excluding FAI columns)</p>
                )}
              </div>
              <div>
                <Label htmlFor="left-color-by" className="text-xs">Color By (Optional)</Label>
                {availableColumns.length > 0 ? (
                  <Select 
                    value={colorBy || '__none__'} 
                    onValueChange={(value) => setColorBy(value === '__none__' ? '' : value)}
                  >
                    <SelectTrigger id="left-color-by" className="mt-1 h-8 text-sm">
                      <SelectValue placeholder="Select a column (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {availableColumns.map((col) => (
                        <SelectItem key={col} value={col}>
                          {col}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="left-color-by"
                    value={colorBy}
                    onChange={(e) => setColorBy(e.target.value)}
                    placeholder="Leave empty to use categorical variable"
                    className="mt-1 h-8 text-sm"
                    disabled={!uploadedFileKey}
                  />
                )}
              </div>
              <Button
                onClick={() => {
                  const config = {
                    cat_var: catVar,
                    color_by: colorBy || undefined,
                    cat_var_order: catVarOrder.length > 0 ? catVarOrder : undefined,
                    caption_box_statistics: captionBoxStatistics.length > 0 ? captionBoxStatistics.map(s => s.value) : undefined
                  }
                  if (onConfigUpdate) {
                    onConfigUpdate(config)
                  }
                  toast.success('Settings saved')
                }}
                disabled={!catVar}
                className="w-full h-8 text-sm"
                size="sm"
              >
                Save Settings
              </Button>
            </div>
          </div>

          {/* Categorical Variable Settings */}
          {catVar && (
            <div className="border-b border-gray-200 p-4 space-y-4">
              <h3 className="text-sm font-semibold">Categorical Variable Settings</h3>
              <div className="text-xs text-gray-600 mb-2">Column: <span className="font-mono">{catVar}</span></div>
              
              {catVarUniqueValues.length === 0 ? (
                <div className="text-xs text-gray-500 italic">
                  {uploadedFileKey ? "Loading values from Excel file..." : "Upload an Excel file to see values"}
                </div>
              ) : (
                <div>
                  <Label className="text-xs mb-2 block">Value Order (used for List Check and Value Order)</Label>
                  <div className="space-y-1 max-h-40 overflow-y-auto border rounded p-2">
                    {catVarOrder.length === 0 ? (
                      <div className="text-xs text-gray-400 italic p-2">No values available</div>
                    ) : (
                      catVarOrder.map((value, index) => (
                        <div key={index} className="flex items-center gap-1 p-1 hover:bg-gray-50 rounded">
                          <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <span className="flex-1 text-xs">{value}</span>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => {
                                if (index > 0) {
                                  const newValues = [...catVarOrder]
                                  ;[newValues[index - 1], newValues[index]] = [newValues[index], newValues[index - 1]]
                                  setCatVarOrder(newValues)
                                }
                              }}
                              disabled={index === 0}
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => {
                                if (index < catVarOrder.length - 1) {
                                  const newValues = [...catVarOrder]
                                  ;[newValues[index], newValues[index + 1]] = [newValues[index + 1], newValues[index]]
                                  setCatVarOrder(newValues)
                                }
                              }}
                              disabled={index === catVarOrder.length - 1}
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full h-7 text-xs"
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

          {/* Caption Box Statistics Settings */}
          <div className="border-b border-gray-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold">Caption Box Statistics</h3>
            <p className="text-xs text-gray-500 mb-2">Select and reorder summary statistics to display</p>
            
            <div className="space-y-2 max-h-60 overflow-y-auto border rounded p-2">
              {availableStatistics.map((stat) => {
                const isSelected = captionBoxStatistics.some(s => s.value === stat.value)
                const orderIndex = captionBoxStatistics.findIndex(s => s.value === stat.value)
                
                return (
                  <div key={stat.value} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          // Add to end of list
                          setCaptionBoxStatistics([...captionBoxStatistics, stat])
                        } else {
                          // Remove from list
                          setCaptionBoxStatistics(captionBoxStatistics.filter(s => s.value !== stat.value))
                        }
                      }}
                    />
                    <span className="flex-1 text-xs">{stat.label}</span>
                    {isSelected && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => {
                            if (orderIndex > 0) {
                              const newStats = [...captionBoxStatistics]
                              ;[newStats[orderIndex - 1], newStats[orderIndex]] = [newStats[orderIndex], newStats[orderIndex - 1]]
                              setCaptionBoxStatistics(newStats)
                            }
                          }}
                          disabled={orderIndex === 0}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => {
                            if (orderIndex < captionBoxStatistics.length - 1) {
                              const newStats = [...captionBoxStatistics]
                              ;[newStats[orderIndex], newStats[orderIndex + 1]] = [newStats[orderIndex + 1], newStats[orderIndex]]
                              setCaptionBoxStatistics(newStats)
                            }
                          }}
                          disabled={orderIndex === captionBoxStatistics.length - 1}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            
            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() => {
                setCaptionBoxStatistics([...availableStatistics])
              }}
            >
              Select All
            </Button>
          </div>

          {/* Pairs List */}
          {loadingPairs ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600">Loading pairs...</p>
              </div>
            </div>
          ) : !pairsData || pairsData.pairs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8">
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
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="border-b border-gray-200 p-4">
                <h3 className="text-sm font-semibold mb-2">JSL/CSV Pairs</h3>
                <p className="text-xs text-gray-500">
                  {pairsData.pairs.length} pair{pairsData.pairs.length !== 1 ? 's' : ''} found
                  {uploadedFileKey && inputFilesData?.folders?.input?.find(f => f.path === uploadedFileKey)?.metadata?.original_filename && (
                    <span className="block mt-1">
                      for: {inputFilesData.folders.input.find(f => f.path === uploadedFileKey)?.metadata?.original_filename}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                <div className="space-y-2">
                  {pairsData.pairs.map((pair) => (
                    <button
                      key={pair.pair_id}
                      onClick={() => {
                        setSelectedPair(pair)
                        setViewMode('processed')
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
                        selectedPair?.pair_id === pair.pair_id
                          ? 'bg-indigo-50 border-indigo-200'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-medium text-sm text-gray-900">{pair.pair_folder}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(pair.created_at).toLocaleString()}
                      </div>
                      {pair.input_file && (
                        <div className="text-xs text-gray-400 mt-1">
                          From: {pair.input_file.original_filename}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        Cat: {pair.cat_var} {pair.color_by ? `• Color: ${pair.color_by}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          </div>
          
          {/* Developer Banner */}
          <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-center flex-shrink-0">
            <p className="text-xs text-gray-600 font-medium">Developed By Dr J. Sun</p>
          </div>
        </div>

        {/* Right Panel - Original (Excel) or Processed (CSV + JSL) View */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {viewMode === 'original' && uploadedFileKey && excelData ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Sheet Selector and Search Bar */}
              <div className="border-b border-gray-200 px-4 py-2 space-y-2">
                <div className="flex items-center space-x-2 overflow-x-auto">
                  {excelData.sheets.map((sheet) => (
                    <Button
                      key={sheet.name}
                      variant={selectedSheet === sheet.name ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedSheet(sheet.name)}
                      className="text-xs"
                    >
                      {sheet.name} ({sheet.rows} rows)
                    </Button>
                  ))}
                </div>
                {/* Search Bar */}
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

              {/* Table */}
              <div className="flex-1 overflow-auto p-4">
                {excelData.sheets.find(s => s.name === selectedSheet) ? (
                  (() => {
                    const currentSheet = excelData.sheets.find(s => s.name === selectedSheet)!
                    return (
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full text-sm border-collapse">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              {currentSheet.columns.map((col, colIdx) => (
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
                              let filteredData = currentSheet.data
                              if (searchQuery.trim()) {
                                const query = searchQuery.toLowerCase()
                                filteredData = currentSheet.data.filter((row) => {
                                  return currentSheet.columns.some((col) => {
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
                                      colSpan={currentSheet.columns.length}
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
                                  {currentSheet.columns.map((col, colIdx) => {
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
                        {(() => {
                          const filteredCount = searchQuery.trim() 
                            ? currentSheet.data.filter((row) => {
                                const query = searchQuery.toLowerCase()
                                return currentSheet.columns.some((col) => {
                                  const value = row[col]
                                  if (value === null || value === undefined) return false
                                  return String(value).toLowerCase().includes(query)
                                })
                              }).length
                            : currentSheet.displayed_rows
                          
                          return (
                            <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500 border-t border-gray-200">
                              {searchQuery.trim() ? (
                                <>Showing {filteredCount} matching row{filteredCount !== 1 ? 's' : ''} (of {currentSheet.displayed_rows} displayed, {currentSheet.total_rows} total)</>
                              ) : (
                                <>Showing {currentSheet.displayed_rows} of {currentSheet.total_rows} rows</>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })()
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-400">Select a sheet to view data</p>
                  </div>
                )}
              </div>
            </div>
          ) : uploadedFileKey && loadingExcelData ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading Excel data...</p>
              </div>
            </div>
          ) : !uploadedFileKey ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <FileSpreadsheet className="h-24 w-24 mx-auto text-gray-300 mb-4" />
                <p className="text-lg font-medium text-gray-600 mb-2">No file opened</p>
                <p className="text-sm text-gray-400 mb-4">Click "Switch Input File" to load an Excel file</p>
                <Button onClick={handleSwitchInputFile} variant="default">
                  <FileText className="h-4 w-4 mr-2" />
                  Switch Input File
                </Button>
              </div>
            </div>
          ) : viewMode === 'processed' && selectedPair ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Pair Header */}
              <div className="border-b border-gray-200 px-4 py-2 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{selectedPair.pair_folder}</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Created: {new Date(selectedPair.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    onClick={handleDownloadPair}
                    variant="outline"
                    size="sm"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  <Button
                    onClick={handleRunJMP}
                    disabled={runJMPMutation.isPending}
                    size="sm"
                  >
                    {runJMPMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Run JMP
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* CSV Table and JSL Viewer */}
              <div className="flex-1 flex overflow-hidden">
                {/* CSV Table Viewer */}
                <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200">
                  <div className="border-b border-gray-200 px-4 py-2">
                    <h4 className="text-sm font-semibold">CSV Data</h4>
                    <p className="text-xs text-gray-500">{selectedPair.csv_filename}</p>
                  </div>
                  {loadingCSVData ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
                        <p className="text-sm text-gray-600">Loading CSV data...</p>
                      </div>
                    </div>
                  ) : csvData ? (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {/* Search Bar */}
                      <div className="border-b border-gray-200 px-4 py-2">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input
                            type="text"
                            placeholder="Search values in CSV..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-8 text-sm"
                          />
                        </div>
                      </div>
                      {/* CSV Table */}
                      <div className="flex-1 overflow-auto p-4">
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                          <table className="w-full text-sm border-collapse">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr>
                                {csvData.columns.map((col: string, colIdx: number) => (
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
                                let filteredData = csvData.data
                                if (searchQuery.trim()) {
                                  const query = searchQuery.toLowerCase()
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
                                        {searchQuery.trim() 
                                          ? `No results found for "${searchQuery}"` 
                                          : 'No data to display'}
                                      </td>
                                    </tr>
                                  )
                                }
                                
                                return filteredData.map((row: Record<string, any>, rowIdx: number) => (
                                  <tr key={rowIdx} className="hover:bg-gray-50">
                                    {csvData.columns.map((col: string, colIdx: number) => {
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
                          <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500 border-t border-gray-200">
                            {searchQuery.trim() ? (
                              <>Showing {csvData.data.filter((row: Record<string, any>) => {
                                const query = searchQuery.toLowerCase()
                                return csvData.columns.some((col: string) => {
                                  const value = row[col]
                                  if (value === null || value === undefined) return false
                                  return String(value).toLowerCase().includes(query)
                                })
                              }).length} matching row{csvData.data.filter((row: Record<string, any>) => {
                                const query = searchQuery.toLowerCase()
                                return csvData.columns.some((col: string) => {
                                  const value = row[col]
                                  if (value === null || value === undefined) return false
                                  return String(value).toLowerCase().includes(query)
                                })
                              }).length !== 1 ? 's' : ''} (of {csvData.displayed_rows} displayed, {csvData.total_rows} total)</>
                            ) : (
                              <>Showing {csvData.displayed_rows} of {csvData.total_rows} rows</>
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
                <div className="w-1/2 flex flex-col overflow-hidden">
                  <div className="border-b border-gray-200 px-4 py-2">
                    <h4 className="text-sm font-semibold">JSL Script</h4>
                    <p className="text-xs text-gray-500">{selectedPair.jsl_filename}</p>
                  </div>
                  {loadingJSLData ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
                        <p className="text-sm text-gray-600">Loading JSL script...</p>
                      </div>
                    </div>
                  ) : jslData ? (
                    <div className="flex-1 overflow-auto p-4">
                      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs font-mono overflow-x-auto">
                        <code>{jslData.content}</code>
                      </pre>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-gray-400">No JSL script available</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <FileSpreadsheet className="h-24 w-24 mx-auto text-gray-300 mb-4" />
                <p className="text-lg font-medium text-gray-600 mb-2">No data available</p>
                <p className="text-sm text-gray-400">Please upload a file or select a pair</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input File Selection Dialog */}
      <Dialog open={showInputFileDialog} onOpenChange={setShowInputFileDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Input File</DialogTitle>
            <DialogDescription>
              Choose an input file from the node's input folder
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload New File
            </Button>
            {inputFilesData?.folders?.input && inputFilesData.folders.input.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Existing Input Files:</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {inputFilesData.folders.input.map((file) => (
                    <button
                      key={file.name}
                      onClick={() => handleSelectInputFile(file)}
                      className={`w-full text-left px-4 py-3 rounded-lg border hover:bg-gray-50 transition-all ${
                        file.path === uploadedFileKey ? 'bg-indigo-50 border-indigo-200' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <FileSpreadsheet className="h-5 w-5 text-gray-400 mt-0.5" />
                        <div className="flex-1">
                          {file.metadata ? (
                            <>
                              <div className="font-medium text-gray-900">{file.metadata.original_filename}</div>
                              <div className="text-xs text-gray-500 mt-1">
                                Type: {file.metadata.file_type} • Uploaded: {new Date(file.metadata.uploaded_time).toLocaleString()}
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
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">No input files found. Upload a file to get started.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}


'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { FileSpreadsheet, Upload, Play, Plus, X, Download, FolderOpen, Save, Search, FileText } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'

interface OutlierRemoverGUIProps {
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
  onCreateNewWorkflow?: (file?: File) => void
}

export default function OutlierRemoverGUI({
  node,
  workflowId,
  onConfigUpdate,
  onProcess,
  isStandalone = false,
  onCreateNewWorkflow
}: OutlierRemoverGUIProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Load config from file on mount
  const { data: loadedConfig } = useQuery({
    queryKey: ['node-config', workflowId, node.id],
    queryFn: async () => {
      return apiClient.get<{ config: any }>(`/v1/workflows/${workflowId}/nodes/${node.id}/config`)
    },
    enabled: !!workflowId && !!node.id,
    staleTime: 30000
  })

  // Use loaded config or fallback to node.config
  const effectiveConfig = loadedConfig?.config || node.config || {}
  
  const [uploadedFileKey, setUploadedFileKey] = useState<string | null>(effectiveConfig.file_key || null)
  const [filename, setFilename] = useState<string>(effectiveConfig.filename || '')
  const [selectedColumns, setSelectedColumns] = useState<Record<string, string[]>>(effectiveConfig.selected_columns || {})
  const [outlierRules, setOutlierRules] = useState<Array<{
    sheet?: string
    column?: string
    condition: string
    value: string
    action?: 'clear_cell' | 'remove_row'  // Action to take: clear cell or remove entire row
  }>>(effectiveConfig.outlier_rules || [])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [selectedColumn, setSelectedColumn] = useState<string>('')
  const [viewVersion, setViewVersion] = useState<'original' | 'processed'>('original')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [showInputFileDialog, setShowInputFileDialog] = useState(false)

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

  // Fetch Excel data
  const { data: excelData, isLoading: loadingData, refetch: refetchData } = useQuery({
    queryKey: ['excel-data', workflowId, node.id, viewVersion],
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
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/excel-data?version=${viewVersion}`)
    },
    enabled: !!uploadedFileKey,
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
        selected_columns: selectedColumns,
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
      queryClient.invalidateQueries({ queryKey: ['excel-data', workflowId, node.id] })
      queryClient.invalidateQueries({ queryKey: ['node-files', workflowId, node.id] })
      toast.success('File opened successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to open file')
    }
  })

  // Process mutation
  const processMutation = useMutation({
    mutationFn: async (data: { rules: any[], columns: Record<string, string[]> }) => {
      return apiClient.post<{
        workflow_id: string
        node_id: string
        original_file: string
        processed_file: string
        filename: string
        sheets_processed: string[]
        summary_sheet: string
        total_removals: number
        removal_summary: any[]
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/process-outlier-remover`, {
        outlier_rules: data.rules,
        selected_columns: data.columns
      })
    },
    onSuccess: (data) => {
      console.log('Processing result:', data)
      toast.success(`Processing completed successfully. ${data.total_removals || 0} removals applied.`)
      queryClient.invalidateQueries({ queryKey: ['excel-data', workflowId, node.id] })
      setViewVersion('processed')
      // Refetch data after a short delay to ensure file is written
      setTimeout(() => {
        refetchData()
      }, 500)
      // Save config to file after processing
      saveConfigToFile({
        file_key: uploadedFileKey,
        filename: filename,
        selected_columns: selectedColumns,
        outlier_rules: outlierRules
      })
      
      if (onConfigUpdate) {
        onConfigUpdate({
          ...node.config,
          outlier_rules: outlierRules,
          selected_columns: selectedColumns
        })
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to process file')
    }
  })

  // Download mutation
  const downloadMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/v1/workflows/${workflowId}/nodes/${node.id}/download-processed`, {
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
      a.download = filename || 'processed_excel.xlsx'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('File downloaded successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to download file')
    }
  })

  const handleSwitchInputFile = () => {
    setShowInputFileDialog(true)
    refetchInputFiles()
  }

  const handleSelectInputFile = async (file: { name: string; path: string; metadata?: any }) => {
    try {
      // Update config with the selected file
      const fileKey = file.path
      const originalFilename = file.metadata?.original_filename || file.name
      
      setUploadedFileKey(fileKey)
      setFilename(originalFilename)
      
      // Save to config
      await saveConfigToFile({
        file_key: fileKey,
        filename: originalFilename,
        selected_columns: selectedColumns,
        outlier_rules: outlierRules
      })
      
      // Invalidate queries to reload data
      queryClient.invalidateQueries({ queryKey: ['excel-data', workflowId, node.id] })
      
      setShowInputFileDialog(false)
      toast.success(`Switched to file: ${originalFilename}`)
    } catch (error: any) {
      toast.error(`Failed to switch file: ${error.message || 'Unknown error'}`)
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
      if (!file.name.match(/\.(xlsx|xls)$/i)) {
        toast.error('Please select a valid Excel file (.xlsx or .xls)')
        return
      }
      uploadMutation.mutate(file)
      // Reset input so same file can be selected again
      e.target.value = ''
    }
  }


  const handleSelectAllColumns = (sheetName: string) => {
    if (!excelData) return
    const sheet = excelData.sheets.find(s => s.name === sheetName)
    if (sheet) {
      const updated = {
        ...selectedColumns,
        [sheetName]: [...sheet.columns]
      }
      setSelectedColumns(updated)
      // Auto-save config
      saveConfigToFile({
        file_key: uploadedFileKey,
        filename: filename,
        selected_columns: updated,
        outlier_rules: outlierRules
      })
    }
  }

  const handleDeselectAllColumns = (sheetName: string) => {
    const updated = {
      ...selectedColumns,
      [sheetName]: []
    }
    setSelectedColumns(updated)
    // Auto-save config
    saveConfigToFile({
      file_key: uploadedFileKey,
      filename: filename,
      selected_columns: updated,
      outlier_rules: outlierRules
    })
  }

  const handleToggleColumn = (sheetName: string, columnName: string) => {
    const current = selectedColumns[sheetName] || []
    const isSelected = current.includes(columnName)
    const updated = {
      ...selectedColumns,
      [sheetName]: isSelected
        ? current.filter(c => c !== columnName)
        : [...current, columnName]
    }
    setSelectedColumns(updated)
    // Auto-save config when columns change
    saveConfigToFile({
      file_key: uploadedFileKey,
      filename: filename,
      selected_columns: updated,
      outlier_rules: outlierRules
    })
  }

  const handleAddRule = () => {
    const newRules: Array<{
      sheet?: string
      column?: string
      condition: string
      value: string
      action?: 'clear_cell' | 'remove_row'
    }> = [...outlierRules, { 
      sheet: selectedSheet || undefined,
      column: selectedColumn || undefined,
      condition: 'greater_than', 
      value: '',
      action: 'clear_cell' as const  // Default action: clear cell
    }]
    setOutlierRules(newRules)
    setSelectedColumn('')
    // Auto-save config
    saveConfigToFile({
      file_key: uploadedFileKey,
      filename: filename,
      selected_columns: selectedColumns,
      outlier_rules: newRules
    })
  }

  const handleRemoveRule = (index: number) => {
    const newRules = outlierRules.filter((_, i) => i !== index)
    setOutlierRules(newRules)
    // Auto-save config
    saveConfigToFile({
      file_key: uploadedFileKey,
      filename: filename,
      selected_columns: selectedColumns,
      outlier_rules: newRules
    })
  }

  const handleUpdateRule = (index: number, field: string, value: string | undefined) => {
    const updated = [...outlierRules]
    updated[index] = { ...updated[index], [field]: value }
    setOutlierRules(updated)
    // Auto-save config when rules change
    saveConfigToFile({
      file_key: uploadedFileKey,
      filename: filename,
      selected_columns: selectedColumns,
      outlier_rules: updated
    })
  }

  const handleApply = () => {
    if (outlierRules.length === 0) {
      toast.error('Please add at least one outlier removal rule')
      return
    }
    processMutation.mutate({ rules: outlierRules, columns: selectedColumns })
  }

  // Load config when component mounts or config is loaded
  useEffect(() => {
    if (loadedConfig?.config) {
      const config = loadedConfig.config
      if (config.file_key) setUploadedFileKey(config.file_key)
      if (config.filename) setFilename(config.filename)
      if (config.selected_columns) setSelectedColumns(config.selected_columns)
      if (config.outlier_rules) setOutlierRules(config.outlier_rules)
    }
  }, [loadedConfig])

  // Auto-select first sheet when data loads
  useEffect(() => {
    if (excelData && excelData.sheets.length > 0 && !selectedSheet) {
      setSelectedSheet(excelData.sheets[0].name)
    }
  }, [excelData, selectedSheet])

  const currentSheet = excelData?.sheets.find(s => s.name === selectedSheet)

  return (
    <div className="h-screen flex flex-col bg-gray-50">
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
            accept=".xlsx,.xls"
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
                onClick={() => downloadMutation.mutate()}
                disabled={downloadMutation.isPending || viewVersion !== 'processed'}
                className="flex items-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span>Download</span>
              </Button>
            </>
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
                disabled={viewVersion === 'processed' && !excelData}
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
                <p className="text-sm text-gray-400">Open an Excel file to get started</p>
              </div>
            </div>
          ) : loadingData ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600">Loading data...</p>
              </div>
            </div>
          ) : !excelData ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <p className="text-gray-600">No data available</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Column Selection */}
              <div className="border-b border-gray-200 p-4 overflow-y-auto flex-shrink-0" style={{ maxHeight: '40%' }}>
                <h3 className="text-sm font-semibold mb-3 sticky top-0 bg-white pb-2">Column Selection</h3>
                {excelData.sheets.map((sheet) => {
                  const sheetColumns = selectedColumns[sheet.name] || []
                  return (
                    <div key={sheet.name} className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-medium">{sheet.name}</Label>
                        <div className="flex space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleSelectAllColumns(sheet.name)}
                          >
                            All
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleDeselectAllColumns(sheet.name)}
                          >
                            None
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {sheet.columns.map((col, idx) => {
                          const isSelected = sheetColumns.includes(col)
                          return (
                            <div key={idx} className="flex items-center space-x-2">
                              <Checkbox
                                id={`${sheet.name}-${col}`}
                                checked={isSelected}
                                onCheckedChange={() => handleToggleColumn(sheet.name, col)}
                              />
                              <Label
                                htmlFor={`${sheet.name}-${col}`}
                                className="text-xs cursor-pointer flex-1"
                              >
                                {col}
                              </Label>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Rules Configuration */}
              <div className="flex-1 overflow-y-auto p-4 min-h-0">
                <div className="flex items-center justify-between mb-3">
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
                <div className="space-y-2">
                  {outlierRules.length === 0 ? (
                    <div className="text-center py-8 text-sm text-gray-400">
                      No rules defined. Add a rule to get started.
                    </div>
                  ) : (
                    outlierRules.map((rule, index) => (
                      <Card key={index} className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-xs font-medium text-gray-500">Rule {index + 1}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveRule(index)}
                            className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs">Sheet (optional)</Label>
                            <select
                              value={rule.sheet || ''}
                              onChange={(e) => handleUpdateRule(index, 'sheet', e.target.value || undefined)}
                              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                            >
                              <option value="">All Sheets</option>
                              {excelData.sheets.map((sheet, idx) => (
                                <option key={idx} value={sheet.name}>{sheet.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Label className="text-xs">Column (optional)</Label>
                            <select
                              value={rule.column || ''}
                              onChange={(e) => handleUpdateRule(index, 'column', e.target.value || undefined)}
                              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                            >
                              <option value="">All Selected Columns</option>
                              {excelData.sheets.flatMap(sheet => 
                                (selectedColumns[sheet.name] || []).map((col, idx) => (
                                  <option key={`${sheet.name}-${idx}`} value={col}>
                                    {col} ({sheet.name})
                                  </option>
                                ))
                              )}
                            </select>
                          </div>
                          <div>
                            <Label className="text-xs">Condition</Label>
                            <select
                              value={rule.condition}
                              onChange={(e) => handleUpdateRule(index, 'condition', e.target.value)}
                              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                            >
                              <option value="greater_than">Greater Than</option>
                              <option value="less_than">Less Than</option>
                              <option value="equals">Equals</option>
                              <option value="contains">Contains</option>
                            </select>
                          </div>
                          <div>
                            <Label className="text-xs">Value</Label>
                            <Input
                              value={rule.value}
                              onChange={(e) => handleUpdateRule(index, 'value', e.target.value)}
                              placeholder="Value to compare"
                              className="mt-1 h-7 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Action</Label>
                            <select
                              value={rule.action || 'clear_cell'}
                              onChange={(e) => handleUpdateRule(index, 'action', e.target.value)}
                              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                            >
                              <option value="clear_cell">Clear Cell</option>
                              <option value="remove_row">Remove Row</option>
                            </select>
                          </div>
                        </div>
                      </Card>
                    ))
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
                <p className="text-sm text-gray-400 mb-4">Click "Switch Input File" to load an Excel file</p>
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
          ) : !excelData || excelData.sheets.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-gray-600">No data available</p>
              </div>
            </div>
          ) : (
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
                {currentSheet ? (
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
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-400">Select a sheet to view data</p>
                  </div>
                )}
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
              Choose an input file from the node's input folder. Files are shown with their metadata.
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


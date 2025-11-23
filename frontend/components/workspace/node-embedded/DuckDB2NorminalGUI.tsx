'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Database, Play, Download, Loader2, Upload } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'
import { Progress } from '@/components/ui/progress'

interface DuckDB2NorminalGUIProps {
  node: {
    id: string
    module_type: string
    config: any
    state: any
  }
  workflowId: string
  onConfigUpdate?: (config: any) => void
  onProcess?: () => void
  isStandalone?: boolean
  autoSelectFile?: string
  onCreateNewWorkflow?: (file?: File) => void
}

export default function DuckDB2NorminalGUI({
  node,
  workflowId,
  onConfigUpdate,
  onProcess,
  isStandalone = false,
  autoSelectFile,
  onCreateNewWorkflow
}: DuckDB2NorminalGUIProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Load config from file on mount
  const { data: loadedConfig, refetch: refetchConfig } = useQuery({
    queryKey: ['node-config', workflowId, node.id],
    queryFn: async () => {
      return apiClient.get<{ config: any }>(`/v1/workflows/${workflowId}/nodes/${node.id}/config`)
    },
    enabled: !!workflowId && !!node.id,
    staleTime: 0
  })

  // Use loaded config or fallback to node.config
  const effectiveConfig = loadedConfig?.config || node.config || {}
  
  const [uploadedFileKey, setUploadedFileKey] = useState<string | null>(effectiveConfig.file_key || null)
  const [filename, setFilename] = useState<string>(effectiveConfig.filename || '')
  const [selectedColumns, setSelectedColumns] = useState<Record<string, string[]>>(effectiveConfig.selected_columns || {})
  const [viewVersion, setViewVersion] = useState<'original' | 'processed'>('original')
  const [processingProgress, setProcessingProgress] = useState<{ progress: number; message: string; status: string } | null>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)

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
          }>
        }
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/files`)
    },
    enabled: !!workflowId && !!node.id,
    staleTime: 30000
  })

  // Fetch list of all tables
  const { data: tablesListData, isLoading: loadingTablesList } = useQuery({
    queryKey: ['duckdb2norminal-tables-list', workflowId, node.id, viewVersion, uploadedFileKey],
    queryFn: async () => {
      const params = new URLSearchParams({
        version: viewVersion
      })
      
      if (uploadedFileKey) {
        const filename = uploadedFileKey.split('/').pop() || uploadedFileKey
        params.append('file_path', filename)
      }
      
      const response = await apiClient.get<{
        workflow_id: string
        node_id: string
        file_path: string
        version: string
        tables?: Array<{
          name: string
          row_count: number
          columns: string[]
        }>
        message?: string
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/duckdb2norminal-data?${params.toString()}`)
      return response
    },
    enabled: !!uploadedFileKey,
    staleTime: 0
  })

  // Auto-select columns containing "FAI" when tables load
  useEffect(() => {
    if (tablesListData?.tables && Object.keys(selectedColumns).length === 0) {
      const newSelectedColumns: Record<string, string[]> = {}
      
      tablesListData.tables.forEach(table => {
        // Default: select columns containing "FAI" (case-insensitive)
        const faiColumns = table.columns.filter(col => 
          col.toLowerCase().includes('fai')
        )
        if (faiColumns.length > 0) {
          newSelectedColumns[table.name] = faiColumns
        }
      })
      
      if (Object.keys(newSelectedColumns).length > 0) {
        setSelectedColumns(newSelectedColumns)
      }
    }
  }, [tablesListData, selectedColumns])

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      const response = await apiClient.post<{
        file_key: string
        filename: string
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/upload`, formData)
      
      setUploadedFileKey(response.file_key)
      setFilename(response.filename)
      
      // Save config
      await saveConfig({
        file_key: response.file_key,
        filename: response.filename,
        selected_columns: selectedColumns
      })
      
      toast.success('File uploaded successfully')
      refetchInputFiles()
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload file')
    }
  }

  // Save config
  const saveConfig = async (config: any) => {
    try {
      await apiClient.put(`/v1/workflows/${workflowId}/nodes/${node.id}/config`, { config })
      if (onConfigUpdate) {
        onConfigUpdate(config)
      }
    } catch (error) {
      console.error('Failed to save config:', error)
    }
  }

  // Handle column selection
  const toggleColumn = (tableName: string, columnName: string) => {
    const newSelectedColumns = { ...selectedColumns }
    if (!newSelectedColumns[tableName]) {
      newSelectedColumns[tableName] = []
    }
    
    const index = newSelectedColumns[tableName].indexOf(columnName)
    if (index > -1) {
      newSelectedColumns[tableName].splice(index, 1)
    } else {
      newSelectedColumns[tableName].push(columnName)
    }
    
    setSelectedColumns(newSelectedColumns)
    saveConfig({
      file_key: uploadedFileKey,
      filename: filename,
      selected_columns: newSelectedColumns
    })
  }

  // Select all columns for a table
  const selectAllColumns = (tableName: string) => {
    const table = tablesListData?.tables?.find(t => t.name === tableName)
    if (table) {
      const newSelectedColumns = { ...selectedColumns }
      newSelectedColumns[tableName] = [...table.columns]
      setSelectedColumns(newSelectedColumns)
      saveConfig({
        file_key: uploadedFileKey,
        filename: filename,
        selected_columns: newSelectedColumns
      })
    }
  }

  // Deselect all columns for a table
  const deselectAllColumns = (tableName: string) => {
    const newSelectedColumns = { ...selectedColumns }
    newSelectedColumns[tableName] = []
    setSelectedColumns(newSelectedColumns)
    saveConfig({
      file_key: uploadedFileKey,
      filename: filename,
      selected_columns: newSelectedColumns
    })
  }

  // Process normalization
  const processMutation = useMutation({
    mutationFn: async () => {
      // Save config before processing
      await saveConfig({
        file_key: uploadedFileKey,
        filename: filename,
        selected_columns: selectedColumns
      })
      
      return apiClient.post(`/v1/workflows/${workflowId}/nodes/${node.id}/process-duckdb2norminal`, {
        selected_columns: selectedColumns,
        file_key: uploadedFileKey
      })
    },
    onSuccess: () => {
      toast.success('Normalization completed successfully')
      setViewVersion('processed')
      queryClient.invalidateQueries({ queryKey: ['duckdb2norminal-tables-list'] })
      if (onProcess) {
        onProcess()
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to process normalization')
    }
  })

  // Poll for progress
  useEffect(() => {
    if (processMutation.isPending) {
      progressIntervalRef.current = setInterval(async () => {
        try {
          const progress = await apiClient.get<{
            status: string
            progress: number
            message: string
          }>(`/v1/workflows/${workflowId}/nodes/${node.id}/duckdb2norminal-progress`)
          
          setProcessingProgress(progress)
          
          if (progress.status === 'completed' || progress.status === 'error') {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current)
              progressIntervalRef.current = null
            }
            processMutation.reset()
          }
        } catch (error) {
          console.error('Failed to get progress:', error)
        }
      }, 1000)
    } else {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
    }
    
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
    }
  }, [processMutation.isPending, workflowId, node.id])

  const handleProcess = () => {
    if (!uploadedFileKey) {
      toast.error('Please upload a DuckDB file first')
      return
    }
    
    if (Object.keys(selectedColumns).length === 0 || 
        Object.values(selectedColumns).every(cols => cols.length === 0)) {
      toast.error('Please select at least one column to normalize')
      return
    }
    
    processMutation.mutate()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* File Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">DuckDB File</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!uploadedFileKey ? (
              <div className="space-y-2">
                <Label>Upload DuckDB File</Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".duckdb"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      handleFileUpload(file)
                    }
                  }}
                />
                {inputFilesData?.folders?.input && inputFilesData.folders.input.length > 0 && (
                  <div className="mt-4">
                    <Label className="text-sm font-medium mb-2 block">Or select existing file:</Label>
                    <div className="space-y-1">
                      {inputFilesData.folders.input.map((file) => (
                        <Button
                          key={file.path}
                          variant="outline"
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => {
                            setUploadedFileKey(file.path)
                            setFilename(file.name)
                            saveConfig({
                              file_key: file.path,
                              filename: file.name,
                              selected_columns: selectedColumns
                            })
                          }}
                        >
                          <Database className="h-4 w-4 mr-2" />
                          {file.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-blue-500" />
                    <span className="font-medium">{filename}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewVersion(viewVersion === 'original' ? 'processed' : 'original')}
                    >
                      View {viewVersion === 'original' ? 'Processed' : 'Original'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setUploadedFileKey(null)
                        setFilename('')
                        setSelectedColumns({})
                      }}
                    >
                      Change File
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Column Selection Section */}
        {uploadedFileKey && tablesListData?.tables && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Select Columns to Normalize</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingTablesList ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : tablesListData.tables.length === 0 ? (
                <p className="text-sm text-gray-500">No tables found in DuckDB file</p>
              ) : (
                tablesListData.tables.map((table) => (
                  <div key={table.name} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{table.name}</h3>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => selectAllColumns(table.name)}
                        >
                          Select All
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deselectAllColumns(table.name)}
                        >
                          Deselect All
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {table.columns.map((column) => {
                        const isSelected = selectedColumns[table.name]?.includes(column) || false
                        return (
                          <div key={column} className="flex items-center space-x-2">
                            <Checkbox
                              id={`${table.name}-${column}`}
                              checked={isSelected}
                              onCheckedChange={() => toggleColumn(table.name, column)}
                            />
                            <Label
                              htmlFor={`${table.name}-${column}`}
                              className="text-sm cursor-pointer"
                            >
                              {column}
                            </Label>
                          </div>
                        )
                      })}
                    </div>
                    {selectedColumns[table.name] && selectedColumns[table.name].length > 0 && (
                      <p className="text-xs text-gray-500">
                        {selectedColumns[table.name].length} of {table.columns.length} columns selected
                      </p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {/* Processing Progress */}
        {processingProgress && (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>{processingProgress.message}</span>
                  <span>{processingProgress.progress}%</span>
                </div>
                <Progress value={processingProgress.progress} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Action Buttons */}
      <div className="border-t p-4 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {uploadedFileKey && Object.keys(selectedColumns).length > 0 && (
            <span>
              {Object.values(selectedColumns).reduce((sum, cols) => sum + cols.length, 0)} columns selected
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleProcess}
            disabled={!uploadedFileKey || processMutation.isPending || 
              Object.keys(selectedColumns).length === 0 ||
              Object.values(selectedColumns).every(cols => cols.length === 0)}
          >
            {processMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Normalize
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}


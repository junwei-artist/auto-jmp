'use client'

import { useState, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Database, Upload, Play, Loader2, CheckCircle2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'

interface DuckDB2JMPWizardProps {
  node: {
    id: string
    module_type: string
    config: any
  }
  workflowId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfigUpdate?: (config: any) => void
}

type WizardStep = 'upload' | 'settings' | 'convert' | 'confirm'

export default function DuckDB2JMPWizard({
  node,
  workflowId,
  open,
  onOpenChange,
  onConfigUpdate
}: DuckDB2JMPWizardProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [currentStep, setCurrentStep] = useState<WizardStep>('upload')
  const [catVar, setCatVar] = useState<string>(node.config?.cat_var || 'Stage')
  const [colorBy, setColorBy] = useState<string>(node.config?.color_by || '')
  const [chunkSize, setChunkSize] = useState<number>(node.config?.chunk_size || 100000)
  const [uploadedFileKey, setUploadedFileKey] = useState<string | null>(null)
  const [selectedTables, setSelectedTables] = useState<string[]>([])
  const [availableTables, setAvailableTables] = useState<string[]>([])

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
    enabled: open && !!workflowId && !!node.id,
    staleTime: 30000
  })

  // Fetch DuckDB tables when a DuckDB file is selected
  const { data: tablesData, refetch: refetchTables } = useQuery({
    queryKey: ['duckdb-tables', workflowId, node.id, uploadedFileKey],
    queryFn: async () => {
      if (!uploadedFileKey) return null
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
    enabled: open && !!uploadedFileKey && !!workflowId && !!node.id,
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
      setCurrentStep('settings')
      toast.success('File uploaded successfully. Please configure settings.')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to upload file')
    }
  })

  // Save settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      const config = {
        cat_var: catVar,
        color_by: colorBy || undefined,
        chunk_size: chunkSize,
        selected_tables: selectedTables.length > 0 ? selectedTables : undefined,
        file_key: uploadedFileKey
      }
      if (onConfigUpdate) {
        onConfigUpdate(config)
      }
      return config
    },
    onSuccess: () => {
      setCurrentStep('convert')
      toast.success('Settings saved')
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
      return apiClient.post<{
        workflow_id: string
        node_id: string
        pairs: Array<{
          pair_id: string
          table_name: string
          pair_folder: string
          csv_filename: string
          jsl_filename: string
        }>
        total_pairs: number
        tables_processed: number
        total_tables: number
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/execute-duckdb2jmp`, formData)
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['jsl-csv-pairs', workflowId, node.id] })
      toast.success(`Conversion complete! Created ${data.total_pairs} pair(s) from ${data.tables_processed} table(s)`)
      setCurrentStep('confirm')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to execute conversion')
    }
  })

  // Update available tables when tables data changes
  useEffect(() => {
    if (tablesData?.tables) {
      const tableNames = tablesData.tables.map(t => t.name)
      setAvailableTables(tableNames)
      // Auto-select all tables if none selected
      if (selectedTables.length === 0) {
        setSelectedTables(tableNames)
      }
    }
  }, [tablesData])

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

  const handleSelectInputFile = (file: { path: string; metadata?: any }) => {
    setUploadedFileKey(file.path)
    refetchTables()
    setCurrentStep('settings')
  }

  const handleSaveSettings = () => {
    saveSettingsMutation.mutate()
  }

  const handleExecute = () => {
    executeMutation.mutate()
  }

  const handleClose = () => {
    onOpenChange(false)
    if (currentStep === 'confirm') {
      setCurrentStep('upload')
      setUploadedFileKey(null)
      setSelectedTables([])
    }
  }

  const toggleTableSelection = (tableName: string) => {
    if (selectedTables.includes(tableName)) {
      setSelectedTables(selectedTables.filter(t => t !== tableName))
    } else {
      setSelectedTables([...selectedTables, tableName])
    }
  }

  // Initialize step based on whether file is already uploaded
  useEffect(() => {
    if (open && currentStep === 'upload' && uploadedFileKey) {
      setCurrentStep('settings')
    }
  }, [open, uploadedFileKey])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto backdrop-blur-xl bg-white/90 border-white/30 rounded-2xl shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center shadow-md">
              <Database className="h-4 w-4 text-white" />
            </div>
            <span className="text-gray-800">DuckDB to JMP</span>
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            Convert DuckDB files to JSL/CSV pairs for JMP analysis. Each table is treated as a sheet.
          </DialogDescription>
        </DialogHeader>

        {currentStep === 'upload' && (
          <div className="space-y-4">
            <Card className="backdrop-blur-sm bg-white/60 border-white/40 rounded-xl shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-md">
                    <Upload className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span>Upload DuckDB File</span>
                </CardTitle>
                <CardDescription className="text-gray-600">
                  Upload a DuckDB file. Each table will be processed separately.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".duckdb"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {inputFilesData?.folders?.input && inputFilesData.folders.input.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Or select from existing files:</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {inputFilesData.folders.input
                        .filter(file => file.name.endsWith('.duckdb'))
                        .map((file) => (
                        <button
                          key={file.name}
                          onClick={() => handleSelectInputFile(file)}
                          className={`w-full text-left px-4 py-3 rounded-xl border transition-all backdrop-blur-sm ${
                            file.path === uploadedFileKey 
                              ? 'bg-gradient-to-r from-indigo-100/80 to-purple-100/80 border-indigo-300/50 shadow-md' 
                              : 'bg-white/60 border-white/40 hover:bg-white/80 hover:border-indigo-200/50 hover:shadow-sm'
                          }`}
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
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {currentStep === 'settings' && (
          <div className="space-y-4">
            <Card className="backdrop-blur-sm bg-white/60 border-white/40 rounded-xl shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center shadow-md">
                    <Database className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span>Settings</span>
                </CardTitle>
                <CardDescription className="text-gray-600">
                  Configure conversion parameters before converting to CSV/JSL
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {tablesData?.tables && tablesData.tables.length > 0 && (
                  <div>
                    <Label>Select Tables to Process</Label>
                    <div className="mt-2 space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                      {tablesData.tables.map((table) => (
                        <div key={table.name} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={selectedTables.includes(table.name)}
                            onChange={() => toggleTableSelection(table.name)}
                            className="rounded"
                          />
                          <span className="text-sm">
                            {table.name} ({table.row_count.toLocaleString()} rows)
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedTables.length} of {tablesData.tables.length} tables selected
                    </p>
                  </div>
                )}
                
                <div>
                  <Label htmlFor="cat-var">Categorical Variable *</Label>
                  <Input
                    id="cat-var"
                    value={catVar}
                    onChange={(e) => setCatVar(e.target.value)}
                    placeholder="Stage"
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Name of the categorical variable (default: "Stage")
                  </p>
                </div>
                <div>
                  <Label htmlFor="color-by">Color By (Optional)</Label>
                  <Input
                    id="color-by"
                    value={colorBy}
                    onChange={(e) => setColorBy(e.target.value)}
                    placeholder="Leave empty to use categorical variable"
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Optional variable to color by in graphs
                  </p>
                </div>
                <div>
                  <Label htmlFor="chunk-size">Chunk Size</Label>
                  <Input
                    id="chunk-size"
                    type="number"
                    value={chunkSize}
                    onChange={(e) => setChunkSize(parseInt(e.target.value) || 100000)}
                    placeholder="100000"
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Number of rows to process at a time for large datasets (default: 100000)
                  </p>
                </div>
                <Button
                  onClick={handleSaveSettings}
                  disabled={saveSettingsMutation.isPending || !catVar || selectedTables.length === 0}
                  className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-0 hover:from-emerald-600 hover:to-teal-700 shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {saveSettingsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <div className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center mr-2">
                        <CheckCircle2 className="h-3 w-3" />
                      </div>
                      Save Settings & Continue
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {currentStep === 'convert' && (
          <div className="space-y-4">
            <Card className="backdrop-blur-sm bg-white/60 border-white/40 rounded-xl shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center shadow-md">
                    <Play className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span>Ready to Convert</span>
                </CardTitle>
                <CardDescription className="text-gray-600">
                  Settings: Categorical Variable = {catVar}
                  {colorBy && `, Color By = ${colorBy}`}
                  {selectedTables.length > 0 && `, Tables = ${selectedTables.length}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-gradient-to-r from-blue-50/80 to-purple-50/80 backdrop-blur-sm border border-blue-200/50 rounded-xl p-4 shadow-sm">
                  <p className="text-sm text-gray-800 font-medium">
                    The DuckDB file will be converted to JSL/CSV pairs. Each table will create a separate pair in the output folder.
                    {chunkSize && chunkSize < 1000000 && (
                      <span className="block mt-2">
                        Large datasets will be processed in chunks of {chunkSize.toLocaleString()} rows.
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  onClick={handleExecute}
                  disabled={executeMutation.isPending || !uploadedFileKey || selectedTables.length === 0}
                  className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white border-0 hover:from-indigo-600 hover:to-purple-700 shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {executeMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Converting...
                    </>
                  ) : (
                    <>
                      <div className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center mr-2">
                        <Play className="h-3 w-3" />
                      </div>
                      Execute Conversion
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {currentStep === 'confirm' && (
          <div className="space-y-4">
            <Card className="backdrop-blur-sm bg-white/60 border-white/40 rounded-xl shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-md">
                    <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span>Conversion Complete</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {executeMutation.data && (
                  <div className="space-y-4">
                    <div className="bg-gradient-to-r from-emerald-50/80 to-teal-50/80 backdrop-blur-sm border border-emerald-200/50 rounded-xl p-4 shadow-sm">
                      <p className="text-sm text-gray-800 font-semibold">
                        Successfully created {executeMutation.data.total_pairs} JSL/CSV pair(s) from {executeMutation.data.tables_processed} table(s)
                      </p>
                    </div>
                    <div className="text-sm space-y-2">
                      {executeMutation.data.pairs.map((pair) => (
                        <div key={pair.pair_id} className="border border-white/40 rounded-xl p-3 bg-white/60 backdrop-blur-sm shadow-sm">
                          <div className="font-semibold text-gray-800"><strong>Table:</strong> {pair.table_name}</div>
                          <div className="font-medium text-gray-700"><strong>CSV:</strong> {pair.csv_filename}</div>
                          <div className="font-medium text-gray-700"><strong>JSL:</strong> {pair.jsl_filename}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <div className="flex justify-between pt-4 border-t border-white/20">
          <Button
            variant="outline"
            onClick={handleClose}
            className="rounded-full bg-white/60 backdrop-blur-sm border-white/40 hover:bg-white/80 shadow-sm transition-all"
          >
            {currentStep === 'confirm' ? 'Close' : 'Cancel'}
          </Button>
          {currentStep === 'settings' && (
            <Button
              variant="outline"
              onClick={() => setCurrentStep('upload')}
              className="rounded-full bg-white/60 backdrop-blur-sm border-white/40 hover:bg-white/80 shadow-sm transition-all"
            >
              Back
            </Button>
          )}
          {currentStep === 'convert' && (
            <Button
              variant="outline"
              onClick={() => setCurrentStep('settings')}
              className="rounded-full bg-white/60 backdrop-blur-sm border-white/40 hover:bg-white/80 shadow-sm transition-all"
            >
              Back
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}


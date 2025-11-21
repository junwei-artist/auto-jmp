'use client'

import { useState, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Database, Upload, Play, Loader2, FileText, CheckCircle2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'

interface DuckDBConvertWizardProps {
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

type WizardStep = 'upload' | 'configure' | 'confirm'

export default function DuckDBConvertWizard({
  node,
  workflowId,
  open,
  onOpenChange,
  onConfigUpdate
}: DuckDBConvertWizardProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [currentStep, setCurrentStep] = useState<WizardStep>('upload')
  const [uploadedFileKey, setUploadedFileKey] = useState<string | null>(node.config?.file_key || null)
  const [filename, setFilename] = useState<string>(node.config?.filename || '')

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
    enabled: open && !!workflowId && !!node.id,
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
      setCurrentStep('configure')
      refetchInputFiles()
      toast.success('File uploaded successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to upload file')
    }
  })

  // Execute DuckDB conversion mutation
  const executeMutation = useMutation({
    mutationFn: async () => {
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
      queryClient.invalidateQueries({ queryKey: ['workflow-nodes', workflowId] })
      toast.success(`Conversion complete! Created ${data.summary.tables_created} tables.`)
      setCurrentStep('confirm')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to execute conversion')
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

  const handleSelectInputFile = (file: { path: string; metadata?: any }) => {
    const fileKey = file.path
    const originalFilename = file.metadata?.original_filename || file.path.split('/').pop() || 'Unknown'
    
    setUploadedFileKey(fileKey)
    setFilename(originalFilename)
    setCurrentStep('configure')
  }

  const handleExecute = () => {
    executeMutation.mutate()
  }

  const handleClose = () => {
    onOpenChange(false)
    // Reset to upload step when closing
    if (currentStep === 'confirm') {
      setCurrentStep('upload')
    }
  }

  // Initialize step based on whether file is already uploaded
  if (open && currentStep === 'upload' && uploadedFileKey) {
    setCurrentStep('configure')
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Database className="h-5 w-5" />
            <span>DuckDB Converter</span>
          </DialogTitle>
          <DialogDescription>
            Convert Excel files to DuckDB database. Each sheet becomes a separate table.
          </DialogDescription>
        </DialogHeader>

        {currentStep === 'upload' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Upload Excel File</CardTitle>
                <CardDescription>
                  Upload an Excel file or select from existing input files
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full"
                  disabled={uploadMutation.isPending}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadMutation.isPending ? 'Uploading...' : 'Upload New File'}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {inputFilesData?.folders?.input && inputFilesData.folders.input.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Or select from existing files:</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {inputFilesData.folders.input.map((file) => (
                        <button
                          key={file.name}
                          onClick={() => handleSelectInputFile(file)}
                          className={`w-full text-left px-4 py-3 rounded-lg border hover:bg-gray-50 transition-all ${
                            file.path === uploadedFileKey ? 'bg-indigo-50 border-indigo-200' : 'border-gray-200'
                          }`}
                        >
                          <div className="flex items-start space-x-3">
                            <FileText className="h-5 w-5 text-gray-400 mt-0.5" />
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
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {currentStep === 'configure' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Ready to Convert</CardTitle>
                <CardDescription>
                  {filename && `File: ${filename}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-900">
                    The Excel file will be converted to a DuckDB database. Each sheet will become a separate table.
                    Table names will be automatically sanitized from sheet names.
                  </p>
                </div>
                <Button
                  onClick={handleExecute}
                  disabled={executeMutation.isPending || !uploadedFileKey}
                  className="w-full"
                >
                  {executeMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Converting...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
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
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span>Conversion Complete</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {executeMutation.data && (
                  <div className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <p className="text-sm text-green-900 font-medium">
                        Successfully created {executeMutation.data.summary.tables_created} table(s) in DuckDB database.
                      </p>
                    </div>
                    {executeMutation.data.converted_tables && executeMutation.data.converted_tables.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Created Tables:</h3>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {executeMutation.data.converted_tables.map((table, idx) => (
                            <div key={idx} className="bg-gray-50 rounded-lg p-3">
                              <div className="font-medium text-gray-900">{table.table_name}</div>
                              <div className="text-xs text-gray-500 mt-1">
                                Sheet: {table.sheet} • Rows: {table.rows} • Columns: {table.columns.length}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleClose}
          >
            {currentStep === 'confirm' ? 'Close' : 'Cancel'}
          </Button>
          {currentStep === 'configure' && (
            <Button
              variant="outline"
              onClick={() => setCurrentStep('upload')}
            >
              Back
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}


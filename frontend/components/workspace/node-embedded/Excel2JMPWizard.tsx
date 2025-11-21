'use client'

import { useState, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileSpreadsheet, Upload, Play, Loader2, CheckCircle2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'

interface Excel2JMPWizardProps {
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

export default function Excel2JMPWizard({
  node,
  workflowId,
  open,
  onOpenChange,
  onConfigUpdate
}: Excel2JMPWizardProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [currentStep, setCurrentStep] = useState<WizardStep>('upload')
  const [catVar, setCatVar] = useState<string>(node.config?.cat_var || 'Stage')
  const [colorBy, setColorBy] = useState<string>(node.config?.color_by || '')
  const [uploadedFileKey, setUploadedFileKey] = useState<string | null>(null)

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
    setUploadedFileKey(file.path)
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <FileSpreadsheet className="h-5 w-5" />
            <span>Excel to JMP</span>
          </DialogTitle>
          <DialogDescription>
            Convert Excel files to JSL/CSV pairs for JMP analysis
          </DialogDescription>
        </DialogHeader>

        {currentStep === 'upload' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Upload Excel File</CardTitle>
                <CardDescription>
                  Upload an Excel file with 'meta' and 'data' sheets
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
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {currentStep === 'settings' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Settings</CardTitle>
                <CardDescription>
                  Configure conversion parameters before converting to CSV/JSL
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                <Button
                  onClick={handleSaveSettings}
                  disabled={saveSettingsMutation.isPending || !catVar}
                  className="w-full"
                >
                  {saveSettingsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Settings & Continue'
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {currentStep === 'convert' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Ready to Convert</CardTitle>
                <CardDescription>
                  Settings: Categorical Variable = {catVar}
                  {colorBy && `, Color By = ${colorBy}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-900">
                    The Excel file will be converted to a JSL/CSV pair. Each conversion creates a new pair in the output folder.
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
                        Successfully created JSL/CSV pair: {executeMutation.data.pair_folder}
                      </p>
                    </div>
                    <div className="text-sm space-y-2">
                      <div><strong>CSV:</strong> {executeMutation.data.csv_filename}</div>
                      <div><strong>JSL:</strong> {executeMutation.data.jsl_filename}</div>
                    </div>
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
          {currentStep === 'settings' && (
            <Button
              variant="outline"
              onClick={() => setCurrentStep('upload')}
            >
              Back
            </Button>
          )}
          {currentStep === 'convert' && (
            <Button
              variant="outline"
              onClick={() => setCurrentStep('settings')}
            >
              Back
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}


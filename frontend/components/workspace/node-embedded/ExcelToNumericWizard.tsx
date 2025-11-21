'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Upload, FileSpreadsheet, Check, ChevronRight, ChevronLeft, Hash, Play } from 'lucide-react'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'

interface ExcelToNumericWizardProps {
  node: {
    id: string
    module_type: string
    config: any
    state: any
  }
  workspaceId?: string
  workflowId: string
  hasInputSource: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfigUpdate?: (config: any) => void
  onProcess?: () => void
}

type WizardStep = 'upload' | 'sheet' | 'columns' | 'confirm'

export default function ExcelToNumericWizard({ 
  node, 
  workspaceId, 
  workflowId, 
  hasInputSource,
  open,
  onOpenChange,
  onConfigUpdate,
  onProcess
}: ExcelToNumericWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('upload')
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [availableSheets, setAvailableSheets] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [columnsToConvert, setColumnsToConvert] = useState<string>('')
  const [convertAll, setConvertAll] = useState<boolean>(true)
  const [uploadedFileKey, setUploadedFileKey] = useState<string | null>(node.config?.file_key || null)

  // Initialize from config
  useEffect(() => {
    if (!open) return // Reset when dialog closes
    
    if (node.config?.file_key) {
      setUploadedFileKey(node.config.file_key)
      setAvailableSheets(node.config.available_sheets || [])
      setSelectedSheet(node.config.sheet_name || '')
      const configColumns = node.config.columns_to_convert
      if (configColumns === 'all' || !configColumns) {
        setConvertAll(true)
        setColumnsToConvert('')
      } else if (Array.isArray(configColumns)) {
        setConvertAll(false)
        setColumnsToConvert(configColumns.join(', '))
      } else {
        setConvertAll(false)
        setColumnsToConvert(configColumns || '')
      }
      
      // If file exists, start from appropriate step
      if (hasInputSource) {
        setCurrentStep('columns')
      } else {
        setCurrentStep('sheet')
      }
    } else if (hasInputSource) {
      // If has input source, skip upload and start from columns
      setCurrentStep('columns')
    } else {
      setCurrentStep('upload')
    }
  }, [node.config, hasInputSource, open])

  const handleFileUpload = useCallback(async (uploadedFile: File) => {
    if (!uploadedFile) return

    // Validate file type
    if (!uploadedFile.name.match(/\.(xlsx|xls)$/i)) {
      toast.error('Please upload a valid Excel file (.xlsx or .xls)')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', uploadedFile)
      
      const uploadUrl = workspaceId 
        ? `/v1/workspaces/${workspaceId}/workflows/${workflowId}/nodes/${node.id}/upload`
        : `/v1/workflows/${workflowId}/nodes/${node.id}/upload`

      const response = await apiClient.post<{
        storage_key: string
        filename: string
        available_sheets: string[]
      }>(uploadUrl, formData)

      setUploadedFileKey(response.storage_key)
      setAvailableSheets(response.available_sheets || [])
      if (response.available_sheets && response.available_sheets.length > 0) {
        setSelectedSheet(response.available_sheets[0])
      }

      toast.success('File uploaded successfully')
      
      // Move to next step
      setCurrentStep('sheet')
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload file')
    } finally {
      setUploading(false)
    }
  }, [workspaceId, workflowId, node.id])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      handleFileUpload(selectedFile)
    }
  }

  const handleNext = () => {
    if (currentStep === 'upload') {
      if (uploadedFileKey || hasInputSource) {
        setCurrentStep('sheet')
      }
    } else if (currentStep === 'sheet') {
      setCurrentStep('columns')
    } else if (currentStep === 'columns') {
      setCurrentStep('confirm')
    }
  }

  const handleBack = () => {
    if (currentStep === 'confirm') {
      setCurrentStep('columns')
    } else if (currentStep === 'columns') {
      setCurrentStep('sheet')
    } else if (currentStep === 'sheet' && !hasInputSource) {
      setCurrentStep('upload')
    }
  }

  const handleFinish = () => {
    const config = {
      ...node.config,
      file_key: uploadedFileKey,
      sheet_name: selectedSheet,
      available_sheets: availableSheets,
      columns_to_convert: convertAll ? 'all' : (columnsToConvert.trim() || 'all')
    }

    if (onConfigUpdate) {
      onConfigUpdate(config)
    }

    if (onProcess) {
      onProcess()
    }

    toast.success('Configuration saved and processing started')
    onOpenChange(false)
  }

  const canProceed = () => {
    if (currentStep === 'upload') {
      return uploadedFileKey !== null || hasInputSource
    } else if (currentStep === 'sheet') {
      return selectedSheet !== ''
    } else if (currentStep === 'columns') {
      return true // Always can proceed, even if empty (will convert all)
    }
    return true
  }

  const getStepNumber = (step: WizardStep) => {
    const steps: WizardStep[] = hasInputSource 
      ? ['columns', 'confirm'] 
      : ['upload', 'sheet', 'columns', 'confirm']
    return steps.indexOf(step) + 1
  }

  const getTotalSteps = () => {
    return hasInputSource ? 2 : 4
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Hash className="h-5 w-5 text-purple-600" />
            <span>Excel to Numeric - Configuration Wizard</span>
          </DialogTitle>
          <DialogDescription>
            Step {getStepNumber(currentStep)} of {getTotalSteps()}: Configure your Excel to Numeric conversion
          </DialogDescription>
        </DialogHeader>

        {/* Progress Indicator */}
        <div className="flex items-center justify-between mb-6">
          {!hasInputSource && (
            <div className={`flex-1 h-2 rounded-full mx-1 ${
              currentStep === 'upload' ? 'bg-purple-600' : 'bg-purple-300'
            }`} />
          )}
          <div className={`flex-1 h-2 rounded-full mx-1 ${
            currentStep === 'sheet' ? 'bg-purple-600' : 
            ['columns', 'confirm'].includes(currentStep) ? 'bg-purple-300' : 'bg-gray-200'
          }`} />
          <div className={`flex-1 h-2 rounded-full mx-1 ${
            currentStep === 'columns' ? 'bg-purple-600' : 
            currentStep === 'confirm' ? 'bg-purple-300' : 'bg-gray-200'
          }`} />
          <div className={`flex-1 h-2 rounded-full mx-1 ${
            currentStep === 'confirm' ? 'bg-purple-600' : 'bg-gray-200'
          }`} />
        </div>

        {/* Step Content */}
        <div className="min-h-[400px]">
          {currentStep === 'upload' && !hasInputSource && (
            <Card>
              <CardHeader>
                <CardTitle>Step 1: Upload Excel File</CardTitle>
                <CardDescription>
                  Upload an Excel file to convert column variables to numbers
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!uploadedFileKey ? (
                  <div className="border-2 border-dashed border-purple-300 rounded-lg p-12 text-center hover:border-purple-400 transition-colors">
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileSelect}
                      disabled={uploading}
                      className="hidden"
                      id={`excel-upload-wizard-${node.id}`}
                    />
                    <label htmlFor={`excel-upload-wizard-${node.id}`} className="cursor-pointer">
                      {uploading ? (
                        <div className="flex flex-col items-center">
                          <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mb-4" />
                          <p className="text-purple-700 font-medium">Uploading...</p>
                        </div>
                      ) : (
                        <>
                          <Upload className="h-12 w-12 mx-auto mb-4 text-purple-600" />
                          <p className="text-purple-700 font-medium mb-2">
                            Click to upload Excel file
                          </p>
                          <p className="text-sm text-gray-500">
                            Supports .xlsx and .xls files
                          </p>
                        </>
                      )}
                    </label>
                  </div>
                ) : (
                  <div className="border border-purple-200 rounded-lg p-4 bg-purple-50">
                    <div className="flex items-center space-x-3">
                      <FileSpreadsheet className="h-8 w-8 text-purple-600" />
                      <div>
                        <p className="font-medium text-gray-900">
                          {node.config?.filename || 'File uploaded'}
                        </p>
                        <p className="text-sm text-gray-500">
                          Ready to proceed
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {currentStep === 'sheet' && !hasInputSource && (
            <Card>
              <CardHeader>
                <CardTitle>Step 2: Select Sheet</CardTitle>
                <CardDescription>
                  Choose which sheet to process from the Excel file
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {availableSheets.map((sheet) => (
                    <button
                      key={sheet}
                      onClick={() => setSelectedSheet(sheet)}
                      className={`w-full text-left p-4 rounded-lg border transition-all duration-200 ${
                        selectedSheet === sheet
                          ? 'border-purple-500 bg-purple-50 text-purple-900 shadow-md'
                          : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{sheet}</span>
                        {selectedSheet === sheet && (
                          <Check className="h-5 w-5 text-purple-600" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {currentStep === 'columns' && (
            <Card>
              <CardHeader>
                <CardTitle>Step {hasInputSource ? '1' : '3'}: Select Columns to Convert</CardTitle>
                <CardDescription>
                  Choose which columns to convert to numeric values
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="convert-all"
                    checked={convertAll}
                    onChange={(e) => {
                      setConvertAll(e.target.checked)
                      if (e.target.checked) {
                        setColumnsToConvert('')
                      }
                    }}
                    className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                  />
                  <Label htmlFor="convert-all" className="text-sm font-medium text-gray-700 cursor-pointer">
                    Convert all columns to numeric
                  </Label>
                </div>
                
                {!convertAll && (
                  <div className="space-y-2">
                    <Label htmlFor="columns-input" className="text-sm font-medium text-gray-700">
                      Column Names (comma-separated)
                    </Label>
                    <Input
                      id="columns-input"
                      type="text"
                      placeholder="e.g., Column1, Column2, Column3"
                      value={columnsToConvert}
                      onChange={(e) => setColumnsToConvert(e.target.value)}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500">
                      Enter column names separated by commas, or leave empty to convert all columns
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {currentStep === 'confirm' && (
            <Card>
              <CardHeader>
                <CardTitle>Step {hasInputSource ? '2' : '4'}: Confirm Configuration</CardTitle>
                <CardDescription>
                  Review your settings before processing
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!hasInputSource && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">File</Label>
                    <p className="text-sm text-gray-600">{node.config?.filename || 'N/A'}</p>
                  </div>
                )}
                {!hasInputSource && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">Sheet</Label>
                    <p className="text-sm text-gray-600">{selectedSheet || 'N/A'}</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Columns to Convert</Label>
                  <p className="text-sm text-gray-600">
                    {convertAll ? 'All columns' : (columnsToConvert || 'All columns')}
                  </p>
                </div>
                {hasInputSource && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-800">
                      This node will process data from its input source connection.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between items-center pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === (hasInputSource ? 'columns' : 'upload')}
            className="flex items-center space-x-2"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Back</span>
          </Button>

          {currentStep === 'confirm' ? (
            <Button
              onClick={handleFinish}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white flex items-center space-x-2"
            >
              <Play className="h-4 w-4" />
              <span>Process & Save</span>
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white flex items-center space-x-2"
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}


'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileSpreadsheet, Upload, ArrowRight, ArrowLeft, Check, X, Play, Eye, Plus } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'

type WizardStep = 'upload' | 'view' | 'outlier' | 'confirm'

interface ExcelViewerWizardProps {
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

export default function ExcelViewerWizard({
  node,
  workspaceId,
  workflowId,
  hasInputSource,
  open,
  onOpenChange,
  onConfigUpdate,
  onProcess
}: ExcelViewerWizardProps) {
  const queryClient = useQueryClient()
  const [currentStep, setCurrentStep] = useState<WizardStep>(hasInputSource ? 'view' : 'upload')
  const [uploadedFileKey, setUploadedFileKey] = useState<string | null>(node.config?.file_key || null)
  const [filename, setFilename] = useState<string>(node.config?.filename || '')
  const [selectedVersion, setSelectedVersion] = useState<'original' | 'processed'>('original')
  const [outlierRules, setOutlierRules] = useState<Array<{
    column: string
    condition: string
    value: string
  }>>(node.config?.outlier_rules || [])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [selectedColumn, setSelectedColumn] = useState<string>('')

  // Fetch Excel data
  type ExcelDataResponse = {
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
  }
  
  const { data: excelData, isLoading: loadingData, refetch: refetchData } = useQuery<ExcelDataResponse>({
    queryKey: ['excel-data', workflowId, node.id, selectedVersion],
    queryFn: async () => {
      return apiClient.get<ExcelDataResponse>(`/v1/workflows/${workflowId}/nodes/${node.id}/excel-data?version=${selectedVersion}`)
    },
    enabled: !!(open && (uploadedFileKey || hasInputSource) && currentStep !== 'upload'),
    staleTime: 30000
  })

  // File upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      
      const uploadUrl = workspaceId 
        ? `/v1/workspaces/${workspaceId}/workflows/${workflowId}/nodes/${node.id}/upload`
        : `/v1/workflows/${workflowId}/nodes/${node.id}/upload`
      
      return apiClient.post<{
        storage_key: string
        filename: string
      }>(uploadUrl, formData)
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
      toast.success('File uploaded successfully')
      setCurrentStep('view')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to upload file')
    }
  })

  // Process Excel mutation
  const processMutation = useMutation({
    mutationFn: async (rules: Array<{ column: string; condition: string; value: string }>) => {
      return apiClient.post<{
        workflow_id: string
        node_id: string
        original_file: string
        processed_file: string
        filename: string
        sheets_processed: string[]
      }>(`/v1/workflows/${workflowId}/nodes/${node.id}/process-excel`, rules)
    },
    onSuccess: (data) => {
      toast.success(`Excel processed successfully: ${data.sheets_processed.length} sheet(s) processed`)
      queryClient.invalidateQueries({ queryKey: ['excel-data', workflowId, node.id] })
      queryClient.invalidateQueries({ queryKey: ['node-files', workflowId, node.id] })
      setSelectedVersion('processed')
      refetchData()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to process Excel')
    }
  })

  useEffect(() => {
    if (hasInputSource) {
      setCurrentStep('view')
    } else if (uploadedFileKey) {
      setCurrentStep('view')
    } else {
      setCurrentStep('upload')
    }
  }, [hasInputSource, uploadedFileKey])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadMutation.mutate(file)
    }
  }

  const handleAddRule = () => {
    if (!selectedColumn) {
      toast.error('Please select a column first')
      return
    }
    setOutlierRules([...outlierRules, { 
      column: selectedColumn, 
      condition: 'greater_than', 
      value: '' 
    }])
    setSelectedColumn('')
  }

  const handleRemoveRule = (index: number) => {
    setOutlierRules(outlierRules.filter((_, i) => i !== index))
  }

  const handleUpdateRule = (index: number, field: string, value: string) => {
    const updated = [...outlierRules]
    updated[index] = { ...updated[index], [field]: value }
    setOutlierRules(updated)
  }

  const handleProcess = () => {
    if (outlierRules.length === 0) {
      toast.error('Please add at least one outlier removal rule')
      return
    }
    processMutation.mutate(outlierRules)
  }

  const handleNext = () => {
    if (currentStep === 'upload') {
      if (uploadedFileKey || hasInputSource) {
        setCurrentStep('view')
      }
    } else if (currentStep === 'view') {
      setCurrentStep('outlier')
    } else if (currentStep === 'outlier') {
      setCurrentStep('confirm')
    }
  }

  const handleBack = () => {
    if (currentStep === 'confirm') {
      setCurrentStep('outlier')
    } else if (currentStep === 'outlier') {
      setCurrentStep('view')
    } else if (currentStep === 'view' && !hasInputSource) {
      setCurrentStep('upload')
    }
  }

  const handleFinish = () => {
    if (onConfigUpdate) {
      onConfigUpdate({
        ...node.config,
        file_key: uploadedFileKey,
        filename: filename,
        outlier_rules: outlierRules
      })
    }
    toast.success('Configuration saved')
    onOpenChange(false)
  }

  const getStepNumber = (step: WizardStep) => {
    const steps: WizardStep[] = hasInputSource 
      ? ['view', 'outlier', 'confirm'] 
      : ['upload', 'view', 'outlier', 'confirm']
    return steps.indexOf(step) + 1
  }

  const getTotalSteps = () => {
    return hasInputSource ? 3 : 4
  }

  const renderStep = () => {
    switch (currentStep) {
      case 'upload':
        return (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <FileSpreadsheet className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <Label htmlFor="file-upload" className="cursor-pointer">
                <span className="text-sm font-medium text-gray-700">Click to upload Excel file</span>
                <Input
                  id="file-upload"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </Label>
              <p className="text-xs text-gray-500 mt-2">Supports .xlsx and .xls files</p>
            </div>
            {uploadMutation.isPending && (
              <div className="text-center text-sm text-gray-500">Uploading...</div>
            )}
          </div>
        )

      case 'view':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Excel Viewer</h3>
              <div className="flex items-center gap-2">
                <Button
                  variant={selectedVersion === 'original' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSelectedVersion('original')
                    refetchData()
                  }}
                >
                  Original
                </Button>
                <Button
                  variant={selectedVersion === 'processed' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSelectedVersion('processed')
                    refetchData()
                  }}
                >
                  Processed
                </Button>
              </div>
            </div>

            {loadingData && (
              <div className="text-center py-8 text-gray-500">Loading Excel data...</div>
            )}

            {excelData && (
              <div className="space-y-4">
                <div className="text-sm text-gray-600">
                  File: {excelData.filename} ({excelData.sheets.length} sheet(s))
                </div>
                
                <div className="space-y-4">
                  {excelData.sheets.map((sheet, idx) => (
                    <Card key={idx}>
                      <CardHeader>
                        <CardTitle className="text-base">{sheet.name}</CardTitle>
                        <CardDescription>
                          {sheet.total_rows} rows × {sheet.columns.length} columns
                          {sheet.displayed_rows < sheet.total_rows && ` (showing first ${sheet.displayed_rows})`}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto max-h-96 overflow-y-auto">
                          <table className="w-full text-sm border-collapse">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr>
                                {sheet.columns.map((col, colIdx) => (
                                  <th key={colIdx} className="border border-gray-200 px-2 py-1 text-left font-semibold text-gray-700">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sheet.data.map((row, rowIdx) => (
                                <tr key={rowIdx} className="hover:bg-gray-50">
                                  {sheet.columns.map((col, colIdx) => (
                                    <td key={colIdx} className="border border-gray-200 px-2 py-1 text-gray-800">
                                      {row[col] !== null && row[col] !== undefined ? String(row[col]) : ''}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )

      case 'outlier':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Outlier Removal Rules</h3>
              <Button
                variant="default"
                size="sm"
                onClick={() => setOutlierRules([...outlierRules, { column: '', condition: 'greater_than', value: '' }])}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Rule
              </Button>
            </div>
            
            {excelData && excelData.sheets.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Quick Add from Sheet</CardTitle>
                  <CardDescription className="text-xs">
                    Select a sheet and column to quickly add a rule
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Sheet</Label>
                        <select
                          value={selectedSheet}
                          onChange={(e) => {
                            setSelectedSheet(e.target.value)
                            setSelectedColumn('')
                          }}
                          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        >
                          <option value="">Select Sheet</option>
                          {excelData.sheets.map((sheet, idx) => (
                            <option key={idx} value={sheet.name}>{sheet.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs">Column</Label>
                        <select
                          value={selectedColumn}
                          onChange={(e) => setSelectedColumn(e.target.value)}
                          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                          disabled={!selectedSheet}
                        >
                          <option value="">Select Column</option>
                          {selectedSheet && excelData.sheets.find(s => s.name === selectedSheet)?.columns.map((col, idx) => (
                            <option key={idx} value={col}>{col}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAddRule}
                      disabled={!selectedColumn}
                      className="w-full"
                    >
                      Add Rule for Selected Column
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-3">
              {outlierRules.length === 0 ? (
                <Card>
                  <CardContent className="py-8">
                    <div className="text-center space-y-3">
                      <FileSpreadsheet className="h-12 w-12 mx-auto text-gray-300" />
                      <div>
                        <p className="text-sm font-medium text-gray-600">No outlier removal rules</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Add rules to remove values based on conditions
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setOutlierRules([{ column: '', condition: 'greater_than', value: '' }])}
                        className="mt-2"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Your First Rule
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                outlierRules.map((rule, index) => (
                  <Card key={index}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <Label className="text-sm font-semibold">Rule {index + 1}</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveRule(index)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs">Column Name</Label>
                          {excelData && excelData.sheets.length > 0 ? (
                            <select
                              value={rule.column}
                              onChange={(e) => handleUpdateRule(index, 'column', e.target.value)}
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                            >
                              <option value="">Select Column</option>
                              {excelData.sheets.flatMap(sheet => 
                                sheet.columns.map((col, idx) => (
                                  <option key={`${sheet.name}-${idx}`} value={col}>
                                    {col} ({sheet.name})
                                  </option>
                                ))
                              )}
                            </select>
                          ) : (
                            <Input
                              value={rule.column}
                              onChange={(e) => handleUpdateRule(index, 'column', e.target.value)}
                              placeholder="Column name"
                              className="mt-1"
                            />
                          )}
                        </div>
                        <div>
                          <Label className="text-xs">Condition</Label>
                          <select
                            value={rule.condition}
                            onChange={(e) => handleUpdateRule(index, 'condition', e.target.value)}
                            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
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
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        This rule will remove values where column "{rule.column || '...'}" {rule.condition.replace('_', ' ')} "{rule.value || '...'}"
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        )

      case 'confirm':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Confirm Processing</h3>
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                You are about to process the Excel file with {outlierRules.length} outlier removal rule(s).
              </p>
              <div className="space-y-1">
                {outlierRules.map((rule, idx) => (
                  <div key={idx} className="text-sm text-gray-700">
                    • Column "{rule.column}": {rule.condition.replace('_', ' ')} "{rule.value}"
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-500 mt-4">
                The processed Excel file will be saved to the output folder.
              </p>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Excel Viewer</DialogTitle>
          <DialogDescription>
            Step {getStepNumber(currentStep)} of {getTotalSteps()}: {
              currentStep === 'upload' ? 'Upload Excel File' :
              currentStep === 'view' ? 'View Excel Data' :
              currentStep === 'outlier' ? 'Configure Outlier Removal' :
              'Confirm Processing'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {renderStep()}

          <div className="flex justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === (hasInputSource ? 'view' : 'upload')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            
            <div className="flex gap-2">
              {currentStep === 'outlier' && (
                <Button
                  onClick={handleProcess}
                  disabled={processMutation.isPending || outlierRules.length === 0}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {processMutation.isPending ? 'Processing...' : 'Execute Processing'}
                </Button>
              )}
              
              {currentStep === 'confirm' ? (
                <Button
                  onClick={handleFinish}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Finish
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  disabled={
                    (currentStep === 'upload' && !uploadedFileKey && !hasInputSource) ||
                    (currentStep === 'view' && !excelData)
                  }
                >
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}


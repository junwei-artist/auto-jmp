'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { FileSpreadsheet, Upload, ArrowRight, ArrowLeft, Check, X, Play, Plus, Download } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'

type WizardStep = 'upload' | 'view' | 'columns' | 'rules' | 'confirm'

interface OutlierRemoverWizardProps {
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

export default function OutlierRemoverWizard({
  node,
  workspaceId,
  workflowId,
  hasInputSource,
  open,
  onOpenChange,
  onConfigUpdate,
  onProcess
}: OutlierRemoverWizardProps) {
  const queryClient = useQueryClient()
  const [currentStep, setCurrentStep] = useState<WizardStep>(hasInputSource ? 'view' : 'upload')
  const [uploadedFileKey, setUploadedFileKey] = useState<string | null>(node.config?.file_key || null)
  const [filename, setFilename] = useState<string>(node.config?.filename || '')
  const [selectedColumns, setSelectedColumns] = useState<Record<string, string[]>>(node.config?.selected_columns || {})
  const [outlierRules, setOutlierRules] = useState<Array<{
    sheet?: string
    column?: string  // Optional: if not specified, applies to all selected columns
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
    queryKey: ['excel-data', workflowId, node.id, 'original'],
    queryFn: async () => {
      return apiClient.get<ExcelDataResponse>(`/v1/workflows/${workflowId}/nodes/${node.id}/excel-data?version=original`)
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
      toast.success(`Excel processed successfully: ${data.total_removals} removals across ${data.sheets_processed.length} sheet(s)`)
      queryClient.invalidateQueries({ queryKey: ['excel-data', workflowId, node.id] })
      queryClient.invalidateQueries({ queryKey: ['node-files', workflowId, node.id] })
      if (onConfigUpdate) {
        onConfigUpdate({
          ...node.config,
          outlier_rules: outlierRules,
          selected_columns: selectedColumns
        })
      }
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

  const handleSelectAllColumns = (sheetName: string) => {
    if (!excelData) return
    const sheet = excelData.sheets.find(s => s.name === sheetName)
    if (sheet) {
      setSelectedColumns({
        ...selectedColumns,
        [sheetName]: [...sheet.columns]
      })
    }
  }

  const handleDeselectAllColumns = (sheetName: string) => {
    setSelectedColumns({
      ...selectedColumns,
      [sheetName]: []
    })
  }

  const handleToggleColumn = (sheetName: string, columnName: string) => {
    const current = selectedColumns[sheetName] || []
    const isSelected = current.includes(columnName)
    setSelectedColumns({
      ...selectedColumns,
      [sheetName]: isSelected
        ? current.filter(c => c !== columnName)
        : [...current, columnName]
    })
  }

  const handleAddRule = () => {
    // Allow adding rules without a specific column (will apply to all selected columns)
    setOutlierRules([...outlierRules, { 
      sheet: selectedSheet || undefined,
      column: selectedColumn || undefined,  // Optional: if not specified, applies to all selected columns
      condition: 'greater_than', 
      value: '' 
    }])
    setSelectedColumn('')
  }

  const handleRemoveRule = (index: number) => {
    setOutlierRules(outlierRules.filter((_, i) => i !== index))
  }

  const handleUpdateRule = (index: number, field: string, value: string | undefined) => {
    const updated = [...outlierRules]
    updated[index] = { ...updated[index], [field]: value }
    setOutlierRules(updated)
  }

  const handleProcess = () => {
    if (outlierRules.length === 0) {
      toast.error('Please add at least one outlier removal rule')
      return
    }
    processMutation.mutate({ rules: outlierRules, columns: selectedColumns })
  }

  const handleDownload = async () => {
    try {
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
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename || 'processed_excel.xlsx'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('File downloaded successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to download file')
    }
  }

  const handleNext = () => {
    if (currentStep === 'upload') {
      if (uploadedFileKey || hasInputSource) {
        setCurrentStep('view')
      }
    } else if (currentStep === 'view') {
      setCurrentStep('columns')
    } else if (currentStep === 'columns') {
      setCurrentStep('rules')
    } else if (currentStep === 'rules') {
      setCurrentStep('confirm')
    }
  }

  const handleBack = () => {
    if (currentStep === 'confirm') {
      setCurrentStep('rules')
    } else if (currentStep === 'rules') {
      setCurrentStep('columns')
    } else if (currentStep === 'columns') {
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
        outlier_rules: outlierRules,
        selected_columns: selectedColumns
      })
    }
    toast.success('Configuration saved')
    onOpenChange(false)
  }

  const getStepNumber = (step: WizardStep) => {
    const steps: WizardStep[] = hasInputSource 
      ? ['view', 'columns', 'rules', 'confirm'] 
      : ['upload', 'view', 'columns', 'rules', 'confirm']
    return steps.indexOf(step) + 1
  }

  const getTotalSteps = () => {
    return hasInputSource ? 4 : 5
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
            </div>

            {loadingData && (
              <div className="text-center py-8 text-gray-500">Loading Excel data...</div>
            )}

            {excelData && (
              <div className="space-y-4">
                <div className="text-sm text-gray-600">
                  File: {excelData.filename} ({excelData.sheets.length} sheet(s))
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  {/* Left Panel - Sheet List */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Sheets</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {excelData.sheets.map((sheet, idx) => (
                          <Button
                            key={idx}
                            variant={selectedSheet === sheet.name ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedSheet(sheet.name)}
                            className="w-full justify-start"
                          >
                            {sheet.name}
                            <span className="ml-auto text-xs text-gray-500">
                              {sheet.total_rows} rows
                            </span>
                          </Button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Right Panel - Table Viewer */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {selectedSheet || 'Select a sheet'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedSheet && excelData.sheets.find(s => s.name === selectedSheet) && (
                        <div className="overflow-x-auto max-h-96 overflow-y-auto">
                          {(() => {
                            const sheet = excelData.sheets.find(s => s.name === selectedSheet)!
                            return (
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
                            )
                          })()}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </div>
        )

      case 'columns':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Select Columns to Process</h3>
            
            {excelData && excelData.sheets.length > 0 && (
              <div className="space-y-4">
                {excelData.sheets.map((sheet, sheetIdx) => {
                  const sheetColumns = selectedColumns[sheet.name] || []
                  const allSelected = sheetColumns.length === sheet.columns.length
                  const someSelected = sheetColumns.length > 0 && sheetColumns.length < sheet.columns.length
                  
                  return (
                    <Card key={sheetIdx}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{sheet.name}</CardTitle>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSelectAllColumns(sheet.name)}
                              disabled={allSelected}
                            >
                              Select All
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeselectAllColumns(sheet.name)}
                              disabled={sheetColumns.length === 0}
                            >
                              Deselect All
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                          {sheet.columns.map((col, colIdx) => {
                            const isSelected = sheetColumns.includes(col)
                            return (
                              <div key={colIdx} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`${sheet.name}-${col}`}
                                  checked={isSelected}
                                  onCheckedChange={() => handleToggleColumn(sheet.name, col)}
                                />
                                <Label
                                  htmlFor={`${sheet.name}-${col}`}
                                  className="text-sm cursor-pointer"
                                >
                                  {col}
                                </Label>
                              </div>
                            )
                          })}
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                          {sheetColumns.length} of {sheet.columns.length} columns selected
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )

      case 'rules':
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
                          <option value="">All Sheets</option>
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
                        >
                          <option value="">Select Column</option>
                          {excelData.sheets.flatMap(sheet => 
                            (!selectedSheet || sheet.name === selectedSheet) 
                              ? (selectedColumns[sheet.name] || []).map((col, idx) => (
                                  <option key={`${sheet.name}-${idx}`} value={col}>
                                    {col} {selectedSheet ? '' : `(${sheet.name})`}
                                  </option>
                                ))
                              : []
                          )}
                        </select>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAddRule}
                      className="w-full"
                    >
                      {selectedColumn ? `Add Rule for Column "${selectedColumn}"` : 'Add Rule for All Selected Columns'}
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
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <Label className="text-xs">Sheet (optional)</Label>
                          {excelData && excelData.sheets.length > 0 ? (
                            <select
                              value={rule.sheet || ''}
                              onChange={(e) => handleUpdateRule(index, 'sheet', e.target.value)}
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                            >
                              <option value="">All Sheets</option>
                              {excelData.sheets.map((sheet, idx) => (
                                <option key={idx} value={sheet.name}>{sheet.name}</option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              value={rule.sheet || ''}
                              onChange={(e) => handleUpdateRule(index, 'sheet', e.target.value)}
                              placeholder="Sheet name (optional)"
                              className="mt-1"
                            />
                          )}
                        </div>
                        <div>
                          <Label className="text-xs">Column Name (optional)</Label>
                          {excelData && excelData.sheets.length > 0 ? (
                            <select
                              value={rule.column || ''}
                              onChange={(e) => handleUpdateRule(index, 'column', e.target.value || undefined)}
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
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
                          ) : (
                            <Input
                              value={rule.column || ''}
                              onChange={(e) => handleUpdateRule(index, 'column', e.target.value || undefined)}
                              placeholder="Leave empty for all columns"
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
                        This rule will remove values where {rule.column ? `column "${rule.column}"` : 'all selected columns'} {rule.condition.replace('_', ' ')} "{rule.value || '...'}"
                        {rule.sheet && ` in sheet "${rule.sheet}"`}
                        {!rule.sheet && ' across all sheets'}
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
                    • {rule.column ? `Column "${rule.column}"` : 'All Selected Columns'}: {rule.condition.replace('_', ' ')} "{rule.value}"
                    {rule.sheet && ` (Sheet: ${rule.sheet})`}
                    {!rule.sheet && ' (All Sheets)'}
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-500 mt-4">
                The processed Excel file will be saved to the output folder with a summary sheet.
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
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Outlier Remover</DialogTitle>
          <DialogDescription>
            Step {getStepNumber(currentStep)} of {getTotalSteps()}: {
              currentStep === 'upload' ? 'Upload Excel File' :
              currentStep === 'view' ? 'View Excel Data' :
              currentStep === 'columns' ? 'Select Columns' :
              currentStep === 'rules' ? 'Configure Outlier Removal Rules' :
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
              {currentStep === 'rules' && (
                <Button
                  onClick={handleProcess}
                  disabled={processMutation.isPending || outlierRules.length === 0}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {processMutation.isPending ? 'Processing...' : 'Execute Processing'}
                </Button>
              )}
              
              {processMutation.isSuccess && (
                <Button
                  onClick={handleDownload}
                  variant="outline"
                  className="border-green-500 text-green-600 hover:bg-green-50"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Processed Excel
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
                    (currentStep === 'view' && !excelData) ||
                    (currentStep === 'columns' && Object.keys(selectedColumns).length === 0)
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


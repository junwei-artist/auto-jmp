'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, FileSpreadsheet, Save, X, Hash } from 'lucide-react'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'

import type { NodeContext } from '@/lib/workflow-graph'

interface ExcelToNumericConfigProps {
  node: {
    id: string
    module_type: string
    module_id: string
    config: any
    state: any
  }
  workspaceId?: string  // Optional: workflows can be independent of workspaces
  workflowId: string
  nodeContext?: NodeContext | null
  onSave: (config: any) => void
}

export default function ExcelToNumericConfig({ node, workspaceId, workflowId, nodeContext, onSave }: ExcelToNumericConfigProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<string | null>(node.config?.file_key || null)
  const [sheetName, setSheetName] = useState<string>(node.config?.sheet_name || '')
  const [availableSheets, setAvailableSheets] = useState<string[]>(node.config?.available_sheets || [])
  const [columnsToConvert, setColumnsToConvert] = useState<string>(() => {
    const configValue = node.config?.columns_to_convert
    if (Array.isArray(configValue)) {
      return configValue.join(', ')
    }
    return configValue || ''
  })
  const [convertAll, setConvertAll] = useState<boolean>(() => {
    const configValue = node.config?.columns_to_convert
    return configValue === 'all' || (Array.isArray(configValue) && configValue.length === 0) || !configValue
  })

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error('Please upload a valid Excel file (.xlsx or .xls)')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('workflow_id', workflowId)
      formData.append('node_id', node.id)
      
      // Use direct workflow endpoint if no workspaceId, otherwise use workspace endpoint
      const uploadUrl = workspaceId 
        ? `/v1/workspaces/${workspaceId}/workflows/${workflowId}/nodes/${node.id}/upload`
        : `/v1/workflows/${workflowId}/nodes/${node.id}/upload`
      
      if (workspaceId) {
        formData.append('workspace_id', workspaceId)
      }

      const response = await apiClient.post<{
        storage_key: string
        filename: string
        available_sheets: string[]
      }>(uploadUrl, formData)

      setUploadedFile(response.storage_key)
      setAvailableSheets(response.available_sheets || [])
      
      // Auto-select first sheet if available
      if (response.available_sheets && response.available_sheets.length > 0 && !sheetName) {
        setSheetName(response.available_sheets[0])
      }

      toast.success('File uploaded successfully')
      
      // Auto-save config
      onSave({
        file_key: response.storage_key,
        filename: response.filename,
        available_sheets: response.available_sheets,
        sheet_name: sheetName || response.available_sheets?.[0] || '',
        columns_to_convert: convertAll ? 'all' : columnsToConvert
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload file')
    } finally {
      setUploading(false)
    }
  }, [workspaceId, workflowId, node.id, sheetName, onSave, convertAll, columnsToConvert])

  const handleSave = () => {
    onSave({
      file_key: uploadedFile,
      sheet_name: sheetName,
      available_sheets: availableSheets,
      columns_to_convert: convertAll ? 'all' : (columnsToConvert.trim() || 'all')
    })
    toast.success('Configuration saved')
  }

  const handleRemoveFile = () => {
    setUploadedFile(null)
    setSheetName('')
    setAvailableSheets([])
    setColumnsToConvert('')
    setConvertAll(true)
    onSave({
      file_key: null,
      sheet_name: '',
      available_sheets: [],
      columns_to_convert: 'all'
    })
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-pink-50">
        <div className="flex items-center space-x-3 mb-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 text-white shadow-lg">
            <Hash className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Excel to Numeric</h2>
            <p className="text-sm text-slate-600">Upload an Excel file and convert column variables to numbers</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-6">
          {/* File Upload Section */}
          <Card>
            <CardHeader>
              <CardTitle>Upload Excel File</CardTitle>
              <CardDescription>
                Upload an Excel file to convert columns to numeric
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!uploadedFile ? (
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-purple-400 transition-colors">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="hidden"
                    id="excel-upload"
                  />
                  <label htmlFor="excel-upload" className="cursor-pointer">
                    <Upload className="h-12 w-12 mx-auto mb-4 text-slate-400" />
                    <p className="text-slate-700 font-medium mb-2">
                      {uploading ? 'Uploading...' : 'Click to upload Excel file'}
                    </p>
                    <p className="text-sm text-slate-500">
                      Supports .xlsx and .xls files
                    </p>
                  </label>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 rounded bg-purple-100 text-purple-600">
                        <FileSpreadsheet className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">
                          {node.config?.filename || 'Excel file uploaded'}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Storage key: {uploadedFile.substring(0, 50)}...
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveFile}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sheet Selection */}
          {uploadedFile && availableSheets.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Select Sheet</CardTitle>
                <CardDescription>
                  Choose which sheet to load from the Excel file
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {availableSheets.map((sheet) => (
                    <button
                      key={sheet}
                      onClick={() => setSheetName(sheet)}
                      className={`w-full text-left p-3 rounded-lg border transition-all duration-200 ${
                        sheetName === sheet
                          ? 'border-purple-500 bg-purple-50 text-purple-900'
                          : 'border-slate-200 hover:border-purple-300 hover:bg-purple-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{sheet}</span>
                        {sheetName === sheet && (
                          <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Column Selection */}
          {uploadedFile && (
            <Card>
              <CardHeader>
                <CardTitle>Columns to Convert</CardTitle>
                <CardDescription>
                  Select which columns to convert to numeric values
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
                  <Label htmlFor="convert-all" className="text-sm font-medium text-slate-700 cursor-pointer">
                    Convert all columns to numeric
                  </Label>
                </div>
                
                {!convertAll && (
                  <div className="space-y-2">
                    <Label htmlFor="columns-input" className="text-sm font-medium text-slate-700">
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
                    <p className="text-xs text-slate-500">
                      Enter column names separated by commas, or leave empty to convert all columns
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={!uploadedFile || !sheetName}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Configuration
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}


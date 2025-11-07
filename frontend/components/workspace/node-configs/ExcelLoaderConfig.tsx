'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Upload, FileSpreadsheet, Save, X } from 'lucide-react'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'

import type { NodeContext } from '@/lib/workflow-graph'

interface ExcelLoaderConfigProps {
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

export default function ExcelLoaderConfig({ node, workspaceId, workflowId, nodeContext, onSave }: ExcelLoaderConfigProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<string | null>(node.config?.file_key || null)
  const [sheetName, setSheetName] = useState<string>(node.config?.sheet_name || '')
  const [availableSheets, setAvailableSheets] = useState<string[]>(node.config?.available_sheets || [])

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
        sheet_name: sheetName || response.available_sheets?.[0] || ''
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload file')
    } finally {
      setUploading(false)
    }
  }, [workspaceId, workflowId, node.id, sheetName, onSave])

  const handleSave = () => {
    onSave({
      file_key: uploadedFile,
      sheet_name: sheetName,
      available_sheets: availableSheets
    })
    toast.success('Configuration saved')
  }

  const handleRemoveFile = () => {
    setUploadedFile(null)
    setSheetName('')
    setAvailableSheets([])
    onSave({
      file_key: null,
      sheet_name: '',
      available_sheets: []
    })
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center space-x-3 mb-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Excel Loader</h2>
            <p className="text-sm text-slate-600">Upload an Excel file and select a sheet to load</p>
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
                Upload an Excel file to use in this workflow step
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!uploadedFile ? (
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-indigo-400 transition-colors">
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
                      <div className="p-2 rounded bg-blue-100 text-blue-600">
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
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                          : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{sheet}</span>
                        {sheetName === sheet && (
                          <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={!uploadedFile || !sheetName}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
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


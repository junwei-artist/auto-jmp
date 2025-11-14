'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, File, Save } from 'lucide-react'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'

import type { NodeContext } from '@/lib/workflow-graph'

interface FileUploaderConfigProps {
  node: {
    id: string
    module_type: string
    module_id: string
    config: any
    state: any
  }
  workspaceId?: string
  workflowId: string
  nodeContext?: NodeContext | null
  onSave: (config: any) => void
}

export default function FileUploaderConfig({ node, workspaceId, workflowId, nodeContext, onSave }: FileUploaderConfigProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<string | null>(node.config?.file_key || null)
  const [filename, setFilename] = useState<string>(node.config?.filename || '')
  const [allowedTypes, setAllowedTypes] = useState<string[]>(node.config?.allowed_types || [])
  const [allowedTypesInput, setAllowedTypesInput] = useState<string>(() => {
    const types = node.config?.allowed_types || []
    return Array.isArray(types) ? types.join(', ') : ''
  })
  const [maxSize, setMaxSize] = useState<number>(node.config?.max_size || 52428800) // Default 50MB

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file size
    if (maxSize && file.size > maxSize) {
      toast.error(`File size (${file.size} bytes) exceeds maximum allowed size (${maxSize} bytes)`)
      return
    }

    // Validate file type if specified
    if (allowedTypes.length > 0) {
      const fileExtension = file.name.split('.').pop()?.toLowerCase()
      if (!fileExtension || !allowedTypes.some(type => type.toLowerCase().replace('.', '') === fileExtension)) {
        toast.error(`File type '${fileExtension}' is not allowed. Allowed types: ${allowedTypes.join(', ')}`)
        return
      }
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      
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
      }>(uploadUrl, formData)

      setUploadedFile(response.storage_key)
      setFilename(response.filename)

      toast.success('File uploaded successfully')
      
      // Auto-save config
      onSave({
        file_key: response.storage_key,
        filename: response.filename,
        allowed_types: allowedTypes,
        max_size: maxSize
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload file')
    } finally {
      setUploading(false)
    }
  }, [workspaceId, workflowId, node.id, allowedTypes, maxSize, onSave])

  const handleSave = useCallback(() => {
    // Parse allowed types from input
    const types = allowedTypesInput
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0)
      .map(t => t.replace(/^\./, '')) // Remove leading dot if present

    onSave({
      file_key: uploadedFile,
      filename: filename,
      allowed_types: types,
      max_size: maxSize
    })
    toast.success('Configuration saved')
  }, [uploadedFile, filename, allowedTypesInput, maxSize, onSave])

  return (
    <Card>
      <CardHeader>
        <CardTitle>File Uploader Configuration</CardTitle>
        <CardDescription>
          Upload a file and configure file type and size restrictions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File Upload */}
        <div className="space-y-2">
          <Label>File Upload</Label>
          <div className="flex items-center gap-2">
            <Input
              type="file"
              onChange={handleFileUpload}
              disabled={uploading}
              className="flex-1"
              accept={allowedTypes.length > 0 ? allowedTypes.map(t => `.${t.replace(/^\./, '')}`).join(',') : undefined}
            />
            {uploading && <span className="text-sm text-muted-foreground">Uploading...</span>}
          </div>
          {uploadedFile && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <File className="h-4 w-4" />
              <span>{filename || 'File uploaded'}</span>
            </div>
          )}
        </div>

        {/* Allowed File Types */}
        <div className="space-y-2">
          <Label htmlFor="allowed-types">Allowed File Types (comma-separated, e.g., pdf, docx, xlsx)</Label>
          <Input
            id="allowed-types"
            value={allowedTypesInput}
            onChange={(e) => setAllowedTypesInput(e.target.value)}
            placeholder="Leave empty to allow all types"
          />
          <p className="text-xs text-muted-foreground">
            Enter file extensions without dots (e.g., pdf, docx, xlsx). Leave empty to allow all file types.
          </p>
        </div>

        {/* Max File Size */}
        <div className="space-y-2">
          <Label htmlFor="max-size">Maximum File Size (bytes)</Label>
          <Input
            id="max-size"
            type="number"
            value={maxSize}
            onChange={(e) => setMaxSize(parseInt(e.target.value) || 52428800)}
            placeholder="52428800"
          />
          <p className="text-xs text-muted-foreground">
            Default: 52428800 bytes (50MB). Enter 0 for no limit.
          </p>
        </div>

        {/* Save Button */}
        <Button onClick={handleSave} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          Save Configuration
        </Button>
      </CardContent>
    </Card>
  )
}


'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Upload, File, Check, ChevronRight, ChevronLeft, Settings, Play } from 'lucide-react'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'

interface FileUploaderWizardProps {
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

type WizardStep = 'upload' | 'config' | 'confirm'

export default function FileUploaderWizard({ 
  node, 
  workspaceId, 
  workflowId, 
  hasInputSource,
  open,
  onOpenChange,
  onConfigUpdate,
  onProcess
}: FileUploaderWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('upload')
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [uploadedFileKey, setUploadedFileKey] = useState<string | null>(node.config?.file_key || null)
  const [filename, setFilename] = useState<string>(node.config?.filename || '')
  const [allowedTypesInput, setAllowedTypesInput] = useState<string>(() => {
    const types = node.config?.allowed_types || []
    return Array.isArray(types) ? types.join(', ') : ''
  })
  const [maxSize, setMaxSize] = useState<number>(node.config?.max_size || 52428800) // Default 50MB

  // Initialize from config
  useEffect(() => {
    if (!open) return // Reset when dialog closes
    
    if (node.config?.file_key) {
      setUploadedFileKey(node.config.file_key)
      setFilename(node.config.filename || '')
      const types = node.config.allowed_types || []
      setAllowedTypesInput(Array.isArray(types) ? types.join(', ') : '')
      setMaxSize(node.config.max_size || 52428800)
      
      // If file exists, start from config step
      setCurrentStep('config')
    } else {
      setCurrentStep('upload')
    }
  }, [node.config, open])

  const handleFileUpload = useCallback(async (uploadedFile: File) => {
    if (!uploadedFile) return

    // Validate file size
    if (maxSize && uploadedFile.size > maxSize) {
      toast.error(`File size (${uploadedFile.size} bytes) exceeds maximum allowed size (${maxSize} bytes)`)
      return
    }

    // Validate file type if specified
    const allowedTypes = allowedTypesInput
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0)
      .map(t => t.replace(/^\./, '').toLowerCase())

    if (allowedTypes.length > 0) {
      const fileExtension = uploadedFile.name.split('.').pop()?.toLowerCase()
      if (!fileExtension || !allowedTypes.includes(fileExtension)) {
        toast.error(`File type '${fileExtension}' is not allowed. Allowed types: ${allowedTypes.join(', ')}`)
        return
      }
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
      }>(uploadUrl, formData)

      setUploadedFileKey(response.storage_key)
      setFilename(response.filename)

      toast.success('File uploaded successfully')
      
      // Move to config step
      setCurrentStep('config')
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload file')
    } finally {
      setUploading(false)
    }
  }, [workspaceId, workflowId, node.id, maxSize, allowedTypesInput])

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
        setCurrentStep('config')
      }
    } else if (currentStep === 'config') {
      setCurrentStep('confirm')
    }
  }

  const handleBack = () => {
    if (currentStep === 'confirm') {
      setCurrentStep('config')
    } else if (currentStep === 'config' && !hasInputSource) {
      setCurrentStep('upload')
    }
  }

  const handleFinish = () => {
    // Parse allowed types from input
    const allowedTypes = allowedTypesInput
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0)
      .map(t => t.replace(/^\./, ''))

    const config = {
      file_key: uploadedFileKey,
      filename: filename,
      allowed_types: allowedTypes,
      max_size: maxSize
    }

    if (onConfigUpdate) {
      onConfigUpdate(config)
    }

    toast.success('Configuration saved')
    onOpenChange(false)
  }

  const renderStep = () => {
    switch (currentStep) {
      case 'upload':
        return (
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-300 rounded-lg">
              <Upload className="h-12 w-12 text-gray-400 mb-4" />
              <Label htmlFor="file-upload" className="cursor-pointer">
                <span className="text-blue-600 hover:text-blue-700">Click to upload</span> or drag and drop
              </Label>
              <Input
                id="file-upload"
                type="file"
                onChange={handleFileSelect}
                disabled={uploading}
                className="hidden"
              />
              {uploading && <p className="text-sm text-muted-foreground mt-2">Uploading...</p>}
            </div>
            {uploadedFileKey && (
              <div className="flex items-center gap-2 p-2 bg-green-50 rounded">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-700">File uploaded: {filename}</span>
              </div>
            )}
          </div>
        )
      
      case 'config':
        return (
          <div className="space-y-4">
            {uploadedFileKey && (
              <div className="flex items-center gap-2 p-2 bg-blue-50 rounded">
                <File className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-blue-700">File: {filename}</span>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="allowed-types">Allowed File Types (comma-separated)</Label>
              <Input
                id="allowed-types"
                value={allowedTypesInput}
                onChange={(e) => setAllowedTypesInput(e.target.value)}
                placeholder="Leave empty to allow all types (e.g., pdf, docx, xlsx)"
              />
              <p className="text-xs text-muted-foreground">
                Enter file extensions without dots. Leave empty to allow all file types.
              </p>
            </div>

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
          </div>
        )
      
      case 'confirm':
        const allowedTypes = allowedTypesInput
          .split(',')
          .map(t => t.trim())
          .filter(t => t.length > 0)
        
        return (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <File className="h-5 w-5 text-gray-600" />
                <span className="font-medium">File: {filename}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>Allowed Types: {allowedTypes.length > 0 ? allowedTypes.join(', ') : 'All types'}</p>
                <p>Max Size: {maxSize ? `${(maxSize / 1024 / 1024).toFixed(2)} MB` : 'No limit'}</p>
              </div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700">
                The file will be uploaded to the input folder and copied to the output folder when the node is executed.
              </p>
            </div>
          </div>
        )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>File Uploader Configuration</DialogTitle>
          <DialogDescription>
            Upload a file and configure file type and size restrictions
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-2">
            <div className={`flex items-center gap-2 ${currentStep === 'upload' ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'upload' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                1
              </div>
              <span className="text-sm font-medium">Upload</span>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-400" />
            <div className={`flex items-center gap-2 ${currentStep === 'config' ? 'text-blue-600' : currentStep === 'confirm' ? 'text-gray-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'config' ? 'bg-blue-600 text-white' : currentStep === 'confirm' ? 'bg-gray-400 text-white' : 'bg-gray-200'}`}>
                2
              </div>
              <span className="text-sm font-medium">Config</span>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-400" />
            <div className={`flex items-center gap-2 ${currentStep === 'confirm' ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'confirm' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                3
              </div>
              <span className="text-sm font-medium">Confirm</span>
            </div>
          </div>

          {/* Step Content */}
          <Card>
            <CardContent className="pt-6">
              {renderStep()}
            </CardContent>
          </Card>

          {/* Navigation Buttons */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 'upload'}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            {currentStep === 'confirm' ? (
              <Button onClick={handleFinish}>
                <Check className="h-4 w-4 mr-2" />
                Finish
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                disabled={currentStep === 'upload' && !uploadedFileKey && !hasInputSource}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}


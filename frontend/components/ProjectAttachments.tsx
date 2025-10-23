'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert-simple'
import { Loader2, Upload, Download, Trash2, FileText, Paperclip, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/lib/language'

interface ProjectAttachment {
  id: string
  filename: string
  description: string
  file_size: number
  mime_type?: string
  uploaded_by: string
  uploader_email: string
  uploader_display_name?: string
  created_at: string
  download_url: string
}

interface ProjectAttachmentsProps {
  projectId: string
  currentUserRole: 'owner' | 'member' | 'watcher'
  currentUserId: string
}

export function ProjectAttachments({ projectId, currentUserRole, currentUserId }: ProjectAttachmentsProps) {
  const { t } = useLanguage()
  const [attachments, setAttachments] = useState<ProjectAttachment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Helper function to get auth token
  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('access_token')
    }
    return null
  }

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return `0 ${t('attachments.fileSizeUnits')[0]}`
    const k = 1024
    const sizes = t('attachments.fileSizeUnits')
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Fetch attachments
  const fetchAttachments = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/v1/projects/${projectId}/attachments`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error(t('attachments.fetchFailed'))
      }

      const data = await response.json()
      setAttachments(data)
    } catch (error: any) {
      console.error('Error fetching attachments:', error)
      setError(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  // Upload attachment
  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error(t('attachments.selectFile'))
      return
    }

    if (!description.trim()) {
      toast.error(t('attachments.provideDescription'))
      return
    }

    // Check file size (200MB max)
    const maxSize = 200 * 1024 * 1024 // 200MB
    if (selectedFile.size > maxSize) {
      toast.error(t('attachments.fileSizeExceeded'))
      return
    }

    try {
      setIsUploading(true)
      
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('description', description.trim())

      const response = await fetch(`/api/v1/projects/${projectId}/attachments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || t('attachments.uploadFailed'))
      }

      toast.success(t('attachments.uploadSuccess'))
      setIsUploadDialogOpen(false)
      setSelectedFile(null)
      setDescription('')
      fetchAttachments()
    } catch (error: any) {
      console.error('Error uploading attachment:', error)
      toast.error(error.message || t('attachments.uploadFailed'))
    } finally {
      setIsUploading(false)
    }
  }

  // Delete attachment
  const handleDelete = async (attachmentId: string) => {
    if (!confirm(t('attachments.deleteConfirm'))) {
      return
    }

    try {
      const response = await fetch(`/api/v1/projects/${projectId}/attachments/${attachmentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || t('attachments.deleteFailed'))
      }

      toast.success(t('attachments.deleteSuccess'))
      fetchAttachments()
    } catch (error: any) {
      console.error('Error deleting attachment:', error)
      toast.error(error.message || t('attachments.deleteFailed'))
    }
  }

  // Download attachment
  const handleDownload = (attachment: ProjectAttachment) => {
    const link = document.createElement('a')
    link.href = attachment.download_url.startsWith('/api') 
      ? attachment.download_url
      : attachment.download_url.startsWith('/') 
        ? `/api${attachment.download_url}`
        : attachment.download_url
    link.download = attachment.filename
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      // Set default description to filename if not already set
      if (!description) {
        setDescription(file.name)
      }
    }
  }

  useEffect(() => {
    fetchAttachments()
  }, [projectId])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Paperclip className="h-5 w-5" />
            <span>{t('attachments.title')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">{t('attachments.loading')}</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Paperclip className="h-5 w-5" />
            <CardTitle>{t('attachments.title')}</CardTitle>
          </div>
          <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="flex items-center space-x-2">
                <Upload className="h-4 w-4" />
                <span>{t('attachments.upload')}</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t('attachments.uploadTitle')}</DialogTitle>
                <DialogDescription>
                  {t('attachments.uploadDesc')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="file">{t('attachments.file')}</Label>
                  <Input
                    id="file"
                    type="file"
                    onChange={handleFileSelect}
                    accept="*/*"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="description">{t('attachments.description')}</Label>
                  <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('attachments.descriptionPlaceholder')}
                    className="mt-1"
                  />
                </div>
                {selectedFile && (
                  <div className="text-sm text-gray-600">
                    <p><strong>{t('attachments.fileLabel')}</strong> {selectedFile.name}</p>
                    <p><strong>{t('attachments.sizeLabel')}</strong> {formatFileSize(selectedFile.size)}</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsUploadDialogOpen(false)}
                  disabled={isUploading}
                >
                  {t('attachments.cancel')}
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={isUploading || !selectedFile || !description.trim()}
                >
                  {isUploading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t('attachments.upload')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {attachments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Paperclip className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t('attachments.noAttachments')}</p>
            <p className="text-sm">{t('attachments.noAttachmentsDesc')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {attachments.map((attachment) => {
              const canDelete = currentUserRole === 'owner' || attachment.uploaded_by === currentUserId
              
              return (
                <div
                  key={attachment.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <FileText className="h-5 w-5 text-gray-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{attachment.filename}</p>
                      <p className="text-xs text-gray-500 truncate">{attachment.description}</p>
                      <div className="flex items-center space-x-4 text-xs text-gray-400 mt-1">
                        <span>{formatFileSize(attachment.file_size)}</span>
                        <span>{t('attachments.by')} {attachment.uploader_display_name || attachment.uploader_email}</span>
                        <span>{new Date(attachment.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(attachment)}
                      className="flex items-center space-x-1"
                    >
                      <Download className="h-4 w-4" />
                      <span>{t('attachments.download')}</span>
                    </Button>
                    {canDelete && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(attachment.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

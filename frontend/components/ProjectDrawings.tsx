'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert-simple'
import { Loader2, Upload, Download, Trash2, Folder, Image as ImageIcon, Plus, Edit2, Eye, X, Check, FolderOpen, FileText, Archive } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/lib/language'
import { projectApi } from '@/lib/api'

interface DrawingFolder {
  id: string
  project_id: string
  description?: string
  created_by: string
  creator_email?: string
  creator_display_name?: string
  created_at: string
  updated_at: string
  image_count: number
}

interface DrawingImage {
  id: string
  folder_id: string
  filename: string
  file_size: number
  mime_type?: string
  uploaded_by: string
  uploader_email?: string
  uploader_display_name?: string
  created_at: string
  url: string
}

interface ProjectDrawingsProps {
  projectId: string
  currentUserRole: 'owner' | 'member' | 'watcher'
  currentUserId: string
}

export function ProjectDrawings({ projectId, currentUserRole, currentUserId }: ProjectDrawingsProps) {
  const router = useRouter()
  const { t } = useLanguage()
  const [folders, setFolders] = useState<DrawingFolder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [isCreatingDialogOpen, setIsCreatingDialogOpen] = useState(false)
  const [newFolderDescription, setNewFolderDescription] = useState('')
  const [selectedFolder, setSelectedFolder] = useState<DrawingFolder | null>(null)
  const [folderImages, setFolderImages] = useState<Record<string, DrawingImage[]>>({})
  const [isLoadingImages, setIsLoadingImages] = useState<Record<string, boolean>>({})
  const [isUploadingImage, setIsUploadingImage] = useState<Record<string, boolean>>({})
  const [editingFolder, setEditingFolder] = useState<string | null>(null)
  const [editDescription, setEditDescription] = useState('')
  const [viewingFolder, setViewingFolder] = useState<string | null>(null)
  const [isDownloadingZip, setIsDownloadingZip] = useState<Record<string, boolean>>({})

  // Helper function to get auth token
  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('access_token')
    }
    return null
  }

  // Fetch drawing folders
  const fetchFolders = async () => {
    try {
      setIsLoading(true)
      const data = await projectApi.getDrawingFolders(projectId)
      setFolders(data)
    } catch (error: any) {
      console.error('Failed to fetch drawing folders:', error)
      toast.error(error.message || t('drawings.loadFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch images for a folder
  const fetchFolderImages = async (folderId: string) => {
    try {
      setIsLoadingImages(prev => ({ ...prev, [folderId]: true }))
      const images = await projectApi.getDrawingImages(projectId, folderId)
      setFolderImages(prev => ({ ...prev, [folderId]: images }))
    } catch (error: any) {
      console.error('Failed to fetch folder images:', error)
      toast.error(error.message || t('drawings.loadImagesFailed'))
    } finally {
      setIsLoadingImages(prev => ({ ...prev, [folderId]: false }))
    }
  }

  useEffect(() => {
    if (projectId) {
      fetchFolders()
    }
  }, [projectId])

  // Create new folder
  const handleCreateFolder = async () => {
    if (!newFolderDescription.trim()) {
      toast.error(t('drawings.enterDescription'))
      return
    }

    try {
      setIsCreatingFolder(true)
      await projectApi.createDrawingFolder(projectId, newFolderDescription.trim())
      toast.success(t('drawings.folderCreated'))
      setIsCreatingDialogOpen(false)
      setNewFolderDescription('')
      await fetchFolders()
    } catch (error: any) {
      console.error('Failed to create folder:', error)
      toast.error(error.message || t('drawings.createFailed'))
    } finally {
      setIsCreatingFolder(false)
    }
  }


  // Update folder description
  const handleUpdateFolder = async (folderId: string) => {
    try {
      await projectApi.updateDrawingFolder(projectId, folderId, editDescription.trim())
      toast.success(t('drawings.folderUpdated'))
      setEditingFolder(null)
      setEditDescription('')
      await fetchFolders()
    } catch (error: any) {
      console.error('Failed to update folder:', error)
      toast.error(error.message || t('drawings.folderUpdateFailed'))
    }
  }

  // Delete folder
  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm(t('drawings.deleteConfirm'))) {
      return
    }

    try {
      await projectApi.deleteDrawingFolder(projectId, folderId)
      toast.success(t('drawings.folderDeleted'))
      setFolders(prev => prev.filter(f => f.id !== folderId))
      setFolderImages(prev => {
        const newImages = { ...prev }
        delete newImages[folderId]
        return newImages
      })
    } catch (error: any) {
      console.error('Failed to delete folder:', error)
      toast.error(error.message || t('drawings.folderDeleteFailed'))
    }
  }

  // Upload images to folder (supports multiple files)
  const handleUploadImages = async (folderId: string, files: FileList | File[]) => {
    const fileArray = Array.from(files)
    
    // Validate all files are images
    const invalidFiles = fileArray.filter(file => !file.type.startsWith('image/'))
    if (invalidFiles.length > 0) {
      toast.error(t('drawings.onlyImages'))
      return
    }

    if (fileArray.length === 0) {
      return
    }

    try {
      setIsUploadingImage(prev => ({ ...prev, [folderId]: true }))
      
      // Upload files sequentially to avoid overwhelming the server
      let successCount = 0
      let errorCount = 0
      
      for (const file of fileArray) {
        try {
          await projectApi.uploadDrawingImage(projectId, folderId, file)
          successCount++
        } catch (error: any) {
          console.error(`Failed to upload ${file.name}:`, error)
          errorCount++
        }
      }
      
      if (successCount > 0) {
        toast.success(t('drawings.uploadSuccess', { count: successCount, plural: successCount !== 1 ? 's' : '' }))
      }
      
      if (errorCount > 0) {
        toast.error(t('drawings.uploadError', { count: errorCount, plural: errorCount !== 1 ? 's' : '' }))
      }
      
      // Refresh images and folders
      await fetchFolderImages(folderId)
      await fetchFolders() // Refresh to update image count
    } catch (error: any) {
      console.error('Failed to upload images:', error)
      toast.error(error.message || t('drawings.imageUploadFailed'))
    } finally {
      setIsUploadingImage(prev => ({ ...prev, [folderId]: false }))
    }
  }

  // Delete image
  const handleDeleteImage = async (folderId: string, imageId: string) => {
    if (!confirm(t('drawings.imageDeleteConfirm'))) {
      return
    }

    try {
      await projectApi.deleteDrawingImage(projectId, folderId, imageId)
      toast.success(t('drawings.imageDeleted'))
      await fetchFolderImages(folderId)
      await fetchFolders() // Refresh to update image count
    } catch (error: any) {
      console.error('Failed to delete image:', error)
      toast.error(error.message || t('drawings.imageDeleteFailed'))
    }
  }

  // Start editing folder
  const startEditing = (folder: DrawingFolder) => {
    setEditingFolder(folder.id)
    setEditDescription(folder.description || '')
  }

  // Cancel editing
  const cancelEditing = () => {
    setEditingFolder(null)
    setEditDescription('')
  }

  // View folder
  const handleViewFolder = async (folder: DrawingFolder) => {
    setSelectedFolder(folder)
    setViewingFolder(folder.id)
    if (!folderImages[folder.id]) {
      await fetchFolderImages(folder.id)
    }
  }

  // Download folder as ZIP
  const handleDownloadZip = async (folderId: string) => {
    try {
      setIsDownloadingZip(prev => ({ ...prev, [folderId]: true }))
      await projectApi.downloadDrawingFolderZip(projectId, folderId)
      toast.success(t('drawings.zipDownloaded'))
    } catch (error: any) {
      console.error('Failed to download folder:', error)
      toast.error(error.message || t('drawings.zipDownloadFailed'))
    } finally {
      setIsDownloadingZip(prev => ({ ...prev, [folderId]: false }))
    }
  }

  const getImageUrl = (image: DrawingImage) => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4700'
    return `${backendUrl}${image.url}`
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const canManage = currentUserRole === 'owner'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('drawings.title')}</h2>
          <p className="text-sm text-gray-600 mt-1">
            {t('drawings.subtitle')}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={() => router.push(`/projects/${projectId}/drawing-folders/create-from-pdf`)}
            >
              <FileText className="mr-2 h-4 w-4" />
              {t('drawings.createFromPdf')}
            </Button>
            <Dialog open={isCreatingDialogOpen} onOpenChange={setIsCreatingDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('drawings.newFolder')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('drawings.createFolder')}</DialogTitle>
                  <DialogDescription>
                    {t('drawings.createFolderDesc')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="description">{t('drawings.description')}</Label>
                    <Input
                      id="description"
                      value={newFolderDescription}
                      onChange={(e) => setNewFolderDescription(e.target.value)}
                      placeholder={t('drawings.descriptionPlaceholder')}
                      className="mt-1"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreatingDialogOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button onClick={handleCreateFolder} disabled={isCreatingFolder}>
                    {isCreatingFolder ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('drawings.creating')}
                      </>
                    ) : (
                      t('drawings.createFolderButton')
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">{t('drawings.loading')}</p>
            </div>
          </CardContent>
        </Card>
      ) : folders.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="text-center py-8">
              <Folder className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-600 mb-4">{t('drawings.noFolders')}</p>
              {canManage && (
                <Button onClick={() => setIsCreatingDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('drawings.createFirstFolder')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {folders.map((folder) => (
            <Card key={folder.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <Folder className="h-5 w-5 mt-1 text-blue-600" />
                    <div className="flex-1">
                      {editingFolder === folder.id ? (
                        <div className="space-y-2">
                          <Input
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder={t('drawings.descriptionPlaceholder')}
                          />
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              onClick={() => handleUpdateFolder(folder.id)}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEditing}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <CardTitle className="text-lg">
                            {folder.description || `${t('drawings.folderDefaultName')} ${folder.id.slice(0, 8)}`}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            {t('drawings.createdBy')} {folder.creator_display_name || folder.creator_email || t('projects.unknown')} • 
                            {folder.image_count} {folder.image_count !== 1 ? t('drawings.images') : t('drawings.image')} • 
                            {new Date(folder.created_at).toLocaleDateString()}
                          </CardDescription>
                        </>
                      )}
                    </div>
                  </div>
                  {editingFolder !== folder.id && (
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewFolder(folder)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        {t('drawings.view')}
                      </Button>
                      {folder.image_count > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadZip(folder.id)}
                          disabled={isDownloadingZip[folder.id]}
                          className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                        >
                          {isDownloadingZip[folder.id] ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              {t('drawings.downloading')}
                            </>
                          ) : (
                            <>
                              <Archive className="h-4 w-4 mr-2" />
                              {t('drawings.downloadZip')}
                            </>
                          )}
                        </Button>
                      )}
                      {canManage && folder.image_count > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/projects/${projectId}/drawing-folders/${folder.id}/annotate`)}
                          className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          {t('drawings.editAnnotations')}
                        </Button>
                      )}
                      {canManage && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startEditing(folder)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteFolder(folder.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              {viewingFolder === folder.id && (
                <CardContent className="space-y-4">
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">{t('drawings.imagesInFolder')}</h3>
                      {canManage && (
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const files = e.target.files
                              if (files && files.length > 0) {
                                handleUploadImages(folder.id, files)
                                // Reset input to allow selecting same files again
                                e.target.value = ''
                              }
                            }}
                            multiple
                          />
                          <Button variant="outline" size="sm" asChild>
                            <span>
                              <Upload className="h-4 w-4 mr-2" />
                              {t('drawings.uploadImages')}
                            </span>
                          </Button>
                        </label>
                      )}
                    </div>
                    
                    {isLoadingImages[folder.id] ? (
                      <div className="text-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        <p className="text-gray-600">{t('drawings.loadingImages')}</p>
                      </div>
                    ) : !folderImages[folder.id] || folderImages[folder.id].length === 0 ? (
                      <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                        <ImageIcon className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                        <p className="text-gray-600 mb-4">{t('drawings.noImages')}</p>
                        {canManage && (
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const files = e.target.files
                                if (files && files.length > 0) {
                                  handleUploadImages(folder.id, files)
                                  // Reset input to allow selecting same files again
                                  e.target.value = ''
                                }
                              }}
                              multiple
                            />
                            <Button variant="outline" asChild>
                              <span>
                                <Upload className="h-4 w-4 mr-2" />
                                {t('drawings.uploadImages')}
                              </span>
                            </Button>
                          </label>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {folderImages[folder.id].map((image) => (
                          <div key={image.id} className="relative group">
                            <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 border">
                              <img
                                src={getImageUrl(image)}
                                alt={image.filename}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <div className="flex space-x-2">
                                <a
                                  href={getImageUrl(image)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 bg-white rounded hover:bg-gray-100"
                                >
                                  <Eye className="h-4 w-4" />
                                </a>
                                {canManage && (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleDeleteImage(folder.id, image.id)}
                                    className="p-2"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            <p className="mt-2 text-xs text-gray-600 truncate">{image.filename}</p>
                            <p className="text-xs text-gray-500">{formatFileSize(image.file_size)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {isUploadingImage[folder.id] && (
                      <div className="text-center py-4 border-t mt-4">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        <p className="text-gray-600">{t('drawings.uploading')}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

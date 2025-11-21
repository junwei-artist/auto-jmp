'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2, Folder, FileSpreadsheet, Clock, Play, Trash2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/language'
import { LanguageSelector } from '@/components/LanguageSelector'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'

interface DrawingFolder {
  id: string
  description?: string
  image_count: number
}

interface PowerPointOutput {
  output_id: string
  run_id: string
  workspace_id: string
  filename: string
  created_at: string
  slide_count: number
}

export default function PowerPointWizardPage() {
  const params = useParams()
  const router = useRouter()
  const { user, ready } = useAuth()
  const { t } = useLanguage()
  const projectId = params?.id as string
  const runId = params?.runId as string

  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingOutputs, setIsLoadingOutputs] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  
  // Drawing folders
  const [drawingFolders, setDrawingFolders] = useState<DrawingFolder[]>([])
  const [selectedDrawingFolders, setSelectedDrawingFolders] = useState<string[]>([])
  
  // Existing outputs
  const [existingOutputs, setExistingOutputs] = useState<PowerPointOutput[]>([])
  const [showOutputs, setShowOutputs] = useState(false)
  
  // Project info for owner check
  const [project, setProject] = useState<{ owner_id?: string } | null>(null)

  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('access_token')
    }
    return null
  }

  useEffect(() => {
    if (runId && ready) {
      fetchDrawingFolders()
      fetchExistingOutputs()
      fetchProjectInfo()
    }
  }, [runId, ready])

  const fetchProjectInfo = async () => {
    try {
      const token = getAuthToken()
      const response = await fetch(`/api/v1/projects/${projectId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      if (response.ok) {
        const projectData = await response.json()
        setProject(projectData)
      }
    } catch (error: any) {
      console.error('Error fetching project info:', error)
    }
  }

  const fetchExistingOutputs = async () => {
    try {
      setIsLoadingOutputs(true)
      const token = getAuthToken()
      const response = await fetch(`/api/v1/powerpoint/runs/${runId}/outputs`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      if (response.ok) {
        const outputs = await response.json()
        setExistingOutputs(outputs || [])
      }
    } catch (error: any) {
      console.error('Error fetching outputs:', error)
    } finally {
      setIsLoadingOutputs(false)
    }
  }

  const handleOpenOutput = (outputId: string) => {
    router.push(`/projects/${projectId}/runs/${runId}/powerpoint-wizard/editor?output_id=${outputId}`)
  }

  const handleDeleteOutput = async (outputId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    
    if (!confirm(t('powerpoint.messages.deleteConfirm'))) {
      return
    }
    
    try {
      setIsDeleting(outputId)
      const token = getAuthToken()
      const response = await fetch(`/api/v1/powerpoint/outputs/${outputId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to delete presentation' }))
        throw new Error(errorData.detail || 'Failed to delete presentation')
      }
      
      toast.success(t('powerpoint.messages.presentationDeleted'))
      // Remove from list
      setExistingOutputs(existingOutputs.filter(o => o.output_id !== outputId))
    } catch (error: any) {
      console.error('Error deleting output:', error)
      toast.error(error.message || 'Failed to delete presentation')
    } finally {
      setIsDeleting(null)
    }
  }

  const isOwner = project && user && project.owner_id === user.id

  const prepareWorkspace = async () => {
    try {
      setIsLoading(true)
      const token = getAuthToken()
      const response = await fetch(`/api/v1/powerpoint/runs/${runId}/prepare-workspace`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          drawing_folder_ids: selectedDrawingFolders
        }),
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to prepare workspace' }))
        throw new Error(errorData.detail || 'Failed to prepare workspace')
      }
      
      const data = await response.json()
      toast.success(t('powerpoint.messages.workspacePrepared'))
      // Navigate to editor page with workspace ID
      router.push(`/projects/${projectId}/runs/${runId}/powerpoint-wizard/editor?workspace_id=${data.workspace_id}`)
    } catch (error: any) {
      console.error('Error preparing workspace:', error)
      toast.error(error.message || 'Failed to prepare workspace')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchDrawingFolders = async () => {
    try {
      const token = getAuthToken()
      const response = await fetch(`/api/v1/projects/${projectId}/drawing-folders`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      if (response.ok) {
        const folders = await response.json()
        setDrawingFolders(folders || [])
      }
    } catch (error: any) {
      console.error('Error fetching drawing folders:', error)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            onClick={() => router.back()}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('powerpoint.wizard.back')}
          </Button>
          <LanguageSelector />
        </div>
        <h1 className="text-3xl font-bold">{t('powerpoint.wizard.title')}</h1>
        <p className="text-gray-600 mt-2">{t('powerpoint.wizard.subtitle')}</p>
      </div>

      {/* Existing Outputs Section */}
      {existingOutputs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto mb-6"
        >
          <Card className="border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
                    {t('powerpoint.wizard.existingPresentations')}
                  </CardTitle>
                  <CardDescription>
                    {t('powerpoint.wizard.viewOrEdit')}
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowOutputs(!showOutputs)}
                >
                  {showOutputs ? t('powerpoint.wizard.hide') : t('powerpoint.wizard.show')} ({existingOutputs.length})
                </Button>
              </div>
            </CardHeader>
            {showOutputs && (
              <CardContent>
                <div className="space-y-3">
                  {existingOutputs.map((output, index) => (
                    <motion.div
                      key={output.output_id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="p-4 border border-indigo-200 rounded-lg bg-white hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer"
                      onClick={() => handleOpenOutput(output.output_id)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <FileSpreadsheet className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                            <span className="font-medium text-sm text-gray-800 truncate">
                              {output.filename}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(output.created_at).toLocaleString()}
                            </span>
                            <span>{output.slide_count} {t('powerpoint.wizard.slides')}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isOwner && (
                            <motion.div
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={(e) => handleDeleteOutput(output.output_id, e)}
                                disabled={isDeleting === output.output_id}
                              >
                                {isDeleting === output.output_id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </motion.div>
                          )}
                          <motion.div
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleOpenOutput(output.output_id)
                              }}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              {t('powerpoint.wizard.open')}
                            </Button>
                          </motion.div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </motion.div>
      )}

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>{t('powerpoint.wizard.prepareWorkspace')}</CardTitle>
          <CardDescription>
            {t('powerpoint.wizard.prepareDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div>
              <Label>{t('powerpoint.wizard.drawingFolders')}</Label>
              <div className="space-y-2 mt-2">
                {selectedDrawingFolders.map((folderId) => {
                  const folder = drawingFolders.find(f => f.id === folderId)
                  return (
                    <div key={folderId} className="flex items-center justify-between p-2 border rounded bg-gray-50">
                      <span className="text-sm">
                        {folder ? (folder.description || `${t('powerpoint.wizard.folder')} ${folder.id.slice(0, 8)}`) : folderId} ({folder?.image_count || 0} {t('powerpoint.wizard.images')})
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedDrawingFolders(selectedDrawingFolders.filter(id => id !== folderId))
                        }}
                      >
                        {t('powerpoint.wizard.remove')}
                      </Button>
                    </div>
                  )
                })}
                <Select 
                  value={undefined} 
                  onValueChange={(value) => {
                    if (value && !selectedDrawingFolders.includes(value)) {
                      setSelectedDrawingFolders([...selectedDrawingFolders, value])
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('powerpoint.wizard.addDrawingFolder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {drawingFolders
                      .filter(folder => !selectedDrawingFolders.includes(folder.id))
                      .map((folder) => (
                        <SelectItem key={folder.id} value={folder.id}>
                          {folder.description || `${t('powerpoint.wizard.folder')} ${folder.id.slice(0, 8)}`} ({folder.image_count} {t('powerpoint.wizard.images')})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {selectedDrawingFolders.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => setSelectedDrawingFolders([])}
                  >
                    {t('powerpoint.wizard.clearAll')}
                  </Button>
                )}
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-800 font-medium mb-2">
                {t('powerpoint.wizard.willBeCopied')}
              </p>
              <ul className="list-disc list-inside text-sm text-blue-700 space-y-1">
                <li>{t('powerpoint.wizard.excelFile')}</li>
                <li>{t('powerpoint.wizard.runTaskImages')}</li>
                {selectedDrawingFolders.length > 0 && (
                  <li>{t('powerpoint.wizard.drawingFoldersCount', { count: selectedDrawingFolders.length, plural: selectedDrawingFolders.length > 1 ? 's' : '' })}</li>
                )}
              </ul>
            </div>

            <Button 
              onClick={prepareWorkspace} 
              disabled={isLoading}
              className="w-full"
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('powerpoint.wizard.preparingWorkspace')}
                </>
              ) : (
                <>
                  <Folder className="mr-2 h-4 w-4" />
                  {t('powerpoint.wizard.prepare')}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

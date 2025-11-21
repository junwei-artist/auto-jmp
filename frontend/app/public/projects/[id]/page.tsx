'use client'

import { useState, useEffect, ReactNode } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert-simple'
import { Loader2, Eye, Download, Globe, Lock, ArrowLeft, Home, X, ChevronDown, ChevronRight, Info } from 'lucide-react'
import { useLanguage } from '@/lib/language'
import { LanguageSelector } from '@/components/LanguageSelector'
import { PublicImageGallery } from '@/components/PublicImageGallery'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import toast from 'react-hot-toast'

interface Project {
  id: string
  name: string
  description?: string
  owner_id: string
  owner_email?: string
  owner_display_name?: string
  allow_guest: boolean
  is_public: boolean
  created_at: string
  member_count?: number
  run_count?: number
  plugin_name?: string
}

interface Run {
  id: string
  project_id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
  task_name: string
  message?: string
  image_count: number
  created_at: string
  started_at?: string
  finished_at?: string
  jmp_task_id?: string
}

interface Artifact {
  id: string
  project_id: string
  run_id?: string
  kind: 'input_csv' | 'input_jsl' | 'output_png' | 'results_zip' | 'log'
  storage_key: string
  filename: string
  size_bytes?: number
  mime_type?: string
  created_at: string
}

export default function PublicProjectPage() {
  const params = useParams()
  const { t } = useLanguage()
  const projectId = (params as any)?.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<Run | null>(null)
  const [showGallery, setShowGallery] = useState(false)
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set())
  const [showRunInfo, setShowRunInfo] = useState(false)
  const [selectedRunInfo, setSelectedRunInfo] = useState<Run | null>(null)

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4700'

  // Fetch public project data
  useEffect(() => {
    const fetchPublicProject = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Fetch project details
        const projectResponse = await fetch(`${backendUrl}/api/v1/projects/public/${projectId}`)
        if (!projectResponse.ok) {
          if (projectResponse.status === 404) {
            setError('Project not found')
          } else if (projectResponse.status === 403) {
            setError('This project is not public')
          } else {
            setError('Failed to load project')
          }
          return
        }
        const projectData = await projectResponse.json()
        setProject(projectData)

        // Fetch runs
        const runsResponse = await fetch(`${backendUrl}/api/v1/projects/public/${projectId}/runs`)
        if (runsResponse.ok) {
          const runsData = await runsResponse.json()
          setRuns(runsData)
        }

        // Fetch artifacts
        const artifactsResponse = await fetch(`${backendUrl}/api/v1/projects/public/${projectId}/artifacts`)
        if (artifactsResponse.ok) {
          const artifactsData = await artifactsResponse.json()
          setArtifacts(artifactsData)
        }

      } catch (err) {
        console.error('Error fetching public project:', err)
        setError('Failed to load project')
      } finally {
        setIsLoading(false)
      }
    }

    if (projectId) {
      fetchPublicProject()
    }
  }, [projectId, backendUrl])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'queued': return 'bg-yellow-100 text-yellow-800'
      case 'running': return 'bg-blue-100 text-blue-800'
      case 'succeeded': return 'bg-green-100 text-green-800'
      case 'failed': return 'bg-red-100 text-red-800'
      case 'canceled': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const handleDownloadZip = async (runId: string) => {
    try {
      const response = await fetch(`${backendUrl}/api/v1/projects/public/${projectId}/runs/${runId}/download`)
      if (!response.ok) throw new Error('Download failed')
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `run_${runId}_results.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
      toast.success('ZIP file downloaded successfully!')
    } catch (error) {
      console.error('Download error:', error)
      toast.error('Failed to download ZIP file')
    }
  }

  const toggleRun = (id: string) => {
    setExpandedRuns(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const RoundIcon = ({ children, className = '' }: { children: ReactNode, className?: string }) => (
    <span className={`inline-flex items-center justify-center rounded-full bg-gray-200 text-gray-700 font-medium h-6 w-6 text-xs ${className}`}>{children}</span>
  )

  const ModernCommentIcon = ({ className = "w-8 h-8", primary = "#2563eb", secondary = "#e0e7ff" }) => (
    <svg viewBox="0 0 32 32" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="cmtg" x1="8" y1="6" x2="28" y2="28" gradientUnits="userSpaceOnUse"><stop stopColor={secondary}/><stop offset="1" stopColor={primary} stopOpacity="0.22"/></linearGradient></defs>
      <path d="M6 14c0-4 3.6-7 8-7h4c4.4 0 8 3 8 7s-3.6 7-8 7h-2l-5 4v-4.5C8.72 19.73 6 17.14 6 14Z" fill="url(#cmtg)"/>
      <g stroke={primary} strokeWidth="1.6" strokeLinecap="round"><path d="M11.5 14.5h9"/><path d="M13.5 18h5"/></g>
      <filter id="blur1" x="0" y="0" width="32" height="36"><feGaussianBlur stdDeviation="1.5"/></filter>
    </svg>
  )
  const ModernArtifactIcon = ({ className = "w-8 h-8", primary = "#a21caf", secondary = "#f3e8ff" }) => (
    <svg viewBox="0 0 32 32" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="7" y="8" width="18" height="16" rx="4" fill="url(#afg)" stroke={primary} strokeWidth="1.8"/>
      <defs><linearGradient id="afg" x1="7" y1="8" x2="25" y2="24" gradientUnits="userSpaceOnUse"><stop stopColor={secondary}/><stop offset="1" stopColor={primary} stopOpacity="0.13"/></linearGradient></defs>
      <rect x="11" y="13" width="10" height="2" rx="1" fill={primary} opacity="0.23"/>
      <rect x="11" y="17" width="8" height="1.8" rx="0.9" fill={primary} opacity="0.12"/>
      <rect x="11" y="20" width="7" height="1.2" rx="0.6" fill={primary} opacity="0.09"/>
    </svg>
  )

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading public project...</p>
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <Alert className="mb-4">
            <AlertDescription>
              {error || 'Project not found'}
            </AlertDescription>
          </Alert>
          <div className="space-x-2">
            <Button 
              onClick={() => window.location.href = '/'}
              variant="outline"
            >
              <Home className="mr-2 h-4 w-4" />
              Go Home
            </Button>
            <Button 
              onClick={() => window.history.back()}
              variant="outline"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <Button 
              onClick={() => window.location.href = '/'}
              variant="outline"
            >
              <Home className="mr-2 h-4 w-4" />
              Go Home
            </Button>
            <LanguageSelector />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
                <Badge variant="outline" className="bg-green-100 text-green-800">
                  <Globe className="mr-1 h-3 w-3" />
                  Public Project
                </Badge>
              </div>
              {project.description && (
                <p className="text-gray-600 mt-2">{project.description}</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Runs Display */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Eye className="mr-2 h-5 w-5" />
                  Analysis Results
                </CardTitle>
                <CardDescription>
                  View the analysis results from this public project
                </CardDescription>
              </CardHeader>
              <CardContent>
                {runs && runs.length > 0 ? (
                  <div className="space-y-4">
                    {runs.map((run) => (
                      <div key={run.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3 cursor-pointer" onClick={() => toggleRun(run.id)}>
                          <div className="flex items-center space-x-2">
                            {expandedRuns.has(run.id) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <Badge className={getStatusColor(run.status)}>
                              {run.status}
                            </Badge>
                            <div>
                              <p className="font-medium">{run.task_name}</p>
                              <p className="text-sm text-gray-600">
                                {run.image_count} images • {new Date(run.created_at).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-6">
                            {/* Big icons for comments and artifacts, vertical layout */}
                            <div className="flex flex-col items-center">
                              <div className="flex items-center space-x-2">
                                <ModernCommentIcon />
                                <span className="text-sm text-gray-700 font-semibold">0</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-center">
                              <div className="flex items-center space-x-2">
                                <ModernArtifactIcon />
                                <span className="text-sm text-gray-700 font-semibold">{artifacts.filter(a => a.run_id === run.id).length}</span>
                              </div>
                            </div>
                            {/* Action Buttons */}
                            <div className="flex items-center space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={e => { e.stopPropagation(); setSelectedRun(run); setShowGallery(true); }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={e => { e.stopPropagation(); handleDownloadZip(run.id); }}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={e => {
                                  e.stopPropagation();
                                  setSelectedRunInfo(run);
                                  setShowRunInfo(true);
                                }}
                                title="Show run information"
                              >
                                <Info className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        {/* Collapsible details */}
                        {expandedRuns.has(run.id) && (
                          <div></div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600 text-center py-4">No analysis results available</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Project Info */}
            <Card>
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-600">Owner</p>
                  <p className="text-sm">{project.owner_display_name || project.owner_email || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Created</p>
                  <p className="text-sm">{project.created_at ? new Date(project.created_at).toLocaleDateString() : 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Status</p>
                  <div className="flex items-center space-x-2">
                    <Globe className="h-3 w-3 text-green-600" />
                    <span className="text-sm text-green-600">Public</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Project Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total Runs</span>
                  <span className="font-medium">{runs?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total Images</span>
                  <span className="font-medium">
                    {runs?.reduce((sum, run) => sum + run.image_count, 0) || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Artifacts</span>
                  <span className="font-medium">{artifacts?.length || 0}</span>
                </div>
              </CardContent>
            </Card>

            {/* Public Notice */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Globe className="mr-2 h-4 w-4 text-green-600" />
                  Public Project
                </CardTitle>
                <CardDescription>
                  This project is publicly accessible
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  This project has been made public by its owner. You can view the analysis results and download files without needing to log in.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Image Gallery Modal */}
      {showGallery && selectedRun && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-6xl max-h-[90vh] w-full overflow-auto">
            <div className="p-6">
              <div className="relative">
                <Button
                  onClick={() => {
                    setShowGallery(false)
                    setSelectedRun(null)
                  }}
                  variant="outline"
                  size="sm"
                  className="absolute top-4 right-4 z-10"
                >
                  <X className="h-4 w-4" />
                </Button>
                <PublicImageGallery
                  artifacts={artifacts.filter(a => a.run_id === selectedRun.id)}
                  projectId={projectId}
                  backendUrl={backendUrl}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Run Info Dialog */}
      <Dialog open={showRunInfo} onOpenChange={setShowRunInfo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run Information</DialogTitle>
            <DialogDescription>
              Details for this analysis run
            </DialogDescription>
          </DialogHeader>
          {selectedRunInfo && (
            <div className="space-y-3 py-4">
              <div>
                <label className="text-sm font-semibold text-gray-700">Run ID:</label>
                <p className="text-sm text-gray-900 font-mono break-all">{selectedRunInfo.id}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700">Project ID:</label>
                <p className="text-sm text-gray-900 font-mono break-all">{selectedRunInfo.project_id}</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700">JMP Task ID:</label>
                <p className="text-sm text-gray-900 font-mono break-all">
                  {selectedRunInfo.jmp_task_id || 'Not set'}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

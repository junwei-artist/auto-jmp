'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert-simple'
import { Loader2, Eye, Download, Globe, Lock, ArrowLeft, Home, X } from 'lucide-react'
import { useLanguage } from '@/lib/language'
import { LanguageSelector } from '@/components/LanguageSelector'
import { PublicImageGallery } from '@/components/PublicImageGallery'
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
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<Run | null>(null)
  const [showGallery, setShowGallery] = useState(false)

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
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-3">
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
                          <div className="flex items-center space-x-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setSelectedRun(run)
                                setShowGallery(true)
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleDownloadZip(run.id)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
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
    </div>
  )
}

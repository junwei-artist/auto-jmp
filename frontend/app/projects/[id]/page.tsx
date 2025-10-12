'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert-simple'
import { Loader2, Upload, FileText, BarChart3, Users, Share2, ArrowLeft, Download, Eye } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ImageGallery } from '@/components/ImageGallery'
import toast from 'react-hot-toast'

interface Project {
  id: string
  name: string
  description?: string
  owner_id: string
  allow_guest: boolean
  created_at: string
  owner?: {
    email: string
  }
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

export default function ProjectPage() {
  const params = useParams()
  const router = useRouter()
  const { user, token } = useAuth()
  const projectId = params.id as string

  const [isUploading, setIsUploading] = useState(false)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [jslFile, setJslFile] = useState<File | null>(null)
  const [selectedRun, setSelectedRun] = useState<Run | null>(null)
  const [showGallery, setShowGallery] = useState(false)

  // Fetch project details
  const { data: project, isLoading: projectLoading, error: projectError } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/projects/${projectId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch project')
      }
      
      return response.json() as Promise<Project>
    },
    enabled: !!token && !!projectId,
  })

  // Fetch project runs
  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ['project-runs', projectId],
    queryFn: async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/projects/${projectId}/runs`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch runs')
      }
      
      return response.json() as Promise<Run[]>
    },
    enabled: !!token && !!projectId,
  })

  // Fetch project artifacts
  const { data: artifacts, isLoading: artifactsLoading } = useQuery({
    queryKey: ['project-artifacts', projectId],
    queryFn: async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/projects/${projectId}/artifacts`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch artifacts')
      }
      
      return response.json() as Promise<Artifact[]>
    },
    enabled: !!token && !!projectId,
  })

  // Start new run mutation
  const startRunMutation = useMutation({
    mutationFn: async () => {
      if (!csvFile || !jslFile) {
        throw new Error('Please select both CSV and JSL files')
      }

      // Upload files first
      // Determine content types with fallbacks
      const csvContentType = csvFile.type || (csvFile.name.endsWith('.csv') ? 'text/csv' : 'text/plain')
      const jslContentType = jslFile.type || (jslFile.name.endsWith('.jsl') ? 'text/x-jmp-script' : 'text/plain')

      const csvUploadResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/uploads/presign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: csvFile.name,
          content_type: csvContentType,
        }),
      })

      const jslUploadResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/uploads/presign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: jslFile.name,
          content_type: jslContentType,
        }),
      })

      if (!csvUploadResponse.ok || !jslUploadResponse.ok) {
        throw new Error('Failed to get upload URLs')
      }

      const csvUploadData = await csvUploadResponse.json()
      const jslUploadData = await jslUploadResponse.json()

      // Upload files to storage using FormData
      const csvFormData = new FormData()
      csvFormData.append('file', csvFile)
      
      const jslFormData = new FormData()
      jslFormData.append('file', jslFile)

      const csvUploadResult = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}${csvUploadData.upload_url}`, {
        method: 'POST',
        body: csvFormData,
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      const jslUploadResult = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}${jslUploadData.upload_url}`, {
        method: 'POST',
        body: jslFormData,
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!csvUploadResult.ok || !jslUploadResult.ok) {
        throw new Error('Failed to upload files')
      }

      // Start the run
      const runResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/runs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectId,
          csv_key: csvUploadData.storage_key,
          jsl_key: jslUploadData.storage_key,
        }),
      })

      if (!runResponse.ok) {
        throw new Error('Failed to start run')
      }

      return runResponse.json()
    },
    onSuccess: () => {
      toast.success('Analysis started successfully!')
      setCsvFile(null)
      setJslFile(null)
      // Refresh runs and artifacts
      window.location.reload()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleFileChange = (type: 'csv' | 'jsl', file: File | null) => {
    if (type === 'csv') {
      setCsvFile(file)
    } else {
      setJslFile(file)
    }
  }

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

  if (projectLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading project...</p>
        </div>
      </div>
    )
  }

  if (projectError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Alert className="max-w-md">
            <AlertDescription>
              Project not found or you don't have access to it.
            </AlertDescription>
          </Alert>
          <Button 
            onClick={() => router.push('/dashboard')}
            className="mt-4"
            variant="outline"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button 
            onClick={() => router.push('/dashboard')}
            variant="outline"
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{project?.name}</h1>
              {project?.description && (
                <p className="text-gray-600 mt-2">{project.description}</p>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="outline">
                {project?.allow_guest ? 'Public' : 'Private'}
              </Badge>
              <Button variant="outline" size="sm">
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </Button>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Upload Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Upload className="mr-2 h-5 w-5" />
                  Start New Analysis
                </CardTitle>
                <CardDescription>
                  Upload your CSV data file and JSL script to generate boxplot visualizations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">CSV Data File</label>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => handleFileChange('csv', e.target.files?.[0] || null)}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    {csvFile && (
                      <p className="text-sm text-green-600 mt-1">✓ {csvFile.name}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">JSL Script</label>
                    <input
                      type="file"
                      accept=".jsl"
                      onChange={(e) => handleFileChange('jsl', e.target.files?.[0] || null)}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    {jslFile && (
                      <p className="text-sm text-green-600 mt-1">✓ {jslFile.name}</p>
                    )}
                  </div>
                </div>
                
                <Button 
                  onClick={() => startRunMutation.mutate()}
                  disabled={!csvFile || !jslFile || startRunMutation.isPending}
                  className="w-full"
                >
                  {startRunMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Start Analysis
                </Button>
              </CardContent>
            </Card>

            {/* Runs History */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="mr-2 h-5 w-5" />
                  Analysis History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {runsLoading ? (
                  <div className="text-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    <p className="text-gray-600">Loading runs...</p>
                  </div>
                ) : runs && runs.length > 0 ? (
                  <div className="space-y-3">
                    {runs.map((run) => (
                      <div key={run.id} className="flex items-center justify-between p-3 border rounded-lg">
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
                            onClick={async () => {
                              try {
                                // Download the ZIP file directly
                                const downloadResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/uploads/download-zip/${run.id}`, {
                                  headers: {
                                    'Authorization': `Bearer ${token}`,
                                  },
                                })
                                
                                if (!downloadResponse.ok) throw new Error('Download failed')
                                
                                const blob = await downloadResponse.blob()
                                const url = window.URL.createObjectURL(blob)
                                const a = document.createElement('a')
                                a.href = url
                                a.download = `run_${run.id}_results.zip`
                                document.body.appendChild(a)
                                a.click()
                                window.URL.revokeObjectURL(url)
                                document.body.removeChild(a)
                                
                                toast.success('ZIP file downloaded successfully!')
                              } catch (error) {
                                console.error('Download error:', error)
                                toast.error('Failed to download ZIP file')
                              }
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600 text-center py-4">No analysis runs yet</p>
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
                  <p className="text-sm">{project?.owner?.email || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Created</p>
                  <p className="text-sm">{project?.created_at ? new Date(project.created_at).toLocaleDateString() : 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Visibility</p>
                  <p className="text-sm">{project?.allow_guest ? 'Public' : 'Private'}</p>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Stats</CardTitle>
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
          </div>
        </div>
      </div>

      {/* Image Gallery Modal */}
      {showGallery && selectedRun && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-6xl max-h-[90vh] w-full overflow-auto">
            <div className="p-6">
              <ImageGallery
                runId={selectedRun.id}
                projectId={projectId}
                run={selectedRun}
                onClose={() => {
                  setShowGallery(false)
                  setSelectedRun(null)
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

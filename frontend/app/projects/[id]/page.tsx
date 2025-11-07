'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert-simple'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Upload, FileText, BarChart3, Users, Share2, ArrowLeft, Download, Eye, Globe, Lock, Trash2, Settings, MessageSquare, UserPlus, ChevronDown, ChevronRight, Edit2, Check, X, Paperclip, FolderOpen, FileSpreadsheet } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { projectApi, runApi } from '@/lib/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLanguage } from '@/lib/language'
import { useSocket } from '@/lib/socket'
import { LanguageSelector } from '@/components/LanguageSelector'
import { ImageGallery } from '@/components/ImageGallery'
import { ProjectMembership } from '@/components/ProjectMembership'
import { EnhancedProjectMembership } from '@/components/EnhancedProjectMembership'
import { ProjectComments } from '@/components/ProjectComments'
import RunComments from '@/components/RunComments'
import { ProjectAttachments } from '@/components/ProjectAttachments'
import { ProjectDrawings } from '@/components/ProjectDrawings'
import { NotificationBell } from '@/components/NotificationCenter'
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
  owner?: {
    email: string
  }
}

interface ProjectMember {
  user_id: string
  email?: string
  role: 'owner' | 'member' | 'watcher'
  is_guest: boolean
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
  started_by?: string
  started_by_email?: string
  started_by_is_guest?: boolean
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

interface RunArtifactWithComments {
  artifact_id: string
  filename: string
  kind: string
  comment_count: number
}

export default function ProjectPage() {
  const params = useParams()
  const router = useRouter()
  const { user, ready } = useAuth()
  const { t } = useLanguage()
  const projectId = (params as any)?.id as string

  // Helper function to get auth token
  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('access_token')
    }
    return null
  }

  const [isUploading, setIsUploading] = useState(false)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [jslFile, setJslFile] = useState<File | null>(null)
  const [selectedRun, setSelectedRun] = useState<Run | null>(null)
  const [showGallery, setShowGallery] = useState(false)
  const [serverInfo, setServerInfo] = useState<{public_url?: string, local_url?: string} | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<'owner' | 'member' | 'watcher'>('watcher')
  const [activeTab, setActiveTab] = useState('analysis')
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())
  const [runCommentCounts, setRunCommentCounts] = useState<Record<string, number>>({})
  const [commentCountsLoading, setCommentCountsLoading] = useState(false)
  const [runArtifactComments, setRunArtifactComments] = useState<Record<string, RunArtifactWithComments[]>>({})
  const [expandedArtifacts, setExpandedArtifacts] = useState<Set<string>>(new Set())
  const [artifactCommentsLoading, setArtifactCommentsLoading] = useState(false)
  const [isEditingProject, setIsEditingProject] = useState(false)
  const [editProjectName, setEditProjectName] = useState('')
  const [editProjectDescription, setEditProjectDescription] = useState('')
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set())
  const [editingTaskName, setEditingTaskName] = useState<string | null>(null)
  const [editTaskNameValue, setEditTaskNameValue] = useState('')
  const [historyLogs, setHistoryLogs] = useState<any[]>([])
  const [historyLogsLoading, setHistoryLogsLoading] = useState(false)

  // Fetch server info for public sharing
  useEffect(() => {
    const fetchServerInfo = async () => {
      try {
        const response = await fetch('/api/v1/server/server-info')
        if (response.ok) {
          const info = await response.json()
          setServerInfo(info)
        }
      } catch (error) {
        console.error('Failed to fetch server info:', error)
      }
    }
    fetchServerInfo()
  }, [])


  // Handle visibility toggle
  const handleVisibilityToggle = (isPublic: boolean) => {
    updateProjectMutation.mutate({ is_public: isPublic })
  }

  // Get public project URL
  const getPublicProjectUrl = () => {
    // Use the frontend URL from environment variable
    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:4800'
    return `${frontendUrl}/public/projects/${projectId}`
  }

  // Fetch project details
  const { data: project, isLoading: projectLoading, error: projectError } = useQuery<Project>({
    queryKey: ['project', projectId],
    queryFn: () => projectApi.getProject(projectId),
    enabled: !!user && !!projectId && ready,
  })

  // Debug logging
  useEffect(() => {
    console.log('Project data:', project)
    console.log('Project loading:', projectLoading)
    console.log('Project error:', projectError)
    console.log('User:', user)
    console.log('Project ID:', projectId)
  }, [project, projectLoading, projectError, user, projectId])

  // Fetch project runs with auto-refresh
  const queryClient = useQueryClient()
  const { data: runs, isLoading: runsLoading, refetch: refetchRuns } = useQuery<Run[]>({
    queryKey: ['project-runs', projectId],
    queryFn: () => projectApi.getProjectRuns(projectId),
    enabled: !!user && !!projectId && ready,
    refetchInterval: 5000, // Simple 5-second refresh
    refetchIntervalInBackground: true,
  })

  // Subscribe to WebSocket updates for real-time image count
  const { subscribeToRun, unsubscribeFromRun } = useSocket()
  useEffect(() => {
    if (!runs || runs.length === 0) return

    // Subscribe to all running runs for real-time updates
    const runningRuns = runs.filter(run => run.status === 'running' || run.status === 'queued')
    
    runningRuns.forEach(run => {
      subscribeToRun(run.id, (update: any) => {
        if (update.type === 'run_progress' && update.image_count !== undefined) {
          // Update the run's image_count in the query cache
          queryClient.setQueryData<Run[]>(['project-runs', projectId], (oldRuns) => {
            if (!oldRuns) return oldRuns
            return oldRuns.map(r => 
              r.id === update.run_id 
                ? { ...r, image_count: update.image_count, message: update.message }
                : r
            )
          })
        } else if (update.type === 'run_completed' || update.type === 'run_failed') {
          // Update final image count and status when run completes
          queryClient.setQueryData<Run[]>(['project-runs', projectId], (oldRuns) => {
            if (!oldRuns) return oldRuns
            return oldRuns.map(r => 
              r.id === update.run_id 
                ? { ...r, image_count: update.image_count || r.image_count, status: update.status, message: update.message }
                : r
            )
          })
          // Unsubscribe from completed runs
          unsubscribeFromRun(run.id)
        }
      })
    })

    // Cleanup: unsubscribe when component unmounts or runs change
    return () => {
      runningRuns.forEach(run => {
        unsubscribeFromRun(run.id)
      })
    }
  }, [runs, projectId, subscribeToRun, unsubscribeFromRun, queryClient])

  // Fetch project artifacts
  const { data: artifacts, isLoading: artifactsLoading } = useQuery<Artifact[]>({
    queryKey: ['project-artifacts', projectId],
    queryFn: () => projectApi.getProjectArtifacts(projectId),
    enabled: !!user && !!projectId && ready,
  })

  // Fetch project members to determine user role
  const { data: members, isLoading: membersLoading, error: membersError } = useQuery<ProjectMember[]>({
    queryKey: ['project-members', projectId],
    queryFn: async () => {
      const token = getAuthToken()
      if (!token) {
        throw new Error('No authentication token available')
      }
      
      const response = await fetch(`/api/v1/members/projects/${projectId}/members`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required. Please log in again.')
        }
        throw new Error(`Failed to fetch members: ${response.status}`)
      }
      
      return response.json()
    },
    enabled: !!user && !!projectId && ready,
    retry: false, // Don't retry on auth errors
  })

  // Determine current user's role - simplified to just check ownership
  useEffect(() => {
    if (project && user) {
      // Only check if user is the owner, let backend handle other permissions
      if (project.owner_id === user.id) {
        setCurrentUserRole('owner')
      } else {
        // For non-owners, let backend determine access permissions
        setCurrentUserRole('member') // Default to member, backend will enforce actual permissions
      }
    }
  }, [project, user])

  // Comments are hidden by default - no auto-expansion

  // Fetch comment counts for all runs
  const fetchRunCommentCounts = async (runIds: string[]) => {
    if (runIds.length === 0) return
    
    setCommentCountsLoading(true)
    try {
      const token = getAuthToken()
      if (!token) return

      const response = await fetch(`/api/v1/runs/comment-counts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(runIds),
      })

      if (response.ok) {
        const counts = await response.json()
        const countMap: Record<string, number> = {}
        counts.forEach((item: { run_id: string; comment_count: number }) => {
          countMap[item.run_id] = item.comment_count
        })
        setRunCommentCounts(countMap)
      }
    } catch (error) {
      console.error('Failed to fetch run comment counts:', error)
    } finally {
      setCommentCountsLoading(false)
    }
  }

  // Fetch artifact comment counts for a specific run
  const fetchRunArtifactComments = async (runId: string) => {
    try {
      const token = getAuthToken()
      if (!token) return

      const response = await fetch(`/api/v1/runs/${runId}/artifacts-with-comments`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const artifacts = await response.json()
        setRunArtifactComments(prev => ({
          ...prev,
          [runId]: artifacts
        }))
      }
    } catch (error) {
      console.error('Failed to fetch run artifact comments:', error)
    }
  }

  // Fetch artifact comment counts for all runs
  const fetchAllRunArtifactComments = async (runIds: string[]) => {
    if (runIds.length === 0) return
    
    setArtifactCommentsLoading(true)
    try {
      const token = getAuthToken()
      if (!token) return

      // Fetch all runs' artifact comments in parallel
      const promises = runIds.map(runId => 
        fetch(`/api/v1/runs/${runId}/artifacts-with-comments`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }).then(response => response.ok ? response.json() : [])
      )

      const results = await Promise.all(promises)
      
      // Update state with all results
      const newArtifactComments: Record<string, RunArtifactWithComments[]> = {}
      runIds.forEach((runId, index) => {
        newArtifactComments[runId] = results[index] || []
      })
      
      setRunArtifactComments(prev => ({
        ...prev,
        ...newArtifactComments
      }))
    } catch (error) {
      console.error('Failed to fetch run artifact comments:', error)
    } finally {
      setArtifactCommentsLoading(false)
    }
  }

  // Auto-fetch comment counts when runs are loaded
  useEffect(() => {
    if (runs && runs.length > 0) {
      const runIds = runs.map(run => run.id)
      fetchRunCommentCounts(runIds)
      fetchAllRunArtifactComments(runIds)
    }
  }, [runs])

  // Delete run mutation
  // Fetch history logs when history tab is active
  useEffect(() => {
    if (activeTab === 'history' && projectId) {
      const fetchHistoryLogs = async () => {
        setHistoryLogsLoading(true)
        try {
          const logs = await projectApi.getProjectHistory(projectId)
          setHistoryLogs(logs)
        } catch (error) {
          console.error('Failed to fetch history logs:', error)
        } finally {
          setHistoryLogsLoading(false)
        }
      }
      fetchHistoryLogs()
    }
  }, [activeTab, projectId])

  // Update run task name mutation
  const updateRunTaskNameMutation = useMutation({
    mutationFn: ({ runId, taskName }: { runId: string; taskName: string }) =>
      runApi.updateRunTaskName(runId, taskName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-runs', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project', projectId, 'history'] })
      if (activeTab === 'history') {
        projectApi.getProjectHistory(projectId).then(setHistoryLogs).catch(console.error)
      }
      toast.success('Task name updated successfully')
      setEditingTaskName(null)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update task name')
    }
  })

  const deleteRunMutation = useMutation({
    mutationFn: (runId: string) => runApi.deleteRun(runId),
    onSuccess: () => {
      toast.success('Run deleted successfully!')
      // Refresh runs data
      refetchRuns()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: () => projectApi.deleteProject(projectId),
    onSuccess: () => {
      toast.success('Project deleted successfully!')
      router.push('/dashboard')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Update project mutation
  const updateProjectMutation = useMutation({
    mutationFn: (data: { is_public?: boolean; name?: string; description?: string }) => projectApi.updateProject(projectId, data),
    onSuccess: () => {
      toast.success('Project updated successfully!')
      // Refresh project data
      window.location.reload() // Simple refresh to get updated data
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Update project details mutation
  const updateProjectDetailsMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) => projectApi.updateProject(projectId, data),
    onSuccess: () => {
      toast.success('Project details updated successfully!')
      setIsEditingProject(false)
      // Refresh project data
      window.location.reload() // Simple refresh to get updated data
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Start new run mutation
  const startRunMutation = useMutation({
    mutationFn: async () => {
      if (!csvFile || !jslFile) {
        throw new Error('Please select both CSV and JSL files')
      }

      // Create FormData to send CSV and JSL files directly
      const formData = new FormData()
      formData.append('project_id', projectId)
      formData.append('csv_file', csvFile)
      formData.append('jsl_file', jslFile)

      // Start the run with files uploaded directly
      const runResponse = await fetch(`/api/v1/runs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          // Don't set Content-Type - browser will set it with boundary for FormData
        },
        body: formData,
      })

      if (!runResponse.ok) {
        const errorData = await runResponse.json().catch(() => ({ detail: 'Failed to start run' }))
        throw new Error(errorData.detail || 'Failed to start run')
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

  // Toggle comments expansion for a run
  const toggleComments = (runId: string) => {
    setExpandedComments(prev => {
      const newSet = new Set(prev)
      if (newSet.has(runId)) {
        newSet.delete(runId)
      } else {
        newSet.add(runId)
      }
      return newSet
    })
  }

  // Toggle all comments expansion
  const toggleAllComments = () => {
    if (!runs || runs.length === 0) return
    
    const allRunIds = runs.map(run => run.id)
    const allExpanded = allRunIds.every(id => expandedComments.has(id))
    
    if (allExpanded) {
      // Collapse all
      setExpandedComments(new Set())
    } else {
      // Expand all
      setExpandedComments(new Set(allRunIds))
    }
  }

  // Toggle artifacts expansion for a run
  const toggleArtifacts = (runId: string) => {
    setExpandedArtifacts(prev => {
      const newSet = new Set(prev)
      if (newSet.has(runId)) {
        newSet.delete(runId)
      } else {
        newSet.add(runId)
        // Data should already be loaded from the auto-fetch, but fetch if missing
        if (!runArtifactComments[runId]) {
          fetchRunArtifactComments(runId)
        }
      }
      return newSet
    })
  }

  // Get artifact comment statistics for a run
  const getArtifactCommentStats = (runId: string) => {
    const artifacts = runArtifactComments[runId] || []
    const artifactsWithComments = artifacts.filter(a => a.comment_count > 0)
    const totalComments = artifacts.reduce((sum, a) => sum + a.comment_count, 0)
    
    return {
      totalArtifacts: artifacts.length,
      artifactsWithComments: artifactsWithComments.length,
      totalComments
    }
  }

  // Handle edit mode functions
  const startEditing = () => {
    if (project) {
      setEditProjectName(project.name)
      setEditProjectDescription(project.description || '')
      setIsEditingProject(true)
    }
  }

  const cancelEditing = () => {
    setIsEditingProject(false)
    setEditProjectName('')
    setEditProjectDescription('')
  }

  const saveProjectDetails = () => {
    if (!editProjectName.trim()) {
      toast.error('Project name is required')
      return
    }
    
    updateProjectDetailsMutation.mutate({
      name: editProjectName.trim(),
      description: editProjectDescription.trim() || undefined
    })
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

  if (projectLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">{t('project.loading')}</p>
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
              {t('project.notFound')}
            </AlertDescription>
          </Alert>
          <Button 
            onClick={() => router.push('/dashboard')}
            className="mt-4"
            variant="outline"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('projects.backToDashboard')}
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
          <div className="flex items-center justify-between mb-4">
            <Button 
              onClick={() => router.push('/dashboard')}
              variant="outline"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('projects.backToDashboard')}
            </Button>
            <div className="flex items-center space-x-2">
              <NotificationBell />
              <LanguageSelector />
              {user && !user.is_guest && (
                <Button 
                  onClick={() => router.push('/profile')}
                  variant="outline"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  {t('nav.profileSettings')}
                </Button>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex-1">
              {isEditingProject ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Project Name
                    </label>
                    <input
                      type="text"
                      value={editProjectName}
                      onChange={(e) => setEditProjectName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter project name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Project Description
                    </label>
                    <textarea
                      value={editProjectDescription}
                      onChange={(e) => setEditProjectDescription(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={3}
                      placeholder="Enter project description (optional)"
                    />
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      onClick={saveProjectDetails}
                      disabled={updateProjectDetailsMutation.isPending}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {updateProjectDetailsMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      Save
                    </Button>
                    <Button
                      onClick={cancelEditing}
                      disabled={updateProjectDetailsMutation.isPending}
                      variant="outline"
                      size="sm"
                    >
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center space-x-2">
                    <h1 className="text-3xl font-bold text-gray-900">{project?.name}</h1>
                    {currentUserRole === 'owner' && (
                      <Button
                        onClick={startEditing}
                        variant="ghost"
                        size="sm"
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {project?.description && (
                    <p className="text-gray-600 mt-2">{project.description}</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className={project?.is_public ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                {project?.is_public ? (
                  <>
                    <Globe className="mr-1 h-3 w-3" />
                    {t('project.visibility.public')}
                  </>
                ) : (
                  <>
                    <Lock className="mr-1 h-3 w-3" />
                    {t('project.visibility.private')}
                  </>
                )}
              </Badge>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setActiveTab('members')
                }}
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                {t('project.manageMembers')}
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  if (confirm(t('project.deleteConfirm'))) {
                    deleteProjectMutation.mutate()
                  }
                }}
                disabled={deleteProjectMutation.isPending}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                {deleteProjectMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                {t('project.deleteProject')}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="analysis" className="flex items-center space-x-2">
                  <BarChart3 className="h-4 w-4" />
                  <span>{t('project.tabs.analysis')}</span>
                </TabsTrigger>
                <TabsTrigger value="drawings" className="flex items-center space-x-2">
                  <FolderOpen className="h-4 w-4" />
                  <span>{t('drawings.tab')}</span>
                </TabsTrigger>
                <TabsTrigger value="attachments" className="flex items-center space-x-2">
                  <Paperclip className="h-4 w-4" />
                  <span>{t('project.tabs.attachments')}</span>
                </TabsTrigger>
                <TabsTrigger value="members" className="flex items-center space-x-2">
                  <Users className="h-4 w-4" />
                  <span>{t('project.tabs.members')}</span>
                </TabsTrigger>
                <TabsTrigger value="comments" className="flex items-center space-x-2">
                  <MessageSquare className="h-4 w-4" />
                  <span>{t('project.tabs.comments')}</span>
                </TabsTrigger>
                <TabsTrigger value="history" className="flex items-center space-x-2">
                  <FileText className="h-4 w-4" />
                  <span>{t('project.tabs.history')}</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="analysis" className="space-y-6">
                {/* Upload / Plugin Section */}
                {project?.plugin_name ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Upload className="mr-2 h-5 w-5" />
                        {t('project.pluginWizard.title')}
                      </CardTitle>
                      <CardDescription>
                        {t('project.pluginWizard.subtitle', { plugin: project.plugin_name })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button 
                        className="w-full"
                        onClick={() => router.push(`/plugins/${project.plugin_name}/wizard?projectId=${projectId}&plugin=${project.plugin_name}`)}
                      >
                        {t('project.pluginWizard.open', { plugin: project.plugin_name })}
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Upload className="mr-2 h-5 w-5" />
                        {t('projects.startAnalysis')}
                      </CardTitle>
                      <CardDescription>
                        {t('projects.startAnalysisSubtitle')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">{t('projects.csvFile')}</label>
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
                          <label className="block text-sm font-medium mb-2">{t('projects.jslFile')}</label>
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
                        {startRunMutation.isPending ? t('projects.starting') : t('projects.startRun')}
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Runs Display */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center">
                        <BarChart3 className="mr-2 h-5 w-5" />
                        {t('projects.analysisHistory')}
                      </CardTitle>
                      {runs && runs.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={toggleAllComments}
                          className="flex items-center space-x-2"
                        >
                          {runs.every(run => expandedComments.has(run.id)) ? (
                            <>
                              <ChevronDown className="h-4 w-4" />
                              <span>Hide All Comments</span>
                            </>
                          ) : (
                            <>
                              <ChevronRight className="h-4 w-4" />
                              <span>Show All Comments</span>
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {runsLoading ? (
                      <div className="text-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        <p className="text-gray-600">{t('projects.loadingRuns')}</p>
                      </div>
                    ) : runs && runs.length > 0 ? (
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
                                <div className="flex-1">
                                  {editingTaskName === run.id ? (
                                    <div className="flex items-center space-x-2">
                                      <input
                                        type="text"
                                        value={editTaskNameValue}
                                        onChange={(e) => setEditTaskNameValue(e.target.value)}
                                        className="px-2 py-1 border rounded text-sm"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            updateRunTaskNameMutation.mutate({ runId: run.id, taskName: editTaskNameValue })
                                          } else if (e.key === 'Escape') {
                                            setEditingTaskName(null)
                                            setEditTaskNameValue('')
                                          }
                                        }}
                                      />
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => updateRunTaskNameMutation.mutate({ runId: run.id, taskName: editTaskNameValue })}
                                        disabled={updateRunTaskNameMutation.isPending}
                                      >
                                        <Check className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setEditingTaskName(null)
                                          setEditTaskNameValue('')
                                        }}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center space-x-2 group">
                                      <p className="font-medium">{run.task_name}</p>
                                      {(currentUserRole === 'owner' || currentUserRole === 'member') && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setEditingTaskName(run.id)
                                            setEditTaskNameValue(run.task_name)
                                          }}
                                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          <Edit2 className="h-3 w-3 text-gray-500 hover:text-gray-700" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  <p className="text-sm text-gray-600">
                                    {run.image_count} {t('project.analysisHistory.images')} • {new Date(run.created_at).toLocaleString()}
                                  </p>
                                  {run.started_by_email && (
                                    <p className="text-xs text-gray-500">
                                      {t('project.analysisHistory.startedBy', { email: run.started_by_email })}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center space-x-6">
                                {/* Big icons for comments and artifacts, vertical layout */}
                                <div className="flex flex-col items-center">
                                  <div className="flex items-center space-x-2">
                                    <ModernCommentIcon />
                                    <span className="text-sm text-gray-700 font-semibold">{runCommentCounts[run.id] ?? 0}</span>
                                  </div>
                                </div>
                                <div className="flex flex-col items-center">
                                  <div className="flex items-center space-x-2">
                                    <ModernArtifactIcon />
                                    <span className="text-sm text-gray-700 font-semibold">{(runArtifactComments[run.id]?.reduce((sum, art) => sum + (art.comment_count || 0), 0) ?? 0)}</span>
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
                                    onClick={e => {
                                      e.stopPropagation();
                                      window.open(`/projects/${projectId}/runs/${run.id}/powerpoint-wizard`, '_blank')
                                    }}
                                    title="Generate PowerPoint from Excel and Drawings"
                                  >
                                    <FileSpreadsheet className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={async e => {
                                      e.stopPropagation();
                                      try {
                                        const downloadResponse = await fetch(`/api/v1/uploads/download-zip/${run.id}`, {
                                          headers: {
                                            'Authorization': `Bearer ${getAuthToken()}`,
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
                                  {currentUserRole === 'owner' && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={e => {
                                        e.stopPropagation();
                                        if (confirm('Are you sure you want to delete this run? This action cannot be undone.')) {
                                          deleteRunMutation.mutate(run.id)
                                        }
                                      }}
                                      disabled={deleteRunMutation.isPending}
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                      {deleteRunMutation.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                            {/* Collapsible section */}
                            {expandedRuns.has(run.id) && (
                              <div>
                                {/* Put all details currently in the run card below this line for when expanded */}
                                {/* Comments Toggle Button */}
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={e => { e.stopPropagation(); toggleComments(run.id) }}
                                    className="w-full justify-start text-gray-600 hover:text-gray-800"
                                  >
                                    {expandedComments.has(run.id) ? (
                                      <ChevronDown className="mr-2 h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="mr-2 h-4 w-4" />
                                    )}
                                    <MessageSquare className="mr-2 h-4 w-4" />
                                    Comments {commentCountsLoading ? '...' : (runCommentCounts[run.id] !== undefined && runCommentCounts[run.id] > 0 && `(${runCommentCounts[run.id]})`)}
                                  </Button>
                                </div>
                                {/* Run Comments - Collapsible */}
                                {expandedComments.has(run.id) && (
                                  <div className="mt-3">
                                    <RunComments 
                                      runId={run.id}
                                      currentUserRole={currentUserRole}
                                      onCommentCountChange={(count) => {
                                        setRunCommentCounts(prev => ({
                                          ...prev,
                                          [run.id]: count
                                        }))
                                      }}
                                    />
                                  </div>
                                )}
                                {/* Artifact Comments Section */}
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleArtifacts(run.id)}
                                    className="w-full justify-start text-gray-600 hover:text-gray-800"
                                  >
                                    {expandedArtifacts.has(run.id) ? (
                                      <ChevronDown className="mr-2 h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="mr-2 h-4 w-4" />
                                    )}
                                    <FileText className="mr-2 h-4 w-4" />
                                    Artifacts
                                    {(() => {
                                      if (artifactCommentsLoading) {
                                        return ' (loading...)'
                                      }
                                      const stats = getArtifactCommentStats(run.id)
                                      if (stats.totalArtifacts > 0) {
                                        return ` (${stats.artifactsWithComments}/${stats.totalArtifacts} artifacts, ${stats.totalComments} comments)`
                                      } else if (runArtifactComments[run.id] === undefined) {
                                        return ' (loading...)'
                                      } else {
                                        return ' (no artifacts)'
                                      }
                                    })()}
                                  </Button>
                                </div>

                                {/* Artifact Comments List - Collapsible */}
                                {expandedArtifacts.has(run.id) && (
                                  <div className="mt-3">
                                    {(() => {
                                      const artifacts = runArtifactComments[run.id]
                                      
                                      if (artifacts === undefined) {
                                        return (
                                          <div className="text-center py-4 text-gray-500">
                                            <FileText className="h-6 w-6 mx-auto mb-2 opacity-50" />
                                            <p className="text-sm">Loading artifacts...</p>
                                          </div>
                                        )
                                      }
                                      
                                      const artifactsWithComments = artifacts.filter(a => a.comment_count > 0)
                                      
                                      if (artifacts.length === 0) {
                                        return (
                                          <div className="text-center py-4 text-gray-500">
                                            <FileText className="h-6 w-6 mx-auto mb-2 opacity-50" />
                                            <p className="text-sm">No artifacts found for this run</p>
                                          </div>
                                        )
                                      }
                                      
                                      if (artifactsWithComments.length === 0) {
                                        return (
                                          <div className="text-center py-4 text-gray-500">
                                            <FileText className="h-6 w-6 mx-auto mb-2 opacity-50" />
                                            <p className="text-sm">No artifacts have comments yet</p>
                                          </div>
                                        )
                                      }
                                      
                                      return (
                                        <div className="space-y-2">
                                          <h5 className="text-sm font-medium text-gray-700 mb-2">
                                            Artifacts with Comments ({artifactsWithComments.length})
                                          </h5>
                                          {artifactsWithComments.map((artifact) => (
                                            <div key={artifact.artifact_id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                                              <div className="flex items-center space-x-2">
                                                <Badge variant="outline" className="text-xs">
                                                  {artifact.kind}
                                                </Badge>
                                                <span className="text-sm font-medium">{artifact.filename}</span>
                                              </div>
                                              <Badge variant="secondary" className="text-xs">
                                                {artifact.comment_count} comment{artifact.comment_count !== 1 ? 's' : ''}
                                              </Badge>
                                            </div>
                                          ))}
                                        </div>
                                      )
                                    })()}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-600 text-center py-4">{t('project.analysisHistory.noRuns')}</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="drawings">
                <ProjectDrawings 
                  projectId={projectId}
                  currentUserRole={currentUserRole}
                  currentUserId={user?.id || ''}
                />
              </TabsContent>

              <TabsContent value="attachments">
                <ProjectAttachments 
                  projectId={projectId}
                  currentUserRole={currentUserRole}
                  currentUserId={user?.id || ''}
                />
              </TabsContent>

              <TabsContent value="members">
                {membersError ? (
                  <Card>
                    <CardContent className="p-6">
                      <Alert>
                        <AlertDescription>
                          {membersError.message.includes('Authentication') 
                            ? 'Please log out and log back in to refresh your authentication token.'
                            : `Error loading members: ${membersError.message}`
                          }
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  </Card>
                ) : (
                  <EnhancedProjectMembership 
                    projectId={projectId}
                    currentUserRole={currentUserRole}
                  />
                )}
              </TabsContent>

              <TabsContent value="comments">
                <ProjectComments 
                  projectId={projectId}
                  currentUserRole={currentUserRole}
                  onCommentChange={() => {
                    // Comments will auto-refresh via their internal state
                  }}
                />
              </TabsContent>

              <TabsContent value="history" className="space-y-6">
                {/* History Logs */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <FileText className="mr-2 h-5 w-5" />
                      Project History Logs
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {historyLogsLoading ? (
                      <div className="text-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        <p className="text-gray-600">Loading history logs...</p>
                      </div>
                    ) : historyLogs && historyLogs.length > 0 ? (
                      <div className="space-y-3">
                        {historyLogs.map((log: any) => (
                          <div key={log.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                            <div className="flex-1">
                              <p className="text-sm font-medium">{log.description}</p>
                              <div className="flex items-center space-x-2 mt-1">
                                <p className="text-xs text-gray-500">
                                  {log.user_display_name || log.user_email || 'Unknown user'}
                                </p>
                                <span className="text-xs text-gray-400">•</span>
                                <p className="text-xs text-gray-500">
                                  {new Date(log.created_at).toLocaleString()}
                                </p>
                                {log.action_type && (
                                  <>
                                    <span className="text-xs text-gray-400">•</span>
                                    <Badge variant="outline" className="text-xs">
                                      {log.action_type}
                                    </Badge>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-600 text-center py-4">No history logs found</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Project Info */}
            <Card>
              <CardHeader>
                <CardTitle>{t('projects.projectDetails')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-600">{t('projects.owner')}</p>
                  <p className="text-sm">{project?.owner_display_name || project?.owner_email || t('projects.unknown')}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">{t('projects.created')}</p>
                  <p className="text-sm">{project?.created_at ? new Date(project.created_at).toLocaleDateString() : t('projects.unknown')}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">{t('project.visibility.title')}</p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center space-x-2">
                      {project?.is_public ? (
                        <>
                          <Globe className="h-3 w-3 text-green-600" />
                          <span className="text-sm text-green-600">{t('project.visibility.public')}</span>
                        </>
                      ) : (
                        <>
                          <Lock className="h-3 w-3 text-gray-600" />
                          <span className="text-sm text-gray-600">{t('project.visibility.private')}</span>
                        </>
                      )}
                    </div>
                    <Switch
                      checked={project?.is_public || false}
                      onCheckedChange={handleVisibilityToggle}
                      disabled={updateProjectMutation.isPending}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {project?.is_public 
                      ? t('project.visibility.publicDescription')
                      : t('project.visibility.privateDescription')
                    }
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Member Management */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="mr-2 h-5 w-5" />
                  {t('project.memberManagement.title')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-600">{t('project.memberManagement.owner')}</p>
                  <p className="text-sm">
                    {project?.owner_display_name || project?.owner_email || 'Loading...'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">{t('project.memberManagement.yourAccess')}</p>
                  <p className="text-sm capitalize">
                    {currentUserRole === 'owner' ? t('project.memberManagement.ownerAccess') : t('project.memberManagement.memberAccess')}
                  </p>
                </div>
                <Button 
                  className="w-full"
                  variant="outline"
                  onClick={() => {
                    setActiveTab('members')
                  }}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  {t('project.memberManagement.manageMembers')}
                </Button>
                {currentUserRole === 'owner' && (
                  <p className="text-xs text-gray-500">
                    {t('project.memberManagement.ownerDescription')}
                  </p>
                )}
                {currentUserRole !== 'owner' && (
                  <p className="text-xs text-gray-500">
                    {t('project.memberManagement.memberDescription')}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle>{t('projects.quickStats')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">{t('project.quickStats.totalRuns')}</span>
                  <span className="font-medium">{runs?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">{t('project.quickStats.totalImages')}</span>
                  <span className="font-medium">
                    {runs?.reduce((sum, run) => sum + run.image_count, 0) || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">{t('project.quickStats.artifacts')}</span>
                  <span className="font-medium">{artifacts?.length || 0}</span>
                </div>
              </CardContent>
            </Card>

            {/* Public Sharing */}
            {project?.is_public && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Globe className="mr-2 h-4 w-4 text-green-600" />
                    {t('project.publicSharing.title')}
                  </CardTitle>
                  <CardDescription>
                    {t('project.publicSharing.subtitle')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {getPublicProjectUrl() ? (
                    <>
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-2">{t('project.publicSharing.publicUrl')}</p>
                        <div className="bg-gray-50 p-2 rounded text-xs font-mono break-all">
                          {getPublicProjectUrl()}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">
                        {t('project.publicSharing.shareDescription')}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">
                      {t('project.publicSharing.serverNotAvailable')}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
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

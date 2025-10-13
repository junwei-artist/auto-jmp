'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Plus, 
  Upload, 
  FileText, 
  BarChart3, 
  Users, 
  Share2, 
  Settings,
  LogOut,
  User,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trash2,
  Loader2
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { projectApi, runApi } from '@/lib/api'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useLanguage } from '@/lib/language'
import { LanguageSelector } from '@/components/LanguageSelector'
import toast from 'react-hot-toast'

interface Project {
  id: string
  name: string
  description?: string
  owner_id?: string
  allow_guest: boolean
  is_public: boolean
  created_at: string
  member_count: number
  run_count: number
}

interface Run {
  id: string
  project_id: string
  status: string
  task_name: string
  message?: string
  image_count: number
  created_at: string
  started_at?: string
  finished_at?: string
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, logout } = useAuth()
  const { t } = useLanguage()
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDescription, setNewProjectDescription] = useState('')
  const [newProjectIsPublic, setNewProjectIsPublic] = useState(false)

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      router.push('/')
    }
  }, [user, router])

  // Fetch projects
  const { data: projects = [], refetch: refetchProjects } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => projectApi.getProjects(),
    enabled: !!user,
  })

  // Fetch recent runs
  const { data: recentRuns = [] } = useQuery<Run[]>({
    queryKey: ['recent-runs'],
    queryFn: () => runApi.getRuns(),
    enabled: !!user,
    refetchInterval: 5000, // Simple 5-second refresh
    refetchIntervalInBackground: true,
  })

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: (projectId: string) => projectApi.deleteProject(projectId),
    onSuccess: () => {
      toast.success('Project deleted successfully!')
      refetchProjects()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Create project mutation
  const createProjectMutation = useMutation({
    mutationFn: (projectData: { name: string; description?: string; is_public?: boolean }) => 
      projectApi.createProject(projectData),
    onSuccess: () => {
      toast.success('Project created successfully!')
      setShowCreateProject(false)
      setNewProjectName('')
      setNewProjectDescription('')
      setNewProjectIsPublic(false)
      refetchProjects()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProjectName.trim()) return
    
    createProjectMutation.mutate({
      name: newProjectName.trim(),
      description: newProjectDescription.trim() || undefined,
      is_public: newProjectIsPublic,
    })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />
      case 'running':
        return <Clock className="h-4 w-4 text-blue-600 animate-spin" />
      case 'queued':
        return <Clock className="h-4 w-4 text-yellow-600" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'succeeded':
        return 'text-green-600'
      case 'failed':
        return 'text-red-600'
      case 'running':
        return 'text-blue-600'
      case 'queued':
        return 'text-yellow-600'
      default:
        return 'text-gray-600'
    }
  }

  if (!user) {
    return null // Will redirect
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <BarChart3 className="h-8 w-8 text-blue-600 mr-3" />
              <h1 className="text-xl font-semibold text-gray-900">{t('dashboard.title')}</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4 text-gray-500" />
                <span className="text-sm text-gray-700">
                  {user.is_guest ? t('auth.guest') : user.email}
                </span>
              </div>
              <LanguageSelector />
              {!user.is_guest && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => router.push('/profile')}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  {t('nav.profile')}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" />
                {t('nav.logout')}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {user.is_guest ? t('auth.guestWelcome') : t('auth.welcome')}!
          </h2>
          <p className="text-gray-600">
            {t('dashboard.welcomeMessage')}
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.stats.totalProjects')}</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{projects.length}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.stats.totalRuns')}</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {projects.reduce((sum: number, p: any) => sum + p.run_count, 0)}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.stats.activeRuns')}</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {recentRuns.filter((r: Run) => ['running', 'queued'].includes(r.status)).length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Projects Section */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.projects.title')}</h3>
            <Button onClick={() => setShowCreateProject(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('dashboard.projects.newProject')}
            </Button>
          </div>

          {showCreateProject && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Create New Project</CardTitle>
                <CardDescription>
                  Create a new project to organize your data analysis tasks
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateProject} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="project-name">Project Name</Label>
                    <Input
                      id="project-name"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder={t('dashboard.enterProjectName')}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="project-description">Description (Optional)</Label>
                    <Input
                      id="project-description"
                      value={newProjectDescription}
                      onChange={(e) => setNewProjectDescription(e.target.value)}
                      placeholder={t('dashboard.enterProjectDescription')}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="project-public"
                      checked={newProjectIsPublic}
                      onChange={(e) => setNewProjectIsPublic(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <Label htmlFor="project-public" className="text-sm">
                      Make this project public (accessible via URL)
                    </Label>
                  </div>
                  <div className="flex space-x-2">
                    <Button 
                      type="submit" 
                      disabled={createProjectMutation.isPending}
                    >
                      {createProjectMutation.isPending ? 'Creating...' : 'Create Project'}
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setShowCreateProject(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {projects.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No projects yet</h3>
                <p className="text-gray-500 text-center mb-4">
                  Create your first project to start analyzing data with JMP.
                </p>
                <Button onClick={() => setShowCreateProject(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Project
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project: Project) => (
                <Card 
                  key={project.id} 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => router.push(`/projects/${project.id}`)}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{project.name}</span>
                      <div className="flex items-center space-x-2">
                        {project.is_public && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                            Public
                          </span>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
                              deleteProjectMutation.mutate(project.id)
                            }
                          }}
                          disabled={deleteProjectMutation.isPending}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 h-6 w-6 p-0"
                        >
                          {deleteProjectMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </CardTitle>
                    <CardDescription>
                      {project.description || 'No description'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center">
                          <Users className="h-4 w-4 mr-1" />
                          {project.member_count}
                        </div>
                        <div className="flex items-center">
                          <BarChart3 className="h-4 w-4 mr-1" />
                          {project.run_count}
                        </div>
                      </div>
                      <span className="text-xs">
                        {new Date(project.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Recent Runs */}
        {recentRuns.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Recent Runs</h3>
            <div className="space-y-4">
              {recentRuns.slice(0, 5).map((run: Run) => (
                <Card key={run.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center space-x-4">
                      {getStatusIcon(run.status)}
                      <div>
                        <p className="font-medium">{run.task_name}</p>
                        <p className="text-sm text-gray-500">
                          {run.message || 'No message'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${getStatusColor(run.status)}`}>
                        {run.status}
                      </p>
                      <p className="text-xs text-gray-500">
                        {run.image_count} images
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

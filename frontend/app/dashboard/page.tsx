'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  Loader2,
  Crown,
  UserCheck,
  HelpCircle
} from 'lucide-react'
import { 
  ProjectStatsSVG, 
  RunStatsSVG, 
  ActiveRunsSVG, 
  EmptyProjectsSVG, 
  PluginCardSVG, 
  QuickAnalysisSVG, 
  RecentRunsSVG,
  WelcomeSVG 
} from '@/components/svg/DashboardIllustrations'
import { useAuth } from '@/lib/auth'
import { projectApi, runApi } from '@/lib/api'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useLanguage } from '@/lib/language'
import { LanguageSelector } from '@/components/LanguageSelector'
import { NotificationBell } from '@/components/NotificationCenter'
import toast from 'react-hot-toast'

interface Project {
  id: string
  name: string
  description?: string
  owner_id?: string
  owner_email?: string
  owner_display_name?: string
  owner?: {
    email: string
  }
  plugin_name?: string
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
  const { user, logout, ready } = useAuth()
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

  // Fetch owned projects
  const { data: ownedProjects = [], refetch: refetchOwnedProjects } = useQuery<Project[]>({
    queryKey: ['owned-projects'],
    queryFn: () => projectApi.getOwnedProjects(),
    enabled: !!user && ready,
  })

  // Fetch member projects
  const { data: memberProjects = [], refetch: refetchMemberProjects } = useQuery<Project[]>({
    queryKey: ['member-projects'],
    queryFn: () => projectApi.getMemberProjects(),
    enabled: !!user && ready,
  })

  // Combined projects for stats
  const allProjects = [...ownedProjects, ...memberProjects]

  // Fetch recent runs
  const { data: recentRuns = [] } = useQuery<Run[]>({
    queryKey: ['recent-runs'],
    queryFn: () => runApi.getRuns(),
    enabled: !!user && ready,
    refetchInterval: 5000, // Simple 5-second refresh
    refetchIntervalInBackground: true,
  })

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: (projectId: string) => projectApi.deleteProject(projectId),
    onSuccess: () => {
      toast.success('Project deleted successfully!')
      refetchOwnedProjects()
      refetchMemberProjects()
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
      refetchOwnedProjects()
      refetchMemberProjects()
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

  const renderProjectCard = (project: Project, showDeleteButton: boolean = true) => (
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
                {t('dashboard.projects.public')}
              </span>
            )}
            {showDeleteButton && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(t('project.deleteConfirm'))) {
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
            )}
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
              {project.run_count} {t('dashboard.projects.runs')}
            </div>
          </div>
          <span className="text-xs">
            {new Date(project.created_at).toLocaleDateString()}
          </span>
        </div>
        {project.owner_email && (
          <div className="mt-2 text-xs text-gray-500">
            Owner: {project.owner_display_name || project.owner_email}
          </div>
        )}
      </CardContent>
    </Card>
  )

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
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => window.open('/help', '_blank')}
                className="flex items-center space-x-2"
              >
                <HelpCircle className="h-4 w-4" />
                <span>{t('help.title')}</span>
              </Button>
              <NotificationBell />
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
          <div className="flex items-center space-x-4 mb-4">
            <WelcomeSVG className="w-16 h-16" />
            <div>
              <h2 className="text-3xl font-bold text-gray-900">
                {user.is_guest ? t('auth.guestWelcome') : t('auth.welcome')}!
              </h2>
              <p className="text-gray-600 text-lg">
                {t('dashboard.welcomeMessage')}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="group hover:shadow-lg transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.stats.totalProjects')}</CardTitle>
              <ProjectStatsSVG className="w-8 h-8" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{allProjects.length}</div>
              <p className="text-xs text-gray-500 mt-1">{t('dashboard.stats.activeProjects')}</p>
            </CardContent>
          </Card>
          
          <Card className="group hover:shadow-lg transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.stats.totalRuns')}</CardTitle>
              <RunStatsSVG className="w-8 h-8" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {allProjects.reduce((sum: number, p: any) => sum + p.run_count, 0)}
              </div>
              <p className="text-xs text-gray-500 mt-1">{t('dashboard.stats.totalAnalyses')}</p>
            </CardContent>
          </Card>
          
          <Card className="group hover:shadow-lg transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.stats.activeRuns')}</CardTitle>
              <ActiveRunsSVG className="w-8 h-8" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-600">
                {recentRuns.filter((r: Run) => ['running', 'queued'].includes(r.status)).length}
              </div>
              <p className="text-xs text-gray-500 mt-1">{t('dashboard.stats.currentlyProcessing')}</p>
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
              <CardTitle>{t('dashboard.createProject.title')}</CardTitle>
              <CardDescription>
                {t('dashboard.createProject.subtitle')}
              </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateProject} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="project-name">{t('dashboard.createProject.projectName')}</Label>
                    <Input
                      id="project-name"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder={t('dashboard.enterProjectName')}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="project-description">{t('dashboard.createProject.description')}</Label>
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
                      {t('dashboard.createProject.makePublic')}
                    </Label>
                  </div>
                  <div className="flex space-x-2">
                    <Button 
                      type="submit" 
                      disabled={createProjectMutation.isPending}
                    >
                      {createProjectMutation.isPending ? t('dashboard.createProject.creating') : t('dashboard.createProject.create')}
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setShowCreateProject(false)}
                    >
                      {t('dashboard.createProject.cancel')}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="owned" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="owned" className="flex items-center space-x-2">
                <Crown className="h-4 w-4" />
                <span>My Projects ({ownedProjects.length})</span>
              </TabsTrigger>
              <TabsTrigger value="member" className="flex items-center space-x-2">
                <UserCheck className="h-4 w-4" />
                <span>Member Projects ({memberProjects.length})</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="owned" className="mt-6">
              {ownedProjects.length === 0 ? (
                <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <EmptyProjectsSVG className="w-24 h-24 mb-6" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-3">{t('dashboard.projects.noProjects.title')}</h3>
                    <p className="text-gray-600 text-center mb-6 max-w-md">
                      {t('dashboard.projects.noProjects.message')}
                    </p>
                    <Button onClick={() => setShowCreateProject(true)} size="lg" className="bg-blue-600 hover:bg-blue-700">
                      <Plus className="h-5 w-5 mr-2" />
                      {t('dashboard.projects.createFirst')}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {ownedProjects.map((project: Project) => renderProjectCard(project, true))}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="member" className="mt-6">
              {memberProjects.length === 0 ? (
                <Card className="bg-gradient-to-br from-gray-50 to-slate-50 border-gray-200">
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <UserCheck className="w-24 h-24 mb-6 text-gray-400" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-3">No Member Projects</h3>
                    <p className="text-gray-600 text-center mb-6 max-w-md">
                      You haven't been added as a member to any projects yet. Ask project owners to invite you to their projects.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {memberProjects.map((project: Project) => renderProjectCard(project, false))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Analysis Plugins */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-6">{t('dashboard.plugins.title')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card 
              className="cursor-pointer hover:shadow-lg transition-all duration-300 group border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50"
              onClick={() => router.push('/plugins')}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center space-x-3">
                    <PluginCardSVG className="w-8 h-8" />
                    <span className="text-lg">{t('dashboard.plugins.excelPlugins.title')}</span>
                  </CardTitle>
                </div>
                <CardDescription className="text-gray-600">
                  {t('dashboard.plugins.excelPlugins.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-gray-700">Excel2Boxplot V1</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-gray-700">Excel2Boxplot V2</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-gray-700">Excel2ProcessCapability</span>
                  </div>
                </div>
                <div className="mt-6">
                  <Button variant="outline" className="w-full group-hover:bg-purple-600 group-hover:text-white group-hover:border-purple-600">
                    {t('dashboard.plugins.excelPlugins.viewAll')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-all duration-300 group border-red-200 bg-gradient-to-br from-red-50 to-orange-50"
              onClick={() => router.push('/plugins/excel2boxplotv1')}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center space-x-3">
                    <QuickAnalysisSVG className="w-8 h-8" />
                    <span className="text-lg">{t('dashboard.plugins.quickAnalysis.title')}</span>
                  </CardTitle>
                </div>
                <CardDescription className="text-gray-600">
                  {t('dashboard.plugins.quickAnalysis.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span className="text-sm text-gray-700">Single & Grouped Boxplots</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span className="text-sm text-gray-700">Statistical Insights</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span className="text-sm text-gray-700">Real-time Processing</span>
                  </div>
                </div>
                <div className="mt-6">
                  <Button className="w-full bg-red-600 hover:bg-red-700 group-hover:bg-red-700">
                    {t('dashboard.plugins.quickAnalysis.start')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Runs */}
        {recentRuns.length > 0 && (
          <div>
            <div className="flex items-center space-x-3 mb-6">
              <RecentRunsSVG className="w-8 h-8" />
              <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.recentRuns.title')}</h3>
            </div>
            <div className="space-y-4">
              {recentRuns.slice(0, 5).map((run: Run) => (
                <Card key={run.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center space-x-4">
                      {getStatusIcon(run.status)}
                      <div>
                        <p className="font-medium text-gray-900">{run.task_name}</p>
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

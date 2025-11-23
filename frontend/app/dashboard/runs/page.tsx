'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Search,
  ArrowUpDown,
  ExternalLink,
  BarChart3,
  User
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { projectApi, runApi } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import { useLanguage } from '@/lib/language'
import { LanguageSelector } from '@/components/LanguageSelector'
import { NotificationBell } from '@/components/NotificationCenter'

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

interface Project {
  id: string
  name: string
  description?: string
}

interface RunWithProject extends Run {
  project?: Project
}

export default function RunsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, ready } = useAuth()
  const { t } = useLanguage()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [projectFilter, setProjectFilter] = useState<string>('all')

  // Handle URL parameters for initial filtering
  useEffect(() => {
    const statusParam = searchParams?.get('status')
    if (statusParam) {
      setStatusFilter(statusParam)
    }
  }, [searchParams])

  // Redirect if not authenticated
  useEffect(() => {
    if (!user && ready) {
      router.push('/')
    }
  }, [user, ready, router])

  // Fetch all runs
  const { data: runs = [], isLoading: runsLoading } = useQuery<Run[]>({
    queryKey: ['all-runs'],
    queryFn: () => runApi.getRuns(),
    enabled: !!user && ready,
    refetchInterval: 5000, // Auto-refresh every 5 seconds
    refetchIntervalInBackground: true,
  })

  // Fetch owned projects
  const { data: ownedProjects = [] } = useQuery<Project[]>({
    queryKey: ['owned-projects'],
    queryFn: () => projectApi.getOwnedProjects(),
    enabled: !!user && ready,
  })

  // Fetch member projects
  const { data: memberProjects = [] } = useQuery<Project[]>({
    queryKey: ['member-projects'],
    queryFn: () => projectApi.getMemberProjects(),
    enabled: !!user && ready,
  })

  // Combine all projects
  const allProjects = useMemo(() => [...ownedProjects, ...memberProjects], [ownedProjects, memberProjects])

  // Create project map for quick lookup
  const projectMap = useMemo(() => {
    const map = new Map<string, Project>()
    allProjects.forEach(project => {
      map.set(project.id, project)
    })
    return map
  }, [allProjects])

  // Enrich runs with project information
  const runsWithProjects = useMemo<RunWithProject[]>(() => {
    return runs.map(run => ({
      ...run,
      project: projectMap.get(run.project_id)
    }))
  }, [runs, projectMap])

  // Filter and sort runs
  const filteredRuns = useMemo(() => {
    let filtered = runsWithProjects

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(run =>
        run.task_name.toLowerCase().includes(query) ||
        run.project?.name.toLowerCase().includes(query) ||
        (run.message && run.message.toLowerCase().includes(query))
      )
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      // Handle active runs (running + queued) when coming from dashboard
      if (statusFilter === 'active') {
        filtered = filtered.filter(run => ['running', 'queued'].includes(run.status))
      } else {
        filtered = filtered.filter(run => run.status === statusFilter)
      }
    }

    // Apply project filter
    if (projectFilter !== 'all') {
      filtered = filtered.filter(run => run.project_id === projectFilter)
    }

    // Sort by created_at (newest first) - already sorted by API, but ensure it
    filtered.sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    return filtered
  }, [runsWithProjects, searchQuery, statusFilter, projectFilter])

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
      case 'canceled':
        return <XCircle className="h-4 w-4 text-gray-600" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'succeeded':
        return 'bg-green-100 text-green-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      case 'running':
        return 'bg-blue-100 text-blue-800'
      case 'queued':
        return 'bg-yellow-100 text-yellow-800'
      case 'canceled':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (!user) {
    return null // Will redirect
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <Button 
              variant="outline" 
              onClick={() => router.push('/dashboard')}
              className="flex items-center"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
            <div className="flex items-center space-x-2">
              <NotificationBell />
              <LanguageSelector />
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                All Runs
              </h1>
              <p className="text-gray-600">
                View all runs from your projects and member projects
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search runs by task name, project, or message..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active (Running + Queued)</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="succeeded">Succeeded</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="canceled">Canceled</SelectItem>
                </SelectContent>
              </Select>

              {/* Project Filter */}
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {allProjects.map(project => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Runs List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Runs ({filteredRuns.length})</span>
              <div className="text-sm font-normal text-gray-500">
                Sorted by newest first
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {runsLoading ? (
              <div className="text-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600">Loading runs...</p>
              </div>
            ) : filteredRuns.length === 0 ? (
              <div className="text-center py-12">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 text-lg font-medium mb-2">
                  {searchQuery || statusFilter !== 'all' || projectFilter !== 'all'
                    ? 'No runs match your filters'
                    : 'No runs found'}
                </p>
                <p className="text-gray-500 text-sm">
                  {searchQuery || statusFilter !== 'all' || projectFilter !== 'all'
                    ? 'Try adjusting your search or filters'
                    : 'Start an analysis to see runs here'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredRuns.map((run) => (
                  <div
                    key={run.id}
                    className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3 mb-2">
                          {getStatusIcon(run.status)}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 truncate">
                              {run.task_name}
                            </h3>
                            {run.message && (
                              <p className="text-sm text-gray-600 mt-1 truncate">
                                {run.message}
                              </p>
                            )}
                          </div>
                          <Badge className={getStatusColor(run.status)}>
                            {run.status}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-sm">
                          {/* Project Information */}
                          <div>
                            <p className="text-gray-500 mb-1">Project</p>
                            {run.project ? (
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-gray-900">
                                  {run.project.name}
                                </span>
                                <span className="text-gray-400">•</span>
                                <span className="text-gray-500 font-mono text-xs">
                                  {run.project_id}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2"
                                  onClick={() => router.push(`/projects/${run.project_id}`)}
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  View
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-2">
                                <span className="text-gray-500 italic">
                                  Project not found
                                </span>
                                <span className="text-gray-400">•</span>
                                <span className="text-gray-500 font-mono text-xs">
                                  {run.project_id}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Created By User */}
                          <div>
                            <p className="text-gray-500 mb-1">Created By</p>
                            <div className="flex items-center space-x-2">
                              <User className="h-3 w-3 text-gray-400" />
                              {run.started_by_email ? (
                                <span className="text-gray-900">
                                  {run.started_by_email}
                                  {run.started_by_is_guest && (
                                    <span className="text-gray-500 text-xs ml-1">(Guest)</span>
                                  )}
                                </span>
                              ) : run.started_by ? (
                                <span className="text-gray-500 italic text-xs">
                                  User ID: {run.started_by}
                                </span>
                              ) : (
                                <span className="text-gray-500 italic">
                                  System / Unknown
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Run Information */}
                          <div>
                            <p className="text-gray-500 mb-1">Created</p>
                            <p className="text-gray-900">
                              {formatDateTime(run.created_at)}
                            </p>
                          </div>

                          {/* Image Count */}
                          <div>
                            <p className="text-gray-500 mb-1">Images</p>
                            <p className="text-gray-900">{run.image_count}</p>
                          </div>

                          {/* Timing Information */}
                          {run.started_at && (
                            <div>
                              <p className="text-gray-500 mb-1">Started</p>
                              <p className="text-gray-900">
                                {formatDateTime(run.started_at)}
                              </p>
                            </div>
                          )}
                          {run.finished_at && (
                            <div>
                              <p className="text-gray-500 mb-1">Finished</p>
                              <p className="text-gray-900">
                                {formatDateTime(run.finished_at)}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Workflow, Play, Trash2, Edit, List } from 'lucide-react'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface Workspace {
  id: string
  name: string
  description: string | null
}

interface Workflow {
  id: string
  name: string
  description: string | null
  status: string
  created_at: string
  updated_at: string
}

export default function WorkspaceDetailPage() {
  const router = useRouter()
  const params = useParams()
  const workspaceId = params.workspaceId as string
  const queryClient = useQueryClient()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isAllWorkflowsOpen, setIsAllWorkflowsOpen] = useState(false)
  const [workflowName, setWorkflowName] = useState('')
  const [workflowDescription, setWorkflowDescription] = useState('')

  const { data: workspace } = useQuery<Workspace>({
    queryKey: ['workspace', workspaceId],
    queryFn: async () => {
      return apiClient.get(`/v1/workspaces/${workspaceId}`)
    }
  })

  const { data: workflows } = useQuery<Workflow[]>({
    queryKey: ['workflows', workspaceId],
    queryFn: async () => {
      return apiClient.get(`/v1/workspaces/${workspaceId}/workflows`)
    }
  })

  const { data: allWorkflows } = useQuery<Workflow[]>({
    queryKey: ['all-workflows'],
    queryFn: async () => {
      return apiClient.get<Workflow[]>('/v1/workflows')
    },
    enabled: isAllWorkflowsOpen, // Only fetch when dialog is open
  })

  const createMutation = useMutation<Workflow, Error, { name: string; description?: string }>({
    mutationFn: async (data: { name: string; description?: string }) => {
      // First create the workflow independently
      const workflow = await apiClient.post<Workflow>('/v1/workflows', data)
      // Then add it to this workspace
      await apiClient.post(`/v1/workspaces/${workspaceId}/workflows/${workflow.id}`)
      return workflow
    },
    onSuccess: (workflow: Workflow) => {
      queryClient.invalidateQueries({ queryKey: ['workflows', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['all-workflows'] })
      setIsCreateOpen(false)
      setWorkflowName('')
      setWorkflowDescription('')
      toast.success('Workflow created and added to workspace')
      router.push(`/workspace/${workspaceId}/workflow/${workflow.id}`)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const addWorkflowMutation = useMutation({
    mutationFn: async (workflowId: string) => {
      return apiClient.post(`/v1/workspaces/${workspaceId}/workflows/${workflowId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['all-workflows'] })
      toast.success('Workflow added to workspace')
      setIsAllWorkflowsOpen(false)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const executeMutation = useMutation({
    mutationFn: async (workflowId: string) => {
      return apiClient.post(`/v1/workflows/${workflowId}/execute`)
    },
    onSuccess: () => {
      toast.success('Workflow execution started')
      queryClient.invalidateQueries({ queryKey: ['workflows', workspaceId] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const handleCreate = () => {
    createMutation.mutate({
      name: workflowName,
      description: workflowDescription || undefined
    })
  }

  const handleExecute = (workflowId: string) => {
    executeMutation.mutate(workflowId)
  }

  if (!workspace) {
    return <div className="container mx-auto p-8">Loading...</div>
  }

  return (
    <div className="container mx-auto p-8">
      <div className="mb-8">
        <Link href="/workspace" className="text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Workspaces
        </Link>
        <h1 className="text-3xl font-bold">{workspace.name}</h1>
        <p className="text-gray-600 mt-2">{workspace.description || 'No description'}</p>
      </div>

      <Tabs defaultValue="workflows" className="w-full">
        <div className="flex justify-between items-center mb-4">
          <TabsList>
            <TabsTrigger value="workflows">Workflows</TabsTrigger>
            <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
          </TabsList>
          <div className="flex space-x-2">
            <Dialog open={isAllWorkflowsOpen} onOpenChange={setIsAllWorkflowsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <List className="mr-2 h-4 w-4" />
                  All Workflows
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>All Workflows</DialogTitle>
                  <DialogDescription>
                    Browse all workflows across all workspaces
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {allWorkflows?.map((workflow) => {
                    // Check if workflow is already in this workspace
                    // Since workflows can be in multiple workspaces, we need to check the workspace's workflows list
                    const isInWorkspace = workflows?.some(w => w.id === workflow.id) || false
                    
                    return (
                      <Card key={workflow.id} className="hover:shadow-lg transition-shadow">
                        <CardHeader>
                          <Workflow className="h-6 w-6 text-purple-600 mb-2" />
                          <CardTitle className="text-lg">{workflow.name}</CardTitle>
                          <CardDescription>
                            {workflow.description || 'No description'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500 capitalize">
                              Status: {workflow.status}
                            </span>
                            <div className="flex space-x-2">
                              {isInWorkspace ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setIsAllWorkflowsOpen(false)
                                    router.push(`/workspace/${workspaceId}/workflow/${workflow.id}`)
                                  }}
                                >
                                  Open
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    addWorkflowMutation.mutate(workflow.id)
                                  }}
                                  disabled={addWorkflowMutation.isPending}
                                >
                                  Add to Workspace
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
                {allWorkflows?.length === 0 && (
                  <div className="text-center py-8">
                    <Workflow className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No workflows found</p>
                  </div>
                )}
              </DialogContent>
            </Dialog>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Workflow
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Workflow</DialogTitle>
                <DialogDescription>
                  Create a new workflow with a node-based editor.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={workflowName}
                    onChange={(e) => setWorkflowName(e.target.value)}
                    placeholder="My Workflow"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description (optional)</Label>
                  <Input
                    id="description"
                    value={workflowDescription}
                    onChange={(e) => setWorkflowDescription(e.target.value)}
                    placeholder="Description of your workflow"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={!workflowName || createMutation.isPending}>
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <TabsContent value="workflows">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workflows?.map((workflow) => (
              <Card key={workflow.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <Workflow className="h-8 w-8 text-purple-600 mb-2" />
                  <CardTitle>{workflow.name}</CardTitle>
                  <CardDescription>
                    {workflow.description || 'No description'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 capitalize">
                      Status: {workflow.status}
                    </span>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleExecute(workflow.id)}
                        disabled={executeMutation.isPending}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => router.push(`/workspace/${workspaceId}/workflow/${workflow.id}`)}
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {workflows?.length === 0 && (
            <div className="text-center py-12">
              <Workflow className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">No workflows yet</p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Workflow
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="artifacts">
          <div className="text-center py-12">
            <p className="text-gray-600">Artifacts will appear here after workflow execution</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}


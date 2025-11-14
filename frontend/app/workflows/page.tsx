'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Workflow, Edit, Play, Calendar, Trash2 } from 'lucide-react'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'

interface Workflow {
  id: string
  name: string
  description: string | null
  status: string
  created_at: string
  updated_at: string
  last_run_at: string | null
}

export default function WorkflowsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [workflowName, setWorkflowName] = useState('')
  const [workflowDescription, setWorkflowDescription] = useState('')
  const [deleteWorkflowId, setDeleteWorkflowId] = useState<string | null>(null)

  const { data: workflows, isLoading } = useQuery<Workflow[]>({
    queryKey: ['all-workflows'],
    queryFn: async () => {
      return apiClient.get<Workflow[]>('/v1/workflows')
    }
  })

  const createMutation = useMutation<Workflow, Error, { name: string; description?: string }>({
    mutationFn: async (data: { name: string; description?: string }) => {
      return apiClient.post<Workflow>('/v1/workflows', data)
    },
    onSuccess: (workflow: Workflow) => {
      queryClient.invalidateQueries({ queryKey: ['all-workflows'] })
      setIsCreateOpen(false)
      setWorkflowName('')
      setWorkflowDescription('')
      toast.success('Workflow created successfully')
      // Navigate to the direct workflow editor (workflows are independent)
      router.push(`/workflow/${workflow.id}`)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (workflowId: string) => {
      return apiClient.delete(`/v1/workflows/${workflowId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-workflows'] })
      setDeleteWorkflowId(null)
      toast.success('Workflow deleted successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete workflow')
    }
  })

  const handleCreate = () => {
    if (!workflowName.trim()) {
      toast.error('Workflow name is required')
      return
    }
    createMutation.mutate({
      name: workflowName,
      description: workflowDescription || undefined
    })
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'paused':
        return 'bg-yellow-100 text-yellow-800'
      case 'draft':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-blue-100 text-blue-800'
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-8">
        <div className="text-center">Loading workflows...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Workflows</h1>
          <p className="text-gray-600 mt-2">Create and manage your data analysis workflows</p>
        </div>
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
                Create a new workflow to build your data analysis pipeline.
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workflows?.map((workflow) => (
          <Card key={workflow.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <Workflow className="h-8 w-8 text-indigo-600 mb-2" />
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/workflow/${workflow.id}`)}
                    title="Edit workflow"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteWorkflowId(workflow.id)}
                    title="Delete workflow"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <CardTitle>{workflow.name}</CardTitle>
              <CardDescription>
                {workflow.description || 'No description'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Status</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(workflow.status)}`}>
                    {workflow.status}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Created</span>
                  <span className="text-xs text-gray-600 flex items-center">
                    <Calendar className="h-3 w-3 mr-1" />
                    {formatDate(workflow.created_at)}
                  </span>
                </div>
                {workflow.last_run_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Last Run</span>
                    <span className="text-xs text-gray-600 flex items-center">
                      <Play className="h-3 w-3 mr-1" />
                      {formatDate(workflow.last_run_at)}
                    </span>
                  </div>
                )}
                <div className="pt-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push(`/workflow/${workflow.id}`)}
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    Edit Workflow
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteWorkflowId !== null} onOpenChange={(open) => !open && setDeleteWorkflowId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Workflow</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this workflow? This action cannot be undone.
              Files in the workflow folder will be deleted, but subfolders and JSON files will be preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteWorkflowId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteWorkflowId) {
                  deleteMutation.mutate(deleteWorkflowId)
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


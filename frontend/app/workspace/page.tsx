'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Folder, Trash2, Edit, Play } from 'lucide-react'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'

interface Workspace {
  id: string
  name: string
  description: string | null
  owner_id: string | null
  is_public: boolean
  created_at: string
  updated_at: string
}

export default function WorkspacesPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceDescription, setWorkspaceDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)

  const { data: workspaces, isLoading } = useQuery<Workspace[]>({
    queryKey: ['workspaces'],
    queryFn: async () => {
      return apiClient.get('/v1/workspaces')
    }
  })

  const createMutation = useMutation<Workspace, Error, { name: string; description?: string; is_public: boolean }>({
    mutationFn: async (data: { name: string; description?: string; is_public: boolean }) => {
      return apiClient.post<Workspace>('/v1/workspaces', data)
    },
    onSuccess: (workspace: Workspace) => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      setIsCreateOpen(false)
      setWorkspaceName('')
      setWorkspaceDescription('')
      setIsPublic(false)
      toast.success('Workspace created successfully')
      router.push(`/workspace/${workspace.id}`)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      return apiClient.delete(`/v1/workspaces/${workspaceId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      toast.success('Workspace deleted')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const handleCreate = () => {
    createMutation.mutate({
      name: workspaceName,
      description: workspaceDescription || undefined,
      is_public: isPublic
    })
  }

  const handleDelete = (workspaceId: string) => {
    if (confirm('Are you sure you want to delete this workspace?')) {
      deleteMutation.mutate(workspaceId)
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-8">
        <div className="text-center">Loading workspaces...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Workspaces</h1>
          <p className="text-gray-600 mt-2">Create and manage your data analysis workspaces</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Workspace
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Workspace</DialogTitle>
              <DialogDescription>
                Create a new workspace to organize your workflows and data analysis.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="My Workspace"
                />
              </div>
              <div>
                <Label htmlFor="description">Description (optional)</Label>
                <Input
                  id="description"
                  value={workspaceDescription}
                  onChange={(e) => setWorkspaceDescription(e.target.value)}
                  placeholder="Description of your workspace"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_public"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="is_public">Make workspace public</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!workspaceName || createMutation.isPending}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workspaces?.map((workspace) => (
          <Card key={workspace.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <Folder className="h-8 w-8 text-blue-600 mb-2" />
                <div className="flex space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/workspace/${workspace.id}`)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(workspace.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <CardTitle>{workspace.name}</CardTitle>
              <CardDescription>
                {workspace.description || 'No description'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  {workspace.is_public ? 'Public' : 'Private'}
                </span>
                <Button
                  size="sm"
                  onClick={() => router.push(`/workspace/${workspace.id}`)}
                >
                  Open
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {workspaces?.length === 0 && (
        <div className="text-center py-12">
          <Folder className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">No workspaces yet</p>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Your First Workspace
          </Button>
        </div>
      )}
    </div>
  )
}


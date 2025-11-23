'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Workflow, Edit, Play, Calendar, Trash2, Check, X } from 'lucide-react'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'
import { TopNavBar } from '@/components/TopNavBar'
import { UniverseBackground } from '@/components/UniverseBackground'

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
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null)
  const [editingWorkflowName, setEditingWorkflowName] = useState('')

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

  const updateMutation = useMutation<Workflow, Error, { workflowId: string; name: string }>({
    mutationFn: async ({ workflowId, name }: { workflowId: string; name: string }) => {
      return apiClient.put<Workflow>(`/v1/workflows/${workflowId}`, { name })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-workflows'] })
      setEditingWorkflowId(null)
      setEditingWorkflowName('')
      toast.success('Workflow name updated successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update workflow name')
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

  const handleStartEdit = (workflow: Workflow) => {
    setEditingWorkflowId(workflow.id)
    setEditingWorkflowName(workflow.name)
  }

  const handleCancelEdit = () => {
    setEditingWorkflowId(null)
    setEditingWorkflowName('')
  }

  const handleSaveEdit = (workflowId: string) => {
    if (!editingWorkflowName.trim()) {
      toast.error('Workflow name cannot be empty')
      return
    }
    updateMutation.mutate({ workflowId, name: editingWorkflowName.trim() })
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
        return 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 border border-green-200'
      case 'paused':
        return 'bg-gradient-to-r from-yellow-100 to-amber-100 text-yellow-800 border border-yellow-200'
      case 'draft':
        return 'bg-gradient-to-r from-gray-100 to-slate-100 text-gray-800 border border-gray-200'
      default:
        return 'bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-800 border border-blue-200'
    }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.1,
      },
    },
  }

  const cardVariants = {
    hidden: {
      opacity: 0,
      y: 20,
      scale: 0.95,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 15,
      },
    },
    hover: {
      y: -8,
      scale: 1.02,
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 17,
      },
    },
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-8 min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="inline-block mb-4"
          >
            <Workflow className="h-12 w-12 text-indigo-500" />
          </motion.div>
          <p className="text-gray-600 text-lg">Loading workflows...</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <UniverseBackground />
      <TopNavBar />
      <div className="relative z-10 container mx-auto px-6 md:px-8 lg:px-12 pb-6 md:pb-8 lg:pb-12 max-w-screen-2xl pt-40">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 md:mb-12 gap-6"
        >
          <div className="space-y-3">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-3"
            >
              <motion.div
                whileHover={{ rotate: 15, scale: 1.1 }}
                className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg shadow-indigo-500/20"
              >
                <Workflow className="h-7 w-7 text-white" />
              </motion.div>
              <h1 className="text-4xl md:text-5xl font-bold text-white">
                Workflows
              </h1>
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-white/90 text-lg md:text-xl font-medium"
            >
              Create and manage your data analysis workflows
            </motion.p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button className="rounded-full px-6 py-6 h-auto bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 transition-all duration-300 text-white font-semibold">
                  <Plus className="mr-2 h-5 w-5" />
                  New Workflow
                </Button>
              </motion.div>
            </DialogTrigger>
            <DialogContent className="rounded-3xl border-0 shadow-2xl bg-white/95 backdrop-blur-xl">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  Create Workflow
                </DialogTitle>
                <DialogDescription className="text-gray-600 text-base">
                  Create a new workflow to build your data analysis pipeline.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-semibold text-gray-700">Name</Label>
                  <Input
                    id="name"
                    value={workflowName}
                    onChange={(e) => setWorkflowName(e.target.value)}
                    placeholder="My Workflow"
                    className="rounded-xl border-2 border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all duration-200 h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-semibold text-gray-700">Description (optional)</Label>
                  <Input
                    id="description"
                    value={workflowDescription}
                    onChange={(e) => setWorkflowDescription(e.target.value)}
                    placeholder="Description of your workflow"
                    className="rounded-xl border-2 border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all duration-200 h-12"
                  />
                </div>
              </div>
              <DialogFooter className="gap-3">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-full px-6 border-2 hover:bg-gray-50 transition-all duration-200"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!workflowName || createMutation.isPending}
                  className="rounded-full px-6 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-indigo-500/30 transition-all duration-200"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8"
        >
          <AnimatePresence mode="popLayout">
            {workflows?.map((workflow, index) => (
              <motion.div
                key={workflow.id}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                whileHover="hover"
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                layout
              >
                <Card className="group relative overflow-hidden rounded-3xl border border-white/30 bg-white/50 backdrop-blur-xl shadow-lg shadow-gray-200/50 hover:shadow-2xl hover:shadow-indigo-500/20 transition-all duration-300 h-full flex flex-col">
                  {/* Gradient overlay on hover */}
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/0 via-purple-500/0 to-pink-500/0 group-hover:from-indigo-500/5 group-hover:via-purple-500/5 group-hover:to-pink-500/5 transition-all duration-500 pointer-events-none" />

                  <CardHeader className="relative z-10 pb-4">
                    <div className="flex items-start justify-between mb-3">
                      <motion.div
                        whileHover={{ rotate: [0, -10, 10, -10, 0], scale: 1.1 }}
                        transition={{ duration: 0.5 }}
                        className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg shadow-indigo-500/30"
                      >
                        <Workflow className="h-6 w-6 text-white" />
                      </motion.div>
                      <div className="flex gap-2">
                        {editingWorkflowId === workflow.id ? (
                          <>
                            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSaveEdit(workflow.id)}
                                title="Save"
                                disabled={updateMutation.isPending}
                                className="rounded-full h-9 w-9 p-0 text-green-600 hover:text-green-700 hover:bg-green-50/80 transition-all duration-200"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                            </motion.div>
                            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCancelEdit}
                                title="Cancel"
                                disabled={updateMutation.isPending}
                                className="rounded-full h-9 w-9 p-0 text-gray-600 hover:text-gray-700 hover:bg-gray-50/80 transition-all duration-200"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </motion.div>
                          </>
                        ) : (
                          <>
                            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.push(`/workflow/${workflow.id}`)}
                                title="Edit workflow"
                                className="rounded-full h-9 w-9 p-0 hover:bg-indigo-50/80 transition-all duration-200"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </motion.div>
                            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteWorkflowId(workflow.id)}
                                title="Delete workflow"
                                className="rounded-full h-9 w-9 p-0 text-red-600 hover:text-red-700 hover:bg-red-50/80 transition-all duration-200"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </motion.div>
                          </>
                        )}
                      </div>
                    </div>
                    {editingWorkflowId === workflow.id ? (
                      <Input
                        value={editingWorkflowName}
                        onChange={(e) => setEditingWorkflowName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveEdit(workflow.id)
                          } else if (e.key === 'Escape') {
                            handleCancelEdit()
                          }
                        }}
                        className="text-lg font-semibold h-auto py-2 rounded-xl border-2 border-indigo-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all duration-200"
                        autoFocus
                        disabled={updateMutation.isPending}
                      />
                    ) : (
                      <CardTitle
                        className="cursor-pointer hover:text-indigo-600 transition-colors duration-200 text-xl font-bold mb-2 group-hover:bg-gradient-to-r group-hover:from-indigo-600 group-hover:to-purple-600 group-hover:bg-clip-text group-hover:text-transparent"
                        onClick={() => handleStartEdit(workflow)}
                        title="Click to edit name"
                      >
                        {workflow.name}
                      </CardTitle>
                    )}
                    <CardDescription className="text-gray-600 text-sm mt-1">
                      {workflow.description || 'No description'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="relative z-10 flex-1 flex flex-col">
                    <div className="space-y-4 flex-1">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50/50 backdrop-blur-sm">
                        <span className="text-sm font-medium text-gray-600">Status</span>
                        <motion.span
                          whileHover={{ scale: 1.05 }}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-full ${getStatusColor(workflow.status)} shadow-sm`}
                        >
                          {workflow.status}
                        </motion.span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50/50 backdrop-blur-sm">
                        <span className="text-sm font-medium text-gray-600">Created</span>
                        <span className="text-xs text-gray-700 flex items-center font-medium">
                          <Calendar className="h-3.5 w-3.5 mr-1.5 text-indigo-500" />
                          {formatDate(workflow.created_at)}
                        </span>
                      </div>
                      {workflow.last_run_at && (
                        <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50/50 backdrop-blur-sm">
                          <span className="text-sm font-medium text-gray-600">Last Run</span>
                          <span className="text-xs text-gray-700 flex items-center font-medium">
                            <Play className="h-3.5 w-3.5 mr-1.5 text-purple-500" />
                            {formatDate(workflow.last_run_at)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="pt-4 mt-4 border-t border-gray-200/50">
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="relative"
                      >
                        <Button
                          size="sm"
                          className="w-full rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold transition-all duration-300 shadow-lg shadow-indigo-500/40 hover:shadow-xl hover:shadow-indigo-500/50 border-0"
                          onClick={() => router.push(`/workflow/${workflow.id}`)}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Workflow
                        </Button>
                      </motion.div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>

        <AnimatePresence>
          {workflows?.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center py-20 md:py-32"
            >
              <motion.div
                animate={{
                  y: [0, -10, 0],
                  rotate: [0, 5, -5, 0],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="mb-6"
              >
                <div className="relative inline-block">
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-400 to-purple-400 rounded-3xl blur-2xl opacity-30 animate-pulse" />
                  <div className="relative p-6 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-3xl">
                    <Workflow className="h-20 w-20 text-indigo-600 mx-auto" />
                  </div>
                </div>
              </motion.div>
              <motion.h3
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-2xl md:text-3xl font-bold text-gray-800 mb-3"
              >
                No workflows yet
              </motion.h3>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-gray-600 mb-8 text-lg"
              >
                Get started by creating your first workflow
              </motion.p>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <Button
                  onClick={() => setIsCreateOpen(true)}
                  className="rounded-full px-8 py-6 h-auto bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 transition-all duration-300 text-white font-semibold text-lg"
                >
                  <Plus className="mr-2 h-5 w-5" />
                  Create Your First Workflow
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteWorkflowId !== null} onOpenChange={(open) => !open && setDeleteWorkflowId(null)}>
          <DialogContent className="rounded-3xl border-0 shadow-2xl bg-white/95 backdrop-blur-xl">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold text-red-600 flex items-center gap-2">
                  <Trash2 className="h-6 w-6" />
                  Delete Workflow
                </DialogTitle>
                <DialogDescription className="text-gray-600 text-base mt-2">
                  Are you sure you want to delete this workflow? This action cannot be undone.
                  Files in the workflow folder will be deleted, but subfolders and JSON files will be preserved.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setDeleteWorkflowId(null)}
                  className="rounded-full px-6 border-2 hover:bg-gray-50 transition-all duration-200"
                >
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
                  className="rounded-full px-6 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-lg shadow-red-500/30 transition-all duration-200"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </Button>
              </DialogFooter>
            </motion.div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}


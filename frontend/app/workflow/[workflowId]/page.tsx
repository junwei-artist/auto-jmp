'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Play, Plus, Save, ArrowLeft } from 'lucide-react'
import { apiClient } from '@/lib/api'
import toast from 'react-hot-toast'
import Link from 'next/link'
import NodeEditorView from '@/components/workspace/NodeEditorView'

interface Workflow {
  id: string
  workspace_id: string | null  // Optional: workflow can be in multiple workspaces or none
  name: string
  description: string | null
  status: string
  graph_data: any
}

interface Node {
  id: string
  workflow_id: string
  module_type: string
  module_id: string
  position_x: number
  position_y: number
  config: any
  state: any
}

interface Connection {
  id: string
  workflow_id: string
  source_node_id: string
  target_node_id: string
  source_port: string
  target_port: string
}

interface Module {
  module_type: string
  display_name: string
  description: string
  inputs: Array<{ name: string; type: string; label: string }>
  outputs: Array<{ name: string; type: string; label: string }>
}

export default function WorkflowEditorPage() {
  const router = useRouter()
  const params = useParams()
  const workflowId = params.workflowId as string
  const queryClient = useQueryClient()

  const { data: workflow } = useQuery<Workflow>({
    queryKey: ['workflow', workflowId],
    queryFn: async () => {
      return apiClient.get(`/v1/workflows/${workflowId}`)
    }
  })

  const { data: nodes } = useQuery<Node[]>({
    queryKey: ['workflow-nodes', workflowId],
    queryFn: async () => {
      return apiClient.get<Node[]>(`/v1/workflows/${workflowId}/nodes`)
    }
  })

  const { data: connections } = useQuery<Connection[]>({
    queryKey: ['workflow-connections', workflowId],
    queryFn: async () => {
      return apiClient.get<Connection[]>(`/v1/workflows/${workflowId}/connections`)
    }
  })

  const { data: modules } = useQuery<Module[]>({
    queryKey: ['modules'],
    queryFn: async () => {
      return apiClient.get('/v1/modules')
    }
  })

  const executeMutation = useMutation({
    mutationFn: async () => {
      return apiClient.post(`/v1/workflows/${workflowId}/execute`)
    },
    onSuccess: () => {
      toast.success('Workflow execution started')
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })

  const handleExecute = () => {
    executeMutation.mutate()
  }

  if (!workflow) {
    return <div className="container mx-auto p-8">Loading...</div>
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="border-b bg-white p-4">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/workflows">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold">{workflow.name}</h1>
              <p className="text-sm text-gray-600">{workflow.description || 'No description'}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={handleExecute} disabled={executeMutation.isPending}>
              <Play className="h-4 w-4 mr-2" />
              Execute
            </Button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <NodeEditorView
          workflowId={workflowId}
          workspaceId={workflow.workspace_id || ''}  // Pass empty string if no workspace
          nodes={nodes || []}
          connections={connections || []}
          modules={modules || []}
        />
      </div>
    </div>
  )
}


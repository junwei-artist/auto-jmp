'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowLeft, Loader2, FolderOpen, Plus, Workflow, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useState, useEffect, Suspense } from 'react'
import toast from 'react-hot-toast'
import ExcelToNumericWizard from '@/components/workspace/node-embedded/ExcelToNumericWizard'
import FileUploaderWizard from '@/components/workspace/node-embedded/FileUploaderWizard'
import ExcelViewerWizard from '@/components/workspace/node-embedded/ExcelViewerWizard'
import OutlierRemoverWizard from '@/components/workspace/node-embedded/OutlierRemoverWizard'
import OutlierRemoverGUI from '@/components/workspace/node-embedded/OutlierRemoverGUI'
import DuckDBConvertWizard from '@/components/workspace/node-embedded/DuckDBConvertWizard'
import DuckDBConvertGUI from '@/components/workspace/node-embedded/DuckDBConvertGUI'
import Excel2JMPGUI from '@/components/workspace/node-embedded/Excel2JMPGUI'

interface Module {
  module_type: string
  display_name: string
  description: string
  inputs: Array<{ 
    name: string
    type: string
    label: string
    description?: string
    required?: boolean
  }>
  outputs: Array<{ 
    name: string
    type: string
    label: string
    description?: string
  }>
  config_schema?: any
}

function ModuleRunnerPageContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const moduleType = params.moduleType as string
  
  // Read workflow and node from URL params
  const urlWorkflowId = searchParams.get('workflow')
  const urlNodeId = searchParams.get('node')
  
  const [wizardOpen, setWizardOpen] = useState(true)
  const [tempWorkflowId, setTempWorkflowId] = useState<string | null>(urlWorkflowId)
  const [tempNodeId, setTempNodeId] = useState<string | null>(urlNodeId)
  const [showWorkflowSelector, setShowWorkflowSelector] = useState(!urlWorkflowId || !urlNodeId)  // Show selector if no URL params
  const [showNodeSelector, setShowNodeSelector] = useState(false)  // Show node selector after workflow selection
  const [availableNodes, setAvailableNodes] = useState<Array<{ id: string; module_type: string; checkpoint_name?: string }>>([])
  const [workflowSelected, setWorkflowSelected] = useState(!!urlWorkflowId)  // Track if workflow is selected
  const [nodeCreated, setNodeCreated] = useState(!!urlNodeId)  // Track if node is created
  const [showWorkflowDialog, setShowWorkflowDialog] = useState(false)  // Control workflow selection dialog

  // Get storage key for this module type
  const getStorageKey = (key: string) => `standalone_module_${moduleType}_${key}`

  // Update URL with workflow and node IDs
  const updateUrl = (workflowId: string | null, nodeId: string | null) => {
    if (workflowId && nodeId) {
      const newUrl = `/modules/${moduleType}?workflow=${workflowId}&node=${nodeId}`
      // Use replace to avoid adding to history, but ensure navigation happens
      router.replace(newUrl)
    } else {
      const newUrl = `/modules/${moduleType}`
      router.replace(newUrl)
    }
  }

  // Create node for a workflow
  const createNodeForWorkflow = async (workflowId: string) => {
    try {
      const node = await apiClient.post<{ id: string }>(`/v1/workflows/${workflowId}/nodes`, {
        module_type: moduleType,
        module_id: moduleType,
        checkpoint_name: moduleType
      })
      
      setTempNodeId(node.id)
      setNodeCreated(true)
      
      // Update URL
      updateUrl(workflowId, node.id)
      
      // Persist to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(getStorageKey('nodeId'), node.id)
      }
      
      toast.success('Node created successfully')
    } catch (error: any) {
      toast.error(`Failed to create node: ${error.message || 'Unknown error'}`)
    }
  }

  // Create a workflow (without node)
  const createWorkflowMutation = useMutation({
    mutationFn: async () => {
      const workflow = await apiClient.post<{ id: string }>('/v1/workflows', {
        name: `Standalone ${moduleType} - ${new Date().toLocaleString()}`,
        description: `Temporary workflow for standalone ${moduleType} execution`
      })
      return { workflowId: workflow.id }
    },
    onSuccess: async (data) => {
      setTempWorkflowId(data.workflowId)
      setWorkflowSelected(true)
      setShowWorkflowSelector(false)
      
      // Persist to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(getStorageKey('workflowId'), data.workflowId)
      }
      
      // Create node after workflow is created
      await createNodeForWorkflow(data.workflowId)
      // URL will be updated in createNodeForWorkflow
    },
    onError: (error: any) => {
      toast.error(`Failed to create workflow: ${error.message || 'Unknown error'}`)
    }
  })

  // Reset to workflow selector
  const handleResetWorkflow = () => {
    setTempWorkflowId(null)
    setTempNodeId(null)
    setWorkflowSelected(false)
    setNodeCreated(false)
    setShowWorkflowSelector(true)
    setShowNodeSelector(false)
    setAvailableNodes([])
    
    // Update URL to remove params
    updateUrl(null, null)
    
    // Clear localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem(getStorageKey('workflowId'))
      localStorage.removeItem(getStorageKey('nodeId'))
    }
  }

  // Create workflow with file (for "Open File with New Workflow")
  const createWorkflowWithFileMutation = useMutation({
    mutationFn: async (file: File) => {
      const workflow = await apiClient.post<{ id: string }>('/v1/workflows', {
        name: `Standalone ${moduleType} - ${file.name}`,
        description: `Temporary workflow for standalone ${moduleType} execution`
      })
      
      // Create node
      const node = await apiClient.post<{ id: string }>(`/v1/workflows/${workflow.id}/nodes`, {
        module_type: moduleType,
        module_id: moduleType,
        checkpoint_name: moduleType
      })
      
      return { workflowId: workflow.id, nodeId: node.id, file }
    },
    onSuccess: async (data) => {
      // Small delay to ensure folder structure is fully created
      await new Promise(resolve => setTimeout(resolve, 100))
      
      try {
        const formData = new FormData()
        formData.append('file', data.file)
        
        await apiClient.post(`/v1/workflows/${data.workflowId}/nodes/${data.nodeId}/upload`, formData)
        
        // Update URL in current window
        updateUrl(data.workflowId, data.nodeId)
        
        // Open in new window/tab
        const newUrl = `/modules/${moduleType}?workflow=${data.workflowId}&node=${data.nodeId}`
        window.open(newUrl, '_blank')
        
        toast.success(`New workflow created and file "${data.file.name}" uploaded to input folder`)
      } catch (error: any) {
        console.error('Failed to upload file:', error)
        toast.error(`Failed to upload file: ${error.message || 'Unknown error'}`)
      }
    },
    onError: (error: any) => {
      toast.error(`Failed to create workflow: ${error.message || 'Unknown error'}`)
    }
  })

  // Create a temporary workflow and node for standalone execution (legacy - kept for compatibility)
  const createTempWorkflowMutation = useMutation({
    mutationFn: async (file?: File) => {
      // Create a temporary workflow
      const workflow = await apiClient.post<{ id: string }>('/v1/workflows', {
        name: `Standalone ${moduleType} - ${file ? file.name : new Date().toLocaleString()}`,
        description: `Temporary workflow for standalone ${moduleType} execution`
      })
      
      // Create a node in the workflow
      const node = await apiClient.post<{ id: string }>(`/v1/workflows/${workflow.id}/nodes`, {
        module_type: moduleType,
        module_id: moduleType,
        checkpoint_name: moduleType
      })
      
      return { workflowId: workflow.id, nodeId: node.id, file }
    },
    onSuccess: async (data) => {
      setTempWorkflowId(data.workflowId)
      setTempNodeId(data.nodeId)
      
      // Persist to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(getStorageKey('workflowId'), data.workflowId)
        localStorage.setItem(getStorageKey('nodeId'), data.nodeId)
      }
      
      // If a file was provided, upload it to the new workflow/node
      if (data.file) {
        try {
          // Small delay to ensure folder structure is fully created
          await new Promise(resolve => setTimeout(resolve, 100))
          
          const formData = new FormData()
          formData.append('file', data.file)
          
          const uploadResult = await apiClient.post(`/v1/workflows/${data.workflowId}/nodes/${data.nodeId}/upload`, formData)
          
          console.log('File uploaded successfully:', uploadResult)
          
          // Open in new window/tab
          const newUrl = `/modules/${moduleType}?workflow=${data.workflowId}&node=${data.nodeId}`
          window.open(newUrl, '_blank')
          
          toast.success(`New workflow created and file "${data.file.name}" uploaded to input folder`)
        } catch (error: any) {
          console.error('Failed to upload file:', error)
          toast.error(`Failed to upload file: ${error.message || 'Unknown error'}`)
        }
      }
    },
    onError: (error: any) => {
      toast.error(`Failed to initialize module: ${error.message || 'Unknown error'}`)
    }
  })

  // Load workflow/node from URL params on mount or when URL changes
  useEffect(() => {
    if (urlWorkflowId && urlNodeId) {
      // Only load if state doesn't match URL params
      if (tempWorkflowId !== urlWorkflowId || tempNodeId !== urlNodeId) {
        // Verify the workflow and node exist
        apiClient.get(`/v1/workflows/${urlWorkflowId}`)
          .then(() => {
            setTempWorkflowId(urlWorkflowId)
            setTempNodeId(urlNodeId)
            setWorkflowSelected(true)
            setNodeCreated(true)
            setShowWorkflowSelector(false)
            setShowNodeSelector(false)
            
            // Update localStorage
            if (typeof window !== 'undefined') {
              localStorage.setItem(getStorageKey('workflowId'), urlWorkflowId)
              localStorage.setItem(getStorageKey('nodeId'), urlNodeId)
            }
          })
          .catch(() => {
            // Workflow doesn't exist, show selector
            setShowWorkflowSelector(true)
            setWorkflowSelected(false)
            setNodeCreated(false)
            setTempWorkflowId(null)
            setTempNodeId(null)
          })
      }
    } else if (!urlWorkflowId && !urlNodeId && (tempWorkflowId || tempNodeId)) {
      // URL params cleared, reset state
      setTempWorkflowId(null)
      setTempNodeId(null)
      setWorkflowSelected(false)
      setNodeCreated(false)
      setShowWorkflowSelector(true)
      setShowNodeSelector(false)
    }
  }, [urlWorkflowId, urlNodeId, tempWorkflowId, tempNodeId, moduleType])

  // Fetch node data if we have a node ID
  const { data: nodeData } = useQuery<{ config?: any; state?: any } | null>({
    queryKey: ['node', tempNodeId],
    queryFn: async () => {
      if (!tempNodeId) return null
      return apiClient.get<{ config?: any; state?: any }>(`/v1/nodes/${tempNodeId}`)
    },
    enabled: !!tempNodeId,
    staleTime: 30000
  })

  // Create a temporary node object for standalone execution
  const tempNode = {
    id: tempNodeId || 'standalone',
    module_type: moduleType,
    config: (nodeData as any)?.config || {},
    state: (nodeData as any)?.state || {}
  }

  // Fetch module details
  const { data: module, isLoading, error } = useQuery<Module | undefined>({
    queryKey: ['module', moduleType],
    queryFn: async () => {
      const modules = await apiClient.get<Module[]>('/v1/modules')
      return modules.find(m => m.module_type === moduleType)
    },
    enabled: !!moduleType
  })

  // Fetch workflows for this module type
  const { data: moduleWorkflows, refetch: refetchWorkflows } = useQuery<Array<{
    id: string
    name: string
    description?: string
    status: string
    created_at?: string
    updated_at?: string
  }>>({
    queryKey: ['workflows-by-module', moduleType],
    queryFn: async () => {
      return apiClient.get(`/v1/workflows/by-module/${moduleType}`)
    },
    enabled: !!moduleType,
    staleTime: 30000
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-gray-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading module...</p>
        </div>
      </div>
    )
  }

  if (error || !module) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Module not found</p>
          <Link href="/modules">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Modules
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const handleConfigUpdate = async (config: any) => {
    if (tempNodeId && tempWorkflowId) {
      try {
        await apiClient.put(`/v1/nodes/${tempNodeId}`, {
          config: config
        })
        toast.success('Configuration saved')
      } catch (error: any) {
        toast.error(`Failed to save config: ${error.message || 'Unknown error'}`)
      }
    }
  }

  const handleProcess = async () => {
    if (tempNodeId && tempWorkflowId) {
      try {
        // Execute the node
        await apiClient.post(`/v1/workflows/${tempWorkflowId}/nodes/${tempNodeId}/execute`)
        toast.success('Module executed successfully')
      } catch (error: any) {
        toast.error(`Failed to execute: ${error.message || 'Unknown error'}`)
      }
    }
  }

  // Handle workflow selection
  const handleWorkflowSelect = async (workflowId: string) => {
    try {
      // Close the dialog
      setShowWorkflowDialog(false)
      
      // Get nodes for this workflow filtered by module type
      const matchingNodes = await apiClient.get<Array<{ id: string; module_type: string; checkpoint_name?: string }>>(
        `/v1/workflows/${workflowId}/nodes?module_type=${moduleType}`
      )
      
      if (matchingNodes.length === 0) {
        // No node found, create one
        setTempWorkflowId(workflowId)
        setWorkflowSelected(true)
        setShowWorkflowSelector(false)
        await createNodeForWorkflow(workflowId)
        // URL will be updated in createNodeForWorkflow
      } else if (matchingNodes.length === 1) {
        // Only one node, use it directly
        const selectedNodeId = matchingNodes[0].id
        
        // Update state first
        setTempWorkflowId(workflowId)
        setTempNodeId(selectedNodeId)
        setWorkflowSelected(true)
        setNodeCreated(true)
        setShowWorkflowSelector(false)
        setShowNodeSelector(false)
        
        // Update localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem(getStorageKey('workflowId'), workflowId)
          localStorage.setItem(getStorageKey('nodeId'), selectedNodeId)
        }
        
        // Update URL - this will trigger a navigation
        updateUrl(workflowId, selectedNodeId)
        
        toast.success('Workflow and node loaded')
      } else {
        // Multiple nodes, show node selector
        setTempWorkflowId(workflowId)
        setWorkflowSelected(true)
        setAvailableNodes(matchingNodes)
        setShowWorkflowSelector(false)
        setShowNodeSelector(true)
        // Don't update URL yet - wait for node selection
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to load workflow')
    }
  }

  // Handle node selection
  const handleNodeSelect = (nodeId: string) => {
    setTempNodeId(nodeId)
    setNodeCreated(true)
    setShowNodeSelector(false)
    
    // Update URL
    if (tempWorkflowId) {
      updateUrl(tempWorkflowId, nodeId)
    }
    
    // Update localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(getStorageKey('nodeId'), nodeId)
    }
    toast.success('Node selected')
  }

  // Handle create new workflow
  const handleCreateNewWorkflow = () => {
    createWorkflowMutation.mutate()
  }

  const renderModuleInterface = () => {
    // Show workflow selector if workflow not selected
    if (showWorkflowSelector && !workflowSelected) {
      return (
        <Card className="p-12">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Get Started</h2>
            <p className="text-gray-600">Select an existing workflow or create a new one to continue</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Select Existing Workflow Button */}
            <button
              onClick={() => {
                setShowWorkflowDialog(true)
              }}
              className="group relative overflow-hidden rounded-xl border-2 border-gray-200 bg-white p-8 hover:border-indigo-500 hover:shadow-lg transition-all duration-300 transform hover:scale-105 cursor-pointer"
            >
              <div className="flex flex-col items-center space-y-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-indigo-100 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full p-6 group-hover:scale-110 transition-transform duration-300">
                    <FolderOpen className="h-12 w-12 text-white" />
                  </div>
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors">
                    Select Workflow
                  </h3>
                  <p className="text-sm text-gray-600">
                    Choose from your existing workflows
                  </p>
                </div>
                {moduleWorkflows && moduleWorkflows.length > 0 && (
                  <div className="mt-2 text-xs text-indigo-600 font-medium">
                    {moduleWorkflows.length} workflow{moduleWorkflows.length !== 1 ? 's' : ''} available
                  </div>
                )}
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/5 to-indigo-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
            </button>

            {/* Create New Workflow Button */}
            <button
              onClick={handleCreateNewWorkflow}
              disabled={createWorkflowMutation.isPending}
              className="group relative overflow-hidden rounded-xl border-2 border-gray-200 bg-white p-8 hover:border-green-500 hover:shadow-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <div className="flex flex-col items-center space-y-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-green-100 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative bg-gradient-to-br from-green-500 to-emerald-600 rounded-full p-6 group-hover:scale-110 transition-transform duration-300">
                    {createWorkflowMutation.isPending ? (
                      <Loader2 className="h-12 w-12 text-white animate-spin" />
                    ) : (
                      <Plus className="h-12 w-12 text-white" />
                    )}
                  </div>
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-green-600 transition-colors">
                    {createWorkflowMutation.isPending ? 'Creating...' : 'Create Workflow'}
                  </h3>
                  <p className="text-sm text-gray-600">
                    Start fresh with a new workflow
                  </p>
                </div>
                <div className="mt-2 flex items-center space-x-1 text-xs text-green-600 font-medium">
                  <Sparkles className="h-3 w-3" />
                  <span>Quick setup</span>
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-green-500/0 via-green-500/5 to-green-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
            </button>
          </div>
        </Card>
      )
    }

    // Show node selector if workflow selected but node not selected
    if (showNodeSelector && !nodeCreated) {
      return (
        <Card className="p-8 text-center">
          <p className="text-gray-600 mb-4">Please select a node to continue.</p>
        </Card>
      )
    }

    // Show loading if creating workflow or node
    if (createWorkflowMutation.isPending || (!tempNodeId && workflowSelected && !showNodeSelector)) {
      return (
        <Card className="p-8 text-center">
          <Loader2 className="h-12 w-12 text-gray-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">
            {createWorkflowMutation.isPending ? 'Creating workflow...' : 'Creating node...'}
          </p>
        </Card>
      )
    }

    // Show interface only if workflow and node are ready
    if (!tempWorkflowId || !tempNodeId) {
      return (
        <Card className="p-8 text-center">
          <Loader2 className="h-8 w-8 text-gray-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading workflow and node...</p>
        </Card>
      )
    }

    switch (moduleType) {
      case 'excel_to_numeric':
        return (
          <ExcelToNumericWizard
            node={tempNode}
            workflowId={tempWorkflowId}
            hasInputSource={false}
            open={wizardOpen}
            onOpenChange={setWizardOpen}
            onConfigUpdate={handleConfigUpdate}
            onProcess={handleProcess}
          />
        )
      case 'file_uploader':
        return (
          <FileUploaderWizard
            node={tempNode}
            workflowId={tempWorkflowId}
            hasInputSource={false}
            open={wizardOpen}
            onOpenChange={setWizardOpen}
            onConfigUpdate={handleConfigUpdate}
            onProcess={handleProcess}
          />
        )
      case 'excel_viewer':
        return (
          <ExcelViewerWizard
            node={tempNode}
            workflowId={tempWorkflowId}
            hasInputSource={false}
            open={wizardOpen}
            onOpenChange={setWizardOpen}
            onConfigUpdate={handleConfigUpdate}
            onProcess={handleProcess}
          />
        )
      case 'outlier_remover':
        return (
          <OutlierRemoverGUI
            node={tempNode}
            workflowId={tempWorkflowId}
            onConfigUpdate={handleConfigUpdate}
            onProcess={handleProcess}
            isStandalone={true}
            onCreateNewWorkflow={(file?: File) => {
              if (file) {
                createWorkflowWithFileMutation.mutate(file)
              }
            }}
          />
        )
      case 'duckdb_convert':
        return (
          <DuckDBConvertGUI
            node={tempNode}
            workflowId={tempWorkflowId}
            onConfigUpdate={handleConfigUpdate}
            onProcess={handleProcess}
            isStandalone={true}
          />
        )
      case 'excel2jmp':
        return (
          <Excel2JMPGUI
            node={tempNode}
            workflowId={tempWorkflowId}
            onConfigUpdate={handleConfigUpdate}
            onProcess={handleProcess}
            isStandalone={true}
          />
        )
      default:
        return (
          <Card className="p-8 text-center">
            <p className="text-gray-600">
              Standalone interface for {module.display_name} is not yet available.
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Please use this module within a workflow.
            </p>
          </Card>
        )
    }
  }

  // For full-screen GUI modules, render without container constraints
  if (moduleType === 'outlier_remover' || moduleType === 'excel2jmp' || moduleType === 'duckdb_convert') {
    return (
      <div className="h-screen flex flex-col">
        {/* Top Bar with Back Button */}
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Link href="/modules">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Modules
              </Button>
            </Link>
          </div>
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white text-sm">
              {module.display_name.charAt(0)}
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{module.display_name}</h1>
              {tempWorkflowId && (
                <p className="text-xs text-gray-500">
                  {moduleWorkflows?.find(w => w.id === tempWorkflowId)?.name || 'Current Workflow'}
                </p>
              )}
            </div>
          </div>
        </div>
        
        {/* Workflow Selector - Now using dialog instead of inline */}

        {/* Node Selector */}
        {showNodeSelector && tempWorkflowId && availableNodes.length > 0 && (
          <div className="bg-white border-b border-gray-200 px-4 py-3 max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Select Node</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowNodeSelector(false)
                  setShowWorkflowSelector(true)
                }}
              >
                Back
              </Button>
            </div>
            <div className="space-y-1">
              {availableNodes.map((node) => (
                <button
                  key={node.id}
                  onClick={() => handleNodeSelect(node.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-gray-100 ${
                    node.id === tempNodeId ? 'bg-indigo-50 border border-indigo-200' : ''
                  }`}
                >
                  <div className="font-medium">
                    {node.checkpoint_name || `Node ${node.id.slice(0, 8)}`}
                  </div>
                  <div className="text-xs text-gray-500">Module: {node.module_type}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Full-screen GUI */}
        <div className="flex-1 overflow-hidden">
          {renderModuleInterface()}
        </div>

        {/* Workflow Selection Dialog */}
        <Dialog open={showWorkflowDialog} onOpenChange={setShowWorkflowDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Select Workflow</DialogTitle>
              <DialogDescription>
                Choose an existing workflow to continue, or create a new one
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Button
                onClick={handleCreateNewWorkflow}
                disabled={createWorkflowMutation.isPending}
                className="w-full"
              >
                {createWorkflowMutation.isPending ? 'Creating...' : 'Create New Workflow'}
              </Button>
              {moduleWorkflows && moduleWorkflows.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold mb-2">Existing Workflows:</h3>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {moduleWorkflows.map((workflow) => (
                      <button
                        key={workflow.id}
                        onClick={() => handleWorkflowSelect(workflow.id)}
                        className={`w-full text-left px-4 py-3 rounded-lg border hover:bg-gray-50 transition-all ${
                          workflow.id === tempWorkflowId ? 'bg-indigo-50 border-indigo-200' : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <Workflow className="h-5 w-5 text-gray-400" />
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{workflow.name}</div>
                            {workflow.description && (
                              <div className="text-sm text-gray-500 mt-1">{workflow.description}</div>
                            )}
                            <div className="text-xs text-gray-400 mt-1">
                              {workflow.updated_at && new Date(workflow.updated_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">No workflows found. Create a new one to get started.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <Link href="/modules">
                <Button variant="ghost" size="sm" className="mb-4">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Modules
                </Button>
              </Link>
              <div className="flex items-center space-x-3">
                <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white">
                  {module?.display_name?.charAt(0) || 'M'}
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">{module?.display_name || moduleType}</h1>
                  <p className="text-gray-600 mt-1">{module?.description}</p>
                </div>
              </div>
            </div>
            {tempWorkflowId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  handleResetWorkflow()
                  setShowWorkflowDialog(true)
                }}
              >
                Switch Workflow
              </Button>
            )}
          </div>
        </div>

        {/* Workflow Selector */}
        {showWorkflowSelector && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Select or Create Workflow</CardTitle>
              <CardDescription>
                Choose an existing workflow or create a new one to get started
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <Button
                  onClick={handleCreateNewWorkflow}
                  disabled={createWorkflowMutation.isPending}
                >
                  {createWorkflowMutation.isPending ? 'Creating...' : 'Create New Workflow'}
                </Button>
              </div>
              {moduleWorkflows && moduleWorkflows.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold mb-2">Existing Workflows:</h3>
                  {moduleWorkflows.map((workflow) => (
                    <button
                      key={workflow.id}
                      onClick={() => handleWorkflowSelect(workflow.id)}
                      className={`w-full text-left px-4 py-3 rounded-md border hover:bg-gray-50 ${
                        workflow.id === tempWorkflowId ? 'bg-indigo-50 border-indigo-200' : 'border-gray-200'
                      }`}
                    >
                      <div className="font-medium">{workflow.name}</div>
                      {workflow.description && (
                        <div className="text-sm text-gray-500 mt-1">{workflow.description}</div>
                      )}
                      <div className="text-xs text-gray-400 mt-1">
                        {workflow.updated_at && new Date(workflow.updated_at).toLocaleDateString()}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No workflows found. Create a new one to get started.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Node Selector */}
        {showNodeSelector && tempWorkflowId && availableNodes.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Select Node</CardTitle>
              <CardDescription>
                This workflow has multiple nodes of this module type. Please select one.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {availableNodes.map((node) => (
                  <button
                    key={node.id}
                    onClick={() => handleNodeSelect(node.id)}
                    className={`w-full text-left px-4 py-3 rounded-md border hover:bg-gray-50 ${
                      node.id === tempNodeId ? 'bg-indigo-50 border-indigo-200' : 'border-gray-200'
                    }`}
                  >
                    <div className="font-medium">
                      {node.checkpoint_name || `Node ${node.id.slice(0, 8)}`}
                    </div>
                    <div className="text-sm text-gray-500">Module: {node.module_type}</div>
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setShowNodeSelector(false)
                  setShowWorkflowSelector(true)
                }}
              >
                ← Back to Workflows
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Module Interface */}
        <div className="max-w-4xl mx-auto">
          {renderModuleInterface()}
        </div>

        {/* Workflow Selection Dialog */}
        <Dialog open={showWorkflowDialog} onOpenChange={setShowWorkflowDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Select Workflow</DialogTitle>
              <DialogDescription>
                Choose an existing workflow to continue, or create a new one
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Button
                onClick={handleCreateNewWorkflow}
                disabled={createWorkflowMutation.isPending}
                className="w-full"
              >
                {createWorkflowMutation.isPending ? 'Creating...' : 'Create New Workflow'}
              </Button>
              {moduleWorkflows && moduleWorkflows.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold mb-2">Existing Workflows:</h3>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {moduleWorkflows.map((workflow) => (
                      <button
                        key={workflow.id}
                        onClick={() => handleWorkflowSelect(workflow.id)}
                        className={`w-full text-left px-4 py-3 rounded-lg border hover:bg-gray-50 transition-all ${
                          workflow.id === tempWorkflowId ? 'bg-indigo-50 border-indigo-200' : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <Workflow className="h-5 w-5 text-gray-400" />
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{workflow.name}</div>
                            {workflow.description && (
                              <div className="text-sm text-gray-500 mt-1">{workflow.description}</div>
                            )}
                            <div className="text-xs text-gray-400 mt-1">
                              {workflow.updated_at && new Date(workflow.updated_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">No workflows found. Create a new one to get started.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

export default function ModuleRunnerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
      </div>
    }>
      <ModuleRunnerPageContent />
    </Suspense>
  )
}


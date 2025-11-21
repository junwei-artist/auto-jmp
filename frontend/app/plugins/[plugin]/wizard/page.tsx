'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronUp,
  ChevronDown,
  CheckCircle, 
  Circle, 
  Upload, 
  FileSpreadsheet,
  Play,
  BarChart3,
  ArrowLeft,
  Loader2
} from 'lucide-react'
import { useLanguage } from '@/lib/language'
import { useSocket } from '@/lib/socket'

interface WizardStep {
  id: string
  title: string
  description: string
  icon: JSX.Element
}

interface PluginWizardProps {
  pluginName: string
  pluginDescription: string
  projectId: string
}

function ExcelProcessingWizardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useLanguage()
  const projectId = searchParams?.get('projectId') || ''
  const pluginName = searchParams?.get('plugin') || 'excel2boxplotv1'
  
  const [currentStep, setCurrentStep] = useState(0)
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [fileAnalysis, setFileAnalysis] = useState<any>(null)
  const [selectedCategoricalVariable, setSelectedCategoricalVariable] = useState<string>('')
  const [selectedCategoricalVariables, setSelectedCategoricalVariables] = useState<string[]>([]) // For generic plugin
  
  // Data type/modeling type for excel2commonality plugin (both standard and generic)
  const isCommonalityPlugin = pluginName === 'excel2commonality' || pluginName === 'excel2commonality-generic'
  
  // For standard plugin: single variable data type
  const [variableDataType, setVariableDataType] = useState<'character-nominal' | 'numeric-continuous' | 'none'>('none')
  
  // For generic plugin: data type for each selected variable
  const [variableDataTypes, setVariableDataTypes] = useState<Record<string, 'character-nominal' | 'numeric-continuous' | 'none'>>({})
  
  // Color by variable selection for generic plugin
  const [colorByVariable, setColorByVariable] = useState<string>('')
  
  // Caption boxes enabled for each variable (generic plugin)
  const [captionBoxesEnabled, setCaptionBoxesEnabled] = useState<Record<string, boolean>>({})
  
  // Graph size configuration (generic plugin)
  const [graphWidth, setGraphWidth] = useState<number>(1280)
  const [graphHeight, setGraphHeight] = useState<number>(720)
  
  const [refLineConfig, setRefLineConfig] = useState<{
    usl: { value: string; color: string }
    target: { value: string; color: string }
    lsl: { value: string; color: string }
  }>({
    usl: { value: '', color: 'Dark Blue' },
    target: { value: '', color: 'Dark Blue' },
    lsl: { value: '', color: 'Dark Blue' }
  })
  
  const [validationResults, setValidationResults] = useState<any[]>([])
  const [boundaryResults, setBoundaryResults] = useState<any>(null)
  const [fixInfo, setFixInfo] = useState<any>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  
  // Check if this is the generic plugin
  const isGenericPlugin = pluginName === 'excel2commonality-generic'
  const [projectInfo, setProjectInfo] = useState<any>(null)
  const [analysisSteps, setAnalysisSteps] = useState<Array<{ label: string; done: boolean; error?: string }>>([])
  const [runId, setRunId] = useState<string | null>(null)
  const [runStatus, setRunStatus] = useState<string | null>(null)
  const [runMessage, setRunMessage] = useState<string | null>(null)
  const [runMessages, setRunMessages] = useState<string[]>([])
  const [runMessagesWithTime, setRunMessagesWithTime] = useState<Array<{message: string, timestamp: Date}>>([])
  const [imageCount, setImageCount] = useState<number | null>(null)
  const [isStartingAnalysis, setIsStartingAnalysis] = useState(false)
  const [taskImages, setTaskImages] = useState<Array<{filename: string, url: string, size: number, modified: number}>>([])
  const [imageSearchQuery, setImageSearchQuery] = useState<string>('')
  const { subscribeToRun, unsubscribeFromRun } = useSocket()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [runMessages, runMessagesWithTime])

  // Poll task images every 3 seconds when runId exists
  useEffect(() => {
    if (!runId) {
      setTaskImages([])
      return
    }

    const fetchTaskImages = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4700'
        const response = await fetch(`${backendUrl}/api/v1/runs/${runId}/task-images`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          }
        })
        if (response.ok) {
          const data = await response.json()
          if (data.images && Array.isArray(data.images)) {
            // Ensure URLs are absolute
            const imagesWithAbsoluteUrls = data.images.map((img: any) => ({
              ...img,
              url: img.url.startsWith('http') ? img.url : `${backendUrl}${img.url}`
            }))
            setTaskImages(imagesWithAbsoluteUrls)
          }
        }
      } catch (error) {
        console.error('Failed to fetch task images:', error)
      }
    }

    // Fetch immediately
    fetchTaskImages()

    // Then poll every 3 seconds
    const interval = setInterval(fetchTaskImages, 3000)

    return () => clearInterval(interval)
  }, [runId])

  // Check authentication and project ID on component mount
  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      alert('Please log in to use plugins')
      router.push('/plugins')
      return
    }
    
    if (!projectId) {
      alert('Project ID is required')
      router.push('/plugins/create-project')
      return
    }

    // Fetch project info
    fetchProjectInfo()
  }, [projectId, router])

  const fetchProjectInfo = async () => {
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/v1/projects/${projectId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        const project = await response.json()
        setProjectInfo(project)
      }
    } catch (error) {
      console.error('Error fetching project info:', error)
    }
  }

  // For generic plugin, skip validation and boundary steps
  const steps: WizardStep[] = isGenericPlugin ? [
    {
      id: 'file-upload',
      title: t('plugin.wizard.upload'),
      description: t('plugin.wizard.uploadDesc'),
      icon: <Upload className="h-5 w-5" />
    },
    {
      id: 'variable-selection',
      title: t('plugin.wizard.selectVariables'),
      description: t('plugin.wizard.selectVariablesDesc'),
      icon: <BarChart3 className="h-5 w-5" />
    },
    {
      id: 'processing',
      title: t('plugin.wizard.processing'),
      description: t('plugin.wizard.processingDesc'),
      icon: <FileSpreadsheet className="h-5 w-5" />
    },
    {
      id: 'run-analysis',
      title: t('plugin.wizard.run'),
      description: t('plugin.wizard.runDesc'),
      icon: <Play className="h-5 w-5" />
    }
  ] : [
    {
      id: 'file-upload',
      title: t('plugin.wizard.upload'),
      description: t('plugin.wizard.uploadDesc'),
      icon: <Upload className="h-5 w-5" />
    },
    {
      id: 'variable-selection',
      title: t('plugin.wizard.selectVariables'),
      description: t('plugin.wizard.selectVariablesDesc'),
      icon: <BarChart3 className="h-5 w-5" />
    },
    {
      id: 'validation',
      title: t('plugin.wizard.validation'),
      description: t('plugin.wizard.validationDesc'),
      icon: <CheckCircle className="h-5 w-5" />
    },
    {
      id: 'boundary-calculation',
      title: t('plugin.wizard.boundary'),
      description: t('plugin.wizard.boundaryDesc'),
      icon: <FileSpreadsheet className="h-5 w-5" />
    },
    {
      id: 'processing',
      title: t('plugin.wizard.processing'),
      description: t('plugin.wizard.processingDesc'),
      icon: <FileSpreadsheet className="h-5 w-5" />
    },
    {
      id: 'run-analysis',
      title: t('plugin.wizard.run'),
      description: t('plugin.wizard.runDesc'),
      icon: <Play className="h-5 w-5" />
    }
  ]

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setExcelFile(file)
    }
  }

  const handleAnalyzeFile = async () => {
    if (!excelFile) return

    try {
      const formData = new FormData()
      // Stamp excel filename with timestamp + uuid
      const ts = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace('T', '_')
        .slice(0, 15)
      const uid = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10))
      const dot = excelFile.name.lastIndexOf('.')
      const base = dot > -1 ? excelFile.name.slice(0, dot) : excelFile.name
      const ext = dot > -1 ? excelFile.name.slice(dot) : ''
      const stampedName = `${base}_${ts}_${uid}${ext}`
      const stampedFile = new File([excelFile], stampedName, { type: excelFile.type })
      formData.append('file', stampedFile)

      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/v1/extensions/${pluginName}/load-file`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (response.ok) {
        const result = await response.json()
        setFileAnalysis(result)
        
        // For generic plugin, call process-data to get non-FAI columns
        if (isGenericPlugin) {
          try {
            const processFormData = new FormData()
            const stampedFile = new File([excelFile], stampedName, { type: excelFile.type })
            processFormData.append('file', stampedFile)
            
            const processResponse = await fetch(`/api/v1/extensions/${pluginName}/process-data`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`
              },
              body: processFormData
            })
            
            if (processResponse.ok) {
              const processResult = await processResponse.json()
              // Merge process-data results into fileAnalysis
              setFileAnalysis({
                ...result,
                ...processResult,
                non_fai_columns: processResult.non_fai_columns || [],
                has_meta_sheet: processResult.has_meta_sheet || false
              })
              
              // If meta sheet exists, initialize reference line values from meta sheet if available
              if (processResult.has_meta_sheet && processResult.meta_specs) {
                const specs = processResult.meta_specs
                setRefLineConfig({
                  usl: { 
                    value: specs.usl ? String(specs.usl) : '', 
                    color: 'Dark Blue' 
                  },
                  target: { 
                    value: specs.target ? String(specs.target) : '', 
                    color: 'Dark Blue' 
                  },
                  lsl: { 
                    value: specs.lsl ? String(specs.lsl) : '', 
                    color: 'Dark Blue' 
                  }
                })
              }
            }
          } catch (error) {
            console.error('Error getting non-FAI columns:', error)
          }
        }
        
        // Check if file was automatically fixed
        if (result.fix_applied) {
          setFixInfo({
            applied: true,
            message: result.fix_message
          })
          alert(`✅ File automatically fixed!\n\n${result.fix_message}\n\nThe file has been corrected and is ready for analysis.`)
        }
        
        handleNext()
      } else {
        const errorData = await response.json()
        alert(`File analysis failed: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error analyzing file:', error)
      alert('Error analyzing file. Please try again.')
    }
  }

  const handleValidateFile = async () => {
    if (isGenericPlugin) {
      // Skip validation for generic plugin, go directly to file generation
      handleNext()
      return
    }
    
    if (!excelFile || !selectedCategoricalVariable) return

    try {
      const formData = new FormData()
      {
        const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15)
        const uid = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10))
        const dot = excelFile.name.lastIndexOf('.')
        const base = dot > -1 ? excelFile.name.slice(0, dot) : excelFile.name
        const ext = dot > -1 ? excelFile.name.slice(dot) : ''
        const stamped = new File([excelFile], `${base}_${ts}_${uid}${ext}`, { type: excelFile.type })
        formData.append('file', stamped)
      }
      formData.append('cat_var', selectedCategoricalVariable)
      // Add data type/modeling type for excel2commonality plugin
      if (isCommonalityPlugin && variableDataType !== 'none') {
        formData.append('variable_data_type', variableDataType)
      }

      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/v1/extensions/${pluginName}/validate-data`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (response.ok) {
        const result = await response.json()
        setValidationResults(result.checkpoints || [])
        
        if (result.valid) {
          // Don't automatically proceed - let user see results and click continue
          // handleNext() will be called when user clicks the continue button
        } else {
          // Show validation results but allow user to proceed anyway
          console.log('Validation failed but allowing user to proceed:', result)
        }
      } else {
        const errorData = await response.json()
        alert(`Validation failed: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error validating file:', error)
      alert('Error validating file. Please try again.')
    }
  }

  const handleCalculateBoundaries = async () => {
    if (!excelFile || !selectedCategoricalVariable) return

    try {
      const formData = new FormData()
      {
        const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15)
        const uid = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10))
        const dot = excelFile.name.lastIndexOf('.')
        const base = dot > -1 ? excelFile.name.slice(0, dot) : excelFile.name
        const ext = dot > -1 ? excelFile.name.slice(dot) : ''
        const stamped = new File([excelFile], `${base}_${ts}_${uid}${ext}`, { type: excelFile.type })
        formData.append('file', stamped)
      }
      formData.append('cat_var', selectedCategoricalVariable)

      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/v1/extensions/${pluginName}/process-data`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (response.ok) {
        const result = await response.json()
        setBoundaryResults(result)
        handleNext()
      } else {
        const errorData = await response.json()
        alert(`Boundary calculation failed: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error calculating boundaries:', error)
      alert('Error calculating boundaries. Please try again.')
    }
  }

  const handleProcessFile = async () => {
    if (isGenericPlugin) {
      if (!excelFile || selectedCategoricalVariables.length === 0) return
    } else {
    if (!excelFile || !selectedCategoricalVariable) return
    }

    setIsProcessing(true)
    try {
      const formData = new FormData()
      {
        const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15)
        const uid = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10))
        const dot = excelFile.name.lastIndexOf('.')
        const base = dot > -1 ? excelFile.name.slice(0, dot) : excelFile.name
        const ext = dot > -1 ? excelFile.name.slice(dot) : ''
        const stamped = new File([excelFile], `${base}_${ts}_${uid}${ext}`, { type: excelFile.type })
        formData.append('file', stamped)
      }
      
      if (isGenericPlugin) {
        formData.append('categorical_columns', JSON.stringify(selectedCategoricalVariables))
      } else {
      formData.append('cat_var', selectedCategoricalVariable)
      }

      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/v1/extensions/${pluginName}/generate-files`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (response.ok) {
        const result = await response.json()
        console.log('File generation successful:', result)
        handleNext()
      } else {
        const errorData = await response.json()
        console.error('File generation failed:', errorData)
        alert(`File generation failed: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error generating files:', error)
      alert(`Error generating files: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleComplete = () => {
    router.push(`/projects/${projectId}`)
  }

  const handleRunAnalysis = async () => {
    if (isGenericPlugin) {
      if (!excelFile || selectedCategoricalVariables.length === 0 || !projectId || !projectInfo) return
    } else {
    if (!excelFile || !selectedCategoricalVariable || !projectId || !projectInfo) return
    }

    setIsStartingAnalysis(true)
    setRunId(null)
    setRunStatus(null)
    setRunMessage(null)
    setRunMessages([]) // Clear previous messages
    setImageCount(null) // Reset image count
    setAnalysisSteps([
      { label: 'Generating CSV and JSL from Excel', done: false },
      { label: 'Saving files to storage', done: false },
      { label: 'Creating run', done: false }
    ])

    try {
      const formData = new FormData()
      {
        const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15)
        const uid = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10))
        const dot = excelFile.name.lastIndexOf('.')
        const base = dot > -1 ? excelFile.name.slice(0, dot) : excelFile.name
        const ext = dot > -1 ? excelFile.name.slice(dot) : ''
        const stamped = new File([excelFile], `${base}_${ts}_${uid}${ext}`, { type: excelFile.type })
        formData.append('file', stamped)
      }
      
      if (isGenericPlugin) {
        formData.append('categorical_columns', JSON.stringify(selectedCategoricalVariables))
        // Add data type/modeling type for each variable if any are set
        const dataTypeConfig: Record<string, string> = {}
        selectedCategoricalVariables.forEach((col: string) => {
          const dataType = variableDataTypes[col] || 'none'
          if (dataType !== 'none') {
            dataTypeConfig[col] = dataType
          }
        })
        if (Object.keys(dataTypeConfig).length > 0) {
          formData.append('variable_data_types', JSON.stringify(dataTypeConfig))
        }
        // Add caption boxes configuration
        const captionBoxesConfig: Record<string, boolean> = {}
        selectedCategoricalVariables.forEach((col: string) => {
          if (captionBoxesEnabled[col]) {
            captionBoxesConfig[col] = true
          }
        })
        if (Object.keys(captionBoxesConfig).length > 0) {
          formData.append('caption_boxes_enabled', JSON.stringify(captionBoxesConfig))
        }
        // Add color by variable if selected
        if (colorByVariable) {
          formData.append('color_by_variable', colorByVariable)
        }
        // Add reference line configuration if meta sheet is detected
        if (fileAnalysis?.has_meta_sheet) {
          formData.append('ref_line_config', JSON.stringify(refLineConfig))
        }
        // Add graph size configuration
        formData.append('graph_width', graphWidth.toString())
        formData.append('graph_height', graphHeight.toString())
      } else {
      formData.append('cat_var', selectedCategoricalVariable)
        // Add data type/modeling type for excel2commonality plugin
        if (isCommonalityPlugin && variableDataType !== 'none') {
          formData.append('variable_data_type', variableDataType)
        }
      }
      formData.append('project_id', String(projectId))
      formData.append('project_name', projectInfo?.name || 'Analysis')
      formData.append('project_description', projectInfo?.description || '')

      const token = localStorage.getItem('access_token')
      let result: any = null
      let lastError: string | null = null
      for (let attempt = 1; attempt <= 3; attempt++) {
        const response = await fetch(`/api/v1/extensions/${pluginName}/run-analysis`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        })

        if (response.ok) {
          result = await response.json()
          if (result?.run?.id) break
          lastError = 'Run ID missing from response'
        } else {
          const err = await response.json().catch(() => ({}))
          lastError = err?.error || err?.detail || 'Failed to start analysis'
        }

        if (attempt < 3) {
          await new Promise(res => setTimeout(res, 3000))
        }
      }

      if (!result?.run?.id) {
        throw new Error(lastError || 'Failed to start analysis')
      }

      // Mark generation and save steps as done (backend does both before run creation)
      setAnalysisSteps(prev => prev.map((s, i) => ({ ...s, done: i <= 1 ? true : s.done })))

      // Created run
      const createdRunId = result?.run?.id
      if (createdRunId) {
        setRunId(createdRunId)
        setAnalysisSteps(prev => prev.map((s, i) => ({ ...s, done: i <= 2 ? true : s.done })))
        setRunStatus(result?.run?.status || 'queued')
        setRunMessage(result?.run?.message || null)
        // Initialize messages array with initial message
        if (result?.run?.message) {
          setRunMessages([result.run.message])
          setRunMessagesWithTime([{ message: result.run.message, timestamp: new Date() }])
        } else {
          setRunMessages([])
          setRunMessagesWithTime([])
        }
        // Prefer WebSocket live updates; keep polling as fallback
        try {
          subscribeToRun(createdRunId, (data: any) => {
            console.log('[WIZARD] WebSocket update received:', data)
            
            // Update status
            if (data?.status) {
              setRunStatus(data.status)
            }
            
            // Update image count - check specifically for run_progress type or any update with image_count
            if (data?.type === 'run_progress' || data?.image_count !== undefined) {
              const count = data.image_count
              // Allow 0 as a valid count (initial state)
              if (count !== null && count !== undefined) {
                console.log('[WIZARD] Updating image count:', count)
                setImageCount(count)
              }
            }
            
            // Accumulate all progress messages (including artifact creation messages)
            if (data?.message) {
              setRunMessage(data.message) // Keep latest for backward compatibility
              const timestamp = new Date()
              // Add message to array if it's new
              setRunMessages((prev) => {
                // Avoid duplicates - check if last message is the same
                if (prev.length > 0 && prev[prev.length - 1] === data.message) {
                  return prev
                }
                // Always add new messages, especially artifact creation messages
                const newMessages = [...prev, data.message]
                console.log('[WIZARD] Added message:', data.message, 'Total messages:', newMessages.length)
                return newMessages
              })
              // Also store with timestamp for monitor display
              setRunMessagesWithTime((prev) => {
                // Avoid duplicates
                if (prev.length > 0 && prev[prev.length - 1].message === data.message) {
                  return prev
                }
                return [...prev, { message: data.message, timestamp }]
              })
            }
            
            // Handle artifact creation specifically
            if (data?.type === 'run_progress' && data?.artifact) {
              console.log('[WIZARD] Artifact created:', data.artifact, 'Message:', data.message)
              // The message should already be added above, but ensure it's visible
            }
            
            // Update image count from completed runs too
            if ((data?.type === 'run_completed' || data?.type === 'run_failed') && data?.image_count !== undefined) {
              setImageCount(data.image_count)
            }
          })
        } catch (error) {
          console.error('[WIZARD] Error subscribing to WebSocket:', error)
        }
        pollRunStatus(createdRunId)
      } else {
        throw new Error('Run ID missing from response')
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to start analysis'
      setAnalysisSteps(prev => prev.map((s, i) => (i === 2 && !s.done ? { ...s, error: msg } : s)))
      alert(msg)
    } finally {
      setIsStartingAnalysis(false)
    }
  }

  const pollRunStatus = async (id: string) => {
    let attempts = 0
    const maxAttempts = 120 // ~2 minutes if 1s interval
    const interval = 1000

    const timer = setInterval(async () => {
      attempts += 1
      try {
        const resp = await fetch(`/api/v1/runs/${id}`)
        if (!resp.ok) return
        const run = await resp.json()
        setRunStatus(run.status)
        // Update image count from polled run data (fallback when WebSocket is not available)
        if (run.image_count !== undefined && run.image_count !== null) {
          console.log('[WIZARD] Poll update - image count:', run.image_count)
          setImageCount(run.image_count)
        }
        if (run.message) {
          setRunMessage(run.message)
          // Update messages array
          setRunMessages((prev) => {
            if (prev.length === 0 || prev[prev.length - 1] !== run.message) {
              return [...prev, run.message]
            }
            return prev
          })
        }

        if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled') {
          clearInterval(timer)
        }
      } catch {}

      if (attempts >= maxAttempts) clearInterval(timer)
    }, interval)
  }

  // Cleanup subscription on unmount or when runId changes
  useEffect(() => {
    return () => {
      if (runId) {
        try { unsubscribeFromRun(runId) } catch {}
      }
    }
  }, [runId, unsubscribeFromRun])

  const handleCancel = () => {
    router.push('/plugins/create-project')
  }

  const getCheckpointTitle = (checkpoint: number) => {
    const titles = {
      1: 'Excel Structure Validation',
      2: 'Metadata Validation', 
      3: 'Data Quality Validation'
    }
    return titles[checkpoint as keyof typeof titles] || `Checkpoint ${checkpoint}`
  }

  const renderStepContent = () => {
    // For generic plugin, map steps differently
    const stepIndex = isGenericPlugin ? {
      0: 'file-upload',
      1: 'variable-selection',
      2: 'processing',
      3: 'run-analysis'
    } : {
      0: 'file-upload',
      1: 'variable-selection',
      2: 'validation',
      3: 'boundary-calculation',
      4: 'processing',
      5: 'run-analysis'
    }
    
    const currentStepId = stepIndex[currentStep as keyof typeof stepIndex]
    
    switch (currentStepId) {
      case 'file-upload':
        return (
          <div className="space-y-6">
            <div>
              <Label htmlFor="excel-file">{t('plugin.wizard.selectExcel')}</Label>
              <Input
                id="excel-file"
                type="file"
                accept=".xlsx,.xls,.xlsm,.xlsb"
                onChange={handleFileUpload}
                className="mt-1"
              />
            </div>
            
            {excelFile && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <FileSpreadsheet className="h-5 w-5 text-green-600" />
                  <span className="text-green-800 font-medium">{excelFile.name}</span>
                </div>
                <p className="text-green-600 text-sm mt-1">
                  File size: {(excelFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">Expected Excel Structure</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• <strong>meta</strong> sheet: Contains metadata with required columns</li>
                <li>• <strong>data</strong> sheet: Contains actual measurement data</li>
                <li>• Required columns: Label, Y Variable, USL, LSL, Target, etc.</li>
              </ul>
            </div>

            {excelFile && (
              <div className="flex justify-center">
                <Button onClick={handleAnalyzeFile} className="px-8">
                  <ChevronRight className="h-4 w-4 mr-2" />
                  {t('plugin.wizard.analyzeFile')}
                </Button>
              </div>
            )}
          </div>
        )

      case 'variable-selection':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <BarChart3 className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {isGenericPlugin ? 'Select Categorical Variables' : t('plugin.wizard.selectCatVar')}
              </h3>
              <p className="text-gray-600">
                {isGenericPlugin 
                  ? 'Select one or more columns that do NOT contain "FAI" to use as categorical variables'
                  : t('plugin.wizard.selectCatVarDesc')}
              </p>
            </div>

            {fileAnalysis && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">{t('plugin.wizard.fileAnalysis')}</h4>
                  <div className="text-sm text-blue-800 space-y-1">
                    <p>• <strong>Data sheet:</strong> {fileAnalysis.data_sheet || fileAnalysis.sheets?.[0] || 'N/A'}</p>
                    <p>• <strong>Data shape:</strong> {fileAnalysis.data_shape?.[0] || 0} rows × {fileAnalysis.data_shape?.[1] || 0} columns</p>
                    <p>• <strong>FAI columns:</strong> {fileAnalysis.fai_columns?.length || 0} found</p>
                    {isGenericPlugin ? (
                      <p>• <strong>Non-FAI columns (categorical variables):</strong> {fileAnalysis.non_fai_columns?.length || 0} available</p>
                    ) : (
                    <p>• <strong>Categorical variables:</strong> {fileAnalysis.categorical_columns?.length || 0} available</p>
                    )}
                  </div>
                </div>

                {isGenericPlugin ? (
                  // Generic plugin: Multiple selection from non-FAI columns
                  fileAnalysis.non_fai_columns && fileAnalysis.non_fai_columns.length > 0 ? (
                    <div>
                      <Label htmlFor="categorical-variables">{t('plugin.wizard.selectCatVars') || 'Select Categorical Variables (Multiple)'}</Label>
                      <p className="text-sm text-gray-500 mb-2">
                        Select one or more columns that do NOT contain "FAI" to use as categorical variables
                      </p>
                      <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-300 rounded-md p-3">
                        {fileAnalysis.non_fai_columns.map((col: string) => (
                          <label key={col} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                            <input
                              type="checkbox"
                              checked={selectedCategoricalVariables.includes(col)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCategoricalVariables([...selectedCategoricalVariables, col])
                                  // Initialize data type to 'none' for new variable
                                  setVariableDataTypes({
                                    ...variableDataTypes,
                                    [col]: 'none'
                                  })
                                  // Initialize caption boxes to false for new variable
                                  setCaptionBoxesEnabled({
                                    ...captionBoxesEnabled,
                                    [col]: false
                                  })
                                } else {
                                  setSelectedCategoricalVariables(selectedCategoricalVariables.filter(c => c !== col))
                                  // Remove data type setting for unselected variable
                                  const newTypes = { ...variableDataTypes }
                                  delete newTypes[col]
                                  setVariableDataTypes(newTypes)
                                  // Remove caption boxes setting for unselected variable
                                  const newCaptionBoxes = { ...captionBoxesEnabled }
                                  delete newCaptionBoxes[col]
                                  setCaptionBoxesEnabled(newCaptionBoxes)
                                }
                              }}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">{col}</span>
                          </label>
                        ))}
                      </div>
                      {selectedCategoricalVariables.length > 0 && (
                        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-sm font-medium text-green-900 mb-3">
                            Selected variables (in order - this determines the sequence in JSL):
                          </p>
                          <div className="space-y-2">
                            {selectedCategoricalVariables.map((col: string, index: number) => (
                              <div 
                                key={`${col}-${index}`}
                                className="flex items-center justify-between p-2 bg-white border border-green-300 rounded-md hover:bg-green-50"
                              >
                                <div className="flex items-center space-x-3 flex-1">
                                  <span className="text-xs font-medium text-gray-500 w-6 text-center">
                                    {index + 1}
                                  </span>
                                  <span className="text-sm text-gray-700 font-medium flex-1">{col}</span>
                                </div>
                                <div className="flex items-center space-x-3">
                                  {/* Data Type/Modeling Type Selection for each variable */}
                                  <div className="flex items-center space-x-2">
                                    <select
                                      value={variableDataTypes[col] || 'none'}
                                      onChange={(e) => {
                                        setVariableDataTypes({
                                          ...variableDataTypes,
                                          [col]: e.target.value as 'character-nominal' | 'numeric-continuous' | 'none'
                                        })
                                      }}
                                      className="text-xs px-2 py-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
                                      title="Data Type / Modeling Type"
                                    >
                                      <option value="none">None</option>
                                      <option value="character-nominal">Char-Nom</option>
                                      <option value="numeric-continuous">Num-Cont</option>
                                    </select>
                                  </div>
                                  {/* Caption Boxes Toggle */}
                                  <div className="flex items-center space-x-1">
                                    <input
                                      type="checkbox"
                                      id={`caption-${col}`}
                                      checked={captionBoxesEnabled[col] || false}
                                      onChange={(e) => {
                                        setCaptionBoxesEnabled({
                                          ...captionBoxesEnabled,
                                          [col]: e.target.checked
                                        })
                                      }}
                                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                      title="Enable Caption Boxes"
                                    />
                                    <label htmlFor={`caption-${col}`} className="text-xs text-gray-600 cursor-pointer">
                                      Caption
                                    </label>
                                  </div>
                                  <div className="flex items-center space-x-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (index > 0) {
                                          const newOrder = [...selectedCategoricalVariables]
                                          ;[newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]]
                                          setSelectedCategoricalVariables(newOrder)
                                        }
                                      }}
                                      disabled={index === 0}
                                      className={`p-1 rounded hover:bg-green-100 ${
                                        index === 0 
                                          ? 'opacity-30 cursor-not-allowed' 
                                          : 'cursor-pointer'
                                      }`}
                                      title="Move up"
                                    >
                                      <ChevronUp className="h-4 w-4 text-green-700" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (index < selectedCategoricalVariables.length - 1) {
                                          const newOrder = [...selectedCategoricalVariables]
                                          ;[newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]]
                                          setSelectedCategoricalVariables(newOrder)
                                        }
                                      }}
                                      disabled={index === selectedCategoricalVariables.length - 1}
                                      className={`p-1 rounded hover:bg-green-100 ${
                                        index === selectedCategoricalVariables.length - 1 
                                          ? 'opacity-30 cursor-not-allowed' 
                                          : 'cursor-pointer'
                                      }`}
                                      title="Move down"
                                    >
                                      <ChevronDown className="h-4 w-4 text-green-700" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-green-700 mt-3">
                            The order above determines the sequence of variables in the JSL file's Variables section.
                          </p>
                          
                          {/* Color By Variable Selection */}
                          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <Label htmlFor="color-by-variable" className="text-sm font-medium text-blue-900">
                              Color By Variable (Optional)
                            </Label>
                            <p className="text-xs text-blue-700 mb-2 mt-1">
                              Select one variable to use for coloring the graph. This will add a Color() variable to the JSL.
                            </p>
                            <select
                              id="color-by-variable"
                              value={colorByVariable}
                              onChange={(e) => setColorByVariable(e.target.value)}
                              className="mt-1 block w-full px-3 py-2 border border-blue-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
                            >
                              <option value="">None (no color variable)</option>
                              {selectedCategoricalVariables.map((col: string) => (
                                <option key={col} value={col}>{col}</option>
                              ))}
                            </select>
                            {colorByVariable && (
                              <p className="text-xs text-blue-700 mt-2">
                                Graphs will be colored by: <strong>{colorByVariable}</strong>
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Graph Size Configuration */}
                      {isGenericPlugin && (
                        <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                          <Label htmlFor="graph-width" className="text-sm font-medium text-gray-900">
                            Graph Size (Width × Height)
                          </Label>
                          <p className="text-xs text-gray-600 mb-3 mt-1">
                            Set the dimensions for the generated graphs. Default: 1280 × 720 pixels.
                          </p>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="graph-width" className="text-xs text-gray-700">Width (pixels)</Label>
                              <Input
                                id="graph-width"
                                type="number"
                                min="100"
                                max="10000"
                                step="1"
                                value={graphWidth}
                                onChange={(e) => setGraphWidth(parseInt(e.target.value) || 1280)}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label htmlFor="graph-height" className="text-xs text-gray-700">Height (pixels)</Label>
                              <Input
                                id="graph-height"
                                type="number"
                                min="100"
                                max="10000"
                                step="1"
                                value={graphHeight}
                                onChange={(e) => setGraphHeight(parseInt(e.target.value) || 720)}
                                className="mt-1"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Reference Line Configuration (only if meta sheet is detected) */}
                      {fileAnalysis?.has_meta_sheet && (
                        <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                          <p className="text-sm font-medium text-purple-900 mb-3">
                            Reference Line Configuration (for meta sheet)
                          </p>
                          <p className="text-xs text-purple-700 mb-4">
                            Configure USL, Target, and LSL values and their colors for reference lines in the JSL file.
                          </p>
                          
                          <div className="space-y-4">
                            {/* USL Configuration */}
                            <div className="bg-white p-3 rounded-md border border-purple-200">
                              <Label htmlFor="usl-value" className="text-sm font-medium text-gray-700">USL (Upper Specification Limit)</Label>
                              <div className="mt-2 grid grid-cols-2 gap-3">
                                <div>
                                  <Input
                                    id="usl-value"
                                    type="number"
                                    step="any"
                                    value={refLineConfig.usl.value}
                                    onChange={(e) => setRefLineConfig({
                                      ...refLineConfig,
                                      usl: { ...refLineConfig.usl, value: e.target.value }
                                    })}
                                    placeholder="Enter USL value"
                                    className="w-full"
                                  />
                                </div>
                                <div>
                                  <select
                                    id="usl-color"
                                    value={refLineConfig.usl.color}
                                    onChange={(e) => setRefLineConfig({
                                      ...refLineConfig,
                                      usl: { ...refLineConfig.usl, color: e.target.value }
                                    })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                                  >
                                    <option value="Dark Blue">Dark Blue</option>
                                    <option value="Dark Red">Dark Red</option>
                                    <option value="Dark Yellow">Dark Yellow</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                            
                            {/* Target Configuration */}
                            <div className="bg-white p-3 rounded-md border border-purple-200">
                              <Label htmlFor="target-value" className="text-sm font-medium text-gray-700">Target</Label>
                              <div className="mt-2 grid grid-cols-2 gap-3">
                                <div>
                                  <Input
                                    id="target-value"
                                    type="number"
                                    step="any"
                                    value={refLineConfig.target.value}
                                    onChange={(e) => setRefLineConfig({
                                      ...refLineConfig,
                                      target: { ...refLineConfig.target, value: e.target.value }
                                    })}
                                    placeholder="Enter Target value"
                                    className="w-full"
                                  />
                                </div>
                                <div>
                                  <select
                                    id="target-color"
                                    value={refLineConfig.target.color}
                                    onChange={(e) => setRefLineConfig({
                                      ...refLineConfig,
                                      target: { ...refLineConfig.target, color: e.target.value }
                                    })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                                  >
                                    <option value="Dark Blue">Dark Blue</option>
                                    <option value="Dark Red">Dark Red</option>
                                    <option value="Dark Yellow">Dark Yellow</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                            
                            {/* LSL Configuration */}
                            <div className="bg-white p-3 rounded-md border border-purple-200">
                              <Label htmlFor="lsl-value" className="text-sm font-medium text-gray-700">LSL (Lower Specification Limit)</Label>
                              <div className="mt-2 grid grid-cols-2 gap-3">
                                <div>
                                  <Input
                                    id="lsl-value"
                                    type="number"
                                    step="any"
                                    value={refLineConfig.lsl.value}
                                    onChange={(e) => setRefLineConfig({
                                      ...refLineConfig,
                                      lsl: { ...refLineConfig.lsl, value: e.target.value }
                                    })}
                                    placeholder="Enter LSL value"
                                    className="w-full"
                                  />
                                </div>
                                <div>
                                  <select
                                    id="lsl-color"
                                    value={refLineConfig.lsl.color}
                                    onChange={(e) => setRefLineConfig({
                                      ...refLineConfig,
                                      lsl: { ...refLineConfig.lsl, color: e.target.value }
                                    })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                                  >
                                    <option value="Dark Blue">Dark Blue</option>
                                    <option value="Dark Red">Dark Red</option>
                                    <option value="Dark Yellow">Dark Yellow</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <p className="text-xs text-purple-700 mt-3">
                            These values and colors will be used for reference lines in the JSL file. If left empty, values from the meta sheet will be used.
                          </p>
                        </div>
                      )}
                      
                      <p className="text-sm text-gray-500 mt-2">
                        {selectedCategoricalVariables.length === 0 
                          ? 'Please select at least one categorical variable to continue'
                          : `${selectedCategoricalVariables.length} variable(s) selected`}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <h4 className="font-medium text-yellow-900 mb-2">{t('plugin.wizard.noCatVar')}</h4>
                      <p className="text-sm text-yellow-800">No non-FAI columns found. Please ensure your Excel file has columns that do not contain "FAI".</p>
                    </div>
                  )
                ) : (
                  // Standard plugin: Single selection from categorical_columns
                  fileAnalysis.categorical_columns && fileAnalysis.categorical_columns.length > 0 ? (
                  <div className="space-y-4">
                  <div>
                    <Label htmlFor="categorical-variable">{t('plugin.wizard.catVar')}</Label>
                    <select
                      id="categorical-variable"
                      value={selectedCategoricalVariable}
                        onChange={(e) => {
                          setSelectedCategoricalVariable(e.target.value)
                          // Reset data type when variable changes
                          setVariableDataType('none')
                        }}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Choose a categorical variable...</option>
                      {fileAnalysis.categorical_columns.map((col: string) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                    <p className="text-sm text-gray-500 mt-1">
                      {t('plugin.wizard.catVarHint')}
                    </p>
                    </div>
                    
                    {/* Data Type/Modeling Type Selection for excel2commonality plugin */}
                    {isCommonalityPlugin && selectedCategoricalVariable && (
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <Label htmlFor="variable-data-type" className="text-sm font-medium text-blue-900">
                          Data Type / Modeling Type for "{selectedCategoricalVariable}"
                        </Label>
                        <p className="text-xs text-blue-700 mb-2 mt-1">
                          Select how this variable should be treated in JMP. This will add data type and modeling type settings to the JSL file.
                        </p>
                        <select
                          id="variable-data-type"
                          value={variableDataType}
                          onChange={(e) => setVariableDataType(e.target.value as 'character-nominal' | 'numeric-continuous' | 'none')}
                          className="mt-1 block w-full px-3 py-2 border border-blue-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
                        >
                          <option value="none">None (use default)</option>
                          <option value="character-nominal">Character - Nominal</option>
                          <option value="numeric-continuous">Numeric - Continuous</option>
                        </select>
                        {variableDataType !== 'none' && (
                          <p className="text-xs text-blue-700 mt-2">
                            {variableDataType === 'character-nominal' 
                              ? 'The variable will be set as Character data type with Nominal modeling type.'
                              : 'The variable will be set as Numeric data type with Continuous modeling type.'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 className="font-medium text-yellow-900 mb-2">{t('plugin.wizard.noCatVar')}</h4>
                    <p className="text-sm text-yellow-800">{t('plugin.wizard.noCatVarDesc')}</p>
                  </div>
                  )
                )}

                {/* Show fix information if file was automatically fixed */}
                {fixInfo?.applied && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="font-medium text-green-900">File Automatically Fixed!</span>
                    </div>
                    <p className="text-green-700 text-sm mt-1">
                      {fixInfo.message}
                    </p>
                  </div>
                )}

                {(isGenericPlugin ? selectedCategoricalVariables.length > 0 : selectedCategoricalVariable) && (
                  <div className="flex justify-center">
                    <Button onClick={handleNext} className="px-8">
                      <ChevronRight className="h-4 w-4 mr-2" />
                      {isGenericPlugin ? 'Continue to Generate Files' : t('plugin.wizard.continueValidation')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )

      case 'validation':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('plugin.wizard.validation')}</h3>
              <p className="text-gray-600">{t('plugin.wizard.validationDesc')}</p>
            </div>

            {validationResults.length === 0 && (
              <div className="flex justify-center">
                <Button onClick={handleValidateFile} className="px-8">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {t('plugin.wizard.validateFile')}
                </Button>
              </div>
            )}

            {validationResults.length > 0 && (
              <div className="space-y-4">
                {validationResults.map((result, index) => {
                  return (
                    <div key={index} className={`flex items-start space-x-3 p-4 border rounded-lg ${
                      result.valid ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                    }`}>
                      {result.valid ? (
                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                      ) : (
                        <Circle className="h-5 w-5 text-yellow-600 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <h4 className="font-medium">
                          Checkpoint {result.checkpoint}: {getCheckpointTitle(result.checkpoint)}
                        </h4>
                        <p className={`text-sm ${result.valid ? 'text-green-600' : 'text-yellow-600'}`}>
                          {result.message}
                        </p>
                        
                        {/* Display warnings if any */}
                        {result.details?.warnings && result.details.warnings.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <h5 className="text-sm font-medium text-yellow-800">Warnings:</h5>
                            {result.details.warnings.map((warning: any, warnIndex: number) => (
                              <div key={warnIndex} className="bg-yellow-100 border border-yellow-300 rounded p-2">
                                <p className="text-sm text-yellow-800 font-medium">{warning.message}</p>
                                {warning.details && (
                                  <details className="mt-1">
                                    <summary className="text-xs text-yellow-600 cursor-pointer">View Details</summary>
                                    <pre className="text-xs bg-yellow-50 p-2 mt-1 rounded overflow-auto">
                                      {JSON.stringify(warning.details, null, 2)}
                                    </pre>
                                  </details>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {result.details && !(result.details?.warnings && result.details.warnings.length > 0) && (
                          <details className="mt-2">
                            <summary className="text-xs text-gray-500 cursor-pointer">{t('plugin.wizard.viewDetails')}</summary>
                            <pre className="text-xs bg-gray-100 p-2 mt-1 rounded overflow-auto">
                              {JSON.stringify(result.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Show fix information if file was automatically fixed */}
            {fixInfo?.applied && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5 text-blue-600" />
                  <span className="font-medium text-blue-900">File Automatically Fixed!</span>
                </div>
                <p className="text-blue-700 text-sm mt-1">
                  {fixInfo.message}
                </p>
                <p className="text-blue-600 text-xs mt-2">
                  The system detected and corrected formatting issues in your Excel file. Validation can now proceed normally.
                </p>
              </div>
            )}

            {validationResults.length > 0 && (
              <div className={`border rounded-lg p-4 ${
                validationResults.some(r => r.details?.warnings && r.details.warnings.length > 0)
                  ? 'bg-yellow-50 border-yellow-200' 
                  : 'bg-green-50 border-green-200'
              }`}>
                <div className="flex items-center space-x-2">
                  {validationResults.some(r => r.details?.warnings && r.details.warnings.length > 0) ? (
                    <>
                      <Circle className="h-5 w-5 text-yellow-600" />
                      <span className="font-medium text-yellow-900">Validation completed with warnings</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="font-medium text-green-900">All validations passed!</span>
                    </>
                  )}
                </div>
                <p className={`text-sm mt-1 ${
                  validationResults.some(r => r.details?.warnings && r.details.warnings.length > 0)
                    ? 'text-yellow-700' 
                    : 'text-green-700'
                }`}>
                  {validationResults.some(r => r.details?.warnings && r.details.warnings.length > 0)
                    ? 'Some validation issues were found, but you can still proceed. Click "Continue" to proceed to boundary calculation.'
                    : 'Your Excel file is ready for processing. Click "Continue" to proceed to boundary calculation.'
                  }
                </p>
                <div className="flex justify-center mt-4">
                  <Button onClick={handleNext} className="px-8">
                    <ChevronRight className="h-4 w-4 mr-2" />
                    {t('plugin.wizard.continueBoundary')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )

      case 'boundary-calculation':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                <FileSpreadsheet className="h-8 w-8 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('plugin.wizard.boundary')}</h3>
              <p className="text-gray-600">{t('plugin.wizard.boundaryLong')}</p>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h4 className="font-medium text-purple-900 mb-2">{t('plugin.wizard.thisStep')}</h4>
              <ul className="text-sm text-purple-800 space-y-1">
                <li>• {t('plugin.wizard.stepAnalyze')}</li>
                <li>• {t('plugin.wizard.stepMinMax')}</li>
                <li>• {t('plugin.wizard.stepInc')}</li>
                <li>• {t('plugin.wizard.stepTick')}</li>
              </ul>
            </div>

            <div className="flex justify-center">
              <Button onClick={handleCalculateBoundaries} className="px-8">
                {t('plugin.wizard.calculate')}
              </Button>
            </div>
          </div>
        )

      case 'processing':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <FileSpreadsheet className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('plugin.wizard.processing')}</h3>
              <p className="text-gray-600">{isGenericPlugin ? 'Generate CSV and JSL files with selected categorical variables' : t('plugin.wizard.processingDesc')}</p>
            </div>

            {boundaryResults && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-medium text-green-900 mb-2">{t('plugin.wizard.boundaryResults')}</h4>
                <div className="text-sm text-green-800 space-y-1">
                  <p>• Min/Max values calculated successfully</p>
                  <p>• Increment values determined</p>
                  <p>• Tick intervals set</p>
                </div>
              </div>
            )}

            <div className="flex justify-center">
              <Button onClick={handleProcessFile} disabled={isProcessing} className="px-8">
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('plugin.wizard.processingDots')}
                  </>
                ) : (
                  t('plugin.wizard.processFiles')
                )}
              </Button>
            </div>
          </div>
        )

      case 'run-analysis':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <Play className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('plugin.wizard.running')}</h3>
              <p className="text-gray-600">{t('plugin.wizard.runningDesc')}</p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">{t('plugin.wizard.status')}</h4>
              {analysisSteps.length === 0 && (
                <p className="text-sm text-blue-800 mb-3">{t('plugin.wizard.clickStart')}</p>
              )}
              {analysisSteps.length > 0 && (
                <ul className="text-sm text-blue-800 space-y-2">
                  {analysisSteps.map((s, idx) => (
                    <li key={idx} className="flex items-center justify-between">
                      <span>{s.label}</span>
                      <span className={s.error ? 'text-red-600' : s.done ? 'text-green-600' : 'text-gray-500'}>
                        {s.error ? 'error' : s.done ? 'done' : 'pending'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {runId && (
                <div className="mt-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-blue-900 font-medium">{t('plugin.wizard.runId')}</span>
                    <span className="text-blue-800">{runId}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-blue-900 font-medium">{t('plugin.wizard.runStatus')}</span>
                    <span className="text-blue-800">
                      {runStatus || 'queued'}
                      {/* Show image count even if 0 during processing, but not if null/undefined */}
                      {(imageCount !== null && imageCount !== undefined) && (
                        <span className="ml-2 text-blue-600 font-semibold">
                          • {imageCount} image{imageCount !== 1 ? 's' : ''} generated
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Monitor Section - Shows WebSocket logs when run is active */}
            {runId && (
              <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-900 flex items-center">
                    <BarChart3 className="h-5 w-5 mr-2 text-gray-600" />
                    Monitor
                  </h4>
                  {runStatus && (
                    <span className={`text-xs font-medium px-2 py-1 rounded ${
                      runStatus === 'succeeded' ? 'bg-green-100 text-green-700' :
                      runStatus === 'failed' ? 'bg-red-100 text-red-700' :
                      runStatus === 'running' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {runStatus.toUpperCase()}
                    </span>
                  )}
                </div>
                
                <div className="bg-black rounded-md p-4 max-h-96 overflow-y-auto font-mono text-xs">
                  <div className="space-y-1">
                    {runMessagesWithTime.length > 0 ? (
                      <>
                        {runMessagesWithTime.map((item, idx) => {
                          const msg = item.message
                          const timeStr = item.timestamp.toLocaleTimeString()
                          const isArtifactMessage = msg.includes('Created artifact for') || 
                                                    msg.includes('Registered failure image artifact') || 
                                                    msg.includes('OCR text artifact') || 
                                                    msg.includes('OCR summary artifact')
                          const isError = msg.toLowerCase().includes('error') || msg.toLowerCase().includes('failed')
                          const isSuccess = msg.toLowerCase().includes('success') || msg.toLowerCase().includes('completed')
                          
                          let textColor = 'text-gray-300'
                          if (isArtifactMessage) {
                            textColor = 'text-green-400'
                          } else if (isError) {
                            textColor = 'text-red-400'
                          } else if (isSuccess) {
                            textColor = 'text-green-300'
                          }
                          
                          return (
                            <div key={idx} className={`break-words leading-relaxed ${textColor} ${isArtifactMessage ? 'font-semibold' : ''}`}>
                              <span className="text-gray-500 mr-2">[{timeStr}]</span>
                              <span className="text-gray-500 mr-2">{'>'}</span>
                              {msg}
                            </div>
                          )
                        })}
                        <div ref={messagesEndRef} />
                      </>
                    ) : runMessage ? (
                      <div className="break-words leading-relaxed text-gray-300">
                        <span className="text-gray-500 mr-2">[{new Date().toLocaleTimeString()}]</span>
                        <span className="text-gray-500 mr-2">{'>'}</span>
                        {runMessage}
                      </div>
                    ) : (
                      <div className="text-gray-500 italic">
                        Waiting for updates...
                      </div>
                    )}
                  </div>
                </div>
                
                {runMessagesWithTime.length > 0 && (
                  <div className="mt-2 text-xs text-gray-600">
                    {runMessagesWithTime.length} message{runMessagesWithTime.length !== 1 ? 's' : ''} received
                    {imageCount !== null && imageCount !== undefined && (
                      <span className="ml-2">• {imageCount} image{imageCount !== 1 ? 's' : ''} generated</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Thumbnail Viewer - Shows images directly from task folder */}
            {runId && (
              <div className="bg-white border border-gray-300 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-900 flex items-center">
                    <BarChart3 className="h-5 w-5 mr-2 text-gray-600" />
                    Image Thumbnails
                  </h4>
                  {taskImages.length > 0 && (
                    <span className="text-xs text-gray-600">
                      {taskImages.filter(img => 
                        imageSearchQuery === '' || 
                        img.filename.toLowerCase().includes(imageSearchQuery.toLowerCase())
                      ).length} of {taskImages.length} image{taskImages.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                
                {/* Search input */}
                {taskImages.length > 0 && (
                  <div className="mb-4">
                    <Input
                      type="text"
                      placeholder="Search images by filename..."
                      value={imageSearchQuery}
                      onChange={(e) => setImageSearchQuery(e.target.value)}
                      className="w-full"
                    />
                  </div>
                )}
                
                {taskImages.length > 0 ? (
                  (() => {
                    const filteredImages = taskImages.filter(img => 
                      imageSearchQuery === '' || 
                      img.filename.toLowerCase().includes(imageSearchQuery.toLowerCase())
                    )
                    
                    return filteredImages.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {filteredImages.map((image, idx) => (
                          <div 
                            key={idx} 
                            className="relative group cursor-pointer border border-gray-200 rounded-lg overflow-hidden hover:border-blue-400 transition-colors bg-white"
                            onClick={() => window.open(image.url, '_blank')}
                          >
                            <div className="aspect-square bg-gray-100 flex items-center justify-center">
                              <img 
                                src={image.url}
                                alt={image.filename}
                                className="w-full h-full object-contain"
                                loading="lazy"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement
                                  target.style.display = 'none'
                                  const parent = target.parentElement
                                  if (parent) {
                                    parent.innerHTML = `<div class="text-xs text-gray-400 p-2 text-center">Failed to load</div>`
                                  }
                                }}
                              />
                            </div>
                            {/* Always visible filename */}
                            <div className="bg-gray-50 border-t border-gray-200 px-2 py-1.5">
                              <div className="text-xs text-gray-700 font-medium truncate" title={image.filename}>
                                {image.filename}
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {(image.size / 1024).toFixed(1)} KB
                              </div>
                            </div>
                            {/* Size badge on hover */}
                            <div className="absolute top-1 right-1 bg-black bg-opacity-50 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                              {(image.size / 1024).toFixed(1)} KB
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500 text-sm">
                        <p>No images match "{imageSearchQuery}"</p>
                      </div>
                    )
                  })()
                ) : (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    {runStatus === 'running' || runStatus === 'queued' ? (
                      <div className="flex flex-col items-center">
                        <Loader2 className="h-6 w-6 animate-spin mb-2" />
                        <p>Waiting for images to be generated...</p>
                      </div>
                    ) : (
                      <p>No images found in task folder</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {!runId && (
              <div className="flex justify-center">
                <Button 
                  onClick={handleRunAnalysis} 
                  disabled={
                    isStartingAnalysis || 
                    !excelFile || 
                    (isGenericPlugin ? selectedCategoricalVariables.length === 0 : !selectedCategoricalVariable)
                  } 
                  className="px-8"
                >
                  {isStartingAnalysis ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('plugin.wizard.starting')}
                    </>
                  ) : (
                    t('plugin.wizard.start')
                  )}
                </Button>
              </div>
            )}

            <div className="flex justify-center">
              <Button onClick={handleComplete} className="px-8">
                {t('plugin.wizard.goToProject')}
              </Button>
            </div>
          </div>
        )

      default:
        // Fallback for unknown step IDs
        return (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-gray-600">Unknown step: {currentStepId}</p>
            </div>
          </div>
        )
    }
  }

  if (!projectId || !projectInfo) {
    return (
      <div className="container mx-auto py-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-600 mt-2">Loading project information...</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <Button 
          variant="outline" 
          onClick={handleCancel}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Plugin Selection
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Excel Processing Wizard</h1>
        <p className="text-gray-600 mt-2">
          Processing Excel file for project: <strong>{projectInfo.name}</strong>
        </p>
      </div>

      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Plugin: {pluginName}</CardTitle>
          <p className="text-sm text-gray-500">Step {currentStep + 1} of {steps.length}</p>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-6">
            {steps.map((step, index) => (
              <div key={step.id} className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center 
                              ${index === currentStep ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}
                              ${index < currentStep ? 'bg-green-500 text-white' : ''}`}
                >
                  {step.icon}
                </div>
                <span className="text-xs mt-1 text-center max-w-20">{step.title}</span>
              </div>
            ))}
          </div>

          <div className="border-t pt-6">
            {renderStepContent()}
          </div>

          <div className="flex justify-between mt-6">
            <Button onClick={handleBack} disabled={currentStep === 0} variant="outline">
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="flex space-x-2">
              <Button onClick={handleCancel} variant="outline">
                Cancel
              </Button>
              {/* Only show Next button on steps where it makes sense and user can proceed */}
              {currentStep === 0 && excelFile && (
                <Button onClick={handleAnalyzeFile}>
                  <ChevronRight className="h-4 w-4 mr-2" />
                  Analyze File
                </Button>
              )}
              {currentStep === 1 && (isGenericPlugin ? selectedCategoricalVariables.length > 0 : selectedCategoricalVariable) && (
                <Button onClick={handleNext}>
                  <ChevronRight className="h-4 w-4 mr-2" />
                  {isGenericPlugin ? 'Continue to Generate Files' : 'Next'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function ExcelProcessingWizard() {
  return (
    <Suspense fallback={
      <div className="container mx-auto py-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-600 mt-2">Loading wizard...</p>
      </div>
    }>
      <ExcelProcessingWizardContent />
    </Suspense>
  )
}

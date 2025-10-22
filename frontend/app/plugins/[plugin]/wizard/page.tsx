'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  ChevronLeft, 
  ChevronRight, 
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
  const projectId = searchParams.get('projectId')
  const pluginName = searchParams.get('plugin') || 'excel2boxplotv1'
  
  const [currentStep, setCurrentStep] = useState(0)
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [fileAnalysis, setFileAnalysis] = useState<any>(null)
  const [selectedCategoricalVariable, setSelectedCategoricalVariable] = useState<string>('')
  const [validationResults, setValidationResults] = useState<any[]>([])
  const [boundaryResults, setBoundaryResults] = useState<any>(null)
  const [fixInfo, setFixInfo] = useState<any>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [projectInfo, setProjectInfo] = useState<any>(null)
  const [analysisSteps, setAnalysisSteps] = useState<Array<{ label: string; done: boolean; error?: string }>>([])
  const [runId, setRunId] = useState<string | null>(null)
  const [runStatus, setRunStatus] = useState<string | null>(null)
  const [isStartingAnalysis, setIsStartingAnalysis] = useState(false)

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
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/projects/${projectId}`, {
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

  const steps: WizardStep[] = [
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
      formData.append('file', excelFile)

      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/extensions/${pluginName}/load-file`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (response.ok) {
        const result = await response.json()
        setFileAnalysis(result)
        
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
    if (!excelFile || !selectedCategoricalVariable) return

    try {
      const formData = new FormData()
      formData.append('file', excelFile)
      formData.append('cat_var', selectedCategoricalVariable)

      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/extensions/${pluginName}/validate-data`, {
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
      formData.append('file', excelFile)
      formData.append('cat_var', selectedCategoricalVariable)

      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/extensions/${pluginName}/process-data`, {
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
    if (!excelFile || !selectedCategoricalVariable) return

    setIsProcessing(true)
    try {
      const formData = new FormData()
      formData.append('file', excelFile)
      formData.append('cat_var', selectedCategoricalVariable)

      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/extensions/${pluginName}/generate-files`, {
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
    if (!excelFile || !selectedCategoricalVariable || !projectId || !projectInfo) return

    setIsStartingAnalysis(true)
    setAnalysisSteps([
      { label: 'Generating CSV and JSL from Excel', done: false },
      { label: 'Saving files to storage', done: false },
      { label: 'Creating run', done: false }
    ])

    try {
      const formData = new FormData()
      formData.append('file', excelFile)
      formData.append('cat_var', selectedCategoricalVariable)
      formData.append('project_id', String(projectId))
      formData.append('project_name', projectInfo?.name || 'Analysis')
      formData.append('project_description', projectInfo?.description || '')

      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/extensions/${pluginName}/run-analysis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err?.error || err?.detail || 'Failed to start analysis')
      }

      const result = await response.json()

      // Mark generation and save steps as done (backend does both before run creation)
      setAnalysisSteps(prev => prev.map((s, i) => ({ ...s, done: i <= 1 ? true : s.done })))

      // Created run
      const createdRunId = result?.run?.id
      if (createdRunId) {
        setRunId(createdRunId)
        setAnalysisSteps(prev => prev.map((s, i) => ({ ...s, done: i <= 2 ? true : s.done })))
        setRunStatus(result?.run?.status || 'queued')
        // Begin polling
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
        const resp = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/runs/${id}`)
        if (!resp.ok) return
        const run = await resp.json()
        setRunStatus(run.status)

        if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled') {
          clearInterval(timer)
        }
      } catch {}

      if (attempts >= maxAttempts) clearInterval(timer)
    }, interval)
  }

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
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6">
            <div>
              <Label htmlFor="excel-file">{t('plugin.wizard.selectExcel')}</Label>
              <Input
                id="excel-file"
                type="file"
                accept=".xlsx,.xls,.xlsm"
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

      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <BarChart3 className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('plugin.wizard.selectCatVar')}</h3>
              <p className="text-gray-600">{t('plugin.wizard.selectCatVarDesc')}</p>
            </div>

            {fileAnalysis && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">{t('plugin.wizard.fileAnalysis')}</h4>
                  <div className="text-sm text-blue-800 space-y-1">
                    <p>• <strong>Sheets found:</strong> {fileAnalysis.sheets?.join(', ')}</p>
                    <p>• <strong>Data shape:</strong> {fileAnalysis.data_shape?.[0]} rows × {fileAnalysis.data_shape?.[1]} columns</p>
                    <p>• <strong>FAI columns:</strong> {fileAnalysis.fai_columns?.length || 0} found</p>
                    <p>• <strong>Categorical variables:</strong> {fileAnalysis.categorical_columns?.length || 0} available</p>
                  </div>
                </div>

                {fileAnalysis.categorical_columns && fileAnalysis.categorical_columns.length > 0 ? (
                  <div>
                    <Label htmlFor="categorical-variable">{t('plugin.wizard.catVar')}</Label>
                    <select
                      id="categorical-variable"
                      value={selectedCategoricalVariable}
                      onChange={(e) => setSelectedCategoricalVariable(e.target.value)}
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
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 className="font-medium text-yellow-900 mb-2">{t('plugin.wizard.noCatVar')}</h4>
                    <p className="text-sm text-yellow-800">{t('plugin.wizard.noCatVarDesc')}</p>
                  </div>
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

                {selectedCategoricalVariable && (
                  <div className="flex justify-center">
                    <Button onClick={handleNext} className="px-8">
                      <ChevronRight className="h-4 w-4 mr-2" />
                      {t('plugin.wizard.continueValidation')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )

      case 2:
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

      case 3:
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

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <FileSpreadsheet className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('plugin.wizard.processing')}</h3>
              <p className="text-gray-600">{t('plugin.wizard.processingDesc')}</p>
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

      case 5:
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
                    <span className="text-blue-800">{runStatus || 'queued'}</span>
                  </div>
                </div>
              )}
            </div>

            {!runId && (
              <div className="flex justify-center">
                <Button onClick={handleRunAnalysis} disabled={isStartingAnalysis || !excelFile || !selectedCategoricalVariable} className="px-8">
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
        return null
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
              {currentStep === 1 && selectedCategoricalVariable && (
                <Button onClick={handleNext}>
                  <ChevronRight className="h-4 w-4 mr-2" />
                  Next
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

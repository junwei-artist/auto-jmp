'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle, 
  Circle, 
  Upload, 
  FileSpreadsheet,
  Play,
  BarChart3
} from 'lucide-react'

interface WizardStep {
  id: string
  title: string
  description: string
  icon: React.ReactNode
}

interface PluginWizardProps {
  pluginName: string
  pluginDescription: string
  onComplete: (projectId: string) => void
  onCancel: () => void
}

export default function PluginWizard({ pluginName, pluginDescription, onComplete, onCancel }: PluginWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [projectData, setProjectData] = useState({
    name: '',
    description: '',
    isPublic: false
  })
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [validationResults, setValidationResults] = useState<any[]>([])
  const [boundaryResults, setBoundaryResults] = useState<any>(null)
  const [fixInfo, setFixInfo] = useState<any>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [projectId, setProjectId] = useState<string | null>(null)

  // Check authentication on component mount
  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      alert('Please log in to use plugins')
      onCancel()
    }
  }, [onCancel])

  const steps: WizardStep[] = [
    {
      id: 'project-info',
      title: 'Project Information',
      description: 'Set up your project details',
      icon: <BarChart3 className="h-5 w-5" />
    },
    {
      id: 'file-upload',
      title: 'Upload Excel File',
      description: 'Select and validate your Excel file',
      icon: <Upload className="h-5 w-5" />
    },
    {
      id: 'validation',
      title: 'Data Validation',
      description: 'Validate structure, metadata, and data quality',
      icon: <CheckCircle className="h-5 w-5" />
    },
    {
      id: 'boundary-calculation',
      title: 'Boundary Calculation',
      description: 'Calculate min, max, inc, tick values',
      icon: <FileSpreadsheet className="h-5 w-5" />
    },
    {
      id: 'processing',
      title: 'File Processing',
      description: 'Generate CSV and JSL files',
      icon: <FileSpreadsheet className="h-5 w-5" />
    },
    {
      id: 'run-analysis',
      title: 'Run Analysis',
      description: 'Monitor your analysis progress',
      icon: <Play className="h-5 w-5" />
    }
  ]

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleCreateProject = async () => {
    try {
      const token = localStorage.getItem('access_token')
      if (!token) {
        alert('Please log in to create a project')
        return
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/projects/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: projectData.name,
          description: projectData.description,
          plugin_name: pluginName,
          is_public: projectData.isPublic
        })
      })

      if (response.ok) {
        const project = await response.json()
        setProjectId(project.id)
        handleNext()
      } else {
        const errorData = await response.json()
        console.error('Failed to create project:', errorData)
        alert(`Failed to create project: ${errorData.detail || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error creating project:', error)
      alert('Error creating project. Please try again.')
    }
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setExcelFile(file)
    }
  }

  const handleValidateFile = async () => {
    if (!excelFile || !projectId) return

    try {
      const formData = new FormData()
      formData.append('file', excelFile)

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/extensions/${pluginName}/validate`, {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const result = await response.json()
        setValidationResults(result.checkpoints || [])
        
        // Check if file was automatically fixed
        if (result.fix_applied) {
          setFixInfo({
            applied: true,
            message: result.fix_message
          })
          alert(`✅ File automatically fixed!\n\n${result.fix_message}\n\nThe file has been corrected and validation passed.`)
        }
        
        if (result.valid) {
          handleNext()
        } else {
          alert('Validation failed. Please check your Excel file structure.')
        }
      } else {
        const errorData = await response.json()
        alert(`Validation failed: ${errorData.detail || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error validating file:', error)
      alert('Error validating file. Please try again.')
    }
  }

  const handleCalculateBoundaries = async () => {
    if (!excelFile || !projectId) return

    try {
      const formData = new FormData()
      formData.append('file', excelFile)

      // Call a new endpoint for boundary calculation
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/extensions/${pluginName}/calculate-boundaries`, {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const result = await response.json()
        setBoundaryResults(result)
        handleNext()
      } else {
        const errorData = await response.json()
        alert(`Boundary calculation failed: ${errorData.detail || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error calculating boundaries:', error)
      alert('Error calculating boundaries. Please try again.')
    }
  }

  const handleProcessFile = async () => {
    if (!excelFile || !projectId) return

    setIsProcessing(true)
    try {
      const formData = new FormData()
      formData.append('file', excelFile)
      formData.append('project_id', projectId)

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/extensions/${pluginName}/process`, {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const result = await response.json()
        console.log('Processing successful:', result)
        // Here you would upload the CSV and JSL files to the project
        // and trigger the JMP runner
        handleNext()
      } else {
        const errorData = await response.json()
        console.error('Processing failed:', errorData)
        alert(`Processing failed: ${errorData.detail || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error processing file:', error)
      alert(`Error processing file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6">
            <div>
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                value={projectData.name}
                onChange={(e) => setProjectData({ ...projectData, name: e.target.value })}
                placeholder="Enter project name..."
                className="mt-1"
              />
            </div>
            
            <div>
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                value={projectData.description}
                onChange={(e) => setProjectData({ ...projectData, description: e.target.value })}
                placeholder="Enter project description..."
                className="mt-1"
                rows={3}
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is-public"
                checked={projectData.isPublic}
                onChange={(e) => setProjectData({ ...projectData, isPublic: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="is-public">Make this project public</Label>
            </div>
          </div>
        )

      case 1:
        return (
          <div className="space-y-6">
            <div>
              <Label htmlFor="excel-file">Select Excel File</Label>
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
          </div>
        )

      case 2:
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              {validationResults.map((result, index) => (
                <div key={index} className="flex items-start space-x-3 p-4 border rounded-lg">
                  {result.valid ? (
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  ) : (
                    <Circle className="h-5 w-5 text-red-600 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <h4 className="font-medium">
                      Checkpoint {result.checkpoint}: {getCheckpointTitle(result.checkpoint)}
                    </h4>
                    <p className={`text-sm ${result.valid ? 'text-green-600' : 'text-red-600'}`}>
                      {result.valid ? result.message : result.error}
                    </p>
                    {result.details && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-500 cursor-pointer">View Details</summary>
                        <pre className="text-xs bg-gray-100 p-2 mt-1 rounded overflow-auto">
                          {JSON.stringify(result.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>

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

            {validationResults.every(r => r.valid) && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-900">All validations passed!</span>
                </div>
                <p className="text-green-700 text-sm mt-1">
                  Your Excel file is ready for processing. Click "Process & Run Analysis" to generate CSV and JSL files and start the analysis.
                </p>
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
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Boundary Calculation</h3>
              <p className="text-gray-600">
                Calculate min, max, inc, and tick values based on your data and specifications.
              </p>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h4 className="font-medium text-purple-900 mb-2">What this step does:</h4>
              <ul className="text-sm text-purple-800 space-y-1">
                <li>• Analyzes data ranges and USL/LSL specifications</li>
                <li>• Calculates optimal min/max values for charts</li>
                <li>• Determines appropriate increment (inc) values</li>
                <li>• Sets tick mark intervals for better visualization</li>
              </ul>
            </div>

            <div className="flex justify-center">
              <Button onClick={handleCalculateBoundaries} className="px-8">
                Calculate Boundaries
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
              <h3 className="text-lg font-semibold text-gray-900 mb-2">File Processing</h3>
              <p className="text-gray-600">
                Generate CSV and JSL files from your Excel data.
              </p>
            </div>

            {boundaryResults && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-medium text-green-900 mb-2">Boundary Calculation Results:</h4>
                <div className="text-sm text-green-800 space-y-1">
                  <p>• Min/Max values calculated successfully</p>
                  <p>• Increment values determined</p>
                  <p>• Tick intervals set</p>
                </div>
              </div>
            )}

            <div className="flex justify-center">
              <Button onClick={handleProcessFile} disabled={isProcessing} className="px-8">
                {isProcessing ? 'Processing...' : 'Process Files'}
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
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Analysis Running</h3>
              <p className="text-gray-600">
                Your analysis is now running. You can monitor the progress in the runs section.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">What happens next?</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• CSV and JSL files are generated from your Excel data</li>
                <li>• JMP runner processes the files to create visualizations</li>
                <li>• Results are saved to your project</li>
                <li>• You can view the gallery of generated images</li>
              </ul>
            </div>

            <div className="flex justify-center">
              <Button onClick={() => onComplete(projectId!)} className="px-8">
                Go to Project Dashboard
              </Button>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const getCheckpointTitle = (checkpoint: number) => {
    switch (checkpoint) {
      case 1: return "Excel Structure Validation"
      case 2: return "Metadata Validation"
      case 3: return "Data Quality Validation"
      case 4: return "Processing Complete"
      default: return "Unknown Checkpoint"
    }
  }

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return projectData.name.trim() !== ''
      case 1:
        return excelFile !== null
      case 2:
        return validationResults.every(r => r.valid)
      case 3:
        return true
      default:
        return false
    }
  }

  const getNextButtonText = () => {
    switch (currentStep) {
      case 0:
        return 'Create Project'
      case 1:
        return 'Validate File'
      case 2:
        return 'Process & Run Analysis'
      case 3:
        return 'Complete'
      default:
        return 'Next'
    }
  }

  const handleNextClick = () => {
    switch (currentStep) {
      case 0:
        handleCreateProject()
        break
      case 1:
        handleValidateFile()
        break
      case 2:
        handleProcessFile()
        break
      case 3:
        onComplete(projectId!)
        break
      default:
        handleNext()
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {pluginName} - Project Setup
        </h1>
        <p className="text-gray-600">{pluginDescription}</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-8">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
              index <= currentStep 
                ? 'bg-blue-600 border-blue-600 text-white' 
                : 'bg-white border-gray-300 text-gray-400'
            }`}>
              {index < currentStep ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                step.icon
              )}
            </div>
            <div className="ml-3">
              <p className={`text-sm font-medium ${
                index <= currentStep ? 'text-blue-600' : 'text-gray-400'
              }`}>
                {step.title}
              </p>
              <p className="text-xs text-gray-500">{step.description}</p>
            </div>
            {index < steps.length - 1 && (
              <div className={`w-16 h-0.5 mx-4 ${
                index < currentStep ? 'bg-blue-600' : 'bg-gray-300'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            {steps[currentStep].icon}
            <span>{steps[currentStep].title}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {renderStepContent()}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <Button
          variant="outline"
          onClick={currentStep === 0 ? onCancel : handlePrevious}
          disabled={isProcessing}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          {currentStep === 0 ? 'Cancel' : 'Previous'}
        </Button>

        <Button
          onClick={handleNextClick}
          disabled={!canProceed() || isProcessing}
        >
          {isProcessing ? 'Processing...' : getNextButtonText()}
          {!isProcessing && (
            <ChevronRight className="h-4 w-4 ml-2" />
          )}
        </Button>
      </div>
    </div>
  )
}

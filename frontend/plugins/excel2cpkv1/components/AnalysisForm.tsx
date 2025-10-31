'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { pluginRegistry } from '@/lib/plugins/registry'

interface CheckpointResult {
  valid: boolean
  checkpoint: number
  message?: string
  error?: string
  details?: any
  has_errors?: boolean
  has_warnings?: boolean
}

export default function AnalysisForm() {
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [checkpoints, setCheckpoints] = useState<CheckpointResult[]>([])
  const [currentStep, setCurrentStep] = useState<'upload' | 'validate' | 'process' | 'complete'>('upload')

  const validateMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      // Stamp excel filename with timestamp + uuid
      const ts = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace('T', '_')
        .slice(0, 15)
      const uid = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10))
      const dot = file.name.lastIndexOf('.')
      const base = dot > -1 ? file.name.slice(0, dot) : file.name
      const ext = dot > -1 ? file.name.slice(dot) : ''
      const stampedName = `${base}_${ts}_${uid}${ext}`
      const stampedFile = new File([file], stampedName, { type: file.type })
      formData.append('file', stampedFile)
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/extensions/excel2cpkv1/validate`, {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Validation failed')
      }
      
      return response.json()
    },
    onSuccess: (data) => {
      setCheckpoints(data.checkpoints || [])
      if (data.valid) {
        setCurrentStep('process')
      }
    },
    onError: (error) => {
      console.error('Validation error:', error)
    }
  })

  const processMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('project_name', projectName)
      formData.append('project_description', projectDescription)
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/extensions/excel2cpkv1/create-project`, {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Processing failed')
      }
      
      return response.json()
    },
    onSuccess: (data) => {
      setCurrentStep('complete')
      // Here you would typically redirect to the created project
      console.log('CPK Project created:', data)
    },
    onError: (error) => {
      console.error('Processing error:', error)
    }
  })

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setExcelFile(file)
      setCurrentStep('validate')
    }
  }

  const handleValidate = () => {
    if (excelFile) {
      validateMutation.mutate(excelFile)
    }
  }

  const handleProcess = () => {
    if (excelFile) {
      processMutation.mutate(excelFile)
    }
  }

  const getCheckpointIcon = (checkpoint: CheckpointResult) => {
    if (checkpoint.valid) {
      return <CheckCircle className="h-5 w-5 text-green-600" />
    } else {
      return <XCircle className="h-5 w-5 text-red-600" />
    }
  }

  const getCheckpointTitle = (checkpoint: number) => {
    switch (checkpoint) {
      case 1: return "Excel Structure Validation"
      case 2: return "Spec Data Validation"
      case 3: return "Data Matching Validation"
      case 4: return "Processing Complete"
      default: return "Unknown Checkpoint"
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* File Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileSpreadsheet className="h-5 w-5" />
            <span>Excel File Upload (CPK Analysis)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
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
            
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-medium text-blue-800 mb-2">Required Excel Structure:</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• <strong>data</strong> sheet: Contains measurement data with FAI* columns</li>
                <li>• <strong>spec</strong> or <strong>meta</strong> sheet: Contains specification limits</li>
                <li>• For 'spec': columns should be test_name, usl, lsl, target</li>
                <li>• For 'meta': columns should be Y Variable, USL, LSL, Target</li>
              </ul>
            </div>
            
            {excelFile && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-800">
                  File selected: {excelFile.name}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Project Configuration */}
      {excelFile && (
        <Card>
          <CardHeader>
            <CardTitle>Project Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="project-name">Project Name</Label>
                <Input
                  id="project-name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Enter project name..."
                />
              </div>
              
              <div>
                <Label htmlFor="project-description">Project Description</Label>
                <Input
                  id="project-description"
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  placeholder="Enter project description..."
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Checkpoints */}
      {checkpoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>CPK Validation Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {checkpoints.map((checkpoint, index) => (
                <div key={index} className="flex items-start space-x-3 p-3 border rounded-lg">
                  {getCheckpointIcon(checkpoint)}
                  <div className="flex-1">
                    <h4 className="font-medium">{getCheckpointTitle(checkpoint.checkpoint)}</h4>
                    <p className={`text-sm ${checkpoint.valid ? 'text-green-600' : 'text-red-600'}`}>
                      {checkpoint.valid ? checkpoint.message : checkpoint.error}
                    </p>
                    {checkpoint.has_errors && (
                      <p className="text-sm text-red-600 mt-1">⚠️ Validation errors found</p>
                    )}
                    {checkpoint.has_warnings && (
                      <p className="text-sm text-yellow-600 mt-1">⚠️ Validation warnings found</p>
                    )}
                    {checkpoint.details && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-500 cursor-pointer">View Details</summary>
                        <pre className="text-xs bg-gray-100 p-2 mt-1 rounded overflow-auto">
                          {JSON.stringify(checkpoint.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <Card>
        <CardContent className="p-6">
          <div className="flex space-x-4">
            {currentStep === 'validate' && (
              <Button 
                onClick={handleValidate}
                disabled={validateMutation.isPending}
                className="flex-1"
              >
                {validateMutation.isPending ? 'Validating...' : 'Start CPK Validation'}
              </Button>
            )}
            
            {currentStep === 'process' && (
              <Button 
                onClick={handleProcess}
                disabled={processMutation.isPending}
                className="flex-1"
              >
                {processMutation.isPending ? 'Processing...' : 'Create Project & Generate CPK Analysis'}
              </Button>
            )}
            
            {currentStep === 'complete' && (
              <div className="flex items-center space-x-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span>CPK Project created successfully!</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

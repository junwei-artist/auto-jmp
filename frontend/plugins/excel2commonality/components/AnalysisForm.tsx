'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert-simple'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react'
import { useCommonalityAnalysis } from '../hooks/useCommonalityAnalysis'

interface AnalysisFormProps {
  onComplete?: (projectId: string) => void
}

export function AnalysisForm({ onComplete }: AnalysisFormProps) {
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [validationResults, setValidationResults] = useState<any[]>([])
  
  const { processFile, isLoading, error } = useCommonalityAnalysis()

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setExcelFile(file)
      setValidationResults([])
    }
  }

  const handleValidateFile = async () => {
    if (!excelFile) return

    try {
      const formData = new FormData()
      formData.append('file', excelFile)

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/extensions/excel2commonality/validate`, {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const result = await response.json()
        setValidationResults(result.checkpoints || [])
        
        if (result.fix_applied) {
          alert(`✅ File automatically fixed!\n\n${result.fix_message}\n\nThe file has been corrected and validation passed.`)
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

  const handleProcessFile = async () => {
    if (!excelFile || !projectName.trim()) return

    try {
      const result = await processFile(excelFile, projectName, projectDescription)
      
      if (result.success) {
        alert('✅ Commonality analysis completed successfully!')
        if (onComplete) {
          onComplete(result.project_id || 'unknown')
        }
      } else {
        alert(`❌ Processing failed: ${result.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error processing file:', error)
      alert('Error processing file. Please try again.')
    }
  }

  const isValidationPassed = validationResults.length > 0 && validationResults.every(r => r.valid)
  const canProcess = excelFile && projectName.trim() && isValidationPassed

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Commonality Analysis
          </CardTitle>
          <CardDescription>
            Upload an Excel file with required columns: 测试时间, EGL铆接治具号, EGL焊接治具号, 镍片放料工位, AFMT治具
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Project Information */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="projectName">Project Name *</Label>
              <Input
                id="projectName"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Enter project name"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="projectDescription">Project Description</Label>
              <Textarea
                id="projectDescription"
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Enter project description (optional)"
                className="mt-1"
                rows={3}
              />
            </div>
          </div>

          {/* File Upload */}
          <div className="space-y-4">
            <Label>Excel File *</Label>
            <div className="flex items-center gap-4">
              <Input
                type="file"
                accept=".xlsx,.xls,.xlsm,.xlsb"
                onChange={handleFileUpload}
                className="flex-1"
              />
              {excelFile && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  {excelFile.name}
                </div>
              )}
            </div>
          </div>

          {/* Validation Results */}
          {validationResults.length > 0 && (
            <div className="space-y-2">
              <Label>Validation Results</Label>
              {validationResults.map((result, index) => (
                <Alert key={index} className={result.valid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
                  <div className="flex items-center gap-2">
                    {result.valid ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-600" />
                    )}
                    <AlertDescription>
                      <strong>Checkpoint {result.checkpoint}:</strong> {result.message}
                    </AlertDescription>
                  </div>
                </Alert>
              ))}
            </div>
          )}

          {/* Error Display */}
          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            <Button
              onClick={handleValidateFile}
              disabled={!excelFile}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              Validate File
            </Button>
            <Button
              onClick={handleProcessFile}
              disabled={!canProcess || isLoading}
              className="flex items-center gap-2"
            >
              {isLoading ? 'Processing...' : 'Go to Commonality Analysis'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default AnalysisForm

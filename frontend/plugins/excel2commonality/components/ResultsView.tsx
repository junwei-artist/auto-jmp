'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download, FileSpreadsheet, BarChart3, CheckCircle } from 'lucide-react'

interface ResultsViewProps {
  results: {
    success: boolean
    message: string
    files?: {
      csv_content: string
      jsl_content: string
      csv_filename: string
      jsl_filename: string
    }
    details?: {
      file_format: string
      data_sheet: string
      fai_columns_found: number
      fai_columns: string[]
      timestamp: string
    }
  }
  onDownload?: (filename: string, content: string, type: string) => void
}

export function ResultsView({ results, onDownload }: ResultsViewProps) {
  const handleDownload = (filename: string, content: string, type: string) => {
    if (onDownload) {
      onDownload(filename, content, type)
    } else {
      // Default download behavior
      const blob = new Blob([content], { type: type === 'csv' ? 'text/csv' : 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  if (!results.success) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-red-600">
            <p className="text-lg font-medium">Analysis Failed</p>
            <p className="text-sm">{results.message}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Success Message */}
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle className="h-5 w-5" />
            <p className="text-lg font-medium">{results.message}</p>
          </div>
        </CardContent>
      </Card>

      {/* Analysis Details */}
      {results.details && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Analysis Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500">File Format</p>
                <Badge variant="outline">{results.details.file_format}</Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Data Sheet</p>
                <p className="text-sm">{results.details.data_sheet}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">FAI Columns Found</p>
                <Badge variant="default">{results.details.fai_columns_found}</Badge>
              </div>
              <div className="md:col-span-2 lg:col-span-3">
                <p className="text-sm font-medium text-gray-500">FAI Columns</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {results.details.fai_columns.map((column) => (
                    <Badge key={column} variant="secondary">
                      {column}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generated Files */}
      {results.files && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Generated Files
            </CardTitle>
            <CardDescription>
              Download the generated CSV and JSL files for your commonality analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* CSV File */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">CSV Data File</h4>
                  <Badge variant="outline">Data</Badge>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Processed data ready for analysis
                </p>
                <Button
                  onClick={() => handleDownload(
                    results.files!.csv_filename,
                    results.files!.csv_content,
                    'csv'
                  )}
                  className="w-full"
                  variant="outline"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download CSV
                </Button>
              </div>

              {/* JSL File */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">JSL Script File</h4>
                  <Badge variant="outline">Script</Badge>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  JMP script for multi-variable visualization
                </p>
                <Button
                  onClick={() => handleDownload(
                    results.files!.jsl_filename,
                    results.files!.jsl_content,
                    'jsl'
                  )}
                  className="w-full"
                  variant="outline"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download JSL
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next Steps */}
      <Card>
        <CardHeader>
          <CardTitle>Next Steps</CardTitle>
          <CardDescription>
            How to use the generated files for your commonality analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                1
              </div>
              <div>
                <p className="font-medium">Download the files</p>
                <p className="text-sm text-gray-600">
                  Download both the CSV data file and JSL script file
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                2
              </div>
              <div>
                <p className="font-medium">Open in JMP</p>
                <p className="text-sm text-gray-600">
                  Open JMP and run the JSL script to generate multi-variable visualizations
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                3
              </div>
              <div>
                <p className="font-medium">Analyze results</p>
                <p className="text-sm text-gray-600">
                  Review the generated graphs for each FAI variable across different factors
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default ResultsView

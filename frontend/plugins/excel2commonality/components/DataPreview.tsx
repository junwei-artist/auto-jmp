'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react'

interface DataPreviewProps {
  validationResults: any[]
  fileInfo?: {
    name: string
    size: number
    lastModified: Date
  }
}

export function DataPreview({ validationResults, fileInfo }: DataPreviewProps) {
  const getStatusIcon = (valid: boolean) => {
    return valid ? (
      <CheckCircle className="h-4 w-4 text-green-600" />
    ) : (
      <AlertCircle className="h-4 w-4 text-red-600" />
    )
  }

  const getStatusBadge = (valid: boolean) => {
    return (
      <Badge variant={valid ? 'default' : 'destructive'}>
        {valid ? 'Valid' : 'Invalid'}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      {/* File Information */}
      {fileInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              File Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500">File Name</p>
                <p className="text-sm">{fileInfo.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">File Size</p>
                <p className="text-sm">{(fileInfo.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Last Modified</p>
                <p className="text-sm">{fileInfo.lastModified.toLocaleDateString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Results */}
      <Card>
        <CardHeader>
          <CardTitle>Validation Results</CardTitle>
          <CardDescription>
            Checkpoint validation for commonality analysis requirements
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-full">
              <div className="grid grid-cols-4 gap-4 p-2 bg-gray-50 border-b font-medium">
                <div>Checkpoint</div>
                <div>Status</div>
                <div>Message</div>
                <div>Details</div>
              </div>
              {validationResults.map((result, index) => (
                <div key={index} className="grid grid-cols-4 gap-4 p-2 border-b">
                  <div className="font-medium">
                    Checkpoint {result.checkpoint}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(result.valid)}
                      {getStatusBadge(result.valid)}
                    </div>
                  </div>
                  <div>{result.message}</div>
                  <div>
                    {result.details && (
                      <div className="text-sm text-gray-600">
                        {Object.entries(result.details).map(([key, value]) => (
                          <div key={key}>
                            <strong>{key}:</strong> {String(value)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Required Columns Info */}
      <Card>
        <CardHeader>
          <CardTitle>Required Columns</CardTitle>
          <CardDescription>
            The following columns must be present in your Excel file for commonality analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {["测试时间", "EGL铆接治具号", "EGL焊接治具号", "镍片放料工位", "AFMT治具"].map((column) => (
              <div key={column} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">{column}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default DataPreview

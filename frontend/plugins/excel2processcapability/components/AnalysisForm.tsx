'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, FileSpreadsheet } from 'lucide-react'

export default function AnalysisForm() {
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [sheetName, setSheetName] = useState('')
  const [chartType, setChartType] = useState('cpk_analysis')
  const [specLower, setSpecLower] = useState('')
  const [specUpper, setSpecUpper] = useState('')

  const analyzeMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      
      const response = await fetch('/api/v1/extensions/excel2processcapability/analyze', {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        throw new Error('Analysis failed')
      }
      
      return response.json()
    },
    onSuccess: (data) => {
      console.log('Analysis result:', data)
    }
  })

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setExcelFile(file)
      analyzeMutation.mutate(file)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileSpreadsheet className="h-5 w-5" />
            <span>Excel File Upload</span>
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

      {analyzeMutation.data && (
        <Card>
          <CardHeader>
            <CardTitle>Process Capability Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="sheet-name">Sheet Name</Label>
                <Input
                  id="sheet-name"
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  placeholder="Select sheet..."
                />
              </div>
              
              <div>
                <Label htmlFor="chart-type">Analysis Type</Label>
                <select
                  id="chart-type"
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md"
                >
                  <option value="cpk_analysis">Cpk Analysis</option>
                  <option value="ppk_analysis">Ppk Analysis</option>
                  <option value="capability_histogram">Capability Histogram</option>
                  <option value="control_chart">Control Chart</option>
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="spec-lower">Specification Lower Limit</Label>
                  <Input
                    id="spec-lower"
                    type="number"
                    value={specLower}
                    onChange={(e) => setSpecLower(e.target.value)}
                    placeholder="e.g., 10.0"
                  />
                </div>
                <div>
                  <Label htmlFor="spec-upper">Specification Upper Limit</Label>
                  <Input
                    id="spec-upper"
                    type="number"
                    value={specUpper}
                    onChange={(e) => setSpecUpper(e.target.value)}
                    placeholder="e.g., 20.0"
                  />
                </div>
              </div>
              
              <Button className="w-full">
                Generate Process Capability Analysis
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

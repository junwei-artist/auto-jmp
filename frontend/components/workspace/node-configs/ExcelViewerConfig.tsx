'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileSpreadsheet, Save } from 'lucide-react'
import toast from 'react-hot-toast'

import type { NodeContext } from '@/lib/workflow-graph'

interface ExcelViewerConfigProps {
  node: {
    id: string
    module_type: string
    module_id: string
    config: any
    state: any
  }
  nodeContext?: NodeContext | null
  onSave: (config: any) => void
}

export default function ExcelViewerConfig({ node, nodeContext, onSave }: ExcelViewerConfigProps) {
  const [outlierRules, setOutlierRules] = useState<Array<{
    column: string
    condition: string
    value: string
  }>>(node.config?.outlier_rules || [])

  const handleAddRule = () => {
    setOutlierRules([...outlierRules, { column: '', condition: 'greater_than', value: '' }])
  }

  const handleRemoveRule = (index: number) => {
    setOutlierRules(outlierRules.filter((_, i) => i !== index))
  }

  const handleUpdateRule = (index: number, field: string, value: string) => {
    const updated = [...outlierRules]
    updated[index] = { ...updated[index], [field]: value }
    setOutlierRules(updated)
  }

  const handleSave = () => {
    onSave({
      outlier_rules: outlierRules.filter(r => r.column && r.value)
    })
    toast.success('Configuration saved')
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-purple-50">
        <div className="flex items-center space-x-3 mb-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Excel Viewer</h2>
            <p className="text-sm text-slate-600">View Excel files and remove outliers</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Outlier Removal Rules</CardTitle>
              <CardDescription>
                Configure rules to remove outliers by making values empty
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {outlierRules.map((rule, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor={`column-${index}`}>Column</Label>
                      <Input
                        id={`column-${index}`}
                        value={rule.column}
                        onChange={(e) => handleUpdateRule(index, 'column', e.target.value)}
                        placeholder="Column name"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`condition-${index}`}>Condition</Label>
                      <select
                        id={`condition-${index}`}
                        value={rule.condition}
                        onChange={(e) => handleUpdateRule(index, 'condition', e.target.value)}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="greater_than">Greater Than</option>
                        <option value="less_than">Less Than</option>
                        <option value="equals">Equals</option>
                        <option value="contains">Contains</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor={`value-${index}`}>Value</Label>
                      <Input
                        id={`value-${index}`}
                        value={rule.value}
                        onChange={(e) => handleUpdateRule(index, 'value', e.target.value)}
                        placeholder="Value"
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemoveRule(index)}
                    className="w-full"
                  >
                    Remove Rule
                  </Button>
                </div>
              ))}
              
              <Button
                variant="outline"
                onClick={handleAddRule}
                className="w-full"
              >
                Add Rule
              </Button>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Configuration
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}


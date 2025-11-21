'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BarChart3, Save } from 'lucide-react'
import toast from 'react-hot-toast'

import type { NodeContext } from '@/lib/workflow-graph'

interface BoxplotStatsConfigProps {
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

export default function BoxplotStatsConfig({ node, nodeContext, onSave }: BoxplotStatsConfigProps) {
  const [columnName, setColumnName] = useState<string>(node.config?.column_name || '')

  const handleSave = () => {
    if (!columnName) {
      toast.error('Please enter a column name')
      return
    }
    onSave({
      column_name: columnName
    })
    toast.success('Configuration saved')
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-pink-50">
        <div className="flex items-center space-x-3 mb-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Boxplot & Statistics</h2>
            <p className="text-sm text-slate-600">Generate box plot and statistics for a column</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Column Selection</CardTitle>
              <CardDescription>
                Select the column to analyze
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="column-name">Column Name</Label>
                <Input
                  id="column-name"
                  value={columnName}
                  onChange={(e) => setColumnName(e.target.value)}
                  placeholder="Enter column name"
                  className="mt-1"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Name of the column to generate box plot and statistics for
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={!columnName}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
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


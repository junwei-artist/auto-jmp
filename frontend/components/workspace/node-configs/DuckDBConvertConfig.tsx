'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Database, Save } from 'lucide-react'
import toast from 'react-hot-toast'

import type { NodeContext } from '@/lib/workflow-graph'

interface DuckDBConvertConfigProps {
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

export default function DuckDBConvertConfig({ node, nodeContext, onSave }: DuckDBConvertConfigProps) {
  const [tableName, setTableName] = useState<string>(node.config?.table_name || 'data')

  const handleSave = () => {
    onSave({
      table_name: tableName
    })
    toast.success('Configuration saved')
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-green-50">
        <div className="flex items-center space-x-3 mb-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">DuckDB Converter</h2>
            <p className="text-sm text-slate-600">Convert DataFrame to DuckDB table</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Table Configuration</CardTitle>
              <CardDescription>
                Configure the DuckDB table name
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="table-name">Table Name</Label>
                <Input
                  id="table-name"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="data"
                  className="mt-1"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Name for the DuckDB table (default: "data")
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
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


'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Package, ArrowLeft, Database, Zap, BarChart3, Settings, ArrowRightCircle, ArrowLeftCircle, Hash, Upload, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Module {
  module_type: string
  display_name: string
  description: string
  inputs: Array<{ 
    name: string
    type: string
    label: string
    description?: string
    required?: boolean
  }>
  outputs: Array<{ 
    name: string
    type: string
    label: string
    description?: string
  }>
  config_schema?: any
}

const getModuleIcon = (moduleType: string) => {
  const icons: Record<string, React.ReactNode> = {
    excel_loader: <Zap className="h-6 w-6" />,
    duckdb_convert: <Database className="h-6 w-6" />,
    boxplot_stats: <BarChart3 className="h-6 w-6" />,
    excel_to_numeric: <Hash className="h-6 w-6" />,
    file_uploader: <Upload className="h-6 w-6" />,
    excel_viewer: <FileSpreadsheet className="h-6 w-6" />,
    outlier_remover: <FileSpreadsheet className="h-6 w-6" />,
  }
  return icons[moduleType] || <Settings className="h-6 w-6" />
}

const getModuleColor = (moduleType: string) => {
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    excel_loader: {
      bg: 'bg-gradient-to-br from-blue-500 to-blue-600',
      border: 'border-blue-400',
      text: 'text-blue-600',
    },
    duckdb_convert: {
      bg: 'bg-gradient-to-br from-emerald-500 to-emerald-600',
      border: 'border-emerald-400',
      text: 'text-emerald-600',
    },
    boxplot_stats: {
      bg: 'bg-gradient-to-br from-purple-500 to-purple-600',
      border: 'border-purple-400',
      text: 'text-purple-600',
    },
    excel_to_numeric: {
      bg: 'bg-gradient-to-br from-pink-500 to-purple-600',
      border: 'border-pink-400',
      text: 'text-pink-600',
    },
    file_uploader: {
      bg: 'bg-gradient-to-br from-blue-500 to-cyan-600',
      border: 'border-blue-400',
      text: 'text-blue-600',
    },
    excel_viewer: {
      bg: 'bg-gradient-to-br from-indigo-500 to-purple-600',
      border: 'border-indigo-400',
      text: 'text-indigo-600',
    },
    outlier_remover: {
      bg: 'bg-gradient-to-br from-orange-500 to-red-600',
      border: 'border-orange-400',
      text: 'text-orange-600',
    },
  }
  return colors[moduleType] || {
    bg: 'bg-gradient-to-br from-gray-500 to-gray-600',
    border: 'border-gray-400',
    text: 'text-gray-600',
  }
}

export default function ModulesPage() {
  const router = useRouter()

  const { data: modules, isLoading, error } = useQuery<Module[]>({
    queryKey: ['modules'],
    queryFn: async () => {
      return apiClient.get<Module[]>('/v1/modules')
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Package className="h-12 w-12 text-gray-400 animate-pulse mx-auto mb-4" />
              <p className="text-gray-600">Loading modules...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Package className="h-12 w-12 text-red-400 mx-auto mb-4" />
              <p className="text-red-600">Failed to load modules</p>
              <Button onClick={() => router.refresh()} className="mt-4">
                Retry
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-4 mb-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
          </div>
          <div className="flex items-center space-x-3">
            <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
              <Package className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Modules</h1>
              <p className="text-gray-600 mt-1">
                Browse all available workflow modules and nodes
              </p>
            </div>
          </div>
        </div>

        {/* Modules Grid */}
        {modules && modules.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {modules.map((module) => {
              const colors = getModuleColor(module.module_type)
              return (
                <Card
                  key={module.module_type}
                  className={`hover:shadow-lg transition-all duration-200 border-2 ${colors.border} hover:scale-105 cursor-pointer`}
                  onClick={() => router.push(`/modules/${module.module_type}`)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between mb-2">
                      <div className={`h-12 w-12 rounded-lg ${colors.bg} flex items-center justify-center text-white`}>
                        {getModuleIcon(module.module_type)}
                      </div>
                      <Badge variant="outline" className={colors.text}>
                        {module.module_type}
                      </Badge>
                    </div>
                    <CardTitle className="text-xl">{module.display_name}</CardTitle>
                    <CardDescription className="mt-2">
                      {module.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Inputs */}
                      {module.inputs.length > 0 && (
                        <div>
                          <div className="flex items-center space-x-2 mb-2">
                            <ArrowRightCircle className="h-4 w-4 text-gray-500" />
                            <h4 className="text-sm font-semibold text-gray-700">
                              Inputs ({module.inputs.length})
                            </h4>
                          </div>
                          <div className="space-y-1">
                            {module.inputs.map((input, idx) => (
                              <div
                                key={idx}
                                className="text-xs bg-gray-50 rounded px-2 py-1 flex items-center justify-between"
                              >
                                <span className="font-medium">{input.label || input.name}</span>
                                <div className="flex items-center space-x-2">
                                  <Badge variant="secondary" className="text-xs">
                                    {input.type}
                                  </Badge>
                                  {input.required && (
                                    <Badge variant="destructive" className="text-xs">
                                      Required
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Outputs */}
                      {module.outputs.length > 0 && (
                        <div>
                          <div className="flex items-center space-x-2 mb-2">
                            <ArrowLeftCircle className="h-4 w-4 text-gray-500" />
                            <h4 className="text-sm font-semibold text-gray-700">
                              Outputs ({module.outputs.length})
                            </h4>
                          </div>
                          <div className="space-y-1">
                            {module.outputs.map((output, idx) => (
                              <div
                                key={idx}
                                className="text-xs bg-gray-50 rounded px-2 py-1 flex items-center justify-between"
                              >
                                <span className="font-medium">{output.label || output.name}</span>
                                <Badge variant="secondary" className="text-xs">
                                  {output.type}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {module.inputs.length === 0 && module.outputs.length === 0 && (
                        <p className="text-xs text-gray-500 italic">No inputs or outputs defined</p>
                      )}
                    </div>
                    <div className="mt-4 pt-4 border-t">
                      <Button
                        className={`w-full ${colors.bg} text-white hover:opacity-90`}
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/modules/${module.module_type}`)
                        }}
                      >
                        Run Module
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Modules Available</h3>
            <p className="text-gray-600">
              There are no modules registered in the system yet.
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}


'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { pluginRegistry } from '@/lib/plugins/registry'
import { useLanguage } from '@/lib/language'
import { Plugin } from '@/lib/plugins/types'
import PluginCard from '@/components/plugins/PluginCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, BarChart3, ArrowLeft, AlertCircle } from 'lucide-react'

export default function PluginsPage() {
  const router = useRouter()
  const { t } = useLanguage()

  // Use hardcoded plugin data to ensure the page always works
  const plugins: Plugin[] = [
    {
      config: {
        id: 'excel2boxplotv1',
        name: 'Excel to Boxplot V1',
        version: '1.0.0',
        description: 'Convert Excel files to CSV and JSL scripts with three-checkpoint validation system',
        icon: '📊',
        category: 'analysis',
        supportedFormats: ['.xlsx', '.xls', '.xlsm'],
        routes: [
          {
            path: '/plugins/excel2boxplotv1',
            component: 'AnalysisForm',
            title: 'Excel to CSV/JSL Converter',
            description: 'Upload Excel file with meta and data sheets, validate structure, and generate CSV + JSL'
          }
        ],
        apiEndpoints: [
          '/api/v1/extensions/excel2boxplotv1/validate',
          '/api/v1/extensions/excel2boxplotv1/process',
          '/api/v1/extensions/excel2boxplotv1/create-project'
        ]
      },
      components: {},
      hooks: {}
    },
    {
      config: {
        id: 'excel2boxplotv2',
        name: 'Excel to Boxplot V2',
        version: '1.0.0',
        description: 'Excel to CSV/JSL with V2 column mapping',
        icon: '📊',
        category: 'analysis',
        supportedFormats: ['.xlsx', '.xls', '.xlsm'],
        routes: [
          {
            path: '/plugins/excel2boxplotv2',
            component: 'AnalysisForm',
            title: 'Excel to CSV/JSL Converter (V2)',
            description: 'Upload Excel file, validate, and generate CSV + JSL (V2)'
          }
        ],
        apiEndpoints: [
          '/api/v1/extensions/excel2boxplotv2/validate-data',
          '/api/v1/extensions/excel2boxplotv2/process-data',
          '/api/v1/extensions/excel2boxplotv2/run-analysis'
        ]
      },
      components: {},
      hooks: {}
    },
    {
      config: {
        id: 'excel2processcapability',
        name: 'Excel to Process Capability',
        version: '1.0.0',
        description: 'Convert Excel data to process capability analysis (Cp, Cpk, Pp, Ppk)',
        icon: '📈',
        category: 'statistics',
        supportedFormats: ['.xlsx', '.xls', '.xlsm'],
        routes: [
          {
            path: '/plugins/excel2processcapability',
            component: 'AnalysisForm',
            title: 'Process Capability Analysis',
            description: 'Upload Excel file and configure process capability analysis'
          }
        ],
        apiEndpoints: [
          '/api/v1/extensions/excel2processcapability/analyze',
          '/api/v1/extensions/excel2processcapability/generate'
        ]
      },
      components: {},
      hooks: {}
    },
    {
      config: {
        id: 'excel2cpkv1',
        name: 'Excel to CPK V1',
        version: '1.0.0',
        description: 'Convert Excel files to CSV and JSL scripts for Process Capability (CPK) analysis with three-checkpoint validation system',
        icon: '📈',
        category: 'analysis',
        supportedFormats: ['.xlsx', '.xls', '.xlsm'],
        routes: [
          {
            path: '/plugins/excel2cpkv1',
            component: 'AnalysisForm',
            title: 'Excel to CSV/JSL Converter (CPK)',
            description: 'Upload Excel file with meta/data sheets, validate structure, and generate CSV + JSL for Process Capability analysis'
          }
        ],
        apiEndpoints: [
          '/api/v1/extensions/excel2cpkv1/validate',
          '/api/v1/extensions/excel2cpkv1/process',
          '/api/v1/extensions/excel2cpkv1/create-project',
          '/api/v1/extensions/excel2cpkv1/run-analysis'
        ]
      },
      components: {},
      hooks: {}
    },
    {
      config: {
        id: 'excel2commonality',
        name: 'Excel to Commonality',
        version: '1.0.0',
        description: 'Convert Excel files to CSV and JSL scripts for commonality analysis with multi-variable visualization',
        icon: '🔗',
        category: 'analysis',
        supportedFormats: ['.xlsx', '.xls', '.xlsm', '.xlsb'],
        routes: [
          {
            path: '/plugins/excel2commonality',
            component: 'AnalysisForm',
            title: 'Commonality Analysis',
            description: 'Upload Excel file with required columns for commonality analysis'
          }
        ],
        apiEndpoints: [
          '/api/v1/extensions/excel2commonality/validate',
          '/api/v1/extensions/excel2commonality/process',
          '/api/v1/extensions/excel2commonality/analyze',
          '/api/v1/extensions/excel2commonality/info'
        ]
      },
      components: {},
      hooks: {}
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button 
                variant="outline" 
                onClick={() => router.push('/dashboard')}
                className="flex items-center"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('plugins.list.backToProjects')}
              </Button>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">{t('plugins.list.subtitle')}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {t('plugins.list.title')}
              </h1>
              <p className="text-gray-600">
                {t('plugins.list.subtitle')}
              </p>
            </div>
            <Button 
              onClick={() => router.push('/plugins/create-project')}
              className="flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>{t('plugins.list.createProject')}</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plugins.map((plugin) => (
            <PluginCard key={plugin.config.id} plugin={plugin} />
          ))}
        </div>
      </div>
    </div>
  )
}

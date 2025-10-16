import { Plugin } from '@/lib/plugins/types'
import AnalysisForm from './components/AnalysisForm'
import DataPreview from './components/DataPreview'
import ResultsView from './components/ResultsView'
import { useExcelAnalysis } from './hooks/useExcelAnalysis'
import { useCPKGeneration } from './hooks/useCPKGeneration'

const plugin: Plugin = {
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
      },
      {
        path: '/plugins/excel2cpkv1/results/[id]',
        component: 'ResultsView',
        title: 'CPK Analysis Results',
        description: 'View Process Capability analysis results'
      }
    ],
    apiEndpoints: [
      '/api/v1/extensions/excel2cpkv1/validate',
      '/api/v1/extensions/excel2cpkv1/process',
      '/api/v1/extensions/excel2cpkv1/create-project',
      '/api/v1/extensions/excel2cpkv1/run-analysis'
    ]
  },
  
  components: {
    AnalysisForm: {
      name: 'AnalysisForm',
      component: AnalysisForm
    },
    DataPreview: {
      name: 'DataPreview', 
      component: DataPreview
    },
    ResultsView: {
      name: 'ResultsView',
      component: ResultsView
    }
  },
  
  hooks: {
    useExcelAnalysis: {
      name: 'useExcelAnalysis',
      hook: useExcelAnalysis
    },
    useCPKGeneration: {
      name: 'useCPKGeneration',
      hook: useCPKGeneration
    }
  }
}

export default plugin

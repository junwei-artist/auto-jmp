import { Plugin } from '@/lib/plugins/types'
import AnalysisForm from './components/AnalysisForm'
import DataPreview from './components/DataPreview'
import ResultsView from './components/ResultsView'
import { useExcelAnalysis } from './hooks/useExcelAnalysis'
import { useCapabilityGeneration } from './hooks/useCapabilityGeneration'

const plugin: Plugin = {
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
      },
      {
        path: '/plugins/excel2processcapability/results/[id]',
        component: 'ResultsView',
        title: 'Analysis Results',
        description: 'View process capability analysis results'
      }
    ],
    apiEndpoints: [
      '/api/v1/extensions/excel2processcapability/analyze',
      '/api/v1/extensions/excel2processcapability/generate'
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
    useCapabilityGeneration: {
      name: 'useCapabilityGeneration',
      hook: useCapabilityGeneration
    }
  }
}

export default plugin

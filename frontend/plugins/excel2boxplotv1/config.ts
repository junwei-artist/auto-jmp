import { Plugin } from '@/lib/plugins/types'
import AnalysisForm from './components/AnalysisForm'
import DataPreview from './components/DataPreview'
import ResultsView from './components/ResultsView'
import { useExcelAnalysis } from './hooks/useExcelAnalysis'
import { useBoxplotGeneration } from './hooks/useBoxplotGeneration'

const plugin: Plugin = {
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
      },
      {
        path: '/plugins/excel2boxplotv1/results/[id]',
        component: 'ResultsView',
        title: 'Analysis Results',
        description: 'View boxplot analysis results'
      }
    ],
    apiEndpoints: [
      '/api/v1/extensions/excel2boxplotv1/validate',
      '/api/v1/extensions/excel2boxplotv1/process',
      '/api/v1/extensions/excel2boxplotv1/create-project'
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
    useBoxplotGeneration: {
      name: 'useBoxplotGeneration',
      hook: useBoxplotGeneration
    }
  }
}

export default plugin

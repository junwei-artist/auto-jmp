import { Plugin } from '@/lib/plugins/types'
import AnalysisForm from './components/AnalysisForm'
import DataPreview from './components/DataPreview'
import ResultsView from './components/ResultsView'
import { useCommonalityAnalysis } from './hooks/useCommonalityAnalysis'

const plugin: Plugin = {
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
      },
      {
        path: '/plugins/excel2commonality/wizard',
        component: 'AnalysisForm',
        title: 'Commonality Analysis Wizard',
        description: 'Step-by-step wizard for commonality analysis'
      },
      {
        path: '/plugins/excel2commonality/results/[id]',
        component: 'ResultsView',
        title: 'Commonality Analysis Results',
        description: 'View commonality analysis results'
      }
    ],
    apiEndpoints: [
      '/api/v1/extensions/excel2commonality/validate',
      '/api/v1/extensions/excel2commonality/process',
      '/api/v1/extensions/excel2commonality/analyze',
      '/api/v1/extensions/excel2commonality/info'
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
    useCommonalityAnalysis: {
      name: 'useCommonalityAnalysis',
      hook: useCommonalityAnalysis
    }
  }
}

export default plugin

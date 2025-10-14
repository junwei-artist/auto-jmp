import { Plugin } from '@/lib/plugins/types'
import AnalysisForm from '../excel2boxplotv1/components/AnalysisForm'
import DataPreview from '../excel2boxplotv1/components/DataPreview'
import ResultsView from '../excel2boxplotv1/components/ResultsView'
import { useExcelAnalysis } from '../excel2boxplotv1/hooks/useExcelAnalysis'
import { useBoxplotGeneration } from '../excel2boxplotv1/hooks/useBoxplotGeneration'

const plugin: Plugin = {
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
      },
      {
        path: '/plugins/excel2boxplotv2/results/[id]',
        component: 'ResultsView',
        title: 'Analysis Results',
        description: 'View boxplot analysis results'
      }
    ],
    apiEndpoints: [
      '/api/v1/extensions/excel2boxplotv2/validate-data',
      '/api/v1/extensions/excel2boxplotv2/process-data',
      '/api/v1/extensions/excel2boxplotv2/run-analysis'
    ]
  },

  components: {
    AnalysisForm: { name: 'AnalysisForm', component: AnalysisForm },
    DataPreview: { name: 'DataPreview', component: DataPreview },
    ResultsView: { name: 'ResultsView', component: ResultsView }
  },

  hooks: {
    useExcelAnalysis: { name: 'useExcelAnalysis', hook: useExcelAnalysis },
    useBoxplotGeneration: { name: 'useBoxplotGeneration', hook: useBoxplotGeneration }
  }
}

export default plugin



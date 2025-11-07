import { Plugin } from '@/lib/plugins/types'

// Minimal plugin config - components will be added later
const plugin: Plugin = {
  config: {
    id: 'excel2commonality-generic',
    name: 'Excel to Commonality (Generic)',
    version: '1.0.0',
    description: 'Convert Excel files to CSV and JSL scripts for commonality analysis with user-selected categorical variables',
    icon: '🔗',
    category: 'analysis',
    supportedFormats: ['.xlsx', '.xls', '.xlsm', '.xlsb'],
    routes: [
      {
        path: '/plugins/excel2commonality-generic',
        component: 'AnalysisForm',
        title: 'Commonality Analysis (Generic)',
        description: 'Upload Excel file and select categorical columns for commonality analysis'
      },
      {
        path: '/plugins/excel2commonality-generic/wizard',
        component: 'AnalysisForm',
        title: 'Commonality Analysis Wizard (Generic)',
        description: 'Step-by-step wizard with column selection for commonality analysis'
      }
    ],
    apiEndpoints: [
      '/api/v1/extensions/excel2commonality-generic/load-file',
      '/api/v1/extensions/excel2commonality-generic/process-data',
      '/api/v1/extensions/excel2commonality-generic/generate-files',
      '/api/v1/extensions/excel2commonality-generic/run-analysis',
      '/api/v1/extensions/excel2commonality-generic/info'
    ]
  },
  
  components: {
    // Components will be added when the wizard is created
  },
  
  hooks: {
    // Hooks will be added when the wizard is created
  }
}

export default plugin

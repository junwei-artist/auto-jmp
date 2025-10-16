export interface PluginConfig {
  id: string
  name: string
  version: string
  description: string
  icon: string
  category: 'analysis' | 'visualization' | 'statistics'
  supportedFormats: string[]
  routes: PluginRoute[]
  apiEndpoints: string[]
  dependencies?: string[]
}

export interface PluginRoute {
  path: string
  component: string
  title: string
  description?: string
  requiresAuth?: boolean
}

export interface PluginComponent {
  name: string
  component: React.ComponentType<any>
  props?: Record<string, any>
}

export interface PluginHook {
  name: string
  hook: () => any
}

export interface Plugin {
  config: PluginConfig
  components: Record<string, PluginComponent>
  hooks: Record<string, PluginHook>
  initialize?: () => Promise<void>
  cleanup?: () => void
}

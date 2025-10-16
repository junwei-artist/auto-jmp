import { Plugin, PluginConfig } from './types'

class PluginRegistry {
  private plugins: Map<string, Plugin> = new Map()
  private initialized = false

  async registerPlugin(plugin: Plugin): Promise<boolean> {
    try {
      // Validate plugin configuration
      if (!this.validatePlugin(plugin)) {
        console.error(`Invalid plugin configuration: ${plugin.config.id}`)
        return false
      }

      // Initialize plugin if needed
      if (plugin.initialize) {
        await plugin.initialize()
      }

      // Register plugin
      this.plugins.set(plugin.config.id, plugin)
      
      console.log(`Plugin registered: ${plugin.config.id} v${plugin.config.version}`)
      return true
    } catch (error) {
      console.error(`Failed to register plugin ${plugin.config.id}:`, error)
      return false
    }
  }

  getPlugin(id: string): Plugin | undefined {
    return this.plugins.get(id)
  }

  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values())
  }

  getPluginsByCategory(category: string): Plugin[] {
    return this.getAllPlugins().filter(plugin => 
      plugin.config.category === category
    )
  }

  getPluginComponent(pluginId: string, componentName: string) {
    const plugin = this.getPlugin(pluginId)
    return plugin?.components[componentName]
  }

  getPluginHook(pluginId: string, hookName: string) {
    const plugin = this.getPlugin(pluginId)
    return plugin?.hooks[hookName]
  }

  private validatePlugin(plugin: Plugin): boolean {
    const { config, components, hooks } = plugin
    
    try {
      // Validate required fields
      if (!config.id || !config.name || !config.version) {
        console.error(`Plugin ${config.id || 'unknown'} missing required config fields`)
        return false
      }

      // Validate routes
      if (!config.routes || config.routes.length === 0) {
        console.error(`Plugin ${config.id} has no routes`)
        return false
      }

      // Validate components exist for routes (but don't fail if they don't)
      for (const route of config.routes) {
        if (!components[route.component]) {
          console.warn(`Component ${route.component} not found for route ${route.path} in plugin ${config.id}`)
          // Don't return false here, just warn
        }
      }

      console.log(`Plugin ${config.id} validation passed`)
      return true
    } catch (error) {
      console.error(`Error validating plugin ${config.id}:`, error)
      return false
    }
  }

  async initializeAll(): Promise<void> {
    if (this.initialized) return

    // Auto-register plugins
    await this.autoRegisterPlugins()
    
    this.initialized = true
  }

  private async autoRegisterPlugins(): Promise<void> {
    // Dynamically import and register plugins
    const pluginModules = [
      { name: 'excel2boxplotv1', import: () => import('../../plugins/excel2boxplotv1/config') },
      { name: 'excel2boxplotv2', import: () => import('../../plugins/excel2boxplotv2/config') },
      { name: 'excel2processcapability', import: () => import('../../plugins/excel2processcapability/config') }
    ]

    for (const { name, import: importPlugin } of pluginModules) {
      try {
        console.log(`Loading plugin: ${name}`)
        const pluginModule = await importPlugin()
        const plugin = pluginModule.default
        console.log(`Plugin ${name} loaded, attempting to register...`)
        const success = await this.registerPlugin(plugin)
        if (success) {
          console.log(`Plugin ${name} registered successfully`)
        } else {
          console.error(`Plugin ${name} failed to register`)
        }
      } catch (error) {
        console.error(`Failed to auto-register plugin ${name}:`, error)
        console.error('Error details:', error)
      }
    }
  }
}

export const pluginRegistry = new PluginRegistry()

import { pluginRegistry } from './registry'

export const getExtensions = async () => {
  await pluginRegistry.initializeAll()
  return pluginRegistry.getAllPlugins().map(plugin => ({
    id: plugin.config.id,
    name: plugin.config.name,
    version: plugin.config.version,
    description: plugin.config.description,
    icon: plugin.config.icon,
    category: plugin.config.category,
    supportedFormats: plugin.config.supportedFormats,
    status: 'loaded'
  }))
}

export const getExtensionById = async (id: string) => {
  await pluginRegistry.initializeAll()
  const plugin = pluginRegistry.getPlugin(id)
  if (!plugin) return null
  
  return {
    id: plugin.config.id,
    name: plugin.config.name,
    version: plugin.config.version,
    description: plugin.config.description,
    icon: plugin.config.icon,
    category: plugin.config.category,
    supportedFormats: plugin.config.supportedFormats,
    routes: plugin.config.routes,
    apiEndpoints: plugin.config.apiEndpoints,
    status: 'loaded'
  }
}

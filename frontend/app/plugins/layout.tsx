import { ReactNode } from 'react'
import { pluginRegistry } from '@/lib/plugins/registry'
import PluginLayout from '@/components/plugins/PluginLayout'

export default async function PluginsLayout({
  children,
}: {
  children: ReactNode
}) {
  // Initialize plugin registry
  await pluginRegistry.initializeAll()

  return (
    <PluginLayout>
      {children}
    </PluginLayout>
  )
}

'use client'

import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { pluginRegistry } from '@/lib/plugins/registry'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface PluginLayoutProps {
  children: ReactNode
}

export default function PluginLayout({ children }: PluginLayoutProps) {
  const pathname = usePathname()
  
  // Extract plugin ID from path
  const pluginId = pathname.split('/')[2] // /plugins/{pluginId}/...
  const plugin = pluginRegistry.getPlugin(pluginId)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Plugin Header */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/dashboard">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Projects
                </Button>
              </Link>
              
              {plugin && (
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-blue-600 font-semibold text-sm">
                      {plugin.config.icon}
                    </span>
                  </div>
                  <div>
                    <h1 className="text-xl font-semibold">{plugin.config.name}</h1>
                    <p className="text-sm text-gray-500">v{plugin.config.version}</p>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">
                {plugin?.config.category}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Plugin Content */}
      <div className="container mx-auto px-4 py-8">
        {children}
      </div>
    </div>
  )
}

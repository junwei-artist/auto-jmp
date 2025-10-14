'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { pluginRegistry } from '@/lib/plugins/registry'
import { useLanguage } from '@/lib/language'
import { Plugin } from '@/lib/plugins/types'
import PluginCard from '@/components/plugins/PluginCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, BarChart3 } from 'lucide-react'

export default function PluginsPage() {
  const router = useRouter()
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(true)
  const { t } = useLanguage()

  useEffect(() => {
    const loadPlugins = async () => {
      await pluginRegistry.initializeAll()
      setPlugins(pluginRegistry.getAllPlugins())
      setLoading(false)
    }
    
    loadPlugins()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('plugins.list.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {t('plugins.list.title')}
              </h1>
              <p className="text-gray-600">
                {t('plugins.list.subtitle')}
              </p>
            </div>
            <Button 
              onClick={() => router.push('/plugins/create-project')}
              className="flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>{t('plugins.list.createProject')}</span>
            </Button>
          </div>
        </div>

        {plugins.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-gray-500">{t('plugins.list.none')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plugins.map((plugin) => (
              <PluginCard key={plugin.config.id} plugin={plugin} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

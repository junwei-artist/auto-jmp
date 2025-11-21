import Link from 'next/link'
import { Plugin } from '@/lib/plugins/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useLanguage } from '@/lib/language'

interface PluginCardProps {
  plugin: Plugin
}

export default function PluginCard({ plugin }: PluginCardProps) {
  const { config } = plugin
  const { t } = useLanguage()

  // Helper function to get translation with proper fallback
  const getTranslation = (key: string, fallback: string) => {
    const translation = t(key)
    // If the translation returns the same key, it means no translation was found
    return translation === key ? fallback : translation
  }

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
            <span className="text-blue-600 font-semibold text-lg">
              {config.icon}
            </span>
          </div>
          <div>
            <CardTitle className="text-lg">
              {getTranslation(`plugin.${config.id}.name`, config.name)}
            </CardTitle>
            <p className="text-sm text-gray-500">
              {getTranslation('plugin.card.version', 'v')}{config.version}
            </p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <p className="text-gray-600 mb-4">
          {getTranslation(`plugin.${config.id}.description`, config.description)}
        </p>
        
        <div className="space-y-3">
          <div>
            <Badge variant="secondary">
              {getTranslation(`plugin.category.${config.category}`, config.category)}
            </Badge>
          </div>
          
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">
              {getTranslation('plugin.card.supportedFormats', 'Supported Formats:')}
            </p>
            <div className="flex flex-wrap gap-1">
              {config.supportedFormats.map((format) => (
                <Badge key={format} variant="outline" className="text-xs">
                  {format}
                </Badge>
              ))}
            </div>
          </div>
          
          <div className="pt-2">
            <Link href={`/plugins/${config.id}`}>
              <Button className="w-full">
                {getTranslation('plugin.card.usePlugin', 'Use Plugin')}
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

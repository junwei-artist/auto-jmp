'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Download, 
  Upload, 
  Settings, 
  CheckCircle, 
  XCircle, 
  Edit,
  Save,
  X,
  Plus,
  Trash2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/lib/language'
import { usePluginDescriptions } from '@/lib/plugin-descriptions'

interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  icon: string
  category: string
  supported_formats: string[]
  status: string
  installed: boolean
  english_name: string
  english_description: string
  chinese_name: string
  chinese_description: string
  english_features: string[]
  chinese_features: string[]
}

export default function AdminPluginsPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const { refreshDescriptions } = usePluginDescriptions()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [editingPlugin, setEditingPlugin] = useState<string | null>(null)
  const [editingLanguage, setEditingLanguage] = useState<'en' | 'zh'>('en')
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    features: [] as string[]
  })

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('access_token')
      if (!token) {
        router.push('/admin')
        return
      }

      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (response.ok) {
          const userData = await response.json()
          if (userData.is_admin) {
            setIsAuthenticated(true)
            await fetchPlugins()
          } else {
            router.push('/admin')
          }
        } else {
          router.push('/admin')
        }
      } catch (error) {
        router.push('/admin')
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [router])

  const fetchPlugins = async () => {
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/plugins`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const pluginsData = await response.json()
        setPlugins(pluginsData)
      }
    } catch (error) {
      console.error('Failed to fetch plugins:', error)
      toast.error('Failed to fetch plugins')
    }
  }

  const handleInstallPlugin = async (pluginId: string) => {
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/plugins/${pluginId}/install`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        toast.success('Plugin installed successfully')
        await fetchPlugins()
      } else {
        const error = await response.json()
        toast.error(error.detail || 'Failed to install plugin')
      }
    } catch (error) {
      toast.error('Failed to install plugin')
    }
  }

  const handleUninstallPlugin = async (pluginId: string) => {
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/plugins/${pluginId}/uninstall`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        toast.success('Plugin uninstalled successfully')
        await fetchPlugins()
      } else {
        const error = await response.json()
        toast.error(error.detail || 'Failed to uninstall plugin')
      }
    } catch (error) {
      toast.error('Failed to uninstall plugin')
    }
  }

  const handleEditPlugin = (plugin: PluginInfo, language: 'en' | 'zh') => {
    setEditingPlugin(plugin.id)
    setEditingLanguage(language)
    
    if (language === 'en') {
      setEditForm({
        name: plugin.english_name,
        description: plugin.english_description,
        features: [...plugin.english_features]
      })
    } else {
      setEditForm({
        name: plugin.chinese_name,
        description: plugin.chinese_description,
        features: [...plugin.chinese_features]
      })
    }
  }

  const handleSavePlugin = async () => {
    if (!editingPlugin) return

    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/plugins/descriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plugin_id: editingPlugin,
          language: editingLanguage,
          name: editForm.name,
          description: editForm.description,
          features: editForm.features
        }),
      })

      if (response.ok) {
        toast.success('Plugin descriptions updated successfully')
        setEditingPlugin(null)
        await fetchPlugins()
        await refreshDescriptions() // Refresh the dynamic descriptions cache
      } else {
        const error = await response.json()
        toast.error(error.detail || 'Failed to update plugin descriptions')
      }
    } catch (error) {
      toast.error('Failed to update plugin descriptions')
    }
  }

  const handleCancelEdit = () => {
    setEditingPlugin(null)
    setEditForm({ name: '', description: '', features: [] })
  }

  const handleAddFeature = () => {
    setEditForm(prev => ({
      ...prev,
      features: [...prev.features, '']
    }))
  }

  const handleRemoveFeature = (index: number) => {
    setEditForm(prev => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index)
    }))
  }

  const handleFeatureChange = (index: number, value: string) => {
    setEditForm(prev => ({
      ...prev,
      features: prev.features.map((feature, i) => i === index ? value : feature)
    }))
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('admin.plugins.title')}</h1>
              <p className="text-gray-600">{t('admin.plugins.subtitle')}</p>
            </div>
            <Button 
              onClick={() => router.push('/admin/dashboard')}
              variant="outline"
            >
              {t('admin.plugins.backToDashboard')}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {plugins.map((plugin) => (
            <Card key={plugin.id} className="overflow-hidden">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <span className="text-blue-600 font-semibold text-lg">
                        {plugin.icon}
                      </span>
                    </div>
                    <div>
                      <CardTitle className="text-lg">{plugin.name}</CardTitle>
                      <p className="text-sm text-gray-500">v{plugin.version}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={plugin.installed ? "default" : "secondary"}>
                      {plugin.installed ? t('admin.plugins.installed') : t('admin.plugins.available')}
                    </Badge>
                    {plugin.installed ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleUninstallPlugin(plugin.id)}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        {t('admin.plugins.uninstall')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleInstallPlugin(plugin.id)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        {t('admin.plugins.install')}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <Tabs defaultValue="english" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="english">English</TabsTrigger>
                    <TabsTrigger value="chinese">中文</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="english" className="space-y-4">
                    {editingPlugin === plugin.id && editingLanguage === 'en' ? (
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="en-name">{t('admin.plugins.name')}</Label>
                          <Input
                            id="en-name"
                            value={editForm.name}
                            onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="en-description">{t('admin.plugins.description')}</Label>
                          <Textarea
                            id="en-description"
                            value={editForm.description}
                            onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                            rows={3}
                          />
                        </div>
                        <div>
                          <Label>{t('admin.plugins.featuresLabel')}</Label>
                          <div className="space-y-2">
                            {editForm.features.map((feature, index) => (
                              <div key={index} className="flex items-center space-x-2">
                                <Input
                                  value={feature}
                                  onChange={(e) => handleFeatureChange(index, e.target.value)}
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRemoveFeature(index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleAddFeature}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              {t('admin.plugins.addFeature')}
                            </Button>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <Button onClick={handleSavePlugin}>
                            <Save className="h-4 w-4 mr-1" />
                            {t('admin.plugins.save')}
                          </Button>
                          <Button variant="outline" onClick={handleCancelEdit}>
                            <X className="h-4 w-4 mr-1" />
                            {t('admin.plugins.cancel')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-medium">{plugin.english_name}</h4>
                          <p className="text-sm text-gray-600">{plugin.english_description}</p>
                        </div>
                        <div>
                          <h5 className="font-medium text-sm mb-2">{t('admin.plugins.features')}</h5>
                          <ul className="text-sm text-gray-600 space-y-1">
                            {plugin.english_features.map((feature, index) => (
                              <li key={index} className="flex items-start">
                                <span className="mr-2">•</span>
                                {feature}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditPlugin(plugin, 'en')}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          {t('admin.plugins.editEnglish')}
                        </Button>
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="chinese" className="space-y-4">
                    {editingPlugin === plugin.id && editingLanguage === 'zh' ? (
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="zh-name">{t('admin.plugins.chineseName')}</Label>
                          <Input
                            id="zh-name"
                            value={editForm.name}
                            onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="zh-description">{t('admin.plugins.chineseDescription')}</Label>
                          <Textarea
                            id="zh-description"
                            value={editForm.description}
                            onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                            rows={3}
                          />
                        </div>
                        <div>
                          <Label>{t('admin.plugins.chineseFeatures')}</Label>
                          <div className="space-y-2">
                            {editForm.features.map((feature, index) => (
                              <div key={index} className="flex items-center space-x-2">
                                <Input
                                  value={feature}
                                  onChange={(e) => handleFeatureChange(index, e.target.value)}
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRemoveFeature(index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleAddFeature}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              {t('admin.plugins.chineseAddFeature')}
                            </Button>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <Button onClick={handleSavePlugin}>
                            <Save className="h-4 w-4 mr-1" />
                            {t('admin.plugins.chineseSave')}
                          </Button>
                          <Button variant="outline" onClick={handleCancelEdit}>
                            <X className="h-4 w-4 mr-1" />
                            {t('admin.plugins.chineseCancel')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-medium">{plugin.chinese_name}</h4>
                          <p className="text-sm text-gray-600">{plugin.chinese_description}</p>
                        </div>
                        <div>
                          <h5 className="font-medium text-sm mb-2">{t('admin.plugins.chineseFeatures')}</h5>
                          <ul className="text-sm text-gray-600 space-y-1">
                            {plugin.chinese_features.map((feature, index) => (
                              <li key={index} className="flex items-start">
                                <span className="mr-2">•</span>
                                {feature}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditPlugin(plugin, 'zh')}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          {t('admin.plugins.chineseEdit')}
                        </Button>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
                
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">{t('admin.plugins.supportedFormats')}</p>
                      <div className="flex flex-wrap gap-1">
                        {plugin.supported_formats.map((format) => (
                          <Badge key={format} variant="outline" className="text-xs">
                            {format}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Badge variant="secondary">{plugin.category}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

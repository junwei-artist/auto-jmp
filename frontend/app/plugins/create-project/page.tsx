'use client'

import { useState, useEffect, Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { BarChart3, Upload, FileSpreadsheet, Play, ArrowLeft } from 'lucide-react'
import { useLanguage } from '@/lib/language'

interface Plugin {
  id: string
  name: string
  description: string
  icon: JSX.Element
  features: string[]
}

const getPlugins = (t: (key: string) => string): Plugin[] => {
  // Helper function to get translation with proper fallback
  const getTranslation = (key: string, fallback: string) => {
    const translation = t(key)
    return translation === key ? fallback : translation
  }

  return [
    {
      id: 'excel2boxplotv1',
      name: getTranslation('plugin.excel2boxplotv1.name', 'Excel to Boxplot V1'),
      description: getTranslation('plugin.excel2boxplotv1.description', 'Convert Excel files to CSV and JSL scripts with three-checkpoint validation system'),
      icon: <BarChart3 className="h-8 w-8 text-blue-600" />,
      features: [
        getTranslation('plugin.excel2boxplotv1.features.0', 'Three-checkpoint validation system'),
        getTranslation('plugin.excel2boxplotv1.features.1', 'Automatic file fixing for corrupted Excel files'),
        getTranslation('plugin.excel2boxplotv1.features.2', 'Boundary calculation (min, max, inc, tick)'),
        getTranslation('plugin.excel2boxplotv1.features.3', 'CSV and JSL generation'),
        getTranslation('plugin.excel2boxplotv1.features.4', 'Boxplot visualization')
      ]
    },
    {
      id: 'excel2boxplotv2',
      name: getTranslation('plugin.excel2boxplotv2.name', 'Excel to Boxplot V2'),
      description: getTranslation('plugin.excel2boxplotv2.description', 'Excel to CSV/JSL with V2 column mapping'),
      icon: <BarChart3 className="h-8 w-8 text-indigo-600" />,
      features: [
        getTranslation('plugin.excel2boxplotv2.features.0', 'V2 meta column mapping (Y Variable/DETAIL/Target/USL/LSL/Label)'),
        getTranslation('plugin.excel2boxplotv2.features.1', 'Prefers Stage as categorical variable'),
        getTranslation('plugin.excel2boxplotv2.features.2', 'Three-checkpoint validation (informational)'),
        getTranslation('plugin.excel2boxplotv2.features.3', 'Boundary calculation (min, max, inc, tick)'),
        getTranslation('plugin.excel2boxplotv2.features.4', 'CSV and JSL generation')
      ]
    },
    {
      id: 'excel2processcapability',
      name: getTranslation('plugin.excel2processcapability.name', 'Excel to Process Capability'),
      description: getTranslation('plugin.excel2processcapability.description', 'Convert Excel data to process capability analysis (Cp, Cpk, Pp, Ppk)'),
      icon: <FileSpreadsheet className="h-8 w-8 text-green-600" />,
      features: [
        getTranslation('plugin.excel2processcapability.features.0', 'Process capability analysis'),
        getTranslation('plugin.excel2processcapability.features.1', 'Statistical process control'),
        getTranslation('plugin.excel2processcapability.features.2', 'Capability indices calculation'),
        getTranslation('plugin.excel2processcapability.features.3', 'Control charts generation')
      ]
    },
    {
      id: 'excel2cpkv1',
      name: getTranslation('plugin.excel2cpkv1.name', 'Excel to CPK V1'),
      description: getTranslation('plugin.excel2cpkv1.description', 'Convert Excel files to CSV and JSL scripts for Process Capability (CPK) analysis with three-checkpoint validation system'),
      icon: <BarChart3 className="h-8 w-8 text-purple-600" />,
      features: [
        getTranslation('plugin.excel2cpkv1.features.0', 'Three-checkpoint validation system'),
        getTranslation('plugin.excel2cpkv1.features.1', 'Process Capability (CPK) analysis'),
        getTranslation('plugin.excel2cpkv1.features.2', 'Spec data validation and normalization'),
        getTranslation('plugin.excel2cpkv1.features.3', 'FAI column matching'),
        getTranslation('plugin.excel2cpkv1.features.4', 'CSV and JSL generation for JMP')
      ]
    },
    {
      id: 'excel2commonality',
      name: getTranslation('plugin.excel2commonality.name', 'Excel to Commonality'),
      description: getTranslation('plugin.excel2commonality.description', 'Convert Excel files to CSV and JSL scripts for commonality analysis with multi-variable visualization'),
      icon: <BarChart3 className="h-8 w-8 text-orange-600" />,
      features: [
        getTranslation('plugin.excel2commonality.features.0', 'Automatic sheet detection'),
        getTranslation('plugin.excel2commonality.features.1', 'FAI column detection'),
        getTranslation('plugin.excel2commonality.features.2', 'Multi-variable visualization'),
        getTranslation('plugin.excel2commonality.features.3', 'JSL script generation'),
        getTranslation('plugin.excel2commonality.features.4', 'CSV export')
      ]
    },
    {
      id: 'excel2commonality-generic',
      name: getTranslation('plugin.excel2commonality-generic.name', 'Excel to Commonality (Generic)'),
      description: getTranslation('plugin.excel2commonality-generic.description', 'Convert Excel files to CSV and JSL scripts for commonality analysis with user-selected categorical variables'),
      icon: <BarChart3 className="h-8 w-8 text-teal-600" />,
      features: [
        getTranslation('plugin.excel2commonality-generic.features.0', 'Automatic sheet detection'),
        getTranslation('plugin.excel2commonality-generic.features.1', 'FAI column detection'),
        getTranslation('plugin.excel2commonality-generic.features.2', 'Non-FAI column detection'),
        getTranslation('plugin.excel2commonality-generic.features.3', 'User-selected categorical variables'),
        getTranslation('plugin.excel2commonality-generic.features.4', 'Multi-variable visualization'),
        getTranslation('plugin.excel2commonality-generic.features.5', 'Custom wizard interface')
      ]
    }
  ]
}

function PluginSelectionContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useLanguage()
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null)
  const [projectData, setProjectData] = useState({
    name: '',
    description: '',
    isPublic: false
  })
  const [isCreating, setIsCreating] = useState(false)
  
  // Memoize plugins to prevent infinite re-renders
  const plugins = useMemo(() => getPlugins(t), [t])

  // Handle URL parameter for pre-selected plugin
  useEffect(() => {
    const pluginParam = searchParams?.get('plugin')
    if (pluginParam) {
      const plugin = plugins.find(p => p.id === pluginParam)
      if (plugin && !selectedPlugin) {
        setSelectedPlugin(plugin)
        setProjectData(prev => ({
          ...prev,
          name: prev.name || `${plugin.name} Analysis - ${new Date().toLocaleDateString()}`
        }))
      }
    }
  }, [searchParams, plugins, selectedPlugin])

  const handlePluginSelect = (plugin: Plugin) => {
    setSelectedPlugin(plugin)
    // Auto-fill project name based on plugin
    if (!projectData.name) {
      setProjectData(prev => ({
        ...prev,
        name: `${plugin.name} Analysis - ${new Date().toLocaleDateString()}`
      }))
    }
  }

  const handleCreateProject = async () => {
    if (!selectedPlugin || !projectData.name) return

    setIsCreating(true)
    try {
      const token = localStorage.getItem('access_token')
      if (!token) {
        alert('Please log in to create a project')
        return
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/projects/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: projectData.name,
          description: projectData.description,
          plugin_name: selectedPlugin.id,
          is_public: projectData.isPublic
        })
      })

      if (response.ok) {
        const project = await response.json()
        // Navigate to the wizard page with project ID
        router.push(`/plugins/${selectedPlugin.id}/wizard?projectId=${project.id}&plugin=${selectedPlugin.id}`)
      } else {
        const errorData = await response.json()
        console.error('Failed to create project:', errorData)
        alert(`Failed to create project: ${errorData.detail || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error creating project:', error)
      alert('Error creating project. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  const handleBack = () => {
    router.push('/plugins')
  }

  return (
    <div className="container mx-auto py-8 max-w-6xl">
      <div className="mb-8">
        <Button 
          variant="outline" 
          onClick={handleBack}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('plugins.create.back')}
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">{t('plugins.create.title')}</h1>
        <p className="text-gray-600 mt-2">{t('plugins.create.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Plugin Selection */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('plugins.create.stepSelect')}</h2>
          <div className="space-y-4">
            {plugins.map((plugin) => (
              <Card 
                key={plugin.id}
                className={`cursor-pointer transition-all duration-200 ${
                  selectedPlugin?.id === plugin.id 
                    ? 'ring-2 ring-blue-500 bg-blue-50' 
                    : 'hover:shadow-md'
                }`}
                onClick={() => handlePluginSelect(plugin)}
              >
                <CardHeader>
                  <CardTitle className="flex items-center space-x-3">
                    {plugin.icon}
                    <span>{plugin.name}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">{plugin.description}</p>
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-900">{t('plugins.create.features')}</h4>
                    <ul className="text-sm text-gray-600 space-y-1">
                      {plugin.features.map((feature, index) => (
                        <li key={index} className="flex items-center">
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2"></div>
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Project Configuration */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('plugins.create.stepConfigure')}</h2>
          <Card>
            <CardHeader>
              <CardTitle>{t('plugins.create.details')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="projectName">{t('plugins.create.name')}</Label>
                <Input
                  id="projectName"
                  value={projectData.name}
                  onChange={(e) => setProjectData({ ...projectData, name: e.target.value })}
                  placeholder={t('plugins.create.namePlaceholder')}
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="projectDescription">{t('plugins.create.description')}</Label>
                <Textarea
                  id="projectDescription"
                  value={projectData.description}
                  onChange={(e) => setProjectData({ ...projectData, description: e.target.value })}
                  placeholder={t('plugins.create.descriptionPlaceholder')}
                  className="mt-1"
                  rows={3}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="isPublic"
                  checked={projectData.isPublic}
                  onCheckedChange={(checked) => setProjectData({ ...projectData, isPublic: checked })}
                />
                <Label htmlFor="isPublic">{t('plugins.create.public')}</Label>
              </div>

              {selectedPlugin && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">{t('plugins.create.selected')}</h4>
                  <div className="flex items-center space-x-2">
                    {selectedPlugin.icon}
                    <span className="text-blue-800">{selectedPlugin.name}</span>
                  </div>
                </div>
              )}

              <Button 
                onClick={handleCreateProject} 
                disabled={!selectedPlugin || !projectData.name || isCreating}
                className="w-full"
              >
                {isCreating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {t('plugins.create.creating')}
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    {t('plugins.create.create')}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function PluginSelectionPage() {
  const { t } = useLanguage()
  return (
    <Suspense fallback={
      <div className="container mx-auto py-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-600 mt-2">{t('plugins.create.loading')}</p>
      </div>
    }>
      <PluginSelectionContent />
    </Suspense>
  )
}

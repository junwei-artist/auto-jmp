'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowLeft, Loader2, FileSpreadsheet, Settings, Download, Move, Image as ImageIcon, FileText, Folder, Palette, Type, Layout, Sparkles, Zap, CheckCircle2, ExternalLink } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/language'
import { LanguageSelector } from '@/components/LanguageSelector'
import toast from 'react-hot-toast'

interface ExcelSheet {
  name: string
  columns: string[]
}

interface DrawingFolder {
  id: string
  description?: string
  image_count: number
}

interface LayoutElement {
  id: string
  type: 'title' | 'description' | 'runImage' | 'drawingImage' | 'text' | 'extraImage'
  x: number
  y: number
  width: number
  height: number
  fontSize?: number
  fontFamily?: string
  bold?: boolean
  color?: string
  column?: string
  folderId?: string
  maintainAspectRatio?: boolean
}

export default function PowerPointEditorPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, ready } = useAuth()
  const { t } = useLanguage()
  const projectId = params?.id as string
  const runId = params?.runId as string
  const workspaceId = searchParams?.get('workspace_id') || null
  const outputId = searchParams?.get('output_id') || null

  const [isLoading, setIsLoading] = useState(false)
  
  // Excel data
  const [excelSheets, setExcelSheets] = useState<ExcelSheet[]>([])
  const [selectedSheet, setSelectedSheet] = useState('meta')
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [titleColumn, setTitleColumn] = useState('main_level')
  const [descriptionColumn, setDescriptionColumn] = useState<string | undefined>(undefined)
  const [matchColumn, setMatchColumn] = useState('main_level')
  
  // Drawing folders
  const [drawingFolders, setDrawingFolders] = useState<DrawingFolder[]>([])
  
  // Layout configuration
  const [layout, setLayout] = useState<LayoutElement[]>([
    { id: '1', type: 'title', x: 0.5, y: 0.5, width: 9, height: 0.8, fontSize: 24, bold: true, color: '#000000' },
    { id: '2', type: 'description', x: 0.5, y: 1.3, width: 9, height: 0.4, fontSize: 14, color: '#000000' },
    { id: '3', type: 'runImage', x: 0.5, y: 1.5, width: 6, height: 5, maintainAspectRatio: true },
    { id: '4', type: 'drawingImage', x: 7, y: 1.5, width: 2.5, height: 5, maintainAspectRatio: true }
  ])
  
  const [selectedElement, setSelectedElement] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [resizeHandle, setResizeHandle] = useState<'se' | 'sw' | 'ne' | 'nw' | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)
  
  // Generation
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedFiles, setGeneratedFiles] = useState<Array<{ filename: string; download_url: string; created_at: string; output_id?: string }>>([])
  
  // Internal state for workspace ID (may come from settings)
  const [workspaceIdState, setWorkspaceIdState] = useState<string | null>(workspaceId)
  
  // Canvas size state - responsive to window size
  const [canvasSize, setCanvasSize] = useState({ width: 960, height: 720 })

  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('access_token')
    }
    return null
  }

  // Calculate canvas size based on window dimensions
  useEffect(() => {
    const calculateCanvasSize = () => {
      if (typeof window === 'undefined') return
      
      // Get available space - account for sidebars and padding
      // Left panel: ~320px, Right panel: ~280px, padding: ~80px total
      const sidebarsWidth = 320 + 280 + 80
      const availableWidth = window.innerWidth - sidebarsWidth
      
      // Account for vertical space - header, footer, padding
      const verticalSpace = 200 // approximate header + footer + padding
      const availableHeight = window.innerHeight - verticalSpace
      
      // Maintain 4:3 aspect ratio (standard PowerPoint ratio)
      const aspectRatio = 4 / 3
      
      // Calculate max dimensions based on available space
      let maxWidth = Math.min(availableWidth * 0.95, availableHeight * aspectRatio * 0.95)
      let maxHeight = maxWidth / aspectRatio
      
      // Ensure we don't exceed available height
      if (maxHeight > availableHeight * 0.95) {
        maxHeight = availableHeight * 0.95
        maxWidth = maxHeight * aspectRatio
      }
      
      // Set minimum and maximum bounds
      const minWidth = 640 // Minimum readable size
      const maxWidthLimit = 1280 // Maximum size for very large screens
      const minHeight = minWidth / aspectRatio
      const maxHeightLimit = maxWidthLimit / aspectRatio
      
      const width = Math.max(minWidth, Math.min(maxWidth, maxWidthLimit))
      const height = Math.max(minHeight, Math.min(maxHeight, maxHeightLimit))
      
      setCanvasSize({ width, height })
    }
    
    calculateCanvasSize()
    
    // Recalculate on window resize
    window.addEventListener('resize', calculateCanvasSize)
    
    return () => {
      window.removeEventListener('resize', calculateCanvasSize)
    }
  }, [])

  useEffect(() => {
    if (outputId) {
      // Load settings from existing output
      loadOutputSettings()
    } else if (workspaceId) {
      // New workspace - load Excel info
      fetchWorkspaceExcelInfo()
      fetchDrawingFolders()
    } else {
      toast.error('Workspace ID or Output ID is required')
      router.push(`/projects/${projectId}/runs/${runId}/powerpoint-wizard`)
    }
  }, [outputId, workspaceId, projectId, runId, router])

  const loadOutputSettings = async () => {
    if (!outputId) return
    
    try {
      setIsLoading(true)
      const token = getAuthToken()
      const response = await fetch(`/api/v1/powerpoint/outputs/${outputId}/settings`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      if (!response.ok) {
        throw new Error('Failed to load settings')
      }
      
      const settings = await response.json()
      
      // Load workspace ID
      const wsId = settings.workspace_id
      if (wsId) {
        // Set workspace ID from settings
        setWorkspaceIdState(wsId)
        
        // Load Excel info from workspace
        await fetchWorkspaceExcelInfo(wsId)
      }
      
      // Apply settings
      if (settings.excel_sheet) setSelectedSheet(settings.excel_sheet)
      if (settings.title_column) setTitleColumn(settings.title_column)
      if (settings.description_column) setDescriptionColumn(settings.description_column)
      if (settings.match_column) setMatchColumn(settings.match_column)
      if (settings.layout && settings.layout.elements) {
        setLayout(settings.layout.elements)
      }
      
      fetchDrawingFolders()
      
      toast.success('Settings loaded successfully!')
    } catch (error: any) {
      console.error('Error loading settings:', error)
      toast.error(error.message || 'Failed to load settings')
      router.push(`/projects/${projectId}/runs/${runId}/powerpoint-wizard`)
    } finally {
      setIsLoading(false)
    }
  }


  const fetchWorkspaceExcelInfo = async (wsId?: string) => {
    const id = wsId || workspaceId
    if (!id) return
    
    try {
      setIsLoading(true)
      const token = getAuthToken()
      const response = await fetch(`/api/v1/powerpoint/workspace/${id}/excel-info`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to fetch Excel info' }))
        throw new Error(errorData.detail || 'Failed to fetch Excel info')
      }
      
      const data = await response.json()
      setExcelSheets(data.sheets || [])
      
      if (!data.sheets || data.sheets.length === 0) {
        toast.error('No Excel sheets found.')
        return
      }
      
      // Auto-select meta sheet if available
      const metaSheet = data.sheets.find((s: ExcelSheet) => s.name.toLowerCase() === 'meta')
      if (metaSheet) {
        setSelectedSheet(metaSheet.name)
        setSelectedColumns(metaSheet.columns || [])
        
        // Auto-detect columns
        const mainLevelCol = metaSheet.columns.find((c: string) => 
          c.toLowerCase() === 'main_level' || c.toLowerCase() === 'label'
        )
        const descCol = metaSheet.columns.find((c: string) => 
          c.toLowerCase() === 'description' || c.toLowerCase() === 'detail'
        )
        
        if (mainLevelCol) {
          setTitleColumn(mainLevelCol)
          setMatchColumn(mainLevelCol)
        }
        if (descCol) {
          setDescriptionColumn(descCol)
        }
      }
    } catch (error: any) {
      console.error('Error fetching Excel info:', error)
      toast.error(error.message || 'Failed to load Excel information')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchDrawingFolders = async () => {
    try {
      const token = getAuthToken()
      const response = await fetch(`/api/v1/projects/${projectId}/drawing-folders`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      if (response.ok) {
        const folders = await response.json()
        setDrawingFolders(folders || [])
      }
    } catch (error: any) {
      console.error('Error fetching drawing folders:', error)
    }
  }

  const handleGenerate = async () => {
    const wsId = workspaceIdState || workspaceId
    if (!wsId) {
      toast.error('Workspace ID is required')
      return
    }

    try {
      setIsGenerating(true)
      const token = getAuthToken()
      
      const config = {
        run_id: runId,
        project_id: projectId,
        excel_sheet: selectedSheet,
        title_column: titleColumn,
        description_column: descriptionColumn || undefined,
        match_column: matchColumn,
        drawing_folder_id: undefined,
        layout: {
          elements: layout
        },
        extra_text_columns: [],
        extra_image_folders: []
      }
      
      const response = await fetch(`/api/v1/powerpoint/workspace/${wsId}/generate-powerpoint`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to generate PowerPoint')
      }
      
      const result = await response.json()
      const newFile = {
        filename: result.filename,
        download_url: result.download_url,
        created_at: new Date().toISOString(),
        output_id: result.output_id
      }
      setGeneratedFiles([newFile, ...generatedFiles])
      
      toast.success(t('powerpoint.messages.presentationGenerated'))
    } catch (error: any) {
      console.error('Error generating PowerPoint:', error)
      toast.error(error.message || t('powerpoint.messages.presentationGenerateFailed'))
    } finally {
      setIsGenerating(false)
    }
  }

  // Handle element dragging
  const handleMouseDown = (e: React.MouseEvent, elementId: string, isResizeHandle?: boolean, handle?: 'se' | 'sw' | 'ne' | 'nw') => {
    e.preventDefault()
    e.stopPropagation()
    
    // Calculate DPI based on canvas size (canvas represents 10" × 7.5" slide)
    const pixelsPerInch = canvasSize.width / 10
    
    if (isResizeHandle && handle) {
      setIsResizing(true)
      setResizeHandle(handle)
      setSelectedElement(elementId)
      
      const element = layout.find(el => el.id === elementId)
      if (element && canvasRef.current) {
        setResizeStart({
          x: e.clientX,
          y: e.clientY,
          width: element.width * pixelsPerInch,
          height: element.height * pixelsPerInch
        })
      }
    } else {
      setSelectedElement(elementId)
      setIsDragging(true)
      
      const element = layout.find(el => el.id === elementId)
      if (element && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect()
        setDragOffset({
          x: e.clientX - rect.left - (element.x * pixelsPerInch),
          y: e.clientY - rect.top - (element.y * pixelsPerInch)
        })
      }
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current) return
    
    // Calculate DPI based on canvas size (canvas represents 10" × 7.5" slide)
    const pixelsPerInch = canvasSize.width / 10
    
    const rect = canvasRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    if (isResizing && selectedElement && resizeHandle) {
      const element = layout.find(el => el.id === selectedElement)
      if (!element) return
      
      const deltaX = e.clientX - resizeStart.x
      const deltaY = e.clientY - resizeStart.y
      
      let newWidth = (resizeStart.width + deltaX) / pixelsPerInch
      let newHeight = (resizeStart.height + deltaY) / pixelsPerInch
      let newX = element.x
      let newY = element.y
      
      if (resizeHandle === 'se') {
        newWidth = Math.max(0.5, Math.min(10 - element.x, newWidth))
        newHeight = Math.max(0.5, Math.min(7.5 - element.y, newHeight))
      } else if (resizeHandle === 'sw') {
        newWidth = Math.max(0.5, Math.min(element.x + element.width, newWidth))
        newHeight = Math.max(0.5, Math.min(7.5 - element.y, newHeight))
        newX = element.x + element.width - newWidth
      } else if (resizeHandle === 'ne') {
        newWidth = Math.max(0.5, Math.min(10 - element.x, newWidth))
        newHeight = Math.max(0.5, Math.min(element.y + element.height, newHeight))
        newY = element.y + element.height - newHeight
      } else if (resizeHandle === 'nw') {
        newWidth = Math.max(0.5, Math.min(element.x + element.width, newWidth))
        newHeight = Math.max(0.5, Math.min(element.y + element.height, newHeight))
        newX = element.x + element.width - newWidth
        newY = element.y + element.height - newHeight
      }
      
      setLayout(layout.map(el => 
        el.id === selectedElement 
          ? { ...el, x: newX, y: newY, width: newWidth, height: newHeight }
          : el
      ))
    } else if (isDragging && selectedElement) {
      const element = layout.find(el => el.id === selectedElement)
      if (!element) return
      
      const xInches = Math.max(0, Math.min(10 - element.width, (mouseX - dragOffset.x) / pixelsPerInch))
      const yInches = Math.max(0, Math.min(7.5 - element.height, (mouseY - dragOffset.y) / pixelsPerInch))
      
      setLayout(layout.map(el => 
        el.id === selectedElement 
          ? { ...el, x: xInches, y: yInches }
          : el
      ))
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setIsResizing(false)
    setResizeHandle(null)
  }

  const addExtraImageElement = () => {
    const newElement: LayoutElement = {
      id: `extra-${Date.now()}`,
      type: 'extraImage',
      x: 0.5,
      y: 6,
      width: 2,
      height: 2,
      maintainAspectRatio: true,
      folderId: drawingFolders[0]?.id
    }
    setLayout([...layout, newElement])
    setSelectedElement(newElement.id)
  }

  const addExtraTextElement = () => {
    if (selectedColumns.length === 0) {
      toast.error('Please select a sheet first')
      return
    }
    
    const newElement: LayoutElement = {
      id: `text-${Date.now()}`,
      type: 'text',
      x: 0.5,
      y: 6.5,
      width: 4,
      height: 0.5,
      fontSize: 12,
      color: '#000000',
      column: selectedColumns[0]
    }
    setLayout([...layout, newElement])
    setSelectedElement(newElement.id)
  }

  const removeElement = (elementId: string) => {
    setLayout(layout.filter(el => el.id !== elementId))
    if (selectedElement === elementId) {
      setSelectedElement(null)
    }
  }

  const updateElementProperty = (elementId: string, property: keyof LayoutElement, value: any) => {
    setLayout(layout.map(el => 
      el.id === elementId 
        ? { ...el, [property]: value }
        : el
    ))
  }

  const getElementTypeIcon = (type: string) => {
    switch (type) {
      case 'title':
      case 'description':
      case 'text':
        return <Type className="h-4 w-4" />
      case 'runImage':
      case 'drawingImage':
      case 'extraImage':
        return <ImageIcon className="h-4 w-4" />
      default:
        return <Layout className="h-4 w-4" />
    }
  }

  const getElementTypeColor = (type: string) => {
    switch (type) {
      case 'title':
        return 'from-purple-500 to-purple-600'
      case 'description':
        return 'from-blue-500 to-blue-600'
      case 'text':
        return 'from-teal-500 to-teal-600'
      case 'runImage':
        return 'from-green-500 to-green-600'
      case 'drawingImage':
        return 'from-orange-500 to-orange-600'
      case 'extraImage':
        return 'from-pink-500 to-pink-600'
      default:
        return 'from-gray-500 to-gray-600'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-white/80 backdrop-blur-lg border-b border-gray-200/50 sticky top-0 z-50 shadow-sm"
      >
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/projects/${projectId}/runs/${runId}/powerpoint-wizard`)}
                className="hover:bg-gray-100"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('powerpoint.editor.back')}
              </Button>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  {t('powerpoint.editor.title')}
                </h1>
                <p className="text-sm text-gray-600">{t('powerpoint.editor.subtitle')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(`/projects/${projectId}`, '_blank')}
                className="hover:bg-gray-100"
                title="Open project page in new window"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              <LanguageSelector />
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || (!workspaceIdState && !workspaceId)}
                  size="lg"
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('powerpoint.editor.generating')}
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      {t('powerpoint.editor.generatePowerPoint')}
                    </>
                  )}
                </Button>
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Layout: Left Panel + Center Canvas */}
      <div className="container mx-auto px-6 py-6 flex gap-6 h-[calc(100vh-140px)]">
        {/* Left Settings Panel */}
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="w-80 flex-shrink-0"
        >
          <div className="h-full overflow-y-auto space-y-4 pr-2 custom-scrollbar">
            {/* Excel Settings */}
            <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Settings className="h-4 w-4 text-indigo-600" />
                  {t('powerpoint.editor.excelSettings')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs font-medium text-gray-700">{t('powerpoint.editor.sheet')}</Label>
                  <Select value={selectedSheet} onValueChange={(value) => {
                    setSelectedSheet(value)
                    const sheet = excelSheets.find(s => s.name === value)
                    if (sheet) {
                      setSelectedColumns(sheet.columns)
                    }
                  }}>
                    <SelectTrigger className="h-9 border-gray-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {excelSheets.map((sheet) => (
                        <SelectItem key={sheet.name} value={sheet.name}>
                          {sheet.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-medium text-gray-700">{t('powerpoint.editor.titleColumn')}</Label>
                  <Select value={titleColumn} onValueChange={setTitleColumn}>
                    <SelectTrigger className="h-9 border-gray-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedColumns.map((col) => (
                        <SelectItem key={col} value={col}>
                          {col}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-medium text-gray-700">{t('powerpoint.editor.descriptionColumn')}</Label>
                  <Select value={descriptionColumn || undefined} onValueChange={(value) => setDescriptionColumn(value || undefined)}>
                    <SelectTrigger className="h-9 border-gray-300">
                      <SelectValue placeholder={t('powerpoint.editor.none')} />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedColumns.map((col) => (
                        <SelectItem key={col} value={col}>
                          {col}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-medium text-gray-700">{t('powerpoint.editor.matchColumn')}</Label>
                  <Select value={matchColumn} onValueChange={setMatchColumn}>
                    <SelectTrigger className="h-9 border-gray-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedColumns.map((col) => (
                        <SelectItem key={col} value={col}>
                          {col}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Layout Elements */}
            <Card className="border-0 shadow-lg bg-white/90 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Layout className="h-4 w-4 text-purple-600" />
                  {t('powerpoint.editor.layoutElements')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addExtraImageElement}
                      disabled={drawingFolders.length === 0}
                      className="w-full border-dashed border-2 border-gray-300 hover:border-purple-400 hover:bg-purple-50"
                      >
                        <ImageIcon className="h-3 w-3 mr-1" />
                        {t('powerpoint.editor.addImage')}
                      </Button>
                    </motion.div>
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addExtraTextElement}
                        disabled={selectedColumns.length === 0}
                        className="w-full border-dashed border-2 border-gray-300 hover:border-purple-400 hover:bg-purple-50"
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        {t('powerpoint.editor.addText')}
                      </Button>
                  </motion.div>
                </div>

                <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar">
                  <AnimatePresence>
                    {layout.map((element, index) => (
                      <motion.div
                        key={element.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ delay: index * 0.05 }}
                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedElement === element.id 
                            ? 'border-purple-500 bg-gradient-to-r from-purple-50 to-indigo-50 shadow-md' 
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                        }`}
                        onClick={() => setSelectedElement(element.id)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded bg-gradient-to-r ${getElementTypeColor(element.type)}`}>
                              {getElementTypeIcon(element.type)}
                            </div>
                            <span className="font-medium text-xs text-gray-800">
                              {t(`powerpoint.editor.${element.type === 'extraImage' ? 'extraImage' : element.type}`)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {(element.type === 'text' || element.type === 'extraImage') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeElement(element.id)
                                }}
                              >
                                ×
                              </Button>
                            )}
                            <Move className="h-3 w-3 text-gray-400" />
                          </div>
                        </div>
                        
                        <AnimatePresence>
                          {selectedElement === element.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="mt-2 pt-2 border-t border-gray-200 space-y-2 overflow-hidden"
                            >
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-xs">{t('powerpoint.editor.positionX')}</Label>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    value={element.x}
                                    onChange={(e) => updateElementProperty(element.id, 'x', parseFloat(e.target.value))}
                                    className="h-8 text-xs"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">{t('powerpoint.editor.positionY')}</Label>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    value={element.y}
                                    onChange={(e) => updateElementProperty(element.id, 'y', parseFloat(e.target.value))}
                                    className="h-8 text-xs"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">{t('powerpoint.editor.width')}</Label>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    value={element.width}
                                    onChange={(e) => updateElementProperty(element.id, 'width', parseFloat(e.target.value))}
                                    className="h-8 text-xs"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">{t('powerpoint.editor.height')}</Label>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    value={element.height}
                                    onChange={(e) => updateElementProperty(element.id, 'height', parseFloat(e.target.value))}
                                    className="h-8 text-xs"
                                  />
                                </div>
                              </div>
                              
                              {(element.type === 'title' || element.type === 'description' || element.type === 'text') && (
                                <>
                                  <div>
                                    <Label className="text-xs flex items-center gap-1">
                                      <Type className="h-3 w-3" />
                                      {t('powerpoint.editor.fontSize')}
                                    </Label>
                                    <Input
                                      type="number"
                                      value={element.fontSize || 14}
                                      onChange={(e) => updateElementProperty(element.id, 'fontSize', parseInt(e.target.value))}
                                      className="h-8 text-xs"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs flex items-center gap-1">
                                      <Palette className="h-3 w-3" />
                                      {t('powerpoint.editor.color')}
                                    </Label>
                                    <div className="flex items-center gap-2">
                                      <Input
                                        type="color"
                                        value={element.color || '#000000'}
                                        onChange={(e) => updateElementProperty(element.id, 'color', e.target.value)}
                                        className="h-8 w-16 p-1 cursor-pointer rounded"
                                      />
                                      <Input
                                        type="text"
                                        value={element.color || '#000000'}
                                        onChange={(e) => updateElementProperty(element.id, 'color', e.target.value)}
                                        placeholder="#000000"
                                        className="h-8 text-xs flex-1"
                                      />
                                    </div>
                                  </div>
                                  {element.type === 'text' && (
                                    <div>
                                      <Label className="text-xs">{t('powerpoint.editor.column')}</Label>
                                      <Select
                                        value={element.column || ''}
                                        onValueChange={(value) => updateElementProperty(element.id, 'column', value)}
                                      >
                                        <SelectTrigger className="h-8 text-xs">
                                          <SelectValue placeholder={t('powerpoint.editor.select')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {selectedColumns.map((col) => (
                                            <SelectItem key={col} value={col}>
                                              {col}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}
                                  {(element.type === 'title' || element.type === 'description') && (
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        checked={element.bold || false}
                                        onCheckedChange={(checked) => updateElementProperty(element.id, 'bold', checked)}
                                      />
                                      <Label className="text-xs">{t('powerpoint.editor.bold')}</Label>
                                    </div>
                                  )}
                                </>
                              )}
                              
                              {(element.type === 'runImage' || element.type === 'drawingImage' || element.type === 'extraImage') && (
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    checked={element.maintainAspectRatio !== false}
                                    onCheckedChange={(checked) => updateElementProperty(element.id, 'maintainAspectRatio', checked)}
                                  />
                                  <Label className="text-xs">{t('powerpoint.editor.maintainAspectRatio')}</Label>
                                </div>
                              )}
                              
                              {element.type === 'extraImage' && (
                                <div>
                                  <Label className="text-xs">{t('powerpoint.wizard.folder')}</Label>
                                  <Select
                                    value={element.folderId || ''}
                                    onValueChange={(value) => updateElementProperty(element.id, 'folderId', value)}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder={t('powerpoint.editor.select')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {drawingFolders.map((folder) => (
                                        <SelectItem key={folder.id} value={folder.id}>
                                          {folder.description || `${t('powerpoint.wizard.folder')} ${folder.id.slice(0, 8)}`}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        {/* Center Canvas */}
        <div className="flex-1 flex flex-col">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex-1 flex items-center justify-center bg-white/50 backdrop-blur-sm rounded-xl shadow-xl border border-gray-200/50 p-6"
          >
            <div 
              ref={canvasRef}
              className="relative bg-gradient-to-br from-white to-gray-50 border-4 border-gray-300 rounded-lg shadow-2xl overflow-hidden"
              style={{ 
                width: `${canvasSize.width}px`, 
                height: `${canvasSize.height}px`,
                aspectRatio: '4/3',
                maxWidth: '100%',
                maxHeight: '100%',
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Grid background - scales with canvas size */}
              <div className="absolute inset-0 opacity-10" style={{
                backgroundImage: `
                  linear-gradient(to right, #000 1px, transparent 1px),
                  linear-gradient(to bottom, #000 1px, transparent 1px)
                `,
                backgroundSize: `${canvasSize.width / 20}px ${canvasSize.width / 20}px`
              }} />
              
              {layout.map((element, index) => {
                // Calculate DPI based on canvas size (canvas represents 10" × 7.5" slide)
                const pixelsPerInch = canvasSize.width / 10
                const x = element.x * pixelsPerInch
                const y = element.y * pixelsPerInch
                const width = element.width * pixelsPerInch
                const height = element.height * pixelsPerInch
                const isSelected = selectedElement === element.id

                return (
                  <motion.div
                    key={element.id}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ 
                      scale: 1, 
                      opacity: 1
                    }}
                    transition={{ delay: index * 0.05 }}
                    className={`absolute border-2 ${
                      isSelected
                        ? 'border-purple-500 bg-gradient-to-br from-purple-100/80 to-indigo-100/80 shadow-lg ring-2 ring-purple-300 z-20' 
                        : 'border-gray-400 bg-white/80 hover:border-gray-500 z-10'
                    } ${element.type === 'title' || element.type === 'description' || element.type === 'text' ? 'flex items-center justify-center' : ''}`}
                    style={{
                      left: `${x}px`,
                      top: `${y}px`,
                      width: `${width}px`,
                      height: `${height}px`,
                      fontSize: element.fontSize ? `${element.fontSize}px` : '14px',
                      fontWeight: element.bold ? 'bold' : 'normal',
                      color: element.color || (element.type === 'title' || element.type === 'description' || element.type === 'text' ? '#000000' : undefined),
                      cursor: isSelected && isResizing ? 'nwse-resize' : 'move'
                    }}
                    whileHover={isSelected ? {} : { scale: 1.02 }}
                    onMouseDown={(e) => handleMouseDown(e, element.id)}
                  >
                    {element.type === 'title' && (
                      <span className="text-center" style={{ color: element.color || '#000000' }}>
                        {t('powerpoint.editor.titleLabel')} ({titleColumn})
                      </span>
                    )}
                    {element.type === 'description' && descriptionColumn && (
                      <span className="text-center text-xs" style={{ color: element.color || '#000000' }}>
                        {t('powerpoint.editor.description')} ({descriptionColumn})
                      </span>
                    )}
                    {element.type === 'text' && (
                      <span className="text-center text-xs" style={{ color: element.color || '#000000' }}>
                        {t('powerpoint.editor.text')} ({element.column || 'N/A'})
                      </span>
                    )}
                    {element.type === 'runImage' && (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-green-100 to-emerald-100">
                        <ImageIcon className="h-12 w-12 text-green-500" />
                        <span className="mt-2 text-xs font-medium text-green-700">{t('powerpoint.editor.runImage')}</span>
                      </div>
                    )}
                    {element.type === 'drawingImage' && (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-orange-100 to-amber-100">
                        <ImageIcon className="h-12 w-12 text-orange-500" />
                        <span className="mt-2 text-xs font-medium text-orange-700">{t('powerpoint.editor.drawingImage')}</span>
                      </div>
                    )}
                    {element.type === 'extraImage' && (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-pink-100 to-rose-100">
                        <ImageIcon className="h-10 w-10 text-pink-500" />
                        <span className="mt-1 text-xs font-medium text-center text-pink-700">
                          {t('powerpoint.editor.extraImage')}
                        </span>
                      </div>
                    )}
                    
                    {/* Resize handles */}
                    {isSelected && (
                      <>
                        {['se', 'sw', 'ne', 'nw'].map((handle) => (
                          <motion.div
                            key={handle}
                            className={`absolute w-4 h-4 bg-gradient-to-r from-purple-500 to-indigo-500 border-2 border-white rounded-full cursor-nwse-resize shadow-lg`}
                            style={{
                              [handle.includes('s') ? 'bottom' : 'top']: handle.includes('s') ? '2px' : '-2px',
                              [handle.includes('e') ? 'right' : 'left']: handle.includes('e') ? '2px' : '-2px',
                            }}
                            whileHover={{ scale: 1.2 }}
                            whileTap={{ scale: 0.9 }}
                            onMouseDown={(e) => handleMouseDown(e, element.id, true, handle as any)}
                          />
                        ))}
                      </>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
          
          <p className="text-xs text-gray-500 mt-3 text-center">
            {t('powerpoint.editor.canvasInfo')}
          </p>
        </div>
      </div>

      {/* Bottom Download Section */}
      {generatedFiles.length > 0 && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="border-t border-gray-200 bg-white/90 backdrop-blur-lg mt-auto"
        >
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-800">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                {t('powerpoint.editor.downloadSection')}
              </h3>
              <span className="text-sm text-gray-500">{generatedFiles.length} file{generatedFiles.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-48 overflow-y-auto custom-scrollbar">
              <AnimatePresence>
                {generatedFiles.map((file, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between p-3 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg hover:shadow-md transition-shadow"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-800 truncate">{file.filename}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(file.created_at).toLocaleString()}
                      </p>
                    </div>
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button asChild size="sm" className="ml-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700">
                        <a href={file.download_url} download>
                          <Download className="h-3 w-3 mr-1" />
                          {t('powerpoint.editor.download')}
                        </a>
                      </Button>
                    </motion.div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}

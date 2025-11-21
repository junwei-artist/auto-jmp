'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, ArrowLeft, ArrowRight, Save, Download, ZoomIn, ZoomOut, Maximize2, RotateCcw, CheckCircle2, XCircle, ChevronLeft, ChevronRight, Sparkles, Layers, Edit3, Move, Plus, Image as ImageIcon, ExternalLink } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'
import { projectApi } from '@/lib/api'
import { useLanguage } from '@/lib/language'
import { LanguageSelector } from '@/components/LanguageSelector'

interface Annotation {
  image: string
  label: string
  class_id: number
  bbox: [number, number, number, number]
  yolo: [number, number, number, number, number]
  region?: [number, number, number, number] // Second annotation layer: [x, y, width, height] normalized
}

interface AnnotationMetadata {
  annotations: Annotation[]
  metadata: {
    annotations_json_path: string
    image_annotations_json_path: string
    original_image_folder: string
    pdf_filename: string
  }
}

export default function AnnotationEditorPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params?.id as string
  const folderId = params?.folderId as string
  const { t } = useLanguage()

  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [metadata, setMetadata] = useState<AnnotationMetadata['metadata'] | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null)
  const [currentRegion, setCurrentRegion] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  // Editing mode: 'region' (second layer), 'bbox' (first layer), or 'pan' (panning)
  const [editMode, setEditMode] = useState<'region' | 'bbox' | 'pan'>('region')
  // Cursor for canvas
  const [canvasCursor, setCanvasCursor] = useState<'crosshair' | 'default' | 'move' | 'grab' | 'grabbing'>('crosshair')
  // Panning state (spacebar or middle mouse)
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [isSpaceDown, setIsSpaceDown] = useState(false)
  // Region preview widget
  const [showRegionPreview, setShowRegionPreview] = useState(true)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 })
  const [previewSize, setPreviewSize] = useState({ width: 260, height: 200 })
  const [isDraggingPreview, setIsDraggingPreview] = useState(false)
  const [isResizingPreview, setIsResizingPreview] = useState(false)
  const [dragStartPreview, setDragStartPreview] = useState({ x: 0, y: 0, startX: 0, startY: 0 })
  const [resizeStartPreview, setResizeStartPreview] = useState({ x: 0, y: 0, startW: 0, startH: 0 })
  // BBox interaction state
  const [isBBoxDragging, setIsBBoxDragging] = useState(false)
  const [bboxDragType, setBBoxDragType] = useState<'move' | 'nw' | 'ne' | 'sw' | 'se' | null>(null)
  const [bboxDragOffset, setBBoxDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 })
  // BBox edit session (for confirm/cancel)
  const [isBBoxSession, setIsBBoxSession] = useState(false)
  // Spotlight animation state
  const [spotlightAnimation, setSpotlightAnimation] = useState(0)
  const [bboxSessionOriginal, setBBoxSessionOriginal] = useState<{
    label: string
    bbox: [number, number, number, number]
  } | null>(null)
  const [tempLabel, setTempLabel] = useState<string>('')
  // Add new label state
  const [isAddingNewLabel, setIsAddingNewLabel] = useState(false)
  const [newLabelBbox, setNewLabelBbox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [showNewLabelDialog, setShowNewLabelDialog] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  // Thumbnail gallery state
  const [showThumbnailGallery, setShowThumbnailGallery] = useState(false)
  const [drawingImages, setDrawingImages] = useState<any[]>([])
  const [isLoadingImages, setIsLoadingImages] = useState(false)
  const [folderDescription, setFolderDescription] = useState<string>('')
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Load annotations
  useEffect(() => {
    if (folderId) {
      loadAnnotations()
    }
  }, [folderId])

  // Load saved preview widget position/size from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`preview-widget-${folderId}`)
    if (saved) {
      try {
        const { position, size } = JSON.parse(saved)
        if (position) setPreviewPosition(position)
        if (size) setPreviewSize(size)
      } catch (e) {
        console.error('Failed to load preview widget settings', e)
      }
    }
  }, [folderId])

  // Save preview widget position/size to localStorage
  useEffect(() => {
    if (folderId && (previewPosition.x > 0 || previewPosition.y > 0 || previewSize.width !== 260 || previewSize.height !== 200)) {
      localStorage.setItem(
        `preview-widget-${folderId}`,
        JSON.stringify({ position: previewPosition, size: previewSize })
      )
    }
  }, [previewPosition, previewSize, folderId])

  // Track current image to reload when it changes
  const [currentImageName, setCurrentImageName] = useState<string | null>(null)

  // Load image when current annotation changes (and image name changes)
  useEffect(() => {
    if (annotations.length > 0 && currentIndex >= 0 && currentIndex < annotations.length) {
      const annotation = annotations[currentIndex]
      if (annotation.image !== currentImageName) {
        setCurrentImageName(annotation.image)
        setImageLoaded(false) // Reset image loaded state
        loadCurrentImage()
      } else if (imageLoaded && canvasRef.current && imageRef.current) {
        // Image already loaded, just redraw annotations
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          if (canvasRef.current && imageRef.current) {
            const canvas = canvasRef.current
            const ctx = canvas.getContext('2d')
            if (ctx) {
              canvas.width = imageRef.current.width
              canvas.height = imageRef.current.height
              ctx.clearRect(0, 0, canvas.width, canvas.height)
              ctx.drawImage(imageRef.current, 0, 0)
              // Redraw will be handled by the drawAnnotations effect below
            }
          }
        })
      }
    }
  }, [annotations, currentIndex, currentImageName, imageLoaded])

  // Update cursor and ensure a selection exists when switching modes
  useEffect(() => {
    // When switching modes, always ensure image is loaded first (like refresh does)
    if (annotations.length > 0 && currentIndex >= 0 && currentIndex < annotations.length) {
      const annotation = annotations[currentIndex]
      // Always reload image when switching modes to ensure it's visible
      if (!imageLoaded || !imageRef.current || annotation.image !== currentImageName) {
        if (annotation.image !== currentImageName) {
          setCurrentImageName(annotation.image)
          setImageLoaded(false)
        }
        // Force reload image - this is what refresh does
        loadCurrentImage()
      } else if (imageLoaded && imageRef.current && canvasRef.current) {
        // Image is loaded, but ensure it's drawn on canvas
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (ctx && imageRef.current.width > 0 && imageRef.current.height > 0) {
          canvas.width = imageRef.current.width
          canvas.height = imageRef.current.height
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(imageRef.current, 0, 0)
          // Annotations will be drawn by the drawAnnotations effect
        }
      }
    }

    if (editMode === 'pan') {
      setCanvasCursor(isPanning ? 'grabbing' : 'grab')
      setIsBBoxSession(false)
      setBBoxSessionOriginal(null)
    } else if (editMode === 'region') {
      setCanvasCursor(isPanning ? 'grabbing' : isSpaceDown ? 'grab' : 'crosshair')
      // end any bbox session if switching away
      setIsBBoxSession(false)
      setBBoxSessionOriginal(null)
    } else if (editMode === 'bbox') {
      setCanvasCursor(isPanning ? 'grabbing' : 'default')
      // Ensure an annotation on current page is selected
      const currentImage = annotations[currentIndex]?.image
      if (!currentImage && annotations.length > 0) {
        setCurrentIndex(0)
      }
      // start bbox edit session snapshot
      const ann = annotations[currentIndex]
      if (ann) {
        setIsBBoxSession(true)
        setBBoxSessionOriginal({ label: ann.label, bbox: [...ann.bbox] as [number, number, number, number] })
        setTempLabel(ann.label)
      }
    }
  }, [editMode, isPanning, isSpaceDown, annotations, currentIndex, imageLoaded, currentImageName])

  // Global key handlers for spacebar panning
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        setIsSpaceDown(true)
        setCanvasCursor(isPanning ? 'grabbing' : 'grab')
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        setIsSpaceDown(false)
        setCanvasCursor(editMode === 'region' ? 'crosshair' : 'default')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [editMode, isPanning])

  const loadAnnotations = async () => {
    try {
      setIsLoading(true)
      const data: AnnotationMetadata = await projectApi.getDrawingAnnotations(projectId, folderId)
      setAnnotations(data.annotations)
      setMetadata(data.metadata)
      
      // Load folder description
      try {
        const folder = await projectApi.getDrawingFolder(projectId, folderId)
        setFolderDescription(folder.description || '')
      } catch (error) {
        console.error('Failed to load folder description:', error)
      }
    } catch (error: any) {
      console.error('Failed to load annotations:', error)
      toast.error(error.message || t('annotation.editor.loadFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  const loadCurrentImage = async () => {
    if (!annotations[currentIndex] || !metadata) return

    const annotation = annotations[currentIndex]
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4700'
    // Use the API endpoint for original images
    const imageUrl = `${backendUrl}/api/v1/projects/${projectId}/drawing-folders/${folderId}/original-image/${annotation.image}`
    
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imageRef.current = img
      setImageUrl(imageUrl)
      setImageLoaded(true)
      drawAnnotations()
    }
    img.onerror = (error) => {
      console.error('Failed to load image:', error)
      toast.error(`${t('annotation.editor.loadFailed')}: ${annotation.image}`)
    }
    img.src = imageUrl
  }

  const drawAnnotations = useCallback(() => {
    if (!canvasRef.current || !imageRef.current) {
      console.log('drawAnnotations: missing canvas or image', { canvas: !!canvasRef.current, image: !!imageRef.current })
      return
    }

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      console.log('drawAnnotations: failed to get context')
      return
    }

    // Set canvas size to match image
    const imgWidth = imageRef.current.width
    const imgHeight = imageRef.current.height
    
    if (imgWidth === 0 || imgHeight === 0) {
      console.log('drawAnnotations: image has zero dimensions', { imgWidth, imgHeight })
      return
    }

    canvas.width = imgWidth
    canvas.height = imgHeight

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw image first - this is critical
    try {
      ctx.drawImage(imageRef.current, 0, 0)
    } catch (error) {
      console.error('drawAnnotations: failed to draw image', error)
      return
    }

    const currentAnnotation = annotations[currentIndex]
    if (!currentAnnotation) return

    // Get current image name
    const currentImageName = currentAnnotation.image

    // Draw all annotations that belong to the current image
    const imageAnnotations = annotations.filter(ann => ann.image === currentImageName)
    
    // First pass: Draw all annotations (non-selected first, then selected)
    const nonSelected = imageAnnotations.filter(ann => ann !== currentAnnotation)
    const selected = imageAnnotations.filter(ann => ann === currentAnnotation)
    
    // Draw non-selected annotations first
    nonSelected.forEach((ann) => {
      // Draw first layer annotation (FAI bubble - red)
      const [x1, y1, x2, y2] = ann.bbox
      ctx.strokeStyle = '#ff9999'
      ctx.lineWidth = 2
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
      ctx.fillStyle = '#ff9999'
      ctx.font = '14px Arial'
      ctx.fillText(ann.label, x1, y1 - 5)

      // Draw second layer annotation (region - blue) if exists
      if (ann.region) {
        const [rx, ry, rw, rh] = ann.region
        const regionX = rx * canvas.width
        const regionY = ry * canvas.height
        const regionW = rw * canvas.width
        const regionH = rh * canvas.height
        
        ctx.strokeStyle = '#9999ff'
        ctx.lineWidth = 2
        ctx.strokeRect(regionX, regionY, regionW, regionH)
        ctx.fillStyle = '#9999ff'
        ctx.font = '14px Arial'
        ctx.fillText('Region', regionX, regionY - 5)
      }
    })
    
    // Draw simple circle motion effect for selected FAI in bbox or region mode
    if ((editMode === 'bbox' || editMode === 'region') && currentAnnotation && selected.length > 0) {
      const ann = currentAnnotation
      const [x1, y1, x2, y2] = ann.bbox
      const centerX = (x1 + x2) / 2
      const centerY = (y1 + y2) / 2
      const width = x2 - x1
      const height = y2 - y1
      const baseRadius = Math.max(width, height) * 1.5
      
      // Animation phase
      const pulsePhase = (spotlightAnimation % 60) / 60 * Math.PI * 2
      
      // Draw 3 simple animated circles
      ctx.save()
      ctx.lineWidth = 2
      
      // Outer circle
      const outerRadius = baseRadius + Math.sin(pulsePhase) * 10
      ctx.strokeStyle = `rgba(255, 100, 100, ${0.6 + Math.sin(pulsePhase) * 0.2})`
      ctx.beginPath()
      ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2)
      ctx.stroke()
      
      // Middle circle
      const middleRadius = baseRadius + Math.sin(pulsePhase + Math.PI / 3) * 8
      ctx.strokeStyle = `rgba(255, 150, 100, ${0.6 + Math.sin(pulsePhase + Math.PI / 3) * 0.2})`
      ctx.beginPath()
      ctx.arc(centerX, centerY, middleRadius, 0, Math.PI * 2)
      ctx.stroke()
      
      // Inner circle
      const innerRadius = baseRadius + Math.sin(pulsePhase + Math.PI * 2 / 3) * 6
      ctx.strokeStyle = `rgba(255, 200, 100, ${0.6 + Math.sin(pulsePhase + Math.PI * 2 / 3) * 0.2})`
      ctx.beginPath()
      ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2)
      ctx.stroke()
      
      ctx.restore()
    }
    
    // Draw selected annotation on top (so it's visible above spotlight)
    selected.forEach((ann) => {
      const [x1, y1, x2, y2] = ann.bbox
      ctx.strokeStyle = 'red'
      ctx.lineWidth = 10
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
      ctx.fillStyle = 'red'
      ctx.font = 'bold 14px Arial'
      ctx.fillText(ann.label, x1, y1 - 5)

      // Draw drag handles for selected bbox in FAI mode
      if (editMode === 'bbox') {
        const handleSize = 8
        const corners = [
          { x: x1, y: y1, t: 'nw' },
          { x: x2, y: y1, t: 'ne' },
          { x: x1, y: y2, t: 'sw' },
          { x: x2, y: y2, t: 'se' },
        ] as const
        ctx.fillStyle = 'white'
        ctx.strokeStyle = 'black'
        ctx.lineWidth = 2
        corners.forEach(c => {
          ctx.save()
          ctx.shadowBlur = 10
          ctx.shadowColor = 'rgba(255, 100, 100, 0.8)'
          ctx.fillRect(c.x - handleSize/2, c.y - handleSize/2, handleSize, handleSize)
          ctx.strokeRect(c.x - handleSize/2, c.y - handleSize/2, handleSize, handleSize)
          ctx.restore()
        })
      }

      // Draw second layer annotation (region - blue) if exists
      if (ann.region) {
        const [rx, ry, rw, rh] = ann.region
        const regionX = rx * canvas.width
        const regionY = ry * canvas.height
        const regionW = rw * canvas.width
        const regionH = rh * canvas.height
        
        ctx.strokeStyle = 'blue'
        ctx.lineWidth = 10
        ctx.strokeRect(regionX, regionY, regionW, regionH)
        ctx.fillStyle = 'blue'
        ctx.font = 'bold 14px Arial'
        ctx.fillText('Region', regionX, regionY - 5)
      }
    })

    // Draw current region being drawn (only for selected annotation)
    if (currentRegion && editMode === 'region') {
      const regionX = currentRegion.x * canvas.width
      const regionY = currentRegion.y * canvas.height
      const regionW = currentRegion.width * canvas.width
      const regionH = currentRegion.height * canvas.height
      
      ctx.strokeStyle = 'green'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.strokeRect(regionX, regionY, regionW, regionH)
      ctx.setLineDash([])
    }

    // Draw new label bbox being drawn
    if (isAddingNewLabel && newLabelBbox) {
      const { x1, y1, x2, y2 } = newLabelBbox
      const minX = Math.min(x1, x2)
      const maxX = Math.max(x1, x2)
      const minY = Math.min(y1, y2)
      const maxY = Math.max(y1, y2)
      
      ctx.strokeStyle = 'orange'
      ctx.lineWidth = 3
      ctx.setLineDash([5, 5])
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY)
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(255, 165, 0, 0.1)'
      ctx.fillRect(minX, minY, maxX - minX, maxY - minY)
    }

  }, [annotations, currentIndex, currentRegion, editMode, spotlightAnimation, isAddingNewLabel, newLabelBbox])

  useEffect(() => {
    if (imageLoaded) {
      drawAnnotations()
    }
  }, [imageLoaded, drawAnnotations])

  // Animate circle effect when in FAI or region mode with selected annotation
  useEffect(() => {
    if ((editMode === 'bbox' || editMode === 'region') && currentIndex >= 0) {
      const interval = setInterval(() => {
        setSpotlightAnimation(prev => prev + 1)
      }, 16) // ~60fps
      return () => clearInterval(interval)
    }
  }, [editMode, currentIndex])

  // Redraw when mode changes to ensure image stays visible
  // This effect runs after drawAnnotations is defined
  useEffect(() => {
    if (imageLoaded && imageRef.current && canvasRef.current) {
      // Small delay to ensure all state updates are complete
      const timeoutId = setTimeout(() => {
        drawAnnotations()
      }, 10)
      return () => clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, imageLoaded])

  // Draw region-only floating preview
  useEffect(() => {
    const drawPreview = () => {
      const canvas = previewCanvasRef.current
      const img = imageRef.current
      if (!canvas || !img) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const regionSource = currentRegion
        ? { x: currentRegion.x, y: currentRegion.y, w: currentRegion.width, h: currentRegion.height }
        : (annotations[currentIndex]?.region
          ? { x: annotations[currentIndex].region[0], y: annotations[currentIndex].region[1], w: annotations[currentIndex].region[2], h: annotations[currentIndex].region[3] }
          : null)

      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#0b1020'
      ctx.fillRect(0, 0, W, H)

      if (!regionSource || regionSource.w <= 0 || regionSource.h <= 0) {
        ctx.fillStyle = '#94a3b8'
        ctx.font = '12px ui-sans-serif, system-ui, -apple-system'
        ctx.fillText('No region', 10, 20)
        return
      }

      const sx = Math.max(0, Math.min(img.width, regionSource.x * img.width))
      const sy = Math.max(0, Math.min(img.height, regionSource.y * img.height))
      const sw = Math.max(1, Math.min(img.width - sx, regionSource.w * img.width))
      const sh = Math.max(1, Math.min(img.height - sy, regionSource.h * img.height))

      // Fit into preview canvas with letterboxing
      const scale = Math.min(W / sw, H / sh)
      const dw = sw * scale
      const dh = sh * scale
      const dx = (W - dw) / 2
      const dy = (H - dh) / 2
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)

      // Border
      ctx.strokeStyle = '#60a5fa'
      ctx.lineWidth = 2
      ctx.strokeRect(dx, dy, dw, dh)
    }

    drawPreview()
  }, [annotations, currentIndex, currentRegion, imageLoaded])

  // Utility: get mouse position in image pixel space
  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !imageRef.current) return
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const xPx = (e.clientX - rect.left) * scaleX
    const yPx = (e.clientY - rect.top) * scaleY
    return { xPx, yPx }
  }

  // Hit test utilities for bbox selection on current image
  const hitTestAnnotationAt = (xPx: number, yPx: number): number => {
    const currentImage = annotations[currentIndex]?.image
    if (!currentImage) return -1
    for (let i = annotations.length - 1; i >= 0; i--) {
      const ann = annotations[i]
      if (ann.image !== currentImage) continue
      const [x1, y1, x2, y2] = ann.bbox
      if (xPx >= x1 && xPx <= x2 && yPx >= y1 && yPx <= y2) {
        return i
      }
    }
    return -1
  }

  // Mouse events for region or bbox edit
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !imageRef.current) return
    
    // Handle adding new label - draw bbox
    if (isAddingNewLabel) {
      const pos = getMousePos(e)
      if (!pos) return
      const { xPx, yPx } = pos
      setNewLabelBbox({ x1: xPx, y1: yPx, x2: xPx, y2: yPx })
      return
    }
    // Pan mode, middle mouse, or spacebar => start panning
    if (editMode === 'pan' || e.button === 1 || isSpaceDown) {
      setIsPanning(true)
      setCanvasCursor('grabbing')
      setPanStart({ x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y })
      return
    }
    const pos = getMousePos(e)
    if (!pos) return
    const { xPx, yPx } = pos

    const ann = annotations[currentIndex]
    if (!ann) return

    if (editMode === 'bbox') {
      const [x1, y1, x2, y2] = ann.bbox
      // Hit test handles (priority) then inside for move
      const handleSize = 10
      const corners = [
        { x: x1, y: y1, t: 'nw' as const },
        { x: x2, y: y1, t: 'ne' as const },
        { x: x1, y: y2, t: 'sw' as const },
        { x: x2, y: y2, t: 'se' as const },
      ]
      for (const c of corners) {
        if (Math.abs(xPx - c.x) <= handleSize && Math.abs(yPx - c.y) <= handleSize) {
          setBBoxDragType(c.t)
          setIsBBoxDragging(true)
          return
        }
      }
      // If not on current bbox, allow selecting another bbox by click
      if (!(xPx >= x1 && xPx <= x2 && yPx >= y1 && yPx <= y2)) {
        const hitIdx = hitTestAnnotationAt(xPx, yPx)
        if (hitIdx >= 0 && hitIdx !== currentIndex) {
          setCurrentIndex(hitIdx)
          // Focus on the newly selected bbox
          const newAnn = annotations[hitIdx]
          if (newAnn) {
            setTimeout(() => focusOnBbox(newAnn.bbox), 50)
          }
          return
        }
      }
      // If inside current bbox, start move
      if (xPx >= x1 && xPx <= x2 && yPx >= y1 && yPx <= y2) {
        setBBoxDragType('move')
        setIsBBoxDragging(true)
        setBBoxDragOffset({ dx: xPx - x1, dy: yPx - y1 })
        return
      }
      return
    }

    // Region mode: normalized coords
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = (e.clientX - rect.left) * scaleX / imageRef.current.width
    const y = (e.clientY - rect.top) * scaleY / imageRef.current.height

    setIsDrawing(true)
    setDrawStart({ x, y })
    setCurrentRegion({ x, y, width: 0, height: 0 })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !imageRef.current) return
    
    // Handle adding new label - update bbox
    if (isAddingNewLabel && newLabelBbox) {
      const pos = getMousePos(e)
      if (!pos) return
      const { xPx, yPx } = pos
      setNewLabelBbox({ ...newLabelBbox, x2: xPx, y2: yPx })
      return
    }
    
    // Handle preview widget dragging
    if (isDraggingPreview && dragStartPreview) {
      const dx = e.clientX - dragStartPreview.x
      const dy = e.clientY - dragStartPreview.y
      setPreviewPosition({
        x: Math.max(0, Math.min(window.innerWidth - previewSize.width, dragStartPreview.startX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - previewSize.height, dragStartPreview.startY + dy)),
      })
      return
    }
    
    // Handle preview widget resizing
    if (isResizingPreview && resizeStartPreview) {
      const dx = e.clientX - resizeStartPreview.x
      const dy = e.clientY - resizeStartPreview.y
      const newWidth = Math.max(200, Math.min(600, resizeStartPreview.startW + dx))
      const newHeight = Math.max(150, Math.min(400, resizeStartPreview.startH + dy))
      setPreviewSize({ width: newWidth, height: newHeight })
      return
    }
    
    if (isPanning && panStart) {
      const dx = (e.clientX - panStart.x) / zoom
      const dy = (e.clientY - panStart.y) / zoom
      setPan({ x: panStart.panX + dx, y: panStart.panY + dy })
      return
    }
    const ann = annotations[currentIndex]
    if (!ann) return

    if (editMode === 'bbox') {
      if (!isBBoxDragging || !bboxDragType) return
      const pos = getMousePos(e)
      if (!pos) return
      const { xPx, yPx } = pos

      const [x1, y1, x2, y2] = ann.bbox
      let nx1 = x1, ny1 = y1, nx2 = x2, ny2 = y2
      if (bboxDragType === 'move') {
        const dx = xPx - bboxDragOffset.dx
        const dy = yPx - bboxDragOffset.dy
        const w = x2 - x1
        const h = y2 - y1
        nx1 = dx
        ny1 = dy
        nx2 = dx + w
        ny2 = dy + h
      } else {
        if (bboxDragType === 'nw') { nx1 = xPx; ny1 = yPx }
        if (bboxDragType === 'ne') { nx2 = xPx; ny1 = yPx }
        if (bboxDragType === 'sw') { nx1 = xPx; ny2 = yPx }
        if (bboxDragType === 'se') { nx2 = xPx; ny2 = yPx }
      }
      const updated = [...annotations]
      updated[currentIndex] = { ...ann, bbox: [Math.min(nx1, nx2), Math.min(ny1, ny2), Math.max(nx1, nx2), Math.max(ny1, ny2)] as [number, number, number, number] }
      setAnnotations(updated)
      drawAnnotations()
      return
    }

    // Region mode drawing
    if (!isDrawing || !drawStart) return
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = (e.clientX - rect.left) * scaleX / imageRef.current.width
    const y = (e.clientY - rect.top) * scaleY / imageRef.current.height
    const width = Math.abs(x - drawStart.x)
    const height = Math.abs(y - drawStart.y)
    const startX = Math.min(x, drawStart.x)
    const startY = Math.min(y, drawStart.y)
    setCurrentRegion({ x: startX, y: startY, width, height })
  }

  const handleMouseUp = () => {
    // Handle adding new label - show dialog
    if (isAddingNewLabel && newLabelBbox) {
      const { x1, y1, x2, y2 } = newLabelBbox
      const minX = Math.min(x1, x2)
      const maxX = Math.max(x1, x2)
      const minY = Math.min(y1, y2)
      const maxY = Math.max(y1, y2)
      
      // Only show dialog if bbox has meaningful size (at least 20x20 pixels)
      if (Math.abs(maxX - minX) > 20 && Math.abs(maxY - minY) > 20) {
        setNewLabelBbox({ x1: minX, y1: minY, x2: maxX, y2: maxY })
        setShowNewLabelDialog(true)
      } else {
        // Reset if too small
        setNewLabelBbox(null)
      }
      return
    }
    
    if (isDraggingPreview) {
      setIsDraggingPreview(false)
      setDragStartPreview({ x: 0, y: 0, startX: 0, startY: 0 })
      return
    }
    if (isResizingPreview) {
      setIsResizingPreview(false)
      setResizeStartPreview({ x: 0, y: 0, startW: 0, startH: 0 })
      return
    }
    if (isPanning) {
      setIsPanning(false)
      setPanStart(null)
      setCanvasCursor(isSpaceDown ? 'grab' : (editMode === 'region' ? 'crosshair' : 'default'))
      return
    }
    if (editMode === 'bbox') {
      setIsBBoxDragging(false)
      setBBoxDragType(null)
      return
    }
    if (!isDrawing || !drawStart || !currentRegion) return
    const annotation = annotations[currentIndex]
    if (annotation) {
      const updatedAnnotations = [...annotations]
      updatedAnnotations[currentIndex] = {
        ...annotation,
        region: [currentRegion.x, currentRegion.y, currentRegion.width, currentRegion.height] as [number, number, number, number]
      }
      setAnnotations(updatedAnnotations)
    }
    setIsDrawing(false)
    setDrawStart(null)
    setCurrentRegion(null)
  }

  // Get all unique pages/images
  const getPages = () => {
    const pageSet = new Set<string>()
    annotations.forEach(ann => pageSet.add(ann.image))
    return Array.from(pageSet).sort()
  }

  // Navigate to specific page
  const navigateToPage = (pageImageName: string) => {
    // Find first annotation for this page
    const firstIndex = annotations.findIndex(ann => ann.image === pageImageName)
    if (firstIndex >= 0) {
      setCurrentIndex(firstIndex)
    }
  }

  // Navigate to next/previous page
  const navigatePage = (direction: 'prev' | 'next') => {
    const pages = getPages()
    const currentPage = annotations[currentIndex]?.image
    const currentPageIndex = pages.indexOf(currentPage || '')
    
    if (direction === 'prev' && currentPageIndex > 0) {
      navigateToPage(pages[currentPageIndex - 1])
    } else if (direction === 'next' && currentPageIndex < pages.length - 1) {
      navigateToPage(pages[currentPageIndex + 1])
    }
  }

  // Get current page info
  const getCurrentPageInfo = () => {
    const pages = getPages()
    const currentPage = annotations[currentIndex]?.image
    const currentPageIndex = pages.indexOf(currentPage || '')
    const pageNumber = currentPage ? currentPage.replace(/.*_page_(\d+)\.png/, '$1') : '1'
    return {
      currentPage,
      currentPageIndex: currentPageIndex + 1,
      totalPages: pages.length,
      pageNumber,
      isFirstPage: currentPageIndex === 0,
      isLastPage: currentPageIndex === pages.length - 1
    }
  }

  const navigateAnnotation = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    } else if (direction === 'next' && currentIndex < annotations.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  const resetZoom = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  // Add new label
  const startAddingNewLabel = () => {
    if (!imageRef.current || !annotations.length) {
      toast.error(t('annotation.editor.waitForImage'))
      return
    }
    setIsAddingNewLabel(true)
    setNewLabelBbox(null)
    setCanvasCursor('crosshair')
    toast(t('annotation.editor.addNewLabelMode'))
  }

  const cancelAddingNewLabel = () => {
    setIsAddingNewLabel(false)
    setNewLabelBbox(null)
    setCanvasCursor(editMode === 'region' ? 'crosshair' : 'default')
  }

  const saveNewLabel = async () => {
    if (!newLabelName.trim()) {
      toast.error(t('annotation.editor.pleaseEnterLabel'))
      return
    }
    if (!newLabelBbox || !imageRef.current || !annotations.length) {
      toast.error(t('annotation.editor.invalidBbox'))
      return
    }

    const currentAnnotation = annotations[currentIndex]
    if (!currentAnnotation) {
      toast.error(t('annotation.editor.noCurrentAnnotation'))
      return
    }

    const currentImageName = currentAnnotation.image
    const imgWidth = imageRef.current.width
    const imgHeight = imageRef.current.height

    // Find max class_id
    const maxClassId = Math.max(...annotations.map(a => a.class_id), 0)
    const newClassId = maxClassId + 1

    const { x1, y1, x2, y2 } = newLabelBbox
    const minX = Math.min(x1, x2)
    const maxX = Math.max(x1, x2)
    const minY = Math.min(y1, y2)
    const maxY = Math.max(y1, y2)

    // Calculate YOLO coordinates
    const x_center = (minX + maxX) / 2 / imgWidth
    const y_center = (minY + maxY) / 2 / imgHeight
    const width = (maxX - minX) / imgWidth
    const height = (maxY - minY) / imgHeight

    const newAnnotation: Annotation = {
      image: currentImageName,
      label: newLabelName.trim(),
      class_id: newClassId,
      bbox: [minX, minY, maxX, maxY] as [number, number, number, number],
      yolo: [newClassId, x_center, y_center, width, height]
    }

    // Add new annotation after current one
    const newAnnotations = [...annotations]
    const insertIndex = currentIndex + 1
    newAnnotations.splice(insertIndex, 0, newAnnotation)
    
    // Optimistically update UI
    setAnnotations(newAnnotations)
    setCurrentIndex(insertIndex)
    setIsAddingNewLabel(false)
    setNewLabelBbox(null)
    setShowNewLabelDialog(false)
    setNewLabelName('')
    setCanvasCursor(editMode === 'region' ? 'crosshair' : 'default')
    
    // Save to backend
    try {
      await projectApi.updateDrawingAnnotations(projectId, folderId, newAnnotations)
      toast.success(t('annotation.editor.newLabelAdded', { label: newLabelName.trim() }))
    } catch (error: any) {
      console.error('Failed to save new annotation:', error)
      toast.error(error.message || t('annotation.editor.saveFailed'))
      // Revert on error
      setAnnotations(annotations)
      setCurrentIndex(currentIndex)
    }
  }

  // Focus view on a specific bbox
  const focusOnBbox = (bbox: [number, number, number, number]) => {
    if (!canvasRef.current || !imageRef.current || !containerRef.current) return
    
    const [x1, y1, x2, y2] = bbox
    const bboxW = Math.max(1, x2 - x1)
    const bboxH = Math.max(1, y2 - y1)
    const bboxCenterX = (x1 + x2) / 2
    const bboxCenterY = (y1 + y2) / 2
    
    const container = containerRef.current
    const containerRect = container.getBoundingClientRect()
    const containerW = containerRect.width
    const containerH = containerRect.height
    
    // Add padding around bbox
    const padding = 40
    const targetW = bboxW + padding * 2
    const targetH = bboxH + padding * 2
    
    // Calculate zoom to fit bbox nicely in viewport
    const zoomX = (containerW * 0.8) / targetW
    const zoomY = (containerH * 0.8) / targetH
    const targetZoom = Math.max(1, Math.min(5, Math.min(zoomX, zoomY)))
    
    // Calculate pan to center bbox
    const imageW = imageRef.current.width
    const imageH = imageRef.current.height
    const scaleCenterX = containerW / (2 * targetZoom)
    const scaleCenterY = containerH / (2 * targetZoom)
    const panX = scaleCenterX - bboxCenterX
    const panY = scaleCenterY - bboxCenterY
    
    setZoom(targetZoom)
    setPan({ x: panX, y: panY })
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(prev => Math.max(0.5, Math.min(5, prev * delta)))
  }

  const saveAnnotations = async () => {
    try {
      setIsSaving(true)
      await projectApi.updateDrawingAnnotations(projectId, folderId, annotations)
      toast.success(t('annotation.editor.saveSuccess'))
    } catch (error: any) {
      console.error('Failed to save annotations:', error)
      toast.error(error.message || t('annotation.editor.saveFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const generateOutput = async () => {
    try {
      setIsSaving(true)
      await projectApi.generateDrawingOutput(projectId, folderId, false)
      toast.success(t('annotation.editor.generateSuccess'))
    } catch (error: any) {
      console.error('Failed to generate output:', error)
      toast.error(error.message || t('annotation.editor.generateFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  // Sort images by filename, extracting numbers if present
  const sortImagesByFilename = (images: any[]) => {
    return [...images].sort((a, b) => {
      const nameA = a.filename || ''
      const nameB = b.filename || ''
      
      // Extract all numbers from filenames
      const numbersA = nameA.match(/\d+/g) || []
      const numbersB = nameB.match(/\d+/g) || []
      
      // If both have numbers, compare by first number, then by remaining numbers
      if (numbersA.length > 0 && numbersB.length > 0) {
        // Compare first number
        const firstNumA = parseInt(numbersA[0])
        const firstNumB = parseInt(numbersB[0])
        if (firstNumA !== firstNumB) {
          return firstNumA - firstNumB
        }
        
        // If first numbers are equal, compare remaining numbers
        for (let i = 1; i < Math.max(numbersA.length, numbersB.length); i++) {
          const numA = i < numbersA.length ? parseInt(numbersA[i]) : 0
          const numB = i < numbersB.length ? parseInt(numbersB[i]) : 0
          if (numA !== numB) {
            return numA - numB
          }
        }
      }
      
      // Fallback to string comparison
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' })
    })
  }

  const loadDrawingImages = async () => {
    try {
      setIsLoadingImages(true)
      const images = await projectApi.getDrawingImages(projectId, folderId)
      const sortedImages = sortImagesByFilename(images)
      setDrawingImages(sortedImages)
    } catch (error: any) {
      console.error('Failed to load drawing images:', error)
      toast.error(error.message || 'Failed to load images')
    } finally {
      setIsLoadingImages(false)
    }
  }

  const handleShowThumbnailGallery = () => {
    setShowThumbnailGallery(true)
    if (drawingImages.length === 0) {
      loadDrawingImages()
    }
  }

  const getCompletionStatus = () => {
    const total = annotations.length
    const completed = annotations.filter(a => a.region).length
    return { completed, total, percentage: total > 0 ? (completed / total) * 100 : 0 }
  }

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <div className="text-center">
          <div className="relative mb-6">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-600" />
            <Sparkles className="h-6 w-6 text-purple-500 absolute -top-1 -right-1 animate-pulse" />
          </div>
          <p className="text-gray-700 font-medium">{t('annotation.editor.loading')}</p>
        </div>
      </div>
    )
  }

  if (annotations.length === 0) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('common.back')}
          </Button>
          <LanguageSelector />
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-600">{t('annotation.editor.noAnnotations')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const status = getCompletionStatus()
  const currentAnnotation = annotations[currentIndex]

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="relative bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 border-b border-blue-400/30 px-6 py-4 flex items-center justify-between shadow-lg">
        {/* Decorative SVG pattern */}
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
        
        <div className="flex items-center gap-4 relative z-10">
          <Button 
            variant="ghost" 
            onClick={() => router.back()}
            className="bg-white/20 hover:bg-white/30 text-white border-white/30 backdrop-blur-sm transition-all"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('common.back')}
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <Edit3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white drop-shadow-lg">{t('annotation.editor.title')}</h1>
              <p className="text-sm text-blue-100 flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  {currentIndex + 1} / {annotations.length}
                </span>
                <span>•</span>
                <span className="font-medium">{currentAnnotation?.label}</span>
                {currentAnnotation && (
                  <>
                    <span>•</span>
                    <span>{t('annotation.editor.pageNum')} {currentAnnotation.image.replace(/.*_page_(\d+)\.png/, '$1')}</span>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 relative z-10">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/30">
            <div className="text-sm text-white font-medium">
              <span className={status.percentage === 100 ? 'text-green-200' : 'text-blue-100'}>
                {status.completed} / {status.total} {t('annotation.editor.completed')}
              </span>
              <div className="mt-1 w-32 bg-white/20 rounded-full h-1.5 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    status.percentage === 100 ? 'bg-green-300' : 'bg-blue-300'
                  }`}
                  style={{ width: `${status.percentage}%` }}
                />
              </div>
            </div>
          </div>
          <Button 
            onClick={saveAnnotations} 
            disabled={isSaving}
            className="bg-white/20 hover:bg-white/30 text-white border-white/30 backdrop-blur-sm transition-all"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('annotation.editor.saving')}
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {t('annotation.editor.save')}
              </>
            )}
          </Button>
          {status.completed > 0 && (
            <Button 
              onClick={generateOutput} 
              variant="default" 
              disabled={isSaving}
              className="bg-green-500 hover:bg-green-600 text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
              title={status.completed === 0 ? t('annotation.editor.generateTooltip') : t('annotation.editor.generateTooltip')}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('annotation.editor.generating')}
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  {t('annotation.editor.generate')}
                </>
              )}
            </Button>
          )}
          <Button 
            onClick={handleShowThumbnailGallery} 
            variant="ghost"
            size="icon"
            className="bg-white/20 hover:bg-white/30 text-white border-white/30 backdrop-blur-sm transition-all"
            title="View drawing folder images"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Button 
            onClick={() => window.open(`/projects/${projectId}`, '_blank')}
            variant="ghost"
            size="icon"
            className="bg-white/20 hover:bg-white/30 text-white border-white/30 backdrop-blur-sm transition-all"
            title="Open project page in new window"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          <LanguageSelector />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Annotation List */}
        <div className="w-64 bg-gradient-to-b from-white to-blue-50/50 border-r border-blue-200/50 overflow-y-auto shadow-inner">
          <div className="p-4 space-y-4">
            {/* Group annotations by image/page */}
            {(() => {
              const imageGroups = annotations.reduce((acc, ann, idx) => {
                const imageName = ann.image
                if (!acc[imageName]) {
                  acc[imageName] = []
                }
                acc[imageName].push({ ...ann, originalIndex: idx })
                return acc
              }, {} as Record<string, Array<Annotation & { originalIndex: number }>>)

              return Object.entries(imageGroups).map(([imageName, imageAnnotations]) => {
                const pageNum = imageName.replace(/.*_page_(\d+)\.png/, '$1')
                const allComplete = imageAnnotations.every(ann => ann.region)
                const currentImageAnnotations = annotations.filter(a => a.image === imageName)
                
                return (
                  <div key={imageName} className="space-y-2">
                    <div className={`flex items-center justify-between px-3 py-2 rounded-lg transition-all ${
                      allComplete 
                        ? 'bg-gradient-to-r from-green-100 to-emerald-100 border border-green-300 shadow-sm' 
                        : 'bg-gradient-to-r from-blue-100 to-indigo-100 border border-blue-300 shadow-sm'
                    }`}>
                      <span className="text-xs font-bold text-gray-800 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-white/60 flex items-center justify-center text-xs font-bold">
                          {pageNum}
                        </span>
                        <span>({imageAnnotations.length})</span>
                      </span>
                      <div className="flex items-center gap-2">
                        {allComplete && (
                          <CheckCircle2 className="h-4 w-4 text-green-600 animate-pulse" />
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            // Find first annotation for this page
                            const firstIndex = annotations.findIndex(a => a.image === imageName)
                            if (firstIndex >= 0) {
                              setCurrentIndex(firstIndex)
                            }
                            startAddingNewLabel()
                          }}
                          className="h-6 w-6 p-0 hover:bg-white/80 rounded-full"
                          title="Add new label"
                          disabled={isAddingNewLabel}
                        >
                          <Plus className="h-3 w-3 text-blue-600" />
                        </Button>
                      </div>
                    </div>
                    {imageAnnotations.map((ann) => {
                      const idx = ann.originalIndex
                      return (
                        <button
                          key={idx}
                          onClick={() => setCurrentIndex(idx)}
                          className={`w-full text-left p-3 rounded-xl border-2 transition-all duration-200 transform hover:scale-[1.02] ${
                            idx === currentIndex
                              ? 'border-blue-500 bg-gradient-to-r from-blue-100 to-indigo-100 shadow-lg shadow-blue-200/50 scale-[1.02]'
                              : ann.region
                              ? 'border-green-300 bg-gradient-to-r from-green-50 to-emerald-50 hover:shadow-md'
                              : 'border-gray-300 bg-white hover:border-gray-400 hover:shadow-sm'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`font-semibold text-xs ${
                              idx === currentIndex ? 'text-blue-900' : 'text-gray-800'
                            }`}>
                              {ann.label}
                            </span>
                            {ann.region ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600 animate-pulse" />
                            ) : (
                              <XCircle className="h-4 w-4 text-gray-400" />
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )
              })
            })()}
          </div>
        </div>

        {/* Center - Image Canvas */}
        <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50/50 to-indigo-50/50 overflow-hidden relative" ref={containerRef}>
          {/* Decorative pattern overlay */}
          <div className="absolute inset-0 opacity-5 pointer-events-none">
            <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="10" cy="10" r="1" fill="currentColor" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#dots)" />
            </svg>
          </div>
          {/* Navigation Bar */}
          <div className="w-full bg-gradient-to-r from-white via-blue-50/30 to-indigo-50/30 border-b border-blue-200/50 px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              {/* Page Navigation */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">{t('annotation.editor.page')}</span>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => navigatePage('prev')} 
                  disabled={getCurrentPageInfo().isFirstPage}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Select
                  value={annotations[currentIndex]?.image || ''}
                  onValueChange={navigateToPage}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue>
                      {getCurrentPageInfo().pageNumber} / {getCurrentPageInfo().totalPages}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {getPages().map((pageImageName, idx) => {
                      const pageNum = pageImageName.replace(/.*_page_(\d+)\.png/, '$1')
                      const pageAnnotations = annotations.filter(ann => ann.image === pageImageName)
                      const pageComplete = pageAnnotations.every(ann => ann.region)
                      return (
                        <SelectItem key={pageImageName} value={pageImageName}>
                          <div className="flex items-center justify-between w-full">
                            <span>{t('annotation.editor.pageNum')} {pageNum} ({pageAnnotations.length})</span>
                            {pageComplete && <CheckCircle2 className="h-3 w-3 text-green-600 ml-2" />}
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => navigatePage('next')} 
                  disabled={getCurrentPageInfo().isLastPage}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Annotation Navigation */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">{t('annotation.editor.annotation')}</span>
                <Button size="sm" variant="outline" onClick={() => navigateAnnotation('prev')} disabled={currentIndex === 0}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-gray-600 min-w-[80px] text-center">
                  {currentIndex + 1} / {annotations.length}
                </span>
                <Button size="sm" variant="outline" onClick={() => navigateAnnotation('next')} disabled={currentIndex === annotations.length - 1}>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Mode + Zoom Controls */}
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant={editMode === 'region' ? 'default' : 'outline'} 
                  onClick={() => setEditMode('region')}
                  className={`transition-all duration-200 ${
                    editMode === 'region' 
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg hover:shadow-xl' 
                      : 'hover:bg-blue-50'
                  }`}
                >
                  <Layers className="h-3 w-3 mr-1" />
                  {t('annotation.editor.region')}
                </Button>
                <Button 
                  size="sm" 
                  variant={editMode === 'bbox' ? 'default' : 'outline'} 
                  onClick={() => setEditMode('bbox')}
                  className={`transition-all duration-200 ${
                    editMode === 'bbox' 
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg hover:shadow-xl' 
                      : 'hover:bg-purple-50'
                  }`}
                >
                  <Edit3 className="h-3 w-3 mr-1" />
                  {t('annotation.editor.fai')}
                </Button>
                <Button 
                  size="sm" 
                  variant={editMode === 'pan' ? 'default' : 'outline'} 
                  onClick={() => setEditMode('pan')}
                  className={`transition-all duration-200 ${
                    editMode === 'pan' 
                      ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg hover:shadow-xl' 
                      : 'hover:bg-orange-50'
                  }`}
                >
                  <Move className="h-3 w-3 mr-1" />
                  {t('annotation.editor.pan')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setZoom(prev => prev * 1.2)}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => setZoom(prev => prev * 0.8)}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={resetZoom}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          
          {imageLoaded && (
            <div
              className="overflow-auto flex items-center justify-center relative"
              style={{ width: '100%', height: '100%' }}
              onWheel={handleWheel}
            >
              {/* Floating FAI edit overlay */}
              {editMode === 'bbox' && isBBoxSession && currentAnnotation && (
                <div className="absolute top-3 right-3 z-10 rounded-xl shadow-2xl bg-gradient-to-br from-white via-purple-50 to-pink-50 border-2 border-purple-400 p-4 w-72 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg shadow-md">
                        <Edit3 className="h-4 w-4 text-white" />
                      </div>
                      <div className="text-sm font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                        {t('annotation.editor.faiAnnotation')}
                      </div>
                    </div>
                    <div className="text-xs font-semibold text-purple-600 bg-purple-100 px-2 py-1 rounded-full">
                      #{currentIndex + 1}
                    </div>
                  </div>
                  
                  {/* Location Widget */}
                  <div className="mb-3 p-3 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg border-2 border-purple-200 shadow-sm">
                    <div className="text-xs font-bold text-purple-700 mb-2 flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-purple-600" />
                      {t('annotation.editor.location')}
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs font-mono text-gray-700">
                      <div className="flex justify-between">
                        <span className="text-gray-500">x1:</span>
                        <span className="font-medium">{currentAnnotation.bbox[0].toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">y1:</span>
                        <span className="font-medium">{currentAnnotation.bbox[1].toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">x2:</span>
                        <span className="font-medium">{currentAnnotation.bbox[2].toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">y2:</span>
                        <span className="font-medium">{currentAnnotation.bbox[3].toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between col-span-2 pt-1 border-t border-blue-300">
                        <span className="text-gray-500">{t('annotation.editor.size')}</span>
                        <span className="font-medium">
                          {(currentAnnotation.bbox[2] - currentAnnotation.bbox[0]).toFixed(1)} × {(currentAnnotation.bbox[3] - currentAnnotation.bbox[1]).toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mb-3">
                    <label className="block text-xs font-bold text-purple-700 mb-1.5">{t('annotation.editor.label')}</label>
                    <input
                      className="w-full border-2 border-purple-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white/80"
                      value={tempLabel}
                      onChange={(e) => setTempLabel(e.target.value)}
                      placeholder={t('annotation.editor.labelPlaceholder')}
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white shadow-lg hover:shadow-xl transition-all"
                      onClick={async () => {
                        // apply label and save, exit mode
                        const ann = annotations[currentIndex]
                        if (ann) {
                          const updated = [...annotations]
                          updated[currentIndex] = { ...ann, label: tempLabel || ann.label }
                          setAnnotations(updated)
                          try {
                            await saveAnnotations()
                            toast.success(t('annotation.editor.faiUpdated'))
                          } catch {}
                        }
                        setIsBBoxSession(false)
                        setBBoxSessionOriginal(null)
                        setEditMode('region')
                      }}
                    >
                      {t('annotation.editor.confirm')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 transition-all"
                      onClick={() => {
                        // revert bbox and label
                        const orig = bboxSessionOriginal
                        const ann = annotations[currentIndex]
                        if (orig && ann) {
                          const updated = [...annotations]
                          updated[currentIndex] = { ...ann, label: orig.label, bbox: [...orig.bbox] as [number, number, number, number] }
                          setAnnotations(updated)
                        }
                        setIsBBoxSession(false)
                        setBBoxSessionOriginal(null)
                        setEditMode('region')
                      }}
                    >
                      {t('annotation.editor.cancel')}
                    </Button>
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-purple-200 text-xs text-purple-600 flex items-center gap-2">
                    <Sparkles className="h-3 w-3 animate-pulse" />
                    <span>{t('annotation.editor.clickDrag')}</span>
                  </div>
                </div>
              )}

              {/* Floating Region-only Preview */}
              {showRegionPreview && (
                <div
                  className="absolute z-10 select-none"
                  style={{
                    left: `${previewPosition.x}px`,
                    top: `${previewPosition.y}px`,
                    width: `${previewSize.width}px`,
                  }}
                  onMouseDown={(e) => {
                    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('preview-header')) {
                      setIsDraggingPreview(true)
                      setDragStartPreview({
                        x: e.clientX,
                        y: e.clientY,
                        startX: previewPosition.x,
                        startY: previewPosition.y,
                      })
                    }
                  }}
                >
                  <div className="rounded-xl shadow-2xl border-2 border-blue-400 bg-gradient-to-br from-white via-blue-50 to-indigo-50 backdrop-blur-md p-3 transition-all hover:shadow-3xl">
                    <div
                      className="flex items-center justify-between mb-2 preview-header cursor-move"
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        setIsDraggingPreview(true)
                        setDragStartPreview({
                          x: e.clientX,
                          y: e.clientY,
                          startX: previewPosition.x,
                          startY: previewPosition.y,
                        })
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="p-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded shadow-sm">
                          <Layers className="h-3 w-3 text-white" />
                        </div>
                        <div className="text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                          {t('annotation.editor.regionPreview')}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 hover:bg-red-100 text-gray-600 hover:text-red-600 rounded-full transition-all"
                          onClick={() => setShowRegionPreview(false)}
                          title={t('annotation.editor.hide')}
                        >
                          ×
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-lg overflow-hidden border-2 border-blue-300 bg-gradient-to-br from-gray-900 to-black shadow-inner relative" style={{ height: `${previewSize.height - 80}px` }}>
                      <canvas
                        ref={previewCanvasRef}
                        width={previewSize.width - 16}
                        height={previewSize.height - 80}
                        className="w-full h-full"
                      />
                      {/* Resize handle */}
                      <div
                        className="absolute bottom-0 right-0 w-5 h-5 bg-gradient-to-br from-blue-400 to-indigo-500 cursor-nwse-resize rounded-tl-lg shadow-lg hover:from-blue-500 hover:to-indigo-600 transition-all"
                        style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }}
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          setIsResizingPreview(true)
                          setResizeStartPreview({
                            x: e.clientX,
                            y: e.clientY,
                            startW: previewSize.width,
                            startH: previewSize.height,
                          })
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Show preview button when hidden */}
              {!showRegionPreview && (
                <div className="absolute bottom-3 right-3 z-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => setShowRegionPreview(true)}
                    className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-xl hover:shadow-2xl transition-all backdrop-blur-sm"
                  >
                    <Layers className="h-4 w-4 mr-2" />
                    {t('annotation.editor.showRegionPreview')}
                  </Button>
                </div>
              )}

              <div
                style={{
                  transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
                  transformOrigin: 'center center',
                }}
              >
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  className="border-2 border-gray-300 shadow-2xl rounded-lg cursor-crosshair transition-all"
                  style={{
                    maxWidth: '100%',
                    maxHeight: 'calc(100vh - 200px)',
                    cursor: canvasCursor
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar - Edit Controls */}
        <div className="w-72 bg-gradient-to-b from-white to-indigo-50/30 border-l border-indigo-200/50 p-4 overflow-y-auto shadow-inner">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg shadow-md">
              <Edit3 className="h-4 w-4 text-white" />
            </div>
            <h3 className="font-bold text-gray-800">{t('annotation.editor.editAnnotation')}</h3>
          </div>
          {currentAnnotation && (
            <div className="space-y-3 text-sm">
              {/* Live values */}
              {(() => {
                const [bx1, by1, bx2, by2] = currentAnnotation.bbox
                const bw = Math.max(0, bx2 - bx1)
                const bh = Math.max(0, by2 - by1)
                const reg = currentRegion
                  ? currentRegion
                  : currentAnnotation.region
                  ? { x: currentAnnotation.region[0], y: currentAnnotation.region[1], width: currentAnnotation.region[2], height: currentAnnotation.region[3] }
                  : null
                return (
                  <div className="rounded-lg border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50 p-3 shadow-sm">
                    <div className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-blue-600 animate-pulse" />
                      {t('annotation.editor.liveParameters')}
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs font-mono">
                      <div className="text-gray-500">{t('annotation.editor.faiX1')}</div><div>{bx1.toFixed(1)}</div>
                      <div className="text-gray-500">{t('annotation.editor.faiY1')}</div><div>{by1.toFixed(1)}</div>
                      <div className="text-gray-500">{t('annotation.editor.faiX2')}</div><div>{bx2.toFixed(1)}</div>
                      <div className="text-gray-500">{t('annotation.editor.faiY2')}</div><div>{by2.toFixed(1)}</div>
                      <div className="text-gray-500">{t('annotation.editor.faiW')}</div><div>{bw.toFixed(1)}</div>
                      <div className="text-gray-500">{t('annotation.editor.faiH')}</div><div>{bh.toFixed(1)}</div>
                      <div className="col-span-2 h-px bg-gray-200 my-1" />
                      <div className="text-gray-500">{t('annotation.editor.regionX')}</div><div>{reg ? reg.x.toFixed(3) : '-'}</div>
                      <div className="text-gray-500">{t('annotation.editor.regionY')}</div><div>{reg ? reg.y.toFixed(3) : '-'}</div>
                      <div className="text-gray-500">{t('annotation.editor.regionW')}</div><div>{reg ? reg.width.toFixed(3) : '-'}</div>
                      <div className="text-gray-500">{t('annotation.editor.regionH')}</div><div>{reg ? reg.height.toFixed(3) : '-'}</div>
                    </div>
                  </div>
                )
              })()}
              <div>
                <label className="block text-gray-600 mb-1">{t('annotation.editor.label')}</label>
                <input
                  className="w-full border rounded px-2 py-1"
                  value={currentAnnotation.label}
                  onChange={(e) => {
                    const updated = [...annotations]
                    updated[currentIndex] = { ...currentAnnotation, label: e.target.value }
                    setAnnotations(updated)
                  }}
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">{t('annotation.editor.boundingBox')}</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['0','1','2','3'] as const).map((key, idx) => (
                    <input
                      key={idx}
                      type="number"
                      className="border rounded px-2 py-1"
                      value={currentAnnotation.bbox[idx]}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        const updated = [...annotations]
                        const bbox = [...currentAnnotation.bbox] as [number, number, number, number]
                        bbox[idx] = isNaN(v) ? bbox[idx] : v
                        updated[currentIndex] = { ...currentAnnotation, bbox }
                        setAnnotations(updated)
                        drawAnnotations()
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={saveAnnotations} disabled={isSaving}>
                  {t('annotation.editor.saveChanges')}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={async () => {
                    const toDelete = currentAnnotation
                    const originalAnnotations = [...annotations]
                    const updated = annotations.filter((_, idx) => idx !== currentIndex)
                    
                    // Adjust currentIndex if needed
                    if (currentIndex >= updated.length && updated.length > 0) {
                      setCurrentIndex(updated.length - 1)
                    } else if (updated.length === 0) {
                      // No annotations left, but keep currentIndex at 0
                      setCurrentIndex(0)
                    }
                    
                    // Optimistically update UI
                    setAnnotations(updated)
                    
                    // Save to backend
                    try {
                      await projectApi.updateDrawingAnnotations(projectId, folderId, updated)
                      toast.success(`${t('annotation.editor.deleted')} ${toDelete.label}`)
                    } catch (error: any) {
                      console.error('Failed to save deletion:', error)
                      toast.error(error.message || t('annotation.editor.saveFailed'))
                      // Revert on error
                      setAnnotations(originalAnnotations)
                    }
                  }}
                >
                  {t('annotation.editor.delete')}
                </Button>
              </div>

              <hr className="my-3" />
              <h4 className="font-medium">{t('annotation.editor.instructions')}</h4>
              <ul className="list-disc ml-5 text-gray-600 space-y-1">
                <li>{t('annotation.editor.instruction1')}</li>
                <li>{t('annotation.editor.instruction2')}</li>
                <li>{t('annotation.editor.instruction3')}</li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* New Label Dialog */}
      <Dialog open={showNewLabelDialog} onOpenChange={setShowNewLabelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('annotation.editor.addNewLabel')}</DialogTitle>
            <DialogDescription>
              {t('annotation.editor.addNewLabelDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">{t('annotation.editor.labelName')}</label>
              <Input
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                placeholder={t('annotation.editor.labelNamePlaceholder')}
                className="mt-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    saveNewLabel()
                  } else if (e.key === 'Escape') {
                    setShowNewLabelDialog(false)
                    cancelAddingNewLabel()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewLabelDialog(false)
                cancelAddingNewLabel()
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={saveNewLabel}
              disabled={!newLabelName.trim()}
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add New Label Mode Indicator */}
      {isAddingNewLabel && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-orange-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-pulse">
          <Plus className="h-4 w-4" />
          <span className="font-medium">{t('annotation.editor.addNewLabelMode')}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={cancelAddingNewLabel}
            className="text-white hover:bg-white/20 h-6 px-2"
          >
            {t('common.cancel')}
          </Button>
        </div>
      )}

      {/* Thumbnail Gallery Dialog */}
      <Dialog open={showThumbnailGallery} onOpenChange={setShowThumbnailGallery}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Drawing Folder Images
            </DialogTitle>
            <DialogDescription>
              {folderDescription || 'Images generated in this drawing folder'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto">
            {isLoadingImages ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : drawingImages.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <ImageIcon className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p>{t('annotation.editor.noImagesFound') || 'No images found in this drawing folder'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-4">
                {drawingImages.map((image) => {
                  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4700'
                  const imageUrl = image.url.startsWith('http') ? image.url : `${backendUrl}${image.url}`
                  
                  return (
                    <div
                      key={image.id}
                      className="group relative flex flex-col rounded-lg overflow-hidden border-2 border-gray-200 hover:border-blue-500 transition-all cursor-pointer bg-gray-50"
                      onClick={() => window.open(imageUrl, '_blank')}
                    >
                      <div className="aspect-square relative overflow-hidden">
                        <img
                          src={imageUrl}
                          alt={image.filename}
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                          loading="lazy"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            target.style.display = 'none'
                            const parent = target.parentElement
                            if (parent && !parent.querySelector('.error-fallback')) {
                              const errorDiv = document.createElement('div')
                              errorDiv.className = 'error-fallback flex flex-col items-center justify-center h-full text-gray-400'
                              errorDiv.innerHTML = `
                                <svg class="h-8 w-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span class="text-xs text-center px-2">Failed to load</span>
                              `
                              parent.appendChild(errorDiv)
                            }
                          }}
                        />
                      </div>
                      <div className="p-2 bg-white border-t border-gray-200">
                        <p className="text-xs font-medium text-gray-700 truncate" title={image.filename}>
                          {image.filename}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowThumbnailGallery(false)}>
              {t('common.close') || 'Close'}
            </Button>
            {drawingImages.length > 0 && (
              <Button
                onClick={() => {
                  loadDrawingImages()
                }}
                variant="outline"
                disabled={isLoadingImages}
              >
                {isLoadingImages ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('common.loading') || 'Loading...'}
                  </>
                ) : (
                  <>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {t('common.refresh') || 'Refresh'}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


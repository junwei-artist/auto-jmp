'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Eye, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, Download, X, MessageCircle } from 'lucide-react'

interface Artifact {
  id: string
  project_id: string
  run_id?: string
  kind: 'input_csv' | 'input_jsl' | 'output_png' | 'results_zip' | 'log' | 'output_image'
  storage_key: string
  filename: string
  size_bytes?: number
  mime_type?: string
  created_at: string
}

interface PublicImageGalleryProps {
  artifacts: Artifact[]
  projectId: string
  backendUrl: string
}

interface ArtifactCommentCount {
  artifact_id: string
  comment_count: number
}

export function PublicImageGallery({ artifacts, projectId, backendUrl }: PublicImageGalleryProps) {
  const imageArtifacts = artifacts.filter(a => 
    (a.kind === 'output_image' || a.kind === 'output_png') && a.mime_type?.startsWith('image/')
  )

  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)
  const [zoomLevel, setZoomLevel] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [commentCounts, setCommentCounts] = useState<ArtifactCommentCount[]>([])

  // Fetch comment counts for all image artifacts
  useEffect(() => {
    const fetchCommentCounts = async () => {
      if (imageArtifacts.length === 0) return
      
      try {
        const response = await fetch(`${backendUrl}/api/v1/artifacts/public/comment-counts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(imageArtifacts.map(a => a.id)),
        })
        
        if (response.ok) {
          const data = await response.json()
          setCommentCounts(data)
        }
      } catch (error) {
        console.error('Failed to fetch comment counts:', error)
      }
    }

    fetchCommentCounts()
  }, [imageArtifacts, backendUrl])

  // Helper function to get comment count for an artifact
  const getCommentCount = (artifactId: string): number => {
    const count = commentCounts.find(cc => cc.artifact_id === artifactId)
    return count?.comment_count || 0
  }

  if (imageArtifacts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Eye className="h-12 w-12 mx-auto mb-4 text-gray-300" />
        <p>No images available</p>
      </div>
    )
  }

  const openImageViewer = (index: number) => {
    setSelectedImageIndex(index)
    setZoomLevel(100)
    setRotation(0)
  }

  const closeImageViewer = () => {
    setSelectedImageIndex(null)
    setZoomLevel(100)
    setRotation(0)
  }

  const goToPrevious = () => {
    if (selectedImageIndex !== null) {
      setSelectedImageIndex(selectedImageIndex > 0 ? selectedImageIndex - 1 : imageArtifacts.length - 1)
      setZoomLevel(100)
      setRotation(0)
    }
  }

  const goToNext = () => {
    if (selectedImageIndex !== null) {
      setSelectedImageIndex(selectedImageIndex < imageArtifacts.length - 1 ? selectedImageIndex + 1 : 0)
      setZoomLevel(100)
      setRotation(0)
    }
  }

  const zoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 25, 300))
  }

  const zoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 25, 50))
  }

  const resetZoom = () => {
    setZoomLevel(100)
    setRotation(0)
  }

  const rotateImage = () => {
    setRotation(prev => (prev + 90) % 360)
  }

  const downloadImage = () => {
    if (selectedImageIndex !== null) {
      const artifact = imageArtifacts[selectedImageIndex]
      const downloadUrl = `${backendUrl}/api/v1/projects/public/${projectId}/artifacts/${artifact.id}/download`
      window.open(downloadUrl, '_blank')
    }
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (selectedImageIndex === null) return
    
    switch (e.key) {
      case 'Escape':
        closeImageViewer()
        break
      case 'ArrowLeft':
        goToPrevious()
        break
      case 'ArrowRight':
        goToNext()
        break
      case '+':
      case '=':
        zoomIn()
        break
      case '-':
        zoomOut()
        break
      case 'r':
        rotateImage()
        break
      case '0':
        resetZoom()
        break
    }
  }

  return (
    <>
      {/* Gallery Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Image Gallery</h3>
          <p className="text-sm text-gray-600">{imageArtifacts.length} image{imageArtifacts.length !== 1 ? 's' : ''} available</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openImageViewer(0)}
            className="flex items-center space-x-1"
          >
            <Eye className="h-4 w-4" />
            <span>View All</span>
          </Button>
        </div>
      </div>

      {/* Thumbnail Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {imageArtifacts.map((artifact, index) => (
          <div key={artifact.id} className="relative group">
            <div className="relative overflow-hidden rounded-lg border-2 border-gray-200 group-hover:border-blue-400 transition-all duration-300 shadow-sm group-hover:shadow-lg">
              <img
                src={`${backendUrl}/api/v1/projects/public/${projectId}/artifacts/${artifact.id}/download`}
                alt={artifact.filename}
                className="w-full h-40 object-cover cursor-pointer transform group-hover:scale-105 transition-transform duration-300"
                onClick={() => openImageViewer(index)}
                loading="lazy"
              />
              
              {/* Hover Overlay */}
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-300 rounded-lg flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center space-x-2">
                  <Eye className="h-6 w-6 text-white" />
                  <span className="text-white text-sm font-medium">Click to view</span>
                </div>
              </div>
              
              {/* Image Number Badge */}
              <div className="absolute top-2 left-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded-full">
                {index + 1}
              </div>
              
              {/* Comment count badge */}
              {getCommentCount(artifact.id) > 0 && (
                <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full flex items-center space-x-1">
                  <MessageCircle className="h-3 w-3" />
                  <span>{getCommentCount(artifact.id)}</span>
                </div>
              )}
              
              {/* Navigation Arrows (on hover) */}
              {index > 0 && (
                <div className="absolute left-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 bg-black bg-opacity-50 hover:bg-opacity-70 text-white"
                    onClick={(e) => {
                      e.stopPropagation()
                      openImageViewer(index - 1)
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
              )}
              
              {index < imageArtifacts.length - 1 && (
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 bg-black bg-opacity-50 hover:bg-opacity-70 text-white"
                    onClick={(e) => {
                      e.stopPropagation()
                      openImageViewer(index + 1)
                    }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            
            {/* Filename */}
            <div className="mt-2 px-1">
              <div className="text-xs text-gray-600 truncate" title={artifact.filename}>
                {artifact.filename}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Full Screen Image Viewer */}
      {selectedImageIndex !== null && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50"
          onKeyDown={handleKeyDown}
          tabIndex={0}
          onClick={closeImageViewer}
        >
          {/* Close Button */}
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-4 right-4 text-white hover:bg-white hover:bg-opacity-20 z-10"
            onClick={closeImageViewer}
          >
            <X className="h-6 w-6" />
          </Button>

          {/* Navigation Controls */}
          <div className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10">
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white hover:bg-opacity-20 h-12 w-12 rounded-full"
              onClick={(e) => {
                e.stopPropagation()
                goToPrevious()
              }}
            >
              <ChevronLeft className="h-8 w-8" />
            </Button>
          </div>

          <div className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10">
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white hover:bg-opacity-20 h-12 w-12 rounded-full"
              onClick={(e) => {
                e.stopPropagation()
                goToNext()
              }}
            >
              <ChevronRight className="h-8 w-8" />
            </Button>
          </div>

          {/* Image Container */}
          <div 
            className="flex items-center justify-center max-w-[90vw] max-h-[90vh] cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={`${backendUrl}/api/v1/projects/public/${projectId}/artifacts/${imageArtifacts[selectedImageIndex].id}/download`}
              alt={imageArtifacts[selectedImageIndex].filename}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              style={{
                transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                transition: 'transform 0.2s ease-in-out'
              }}
              onClick={() => {
                // Double-click to reset zoom
                resetZoom()
              }}
            />
          </div>

          {/* Enhanced Bottom Controls */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-3 bg-black bg-opacity-70 rounded-xl p-3 backdrop-blur-sm">
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white hover:bg-opacity-20 h-10 w-10 rounded-full"
              onClick={(e) => {
                e.stopPropagation()
                zoomOut()
              }}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            
            <div className="flex items-center space-x-2">
              <span className="text-white text-sm font-medium">{zoomLevel}%</span>
              <div className="w-16 h-1 bg-gray-600 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-white transition-all duration-200"
                  style={{ width: `${((zoomLevel - 50) / 250) * 100}%` }}
                />
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white hover:bg-opacity-20 h-10 w-10 rounded-full"
              onClick={(e) => {
                e.stopPropagation()
                zoomIn()
              }}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            
            <div className="w-px h-6 bg-white bg-opacity-30" />
            
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white hover:bg-opacity-20 h-10 w-10 rounded-full"
              onClick={(e) => {
                e.stopPropagation()
                rotateImage()
              }}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white hover:bg-opacity-20 px-3 py-2 rounded-lg"
              onClick={(e) => {
                e.stopPropagation()
                resetZoom()
              }}
            >
              Reset
            </Button>
            
            <div className="w-px h-6 bg-white bg-opacity-30" />
            
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white hover:bg-opacity-20 h-10 w-10 rounded-full"
              onClick={(e) => {
                e.stopPropagation()
                downloadImage()
              }}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>

          {/* Enhanced Image Counter */}
          <div className="absolute top-4 left-4 text-white text-sm bg-black bg-opacity-70 rounded-lg px-4 py-2 backdrop-blur-sm">
            <div className="font-medium">{selectedImageIndex + 1} of {imageArtifacts.length}</div>
            <div className="text-xs text-gray-300">Use arrow keys to navigate</div>
          </div>

          {/* Enhanced Image Info */}
          <div className="absolute bottom-4 left-4 text-white text-sm bg-black bg-opacity-70 rounded-lg px-4 py-2 backdrop-blur-sm max-w-xs">
            <div className="font-medium truncate">{imageArtifacts[selectedImageIndex].filename}</div>
            <div className="text-xs text-gray-300 mt-1">
              Double-click image to reset zoom • ESC to close
            </div>
          </div>

          {/* Thumbnail Strip */}
          <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 max-w-[80vw] overflow-x-auto">
            <div className="flex space-x-2 bg-black bg-opacity-50 rounded-lg p-2 backdrop-blur-sm">
              {imageArtifacts.map((artifact, index) => (
                <img
                  key={artifact.id}
                  src={`${backendUrl}/api/v1/projects/public/${projectId}/artifacts/${artifact.id}/download`}
                  alt={artifact.filename}
                  className={`w-16 h-12 object-cover rounded cursor-pointer transition-all duration-200 ${
                    index === selectedImageIndex 
                      ? 'ring-2 ring-white opacity-100' 
                      : 'opacity-60 hover:opacity-80'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    openImageViewer(index)
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

interface ViewImagesButtonProps {
  runId: string
  projectId: string
  backendUrl: string
  artifacts: Artifact[]
}

export function ViewImagesButton({ runId, projectId, backendUrl, artifacts }: ViewImagesButtonProps) {
  const imageArtifacts = artifacts.filter(a => 
    a.run_id === runId && 
    (a.kind === 'output_image' || a.kind === 'output_png') && a.mime_type?.startsWith('image/')
  )

  if (imageArtifacts.length === 0) {
    return null
  }

  return (
    <Button 
      variant="outline" 
      size="sm"
      onClick={() => {
        const firstImageUrl = `${backendUrl}/api/v1/projects/public/${projectId}/artifacts/${imageArtifacts[0].id}/download`
        window.open(firstImageUrl, '_blank')
      }}
    >
      <Eye className="h-4 w-4" />
    </Button>
  )
}

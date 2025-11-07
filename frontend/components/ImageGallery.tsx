'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Download, Eye, RefreshCw, X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, MessageCircle, Maximize2, Minimize2, RotateCw, RotateCcw, MessageSquare, Search } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import ArtifactComments from './ArtifactComments'

interface Artifact {
  id: string
  kind: string
  filename: string
  size_bytes?: number
  mime_type?: string
  created_at: string
  download_url?: string
}

interface Run {
  id: string
  project_id: string
  status: string
  task_name: string
  message?: string
  image_count: number
  created_at: string
  started_at?: string
  finished_at?: string
}

interface ArtifactCommentCount {
  artifact_id: string
  comment_count: number
}

interface ImageGalleryProps {
  runId: string
  projectId: string
  run: Run
  onClose: () => void
}

export function ImageGallery({ runId, projectId, run, onClose }: ImageGalleryProps) {
  const { user } = useAuth()
  
  // Helper function to get auth token
  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('access_token')
    }
    return null
  }
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showComments, setShowComments] = useState(true)
  const [rotation, setRotation] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')

  // Fetch artifacts with auto-refresh
  const { data: artifacts, isLoading, error, refetch } = useQuery({
    queryKey: ['run-artifacts', runId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/runs/${runId}/artifacts`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json',
        },
      })
      if (!response.ok) {
        throw new Error('Failed to fetch artifacts')
      }
      return response.json() as Promise<Artifact[]>
    },
    refetchInterval: run.status === 'running' ? 2000 : false, // Refresh every 2 seconds if running
    refetchIntervalInBackground: true,
  })

  // Filter image artifacts and convert relative URLs to absolute
  const allImageArtifacts = artifacts?.filter(artifact => 
    artifact.kind === 'output_image' && artifact.mime_type?.startsWith('image/')
  ).map(artifact => ({
    ...artifact,
    download_url: artifact.download_url?.startsWith('/api') 
      ? artifact.download_url
      : artifact.download_url?.startsWith('/') 
        ? `/api${artifact.download_url}`
        : artifact.download_url
  })) || []

  // Filter by search query
  const imageArtifacts = allImageArtifacts.filter(artifact =>
    artifact.filename.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Fetch ZIP download URL
  const { data: zipData } = useQuery({
    queryKey: ['run-zip', runId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/runs/${runId}/download-zip`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json',
        },
      })
      if (!response.ok) {
        throw new Error('Failed to fetch ZIP download URL')
      }
      return response.json()
    },
    enabled: run.status === 'succeeded',
  })

  // Fetch comment counts for all image artifacts
  const { data: commentCounts } = useQuery({
    queryKey: ['artifact-comment-counts', imageArtifacts.map(a => a.id)],
    queryFn: async () => {
      if (imageArtifacts.length === 0) return []
      
      const response = await fetch('/api/v1/artifacts/comment-counts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(imageArtifacts.map(a => a.id)),
      })
      if (!response.ok) {
        throw new Error('Failed to fetch comment counts')
      }
      return response.json() as Promise<ArtifactCommentCount[]>
    },
    enabled: imageArtifacts.length > 0,
  })

  // Helper function to get comment count for an artifact
  const getCommentCount = (artifactId: string): number => {
    const count = commentCounts?.find(cc => cc.artifact_id === artifactId)
    return count?.comment_count || 0
  }

  // Handle image download
  const handleImageDownload = useCallback(async (artifact: Artifact) => {
    if (!artifact.download_url) return
    
    try {
      const response = await fetch(artifact.download_url, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
      })
      
      if (!response.ok) throw new Error('Download failed')
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = artifact.filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Download error:', error)
    }
  }, [user])

  // Handle ZIP download
  const handleZipDownload = useCallback(async () => {
    if (!zipData?.zip_download_url) return
    
    setIsDownloading(true)
    try {
      const zipUrl = zipData.zip_download_url.startsWith('/api') 
        ? zipData.zip_download_url
        : zipData.zip_download_url.startsWith('/') 
          ? `/api${zipData.zip_download_url}`
          : zipData.zip_download_url
      const response = await fetch(zipUrl, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
      })
      
      if (!response.ok) throw new Error('ZIP download failed')
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = zipData.filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('ZIP download error:', error)
    } finally {
      setIsDownloading(false)
    }
  }, [zipData, user])

  // Handle lightbox navigation
  const handlePreviousImage = () => {
    setSelectedImageIndex(prev => 
      prev > 0 ? prev - 1 : imageArtifacts.length - 1
    )
  }

  const handleNextImage = () => {
    setSelectedImageIndex(prev => 
      prev < imageArtifacts.length - 1 ? prev + 1 : 0
    )
  }

  // Handle image selection from grid - find index in filtered array
  const handleImageClick = (artifact: Artifact) => {
    const index = imageArtifacts.findIndex(a => a.id === artifact.id)
    if (index !== -1) {
      setSelectedImageIndex(index)
      setIsLightboxOpen(true)
    }
  }

  // Handle fullscreen toggle
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
  }

  // Handle rotation
  const rotateImage = (direction: 'left' | 'right') => {
    setRotation(prev => {
      const rotationStep = direction === 'left' ? -90 : 90
      return (prev + rotationStep) % 360
    })
  }

  // Reset zoom and rotation when changing images
  useEffect(() => {
    setZoomLevel(1)
    setRotation(0)
  }, [selectedImageIndex])

  // Reset selected index when search query changes or filtered list changes
  useEffect(() => {
    if (imageArtifacts.length > 0) {
      // Reset to first image if current selection is out of bounds
      setSelectedImageIndex(prev => prev >= imageArtifacts.length ? 0 : prev)
    } else {
      // Reset to 0 if no images match search
      setSelectedImageIndex(0)
    }
  }, [searchQuery, imageArtifacts.length])

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isLightboxOpen) return
      
      switch (e.key) {
        case 'ArrowLeft':
          handlePreviousImage()
          break
        case 'ArrowRight':
          handleNextImage()
          break
        case 'Escape':
          if (isFullscreen) {
            setIsFullscreen(false)
          } else {
            setIsLightboxOpen(false)
          }
          break
        case '+':
        case '=':
          setZoomLevel(prev => Math.min(prev + 0.2, 3))
          break
        case '-':
          setZoomLevel(prev => Math.max(prev - 0.2, 0.5))
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case 'r':
        case 'R':
          rotateImage('right')
          break
        case 'l':
        case 'L':
          rotateImage('left')
          break
        case 'c':
        case 'C':
          setShowComments(prev => !prev)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLightboxOpen, isFullscreen])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'succeeded': return 'success'
      case 'failed': return 'destructive'
      case 'running': return 'info'
      case 'queued': return 'warning'
      default: return 'default'
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin mr-2" />
        Loading images...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8 text-red-500">
        Error loading images. Please try again.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-bold">Image Gallery</h2>
          <Badge variant={getStatusColor(run.status)}>
            {run.status}
          </Badge>
          {run.status === 'running' && (
            <Badge variant="info">
              <RefreshCw className="h-3 w-3 animate-spin mr-1" />
              Processing...
            </Badge>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {run.status === 'succeeded' && zipData && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleZipDownload}
              disabled={isDownloading}
            >
              <Download className="h-4 w-4 mr-2" />
              {isDownloading ? 'Downloading...' : 'Download ZIP'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Status Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Run Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="font-medium">Status:</span>
              <div className="mt-1">
                <Badge variant={getStatusColor(run.status)}>
                  {run.status}
                </Badge>
              </div>
            </div>
            <div>
              <span className="font-medium">Images Generated:</span>
              <div className="mt-1">{imageArtifacts.length}</div>
            </div>
            <div>
              <span className="font-medium">Created:</span>
              <div className="mt-1">
                {new Date(run.created_at).toLocaleString()}
              </div>
            </div>
            {run.finished_at && (
              <div>
                <span className="font-medium">Finished:</span>
                <div className="mt-1">
                  {new Date(run.finished_at).toLocaleString()}
                </div>
              </div>
            )}
          </div>
          {run.message && (
            <div className="mt-4">
              <span className="font-medium">Message:</span>
              <div className="mt-1 text-sm text-gray-600">{run.message}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search images by filename..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {searchQuery && (
            <div className="mt-2 text-sm text-gray-600">
              Showing {imageArtifacts.length} of {allImageArtifacts.length} image{allImageArtifacts.length !== 1 ? 's' : ''}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Images Grid */}
      {imageArtifacts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {imageArtifacts.map((artifact, index) => (
            <Card key={artifact.id} className="overflow-hidden">
              <div className="aspect-video bg-gray-100 relative group">
                <img
                  src={artifact.download_url}
                  alt={artifact.filename}
                  className="w-full h-full object-contain cursor-pointer"
                  onClick={() => handleImageClick(artifact)}
                />
                
                {/* Comment count badge */}
                {getCommentCount(artifact.id) > 0 && (
                  <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full flex items-center space-x-1">
                    <MessageCircle className="h-3 w-3" />
                    <span>{getCommentCount(artifact.id)}</span>
                  </div>
                )}
                
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleImageClick(artifact)
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleImageDownload(artifact)
                      }}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <CardContent className="p-3">
                <div className="text-sm font-medium truncate">{artifact.filename}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            {run.status === 'running' ? (
              <div className="space-y-2">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-blue-500" />
                <div>Images are being generated...</div>
                <div className="text-sm text-gray-500">
                  This page will automatically refresh when images are ready.
                </div>
              </div>
            ) : searchQuery ? (
              <div className="space-y-2">
                <div>No images found matching "{searchQuery}".</div>
                <div className="text-sm text-gray-500">
                  Try adjusting your search query.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div>No images found for this run.</div>
                <div className="text-sm text-gray-500">
                  {run.status === 'failed' ? 'The analysis failed to generate images.' : 'Images may still be processing.'}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lightbox Modal */}
      <Dialog open={isLightboxOpen} onOpenChange={setIsLightboxOpen}>
        <DialogContent className={`${isFullscreen ? 'max-w-none max-h-none w-screen h-screen' : 'max-w-7xl max-h-[90vh]'} p-0`}>
          <DialogHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <DialogTitle>
                {imageArtifacts[selectedImageIndex]?.filename}
              </DialogTitle>
              <div className="flex items-center space-x-2">
                {/* Rotation Controls */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => rotateImage('left')}
                  title="Rotate Left (L)"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => rotateImage('right')}
                  title="Rotate Right (R)"
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
                
                {/* Zoom Controls */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setZoomLevel(prev => Math.max(prev - 0.2, 0.5))}
                  title="Zoom Out (-)"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm">{Math.round(zoomLevel * 100)}%</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setZoomLevel(prev => Math.min(prev + 0.2, 3))}
                  title="Zoom In (+)"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                
                {/* Fullscreen Toggle */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleFullscreen}
                  title={`${isFullscreen ? 'Exit Fullscreen (F)' : 'Enter Fullscreen (F)'}`}
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
                
                {/* Comments Toggle */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowComments(prev => !prev)}
                  title={`${showComments ? 'Hide Comments (C)' : 'Show Comments (C)'}`}
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>
                
                {/* Download */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleImageDownload(imageArtifacts[selectedImageIndex])}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className={`flex flex-1 p-6 pt-0 ${isFullscreen ? 'h-[calc(100vh-120px)]' : ''}`}>
            {/* Image Section */}
            <div className={`flex-1 ${showComments && !isFullscreen ? 'mr-6' : ''}`}>
              <div className={`relative w-full ${isFullscreen ? 'h-full' : 'h-[60vh]'} flex items-center justify-center bg-black rounded-lg overflow-hidden`}>
                <img
                  src={imageArtifacts[selectedImageIndex]?.download_url}
                  alt={imageArtifacts[selectedImageIndex]?.filename}
                  className="max-w-full max-h-full object-contain transition-all duration-200"
                  style={{ 
                    transform: `scale(${zoomLevel}) rotate(${rotation}deg)` 
                  }}
                />
                
                {/* Navigation buttons */}
                {imageArtifacts.length > 1 && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="absolute left-4 top-1/2 -translate-y-1/2"
                      onClick={handlePreviousImage}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="absolute right-4 top-1/2 -translate-y-1/2"
                      onClick={handleNextImage}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </>
                )}
                
                {/* Image info overlay */}
                <div className="absolute bottom-4 left-4 bg-black bg-opacity-70 text-white text-sm px-3 py-2 rounded-lg">
                  {selectedImageIndex + 1} of {imageArtifacts.length}
                  {rotation !== 0 && ` • ${rotation}°`}
                </div>
              </div>
            </div>
            
            {/* Comments Section */}
            {showComments && !isFullscreen && (
              <div className="w-96 max-h-[60vh] overflow-y-auto">
                <ArtifactComments 
                  artifactId={imageArtifacts[selectedImageIndex]?.id || ''} 
                  currentUserRole="member" // You might want to pass the actual role from props
                />
              </div>
            )}
            
            {/* Fullscreen Comments Overlay */}
            {showComments && isFullscreen && (
              <div className="absolute top-20 right-4 w-96 max-h-[calc(100vh-140px)] overflow-y-auto bg-white/20 backdrop-blur-md rounded-xl shadow-2xl border border-white/30">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white drop-shadow-lg">Comments</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowComments(false)}
                      className="text-white hover:bg-white/20"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                    <ArtifactComments 
                      artifactId={imageArtifacts[selectedImageIndex]?.id || ''} 
                      currentUserRole="member"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

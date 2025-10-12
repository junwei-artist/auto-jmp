'use client'

import { Button } from '@/components/ui/button'
import { Eye } from 'lucide-react'

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

export function PublicImageGallery({ artifacts, projectId, backendUrl }: PublicImageGalleryProps) {
  const imageArtifacts = artifacts.filter(a => 
    a.kind === 'output_image' || a.kind === 'output_png'
  )

  if (imageArtifacts.length === 0) {
    return null
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {imageArtifacts.slice(0, 4).map((artifact) => (
        <div key={artifact.id} className="relative">
          <img
            src={`${backendUrl}/api/v1/projects/public/${projectId}/artifacts/${artifact.id}/download`}
            alt={artifact.filename}
            className="w-full h-24 object-cover rounded border cursor-pointer hover:opacity-80"
            onClick={() => {
              window.open(`${backendUrl}/api/v1/projects/public/${projectId}/artifacts/${artifact.id}/download`, '_blank')
            }}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 rounded-b">
            {artifact.filename}
          </div>
        </div>
      ))}
    </div>
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
    (a.kind === 'output_image' || a.kind === 'output_png')
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

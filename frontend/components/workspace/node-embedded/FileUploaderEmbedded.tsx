'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Settings, Play, File, Upload } from 'lucide-react'
import FileUploaderWizard from './FileUploaderWizard'

interface FileUploaderEmbeddedProps {
  node: {
    id: string
    module_type: string
    config: any
    state: any
  }
  workspaceId?: string
  workflowId: string
  hasInputSource: boolean
  onConfigUpdate?: (config: any) => void
  onProcess?: () => void
}

export default function FileUploaderEmbedded({ 
  node, 
  workspaceId, 
  workflowId, 
  hasInputSource,
  onConfigUpdate,
  onProcess
}: FileUploaderEmbeddedProps) {
  const [wizardOpen, setWizardOpen] = useState(false)
  const hasFile = !!node.config?.file_key

  return (
    <>
      <div className="flex items-center justify-center h-full">
        <Button
          size="sm"
          onClick={() => setWizardOpen(true)}
          className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white h-6 w-6 p-0 flex items-center justify-center"
          title={hasFile ? 'Configure' : 'Setup'}
        >
          {hasFile ? (
            <File className="h-3 w-3" />
          ) : hasInputSource ? (
            <Play className="h-3 w-3" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
        </Button>
      </div>

      <FileUploaderWizard
        node={node}
        workspaceId={workspaceId}
        workflowId={workflowId}
        hasInputSource={hasInputSource}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onConfigUpdate={onConfigUpdate}
        onProcess={onProcess}
      />
    </>
  )
}


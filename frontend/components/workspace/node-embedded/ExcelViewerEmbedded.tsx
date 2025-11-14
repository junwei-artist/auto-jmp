'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FileSpreadsheet } from 'lucide-react'
import ExcelViewerWizard from './ExcelViewerWizard'

interface ExcelViewerEmbeddedProps {
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

export default function ExcelViewerEmbedded({
  node,
  workspaceId,
  workflowId,
  hasInputSource,
  onConfigUpdate,
  onProcess
}: ExcelViewerEmbeddedProps) {
  const [showWizard, setShowWizard] = useState(false)

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowWizard(true)}
        className="flex items-center gap-2"
      >
        <FileSpreadsheet className="h-4 w-4" />
        {hasInputSource ? 'View Excel' : 'Upload & View Excel'}
      </Button>
      
      {showWizard && (
        <ExcelViewerWizard
          node={node}
          workspaceId={workspaceId}
          workflowId={workflowId}
          hasInputSource={hasInputSource}
          open={showWizard}
          onOpenChange={setShowWizard}
          onConfigUpdate={onConfigUpdate}
          onProcess={onProcess}
        />
      )}
    </>
  )
}


'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Settings, Play, FileSpreadsheet } from 'lucide-react'
import ExcelToNumericWizard from './ExcelToNumericWizard'

interface ExcelToNumericEmbeddedProps {
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

export default function ExcelToNumericEmbedded({ 
  node, 
  workspaceId, 
  workflowId, 
  hasInputSource,
  onConfigUpdate,
  onProcess
}: ExcelToNumericEmbeddedProps) {
  const [wizardOpen, setWizardOpen] = useState(false)
  const hasFile = !!node.config?.file_key

  return (
    <>
      <div className="flex items-center justify-center h-full">
        <Button
          size="sm"
          onClick={() => setWizardOpen(true)}
          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white h-6 w-6 p-0 flex items-center justify-center"
          title={hasFile ? 'Configure' : 'Setup'}
        >
          {hasFile ? (
            <FileSpreadsheet className="h-3 w-3" />
          ) : hasInputSource ? (
            <Play className="h-3 w-3" />
          ) : (
            <Settings className="h-3 w-3" />
          )}
        </Button>
      </div>

      <ExcelToNumericWizard
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


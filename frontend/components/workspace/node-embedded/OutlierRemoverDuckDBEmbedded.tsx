'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Database } from 'lucide-react'
import OutlierRemoverDuckDBGUI from './OutlierRemoverDuckDBGUI'
import { Dialog, DialogContent } from '@/components/ui/dialog'

interface OutlierRemoverDuckDBEmbeddedProps {
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

export default function OutlierRemoverDuckDBEmbedded({
  node,
  workspaceId,
  workflowId,
  hasInputSource,
  onConfigUpdate,
  onProcess
}: OutlierRemoverDuckDBEmbeddedProps) {
  const [showGUI, setShowGUI] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowGUI(true)}
        className="h-4 w-4 p-0 text-gray-400 hover:text-purple-500 hover:bg-purple-50/60 rounded-full transition-all"
        title={hasInputSource ? 'Remove Outliers' : 'Upload & Remove Outliers'}
      >
        <Database className="h-2 w-2" />
      </Button>
      
      {showGUI && (
        <Dialog open={showGUI} onOpenChange={setShowGUI}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-full p-0">
            <div className="h-full">
              <OutlierRemoverDuckDBGUI
                node={node}
                workflowId={workflowId}
                onConfigUpdate={onConfigUpdate}
                onProcess={onProcess}
                isStandalone={false}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}


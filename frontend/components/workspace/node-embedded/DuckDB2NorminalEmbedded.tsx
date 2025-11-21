'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Database } from 'lucide-react'
import DuckDB2NorminalGUI from './DuckDB2NorminalGUI'
import { Dialog, DialogContent } from '@/components/ui/dialog'

interface DuckDB2NorminalEmbeddedProps {
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

export default function DuckDB2NorminalEmbedded({
  node,
  workspaceId,
  workflowId,
  hasInputSource,
  onConfigUpdate,
  onProcess
}: DuckDB2NorminalEmbeddedProps) {
  const [showGUI, setShowGUI] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowGUI(true)}
        className="h-4 w-4 p-0 text-gray-400 hover:text-purple-500 hover:bg-purple-50/60 rounded-full transition-all"
        title={hasInputSource ? 'Normalize Columns' : 'Upload & Normalize Columns'}
      >
        <Database className="h-2 w-2" />
      </Button>
      
      {showGUI && (
        <Dialog open={showGUI} onOpenChange={setShowGUI}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-full p-0">
            <div className="h-full">
              <DuckDB2NorminalGUI
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


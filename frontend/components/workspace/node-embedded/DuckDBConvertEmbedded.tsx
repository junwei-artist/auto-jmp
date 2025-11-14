'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Database } from 'lucide-react'
import DuckDBConvertWizard from './DuckDBConvertWizard'

interface DuckDBConvertEmbeddedProps {
  node: {
    id: string
    module_type: string
    config: any
    state: any
  }
  workflowId: string
  onConfigUpdate?: (config: any) => void
}

export default function DuckDBConvertEmbedded({
  node,
  workflowId,
  onConfigUpdate
}: DuckDBConvertEmbeddedProps) {
  const [wizardOpen, setWizardOpen] = useState(false)

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setWizardOpen(true)}
        className="flex items-center space-x-2"
      >
        <Database className="h-4 w-4" />
        <span>Configure</span>
      </Button>
      
      <DuckDBConvertWizard
        node={node}
        workflowId={workflowId}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onConfigUpdate={onConfigUpdate}
      />
    </>
  )
}


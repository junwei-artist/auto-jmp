'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FileSpreadsheet } from 'lucide-react'
import Excel2JMPWizard from './Excel2JMPWizard'

interface Excel2JMPEmbeddedProps {
  node: {
    id: string
    module_type: string
    config: any
    state: any
  }
  workflowId: string
  onConfigUpdate?: (config: any) => void
}

export default function Excel2JMPEmbedded({
  node,
  workflowId,
  onConfigUpdate
}: Excel2JMPEmbeddedProps) {
  const [wizardOpen, setWizardOpen] = useState(false)

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setWizardOpen(true)}
        className="flex items-center space-x-2"
      >
        <FileSpreadsheet className="h-4 w-4" />
        <span>Configure</span>
      </Button>
      
      <Excel2JMPWizard
        node={node}
        workflowId={workflowId}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onConfigUpdate={onConfigUpdate}
      />
    </>
  )
}


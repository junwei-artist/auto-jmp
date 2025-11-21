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
  // Button is rendered in parent component, just return null
  return null
}


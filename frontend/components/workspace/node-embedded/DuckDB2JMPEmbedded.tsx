'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Database } from 'lucide-react'
import DuckDB2JMPWizard from './DuckDB2JMPWizard'

interface DuckDB2JMPEmbeddedProps {
  node: {
    id: string
    module_type: string
    config: any
    state: any
  }
  workflowId: string
  onConfigUpdate?: (config: any) => void
}

export default function DuckDB2JMPEmbedded({
  node,
  workflowId,
  onConfigUpdate
}: DuckDB2JMPEmbeddedProps) {
  // Button is rendered in parent component, just return null
  return null
}


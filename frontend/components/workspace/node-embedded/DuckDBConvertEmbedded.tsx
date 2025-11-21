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
  // Button is rendered in parent component, just return null
  return null
}


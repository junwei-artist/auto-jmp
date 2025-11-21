'use client'

import { useState } from 'react'

export function useCapabilityGeneration() {
  const [generationData, setGenerationData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateCapability = async (file: File, sheetName?: string, chartType?: string, specLower?: number, specUpper?: number) => {
    setLoading(true)
    setError(null)
    
    try {
    const formData = new FormData()
    const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15)
    const uid = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10))
    const dot = file.name.lastIndexOf('.')
    const base = dot > -1 ? file.name.slice(0, dot) : file.name
    const ext = dot > -1 ? file.name.slice(dot) : ''
    const stamped = new File([file], `${base}_${ts}_${uid}${ext}`, { type: file.type })
    formData.append('file', stamped)
      if (sheetName) formData.append('sheet_name', sheetName)
      if (chartType) formData.append('chart_type', chartType)
      if (specLower !== undefined) formData.append('spec_lower', specLower.toString())
      if (specUpper !== undefined) formData.append('spec_upper', specUpper.toString())
      
      const response = await fetch('/api/v1/extensions/excel2processcapability/generate', {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        throw new Error('Generation failed')
      }
      
      const data = await response.json()
      setGenerationData(data)
      return data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    generationData,
    loading,
    error,
    generateCapability
  }
}

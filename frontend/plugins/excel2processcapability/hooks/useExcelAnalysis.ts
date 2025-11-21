'use client'

import { useState } from 'react'

export function useExcelAnalysis() {
  const [analysisData, setAnalysisData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const analyzeFile = async (file: File) => {
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
      
      const response = await fetch('/api/v1/extensions/excel2processcapability/analyze', {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        throw new Error('Analysis failed')
      }
      
      const data = await response.json()
      setAnalysisData(data)
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
    analysisData,
    loading,
    error,
    analyzeFile
  }
}

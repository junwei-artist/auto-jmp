'use client'

import { useState } from 'react'

export function useCPKGeneration() {
  const [generationData, setGenerationData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateCPK = async (file: File, projectName: string, projectDescription?: string) => {
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
      formData.append('project_name', projectName)
      if (projectDescription) formData.append('project_description', projectDescription)
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/extensions/excel2cpkv1/create-project`, {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        throw new Error('CPK Generation failed')
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

  const runCPKAnalysis = async (file: File, projectId: string, projectName: string, projectDescription?: string) => {
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
      formData.append('project_id', projectId)
      formData.append('project_name', projectName)
      if (projectDescription) formData.append('project_description', projectDescription)
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/extensions/excel2cpkv1/run-analysis`, {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        throw new Error('CPK Analysis failed')
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
    generateCPK,
    runCPKAnalysis
  }
}

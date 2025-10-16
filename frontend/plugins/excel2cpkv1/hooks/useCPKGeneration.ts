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
      formData.append('file', file)
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
      formData.append('file', file)
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

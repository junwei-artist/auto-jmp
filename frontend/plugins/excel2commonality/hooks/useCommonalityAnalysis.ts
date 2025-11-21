'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api'

export function useCommonalityAnalysis() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const processFile = async (file: File, projectName: string, projectDescription: string = '') => {
    setIsLoading(true)
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
      formData.append('project_description', projectDescription)
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/extensions/excel2commonality/process`, {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      return await response.json()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const validateFile = async (file: File) => {
    setIsLoading(true)
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
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/extensions/excel2commonality/validate`, {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      return await response.json()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const analyzeFile = async (file: File) => {
    setIsLoading(true)
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
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/extensions/excel2commonality/analyze`, {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      return await response.json()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  return {
    processFile,
    validateFile,
    analyzeFile,
    isLoading,
    error
  }
}

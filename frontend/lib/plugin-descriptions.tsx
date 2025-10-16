'use client'

import { useState, useEffect } from 'react'

interface PluginDescription {
  name: string
  description: string
  features: string[]
}

interface PluginDescriptions {
  [pluginId: string]: {
    en?: PluginDescription
    zh?: PluginDescription
  }
}

let cachedDescriptions: PluginDescriptions | null = null
let cacheTimestamp: number = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export function usePluginDescriptions() {
  const [descriptions, setDescriptions] = useState<PluginDescriptions>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDescriptions = async () => {
      // Check cache first
      const now = Date.now()
      if (cachedDescriptions && (now - cacheTimestamp) < CACHE_DURATION) {
        setDescriptions(cachedDescriptions)
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/plugins/descriptions`)
        
        if (response.ok) {
          const data = await response.json()
          cachedDescriptions = data
          cacheTimestamp = now
          setDescriptions(data)
        } else {
          console.warn('Failed to fetch plugin descriptions, using fallback')
          setDescriptions({})
        }
      } catch (err) {
        console.warn('Error fetching plugin descriptions:', err)
        setError('Failed to fetch plugin descriptions')
        setDescriptions({})
      } finally {
        setIsLoading(false)
      }
    }

    fetchDescriptions()
  }, [])

  const getPluginDescription = (pluginId: string, language: 'en' | 'zh', field: 'name' | 'description' | 'features', fallback: string | string[]): string | string[] => {
    const pluginDesc = descriptions[pluginId]?.[language]
    if (pluginDesc && pluginDesc[field] !== undefined) {
      return pluginDesc[field]
    }
    return fallback
  }

  const refreshDescriptions = async () => {
    cachedDescriptions = null
    cacheTimestamp = 0
    const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/plugins/descriptions`)
    if (response.ok) {
      const data = await response.json()
      cachedDescriptions = data
      cacheTimestamp = Date.now()
      setDescriptions(data)
    }
  }

  return {
    descriptions,
    isLoading,
    error,
    getPluginDescription,
    refreshDescriptions
  }
}

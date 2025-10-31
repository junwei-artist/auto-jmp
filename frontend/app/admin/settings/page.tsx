'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface AuditLog {
  id: string
  user_id?: string
  action: string
  target: string
  meta: string
  created_at: string
}

interface Extension {
  name: string
  version: string
  description: string
  supported_formats: string[]
  dependencies: string[]
  status: string
}

export default function AdminSettingsPage() {
  const router = useRouter()
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [queueMode, setQueueMode] = useState(false)
  const [isUpdatingQueueMode, setIsUpdatingQueueMode] = useState(false)
  const [extensions, setExtensions] = useState<Extension[]>([])
  const [isLoadingExtensions, setIsLoadingExtensions] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('access_token')
      if (!token) {
        router.push('/admin')
        return
      }

      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (response.ok) {
          const userData = await response.json()
          if (userData.is_admin) {
            setIsAuthenticated(true)
            await Promise.all([fetchAuditLogs(), fetchQueueMode(), fetchExtensions()])
          } else {
            router.push('/admin')
          }
        } else {
          router.push('/admin')
        }
      } catch (error) {
        router.push('/admin')
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [router])

  const fetchAuditLogs = async () => {
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/audit-logs?limit=50`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const logsData = await response.json()
        setAuditLogs(logsData)
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error)
    }
  }

  const fetchQueueMode = async () => {
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/queue-mode`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setQueueMode(data.queue_mode)
      }
    } catch (error) {
      console.error('Failed to fetch queue mode:', error)
    }
  }

  const fetchExtensions = async () => {
    setIsLoadingExtensions(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/extensions`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setExtensions(data)
      } else {
        console.error('Failed to fetch extensions')
      }
    } catch (error) {
      console.error('Failed to fetch extensions:', error)
    } finally {
      setIsLoadingExtensions(false)
    }
  }

  const reloadExtension = async (extensionName: string) => {
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/extensions/${extensionName}/reload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        // Refresh extensions list
        await fetchExtensions()
        alert(`Extension ${extensionName} reloaded successfully`)
      } else {
        alert(`Failed to reload extension ${extensionName}`)
      }
    } catch (error) {
      console.error('Failed to reload extension:', error)
      alert(`Failed to reload extension ${extensionName}`)
    }
  }

  const updateQueueMode = async (newQueueMode: boolean) => {
    setIsUpdatingQueueMode(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/queue-mode`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ queue_mode: newQueueMode }),
      })

      if (response.ok) {
        const data = await response.json()
        setQueueMode(data.queue_mode)
        // Refresh audit logs to show the setting change
        await fetchAuditLogs()
      } else {
        console.error('Failed to update queue mode')
      }
    } catch (error) {
      console.error('Failed to update queue mode:', error)
    } finally {
      setIsUpdatingQueueMode(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('user_id')
    localStorage.removeItem('is_guest')
    localStorage.removeItem('user_id')
    localStorage.removeItem('is_guest')
    router.push('/admin')
    window.location.reload()
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/admin/dashboard')}
                className="text-blue-600 hover:text-blue-800"
              >
                ← Back to Dashboard
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
                <p className="text-gray-600">Configure platform</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleLogout}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* System Information */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">System Information</h3>
          </div>
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Platform Status</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-gray-600">Database: Connected</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-gray-600">Backend: Running</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-gray-600">JMP Integration: Ready</span>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Configuration</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <div>Environment: Development</div>
                  <div>Version: 1.0.0</div>
                  <div>Last Updated: {new Date().toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Queue Mode Settings */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Task Processing Mode</h3>
            <p className="text-sm text-gray-600 mt-1">Configure how tasks are processed in the system</p>
          </div>
          <div className="px-6 py-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-gray-900">Queue Mode</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    {queueMode 
                      ? "Tasks are processed one at a time in a queue. New tasks will wait for the current task to complete."
                      : "Tasks are processed in parallel. Multiple tasks can run simultaneously."
                    }
                  </p>
                </div>
                <div className="ml-6">
                  <button
                    onClick={() => updateQueueMode(!queueMode)}
                    disabled={isUpdatingQueueMode}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      queueMode ? 'bg-blue-600' : 'bg-gray-200'
                    } ${isUpdatingQueueMode ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        queueMode ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className={`w-3 h-3 rounded-full mt-1 ${queueMode ? 'bg-blue-500' : 'bg-green-500'}`}></div>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900">
                      {queueMode ? 'Queue Mode Enabled' : 'Parallel Mode Enabled'}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      {queueMode 
                        ? 'Only one task can run at a time. Other tasks will be queued and processed sequentially.'
                        : 'Multiple tasks can run simultaneously for faster processing.'
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Extensions Management */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">Extensions Management</h3>
              <button
                onClick={fetchExtensions}
                disabled={isLoadingExtensions}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoadingExtensions ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>
          <div className="px-6 py-4">
            {isLoadingExtensions ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-600 mt-2">Loading extensions...</p>
              </div>
            ) : extensions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No extensions found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {extensions.map((extension) => (
                  <div key={extension.name} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h4 className="text-lg font-medium text-gray-900">{extension.name}</h4>
                          <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
                            v{extension.version}
                          </span>
                          <span className={`text-xs font-medium px-2.5 py-0.5 rounded ${
                            extension.status === 'loaded' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {extension.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{extension.description}</p>
                        
                        <div className="mt-3 space-y-2">
                          <div>
                            <span className="text-xs font-medium text-gray-700">Supported Formats:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {extension.supported_formats.map((format) => (
                                <span key={format} className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded">
                                  {format}
                                </span>
                              ))}
                            </div>
                          </div>
                          
                          {extension.dependencies.length > 0 && (
                            <div>
                              <span className="text-xs font-medium text-gray-700">Dependencies:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {extension.dependencies.map((dep) => (
                                  <span key={dep} className="bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded">
                                    {dep}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="ml-4">
                        <button
                          onClick={() => reloadExtension(extension.name)}
                          className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                        >
                          Reload
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Audit Logs */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Recent Activity ({auditLogs.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Target
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {log.action.replace('_', ' ')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.target}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.user_id || 'System'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {log.meta}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

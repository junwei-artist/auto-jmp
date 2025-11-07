'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Run {
  id: string
  project_id: string
  status: string
  task_name: string
  message?: string
  image_count: number
  created_at: string
  started_at?: string
  finished_at?: string
}

export default function AdminRunsPage() {
  const router = useRouter()
  const [runs, setRuns] = useState<Run[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

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
            await fetchRuns()
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

  const fetchRuns = async () => {
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/runs`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const runsData = await response.json()
        setRuns(runsData)
      }
    } catch (error) {
      console.error('Failed to fetch runs:', error)
    }
  }

  // Auto-refresh runs every 3 seconds if there are active runs
  useEffect(() => {
    if (!isAuthenticated) return

    const hasActiveRuns = runs.some(run => run.status === 'running' || run.status === 'queued')
    
    if (hasActiveRuns) {
      const interval = setInterval(fetchRuns, 3000)
      return () => clearInterval(interval)
    }
  }, [runs, isAuthenticated])

  const handleCancelRun = async (runId: string) => {
    if (!confirm('Are you sure you want to cancel this run?')) {
      return
    }

    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/runs/${runId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        await fetchRuns() // Refresh the list
        alert('Run canceled successfully')
      } else {
        const error = await response.json()
        alert(`Failed to cancel run: ${error.detail}`)
      }
    } catch (error) {
      alert('Failed to cancel run')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'succeeded':
        return 'bg-green-100 text-green-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      case 'running':
        return 'bg-blue-100 text-blue-800'
      case 'queued':
        return 'bg-yellow-100 text-yellow-800'
      case 'canceled':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
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
                <h1 className="text-2xl font-bold text-gray-900">Run Management</h1>
                <p className="text-gray-600">Check analysis runs</p>
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
        {/* Runs Table */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">All Runs ({runs.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Task Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Project ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Images
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {runs.map((run) => {
                  const duration = run.started_at && run.finished_at 
                    ? Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)
                    : null

                  return (
                    <tr key={run.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {run.task_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(run.status)}`}>
                          {run.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {run.project_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {run.image_count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(run.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {duration ? `${duration}s` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {(run.status === 'running' || run.status === 'queued') && (
                          <button
                            onClick={() => handleCancelRun(run.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

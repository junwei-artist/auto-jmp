'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/language'

export default function AdminDashboard() {
  const router = useRouter()
  const { t } = useLanguage()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState({
    total_users: 0,
    total_projects: 0,
    total_runs: 0,
    active_runs: 0
  })

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
            setUser(userData)
            setIsAuthenticated(true)
            await fetchStats()
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

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const statsData = await response.json()
        setStats(statsData)
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('user_id')
    localStorage.removeItem('is_guest')
    router.push('/admin')
    window.location.reload() // Force refresh to clear any cached state
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
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-gray-600">Manage your data analysis platform</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">Welcome, {user?.full_name || 'Admin'}</span>
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
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Users</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.total_users}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Projects</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.total_projects}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m-9-4h10a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6a2 2 0 012-2z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Runs</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.total_runs}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Active Runs</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.active_runs}</p>
              </div>
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <h3 className="text-lg font-medium text-gray-900 mb-4">System Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

        {/* Quick Actions */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <button 
              onClick={() => router.push('/admin/users')}
              className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left transition-colors"
            >
              <div className="font-medium text-gray-900">View Users</div>
              <div className="text-sm text-gray-600">Manage platform users</div>
            </button>
            <button 
              onClick={() => router.push('/admin/projects')}
              className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left transition-colors"
            >
              <div className="font-medium text-gray-900">View Projects</div>
              <div className="text-sm text-gray-600">Monitor all projects</div>
            </button>
            <button 
              onClick={() => router.push('/admin/runs')}
              className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left transition-colors"
            >
              <div className="font-medium text-gray-900">View Runs</div>
              <div className="text-sm text-gray-600">Check analysis runs</div>
            </button>
            <button 
              onClick={() => router.push('/admin/plugins')}
              className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left transition-colors"
            >
              <div className="font-medium text-gray-900">{t('admin.plugins.title')}</div>
              <div className="text-sm text-gray-600">{t('admin.plugins.subtitle')}</div>
            </button>
            <button 
              onClick={() => router.push('/admin/settings')}
              className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left transition-colors"
            >
              <div className="font-medium text-gray-900">System Settings</div>
              <div className="text-sm text-gray-600">Configure platform</div>
            </button>
            <button 
              onClick={() => router.push('/admin/oauth')}
              className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left transition-colors"
            >
              <div className="font-medium text-gray-900">OAuth2 Clients</div>
              <div className="text-sm text-gray-600">Manage external app access</div>
            </button>
            <button 
              onClick={() => router.push('/admin/zones')}
              className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left transition-colors"
            >
              <div className="font-medium text-gray-900">Community Zones</div>
              <div className="text-sm text-gray-600">Manage community zones</div>
            </button>
            <button 
              onClick={() => router.push('/admin/announcements')}
              className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left transition-colors"
            >
              <div className="font-medium text-gray-900">Broadcast Announcements</div>
              <div className="text-sm text-gray-600">Send messages to all users and webhooks</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
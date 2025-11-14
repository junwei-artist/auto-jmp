'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Webhook {
  id: string
  url: string
  name?: string
  has_secret?: boolean
  created_at: string
}

interface ScheduledNotification {
  id: string
  title: string
  message: string
  scheduled_time: string
  timezone: string
  is_active: boolean
  created_by: string
  created_at: string
  updated_at: string
  last_sent_at?: string
}

export default function AdminAnnouncementsPage() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  
  // Announcement form state
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendResult, setSendResult] = useState<any>(null)
  const [showWebhookDetails, setShowWebhookDetails] = useState(false)
  
  // Webhook management state
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false)
  const [showAddWebhook, setShowAddWebhook] = useState(false)
  const [newWebhookUrl, setNewWebhookUrl] = useState('')
  const [newWebhookName, setNewWebhookName] = useState('')
  const [newWebhookSecret, setNewWebhookSecret] = useState('')
  const [isAddingWebhook, setIsAddingWebhook] = useState(false)
  
  // Scheduled notifications state
  const [scheduledNotifications, setScheduledNotifications] = useState<ScheduledNotification[]>([])
  const [isLoadingScheduled, setIsLoadingScheduled] = useState(false)
  const [showAddScheduled, setShowAddScheduled] = useState(false)
  const [editingScheduled, setEditingScheduled] = useState<ScheduledNotification | null>(null)
  const [scheduledTitle, setScheduledTitle] = useState('')
  const [scheduledMessage, setScheduledMessage] = useState('')
  const [scheduledTime, setScheduledTime] = useState('09:00')
  const [scheduledTimezone, setScheduledTimezone] = useState('UTC')
  const [scheduledIsActive, setScheduledIsActive] = useState(true)
  const [isSavingScheduled, setIsSavingScheduled] = useState(false)

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
            await fetchWebhooks()
            await fetchScheduledNotifications()
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

  const fetchWebhooks = async () => {
    setIsLoadingWebhooks(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/webhooks`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setWebhooks(data.webhooks || [])
      }
    } catch (error) {
      console.error('Failed to fetch webhooks:', error)
    } finally {
      setIsLoadingWebhooks(false)
    }
  }

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !message.trim()) {
      alert('Please fill in both title and message')
      return
    }

    setIsSending(true)
    setSendResult(null)

    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/broadcast-announcement`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
        }),
      })

      if (response.ok) {
        const result = await response.json()
        setSendResult(result)
        setTitle('')
        setMessage('')
        setShowWebhookDetails(true)
        const webhookCount = result.webhook_results?.length || 0
        const successCount = result.webhook_results?.filter((w: any) => w.success).length || 0
        alert(`Announcement sent successfully!\nUsers notified: ${result.users_notified}\nWebhooks notified: ${result.webhooks_notified} (${successCount}/${webhookCount} successful)`)
      } else {
        const error = await response.json()
        alert(`Failed to send announcement: ${error.detail || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error broadcasting announcement:', error)
      alert('Failed to send announcement. Please try again.')
    } finally {
      setIsSending(false)
    }
  }

  const handleAddWebhook = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWebhookUrl.trim()) {
      alert('Please enter a webhook URL')
      return
    }

    setIsAddingWebhook(true)

    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/webhooks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: newWebhookUrl.trim(),
          name: newWebhookName.trim() || undefined,
          secret: newWebhookSecret.trim() || undefined,
        }),
      })

      if (response.ok) {
        await fetchWebhooks()
        setNewWebhookUrl('')
        setNewWebhookName('')
        setNewWebhookSecret('')
        setShowAddWebhook(false)
        alert('Webhook added successfully!')
      } else {
        const error = await response.json()
        alert(`Failed to add webhook: ${error.detail || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error adding webhook:', error)
      alert('Failed to add webhook. Please try again.')
    } finally {
      setIsAddingWebhook(false)
    }
  }

  const handleDeleteWebhook = async (webhookId: string) => {
    if (!confirm('Are you sure you want to delete this webhook?')) {
      return
    }

    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/webhooks/${webhookId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        await fetchWebhooks()
        alert('Webhook deleted successfully!')
      } else {
        const error = await response.json()
        alert(`Failed to delete webhook: ${error.detail || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error deleting webhook:', error)
      alert('Failed to delete webhook. Please try again.')
    }
  }

  const handleAddTestWebhook = async () => {
    const testWebhookUrl = "https://oapi.dingtalk.com/robot/send?access_token=993d0001ebc2a6e4013eaf76136e058571e8b73f94e9366c11d9ed989a8cf8ea"
    const testWebhookSecret = "SEC8d905dbb955c7a0ec5cba6b39dc59649981d1546179028a98444eb3a082fb0f1"
    
    // Check if test webhook already exists
    const exists = webhooks.some(wh => wh.url === testWebhookUrl)
    if (exists) {
      alert('Test webhook already exists!')
      return
    }

    setNewWebhookUrl(testWebhookUrl)
    setNewWebhookName('DingTalk Test Webhook')
    setNewWebhookSecret(testWebhookSecret)
    setShowAddWebhook(true)
  }

  const fetchScheduledNotifications = async () => {
    setIsLoadingScheduled(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/scheduled-notifications`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setScheduledNotifications(data || [])
      }
    } catch (error) {
      console.error('Failed to fetch scheduled notifications:', error)
    } finally {
      setIsLoadingScheduled(false)
    }
  }

  const handleSaveScheduled = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scheduledTitle.trim() || !scheduledMessage.trim() || !scheduledTime.trim()) {
      alert('Please fill in all required fields')
      return
    }

    setIsSavingScheduled(true)

    try {
      const token = localStorage.getItem('access_token')
      const url = editingScheduled
        ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/scheduled-notifications/${editingScheduled.id}`
        : `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/scheduled-notifications`
      
      const method = editingScheduled ? 'PUT' : 'POST'
      const body = editingScheduled
        ? {
            title: scheduledTitle.trim(),
            message: scheduledMessage.trim(),
            scheduled_time: scheduledTime.trim(),
            timezone: scheduledTimezone.trim(),
            is_active: scheduledIsActive,
          }
        : {
            title: scheduledTitle.trim(),
            message: scheduledMessage.trim(),
            scheduled_time: scheduledTime.trim(),
            timezone: scheduledTimezone.trim(),
            is_active: scheduledIsActive,
          }

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        await fetchScheduledNotifications()
        setScheduledTitle('')
        setScheduledMessage('')
        setScheduledTime('09:00')
        setScheduledTimezone('UTC')
        setScheduledIsActive(true)
        setShowAddScheduled(false)
        setEditingScheduled(null)
        alert(editingScheduled ? 'Scheduled notification updated successfully!' : 'Scheduled notification created successfully!')
      } else {
        const error = await response.json()
        alert(`Failed to save: ${error.detail || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error saving scheduled notification:', error)
      alert('Failed to save scheduled notification. Please try again.')
    } finally {
      setIsSavingScheduled(false)
    }
  }

  const handleEditScheduled = (notification: ScheduledNotification) => {
    setEditingScheduled(notification)
    setScheduledTitle(notification.title)
    setScheduledMessage(notification.message)
    setScheduledTime(notification.scheduled_time)
    setScheduledTimezone(notification.timezone)
    setScheduledIsActive(notification.is_active)
    setShowAddScheduled(true)
  }

  const handleDeleteScheduled = async (notificationId: string) => {
    if (!confirm('Are you sure you want to delete this scheduled notification?')) {
      return
    }

    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/admin/scheduled-notifications/${notificationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        await fetchScheduledNotifications()
        alert('Scheduled notification deleted successfully!')
      } else {
        const error = await response.json()
        alert(`Failed to delete: ${error.detail || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error deleting scheduled notification:', error)
      alert('Failed to delete scheduled notification. Please try again.')
    }
  }

  const handleCancelScheduled = () => {
    setShowAddScheduled(false)
    setEditingScheduled(null)
    setScheduledTitle('')
    setScheduledMessage('')
    setScheduledTime('09:00')
    setScheduledTimezone('UTC')
    setScheduledIsActive(true)
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
              <h1 className="text-2xl font-bold text-gray-900">Broadcast Important Announcements</h1>
              <p className="text-gray-600">Send messages to all users and webhooks</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/admin/dashboard')}
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Broadcast Announcement Form */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Broadcast Announcement</h2>
            <form onSubmit={handleBroadcast} className="space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                  Title *
                </label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter announcement title"
                  required
                />
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
                  Message *
                </label>
                <textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter announcement message"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isSending}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSending ? 'Sending...' : 'Broadcast to All Users & Webhooks'}
              </button>
            </form>
            {sendResult && (
              <div className="mt-4 space-y-3">
                <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-sm text-green-800">
                    <strong>Success!</strong> Notified {sendResult.users_notified} users and {sendResult.webhooks_notified} webhooks.
                  </p>
                </div>
                
                {sendResult.webhook_results && sendResult.webhook_results.length > 0 && (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-sm font-semibold text-gray-900">Webhook Responses</h4>
                      <button
                        onClick={() => setShowWebhookDetails(!showWebhookDetails)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        {showWebhookDetails ? 'Hide Details' : 'Show Details'}
                      </button>
                    </div>
                    
                    {showWebhookDetails && (
                      <div className="space-y-2 mt-3">
                        {sendResult.webhook_results.map((webhook: any, index: number) => (
                          <div
                            key={index}
                            className={`p-3 rounded border ${
                              webhook.success
                                ? 'bg-green-50 border-green-200'
                                : 'bg-red-50 border-red-200'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="font-medium text-sm">
                                  {webhook.name || 'Unnamed Webhook'}
                                  {webhook.success ? (
                                    <span className="ml-2 text-green-600">✓ Success</span>
                                  ) : (
                                    <span className="ml-2 text-red-600">✗ Failed</span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-600 mt-1 break-all">{webhook.url}</div>
                                {webhook.status_code && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    Status Code: {webhook.status_code}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {webhook.response && (
                              <div className="mt-2 p-2 bg-white rounded border border-gray-200">
                                <div className="text-xs font-semibold text-gray-700 mb-1">Response:</div>
                                <pre className="text-xs text-gray-600 overflow-auto max-h-32">
                                  {JSON.stringify(webhook.response, null, 2)}
                                </pre>
                              </div>
                            )}
                            
                            {webhook.error && (
                              <div className="mt-2 p-2 bg-red-100 rounded border border-red-300">
                                <div className="text-xs font-semibold text-red-700 mb-1">Error:</div>
                                <div className="text-xs text-red-600">{webhook.error}</div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Webhook Management */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Webhook Management</h2>
              <div className="flex gap-2">
                <button
                  onClick={handleAddTestWebhook}
                  className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                >
                  Add Test Webhook
                </button>
                <button
                  onClick={() => setShowAddWebhook(!showAddWebhook)}
                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                >
                  {showAddWebhook ? 'Cancel' : 'Add Webhook'}
                </button>
              </div>
            </div>

            {showAddWebhook && (
              <form onSubmit={handleAddWebhook} className="mb-4 p-4 bg-gray-50 rounded-md space-y-3">
                <div>
                  <label htmlFor="webhook-url" className="block text-sm font-medium text-gray-700 mb-1">
                    Webhook URL *
                  </label>
                  <input
                    id="webhook-url"
                    type="url"
                    value={newWebhookUrl}
                    onChange={(e) => setNewWebhookUrl(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://..."
                    required
                  />
                </div>
                <div>
                  <label htmlFor="webhook-name" className="block text-sm font-medium text-gray-700 mb-1">
                    Name (optional)
                  </label>
                  <input
                    id="webhook-name"
                    type="text"
                    value={newWebhookName}
                    onChange={(e) => setNewWebhookName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Webhook name"
                  />
                </div>
                <div>
                  <label htmlFor="webhook-secret" className="block text-sm font-medium text-gray-700 mb-1">
                    Secret (optional, for DingTalk signing)
                  </label>
                  <input
                    id="webhook-secret"
                    type="password"
                    value={newWebhookSecret}
                    onChange={(e) => setNewWebhookSecret(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Webhook secret (e.g., SEC...)"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Required for DingTalk webhooks with signature verification
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={isAddingWebhook}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isAddingWebhook ? 'Adding...' : 'Add Webhook'}
                </button>
              </form>
            )}

            <div className="space-y-2">
              {isLoadingWebhooks ? (
                <p className="text-sm text-gray-500">Loading webhooks...</p>
              ) : webhooks.length === 0 ? (
                <p className="text-sm text-gray-500">No webhooks configured. Add one to get started.</p>
              ) : (
                webhooks.map((webhook) => (
                  <div
                    key={webhook.id}
                    className="p-3 border border-gray-200 rounded-md flex justify-between items-start"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {webhook.name || 'Unnamed Webhook'}
                        {webhook.has_secret && (
                          <span className="ml-2 text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">
                            Has Secret
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 mt-1 break-all">{webhook.url}</div>
                      {webhook.created_at && (
                        <div className="text-xs text-gray-400 mt-1">
                          Added: {new Date(webhook.created_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteWebhook(webhook.id)}
                      className="ml-4 text-red-600 hover:text-red-800 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Scheduled Daily Notifications */}
        <div className="bg-white p-6 rounded-lg shadow mt-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Scheduled Daily Notifications</h2>
            <button
              onClick={() => {
                handleCancelScheduled()
                setShowAddScheduled(!showAddScheduled)
              }}
              className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
            >
              {showAddScheduled ? 'Cancel' : 'Add Scheduled Notification'}
            </button>
          </div>

          {showAddScheduled && (
            <form onSubmit={handleSaveScheduled} className="mb-4 p-4 bg-gray-50 rounded-md space-y-3">
              <div>
                <label htmlFor="scheduled-title" className="block text-sm font-medium text-gray-700 mb-1">
                  Title *
                </label>
                <input
                  id="scheduled-title"
                  type="text"
                  value={scheduledTitle}
                  onChange={(e) => setScheduledTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Notification title"
                  required
                />
              </div>
              <div>
                <label htmlFor="scheduled-message" className="block text-sm font-medium text-gray-700 mb-1">
                  Message *
                </label>
                <textarea
                  id="scheduled-message"
                  value={scheduledMessage}
                  onChange={(e) => setScheduledMessage(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Notification message"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="scheduled-time" className="block text-sm font-medium text-gray-700 mb-1">
                    Time (HH:MM) *
                  </label>
                  <input
                    id="scheduled-time"
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="scheduled-timezone" className="block text-sm font-medium text-gray-700 mb-1">
                    Timezone
                  </label>
                  <select
                    id="scheduled-timezone"
                    value={scheduledTimezone}
                    onChange={(e) => setScheduledTimezone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="UTC">UTC</option>
                    <option value="Asia/Shanghai">Asia/Shanghai (CST)</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                    <option value="Europe/London">Europe/London (GMT)</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center">
                <input
                  id="scheduled-active"
                  type="checkbox"
                  checked={scheduledIsActive}
                  onChange={(e) => setScheduledIsActive(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="scheduled-active" className="ml-2 block text-sm text-gray-700">
                  Active (enable this scheduled notification)
                </label>
              </div>
              <button
                type="submit"
                disabled={isSavingScheduled}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSavingScheduled ? 'Saving...' : editingScheduled ? 'Update Scheduled Notification' : 'Create Scheduled Notification'}
              </button>
            </form>
          )}

          <div className="space-y-2">
            {isLoadingScheduled ? (
              <p className="text-sm text-gray-500">Loading scheduled notifications...</p>
            ) : scheduledNotifications.length === 0 ? (
              <p className="text-sm text-gray-500">No scheduled notifications. Add one to get started.</p>
            ) : (
              scheduledNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 border rounded-md ${
                    notification.is_active
                      ? 'bg-green-50 border-green-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="font-medium text-gray-900">{notification.title}</div>
                        {notification.is_active ? (
                          <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">Active</span>
                        ) : (
                          <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">Inactive</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 mb-2">{notification.message}</div>
                      <div className="flex gap-4 text-xs text-gray-500">
                        <span>Time: {notification.scheduled_time} ({notification.timezone})</span>
                        {notification.last_sent_at && (
                          <span>Last sent: {new Date(notification.last_sent_at).toLocaleString()}</span>
                        )}
                        {!notification.last_sent_at && (
                          <span className="text-orange-600">Not sent yet</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleEditScheduled(notification)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteScheduled(notification.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


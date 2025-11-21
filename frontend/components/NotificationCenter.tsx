'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Bell, BellRing, Check, CheckCheck, MessageSquare, UserPlus, Play, AlertCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/language'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  project_id?: string
  is_read: boolean
  created_at: string
}

interface NotificationCenterProps {
  className?: string
}

const getAuthToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('access_token')
  }
  return null
}

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'comment_added':
      return <MessageSquare className="h-4 w-4" />
    case 'member_added':
    case 'member_removed':
      return <UserPlus className="h-4 w-4" />
    case 'run_completed':
    case 'run_failed':
      return <Play className="h-4 w-4" />
    case 'project_added':
    case 'project_updated':
    case 'project_deleted':
      return <AlertCircle className="h-4 w-4" />
    default:
      return <Bell className="h-4 w-4" />
  }
}

const getNotificationColor = (type: string) => {
  switch (type) {
    case 'run_completed':
      return 'text-green-600'
    case 'run_failed':
      return 'text-red-600'
    case 'member_added':
      return 'text-blue-600'
    case 'member_removed':
      return 'text-orange-600'
    case 'comment_added':
      return 'text-purple-600'
    default:
      return 'text-gray-600'
  }
}

const formatTimeAgo = (dateString: string, t: (key: string, params?: any) => string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  
  if (diffInSeconds < 60) {
    return t('notifications.justNow')
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60)
    return t('notifications.minutesAgo', { minutes })
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600)
    return t('notifications.hoursAgo', { hours })
  } else {
    const days = Math.floor(diffInSeconds / 86400)
    return t('notifications.daysAgo', { days })
  }
}

export function NotificationCenter({ className }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const { ready, user } = useAuth()
  const { t } = useLanguage()

  // Fetch notifications
  const fetchNotifications = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/v1/organization/notifications', {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include'
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch notifications')
      }
      
      const data = await response.json()
      setNotifications(data)
      
      // Count unread notifications
      const unread = data.filter((n: Notification) => !n.is_read).length
      setUnreadCount(unread)
    } catch (error) {
      console.error('Error fetching notifications:', error)
      toast.error(t('notifications.loadFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  // Mark notification as read
  const markAsRead = async (notificationId: string) => {
    try {
      const response = await fetch(`/api/v1/organization/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include'
      })
      
      if (!response.ok) {
        throw new Error('Failed to mark notification as read')
      }
      
      // Update local state
      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId ? { ...n, is_read: true } : n
        )
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Error marking notification as read:', error)
      toast.error(t('notifications.markReadFailed'))
    }
  }

  // Mark all notifications as read
  const markAllAsRead = async () => {
    try {
      const response = await fetch(`/api/v1/organization/notifications/mark-all-read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include'
      })
      
      if (!response.ok) {
        throw new Error('Failed to mark all notifications as read')
      }
      
      // Update local state
      setNotifications(prev => 
        prev.map(n => ({ ...n, is_read: true }))
      )
      setUnreadCount(0)
      toast.success(t('notifications.markAllReadSuccess'))
    } catch (error) {
      console.error('Error marking all notifications as read:', error)
      toast.error(t('notifications.markAllReadFailed'))
    }
  }

  useEffect(() => {
    if (!ready || !user) return
    fetchNotifications()
    
    // Refresh notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [ready, user])

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BellRing className="h-5 w-5" />
            {t('notifications.title')}
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {unreadCount}
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead}>
              <CheckCheck className="h-4 w-4 mr-1" />
              {t('notifications.markAllRead')}
            </Button>
          )}
        </CardTitle>
        <CardDescription>
          {t('notifications.subtitle')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          {isLoading ? (
            <div className="text-center py-8">{t('notifications.loading')}</div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Bell className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>{t('notifications.noNotifications')}</p>
              <p className="text-sm">{t('notifications.noNotificationsMessage')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    notification.is_read 
                      ? 'bg-gray-50 hover:bg-gray-100' 
                      : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                  }`}
                  onClick={() => !notification.is_read && markAsRead(notification.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-1 ${getNotificationColor(notification.type)}`}>
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className={`text-sm font-medium ${
                          notification.is_read ? 'text-gray-700' : 'text-gray-900'
                        }`}>
                          {notification.title}
                        </h4>
                        <div className="flex items-center gap-2">
                          {!notification.is_read && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          )}
                          <span className="text-xs text-gray-500">
                            {formatTimeAgo(notification.created_at, t)}
                          </span>
                        </div>
                      </div>
                      <p className={`text-sm mt-1 ${
                        notification.is_read ? 'text-gray-600' : 'text-gray-700'
                      }`}>
                        {notification.message}
                      </p>
                      {notification.project_id && (
                        <Badge variant="outline" className="mt-2 text-xs">
                          {t('notifications.projectId', { id: notification.project_id.slice(0, 8) })}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

// Notification Bell Component for Header
export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const { ready, user } = useAuth()

  const fetchUnreadCount = async () => {
    try {
      const response = await fetch('/api/v1/organization/notifications?unread_only=true', {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include'
      })
      
      if (response.ok) {
        const data = await response.json()
        setUnreadCount(data.length)
      }
    } catch (error) {
      console.error('Error fetching unread count:', error)
    }
  }

  useEffect(() => {
    if (!ready || !user) return
    fetchUnreadCount()
    
    // Refresh count every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [ready, user])

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="relative"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </Button>
      
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 z-50">
          <NotificationCenter />
        </div>
      )}
    </div>
  )
}

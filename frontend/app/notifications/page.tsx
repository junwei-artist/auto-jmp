'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Bell,
    BellRing,
    CheckCheck,
    MessageSquare,
    UserPlus,
    Play,
    AlertCircle,
    ArrowLeft,
    Filter
} from 'lucide-react'
import { toast } from 'react-hot-toast'
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

const getAuthToken = () => {
    if (typeof window !== 'undefined') {
        return localStorage.getItem('access_token')
    }
    return null
}

const getNotificationIcon = (type: string) => {
    switch (type) {
        case 'comment_added':
            return <MessageSquare className="h-5 w-5" />
        case 'member_added':
        case 'member_removed':
            return <UserPlus className="h-5 w-5" />
        case 'run_completed':
        case 'run_failed':
            return <Play className="h-5 w-5" />
        case 'project_added':
        case 'project_updated':
        case 'project_deleted':
            return <AlertCircle className="h-5 w-5" />
        default:
            return <Bell className="h-5 w-5" />
    }
}

const getNotificationColor = (type: string) => {
    switch (type) {
        case 'run_completed':
            return 'text-green-500 bg-green-500/10'
        case 'run_failed':
            return 'text-red-500 bg-red-500/10'
        case 'member_added':
            return 'text-blue-500 bg-blue-500/10'
        case 'member_removed':
            return 'text-orange-500 bg-orange-500/10'
        case 'comment_added':
            return 'text-purple-500 bg-purple-500/10'
        default:
            return 'text-gray-500 bg-gray-500/10'
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

export default function NotificationsPage() {
    const router = useRouter()
    const { ready, user } = useAuth()
    const { t } = useLanguage()
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [filter, setFilter] = useState<'all' | 'unread'>('all')
    const [unreadCount, setUnreadCount] = useState(0)

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
        if (!ready || !user) {
            router.push('/')
            return
        }
        fetchNotifications()

        // Refresh notifications every 30 seconds
        const interval = setInterval(fetchNotifications, 30000)
        return () => clearInterval(interval)
    }, [ready, user])

    const filteredNotifications = filter === 'unread'
        ? notifications.filter(n => !n.is_read)
        : notifications

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
            <div className="container mx-auto px-4 py-8 max-w-4xl">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                >
                    <Button
                        variant="ghost"
                        onClick={() => router.back()}
                        className="mb-4 text-white/70 hover:text-white hover:bg-white/10"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        {t('common.back')}
                    </Button>

                    <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 shadow-2xl">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg">
                                    <BellRing className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h1 className="text-3xl font-bold text-white">
                                        {t('notifications.title')}
                                    </h1>
                                    {unreadCount > 0 && (
                                        <Badge className="mt-1 bg-red-500 text-white">
                                            {unreadCount} {unreadCount === 1 ? 'new' : 'new'}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            {unreadCount > 0 && (
                                <Button
                                    onClick={markAllAsRead}
                                    className="bg-white/10 hover:bg-white/20 text-white border border-white/20"
                                >
                                    <CheckCheck className="w-4 h-4 mr-2" />
                                    {t('notifications.markAllRead')}
                                </Button>
                            )}
                        </div>
                        <p className="text-white/70">
                            {t('notifications.subtitle')}
                        </p>
                    </div>
                </motion.div>

                {/* Filter Tabs */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="flex gap-2 mb-6"
                >
                    <Button
                        variant={filter === 'all' ? 'default' : 'ghost'}
                        onClick={() => setFilter('all')}
                        className={filter === 'all'
                            ? 'bg-white text-black hover:bg-white/90'
                            : 'text-white hover:bg-white/10'
                        }
                    >
                        All ({notifications.length})
                    </Button>
                    <Button
                        variant={filter === 'unread' ? 'default' : 'ghost'}
                        onClick={() => setFilter('unread')}
                        className={filter === 'unread'
                            ? 'bg-white text-black hover:bg-white/90'
                            : 'text-white hover:bg-white/10'
                        }
                    >
                        Unread ({unreadCount})
                    </Button>
                </motion.div>

                {/* Notifications List */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-3"
                >
                    {isLoading ? (
                        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-12 text-center">
                            <div className="animate-spin w-8 h-8 border-4 border-white/30 border-t-white rounded-full mx-auto mb-4"></div>
                            <p className="text-white/70">{t('notifications.loading')}</p>
                        </div>
                    ) : filteredNotifications.length === 0 ? (
                        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-12 text-center">
                            <Bell className="w-16 h-16 mx-auto mb-4 text-white/30" />
                            <p className="text-white text-lg mb-2">{t('notifications.noNotifications')}</p>
                            <p className="text-white/60">{t('notifications.noNotificationsMessage')}</p>
                        </div>
                    ) : (
                        filteredNotifications.map((notification, index) => (
                            <motion.div
                                key={notification.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.05 }}
                                onClick={() => !notification.is_read && markAsRead(notification.id)}
                                className={`backdrop-blur-xl border rounded-2xl p-5 cursor-pointer transition-all duration-300 hover:scale-[1.02] ${notification.is_read
                                        ? 'bg-white/5 border-white/10 hover:bg-white/10'
                                        : 'bg-blue-500/20 border-blue-400/30 hover:bg-blue-500/30 shadow-lg shadow-blue-500/20'
                                    }`}
                            >
                                <div className="flex items-start gap-4">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${getNotificationColor(notification.type)}`}>
                                        {getNotificationIcon(notification.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2 mb-1">
                                            <h3 className={`font-semibold ${notification.is_read ? 'text-white/80' : 'text-white'
                                                }`}>
                                                {notification.title}
                                            </h3>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                {!notification.is_read && (
                                                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                                                )}
                                                <span className="text-xs text-white/50">
                                                    {formatTimeAgo(notification.created_at, t)}
                                                </span>
                                            </div>
                                        </div>
                                        <p className={`text-sm ${notification.is_read ? 'text-white/60' : 'text-white/80'
                                            }`}>
                                            {notification.message}
                                        </p>
                                        {notification.project_id && (
                                            <Badge variant="outline" className="mt-2 text-xs border-white/20 text-white/70">
                                                {t('notifications.projectId', { id: notification.project_id.slice(0, 8) })}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    )}
                </motion.div>
            </div>
        </div>
    )
}

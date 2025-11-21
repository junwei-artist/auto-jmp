"use client"
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'
import { Heart, MessageCircle, Eye, Search, Plus } from 'lucide-react'

type Zone = {
  id: string
  name: string
  description?: string
  icon?: string
  color?: string
  is_active: boolean
  display_order: number
  post_count: number
}

type Post = {
  id: string
  title: string
  content: string
  type: string
  zone_id?: string
  zone_name?: string
  tags?: string[]
  author_display_name?: string
  created_at: string
  views: number
  likes_count: number
  is_liked: boolean
  attachments: Array<{ id: string; filename: string; mime_type: string }>
}

export default function CommunityPage() {
  const [zones, setZones] = useState<Zone[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const { ready, user } = useAuth()

  const getAuthToken = () => {
    if (typeof window !== 'undefined') return localStorage.getItem('access_token')
    return null
  }

  useEffect(() => {
    if (!ready) return
    const run = async () => {
      try {
        // Fetch zones
        const zonesRes = await fetch('/api/v1/community/zones?active_only=true', {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
          credentials: 'include',
        })
        if (zonesRes.ok) {
          const zonesData = await zonesRes.json()
          setZones(zonesData)
        }

        // Fetch posts
        await fetchPosts()
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [ready])

  const fetchPosts = async (zoneId?: string | null) => {
    try {
      const params = new URLSearchParams()
      if (zoneId) params.append('zone_id', zoneId)
      if (searchQuery) params.append('q', searchQuery)

      const res = await fetch(`/api/v1/community/posts?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setPosts(data)
      }
    } catch (error) {
      console.error('Error fetching posts:', error)
    }
  }

  useEffect(() => {
    if (ready) {
      fetchPosts(selectedZone)
    }
  }, [selectedZone, searchQuery, ready])

  if (loading) return <div className="max-w-7xl mx-auto p-4">Loading...</div>

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Community</h1>
          <p className="text-gray-600 mt-1">Share knowledge, ask questions, and connect with others</p>
        </div>
        {user && (
          <Link href="/community/create">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Post
            </Button>
          </Link>
        )}
      </div>

      {/* Zones Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <Card
          className={`cursor-pointer transition-all hover:shadow-lg ${
            selectedZone === null ? 'ring-2 ring-blue-500' : ''
          }`}
          onClick={() => setSelectedZone(null)}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <span>🌐</span>
              All Zones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">{posts.length} posts</p>
          </CardContent>
        </Card>

        {zones.map((zone) => (
          <Card
            key={zone.id}
            className={`cursor-pointer transition-all hover:shadow-lg ${
              selectedZone === zone.id ? 'ring-2 ring-blue-500' : ''
            }`}
            onClick={() => setSelectedZone(zone.id)}
            style={{ borderTopColor: zone.color, borderTopWidth: '4px' }}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                {zone.icon && <span>{zone.icon}</span>}
                {zone.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {zone.description && (
                <p className="text-sm text-gray-600 mb-2">{zone.description}</p>
              )}
              <p className="text-sm text-gray-600">{zone.post_count} posts</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search posts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Posts List */}
      <div className="space-y-4">
        {posts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No posts found. Be the first to create a post!</p>
          </div>
        ) : (
          posts.map((post) => (
            <Link key={post.id} href={`/community/${post.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {post.zone_name && (
                          <Badge variant="outline" style={{ borderColor: zones.find(z => z.id === post.zone_id)?.color }}>
                            {post.zone_name}
                          </Badge>
                        )}
                        <Badge variant="secondary">{post.type.toUpperCase()}</Badge>
                      </div>
                      <CardTitle className="text-xl mb-2">{post.title}</CardTitle>
                      <div className="text-sm text-gray-500 flex items-center gap-4">
                        <span>{post.author_display_name || 'User'}</span>
                        <span>•</span>
                        <span>{new Date(post.created_at).toLocaleDateString()}</span>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          <Eye className="w-4 h-4" />
                          <span>{post.views}</span>
                        </div>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          <Heart className={`w-4 h-4 ${post.is_liked ? 'fill-red-500 text-red-500' : ''}`} />
                          <span>{post.likes_count}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 line-clamp-3">{post.content.replace(/<[^>]*>/g, '').substring(0, 200)}...</p>
                  {post.tags && post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {post.tags.map((tag, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {post.attachments && post.attachments.length > 0 && (
                    <div className="mt-2 text-sm text-gray-500">
                      📎 {post.attachments.length} attachment{post.attachments.length > 1 ? 's' : ''}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

"use client"
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import CommunityComments from '@/components/CommunityComments'
import { Heart, Eye, Edit, Trash2, ArrowLeft, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'

type Post = {
  id: string
  title: string
  content: string
  type: string
  zone_id?: string
  zone_name?: string
  tags?: string[]
  author_id?: string
  author_display_name?: string
  created_at: string
  updated_at: string
  views: number
  likes_count: number
  is_liked: boolean
  attachments: Array<{ id: string; filename: string; mime_type: string; file_size: number }>
}

export default function PostDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string
  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
  const [liking, setLiking] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editType, setEditType] = useState('')
  const { ready, user } = useAuth()

  const getAuthToken = () => {
    if (typeof window !== 'undefined') return localStorage.getItem('access_token')
    return null
  }

  const fetchPost = async () => {
    if (!id) return
    try {
      const res = await fetch(`/api/v1/community/posts/${id}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        credentials: 'include',
      })
      if (!res.ok) {
        if (res.status === 404) {
          toast.error('Post not found')
          router.push('/community')
        }
        return
      }
      const data = await res.json()
      setPost(data)
      setEditTitle(data.title)
      setEditContent(data.content)
      setEditType(data.type)
    } catch (error) {
      console.error('Error fetching post:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (ready) {
      fetchPost()
    }
  }, [id, ready])

  const handleLike = async () => {
    if (!user) {
      toast.error('Please login to like posts')
      return
    }

    setLiking(true)
    try {
      const res = await fetch(`/api/v1/community/posts/${id}/like`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
        credentials: 'include',
      })

      if (res.ok) {
        const data = await res.json()
        if (post) {
          setPost({
            ...post,
            is_liked: data.liked,
            likes_count: data.likes_count,
          })
        }
      }
    } catch (error) {
      toast.error('Failed to like post')
    } finally {
      setLiking(false)
    }
  }

  const handleUpdate = async () => {
    if (!editTitle.trim() || !editContent.trim()) {
      toast.error('Title and content are required')
      return
    }

    try {
      const res = await fetch(`/api/v1/community/posts/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          title: editTitle,
          content: editContent,
          type: editType,
        }),
      })

      if (res.ok) {
        toast.success('Post updated successfully')
        setShowEditDialog(false)
        await fetchPost()
      } else {
        const error = await res.json()
        toast.error(error.detail || 'Failed to update post')
      }
    } catch (error) {
      toast.error('Failed to update post')
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this post?')) {
      return
    }

    try {
      const res = await fetch(`/api/v1/community/posts/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
        credentials: 'include',
      })

      if (res.ok) {
        toast.success('Post deleted successfully')
        router.push('/community')
      } else {
        const error = await res.json()
        toast.error(error.detail || 'Failed to delete post')
      }
    } catch (error) {
      toast.error('Failed to delete post')
    }
  }


  if (loading) return <div className="max-w-3xl mx-auto p-4">Loading...</div>
  if (!post) return <div className="max-w-3xl mx-auto p-4">Post not found</div>

  const canEdit = user && (user.id === post.author_id || user.is_admin)

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <Link href="/community">
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Community
        </Button>
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                {post.zone_name && (
                  <Badge variant="outline">{post.zone_name}</Badge>
                )}
                <Badge variant="secondary">{post.type.toUpperCase()}</Badge>
              </div>
              <CardTitle className="text-2xl mb-2">{post.title}</CardTitle>
              <div className="text-sm text-gray-500 flex items-center gap-4 flex-wrap">
                <span>{post.author_display_name || 'User'}</span>
                <span>•</span>
                <span>{new Date(post.created_at).toLocaleString()}</span>
                {post.updated_at !== post.created_at && (
                  <>
                    <span>•</span>
                    <span className="text-xs">Updated {new Date(post.updated_at).toLocaleString()}</span>
                  </>
                )}
                <span>•</span>
                <div className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  <span>{post.views}</span>
                </div>
                <span>•</span>
                <button
                  onClick={handleLike}
                  disabled={liking || !user}
                  className={`flex items-center gap-1 ${post.is_liked ? 'text-red-500' : ''} ${!user ? 'opacity-50 cursor-not-allowed' : 'hover:text-red-500'}`}
                >
                  <Heart className={`w-4 h-4 ${post.is_liked ? 'fill-current' : ''}`} />
                  <span>{post.likes_count}</span>
                </button>
              </div>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => {
                      setEditTitle(post.title)
                      setEditContent(post.content)
                      setEditType(post.type)
                    }}>
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Edit Post</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Title</Label>
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Type</Label>
                        <Select value={editType} onValueChange={setEditType}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="question">Question</SelectItem>
                            <SelectItem value="tutorial">Tutorial</SelectItem>
                            <SelectItem value="manual">Manual</SelectItem>
                            <SelectItem value="sharing">Sharing</SelectItem>
                            <SelectItem value="tip">Tip</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Content</Label>
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={10}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleUpdate}>Save Changes</Button>
                        <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button variant="outline" size="sm" onClick={handleDelete} className="text-red-600 hover:text-red-700">
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="prose max-w-none">
            <div className="whitespace-pre-wrap">{post.content}</div>
          </div>

          {post.attachments && post.attachments.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold">Attachments</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {post.attachments.map((att) => (
                  <a
                    key={att.id}
                    href={`/api/v1/community/attachments/${att.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border rounded overflow-hidden block hover:shadow-md transition-shadow"
                  >
                    {att.mime_type?.startsWith('image/') ? (
                      <img
                        src={`/api/v1/community/attachments/${att.id}/download`}
                        alt={att.filename}
                        className="w-full h-32 object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/placeholder-image.png'
                        }}
                      />
                    ) : (
                      <div className="w-full h-32 bg-gray-100 flex items-center justify-center">
                        <span className="text-gray-400">📎 {att.filename}</span>
                      </div>
                    )}
                    <div className="p-2 text-xs text-gray-600 truncate">{att.filename}</div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Discussion</CardTitle>
        </CardHeader>
        <CardContent>
          <CommunityComments postId={post.id} />
        </CardContent>
      </Card>
    </div>
  )
}

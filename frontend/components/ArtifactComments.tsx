'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, Reply, Edit, Trash2, Send, X } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/language'
import toast from 'react-hot-toast'

interface ArtifactComment {
  id: string
  user_id: string
  user_email?: string
  user_is_guest: boolean
  parent_id?: string
  content: string
  created_at: string
  updated_at: string
  replies: ArtifactComment[]
}

interface ArtifactCommentsProps {
  artifactId: string
  currentUserRole: 'owner' | 'member' | 'watcher'
  onCommentCountChange?: (count: number) => void
}

export default function ArtifactComments({ artifactId, currentUserRole, onCommentCountChange }: ArtifactCommentsProps) {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [comments, setComments] = useState<ArtifactComment[]>([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [editingComment, setEditingComment] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  // Helper function to get auth token
  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('access_token')
    }
    return null
  }

  // Fetch comments
  const fetchComments = async () => {
    try {
      const token = getAuthToken()
      if (!token) return

      const response = await fetch(`/api/v1/artifacts/${artifactId}/comments`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        setComments(data)
        onCommentCountChange?.(data.length)
      }
    } catch (error) {
      console.error('Failed to fetch comments:', error)
    } finally {
      setLoading(false)
    }
  }

  // Create new comment
  const createComment = async () => {
    if (!newComment.trim()) return

    try {
      const token = getAuthToken()
      if (!token) return

      const response = await fetch(`/api/v1/artifacts/${artifactId}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: newComment.trim(),
        }),
      })

      if (response.ok) {
        setNewComment('')
        fetchComments()
        toast.success('Comment added successfully!')
      } else {
        toast.error('Failed to add comment')
      }
    } catch (error) {
      console.error('Failed to create comment:', error)
      toast.error('Failed to add comment')
    }
  }

  // Create reply
  const createReply = async (parentId: string) => {
    if (!replyContent.trim()) return

    try {
      const token = getAuthToken()
      if (!token) return

      const response = await fetch(`/api/v1/artifacts/${artifactId}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: replyContent.trim(),
          parent_id: parentId,
        }),
      })

      if (response.ok) {
        setReplyContent('')
        setReplyingTo(null)
        fetchComments()
        toast.success('Reply added successfully!')
      } else {
        toast.error('Failed to add reply')
      }
    } catch (error) {
      console.error('Failed to create reply:', error)
      toast.error('Failed to add reply')
    }
  }

  // Update comment
  const updateComment = async (commentId: string) => {
    if (!editContent.trim()) return

    try {
      const token = getAuthToken()
      if (!token) return

      const response = await fetch(`/api/v1/artifacts/${artifactId}/comments/${commentId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: editContent.trim(),
        }),
      })

      if (response.ok) {
        setEditingComment(null)
        setEditContent('')
        fetchComments()
        toast.success('Comment updated successfully!')
      } else {
        toast.error('Failed to update comment')
      }
    } catch (error) {
      console.error('Failed to update comment:', error)
      toast.error('Failed to update comment')
    }
  }

  // Delete comment
  const deleteComment = async (commentId: string) => {
    if (!confirm('Are you sure you want to delete this comment?')) return

    try {
      const token = getAuthToken()
      if (!token) return

      const response = await fetch(`/api/v1/artifacts/${artifactId}/comments/${commentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        fetchComments()
        toast.success('Comment deleted successfully!')
      } else {
        toast.error('Failed to delete comment')
      }
    } catch (error) {
      console.error('Failed to delete comment:', error)
      toast.error('Failed to delete comment')
    }
  }

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Check if user can edit/delete comment
  const canEditComment = (comment: ArtifactComment) => {
    return user && (comment.user_id === user.id || currentUserRole === 'owner')
  }

  useEffect(() => {
    fetchComments()
  }, [artifactId])

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Loading comments...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Comments ({comments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new comment */}
        {user && (
          <div className="space-y-2">
            <Textarea
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end">
              <Button onClick={createComment} disabled={!newComment.trim()}>
                <Send className="h-4 w-4 mr-2" />
                Add Comment
              </Button>
            </div>
          </div>
        )}

        {/* Comments list */}
        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="border-l-2 border-gray-200 pl-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {comment.user_is_guest ? 'Guest' : 'User'}
                    </Badge>
                    <span className="text-sm font-medium">
                      {comment.user_email || 'Unknown User'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDate(comment.created_at)}
                    </span>
                  </div>
                  {canEditComment(comment) && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingComment(comment.id)
                          setEditContent(comment.content)
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteComment(comment.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {editingComment === comment.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => updateComment(comment.id)}>
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingComment(null)
                          setEditContent('')
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">
                    {comment.content}
                  </div>
                )}

                {/* Reply button */}
                {user && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                  >
                    <Reply className="h-4 w-4 mr-1" />
                    Reply
                  </Button>
                )}

                {/* Reply form */}
                {replyingTo === comment.id && (
                  <div className="ml-4 space-y-2">
                    <Textarea
                      placeholder="Write a reply..."
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => createReply(comment.id)}>
                        Reply
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setReplyingTo(null)
                          setReplyContent('')
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Replies */}
                {comment.replies.length > 0 && (
                  <div className="ml-4 space-y-2">
                    {comment.replies.map((reply) => (
                      <div key={reply.id} className="border-l-2 border-gray-100 pl-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {reply.user_is_guest ? 'Guest' : 'User'}
                            </Badge>
                            <span className="text-sm font-medium">
                              {reply.user_email || 'Unknown User'}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatDate(reply.created_at)}
                            </span>
                          </div>
                          {canEditComment(reply) && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingComment(reply.id)
                                  setEditContent(reply.content)
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteComment(reply.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="text-sm text-gray-700 whitespace-pre-wrap">
                          {reply.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {comments.length === 0 && (
          <div className="text-center text-gray-500 py-4">
            No comments yet. Be the first to comment!
          </div>
        )}
      </CardContent>
    </Card>
  )
}

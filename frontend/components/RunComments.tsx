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

interface RunComment {
  id: string
  user_id: string
  user_email?: string
  user_is_guest: boolean
  parent_id?: string
  content: string
  created_at: string
  updated_at: string
  replies: RunComment[]
}

interface RunCommentsProps {
  runId: string
  currentUserRole: 'owner' | 'member' | 'watcher'
  onCommentCountChange?: (count: number) => void
}

export default function RunComments({ runId, currentUserRole, onCommentCountChange }: RunCommentsProps) {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [comments, setComments] = useState<RunComment[]>([])
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

      const response = await fetch(`/api/v1/runs/${runId}/comments`, {
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

      const response = await fetch(`/api/v1/runs/${runId}/comments`, {
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

      const response = await fetch(`/api/v1/runs/${runId}/comments`, {
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

      const response = await fetch(`/api/v1/runs/${runId}/comments/${commentId}`, {
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
        setEditContent('')
        setEditingComment(null)
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

      const response = await fetch(`/api/v1/runs/${runId}/comments/${commentId}`, {
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

  // Check if user can edit/delete comment
  const canEditComment = (comment: RunComment) => {
    return user && (comment.user_id === user.id || currentUserRole === 'owner')
  }

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  // Render comment
  const renderComment = (comment: RunComment, isReply = false) => (
    <div key={comment.id} className={`${isReply ? 'ml-6 mt-2' : 'mb-4'}`}>
      <div className="bg-gray-50 p-3 rounded-lg">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="text-xs">
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
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingComment(comment.id)
                  setEditContent(comment.content)
                }}
                className="h-6 w-6 p-0"
              >
                <Edit className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteComment(comment.id)}
                className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        {editingComment === comment.id ? (
          <div className="space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[60px]"
            />
            <div className="flex items-center space-x-2">
              <Button
                size="sm"
                onClick={() => updateComment(comment.id)}
                disabled={!editContent.trim()}
              >
                <Send className="mr-1 h-3 w-3" />
                Update
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingComment(null)
                  setEditContent('')
                }}
              >
                <X className="mr-1 h-3 w-3" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-700 mb-2">{comment.content}</p>
            {!isReply && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReplyingTo(comment.id)}
                className="h-6 px-2 text-xs"
              >
                <Reply className="mr-1 h-3 w-3" />
                Reply
              </Button>
            )}
          </>
        )}

        {/* Reply form */}
        {replyingTo === comment.id && (
          <div className="mt-3 space-y-2">
            <Textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Write a reply..."
              className="min-h-[60px]"
            />
            <div className="flex items-center space-x-2">
              <Button
                size="sm"
                onClick={() => createReply(comment.id)}
                disabled={!replyContent.trim()}
              >
                <Send className="mr-1 h-3 w-3" />
                Reply
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setReplyingTo(null)
                  setReplyContent('')
                }}
              >
                <X className="mr-1 h-3 w-3" />
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Render replies */}
        {comment.replies.map((reply) => renderComment(reply, true))}
      </div>
    </div>
  )

  useEffect(() => {
    fetchComments()
  }, [runId])

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
        <p className="text-sm text-gray-600">Loading comments...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700">
          Comments ({comments.length})
        </h4>
      </div>
      <div className="space-y-4">
        {/* Add new comment */}
        <div className="space-y-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="min-h-[80px]"
          />
          <Button
            onClick={createComment}
            disabled={!newComment.trim()}
            className="w-full"
          >
            <Send className="mr-2 h-4 w-4" />
            Add Comment
          </Button>
        </div>

        {/* Comments list */}
        {comments.length > 0 ? (
          <div className="space-y-4">
            {comments.map((comment) => renderComment(comment))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No comments yet. Be the first to comment!</p>
          </div>
        )}
      </div>
    </div>
  )
}

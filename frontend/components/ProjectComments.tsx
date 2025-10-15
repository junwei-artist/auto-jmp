'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, Reply, Edit, Trash2, Send, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'

interface ProjectComment {
  id: string
  user_id: string
  user_email?: string
  user_is_guest: boolean
  parent_id?: string
  content: string
  created_at: string
  updated_at: string
  replies: ProjectComment[]
}

interface ProjectCommentsProps {
  projectId: string
  currentUserRole: 'owner' | 'member' | 'watcher'
  onCommentChange?: () => void
}

export function ProjectComments({ projectId, currentUserRole, onCommentChange }: ProjectCommentsProps) {
  const [comments, setComments] = useState<ProjectComment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingComment, setEditingComment] = useState<ProjectComment | null>(null)
  const [replyingTo, setReplyingTo] = useState<ProjectComment | null>(null)
  const [newComment, setNewComment] = useState('')
  const [replyComment, setReplyComment] = useState('')

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4700'

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
      const response = await fetch(`${backendUrl}/api/v1/members/projects/${projectId}/comments`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include'
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch comments')
      }
      
      const data = await response.json()
      setComments(data)
    } catch (error) {
      console.error('Error fetching comments:', error)
      toast.error('Failed to load comments')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchComments()
  }, [projectId])

  // Add comment
  const handleAddComment = async () => {
    if (!newComment.trim()) {
      toast.error('Please enter a comment')
      return
    }

    try {
      const response = await fetch(`${backendUrl}/api/v1/members/projects/${projectId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          content: newComment.trim(),
          parent_id: replyingTo?.id || null
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to add comment')
      }

      toast.success('Comment added successfully')
      setNewComment('')
      setReplyingTo(null)
      setIsAddDialogOpen(false)
      fetchComments()
      onCommentChange?.()
    } catch (error: any) {
      console.error('Error adding comment:', error)
      toast.error(error.message || 'Failed to add comment')
    }
  }

  // Update comment
  const handleUpdateComment = async () => {
    if (!editingComment || !editingComment.content.trim()) {
      toast.error('Please enter a comment')
      return
    }

    try {
      const response = await fetch(`${backendUrl}/api/v1/members/projects/${projectId}/comments/${editingComment.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          content: editingComment.content.trim()
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to update comment')
      }

      toast.success('Comment updated successfully')
      setEditingComment(null)
      setIsEditDialogOpen(false)
      fetchComments()
      onCommentChange?.()
    } catch (error: any) {
      console.error('Error updating comment:', error)
      toast.error(error.message || 'Failed to update comment')
    }
  }

  // Delete comment
  const handleDeleteComment = async (commentId: string) => {
    try {
      const response = await fetch(`${backendUrl}/api/v1/members/projects/${projectId}/comments/${commentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        credentials: 'include'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to delete comment')
      }

      toast.success('Comment deleted successfully')
      fetchComments()
      onCommentChange?.()
    } catch (error: any) {
      console.error('Error deleting comment:', error)
      toast.error(error.message || 'Failed to delete comment')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const canComment = currentUserRole === 'owner' || currentUserRole === 'member' || currentUserRole === 'watcher'
  const canEditComment = (comment: ProjectComment) => currentUserRole === 'owner' // Only owners can edit/delete

  const CommentItem = ({ comment, isReply = false }: { comment: ProjectComment, isReply?: boolean }) => (
    <div className={`${isReply ? 'ml-8 border-l-2 border-gray-200 pl-4' : ''}`}>
      <div className="bg-white border rounded-lg p-4 mb-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="font-medium text-sm">
              {comment.user_email || 'Guest User'}
            </span>
            {comment.user_is_guest && (
              <Badge variant="outline" className="text-xs">
                Guest
              </Badge>
            )}
            <span className="text-xs text-gray-500">
              {formatDate(comment.created_at)}
            </span>
            {comment.updated_at !== comment.created_at && (
              <span className="text-xs text-gray-400">
                (edited)
              </span>
            )}
          </div>
          {canEditComment(comment) && (
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingComment(comment)
                  setIsEditDialogOpen(true)
                }}
                className="h-8 w-8 p-0"
              >
                <Edit className="h-4 w-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Comment</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this comment? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDeleteComment(comment.id)}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Delete Comment
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
        <div className="text-gray-700 text-sm whitespace-pre-wrap">
          {comment.content}
        </div>
        {!isReply && canComment && (
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setReplyingTo(comment)
                setIsAddDialogOpen(true)
              }}
            >
              <Reply className="h-4 w-4 mr-2" />
              Reply
            </Button>
          </div>
        )}
      </div>
      {comment.replies && comment.replies.length > 0 && (
        <div className="space-y-2">
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} isReply={true} />
          ))}
        </div>
      )}
    </div>
  )

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MessageSquare className="h-5 w-5" />
            <span>Project Comments</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="text-gray-600 mt-2">Loading comments...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <MessageSquare className="h-5 w-5" />
                <span>Project Comments</span>
              </CardTitle>
              <CardDescription>
                Discuss and collaborate on this project
              </CardDescription>
            </div>
            {canComment && (
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Add Comment
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {replyingTo ? `Reply to ${replyingTo.user_email || 'Guest User'}` : 'Add Comment'}
                    </DialogTitle>
                    <DialogDescription>
                      {replyingTo ? 'Write a reply to this comment.' : 'Share your thoughts about this project.'}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    {replyingTo && (
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="text-sm text-gray-600 mb-1">
                          Replying to {replyingTo.user_email || 'Guest User'}:
                        </div>
                        <div className="text-sm text-gray-800">
                          {replyingTo.content}
                        </div>
                      </div>
                    )}
                    <div>
                      <Textarea
                        placeholder="Write your comment..."
                        value={replyingTo ? replyComment : newComment}
                        onChange={(e) => replyingTo ? setReplyComment(e.target.value) : setNewComment(e.target.value)}
                        rows={4}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => {
                      setIsAddDialogOpen(false)
                      setReplyingTo(null)
                      setReplyComment('')
                    }}>
                      Cancel
                    </Button>
                    <Button onClick={() => {
                      if (replyingTo) {
                        setNewComment(replyComment)
                        handleAddComment()
                        setReplyComment('')
                      } else {
                        handleAddComment()
                      }
                    }}>
                      <Send className="h-4 w-4 mr-2" />
                      {replyingTo ? 'Reply' : 'Comment'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {comments.map((comment) => (
              <CommentItem key={comment.id} comment={comment} />
            ))}
            {comments.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No comments yet</p>
                {canComment && (
                  <p className="text-sm mt-2">Be the first to start the conversation!</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Comment Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Comment</DialogTitle>
            <DialogDescription>
              Update your comment
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Textarea
                placeholder="Write your comment..."
                value={editingComment?.content || ''}
                onChange={(e) => {
                  if (editingComment) {
                    setEditingComment({ ...editingComment, content: e.target.value })
                  }
                }}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setEditingComment(null)
              setIsEditDialogOpen(false)
            }}>
              Cancel
            </Button>
            <Button onClick={handleUpdateComment}>
              Update Comment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

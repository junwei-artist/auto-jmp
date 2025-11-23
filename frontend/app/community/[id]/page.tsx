'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  ThumbsUp,
  MessageCircle,
  Eye,
  Clock,
  Share2,
  TrendingUp,
  Send,
  User,
  MoreVertical,
  Edit,
  Trash2,
  X,
  File,
  FileText,
  FileSpreadsheet,
  FileImage,
  Archive,
  FileCode,
  Download
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/lib/auth'
import { communityApi } from '@/lib/api'
import toast from 'react-hot-toast'
import { useLanguage } from '@/lib/language'

// Helper to get icon for file type
const getFileIcon = (mimeType: string, filename: string) => {
  if (mimeType?.startsWith('image/')) {
    return FileImage
  }
  if (mimeType === 'application/pdf') {
    return FileText
  }
  if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel') || 
      filename?.toLowerCase().endsWith('.xlsx') || filename?.toLowerCase().endsWith('.xls')) {
    return FileSpreadsheet
  }
  if (mimeType?.includes('word') || mimeType?.includes('document') ||
      filename?.toLowerCase().endsWith('.doc') || filename?.toLowerCase().endsWith('.docx')) {
    return FileText
  }
  if (mimeType?.includes('zip') || mimeType?.includes('rar') || mimeType?.includes('archive') ||
      filename?.toLowerCase().match(/\.(zip|rar|7z|tar|gz)$/)) {
    return Archive
  }
  if (mimeType?.includes('text') || mimeType?.includes('code') ||
      filename?.toLowerCase().match(/\.(txt|js|ts|py|java|cpp|c|h|json|xml|html|css)$/)) {
    return FileCode
  }
  return File
}

export default function PostDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { user } = useAuth()
  const { t } = useLanguage()
  const [post, setPost] = useState<any>(null)
  const [comments, setComments] = useState<any[]>([])
  const [zones, setZones] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCommentDialog, setShowCommentDialog] = useState(false)

  // Edit/Delete states
  const [showPostMenu, setShowPostMenu] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editedPost, setEditedPost] = useState({ title: '', content: '', zone_id: '' })
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editedCommentContent, setEditedCommentContent] = useState('')
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)
  const [commentImages, setCommentImages] = useState<File[]>([])
  const [commentImagePreviews, setCommentImagePreviews] = useState<string[]>([])
  const [commentFiles, setCommentFiles] = useState<File[]>([])
  const commentImageInputRef = useRef<HTMLInputElement>(null)
  const commentFileInputRef = useRef<HTMLInputElement>(null)
  
  // Post attachment upload states
  const [postImages, setPostImages] = useState<File[]>([])
  const [postImagePreviews, setPostImagePreviews] = useState<string[]>([])
  const [postFiles, setPostFiles] = useState<File[]>([])
  const [uploadingAttachments, setUploadingAttachments] = useState(false)
  const postImageInputRef = useRef<HTMLInputElement>(null)
  const postFileInputRef = useRef<HTMLInputElement>(null)

  const postId = params?.id as string

  useEffect(() => {
    if (!postId) return

    const fetchData = async () => {
      try {
        setIsLoading(true)
        const [postData, commentsData, zonesData] = await Promise.all([
          communityApi.getPost(postId),
          communityApi.getComments(postId),
          communityApi.getZones()
        ])
        setPost(postData)
        setComments(commentsData)
        setZones(zonesData)
      } catch (error) {
        console.error('Error fetching post:', error)
        toast.error('Failed to load post')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [postId])

  const canEditPost = user && post && (user.id === post.author_id || user.is_admin)
  const canEditComment = (comment: any) => user && (user.id === comment.user_id || user.is_admin)
  const canDeleteAttachment = user && post && (user.id === post.author_id || user.is_admin)

  const handleLike = async () => {
    if (!user) {
      toast.error('Please login to like posts')
      return
    }

    try {
      const result = await communityApi.likePost(postId)
      setPost({ ...post, is_liked: result.liked, likes_count: result.likes_count })
      toast.success(result.liked ? 'Post liked!' : 'Like removed')
    } catch (error: any) {
      toast.error(error.message || 'Failed to like post')
    }
  }

  const handleEditPost = () => {
    setEditedPost({
      title: post.title,
      content: post.content,
      zone_id: post.zone_id || ''
    })
    setShowEditDialog(true)
    setShowPostMenu(false)
  }

  const handleSavePost = async () => {
    if (!editedPost.title.trim() || !editedPost.content.trim()) {
      toast.error('Please fill in all fields')
      return
    }

    if (editedPost.title.trim().length < 3) {
      toast.error('Title must be at least 3 characters')
      return
    }

    try {
      const updatedPost = await communityApi.updatePost(postId, {
        title: editedPost.title,
        content: editedPost.content,
        zone_id: editedPost.zone_id || undefined
      })
      setPost(updatedPost)
      setShowEditDialog(false)
      toast.success('Post updated successfully!')
    } catch (error: any) {
      toast.error(error.message || 'Failed to update post')
    }
  }

  const handleDeletePost = async () => {
    try {
      await communityApi.deletePost(postId)
      toast.success('Post deleted successfully!')
      router.push('/community')
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete post')
    }
  }

  const handleCommentImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const validFiles: File[] = []
    const maxSize = 10 * 1024 * 1024 // 10MB
    
    for (const file of files) {
      if (file.size > maxSize) {
        toast.error(`${file.name} is too large. Maximum size is 10MB`)
        continue
      }
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image file`)
        continue
      }
      validFiles.push(file)
    }

    if (validFiles.length === 0) return

    const remainingSlots = 5 - commentImages.length
    if (remainingSlots <= 0) {
      toast.error(t('community.maxCommentImages'))
      return
    }

    const filesToAdd = validFiles.slice(0, remainingSlots)
    const newFiles = [...commentImages, ...filesToAdd]
    setCommentImages(newFiles)

    const previewPromises = filesToAdd.map((file) => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
    })

    Promise.all(previewPromises).then((newPreviews) => {
      setCommentImagePreviews([...commentImagePreviews, ...newPreviews])
    })
  }

  const handleCommentFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const validFiles: File[] = []
    const maxSize = 10 * 1024 * 1024 // 10MB
    
    for (const file of files) {
      if (file.size > maxSize) {
        toast.error(`${file.name} is too large. Maximum size is 10MB`)
        continue
      }
      validFiles.push(file)
    }

    if (validFiles.length === 0) return

    const remainingSlots = 5 - commentFiles.length
    if (remainingSlots <= 0) {
      toast.error(t('community.maxCommentFiles'))
      return
    }

    const filesToAdd = validFiles.slice(0, remainingSlots)
    setCommentFiles([...commentFiles, ...filesToAdd])
  }

  const removeCommentImage = (index: number) => {
    setCommentImages(commentImages.filter((_, i) => i !== index))
    setCommentImagePreviews(commentImagePreviews.filter((_, i) => i !== index))
  }

  const removeCommentFile = (index: number) => {
    setCommentFiles(commentFiles.filter((_, i) => i !== index))
  }

  const handleSubmitComment = async (skipAttachments: boolean = false) => {
    if (!user) {
      toast.error('Please login to comment')
      return
    }

    if (!newComment.trim() && (skipAttachments || (commentImages.length === 0 && commentFiles.length === 0))) {
      toast.error(t('community.pleaseEnterComment'))
      return
    }

    if (!skipAttachments && !newComment.trim() && commentImages.length === 0 && commentFiles.length === 0) {
      toast.error(t('community.pleaseEnterComment'))
      return
    }

    try {
      setIsSubmitting(true)
      const result = await communityApi.createComment(postId, { content: newComment || ' ' })
      // The API returns { message: "Comment created", comment_id: "..." }
      const commentId = result.comment_id
      
      // Upload images (only if not skipping attachments)
      if (!skipAttachments && commentImages.length > 0 && commentId) {
        try {
          await Promise.all(
            commentImages.map(image => 
              communityApi.uploadCommentAttachment(postId, commentId, image)
            )
          )
        } catch (error: any) {
          console.error('Error uploading comment images:', error)
          toast.error('Comment posted but some images failed to upload')
        }
      }

      // Upload files (only if not skipping attachments)
      if (!skipAttachments && commentFiles.length > 0 && commentId) {
        try {
          await Promise.all(
            commentFiles.map(file => 
              communityApi.uploadCommentAttachment(postId, commentId, file)
            )
          )
        } catch (error: any) {
          console.error('Error uploading comment files:', error)
          toast.error('Comment posted but some attachments failed to upload')
        }
      }

      // Refresh comments
      const commentsData = await communityApi.getComments(postId)
      setComments(commentsData)
      setNewComment('')
      if (!skipAttachments) {
        setCommentImages([])
        setCommentImagePreviews([])
        setCommentFiles([])
        if (commentImageInputRef.current) commentImageInputRef.current.value = ''
        if (commentFileInputRef.current) commentFileInputRef.current.value = ''
        setShowCommentDialog(false)
      }
      toast.success(t('community.commentPosted'))
    } catch (error: any) {
      toast.error(error.message || t('community.commentFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditComment = (comment: any) => {
    setEditingCommentId(comment.id)
    setEditedCommentContent(comment.content)
  }

  const handleSaveComment = async (commentId: string) => {
    if (!editedCommentContent.trim()) {
      toast.error('Comment cannot be empty')
      return
    }

    try {
      await communityApi.updateComment(postId, commentId, { content: editedCommentContent })
      // Refresh comments
      const commentsData = await communityApi.getComments(postId)
      setComments(commentsData)
      setEditingCommentId(null)
      toast.success('Comment updated!')
    } catch (error: any) {
      toast.error(error.message || 'Failed to update comment')
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    try {
      await communityApi.deleteComment(postId, commentId)
      // Refresh comments
      const commentsData = await communityApi.getComments(postId)
      setComments(commentsData)
      setDeletingCommentId(null)
      toast.success('Comment deleted!')
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete comment')
    }
  }

  const handlePostImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const validFiles: File[] = []
    const maxSize = 10 * 1024 * 1024 // 10MB
    
    for (const file of files) {
      if (file.size > maxSize) {
        toast.error(`${file.name} is too large. Maximum size is 10MB`)
        continue
      }
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image file`)
        continue
      }
      validFiles.push(file)
    }

    if (validFiles.length === 0) return

    const remainingSlots = 10 - postImages.length
    if (remainingSlots <= 0) {
      toast.error('Maximum 10 images allowed per post')
      return
    }

    const filesToAdd = validFiles.slice(0, remainingSlots)
    const newFiles = [...postImages, ...filesToAdd]
    setPostImages(newFiles)

    const previewPromises = filesToAdd.map((file) => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
    })

    Promise.all(previewPromises).then((newPreviews) => {
      setPostImagePreviews([...postImagePreviews, ...newPreviews])
    })
  }

  const handlePostFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const validFiles: File[] = []
    const maxSize = 200 * 1024 * 1024 // 200MB
    
    for (const file of files) {
      if (file.size > maxSize) {
        toast.error(`${file.name} is too large. Maximum size is 200MB`)
        continue
      }
      validFiles.push(file)
    }

    if (validFiles.length === 0) return

    const remainingSlots = 20 - postFiles.length
    if (remainingSlots <= 0) {
      toast.error('Maximum 20 attachments allowed per post')
      return
    }

    const filesToAdd = validFiles.slice(0, remainingSlots)
    setPostFiles([...postFiles, ...filesToAdd])
  }

  const removePostImage = (index: number) => {
    setPostImages(postImages.filter((_, i) => i !== index))
    setPostImagePreviews(postImagePreviews.filter((_, i) => i !== index))
  }

  const removePostFile = (index: number) => {
    setPostFiles(postFiles.filter((_, i) => i !== index))
  }

  const handleUploadPostAttachments = async () => {
    if (postImages.length === 0 && postFiles.length === 0) {
      toast.error('Please select files to upload')
      return
    }

    try {
      setUploadingAttachments(true)
      
      // Upload images
      if (postImages.length > 0) {
        await Promise.all(
          postImages.map(image => 
            communityApi.uploadPostAttachment(postId, image)
          )
        )
      }

      // Upload files
      if (postFiles.length > 0) {
        await Promise.all(
          postFiles.map(file => 
            communityApi.uploadPostAttachment(postId, file)
          )
        )
      }

      toast.success('Attachments uploaded successfully!')
      
      // Clear uploads
      setPostImages([])
      setPostImagePreviews([])
      setPostFiles([])
      if (postImageInputRef.current) postImageInputRef.current.value = ''
      if (postFileInputRef.current) postFileInputRef.current.value = ''
      
      // Refresh post data
      const postData = await communityApi.getPost(postId)
      setPost(postData)
    } catch (error: any) {
      console.error('Error uploading attachments:', error)
      toast.error(error.message || 'Failed to upload attachments')
    } finally {
      setUploadingAttachments(false)
    }
  }

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm('Are you sure you want to delete this attachment?')) {
      return
    }

    try {
      await communityApi.deletePostAttachment(postId, attachmentId)
      toast.success('Attachment deleted successfully!')
      // Refresh post data
      const [postData, commentsData] = await Promise.all([
        communityApi.getPost(postId),
        communityApi.getComments(postId)
      ])
      setPost(postData)
      setComments(commentsData)
    } catch (error: any) {
      console.error('Error deleting attachment:', error)
      toast.error(error.message || 'Failed to delete attachment')
    }
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return t('community.justNow')
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} ${t('community.minutesAgo')}`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} ${t('community.hoursAgo')}`
    return `${Math.floor(diffInSeconds / 86400)} ${t('community.daysAgo')}`
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-white/30 border-t-white rounded-full mx-auto mb-4"></div>
          <p className="text-white/70">Loading post...</p>
        </div>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-xl mb-4">{t('community.postNotFound')}</p>
          <Button onClick={() => router.push('/community')} className="bg-white text-black hover:bg-white/90">
            {t('community.backToCommunity')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-6"
        >
          <Button
            variant="ghost"
            onClick={() => router.push('/community')}
            className="text-white hover:bg-white/10"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('community.backToCommunity')}
          </Button>
        </motion.div>

        {/* Post Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 shadow-2xl mb-6"
        >
          {/* Author Info and Actions */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-3xl shadow-lg">
              {post.author_avatar || '👤'}
            </div>
            <div className="flex-1">
              <div className="font-bold text-white text-lg">{post.author_display_name || 'Anonymous'}</div>
              <div className="text-white/60">{post.author_role || 'Member'}</div>
            </div>
            {post.trending && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30">
                <TrendingUp className="w-4 h-4 text-orange-400" />
                <span className="text-sm font-medium text-orange-400">Trending</span>
              </div>
            )}
            {canEditPost && (
              <div className="relative">
                <button
                  onClick={() => setShowPostMenu(!showPostMenu)}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>
                <AnimatePresence>
                  {showPostMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-48 backdrop-blur-xl bg-slate-800 border border-white/20 rounded-xl shadow-xl overflow-hidden z-10"
                    >
                      <button
                        onClick={handleEditPost}
                        className="w-full flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                        <span>Edit Post</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowDeleteDialog(true)
                          setShowPostMenu(false)
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete Post</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Category Badge */}
          {post.zone_name && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 mb-4">
              <span className="text-sm font-medium text-white/80">{post.zone_name}</span>
            </div>
          )}

          {/* Post Title */}
          <h1 className="text-3xl font-bold text-white mb-4">
            {post.title}
          </h1>

          {/* Post Content */}
          <div className="text-white/80 text-lg leading-relaxed mb-6 whitespace-pre-wrap">
            {post.content}
          </div>

          {/* Post Attachments */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white">Attachments</h3>
              {canDeleteAttachment && (
                <div className="flex gap-2">
                  <input
                    type="file"
                    ref={postImageInputRef}
                    onChange={handlePostImageSelect}
                    accept="image/*"
                    multiple
                    className="hidden"
                  />
                  <input
                    type="file"
                    ref={postFileInputRef}
                    onChange={handlePostFileSelect}
                    multiple
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => postImageInputRef.current?.click()}
                    disabled={postImages.length >= 10 || uploadingAttachments}
                    className="border-white/30 bg-white/5 text-white/90 hover:bg-white/20 hover:text-white text-xs"
                  >
                    <FileImage className="w-3 h-3 mr-1" />
                    {postImages.length > 0 ? `Images (${postImages.length}/10)` : 'Add Images'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => postFileInputRef.current?.click()}
                    disabled={postFiles.length >= 20 || uploadingAttachments}
                    className="border-white/30 bg-white/5 text-white/90 hover:bg-white/20 hover:text-white text-xs"
                  >
                    <File className="w-3 h-3 mr-1" />
                    {postFiles.length > 0 ? `Files (${postFiles.length}/20)` : 'Add Files'}
                  </Button>
                  {(postImages.length > 0 || postFiles.length > 0) && (
                    <Button
                      size="sm"
                      onClick={handleUploadPostAttachments}
                      disabled={uploadingAttachments}
                      className="bg-blue-500 hover:bg-blue-600 text-xs"
                    >
                      {uploadingAttachments ? 'Uploading...' : 'Upload'}
                    </Button>
                  )}
                </div>
              )}
            </div>
            
            {/* Upload Previews */}
            {(postImagePreviews.length > 0 || postFiles.length > 0) && (
              <div className="mb-3 p-3 bg-black/20 rounded-lg border border-white/10">
                <div className="text-xs text-white/60 mb-2">New attachments to upload:</div>
                <div className="flex flex-wrap gap-2">
                  {postImagePreviews.map((preview, index) => (
                    <div key={index} className="relative">
                      <div className="w-16 h-16 rounded-lg overflow-hidden border border-white/20 bg-black/20">
                        <img src={preview} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                      </div>
                      <button
                        onClick={() => removePostImage(index)}
                        className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 text-white hover:bg-red-600"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                  {postFiles.map((file, index) => {
                    const FileIcon = getFileIcon(file.type, file.name)
                    return (
                      <div key={index} className="relative">
                        <div className="w-16 h-16 rounded-lg border border-white/20 bg-black/20 flex flex-col items-center justify-center p-1">
                          <FileIcon className="w-6 h-6 text-white/60" />
                          <span className="text-[7px] text-white/40 truncate w-full text-center">
                            {file.name.split('.').pop()?.toUpperCase() || 'FILE'}
                          </span>
                        </div>
                        <button
                          onClick={() => removePostFile(index)}
                          className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 text-white hover:bg-red-600"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            
            {post.attachments && post.attachments.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {post.attachments.map((attachment: any) => {
                  const isImage = attachment.mime_type?.startsWith('image/')
                  const FileIcon = getFileIcon(attachment.mime_type, attachment.filename)
                  
                  return (
                    <div
                      key={attachment.id}
                      className="group relative rounded-xl overflow-hidden bg-black/20 border border-white/10 hover:border-white/30 transition-all"
                    >
                      <a
                        href={`/api/v1/community/attachments/${attachment.id}/download`}
                        download={attachment.filename}
                        className="block"
                      >
                        {isImage ? (
                          <div className="aspect-square w-full relative">
                            <img
                              src={`/api/v1/community/attachments/${attachment.id}/download`}
                              alt={attachment.filename}
                              className="object-cover w-full h-full"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                              <Download className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                        ) : (
                          <div className="aspect-square w-full flex flex-col items-center justify-center p-4 relative">
                            <FileIcon className="w-12 h-12 text-white/60 mb-2" />
                            <span className="text-xs text-white/40 truncate w-full text-center">
                              {attachment.filename?.split('.').pop()?.toUpperCase() || 'FILE'}
                            </span>
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                              <Download className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-xs text-white truncate">{attachment.filename}</p>
                        </div>
                      </a>
                      {canDeleteAttachment && (
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleDeleteAttachment(attachment.id)
                          }}
                          className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-600 rounded-full p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10"
                          title="Delete attachment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {(!post.attachments || post.attachments.length === 0) && !canDeleteAttachment && (
              <div className="text-center py-4 text-white/60 text-sm">
                No attachments yet
              </div>
            )}
          </div>

          {/* Engagement Stats */}
          <div className="flex items-center justify-between pt-6 border-t border-white/20">
            <div className="flex items-center gap-6">
              <button
                onClick={handleLike}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${post.is_liked
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-400/30'
                  : 'text-white/60 hover:bg-white/10'
                  }`}
              >
                <ThumbsUp className={`w-5 h-5 ${post.is_liked ? 'fill-current' : ''}`} />
                <span className="font-medium">{post.likes_count || 0}</span>
              </button>
              <div className="flex items-center gap-2 text-white/60">
                <MessageCircle className="w-5 h-5" />
                <span className="font-medium">{comments.length}</span>
              </div>
              <div className="flex items-center gap-2 text-white/60">
                <Eye className="w-5 h-5" />
                <span className="font-medium">{post.views || 0}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-white/50">
              <Clock className="w-4 h-4" />
              <span className="text-sm">{formatTimeAgo(post.created_at)}</span>
            </div>
          </div>
        </motion.div>

        {/* Comments Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 shadow-2xl"
        >
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
            <MessageCircle className="w-6 h-6" />
            {t('community.comments')} ({comments.length})
          </h2>

          {/* Fast Add Comment */}
          {user && (
            <div className="mb-8">
              <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-lg shadow-lg flex-shrink-0">
                    {user.avatar || '👤'}
                  </div>
                  <div className="flex-1">
                    <Textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder={t('community.writeComment')}
                      rows={3}
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/40 mb-3 resize-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault()
                          handleSubmitComment(true)
                        }
                      }}
                    />
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setShowCommentDialog(true)}
                        className="text-xs text-white/60 hover:text-white/80 transition-colors flex items-center gap-1"
                      >
                        <FileImage className="w-3 h-3" />
                        Add images or attachments
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/50">
                          Ctrl+Enter to post
                        </span>
                        <Button
                          onClick={() => handleSubmitComment(true)}
                          disabled={isSubmitting || !newComment.trim()}
                          className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                          size="sm"
                        >
                          <Send className="w-3 h-3 mr-1" />
                          {isSubmitting ? t('community.posting') : t('community.postComment')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Comments List */}
          <div className="space-y-4">
            {comments.length === 0 ? (
              <div className="text-center py-8 text-white/60">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 text-white/30" />
                <p>No comments yet. Be the first to comment!</p>
              </div>
            ) : (
              comments.map((comment, index) => (
                <motion.div
                  key={comment.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-lg shadow-lg flex-shrink-0">
                      👤
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold text-white">
                          {comment.user_display_name || 'Anonymous'}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-white/50">
                            {formatTimeAgo(comment.created_at)}
                          </div>
                          {canEditComment(comment) && editingCommentId !== comment.id && (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleEditComment(comment)}
                                className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeletingCommentId(comment.id)}
                                className="p-1 rounded hover:bg-red-500/10 text-white/60 hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      {editingCommentId === comment.id ? (
                        <div className="space-y-2">
                          <Textarea
                            value={editedCommentContent}
                            onChange={(e) => setEditedCommentContent(e.target.value)}
                            className="bg-white/10 border-white/20 text-white text-sm"
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleSaveComment(comment.id)}
                              className="bg-blue-500 hover:bg-blue-600"
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingCommentId(null)}
                              className="border-white/30 bg-white/5 text-white/90 hover:bg-white/20 hover:text-white"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-white/80 text-sm leading-relaxed mb-2">
                            {comment.content}
                          </p>
                          {/* Comment Attachments */}
                          {comment.attachments && comment.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {comment.attachments.map((attachment: any) => {
                                const isImage = attachment.mime_type?.startsWith('image/')
                                const FileIcon = getFileIcon(attachment.mime_type, attachment.filename)
                                const canDelete = user && (user.id === comment.user_id || user.is_admin)
                                
                                return (
                                  <div key={attachment.id} className="relative group">
                                    <a
                                      href={`/api/v1/community/attachments/${attachment.id}/download`}
                                      download={attachment.filename}
                                      className="block"
                                    >
                                      {isImage ? (
                                        <div className="w-20 h-20 rounded-lg overflow-hidden border border-white/10 bg-black/20">
                                          <img
                                            src={`/api/v1/community/attachments/${attachment.id}/download`}
                                            alt={attachment.filename}
                                            className="object-cover w-full h-full"
                                          />
                                        </div>
                                      ) : (
                                        <div className="w-20 h-20 rounded-lg border border-white/10 bg-black/20 flex flex-col items-center justify-center p-2">
                                          <FileIcon className="w-6 h-6 text-white/60" />
                                          <span className="text-[8px] text-white/40 truncate w-full text-center mt-1">
                                            {attachment.filename?.split('.').pop()?.toUpperCase() || 'FILE'}
                                          </span>
                                        </div>
                                      )}
                                    </a>
                                    {canDelete && (
                                      <button
                                        onClick={async (e) => {
                                          e.preventDefault()
                                          if (confirm('Delete this attachment?')) {
                                            try {
                                              await communityApi.deleteCommentAttachment(postId, comment.id, attachment.id)
                                              toast.success('Attachment deleted!')
                                              const commentsData = await communityApi.getComments(postId)
                                              setComments(commentsData)
                                            } catch (error: any) {
                                              toast.error(error.message || 'Failed to delete attachment')
                                            }
                                          }
                                        }}
                                        className="absolute -top-1 -right-1 bg-red-500/80 hover:bg-red-600 rounded-full p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Delete attachment"
                                      >
                                        <Trash2 className="w-2.5 h-2.5" />
                                      </button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>
      </div>

      {/* Edit Post Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-slate-900 border-white/20 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Edit Post</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium text-white/80 mb-2 block">Zone</label>
              <Select
                value={editedPost.zone_id}
                onValueChange={(value) => setEditedPost({ ...editedPost, zone_id: value })}
              >
                <SelectTrigger className="bg-white/10 border-white/20 text-white">
                  <SelectValue placeholder="Select a zone" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-white/20 text-white">
                  {zones.map((zone) => (
                    <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-white/80 mb-2 block">Title</label>
              <Input
                value={editedPost.title}
                onChange={(e) => setEditedPost({ ...editedPost, title: e.target.value })}
                className="bg-white/10 border-white/20 text-white"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-white/80 mb-2 block">Content</label>
              <Textarea
                value={editedPost.content}
                onChange={(e) => setEditedPost({ ...editedPost, content: e.target.value })}
                rows={8}
                className="bg-white/10 border-white/20 text-white"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowEditDialog(false)}
                className="border-white/30 bg-white/5 text-white/90 hover:bg-white/20 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSavePost}
                className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
              >
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Post Confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-slate-900 border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Delete Post</DialogTitle>
          </DialogHeader>
          <p className="text-white/70 my-4">
            Are you sure you want to delete this post? This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              className="border-white/30 bg-white/5 text-white/90 hover:bg-white/20 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeletePost}
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Comment Confirmation */}
      <Dialog open={!!deletingCommentId} onOpenChange={() => setDeletingCommentId(null)}>
        <DialogContent className="bg-slate-900 border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Delete Comment</DialogTitle>
          </DialogHeader>
          <p className="text-white/70 my-4">
            Are you sure you want to delete this comment? This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => setDeletingCommentId(null)}
              className="border-white/30 bg-white/5 text-white/90 hover:bg-white/20 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={() => deletingCommentId && handleDeleteComment(deletingCommentId)}
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Comment Dialog */}
      <Dialog 
        open={showCommentDialog} 
        onOpenChange={(open) => {
          setShowCommentDialog(open)
          if (!open) {
            // Reset comment state when dialog closes
            setNewComment('')
            setCommentImages([])
            setCommentImagePreviews([])
            setCommentFiles([])
            if (commentImageInputRef.current) commentImageInputRef.current.value = ''
            if (commentFileInputRef.current) commentFileInputRef.current.value = ''
          }
        }}
      >
        <DialogContent className="bg-slate-900 border-white/20 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">{t('community.addCommentTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium text-white/80 mb-2 block">Comment</label>
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Share your thoughts..."
                rows={6}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
              />
            </div>

            {/* Comment Image Upload */}
            <div>
              <label className="text-sm font-medium text-white/80 mb-2 block">
                Images (Optional, max 5)
              </label>
              <div className="space-y-3">
                <input
                  type="file"
                  ref={commentImageInputRef}
                  onChange={handleCommentImageSelect}
                  accept="image/*"
                  multiple
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => commentImageInputRef.current?.click()}
                  disabled={commentImages.length >= 5}
                  className="border-white/30 bg-white/5 text-white/90 hover:bg-white/20 hover:text-white"
                >
                  <FileImage className="w-4 h-4 mr-2" />
                  {commentImages.length > 0 ? `Add More (${commentImages.length}/5)` : 'Add Images'}
                </Button>
                {commentImagePreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {commentImagePreviews.map((preview, index) => (
                      <div key={index} className="relative">
                        <div className="w-20 h-20 rounded-lg overflow-hidden border border-white/20 bg-black/20">
                          <img src={preview} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                        </div>
                        <button
                          onClick={() => removeCommentImage(index)}
                          className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1 text-white hover:bg-red-600 shadow-lg"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Comment File Attachments Upload */}
            <div>
              <label className="text-sm font-medium text-white/80 mb-2 block">
                Attachments (Optional, max 5) - PDF, Word, Excel, ZIP, etc.
              </label>
              <div className="space-y-3">
                <input
                  type="file"
                  ref={commentFileInputRef}
                  onChange={handleCommentFileSelect}
                  multiple
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => commentFileInputRef.current?.click()}
                  disabled={commentFiles.length >= 5}
                  className="border-white/30 bg-white/5 text-white/90 hover:bg-white/20 hover:text-white"
                >
                  <File className="w-4 h-4 mr-2" />
                  {commentFiles.length > 0 ? `Add More (${commentFiles.length}/5)` : 'Add Attachments'}
                </Button>
                {commentFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {commentFiles.map((file, index) => {
                      const FileIcon = getFileIcon(file.type, file.name)
                      return (
                        <div key={index} className="relative">
                          <div className="w-20 h-20 rounded-lg border border-white/20 bg-black/20 flex flex-col items-center justify-center p-2">
                            <FileIcon className="w-8 h-8 text-white/60" />
                            <span className="text-[8px] text-white/40 truncate w-full text-center mt-1">
                              {file.name.split('.').pop()?.toUpperCase() || 'FILE'}
                            </span>
                          </div>
                          <button
                            onClick={() => removeCommentFile(index)}
                            className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1 text-white hover:bg-red-600 shadow-lg"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100 rounded-lg">
                            <span className="text-[10px] text-white/80 truncate px-1 text-center">
                              {file.name}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button
                variant="outline"
                onClick={() => setShowCommentDialog(false)}
                className="border-white/30 bg-white/5 text-white/90 hover:bg-white/20 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleSubmitComment(false)}
                disabled={isSubmitting}
                className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
              >
                <Send className="w-4 h-4 mr-2" />
                {isSubmitting ? t('community.posting') : t('community.postComment')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

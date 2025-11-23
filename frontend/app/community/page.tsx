'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import {
  Users,
  MessageSquare,
  Heart,
  Share2,
  TrendingUp,
  Award,
  Sparkles,
  ArrowRight,
  Clock,
  Eye,
  ThumbsUp,
  MessageCircle,
  Star,
  Zap,
  Target,
  Rocket,
  X,
  Layers,
  Image as ImageIcon,
  MoreVertical,
  Edit,
  Trash2,
  File,
  FileText,
  FileSpreadsheet,
  FileImage,
  Archive,
  FileCode
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/lib/auth'
import { communityApi } from '@/lib/api'
import toast from 'react-hot-toast'
import { AnimatePresence } from 'framer-motion'
import { useLanguage } from '@/lib/language'
import { TopNavBar } from '@/components/TopNavBar'
import { UniverseBackground } from '@/components/UniverseBackground'

// Helper to get icon and color for a zone
const getZoneConfig = (name: string) => {
  const configs: Record<string, { icon: any, color: string }> = {
    'Quality Management': { icon: Target, color: 'from-blue-500 to-cyan-500' },
    'Technical': { icon: Zap, color: 'from-orange-500 to-red-500' },
    'Case Study': { icon: Award, color: 'from-green-500 to-emerald-500' },
    'Innovation': { icon: Rocket, color: 'from-indigo-500 to-purple-500' },
    'Uncategorized': { icon: Layers, color: 'from-gray-500 to-slate-500' }
  }
  return configs[name] || { icon: Sparkles, color: 'from-purple-500 to-pink-500' }
}

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

export default function CommunityPage() {
  const router = useRouter()
  const { user, ready } = useAuth()
  const { t } = useLanguage()
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>('all') // 'all', 'uncategorized', or uuid
  const [hoveredPost, setHoveredPost] = useState<string | null>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [zones, setZones] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newPost, setNewPost] = useState({ title: '', content: '', type: 'sharing', zone_id: 'all' })
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)

  // Edit/Delete states
  const [showPostMenu, setShowPostMenu] = useState<string | null>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingPost, setEditingPost] = useState<any>(null)
  const [editedPost, setEditedPost] = useState({ title: '', content: '', zone_id: 'all' })

  // Fetch zones and posts
  useEffect(() => {
    if (!ready) return

    const fetchData = async () => {
      try {
        setIsLoading(true)
        const [zonesData, postsData] = await Promise.all([
          communityApi.getZones(),
          communityApi.getPosts({ limit: 50 })
        ])
        setZones(zonesData)
        setPosts(postsData)
      } catch (error) {
        console.error('Error fetching community data:', error)
        toast.error(t('community.loadFailed'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [ready])

  // Update newPost zone when dialog opens or selected zone changes
  useEffect(() => {
    if (showCreateDialog && zones.length > 0) {
      // If currently in a specific zone, use it. Otherwise default to the first zone.
      const defaultZoneId = (selectedZoneId && selectedZoneId !== 'all' && selectedZoneId !== 'uncategorized')
        ? selectedZoneId
        : zones[0].id

      setNewPost(prev => ({
        ...prev,
        zone_id: defaultZoneId
      }))

      // Reset image and file state
      setSelectedImages([])
      setImagePreviews([])
      setSelectedFiles([])
    }
  }, [showCreateDialog, selectedZoneId, zones])

  // Filter posts by category
  const filteredPosts = posts.filter(post => {
    if (selectedZoneId === 'all') return true
    if (selectedZoneId === 'uncategorized') return !post.zone_id
    return post.zone_id === selectedZoneId
  })

  // Format time ago
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return t('community.justNow')
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} ${t('community.minutesAgo')}`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} ${t('community.hoursAgo')}`
    return `${Math.floor(diffInSeconds / 86400)} ${t('community.daysAgo')}`
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // Validate all files
    const validFiles: File[] = []
    const maxSize = 10 * 1024 * 1024 // 10MB

    for (const file of files) {
      if (file.size > maxSize) {
        toast.error(`${file.name} ${t('community.fileTooLarge')} 10MB`)
        continue
      }
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} ${t('community.notImageFile')}`)
        continue
      }
      validFiles.push(file)
    }

    if (validFiles.length === 0) return

    // Limit to 10 images total
    const remainingSlots = 10 - selectedImages.length
    if (remainingSlots <= 0) {
      toast.error(t('community.maxImages'))
      return
    }

    const filesToAdd = validFiles.slice(0, remainingSlots)
    if (filesToAdd.length < validFiles.length) {
      toast.error('Maximum 10 images allowed. Some files were not added.')
    }

    const newFiles = [...selectedImages, ...filesToAdd]
    setSelectedImages(newFiles)

    // Generate previews for new files
    const previewPromises = filesToAdd.map((file) => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          resolve(reader.result as string)
        }
        reader.readAsDataURL(file)
      })
    })

    Promise.all(previewPromises).then((newPreviews) => {
      setImagePreviews([...imagePreviews, ...newPreviews])
    })
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // Validate all files
    const validFiles: File[] = []
    const maxSize = 200 * 1024 * 1024 // 200MB

    for (const file of files) {
      if (file.size > maxSize) {
        toast.error(`${file.name} ${t('community.fileTooLarge')} 200MB`)
        continue
      }
      validFiles.push(file)
    }

    if (validFiles.length === 0) return

    // Limit to 20 attachments total
    const remainingSlots = 20 - selectedFiles.length
    if (remainingSlots <= 0) {
      toast.error(t('community.maxFiles'))
      return
    }

    const filesToAdd = validFiles.slice(0, remainingSlots)
    if (filesToAdd.length < validFiles.length) {
      toast.error('Maximum 20 attachments allowed. Some files were not added.')
    }

    setSelectedFiles([...selectedFiles, ...filesToAdd])
  }

  const removeImage = (index: number) => {
    setSelectedImages(selectedImages.filter((_, i) => i !== index))
    setImagePreviews(imagePreviews.filter((_, i) => i !== index))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index))
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = ''
    }
  }

  // Check if user can edit/delete a post
  const canEditPost = (post: any) => user && (user.id === post.author_id || user.is_admin)

  // Handle edit post
  const handleEditPost = (post: any, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent navigation
    setEditingPost(post)
    setEditedPost({
      title: post.title,
      content: post.content,
      zone_id: post.zone_id || 'all'
    })
    setShowEditDialog(true)
    setShowPostMenu(null)
  }

  // Handle save edited post
  const handleSavePost = async () => {
    if (!editingPost) return

    if (!editedPost.title.trim() || !editedPost.content.trim()) {
      toast.error(t('community.pleaseEnterTitle'))
      return
    }

    if (editedPost.title.trim().length < 3) {
      toast.error(t('community.pleaseEnterTitle'))
      return
    }

    if (!editedPost.zone_id || editedPost.zone_id === 'all') {
      toast.error(t('community.selectZoneError'))
      return
    }

    try {
      await communityApi.updatePost(editingPost.id, {
        title: editedPost.title,
        content: editedPost.content,
        zone_id: editedPost.zone_id
      })
      toast.success(t('community.postUpdated'))
      setShowEditDialog(false)
      setEditingPost(null)

      // Refresh posts
      const postsData = await communityApi.getPosts({ limit: 50 })
      setPosts(postsData)
    } catch (error: any) {
      console.error('Error updating post:', error)
      toast.error(error.message || t('community.updateFailed'))
    }
  }

  // Handle delete post
  const handleDeletePost = async () => {
    if (!editingPost) return

    try {
      await communityApi.deletePost(editingPost.id)
      toast.success(t('community.postDeleted'))
      setShowDeleteDialog(false)
      setEditingPost(null)

      // Refresh posts
      const postsData = await communityApi.getPosts({ limit: 50 })
      setPosts(postsData)
    } catch (error: any) {
      console.error('Error deleting post:', error)
      toast.error(error.message || 'Failed to delete post')
    }
  }

  // Handle create post
  const handleCreatePost = async () => {
    if (!user) {
      toast.error('Please login to create a post')
      return
    }

    if (!newPost.title.trim() || !newPost.content.trim()) {
      toast.error('Please fill in all fields')
      return
    }

    if (newPost.title.trim().length < 3) {
      toast.error('Title must be at least 3 characters')
      return
    }

    if (!newPost.zone_id || newPost.zone_id === 'all') {
      toast.error('Please select a zone')
      return
    }

    try {
      const createdPost = await communityApi.createPost({
        title: newPost.title,
        content: newPost.content,
        type: newPost.type,
        zone_id: newPost.zone_id
      })

      // Upload images if selected
      if (selectedImages.length > 0) {
        try {
          await Promise.all(
            selectedImages.map(image =>
              communityApi.uploadPostAttachment(createdPost.id, image)
            )
          )
        } catch (error: any) {
          console.error('Error uploading images:', error)
          toast.error('Post created but some images failed to upload')
        }
      }

      // Upload attachments if selected
      if (selectedFiles.length > 0) {
        try {
          await Promise.all(
            selectedFiles.map(file =>
              communityApi.uploadPostAttachment(createdPost.id, file)
            )
          )
        } catch (error: any) {
          console.error('Error uploading attachments:', error)
          toast.error('Post created but some attachments failed to upload')
        }
      }

      toast.success(t('community.postCreated'))
      setShowCreateDialog(false)
      setNewPost({ title: '', content: '', type: 'sharing', zone_id: 'all' })
      setSelectedImages([])
      setImagePreviews([])
      setSelectedFiles([])

      // Refresh posts
      const postsData = await communityApi.getPosts({ limit: 50 })
      setPosts(postsData)
    } catch (error: any) {
      console.error('Error creating post:', error)
      toast.error(error.message || t('community.createFailed'))
    }
  }

  // Prepare navigation items
  const navItems = [
    { id: 'all', name: t('community.allZones'), icon: Sparkles, color: 'from-purple-500 to-pink-500' },
    ...zones.map(zone => {
      const config = getZoneConfig(zone.name)
      return { id: zone.id, name: zone.name, ...config }
    }),
    { id: 'uncategorized', name: t('community.uncategorized'), icon: Layers, color: 'from-gray-500 to-slate-500' }
  ]

  return (
    <div className="min-h-screen relative overflow-hidden">
      <UniverseBackground />
      <TopNavBar />
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-screen-2xl pt-24">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
            {/* Animated background elements */}
            <div className="absolute inset-0 overflow-hidden">
              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  rotate: [0, 90, 0],
                }}
                transition={{ duration: 20, repeat: Infinity }}
                className="absolute -top-20 -right-20 w-64 h-64 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-3xl"
              />
              <motion.div
                animate={{
                  scale: [1.2, 1, 1.2],
                  rotate: [90, 0, 90],
                }}
                transition={{ duration: 15, repeat: Infinity }}
                className="absolute -bottom-20 -left-20 w-64 h-64 bg-gradient-to-br from-pink-500/20 to-orange-500/20 rounded-full blur-3xl"
              />
            </div>

            <div className="relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg">
                  <Users className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold text-white mb-2">
                    {t('community.title')}
                  </h1>
                  <p className="text-white/70 text-lg">
                    {t('community.subtitle')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Zone Navigation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {navItems.map((item) => {
              const Icon = item.icon
              const isSelected = selectedZoneId === item.id
              return (
                <motion.button
                  key={item.id}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedZoneId(item.id)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-2xl transition-all whitespace-nowrap ${isSelected
                    ? 'bg-white text-black shadow-lg'
                    : 'backdrop-blur-md bg-white/10 border border-white/20 text-white hover:bg-white/20'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-medium">{item.name}</span>
                </motion.button>
              )
            })}
          </div>
        </motion.div>

        {/* Create Post Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="w-full md:w-auto bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white rounded-2xl px-8 py-6 text-lg shadow-xl"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            {t('community.startDiscussion')}
          </Button>
        </motion.div>

        {/* Posts Grid */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-12 h-12 border-4 border-white/30 border-t-white rounded-full mx-auto mb-4"></div>
            <p className="text-white/70">{t('community.loading')}</p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-12 text-center">
            <MessageSquare className="w-16 h-16 mx-auto mb-4 text-white/30" />
            <p className="text-white text-lg mb-2">No posts yet</p>
            <p className="text-white/60">Be the first to start a discussion in this zone!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredPosts.map((post, index) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onMouseEnter={() => setHoveredPost(post.id)}
                onMouseLeave={() => setHoveredPost(null)}
                onClick={() => router.push(`/community/${post.id}`)}
                className="group cursor-pointer"
              >
                <div className={`backdrop-blur-xl border rounded-3xl p-6 transition-all duration-300 h-full ${hoveredPost === post.id
                  ? 'bg-white/15 border-white/30 shadow-2xl scale-[1.02]'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}>
                  {/* Author Info */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-2xl shadow-lg">
                      {post.author_avatar || '👤'}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-white">{post.author_display_name || 'Anonymous'}</div>
                      <div className="text-sm text-white/60">{post.author_role || 'Member'}</div>
                    </div>
                    {post.trending && (
                      <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30">
                        <TrendingUp className="w-3 h-3 text-orange-400" />
                        <span className="text-xs font-medium text-orange-400">Trending</span>
                      </div>
                    )}
                    {canEditPost(post) && (
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowPostMenu(showPostMenu === post.id ? null : post.id)
                          }}
                          className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        <AnimatePresence>
                          {showPostMenu === post.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 mt-2 w-40 backdrop-blur-xl bg-slate-800 border border-white/20 rounded-xl shadow-xl overflow-hidden z-10"
                            >
                              <button
                                onClick={(e) => handleEditPost(post, e)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 transition-colors"
                              >
                                <Edit className="w-4 h-4" />
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingPost(post)
                                  setShowDeleteDialog(true)
                                  setShowPostMenu(null)
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span>{t('community.delete')}</span>
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>

                  {/* Category Badge */}
                  {post.zone_name && (
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 mb-3">
                      <span className="text-xs font-medium text-white/80">{post.zone_name}</span>
                    </div>
                  )}

                  {/* Post Content */}
                  <h3 className="text-xl font-bold text-white mb-2 line-clamp-2">
                    {post.title}
                  </h3>
                  <p className="text-white/70 mb-4 line-clamp-2">
                    {post.content}
                  </p>

                  {/* Post Attachments - Thumbnails in a row */}
                  {post.attachments && post.attachments.length > 0 && (
                    <div className="mb-4 flex gap-2 overflow-x-auto scrollbar-hide">
                      {post.attachments.slice(0, 5).map((attachment: any) => {
                        const isImage = attachment.mime_type?.startsWith('image/')
                        const FileIcon = getFileIcon(attachment.mime_type, attachment.filename)

                        return (
                          <div
                            key={attachment.id}
                            className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-black/20 border border-white/10 relative group"
                          >
                            {isImage ? (
                              <img
                                src={`/api/v1/community/attachments/${attachment.id}/download`}
                                alt="Post attachment"
                                className="object-cover w-full h-full"
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center p-2">
                                <FileIcon className="w-8 h-8 text-white/60" />
                                <span className="text-[8px] text-white/40 truncate w-full text-center mt-1">
                                  {attachment.filename?.split('.').pop()?.toUpperCase() || 'FILE'}
                                </span>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <span className="text-[10px] text-white/80 truncate px-1 text-center">
                                {attachment.filename}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                      {post.attachments.length > 5 && (
                        <div className="flex-shrink-0 w-20 h-20 rounded-lg bg-black/20 border border-white/10 flex items-center justify-center text-white/60 text-xs">
                          +{post.attachments.length - 5}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Engagement Stats */}
                  <div className="flex items-center justify-between pt-4 border-t border-white/10">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1 text-white/60">
                        <ThumbsUp className="w-4 h-4" />
                        <span className="text-sm">{post.likes_count || 0}</span>
                      </div>
                      <div className="flex items-center gap-1 text-white/60">
                        <MessageCircle className="w-4 h-4" />
                        <span className="text-sm">{post.comments_count || 0}</span>
                      </div>
                      <div className="flex items-center gap-1 text-white/60">
                        <Eye className="w-4 h-4" />
                        <span className="text-sm">{post.views || 0}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-white/50 text-sm">
                      <Clock className="w-4 h-4" />
                      {formatTimeAgo(post.created_at)}
                    </div>
                  </div>

                  {/* Hover Action */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: hoveredPost === post.id ? 1 : 0 }}
                    className="mt-4 pt-4 border-t border-white/10"
                  >
                    <Button
                      variant="ghost"
                      className="w-full text-white hover:bg-white/10 rounded-xl"
                    >
                      Read More
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </motion.div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create Post Dialog */}
      <Dialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open)
          if (!open) {
            // Reset image and file state when dialog closes
            setSelectedImages([])
            setImagePreviews([])
            setSelectedFiles([])
            if (fileInputRef.current) {
              fileInputRef.current.value = ''
            }
            if (attachmentInputRef.current) {
              attachmentInputRef.current.value = ''
            }
          }
        }}
      >
        <DialogContent className="bg-slate-900 border-white/20 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">{t('community.startDiscussion')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium text-white/80 mb-2 block">Zone</label>
              <Select
                value={newPost.zone_id}
                onValueChange={(value) => setNewPost({ ...newPost, zone_id: value })}
              >
                <SelectTrigger className="bg-white/10 border-white/20 text-white">
                  <SelectValue placeholder={t('community.selectZone')} />
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
                value={newPost.title}
                onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                placeholder="Enter post title..."
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-white/80 mb-2 block">{t('community.postContent')}</label>
              <Textarea
                value={newPost.content}
                onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                placeholder="Share your thoughts..."
                rows={6}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
              />
            </div>

            {/* Image Upload */}
            <div>
              <label className="text-sm font-medium text-white/80 mb-2 block">
                Images (Optional, max 10)
              </label>
              <div className="space-y-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageSelect}
                  accept="image/*"
                  multiple
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={selectedImages.length >= 10}
                  className="border-white/30 bg-white/5 text-white/90 hover:bg-white/20 hover:text-white"
                >
                  <ImageIcon className="w-4 h-4 mr-2" />
                  {selectedImages.length > 0 ? `${t('community.addMore')} (${selectedImages.length}/10)` : t('community.addImages')}
                </Button>
                {imagePreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {imagePreviews.map((preview, index) => (
                      <div key={index} className="relative">
                        <div className="w-20 h-20 rounded-lg overflow-hidden border border-white/20 bg-black/20">
                          <img src={preview} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                        </div>
                        <button
                          onClick={() => removeImage(index)}
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

            {/* File Attachments Upload */}
            <div>
              <label className="text-sm font-medium text-white/80 mb-2 block">
                Attachments (Optional, max 20) - PDF, Word, Excel, ZIP, etc.
              </label>
              <div className="space-y-3">
                <input
                  type="file"
                  ref={attachmentInputRef}
                  onChange={handleFileSelect}
                  multiple
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={selectedFiles.length >= 20}
                  className="border-white/30 bg-white/5 text-white/90 hover:bg-white/20 hover:text-white"
                >
                  <File className="w-4 h-4 mr-2" />
                  {selectedFiles.length > 0 ? `${t('community.addMore')} (${selectedFiles.length}/20)` : t('community.addAttachments')}
                </Button>
                {selectedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedFiles.map((file, index) => {
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
                            onClick={() => removeFile(index)}
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

            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
                className="border-white/30 bg-white/5 text-white/90 hover:bg-white/20 hover:text-white"
              >
                {t('community.cancel')}
              </Button>
              <Button
                onClick={handleCreatePost}
                className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Post
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Post Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-slate-900 border-white/20 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">{t('community.editPost')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium text-white/80 mb-2 block">Zone</label>
              <Select
                value={editedPost.zone_id}
                onValueChange={(value) => setEditedPost({ ...editedPost, zone_id: value })}
              >
                <SelectTrigger className="bg-white/10 border-white/20 text-white">
                  <SelectValue placeholder={t('community.selectZone')} />
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
                placeholder="Enter post title..."
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-white/80 mb-2 block">{t('community.postContent')}</label>
              <Textarea
                value={editedPost.content}
                onChange={(e) => setEditedPost({ ...editedPost, content: e.target.value })}
                placeholder="Share your thoughts..."
                rows={6}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowEditDialog(false)
                  setEditingPost(null)
                }}
                className="border-white/30 bg-white/5 text-white/90 hover:bg-white/20 hover:text-white"
              >
                {t('community.cancel')}
              </Button>
              <Button
                onClick={handleSavePost}
                className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
              >
                <Edit className="w-4 h-4 mr-2" />
                {t('community.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Post Confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-slate-900 border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">{t('community.deletePost')}</DialogTitle>
          </DialogHeader>
          <p className="text-white/70 my-4">
            {t('community.deleteConfirm')}
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false)
                setEditingPost(null)
              }}
              className="border-white/30 bg-white/5 text-white/90 hover:bg-white/20 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeletePost}
              className="bg-red-500 hover:bg-red-600"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t('community.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

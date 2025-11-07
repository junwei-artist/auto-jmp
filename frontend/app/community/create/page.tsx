"use client"
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { X, Upload, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth'

type Zone = {
  id: string
  name: string
  icon?: string
  color?: string
}

type Attachment = {
  id: string
  filename: string
  mime_type: string
}

export default function CreatePostPage() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [type, setType] = useState('sharing')
  const [zoneId, setZoneId] = useState<string>('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [zones, setZones] = useState<Zone[]>([])
  const router = useRouter()
  const { ready, user } = useAuth()

  const getAuthToken = () => {
    if (typeof window !== 'undefined') return localStorage.getItem('access_token')
    return null
  }

  useEffect(() => {
    if (!ready) return
    if (!user) {
      router.push('/community')
      return
    }
    
    const fetchZones = async () => {
      try {
        const res = await fetch('/api/v1/community/zones?active_only=true', {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
          credentials: 'include',
        })
        if (res.ok) {
          const data = await res.json()
          setZones(data)
        }
      } catch (error) {
        console.error('Error fetching zones:', error)
      }
    }
    fetchZones()
  }, [ready, user, router])

  const addTag = () => {
    const tag = tagInput.trim()
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag])
      setTagInput('')
    }
  }

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove))
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed')
      return
    }

    setUploading(true)
    try {
      // We'll upload after post creation, store file for now
      const formData = new FormData()
      formData.append('file', file)
      
      // Store file temporarily
      const reader = new FileReader()
      reader.onload = () => {
        const tempAttachment = {
          id: `temp-${Date.now()}`,
          filename: file.name,
          mime_type: file.type,
          file: file,
        }
        setAttachments([...attachments, tempAttachment as any])
      }
      reader.readAsDataURL(file)
    } catch (error) {
      toast.error('Failed to prepare file')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const removeAttachment = (id: string) => {
    setAttachments(attachments.filter(a => a.id !== id))
  }

  const submit = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('Title and content are required')
      return
    }

    try {
      // Create post
      const res = await fetch('/api/v1/community/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          title,
          content,
          type,
          zone_id: zoneId || null,
          tags: tags.length > 0 ? tags : null,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.detail || 'Failed to create post')
      }

      const data = await res.json()

      // Upload attachments
      if (attachments.length > 0) {
        for (const att of attachments) {
          if ((att as any).file) {
            const formData = new FormData()
            formData.append('file', (att as any).file)
            
            const uploadRes = await fetch(`/api/v1/community/posts/${data.id}/attachments`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${getAuthToken()}`,
              },
              body: formData,
            })

            if (!uploadRes.ok) {
              console.error('Failed to upload attachment:', att.filename)
            }
          }
        }
      }

      toast.success('Post created successfully')
      router.push(`/community/${data.id}`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to create post')
    }
  }

  if (!ready || !user) {
    return <div className="max-w-2xl mx-auto p-4">Loading...</div>
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Create Post</h1>
        <p className="text-gray-600 mt-1">Share your knowledge with the community</p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Enter post title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="zone">Zone (Optional)</Label>
            <Select value={zoneId || "none"} onValueChange={(val) => setZoneId(val === "none" ? "" : val)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {zones.map(zone => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {zone.icon && <span className="mr-2">{zone.icon}</span>}
                    {zone.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type *</Label>
            <Select value={type} onValueChange={setType}>
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

          <div className="space-y-2">
            <Label htmlFor="content">Content *</Label>
            <Textarea
              id="content"
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={12}
              placeholder="Write your post content here. Markdown is supported."
            />
            <p className="text-xs text-gray-500">You can use markdown formatting</p>
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyPress={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTag()
                  }
                }}
                placeholder="Add a tag and press Enter"
              />
              <Button type="button" onClick={addTag} variant="outline">Add</Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                    #{tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="ml-1 hover:text-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Images (Optional)</Label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                disabled={uploading}
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center justify-center space-y-2"
              >
                <ImageIcon className="w-8 h-8 text-gray-400" />
                <span className="text-sm text-gray-600">
                  {uploading ? 'Uploading...' : 'Click to upload images'}
                </span>
              </label>
            </div>
            {attachments.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                {attachments.map(att => (
                  <div key={att.id} className="relative border rounded p-2">
                    <img
                      src={(att as any).file ? URL.createObjectURL((att as any).file) : ''}
                      alt={att.filename}
                      className="w-full h-24 object-cover rounded"
                    />
                    <button
                      onClick={() => removeAttachment(att.id)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <p className="text-xs text-gray-600 mt-1 truncate">{att.filename}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={submit} disabled={uploading}>
              Publish Post
            </Button>
            <Button variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

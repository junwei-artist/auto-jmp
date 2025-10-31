"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export default function CreatePostPage() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [type, setType] = useState('sharing')
  const router = useRouter()

  const getAuthToken = () => {
    if (typeof window !== 'undefined') return localStorage.getItem('access_token')
    return null
  }

  const submit = async () => {
    const res = await fetch('/api/v1/community/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthToken()}`,
      },
      credentials: 'include',
      body: JSON.stringify({ title, content, type }),
    })
    if (res.ok) {
      const data = await res.json()
      router.push(`/community/${data.id}`)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-semibold">Create Post</h1>
      <div className="space-y-2">
        <label className="block text-sm">Title</label>
        <Input value={title} onChange={e => setTitle(e.target.value)} />
      </div>
      <div className="space-y-2">
        <label className="block text-sm">Type</label>
        <select className="border rounded px-3 py-2" value={type} onChange={e => setType(e.target.value)}>
          <option value="question">Question</option>
          <option value="tutorial">Tutorial</option>
          <option value="manual">Manual</option>
          <option value="sharing">Sharing</option>
          <option value="tip">Tip</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="space-y-2">
        <label className="block text-sm">Content</label>
        <Textarea value={content} onChange={e => setContent(e.target.value)} rows={10} />
      </div>
      <Button onClick={submit}>Publish</Button>
    </div>
  )
}



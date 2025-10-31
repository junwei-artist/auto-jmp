"use client"
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import CommunityComments from '@/components/CommunityComments'

type Post = {
  id: string
  title: string
  content: string
  type: string
  author_display_name?: string
  created_at: string
  views: number
}

export default function PostDetailPage() {
  const params = useParams()
  const id = params?.id as string
  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)

  const getAuthToken = () => {
    if (typeof window !== 'undefined') return localStorage.getItem('access_token')
    return null
  }

  useEffect(() => {
    if (!id) return
    const run = async () => {
      try {
        const res = await fetch(`/api/v1/community/posts/${id}`, {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
          credentials: 'include',
        })
        if (!res.ok) return
        const data = await res.json()
        setPost(data)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [id])

  if (loading) return <div>Loading...</div>
  if (!post) return <div>Post not found</div>

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <div>
        <div className="text-sm text-gray-500">{post.type.toUpperCase()} • {post.author_display_name || 'User'} • {new Date(post.created_at).toLocaleString()} • {post.views} views</div>
        <h1 className="text-2xl font-semibold mt-1">{post.title}</h1>
        <div className="prose mt-4 whitespace-pre-wrap">{post.content}</div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-2">Discussion</h2>
        <CommunityComments postId={post.id} />
      </div>
    </div>
  )
}



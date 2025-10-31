"use client"
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

type Post = {
  id: string
  title: string
  type: string
  author_display_name?: string
  created_at: string
  views: number
}

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const { ready } = useAuth()

  const getAuthToken = () => {
    if (typeof window !== 'undefined') return localStorage.getItem('access_token')
    return null
  }

  useEffect(() => {
    if (!ready) return
    const run = async () => {
      try {
        const res = await fetch('/api/v1/community/posts', {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
          credentials: 'include',
        })
        const data = await res.json()
        setPosts(data)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [ready])

  if (loading) return <div>Loading...</div>

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Community</h1>
        <Link href="/community/create"><Button>Create Post</Button></Link>
      </div>
      <div className="space-y-3">
        {posts.map(p => (
          <Link key={p.id} href={`/community/${p.id}`} className="block border rounded p-3 hover:bg-gray-50">
            <div className="text-sm text-gray-500">{p.type.toUpperCase()} • {p.author_display_name || 'User'} • {new Date(p.created_at).toLocaleString()} • {p.views} views</div>
            <div className="text-lg mt-1">{p.title}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}



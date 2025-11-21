"use client"
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/language'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

interface CommunityComment {
  id: string
  user_id?: string
  user_display_name?: string
  parent_id?: string | null
  content: string
  created_at: string
  updated_at: string
  replies: CommunityComment[]
}

interface Props {
  postId: string
}

export default function CommunityComments({ postId }: Props) {
  const [comments, setComments] = useState<CommunityComment[]>([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const { ready, user } = useAuth()
  const { t } = useLanguage()

  const getAuthToken = () => {
    if (typeof window !== 'undefined') return localStorage.getItem('access_token')
    return null
  }

  const fetchComments = async () => {
    try {
      const res = await fetch(`/api/v1/community/posts/${postId}/comments`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to load comments')
      const data = await res.json()
      setComments(data)
    } catch (e) {
      console.error(e)
      toast.error(t('comments.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!ready) return
    fetchComments()
  }, [ready, postId])

  const addComment = async () => {
    if (!newComment.trim()) return
    try {
      const res = await fetch(`/api/v1/community/posts/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        credentials: 'include',
        body: JSON.stringify({ content: newComment }),
      })
      if (!res.ok) throw new Error('Failed to add comment')
      setNewComment('')
      fetchComments()
    } catch (e) {
      console.error(e)
      toast.error(t('comments.addFailed'))
    }
  }

  const addReply = async (parentId: string) => {
    if (!replyText.trim()) return
    try {
      const res = await fetch(`/api/v1/community/posts/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        credentials: 'include',
        body: JSON.stringify({ content: replyText, parent_id: parentId }),
      })
      if (!res.ok) throw new Error('Failed to add reply')
      setReplyText('')
      setReplyTo(null)
      fetchComments()
    } catch (e) {
      console.error(e)
      toast.error(t('comments.addFailed'))
    }
  }

  if (loading) return <div>{t('loading')}</div>

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea value={newComment} onChange={e => setNewComment(e.target.value)} placeholder={t('comments.placeholder') as string} />
        <Button onClick={addComment}>{t('comments.add')}</Button>
      </div>

      <div className="space-y-6">
        {comments.map(c => (
          <div key={c.id} className="border rounded p-3">
            <div className="text-sm text-gray-500">{c.user_display_name || 'User'} • {new Date(c.created_at).toLocaleString()}</div>
            <div className="mt-2 whitespace-pre-wrap">{c.content}</div>
            <div className="mt-2">
              {replyTo === c.id ? (
                <div className="space-y-2">
                  <Textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder={t('comments.replyPlaceholder') as string} />
                  <div className="flex gap-2">
                    <Button onClick={() => addReply(c.id)}>{t('comments.reply')}</Button>
                    <Button variant="secondary" onClick={() => { setReplyTo(null); setReplyText('') }}>{t('cancel')}</Button>
                  </div>
                </div>
              ) : (
                <Button variant="ghost" onClick={() => setReplyTo(c.id)}>{t('comments.reply')}</Button>
              )}
            </div>

            {c.replies?.length > 0 && (
              <div className="mt-3 pl-4 border-l space-y-3">
                {c.replies.map(r => (
                  <div key={r.id} className="">
                    <div className="text-sm text-gray-500">{r.user_display_name || 'User'} • {new Date(r.created_at).toLocaleString()}</div>
                    <div className="mt-2 whitespace-pre-wrap">{r.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}



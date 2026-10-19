import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Post, Comment } from '@/types/post'
import { PostCard } from '@/components/posts/PostCard'
import { Send, Trash2 } from 'lucide-react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useToast } from '@/components/common/Toast'
import { useAuth } from '@/context/AuthContext'

dayjs.extend(relativeTime)

export function PostPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [post, setPost] = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [content, setContent] = useState('')
  const toast = useToast()

  const load = async () => {
    if (!id) return
    const p = await api<any>(`/posts/${id}`)
    setPost(p.post)
    const c = await api<any>(`/posts/${id}/comments`)
    setComments(c.comments)
  }

  useEffect(() => {
    load()
  }, [id])

  const addComment = async () => {
    if (!id || !content.trim()) return
    try {
      const data = await api<any>(`/posts/${id}/comments`, { method: 'POST', body: JSON.stringify({ content }) })
      setComments((prev) => [...prev, data.comment])
      setContent('')
    } catch (err: any) {
      toast.push({ title: 'Failed', description: err.message, type: 'error' })
    }
  }

  const removeComment = async (commentId: number) => {
    if (!id) return
    try {
      await api<any>(`/posts/${id}/comments/${commentId}`, { method: 'DELETE' })
      setComments((prev) => prev.filter((c) => c.id !== commentId))
      setPost((p) => (p ? { ...p, comments: Math.max(0, p.comments - 1) } : p))
    } catch (err: any) {
      toast.push({ title: 'Could not delete comment', description: err.message, type: 'error' })
    }
  }

  if (!post) return null

  return (
    <div className="flex flex-col gap-4">
      <PostCard item={{ kind: 'post', post, sharedBy: null, shareNote: '', sharedAt: null }} />
      <div className="surface p-4 md:p-6">
        <div className="flex flex-col gap-3">
          {comments.map((c) => {
            const canDelete = c.author.id === user?.id || post.author.id === user?.id
            return (
              <div key={c.id} className="flex gap-3">
                <Link to={`/profile/${c.author.username}`}>
                  <img
                    src={c.author.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.author.username}`}
                    alt={c.author.displayName}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                </Link>
                <div className="flex-1 rounded-2xl bg-slate-100/80 p-3 text-sm dark:bg-slate-800/80">
                  <div className="flex items-center justify-between gap-2">
                    <Link to={`/profile/${c.author.username}`} className="font-semibold">
                      {c.author.displayName}
                    </Link>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400">{dayjs(c.createdAt).fromNow()}</span>
                      {canDelete && (
                        <button
                          className="text-slate-400 transition hover:text-rose-500"
                          title="Delete comment"
                          onClick={() => removeComment(c.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{c.content}</p>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-4 flex gap-2">
          <input
            className="flex-1 rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
            placeholder="Add a comment..."
            aria-label="Add a comment"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addComment()}
          />
          <button className="btn-primary" onClick={addComment} aria-label="Post comment">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

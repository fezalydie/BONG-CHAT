import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Post, Comment } from '@/types/post'
import { PostCard } from '@/components/posts/PostCard'
import { Heart, Send, Trash2, Loader2 } from 'lucide-react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useToast } from '@/components/common/Toast'
import { LinkifiedText } from '@/components/common/LinkifiedText'
import { useAuth } from '@/context/AuthContext'

dayjs.extend(relativeTime)

export function PostPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [post, setPost] = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const [editing, setEditing] = useState(searchParams.get('edit') === '1')
  const [editContent, setEditContent] = useState('')
  const [editImage, setEditImage] = useState('')
  const [editVideo, setEditVideo] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const load = async () => {
    if (!id) return
    setLoading(true)
    try {
      const p = await api<any>(`/posts/${id}`)
      setPost(p.post)
      setEditContent(p.post.content || '')
      setEditImage(p.post.imageUrl || '')
      setEditVideo(p.post.videoUrl || '')
      setError(null)
      const c = await api<any>(`/posts/${id}/comments`)
      setComments(c.comments)
    } catch (err: any) {
      // A deleted or private post used to leave the page permanently blank.
      setPost(null)
      setError(err?.message || 'Could not load this post.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const addComment = async () => {
    if (!id || !content.trim()) return
    try {
      const data = await api<any>(`/posts/${id}/comments`, { method: 'POST', body: JSON.stringify({ content }) })
      setComments((prev) => [...prev, data.comment])
      // Keep the counter on the card in sync with the thread below it.
      setPost((p) => (p ? { ...p, comments: p.comments + 1 } : p))
      setContent('')
    } catch (err: any) {
      toast.push({ title: 'Failed', description: err.message, type: 'error' })
    }
  }

  const saveEdit = async () => {
    if (!id || !post) return
    setSavingEdit(true)
    try {
      const data = await api<any>(`/posts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ content: editContent, imageUrl: editImage, videoUrl: editVideo }),
      })
      setPost(data.post)
      setEditing(false)
      const sp = new URLSearchParams(searchParams)
      sp.delete('edit')
      setSearchParams(sp, { replace: true })
      toast.push({ title: 'Post updated', type: 'success' })
    } catch (err: any) {
      toast.push({ title: 'Could not update post', description: err.message, type: 'error' })
    } finally {
      setSavingEdit(false)
    }
  }

  const toggleCommentLike = async (commentId: number) => {
    if (!id) return
    setComments((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c
        const liked = !c.likedByMe
        return { ...c, likedByMe: liked, likes: liked ? c.likes + 1 : Math.max(0, c.likes - 1) }
      }),
    )
    try {
      const data = await api<any>(`/posts/${id}/comments/${commentId}/like`, { method: 'POST' })
      setComments((prev) =>
        prev.map((c) => (c.id !== commentId ? c : { ...c, likes: data.likes, likedByMe: data.likedByMe })),
      )
    } catch (err: any) {
      setComments((prev) =>
        prev.map((c) => {
          if (c.id !== commentId) return c
          const liked = !c.likedByMe
          return { ...c, likedByMe: !liked, likes: liked ? Math.max(0, c.likes - 1) : c.likes + 1 }
        }),
      )
      toast.push({ title: 'Could not like comment', description: err.message, type: 'error' })
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="surface flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">{error || 'This post is no longer available.'}</p>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => void load()}>
            Try again
          </button>
          <Link className="btn-ghost" to="/">
            Back to feed
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {editing && post.author.id === user?.id ? (
        <div className="surface flex flex-col gap-3 p-4 md:p-6">
          <div className="text-sm font-semibold">Edit post</div>
          <textarea
            className="min-h-[120px] rounded-2xl border border-slate-200 bg-white/90 p-3 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
          />
          <div className="grid gap-2 md:grid-cols-2">
            <input
              className="rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
              placeholder="Image URL"
              value={editImage}
              onChange={(e) => { setEditImage(e.target.value); if (e.target.value) setEditVideo(''); }}
            />
            <input
              className="rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
              placeholder="Video URL"
              value={editVideo}
              onChange={(e) => { setEditVideo(e.target.value); if (e.target.value) setEditImage(''); }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => { setEditing(false); const sp = new URLSearchParams(searchParams); sp.delete('edit'); setSearchParams(sp, { replace: true }); }}>Cancel</button>
            <button
              className="btn-primary"
              onClick={saveEdit}
              disabled={savingEdit || (!editContent.trim() && !editImage.trim() && !editVideo.trim())}
            >
              {savingEdit ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <PostCard
          item={{ kind: 'post', post, sharedBy: null, shareNote: '', sharedAt: null }}
          onDeleted={() => navigate('/', { replace: true })}
        />
      )}
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
                  <p className="mt-1 whitespace-pre-wrap break-words">
                    <LinkifiedText text={c.content} />
                  </p>
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

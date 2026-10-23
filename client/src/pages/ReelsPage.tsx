import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import {
  Eye,
  Film,
  Heart,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { api, apiForm } from '@/lib/api'
import type { Reel, ReelComment } from '@/types/reel'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/common/Toast'
import { Modal } from '@/components/common/Modal'
import { cn } from '@/utils/cn'

dayjs.extend(relativeTime)

function Avatar({ reel, className }: { reel: Reel; className?: string }) {
  return (
    <img
      src={reel.author.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${reel.author.username}`}
      alt={reel.author.displayName}
      className={cn('rounded-full object-cover', className)}
    />
  )
}

interface ReelCardProps {
  reel: Reel
  isMine: boolean
  onLike: (reel: Reel) => void
  onComments: (reel: Reel) => void
  onDelete: (reel: Reel) => void
  onView: (id: number) => void
}

function ReelCard({ reel, isMine, onLike, onComments, onDelete, onView }: ReelCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [muted, setMuted] = useState(true)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    // Play only the reel that fills the viewport; pause everything else so the
    // page never has two soundtracks running at once.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            void video.play().catch(() => undefined)
            onView(reel.id)
          } else {
            video.pause()
          }
        }
      },
      { threshold: [0, 0.6, 1] },
    )
    observer.observe(video)
    return () => observer.disconnect()
  }, [reel.id, onView])

  return (
    <article className="relative h-full w-full overflow-hidden rounded-3xl bg-black shadow-xl">
      <video
        ref={videoRef}
        src={reel.videoUrl}
        className="absolute inset-0 h-full w-full object-contain"
        loop
        playsInline
        muted={muted}
        preload="metadata"
        onClick={(event) => {
          const video = event.currentTarget
          if (video.paused) void video.play().catch(() => undefined)
          else video.pause()
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

      <div className="absolute left-4 top-4 flex items-center gap-3">
        <Link to={`/profile/${reel.author.username}`} className="flex items-center gap-3 text-white">
          <Avatar reel={reel} className="h-10 w-10 border border-white/60" />
          <div className="leading-tight">
            <div className="text-sm font-semibold drop-shadow">{reel.author.displayName}</div>
            <div className="text-xs text-white/80">@{reel.author.username}</div>
          </div>
        </Link>
      </div>

      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-4 text-white">
        <button
          className="flex flex-col items-center gap-1 transition hover:scale-105"
          onClick={() => onLike(reel)}
          aria-label={reel.likedByMe ? 'Unlike reel' : 'Like reel'}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 backdrop-blur">
            <Heart className={cn('h-5 w-5', reel.likedByMe && 'fill-rose-500 text-rose-500')} />
          </span>
          <span className="text-xs font-semibold">{reel.likes}</span>
        </button>

        <button
          className="flex flex-col items-center gap-1 transition hover:scale-105"
          onClick={() => onComments(reel)}
          aria-label="Open comments"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 backdrop-blur">
            <MessageCircle className="h-5 w-5" />
          </span>
          <span className="text-xs font-semibold">{reel.comments}</span>
        </button>

        <div className="flex flex-col items-center gap-1 text-white/90">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 backdrop-blur">
            <Eye className="h-5 w-5" />
          </span>
          <span className="text-xs font-semibold">{reel.views}</span>
        </div>

        <button
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 backdrop-blur transition hover:scale-105"
          onClick={() => setMuted((value) => !value)}
          aria-label={muted ? 'Unmute reel' : 'Mute reel'}
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>

        {isMine && (
          <button
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-rose-300 backdrop-blur transition hover:scale-105"
            onClick={() => onDelete(reel)}
            aria-label="Delete reel"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4 pr-20 text-white">
        {reel.caption && <p className="text-sm font-medium leading-snug drop-shadow">{reel.caption}</p>}
        <p className="mt-2 text-xs text-white/70">{dayjs(reel.createdAt).fromNow()}</p>
      </div>
    </article>
  )
}

export function ReelsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const filterUser = searchParams.get('username')

  const [reels, setReels] = useState<Reel[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const viewed = useRef(new Set<number>())
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const [commentsFor, setCommentsFor] = useState<Reel | null>(null)
  const [comments, setComments] = useState<ReelComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [postingComment, setPostingComment] = useState(false)

  const load = async (reset = false) => {
    const p = reset ? 0 : page
    if (reset) setLoading(true)
    else setLoadingMore(true)
    try {
      const data = await api<{ items: Reel[]; hasMore: boolean }>(
        `/reels?page=${p}${filterUser ? `&username=${encodeURIComponent(filterUser)}` : ''}`,
      )
      setReels((prev) => {
        if (reset) return data.items
        // Deduplicate: a reel published between two page loads shifts the
        // offset, so the same item can otherwise arrive twice.
        const seen = new Set(prev.map((reel) => reel.id))
        return [...prev, ...data.items.filter((reel) => !seen.has(reel.id))]
      })
      setHasMore(data.hasMore)
      setPage(reset ? 1 : p + 1)
      setError(null)
    } catch (err: any) {
      setError(err?.message || 'Could not load reels.')
      setHasMore(false)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    // Reset pagination and view tracking when switching between the global feed
    // and one author's reels.
    viewed.current = new Set()
    setReels([])
    void load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterUser])

  useEffect(() => {
    // Arrow keys (and j/k) move one reel at a time, like a presentation.
    const onKey = (event: KeyboardEvent) => {
      if (commentsFor || showCreate) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      const scroller = scrollerRef.current
      if (!scroller) return
      if (event.key === 'ArrowDown' || event.key === 'j') {
        event.preventDefault()
        scroller.scrollBy({ top: scroller.clientHeight, behavior: 'smooth' })
      } else if (event.key === 'ArrowUp' || event.key === 'k') {
        event.preventDefault()
        scroller.scrollBy({ top: -scroller.clientHeight, behavior: 'smooth' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commentsFor, showCreate])

  const registerView = useCallback((id: number) => {
    if (viewed.current.has(id)) return
    viewed.current.add(id)
    api<{ views: number }>(`/reels/${id}/view`, { method: 'POST' })
      .then((data) => setReels((prev) => prev.map((r) => (r.id === id ? { ...r, views: data.views } : r))))
      .catch(() => undefined)
  }, [])

  const toggleLike = async (reel: Reel) => {
    const wasLiked = reel.likedByMe
    const wasLikes = reel.likes
    setReels((prev) =>
      prev.map((r) =>
        r.id === reel.id
          ? { ...r, likedByMe: !wasLiked, likes: wasLiked ? Math.max(0, wasLikes - 1) : wasLikes + 1 }
          : r,
      ),
    )
    try {
      const data = await api<{ liked: boolean; likes: number }>(`/reels/${reel.id}/like`, { method: 'POST' })
      setReels((prev) => prev.map((r) => (r.id === reel.id ? { ...r, likedByMe: data.liked, likes: data.likes } : r)))
    } catch (err: any) {
      setReels((prev) => prev.map((r) => (r.id === reel.id ? { ...r, likedByMe: wasLiked, likes: wasLikes } : r)))
      toast.push({ title: 'Could not like reel', description: err?.message, type: 'error' })
    }
  }

  const removeReel = async (reel: Reel) => {
    if (!window.confirm('Delete this reel?')) return
    try {
      await api(`/reels/${reel.id}`, { method: 'DELETE' })
      setReels((prev) => prev.filter((r) => r.id !== reel.id))
      toast.push({ title: 'Reel deleted', type: 'success' })
    } catch (err: any) {
      toast.push({ title: 'Could not delete reel', description: err?.message, type: 'error' })
    }
  }

  const openComments = async (reel: Reel) => {
    setCommentsFor(reel)
    setComments([])
    setCommentsLoading(true)
    try {
      const data = await api<{ items: ReelComment[] }>(`/reels/${reel.id}/comments`)
      setComments(data.items)
    } catch (err: any) {
      toast.push({ title: 'Could not load comments', description: err?.message, type: 'error' })
    } finally {
      setCommentsLoading(false)
    }
  }

  const submitComment = async () => {
    if (!commentsFor || !commentText.trim() || postingComment) return
    setPostingComment(true)
    try {
      const data = await api<{ comment: ReelComment }>(`/reels/${commentsFor.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: commentText }),
      })
      setComments((prev) => [...prev, data.comment])
      setCommentText('')
      setReels((prev) =>
        prev.map((r) => (r.id === commentsFor.id ? { ...r, comments: r.comments + 1 } : r)),
      )
      setCommentsFor((prev) => (prev ? { ...prev, comments: prev.comments + 1 } : prev))
    } catch (err: any) {
      toast.push({ title: 'Could not comment', description: err?.message, type: 'error' })
    } finally {
      setPostingComment(false)
    }
  }

  const uploadVideo = async (file: File) => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const data = await apiForm<{ url: string }>('/uploads/video', form)
      setVideoUrl(data.url)
    } catch (err: any) {
      toast.push({ title: 'Upload failed', description: err?.message, type: 'error' })
    } finally {
      setUploading(false)
    }
  }

  const publish = async () => {
    if (!videoUrl || publishing) return
    setPublishing(true)
    try {
      const data = await api<{ reel: Reel }>('/reels', {
        method: 'POST',
        body: JSON.stringify({ videoUrl, caption }),
      })
      if (!filterUser || filterUser === user?.username) {
        setReels((prev) => [data.reel, ...prev])
      } else {
        // The new reel is not part of the author feed currently being viewed.
        setSearchParams({})
      }
      setShowCreate(false)
      setVideoUrl('')
      setCaption('')
      toast.push({ title: 'Reel published', type: 'success' })
    } catch (err: any) {
      toast.push({ title: 'Could not publish reel', description: err?.message, type: 'error' })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-2xl flex-col lg:h-[calc(100vh-2rem)]">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{filterUser ? `@${filterUser}` : 'Reels'}</h1>
            {filterUser && (
              <button className="btn-ghost h-7 rounded-full px-2 text-xs" onClick={() => setSearchParams({})}>
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {filterUser ? 'Short videos from this account.' : 'Short videos from people you follow.'}
          </p>
        </div>
        <button className="btn-primary shrink-0" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New reel</span>
        </button>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="surface flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-300">{error}</p>
          <button className="btn-ghost" onClick={() => void load(true)}>
            Try again
          </button>
        </div>
      ) : reels.length === 0 ? (
        <div className="surface flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <Film className="h-10 w-10 text-slate-400" />
          <h2 className="text-lg font-semibold">No reels yet</h2>
          <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
            {filterUser
              ? 'This account has not posted any reels yet.'
              : 'Follow more people, or be the first to publish a short video.'}
          </p>
          {!filterUser && (
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> Create a reel
            </button>
          )}
        </div>
      ) : (
        <div ref={scrollerRef} className="flex-1 snap-y snap-mandatory overflow-y-auto rounded-3xl">
          {reels.map((reel) => (
            <div key={reel.id} className="h-full snap-start p-0.5">
              <ReelCard
                reel={reel}
                isMine={reel.author.id === user?.id}
                onLike={toggleLike}
                onComments={openComments}
                onDelete={removeReel}
                onView={registerView}
              />
            </div>
          ))}
          {hasMore && (
            <div className="flex h-24 snap-start items-center justify-center">
              <button className="btn-ghost" onClick={() => void load()} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load more reels'}
              </button>
            </div>
          )}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New reel" maxWidth="max-w-md">
        <div className="space-y-4">
          {videoUrl ? (
            <div className="relative overflow-hidden rounded-2xl bg-black">
              <video src={videoUrl} className="max-h-72 w-full" controls playsInline preload="metadata" />
              <button
                className="btn-ghost absolute right-2 top-2 h-8 w-8 rounded-full p-0"
                onClick={() => setVideoUrl('')}
                aria-label="Remove video"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 text-slate-500 transition hover:border-brand-500 hover:text-brand-600 dark:border-slate-700">
              {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
              <span className="text-sm font-medium">{uploading ? 'Uploading…' : 'Choose a short video'}</span>
              <span className="text-xs">MP4, WebM, MOV or Ogg · up to 50 MB</span>
              <input
                type="file"
                accept="video/*"
                hidden
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void uploadVideo(file)
                  event.target.value = ''
                }}
              />
            </label>
          )}

          <textarea
            className="w-full rounded-2xl border border-slate-200 bg-white/90 p-3 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
            rows={3}
            maxLength={300}
            placeholder="Write a caption…"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
          />

          <div className="flex justify-end">
            <button className="btn-primary" onClick={() => void publish()} disabled={!videoUrl || uploading || publishing}>
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
              Publish reel
            </button>
          </div>
        </div>
      </Modal>

      {commentsFor && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setCommentsFor(null)}>
          <aside
            className="ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-2xl dark:bg-slate-900"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Reel comments"
          >
            <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
              <h2 className="text-lg font-semibold">Comments</h2>
              <button className="btn-ghost h-9 w-9 rounded-full p-0" onClick={() => setCommentsFor(null)} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {commentsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : comments.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No comments yet. Start the conversation.
                </p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="flex items-start gap-3">
                    <img
                      src={
                        comment.author.avatarUrl ||
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.author.username}`
                      }
                      alt={comment.author.displayName}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <Link
                          to={`/profile/${comment.author.username}`}
                          className="text-sm font-semibold hover:underline"
                        >
                          {comment.author.username}
                        </Link>
                        <span className="text-xs text-slate-400">{dayjs(comment.createdAt).fromNow()}</span>
                      </div>
                      <p className="break-words text-sm text-slate-700 dark:text-slate-200">{comment.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form
              className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800"
              onSubmit={(event) => {
                event.preventDefault()
                void submitComment()
              }}
            >
              <input
                className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900/80"
                placeholder="Add a comment…"
                value={commentText}
                maxLength={500}
                onChange={(event) => setCommentText(event.target.value)}
              />
              <button
                type="submit"
                className="btn-primary h-10 w-10 rounded-full p-0"
                disabled={!commentText.trim() || postingComment}
                aria-label="Send comment"
              >
                {postingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          </aside>
        </div>
      )}
    </div>
  )
}

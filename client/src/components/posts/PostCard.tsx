import { useState } from 'react'
import { Heart, MessageCircle, Share2, Eye, MoreHorizontal } from 'lucide-react'
import type { FeedItem } from '@/types/post'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { api } from '@/lib/api'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/common/Toast'

dayjs.extend(relativeTime)

export function PostCard({ item, onDeleted }: { item: FeedItem; onDeleted?: (postId: number) => void }) {
  const post = item.post
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [liked, setLiked] = useState(post.likedByMe)
  const [likes, setLikes] = useState(post.likes)
  const [shared, setShared] = useState(post.sharedByMe)
  const [shares, setShares] = useState(post.shares)
  const [views, setViews] = useState(post.views)
  const [menuOpen, setMenuOpen] = useState(false)

  const like = async () => {
    // Optimistic flip, rolled back if the request fails so the heart and the
    // count never drift away from what the server actually stored.
    const wasLiked = liked
    const wasLikes = likes
    setLiked(!wasLiked)
    setLikes(wasLiked ? Math.max(0, wasLikes - 1) : wasLikes + 1)
    try {
      const data = await api<any>(`/posts/${post.id}/like`, { method: 'POST' })
      setLikes(data.likes)
      setLiked(data.likedByMe)
    } catch {
      setLiked(wasLiked)
      setLikes(wasLikes)
      toast.push({ title: 'Could not like post', type: 'error' })
    }
  }

  const share = async () => {
    try {
      const data = await api<any>(`/posts/${post.id}/share`, { method: 'POST', body: JSON.stringify({ note: '' }) })
      setShares(data.shares)
      setShared(data.sharedByMe)
      toast.push({ title: shared ? 'Unshared' : 'Shared to feed', type: 'success' })
    } catch {
      toast.push({ title: 'Could not share post', type: 'error' })
    }
  }

  const deletePost = async () => {
    if (post.author.id !== user?.id) return
    try {
      await api<any>(`/posts/${post.id}`, { method: 'DELETE' })
      toast.push({ title: 'Post deleted', type: 'success' })
      // Let the page drop the card instead of reloading the whole document.
      if (onDeleted) onDeleted(post.id)
      else window.location.reload()
    } catch {
      toast.push({ title: 'Could not delete post', type: 'error' })
    }
  }

  // The server records at most one view per viewer and returns the fresh count.
  const view = async () => {
    try {
      const data = await api<{ views: number }>(`/posts/${post.id}/view`, { method: 'POST' })
      setViews(data.views)
    } catch {
      // ignore
    }
  }

  return (
    <div className="surface p-4 md:p-6" onMouseEnter={view}>
      {item.kind === 'share' && item.sharedBy && (
        <div className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          <Link to={`/profile/${item.sharedBy.username}`} className="font-medium text-slate-700 dark:text-slate-200">
            {item.sharedBy.displayName}
          </Link>{' '}
          shared this {dayjs(item.sharedAt).fromNow()}
          {item.shareNote && <span className="ml-1">— “{item.shareNote}”</span>}
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to={`/profile/${post.author.username}`}>
            <img
              src={post.author.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author.username}`}
              alt={post.author.displayName}
              className="h-10 w-10 rounded-full object-cover"
            />
          </Link>
          <div>
            <Link to={`/profile/${post.author.username}`} className="text-sm font-semibold">
              {post.author.displayName}
            </Link>
            <div className="text-xs text-slate-500 dark:text-slate-400">@{post.author.username} • {dayjs(post.createdAt).fromNow()}</div>
          </div>
        </div>
        <div className="relative">
          <button className="btn-ghost h-9 w-9 rounded-full p-0" onClick={() => setMenuOpen((v) => !v)}>
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-10 z-10 w-40 rounded-2xl border border-slate-200/70 bg-white/95 shadow-soft dark:border-slate-800 dark:bg-slate-900/95">
              <button className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-100/80 dark:hover:bg-slate-800/70" onClick={() => navigate(`/post/${post.id}`)}>
                View post
              </button>
              {post.author.id === user?.id && (
                <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-slate-100/80 dark:hover:bg-slate-800/70" onClick={deletePost}>
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {post.content && <p className="whitespace-pre-wrap text-sm leading-relaxed">{post.content}</p>}
        {post.imageUrl && (
          <div className="overflow-hidden rounded-3xl">
            <img src={post.imageUrl} alt="post" className="h-full w-full object-cover" />
          </div>
        )}
        {post.videoUrl && (
          <div className="overflow-hidden rounded-3xl bg-black">
            <video src={post.videoUrl} className="h-full w-full" controls playsInline preload="metadata" />
          </div>
        )}
        <div className="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
          {post.hashtags.map((tag) => (
            <Link key={tag} to={`/search/${encodeURIComponent(`#${tag}`)}`} className="hover:text-brand-600">
              #{tag}
            </Link>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-200/70 pt-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <button
          className={`flex items-center gap-1.5 ${liked ? 'text-rose-600' : ''}`}
          onClick={like}
          aria-label={liked ? 'Unlike post' : 'Like post'}
        >
          <Heart className={`h-4 w-4 ${liked ? 'fill-rose-600' : ''}`} />
          {likes}
        </button>
        <button
          className="flex items-center gap-1.5"
          onClick={() => navigate(`/post/${post.id}`)}
          aria-label="View comments"
        >
          <MessageCircle className="h-4 w-4" />
          {post.comments}
        </button>
        <button
          className={`flex items-center gap-1.5 ${shared ? 'text-brand-600' : ''}`}
          onClick={share}
          aria-label={shared ? 'Unshare post' : 'Share post'}
        >
          <Share2 className="h-4 w-4" />
          {shares}
        </button>
        <div className="flex items-center gap-1.5">
          <Eye className="h-4 w-4" />
          {views}
        </div>
      </div>
    </div>
  )
}

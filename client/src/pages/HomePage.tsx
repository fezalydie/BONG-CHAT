import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { FeedItem } from '@/types/post'
import { StoryRail } from '@/components/stories/StoryRail'
import { PostCard } from '@/components/posts/PostCard'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

export function HomePage() {
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // Guards against the observer firing repeatedly while a page is in flight.
  const busyRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const load = async (reset = false) => {
    if (busyRef.current) return
    busyRef.current = true
    const p = reset ? 0 : page
    if (reset) setLoading(true)
    else setLoadingMore(true)
    try {
      const data = await api<any>(`/posts?page=${p}`)
      setItems((prev) => (reset ? data.items : [...prev, ...data.items]))
      setHasMore(data.hasMore)
      setPage(reset ? 1 : p + 1)
      setError(null)
    } catch (err: any) {
      setError(err?.message || 'Could not load your feed.')
      // Stop auto-loading on error so the retry button is the way forward.
      setHasMore(false)
    } finally {
      setLoading(false)
      setLoadingMore(false)
      busyRef.current = false
    }
  }

  useEffect(() => {
    load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-load the next page as the sentinel scrolls into view.
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore || error) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void load()
      },
      { rootMargin: '400px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, error, page])

  // Drop a deleted post from the feed without refetching the whole page.
  const removePost = (postId: number) => {
    setItems((list) => list.filter((item) => item.post.id !== postId))
  }

  return (
    <div className="flex flex-col gap-6 pb-20 lg:pb-0">
      <StoryRail />
      <div className="surface p-4 md:p-6">
        <Link to="/post/new" className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="flex-1 rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-2.5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
            What's on your mind?
          </div>
          <button className="btn-primary">Post</button>
        </Link>
      </div>
      <div className="flex flex-col gap-4">
        {error && (
          <div className="surface flex flex-col items-center gap-3 p-6 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
            <button
              className="btn-ghost"
              onClick={() => {
                setHasMore(true)
                load(true)
              }}
            >
              Try again
            </button>
          </div>
        )}
        {items.map((item, i) => (
          <PostCard key={`${item.kind}-${i}`} item={item} onDeleted={removePost} />
        ))}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {!loading && hasMore && !error && (
          <div ref={sentinelRef} className="flex items-center justify-center py-6">
            {loadingMore ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <button className="btn-ghost" onClick={() => load()}>
                Load more
              </button>
            )}
          </div>
        )}
        {!loading && !hasMore && items.length > 0 && (
          <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            You're all caught up ✨
          </p>
        )}
      </div>
    </div>
  )
}

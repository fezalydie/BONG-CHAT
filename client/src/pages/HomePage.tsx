import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { FeedItem } from '@/types/post'
import { StoryRail } from '@/components/stories/StoryRail'
import { PostCard } from '@/components/posts/PostCard'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

export function HomePage() {
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(0)

  const load = async (reset = false) => {
    const p = reset ? 0 : page
    const data = await api<any>(`/posts?page=${p}`)
    setItems((prev) => (reset ? data.items : [...prev, ...data.items]))
    setHasMore(data.hasMore)
    setPage(reset ? 1 : p + 1)
  }

  useEffect(() => {
    setLoading(true)
    load(true).finally(() => setLoading(false))
  }, [])

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
        {items.map((item, i) => (
          <PostCard key={`${item.kind}-${i}`} item={item} />
        ))}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {!loading && hasMore && (
          <button className="btn-ghost self-center" onClick={() => load()}>
            Load more
          </button>
        )}
      </div>
    </div>
  )
}

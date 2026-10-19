import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '@/lib/api'
import type { SearchResult } from '@/types/other'
import { Search as SearchIcon, Eye } from 'lucide-react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

const EMPTY: SearchResult = { users: [], posts: [], tags: [], web: [] }

export function SearchPage() {
  const { query } = useParams<{ query: string }>()
  const [q, setQ] = useState(query || '')
  const [result, setResult] = useState<SearchResult>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  const search = async (term: string) => {
    if (!term.trim()) return
    setSearching(true)
    try {
      const data = await api<any>(`/search?q=${encodeURIComponent(term)}`)
      setResult({ ...EMPTY, ...data })
      setError(null)
    } catch (err: any) {
      setError(err?.message || 'Search failed. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    if (query) {
      setQ(query)
      search(query)
    }
  }, [query])

  const searchTag = (tag: string) => {
    const term = `#${tag}`
    setQ(term)
    search(term)
  }

  const hasResults =
    result.users.length + result.posts.length + result.tags.length + result.web.length > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="surface flex items-center gap-2 p-2">
        <SearchIcon className="ml-2 h-4 w-4 text-slate-400" />
        <input
          className="flex-1 bg-transparent px-2 py-2 text-sm outline-none"
          placeholder="Search people, posts, #tags or websites"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search(q)}
        />
        <button className="btn-primary" onClick={() => search(q)} disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>

      {error && (
        <div className="surface flex flex-col items-center gap-3 p-6 text-center" role="alert">
          <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
          <button className="btn-ghost" onClick={() => search(q)}>
            Try again
          </button>
        </div>
      )}

      {result.tags.length > 0 && (
        <div className="surface p-4">
          <div className="text-sm font-semibold">Tags</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {result.tags.map((tag) => (
              <button key={tag} className="btn-ghost" onClick={() => searchTag(tag)}>
                #{tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {result.posts.length > 0 && (
        <div className="surface p-4">
          <div className="text-sm font-semibold">Posts</div>
          <div className="mt-3 flex flex-col gap-2">
            {result.posts.map((post) => (
              <Link
                key={post.id}
                to={`/post/${post.id}`}
                className="flex gap-3 rounded-2xl p-2 transition hover:bg-slate-100/80 dark:hover:bg-slate-800/70"
              >
                <img
                  src={post.author.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author.username}`}
                  alt={post.author.displayName}
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <span className="font-semibold">{post.author.displayName}</span>{' '}
                    <span className="text-slate-500">@{post.author.username}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm">{post.content}</p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span>{dayjs(post.createdAt).fromNow()}</span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {post.views}
                    </span>
                  </div>
                </div>
                {post.imageUrl && (
                  <img src={post.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {result.users.length > 0 && (
        <div className="surface p-4">
          <div className="text-sm font-semibold">People</div>
          <div className="mt-3 flex flex-col gap-2">
            {result.users.map((u) => (
              <Link key={u.id} to={`/profile/${u.username}`} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-slate-100/80 dark:hover:bg-slate-800/70">
                <img src={u.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`} alt={u.displayName} className="h-10 w-10 rounded-full object-cover" />
                <div>
                  <div className="text-sm font-semibold">{u.displayName}</div>
                  <div className="text-xs text-slate-500">@{u.username}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {result.web.length > 0 && (
        <div className="surface p-4">
          <div className="text-sm font-semibold">Web</div>
          <div className="mt-3 flex flex-col gap-2">
            {result.web.map((w, i) => (
              <a key={i} href={w.url} target="_blank" rel="noreferrer" className="rounded-2xl p-2 text-sm hover:bg-slate-100/80 dark:hover:bg-slate-800/70">
                {w.label}
              </a>
            ))}
          </div>
        </div>
      )}

      {!hasResults && !error && q.trim() !== '' && (
        <div className="surface p-8 text-center text-sm text-slate-500">No results for “{q}”</div>
      )}
    </div>
  )
}

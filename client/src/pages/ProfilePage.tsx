import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import type { PublicUser, ViewerFlags, UserStats } from '@/types/user'
import type { Post } from '@/types/post'
import { PostCard } from '@/components/posts/PostCard'
import { Modal } from '@/components/common/Modal'
import { Edit3, Lock, Loader2, ShieldOff } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/common/Toast'

export function ProfilePage() {
  const { username } = useParams<{ username: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [profile, setProfile] = useState<(PublicUser & { email?: string }) | null>(null)
  const [stats, setStats] = useState<UserStats>({ posts: 0, followers: 0, following: 0 })
  const [viewer, setViewer] = useState<ViewerFlags | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [listKind, setListKind] = useState<'followers' | 'following' | null>(null)
  const [listUsers, setListUsers] = useState<PublicUser[]>([])
  const [listLoading, setListLoading] = useState(false)
  const isMe = !username || username === user?.username

  const load = async () => {
    const uname = username || user?.username
    if (!uname) return
    const data = await api<any>(`/users/${uname}`)
    setProfile(data.user)
    setStats(data.stats)
    setViewer(data.viewer)
    const p = await api<any>(`/posts?username=${uname}`)
    setPosts(p.items.filter((i: any) => i.kind === 'post').map((i: any) => i.post))
  }

  useEffect(() => {
    load()
  }, [username, user])

  const follow = async () => {
    if (!profile) return
    try {
      const data = await api<any>(`/users/${profile.username}/follow`, { method: 'POST' })
      setViewer((v) => (v ? { ...v, isFollowing: data.following } : v))
      setStats((s) => ({ ...s, followers: data.followers }))
    } catch (err: any) {
      toast.push({ title: 'Error', description: err.message, type: 'error' })
    }
  }

  const block = async () => {
    if (!profile) return
    if (!window.confirm(`Block @${profile.username}? You won't see each other's content.`)) return
    try {
      await api<any>(`/users/${profile.username}/block`, { method: 'POST' })
      toast.push({
        title: `Blocked @${profile.username}`,
        description: 'Manage blocked accounts in Settings.',
        type: 'success',
      })
      navigate('/')
    } catch (err: any) {
      toast.push({ title: 'Could not block', description: err.message, type: 'error' })
    }
  }

  const openList = async (kind: 'followers' | 'following') => {
    if (!profile) return
    setListKind(kind)
    setListUsers([])
    setListLoading(true)
    try {
      const data = await api<{ users: PublicUser[] }>(`/users/${profile.username}/${kind}`)
      setListUsers(data.users)
    } catch (err: any) {
      toast.push({ title: `Could not load ${kind}`, description: err.message, type: 'error' })
    } finally {
      setListLoading(false)
    }
  }

  if (!profile) return null

  return (
    <div className="flex flex-col gap-6">
      <div className="surface overflow-hidden">
        <div className="h-36 bg-gradient-to-br from-brand-500 to-violet-500 md:h-48" />
        <div className="flex flex-col gap-4 p-4 md:flex-row md:items-end md:justify-between md:p-6">
          <div className="flex items-end gap-4">
            <img
              src={profile.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.username}`}
              alt={profile.displayName}
              className="-mt-12 h-24 w-24 rounded-full object-cover ring-4 ring-white dark:ring-slate-900 md:-mt-16 md:h-32 md:w-32"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold md:text-2xl">{profile.displayName}</h1>
                {profile.isPrivate && <Lock className="h-4 w-4 text-slate-500" />}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">@{profile.username}</div>
              {profile.bio && <p className="mt-2 max-w-xl text-sm leading-relaxed">{profile.bio}</p>}
              <div className="mt-3 flex gap-6 text-sm text-slate-500 dark:text-slate-400">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{stats.posts}</span> posts
                </div>
                <button className="transition hover:text-slate-900 dark:hover:text-slate-100" onClick={() => openList('followers')}>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{stats.followers}</span> followers
                </button>
                <button className="transition hover:text-slate-900 dark:hover:text-slate-100" onClick={() => openList('following')}>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{stats.following}</span> following
                </button>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {isMe ? (
              <button className="btn-ghost" onClick={() => navigate('/edit-profile')}>
                <Edit3 className="h-4 w-4" />
                Edit profile
              </button>
            ) : (
              <>
                <button className="btn-ghost" onClick={follow}>
                  {viewer?.isFollowing ? 'Unfollow' : 'Follow'}
                </button>
                <Link className="btn-ghost" to={`/messages`}>
                  Message
                </Link>
                <button className="btn-ghost text-rose-600 dark:text-rose-400" onClick={block} title="Block user">
                  <ShieldOff className="h-4 w-4" />
                  Block
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {viewer && !viewer.canViewContent && !viewer.isMe && (
          <div className="surface flex flex-col items-center gap-2 p-8 text-center">
            <Lock className="h-8 w-8 text-slate-400" />
            <div className="text-lg font-semibold">This account is private</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Follow to see their posts and stories</div>
          </div>
        )}
        {viewer && viewer.canViewContent && posts.map((post) => (
          <PostCard key={post.id} item={{ kind: 'post', post, sharedBy: null, shareNote: '', sharedAt: null }} />
        ))}
        {viewer && viewer.isMe && posts.map((post) => (
          <PostCard key={post.id} item={{ kind: 'post', post, sharedBy: null, shareNote: '', sharedAt: null }} />
        ))}
      </div>

      <Modal open={listKind !== null} onClose={() => setListKind(null)} title={listKind === 'followers' ? 'Followers' : 'Following'}>
        {listLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : listUsers.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-500">No one here yet.</div>
        ) : (
          <div className="flex flex-col gap-1">
            {listUsers.map((person) => (
              <Link
                key={person.id}
                to={`/profile/${person.username}`}
                onClick={() => setListKind(null)}
                className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-ink-100 dark:hover:bg-ink-800"
              >
                <img
                  src={person.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${person.username}`}
                  alt={person.displayName}
                  className="h-10 w-10 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{person.displayName}</div>
                  <div className="truncate text-xs text-slate-500">@{person.username}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}

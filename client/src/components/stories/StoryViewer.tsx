import { useEffect, useMemo, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Eye, Send, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { storyGradient } from '@/lib/stories'
import type { StoryGroup, Story } from '@/types/other'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/common/Toast'

interface StoryEvent {
  open?: boolean
  userId?: number
  index?: number
}

export function StoryViewer() {
  const { user } = useAuth()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState<StoryGroup[]>([])
  const [activeUser, setActiveUser] = useState<number | null>(null)
  const [activeStory, setActiveStory] = useState<number>(0)
  const [viewers, setViewers] = useState<any[]>([])
  const [showViewers, setShowViewers] = useState(false)
  const [reply, setReply] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<StoryEvent>
      if (ev.detail?.open) {
        loadGroups().then((loaded) => {
          if (ev.detail?.userId === undefined) return
          const target = (loaded ?? []).find((g: StoryGroup) => g.user.id === ev.detail?.userId)
          if (!target || target.stories.length === 0) return
          setActiveUser(ev.detail.userId)
          setActiveStory(Math.min(Math.max(0, ev.detail.index ?? 0), target.stories.length - 1))
          setOpen(true)
        })
      }
    }
    window.addEventListener('bongchat:open-stories', handler as any)
    return () => window.removeEventListener('bongchat:open-stories', handler as any)
  }, [])

  const loadGroups = async (): Promise<StoryGroup[]> => {
    try {
      const data = await api<any>('/stories')
      const loaded: StoryGroup[] = data.groups ?? []
      setGroups(loaded)
      return loaded
    } catch {
      // Nothing to open if the rail can't be loaded.
      return []
    }
  }

  const group = useMemo(() => groups.find((g) => g.user.id === activeUser) ?? null, [groups, activeUser])
  const isMine = Boolean(user && group && group.user.id === user.id)

  useEffect(() => {
    if (!open || !group || !group.stories[activeStory]) return
    markViewed(group.stories[activeStory].id)
    // Reset per-story UI when moving to a different story.
    setViewers([])
    setShowViewers(false)
    setReply('')
  }, [open, group, activeStory])

  const markViewed = async (storyId: number) => {
    try {
      // The author only needs the viewer list; the server ignores self-views.
      if (user && group && group.user.id === user.id) {
        const data = await api<any>(`/stories/${storyId}`)
        setViewers(data.viewers ?? [])
      } else {
        await api<any>(`/stories/${storyId}/view`, { method: 'POST' })
      }
    } catch {
      // ignore
    }
  }

  const sendReply = async () => {
    if (!group || !reply.trim() || sendingReply) return
    setSendingReply(true)
    try {
      await api<any>(`/stories/${group.stories[activeStory].id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ content: reply.trim() }),
      })
      setReply('')
      toast.push({
        title: 'Reply sent',
        description: `@${group.user.username} will see it in messages.`,
        type: 'success',
      })
    } catch (err: any) {
      toast.push({ title: 'Could not send reply', description: err.message, type: 'error' })
    } finally {
      setSendingReply(false)
    }
  }

  if (!open || !group || !group.stories[activeStory]) return null

  const story = group.stories[activeStory]
  const gradient = storyGradient(story.style)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <button className="absolute right-4 top-4 text-white" onClick={() => setOpen(false)}>
        <X className="h-6 w-6" />
      </button>
      <div className="relative flex h-[90vh] w-[90vw] max-w-md flex-col overflow-hidden rounded-3xl">
        <div className={`flex-1 ${gradient} relative flex items-center justify-center p-6 text-white`}>
          {story.videoUrl ? (
            <video
              key={story.id}
              src={story.videoUrl}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 h-full w-full object-cover opacity-90"
            />
          ) : story.imageUrl ? (
            <img src={story.imageUrl} alt="story" className="absolute inset-0 h-full w-full object-cover opacity-80" />
          ) : null}
          <div className="relative z-10 text-center">
            <div className="text-sm opacity-80">@{group.user.username}</div>
            <div className="mt-2 text-2xl font-semibold">{story.content}</div>
          </div>

          {showViewers && (
            <div className="absolute inset-0 z-20 flex flex-col bg-black/80 backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-white/15 p-4">
                <div className="text-sm font-semibold">
                  Viewers <span className="opacity-70">({viewers.length})</span>
                </div>
                <button onClick={() => setShowViewers(false)} aria-label="Close viewers">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {viewers.length === 0 ? (
                  <div className="p-6 text-center text-sm opacity-70">No views yet.</div>
                ) : (
                  viewers.map(({ user: viewer, viewedAt }: any) => (
                    <div key={`${viewer.id}-${viewedAt}`} className="flex items-center gap-3 rounded-2xl p-2">
                      <img
                        src={viewer.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${viewer.username}`}
                        alt={viewer.displayName}
                        className="h-9 w-9 rounded-full object-cover"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{viewer.displayName}</div>
                        <div className="truncate text-xs opacity-70">@{viewer.username}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between bg-black/70 px-4 py-2 text-white">
          <button
            disabled={activeStory === 0}
            onClick={() => setActiveStory((s) => Math.max(0, s - 1))}
            className="rounded-full bg-white/10 p-2 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {isMine ? (
            <button
              className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs"
              onClick={() => setShowViewers(true)}
              title="See who viewed this story"
            >
              <Eye className="h-3.5 w-3.5" />
              {viewers.length} {viewers.length === 1 ? 'viewer' : 'viewers'}
            </button>
          ) : (
            <div className="text-xs opacity-70">
              {activeStory + 1} / {group.stories.length}
            </div>
          )}
          <button
            disabled={activeStory === group.stories.length - 1}
            onClick={() => setActiveStory((s) => Math.min(group.stories.length - 1, s + 1))}
            className="rounded-full bg-white/10 p-2 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {!isMine && user && (
          <div className="flex items-center gap-2 bg-black/70 px-3 pb-3">
            <input
              className="flex-1 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/40"
              placeholder={`Reply to @${group.user.username}…`}
              value={reply}
              maxLength={1000}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void sendReply()}
            />
            <button
              className="rounded-full bg-white p-2 text-black disabled:opacity-40"
              onClick={() => void sendReply()}
              disabled={!reply.trim() || sendingReply}
              aria-label="Send story reply"
            >
              {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

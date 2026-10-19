import { useEffect, useMemo, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Eye } from 'lucide-react'
import { api } from '@/lib/api'
import { storyGradient } from '@/lib/stories'
import type { StoryGroup, Story } from '@/types/other'
import { useAuth } from '@/context/AuthContext'

interface StoryEvent {
  open?: boolean
  userId?: number
  index?: number
}

export function StoryViewer() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState<StoryGroup[]>([])
  const [activeUser, setActiveUser] = useState<number | null>(null)
  const [activeStory, setActiveStory] = useState<number>(0)
  const [viewers, setViewers] = useState<any[]>([])

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

  useEffect(() => {
    if (!open || !group || !group.stories[activeStory]) return
    markViewed(group.stories[activeStory].id)
  }, [open, group, activeStory])

  const markViewed = async (storyId: number) => {
    try {
      await api<any>(`/stories/${storyId}/view`, { method: 'POST' })
      if (user && group && group.user.id === user.id) {
        const data = await api<any>(`/stories/${storyId}`)
        setViewers(data.viewers ?? [])
      }
    } catch {
      // ignore
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
        </div>
        <div className="flex items-center justify-between bg-black/70 px-4 py-2 text-white">
          <button
            disabled={activeStory === 0}
            onClick={() => setActiveStory((s) => Math.max(0, s - 1))}
            className="rounded-full bg-white/10 p-2 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-xs">
            <Eye className="h-3 w-3" />
            {viewers.length} viewers
          </div>
          <button
            disabled={activeStory === group.stories.length - 1}
            onClick={() => setActiveStory((s) => Math.min(group.stories.length - 1, s + 1))}
            className="rounded-full bg-white/10 p-2 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

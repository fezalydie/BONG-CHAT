import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { StoryGroup } from '@/types/other'
import { Plus } from 'lucide-react'
import { CreateStoryModal } from './CreateStoryModal'

export function StoryRail() {
  const [groups, setGroups] = useState<StoryGroup[]>([])
  const [creating, setCreating] = useState(false)

  const load = async () => {
    try {
      const data = await api<any>('/stories')
      setGroups(data.groups ?? [])
    } catch {
      /* keep whatever was last loaded so the rail stays usable */
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openStories = (group: StoryGroup, index = 0) => {
    window.dispatchEvent(new CustomEvent('bongchat:open-stories', { detail: { open: true, userId: group.user.id, index } }))
  }

  return (
    <div className="surface scrollbar-thin flex gap-3 overflow-x-auto p-4">
      <button
        className="flex min-w-[80px] flex-col items-center gap-2"
        onClick={() => setCreating(true)}
      >
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-slate-300 dark:border-slate-700">
          <Plus className="h-5 w-5" />
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">Your story</span>
      </button>
      {groups.map((group) => (
        <button
          key={group.user.id}
          className="flex min-w-[80px] flex-col items-center gap-2"
          onClick={() => openStories(group)}
        >
          <div
            className={`relative flex h-16 w-16 items-center justify-center rounded-full ${
              group.hasUnseen ? 'bg-gradient-to-br from-pink-500 via-orange-500 to-yellow-500 p-0.5' : 'border-2 border-slate-200 dark:border-slate-700'
            }`}
          >
            <img
              src={group.user.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${group.user.username}`}
              alt={group.user.displayName}
              className="h-full w-full rounded-full object-cover"
            />
          </div>
          <span className="max-w-[72px] truncate text-xs">{group.user.displayName}</span>
        </button>
      ))}
      <CreateStoryModal open={creating} onClose={() => setCreating(false)} onCreated={load} />
    </div>
  )
}

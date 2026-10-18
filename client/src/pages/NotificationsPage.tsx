import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import type { Notification } from '@/types/other'
import { Heart, MessageCircle, UserPlus, Repeat2, Mail, Bell, Trash2 } from 'lucide-react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useToast } from '@/components/common/Toast'

dayjs.extend(relativeTime)

const ICONS: Record<Notification['type'], typeof Heart> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  share: Repeat2,
  message: Mail,
  system: Bell,
}

const LABELS: Record<Notification['type'], string> = {
  like: 'liked your post',
  comment: 'commented on your post',
  follow: 'started following you',
  share: 'shared your post',
  message: 'sent you a message',
  system: 'sent you a notification',
}

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const navigate = useNavigate()
  const toast = useToast()
  const { setUnreadNotifications } = useAuth()

  const load = async () => {
    try {
      const data = await api<any>('/notifications')
      setNotifications(data.notifications)
      setUnread(data.unreadCount)
      setUnreadNotifications(data.unreadCount)
    } catch (err: any) {
      toast.push({ title: 'Could not load notifications', description: err.message, type: 'error' })
    }
  }

  useEffect(() => {
    load()
  }, [])

  const readAll = async () => {
    await api<any>('/notifications/read-all', { method: 'POST' })
    setUnread(0)
    setUnreadNotifications(0)
    load()
  }

  const clearAll = async () => {
    try {
      await api<any>('/notifications', { method: 'DELETE' })
      setNotifications([])
      setUnread(0)
      setUnreadNotifications(0)
      toast.push({ title: 'Notifications cleared', type: 'success' })
    } catch (err: any) {
      toast.push({ title: 'Failed', description: err.message, type: 'error' })
    }
  }

  const open = async (n: Notification) => {
    if (!n.read) {
      setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
      setUnread((u) => Math.max(0, u - 1))
      setUnreadNotifications((u) => Math.max(0, u - 1))
      api<any>(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined)
    }
    if (n.link) navigate(n.link)
  }

  return (
    <div className="surface p-4 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">
          Notifications {unread > 0 && <span className="text-brand-600 dark:text-brand-400">({unread})</span>}
        </h1>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={readAll} disabled={notifications.length === 0}>
            Mark all read
          </button>
          <button className="btn-ghost" onClick={clearAll} disabled={notifications.length === 0} title="Clear all">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {notifications.map((n) => {
          const Icon = ICONS[n.type] ?? Bell
          const actor = n.data?.actor as { displayName?: string; username?: string; avatarUrl?: string } | undefined
          return (
            <button
              key={n.id}
              className={`flex items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-ink-100 dark:hover:bg-ink-800 ${
                n.read ? '' : 'bg-brand-50/60 dark:bg-brand-900/20'
              }`}
              onClick={() => void open(n)}
            >
              <div className="relative">
                {actor ? (
                  <img
                    src={actor.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${actor.username}`}
                    alt={actor.displayName || 'avatar'}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-100 dark:bg-ink-800">
                    <Icon className="h-4 w-4 text-ink-500" />
                  </div>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm dark:bg-ink-900">
                  <Icon className="h-3 w-3 text-brand-600 dark:text-brand-400" />
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  {actor?.displayName && <span className="font-semibold">{actor.displayName} </span>}
                  {LABELS[n.type] ?? 'sent you a notification'}
                </div>
                {n.data?.preview && (
                  <div className="truncate text-xs text-ink-500 dark:text-ink-400">{n.data.preview}</div>
                )}
                <div className="text-xs text-slate-500">{dayjs(n.createdAt).fromNow()}</div>
              </div>

              {!n.read && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600" />}
            </button>
          )
        })}
        {notifications.length === 0 && (
          <div className="py-8 text-center text-sm text-slate-500">No notifications yet</div>
        )}
      </div>
    </div>
  )
}

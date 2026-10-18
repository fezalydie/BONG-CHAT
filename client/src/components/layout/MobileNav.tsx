import { NavLink } from 'react-router-dom'
import { Home, MessageCircle, Search, Bell, Sparkles, Settings } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useSocket } from '@/context/SocketContext'
import { cn } from '@/utils/cn'

const items = [
  { to: '/', icon: Home, label: 'Feed' },
  { to: '/messages', icon: MessageCircle, label: 'Messages' },
  { to: '/search', icon: Search, label: 'Search' },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
  { to: '/ai', icon: Sparkles, label: 'AI' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function MobileNav() {
  const { unreadNotifications } = useAuth()
  const { unreadMessages } = useSocket()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/70 bg-white/95 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/95 lg:hidden">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-1">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'relative flex flex-col items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-slate-500 transition dark:text-slate-400',
                isActive && 'text-brand-600 dark:text-brand-400',
              )
            }
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
            {label === 'Messages' && unreadMessages > 0 && (
              <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-rose-500" />
            )}
            {label === 'Notifications' && unreadNotifications > 0 && (
              <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-rose-500" />
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

import { NavLink, useNavigate } from 'react-router-dom'
import {
  Home,
  MessageCircle,
  Search,
  Users,
  Settings,
  Bell,
  Sparkles,
  Facebook,
  Instagram,
  MessageSquareText,
  LogOut,
  Plus,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { useSocket } from '@/context/SocketContext'
import { cn } from '@/utils/cn'

const navItems = [
  { to: '/', icon: Home, label: 'Feed' },
  { to: '/messages', icon: MessageCircle, label: 'Messages' },
  { to: '/search', icon: Search, label: 'Search' },
  { to: '/profile', icon: Users, label: 'Profile' },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/ai', icon: Sparkles, label: 'AI Assistant' },
]

export function Sidebar() {
  const { user, logout, unreadNotifications } = useAuth()
  const { unreadMessages } = useSocket()
  const { resolvedTheme } = useTheme()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/auth')
  }

  return (
    <aside className="hidden lg:flex lg:w-80 xl:w-96 flex-col gap-6 p-6">
      <div className="surface flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-md">
              B
            </div>
            <div>
              <div className="text-lg font-semibold">BONG CHAT</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">All-in-one social hub</div>
            </div>
          </div>
          <button className="btn-ghost h-10 w-10 rounded-full p-0" onClick={() => navigate('/post/new')}>
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex flex-col gap-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium transition hover:bg-slate-100/80 dark:hover:bg-slate-800/70',
                  isActive && 'bg-slate-100/90 dark:bg-slate-800/80 shadow-sm',
                )
              }
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100/80 dark:bg-slate-800/80">
                <Icon className="h-4 w-4" />
              </div>
              <span>{label}</span>
              {label === 'Messages' && unreadMessages > 0 && (
                <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-semibold text-white">
                  {unreadMessages}
                </span>
              )}
              {label === 'Notifications' && unreadNotifications > 0 && (
                <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-semibold text-white">
                  {unreadNotifications}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex flex-col gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Quick links
          </div>
          <div className="grid grid-cols-3 gap-2">
            <a
              className="flex flex-col items-center gap-1 rounded-2xl border border-slate-200/70 bg-white/90 p-3 text-xs font-medium shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/80"
              href="https://www.facebook.com/"
              target="_blank"
              rel="noreferrer"
            >
              <Facebook className="h-5 w-5 text-[#1877F2]" />
              Facebook
            </a>
            <a
              className="flex flex-col items-center gap-1 rounded-2xl border border-slate-200/70 bg-white/90 p-3 text-xs font-medium shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/80"
              href="https://www.instagram.com/"
              target="_blank"
              rel="noreferrer"
            >
              <Instagram className="h-5 w-5 text-[#E1306C]" />
              Instagram
            </a>
            <a
              className="flex flex-col items-center gap-1 rounded-2xl border border-slate-200/70 bg-white/90 p-3 text-xs font-medium shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/80"
              href="https://web.whatsapp.com/"
              target="_blank"
              rel="noreferrer"
            >
              <MessageSquareText className="h-5 w-5 text-[#25D366]" />
              WhatsApp
            </a>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/90 p-3 dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={user?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`}
                alt={user?.displayName}
                className="h-10 w-10 rounded-full object-cover ring-2 ring-white dark:ring-slate-900"
              />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
            </div>
            <div>
              <div className="text-sm font-semibold">{user?.displayName}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">@{user?.username}</div>
            </div>
          </div>
          <button className="btn-ghost h-9 w-9 rounded-full p-0" onClick={handleLogout} title="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}

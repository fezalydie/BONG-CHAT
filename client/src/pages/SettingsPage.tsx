import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useTheme } from '@/context/ThemeContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/common/Toast'
import type { PublicUser } from '@/types/user'
import { cn } from '@/utils/cn'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'bn', label: 'বাংলা (Bengali)' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'es', label: 'Español (Spanish)' },
  { code: 'fr', label: 'Français (French)' },
  { code: 'ar', label: 'العربية (Arabic)' },
]

const NOTIFICATION_PREFS: Array<{ key: string; label: string }> = [
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'follows', label: 'New followers' },
  { key: 'messages', label: 'Messages' },
  { key: 'shares', label: 'Shares' },
  { key: 'sounds', label: 'Sounds' },
]

interface Platform {
  id: string
  name: string
  description: string
  webUrl: string
  color: string
}

export function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { setUser } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [settings, setSettings] = useState<any>(null)
  const [blocked, setBlocked] = useState<PublicUser[]>([])
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [saving, setSaving] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const [deletePassword, setDeletePassword] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadSettings = async () => {
    try {
      const data = await api<any>('/settings')
      setSettings(data.settings)
    } catch (err: any) {
      toast.push({ title: 'Could not load settings', description: err.message, type: 'error' })
    }
  }

  const loadBlocked = async () => {
    try {
      const data = await api<{ users: PublicUser[] }>('/users/blocked')
      setBlocked(data.users)
    } catch {
      /* not fatal */
    }
  }

  useEffect(() => {
    loadSettings()
    loadBlocked()
    api<{ platforms: Platform[] }>('/integrations')
      .then((data) => setPlatforms(data.platforms ?? []))
      .catch(() => undefined)
  }, [])

  const save = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const data = await api<any>('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          theme,
          language: settings.language,
          isPrivate: settings.isPrivate,
          notificationPrefs: settings.notificationPrefs,
        }),
      })
      setSettings(data.settings)
      toast.push({ title: 'Settings saved', type: 'success' })
    } catch (err: any) {
      toast.push({ title: 'Failed to save', description: err.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async () => {
    if (newPassword.length < 6) {
      toast.push({ title: 'Password too short', description: 'Use at least 6 characters.', type: 'error' })
      return
    }
    if (newPassword !== confirmPassword) {
      toast.push({ title: "Passwords don't match", type: 'error' })
      return
    }
    setChangingPassword(true)
    try {
      await api<any>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      toast.push({ title: 'Password changed', type: 'success' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      toast.push({ title: 'Could not change password', description: err.message, type: 'error' })
    } finally {
      setChangingPassword(false)
    }
  }

  const unblock = async (username: string) => {
    try {
      await api<any>(`/users/${username}/block`, { method: 'POST' })
      setBlocked((list) => list.filter((u) => u.username !== username))
      toast.push({ title: `Unblocked @${username}`, type: 'success' })
    } catch (err: any) {
      toast.push({ title: 'Failed', description: err.message, type: 'error' })
    }
  }

  const deleteAccount = async () => {
    setDeleting(true)
    try {
      await api<any>('/users/me', { method: 'DELETE', body: JSON.stringify({ password: deletePassword }) })
      setUser(null)
      toast.push({ title: 'Account deleted', type: 'success' })
      navigate('/auth')
    } catch (err: any) {
      toast.push({ title: 'Could not delete account', description: err.message, type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  const prefs = settings?.notificationPrefs ?? {}

  return (
    <div className="flex flex-col gap-4">
      <div className="surface p-6">
        <h1 className="text-lg font-semibold">Appearance</h1>
        <div className="mt-4 flex gap-2">
          {(['light', 'dark', 'system'] as const).map((t) => (
            <button
              key={t}
              className={cn('btn-ghost capitalize', theme === t && 'bg-slate-100 dark:bg-slate-800')}
              onClick={() => setTheme(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="surface p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">General</h1>
          <button className="btn-primary" onClick={save} disabled={saving || !settings}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <input
            id="private-account"
            type="checkbox"
            checked={settings?.isPrivate || false}
            onChange={(e) => setSettings((s: any) => ({ ...s, isPrivate: e.target.checked }))}
          />
          <label htmlFor="private-account" className="text-sm">
            Private account
          </label>
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium" htmlFor="language">
            Language
          </label>
          <select
            id="language"
            className="input-base mt-1"
            value={settings?.language || 'en'}
            onChange={(e) => setSettings((s: any) => ({ ...s, language: e.target.value }))}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="surface p-6">
        <h1 className="text-lg font-semibold">Notifications</h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Choose what you want to be alerted about.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {NOTIFICATION_PREFS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs[key] !== false}
                onChange={(e) =>
                  setSettings((s: any) => ({
                    ...s,
                    notificationPrefs: { ...(s?.notificationPrefs ?? {}), [key]: e.target.checked },
                  }))
                }
              />
              {label}
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={save} disabled={saving || !settings}>
            {saving ? 'Saving...' : 'Save preferences'}
          </button>
        </div>
      </div>

      <div className="surface p-6">
        <h1 className="text-lg font-semibold">Change password</h1>
        <div className="mt-4 flex flex-col gap-3">
          <input
            type="password"
            className="input-base"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
          <input
            type="password"
            className="input-base"
            placeholder="New password (min 6 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
          <input
            type="password"
            className="input-base"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
          <button
            className="btn-primary self-start"
            onClick={changePassword}
            disabled={changingPassword || !currentPassword || !newPassword}
          >
            {changingPassword ? 'Updating...' : 'Update password'}
          </button>
        </div>
      </div>

      <div className="surface p-6">
        <h1 className="text-lg font-semibold">Blocked accounts</h1>
        {blocked.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">You haven't blocked anyone.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {blocked.map((person) => (
              <div key={person.id} className="flex items-center gap-3">
                <img
                  src={person.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${person.username}`}
                  alt={person.displayName}
                  className="h-10 w-10 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{person.displayName}</div>
                  <div className="truncate text-xs text-slate-500">@{person.username}</div>
                </div>
                <button className="btn-ghost" onClick={() => unblock(person.username)}>
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {platforms.length > 0 && (
        <div className="surface p-6">
          <h1 className="text-lg font-semibold">Quick links</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Open the official apps — BONG CHAT never asks for your passwords there.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {platforms.map((platform) => (
              <a
                key={platform.id}
                href={platform.webUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border border-slate-200/70 bg-white/70 p-4 transition hover:shadow-md dark:border-slate-800/70 dark:bg-slate-900/60"
              >
                <div className="text-sm font-semibold" style={{ color: platform.color }}>
                  {platform.name}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{platform.description}</div>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="surface border-rose-200/70 p-6 dark:border-rose-900/50">
        <h1 className="text-lg font-semibold text-rose-600 dark:text-rose-400">Delete account</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          This permanently removes your account, posts and messages.
        </p>
        {confirmDelete ? (
          <div className="mt-4 flex flex-col gap-3">
            <input
              type="password"
              className="input-base"
              placeholder="Enter your password to confirm"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
            />
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => { setConfirmDelete(false); setDeletePassword('') }}>
                Cancel
              </button>
              <button
                className="btn-primary bg-rose-600 hover:bg-rose-700 active:bg-rose-800"
                onClick={deleteAccount}
                disabled={deleting || !deletePassword}
              >
                {deleting ? 'Deleting...' : 'Permanently delete'}
              </button>
            </div>
          </div>
        ) : (
          <button className="btn-ghost mt-4 text-rose-600 dark:text-rose-400" onClick={() => setConfirmDelete(true)}>
            Delete my account
          </button>
        )}
      </div>
    </div>
  )
}

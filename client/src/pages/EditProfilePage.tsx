import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, apiForm } from '@/lib/api'
import { useToast } from '@/components/common/Toast'
import { Image as ImageIcon } from 'lucide-react'

export function EditProfilePage() {
  const [form, setForm] = useState({ displayName: '', bio: '', avatarUrl: '', coverUrl: '' })
  const [uploading, setUploading] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()

  useEffect(() => {
    api<any>('/users/me').then((d) => {
      const u = d.user
      setForm({ displayName: u.displayName, bio: u.bio || '', avatarUrl: u.avatarUrl || '', coverUrl: '' })
    })
  }, [])

  const upload = async (file: File, key: 'avatarUrl' | 'coverUrl') => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const data = await apiForm<any>('/uploads', formData)
      setForm((f) => ({ ...f, [key]: data.url }))
      toast.push({ title: 'Uploaded', type: 'success' })
    } catch (err: any) {
      toast.push({ title: 'Upload failed', description: err.message, type: 'error' })
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    try {
      await api<any>('/users/me', { method: 'PUT', body: JSON.stringify(form) })
      toast.push({ title: 'Profile updated', type: 'success' })
      navigate('/profile')
    } catch (err: any) {
      toast.push({ title: 'Failed', description: err.message, type: 'error' })
    }
  }

  return (
    <div className="surface p-6">
      <h1 className="text-lg font-semibold">Edit profile</h1>
      <div className="mt-4 flex flex-col gap-4">
        <div>
          <label className="text-sm font-medium">Avatar</label>
          <div className="mt-2 flex items-center gap-3">
            <img
              src={form.avatarUrl || 'https://api.dicebear.com/7.x/avataaars/svg'}
              alt="Avatar preview"
              className="h-16 w-16 rounded-full object-cover"
            />
            <label className="btn-ghost cursor-pointer">
              <ImageIcon className="h-4 w-4" />
              Upload
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'avatarUrl')} />
            </label>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="displayName">
            Display name
          </label>
          <input
            id="displayName"
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900/80"
            value={form.displayName}
            onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="bio">
            Bio
          </label>
          <textarea
            id="bio"
            rows={3}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm dark:border-slate-800 dark:bg-slate-900/80"
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
          />
        </div>
        <button className="btn-primary self-end" onClick={save} disabled={uploading}>
          Save
        </button>
      </div>
    </div>
  )
}

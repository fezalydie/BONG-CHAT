import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { useToast } from '@/components/common/Toast'

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const toast = useToast()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api<any>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) })
      setDone(true)
      toast.push({ title: 'Password reset', type: 'success' })
    } catch (err: any) {
      toast.push({ title: 'Error', description: err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md surface p-8">
        <h1 className="text-xl font-semibold">Reset password</h1>
        {done ? (
          <div className="mt-4 text-sm text-emerald-600">Password updated. You can sign in now.</div>
        ) : (
          <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
              placeholder="New password (min 6 chars)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button className="btn-primary" disabled={loading} type="submit">
              {loading ? 'Resetting...' : 'Reset password'}
            </button>
          </form>
        )}
        <Link to="/auth" className="mt-4 inline-block text-sm text-brand-600">Back to sign in</Link>
      </div>
    </div>
  )
}

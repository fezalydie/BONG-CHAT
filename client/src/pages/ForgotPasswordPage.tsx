import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { useToast } from '@/components/common/Toast'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const toast = useToast()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api<any>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
      setSent(true)
    } catch (err: any) {
      toast.push({ title: 'Error', description: err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md surface p-8">
        <h1 className="text-xl font-semibold">Forgot password</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Enter your email to receive a reset link</p>
        {sent ? (
          <div className="mt-4 text-sm text-emerald-600">If that email exists, a reset link has been sent.</div>
        ) : (
          <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button className="btn-primary" disabled={loading} type="submit">
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}
        <Link to="/auth" className="mt-4 inline-block text-sm text-brand-600">Back to sign in</Link>
      </div>
    </div>
  )
}

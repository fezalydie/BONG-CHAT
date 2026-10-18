import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/common/Toast'

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState({
    username: '',
    email: '',
    displayName: '',
    password: '',
    identifier: '',
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'login') {
        await login({ identifier: form.identifier, password: form.password })
        toast.push({ title: 'Welcome back!', type: 'success' })
      } else {
        await register({
          username: form.username,
          email: form.email,
          displayName: form.displayName || form.username,
          password: form.password,
        })
        toast.push({ title: 'Account created', type: 'success' })
      }
      navigate('/')
    } catch (err: any) {
      toast.push({ title: 'Error', description: err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md surface p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-white font-semibold text-lg">
            B
          </div>
          <h1 className="text-2xl font-semibold">BONG CHAT</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Chat, post, and connect with quick access to Facebook, Instagram & WhatsApp
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === 'login' ? (
            <>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900/80"
                placeholder="Username or email"
                value={form.identifier}
                onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))}
                required
              />
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900/80"
                placeholder="Password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
              />
              <Link to="/forgot-password" className="self-end text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400">
                Forgot password?
              </Link>
            </>
          ) : (
            <>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900/80"
                placeholder="Username"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                required
              />
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900/80"
                placeholder="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900/80"
                placeholder="Display name"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              />
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900/80"
                placeholder="Password (min 6 chars)"
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
              />
            </>
          )}
          <button className="btn-primary mt-2" disabled={loading} type="submit">
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button className="text-brand-600 hover:text-brand-700 dark:text-brand-400" onClick={() => setMode('register')}>
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button className="text-brand-600 hover:text-brand-700 dark:text-brand-400" onClick={() => setMode('login')}>
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

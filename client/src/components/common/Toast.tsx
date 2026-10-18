import { createContext, useContext, useEffect, useMemo, useState } from 'react'

interface Toast {
  id: string
  title?: string
  description?: string
  type?: 'success' | 'error' | 'info'
}

interface ToastContextValue {
  push: (t: Omit<Toast, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let idCounter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = (t: Omit<Toast, 'id'>) => {
    const id = String(++idCounter)
    const toast: Toast = { id, type: 'info', ...t }
    setToasts((prev) => [toast, ...prev].slice(0, 5))
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id))
    }, 3000)
  }

  const value = useMemo(() => ({ push }), [])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto glass rounded-2xl px-4 py-3 text-sm shadow-soft"
          >
            {t.title && <div className="font-semibold">{t.title}</div>}
            {t.description && <div className="text-slate-600 dark:text-slate-300">{t.description}</div>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

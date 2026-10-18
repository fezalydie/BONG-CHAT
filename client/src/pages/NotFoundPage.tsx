import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export function NotFoundPage() {
  return (
    <div className="surface flex flex-col items-center gap-4 p-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        <Compass className="h-8 w-8 text-slate-400" />
      </div>
      <div>
        <div className="text-3xl font-semibold">404</div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          This page doesn't exist. It may have been moved or deleted.
        </p>
      </div>
      <Link to="/" className="btn-primary">
        Back to feed
      </Link>
    </div>
  )
}

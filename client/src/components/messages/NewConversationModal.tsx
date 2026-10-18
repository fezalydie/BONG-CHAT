import { useEffect, useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { PublicUser } from '@/types/user'
import { Modal } from '@/components/common/Modal'
import { useToast } from '@/components/common/Toast'
import { useAuth } from '@/context/AuthContext'

interface NewConversationModalProps {
  open: boolean
  onClose: () => void
  onStarted: (conversationId: number) => void
}

export function NewConversationModal({ open, onClose, onStarted }: NewConversationModalProps) {
  const { user } = useAuth()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PublicUser[]>([])
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState<number | null>(null)

  // Reset the search every time the dialog is reopened.
  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    const timer = setTimeout(
      async () => {
        try {
          const term = query.trim()
          const data = await api<any>(
            term ? `/search?q=${encodeURIComponent(term)}&type=users` : '/users/suggestions',
          )
          if (active) setResults((data.users ?? []).filter((u: PublicUser) => u.id !== user?.id))
        } catch {
          if (active) setResults([])
        } finally {
          if (active) setLoading(false)
        }
      },
      query ? 250 : 0,
    )
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query, open, user?.id])

  const start = async (person: PublicUser) => {
    setStarting(person.id)
    try {
      const data = await api<{ conversationId: number }>('/messages/conversations', {
        method: 'POST',
        body: JSON.stringify({ username: person.username }),
      })
      onStarted(data.conversationId)
      onClose()
    } catch (err: any) {
      toast.push({ title: 'Could not start chat', description: err.message, type: 'error' })
    } finally {
      setStarting(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New message">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search people…"
          className="input-base pl-9"
        />
      </div>

      <div className="mt-3 flex max-h-80 flex-col gap-1 overflow-y-auto">
        {loading && results.length === 0 && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
          </div>
        )}
        {!loading && results.length === 0 && (
          <div className="py-6 text-center text-sm text-ink-400">
            {query.trim() ? 'No people found.' : 'No suggestions right now.'}
          </div>
        )}
        {results.map((person) => (
          <button
            key={person.id}
            className="flex items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-ink-100 dark:hover:bg-ink-800"
            onClick={() => void start(person)}
            disabled={starting !== null}
          >
            <img
              src={person.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${person.username}`}
              alt={person.displayName}
              className="h-10 w-10 rounded-full object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{person.displayName}</div>
              <div className="truncate text-xs text-ink-500">@{person.username}</div>
            </div>
            {starting === person.id && <Loader2 className="h-4 w-4 animate-spin text-ink-400" />}
          </button>
        ))}
      </div>
    </Modal>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api, apiForm } from '@/lib/api'
import type { Conversation, ChatMessage } from '@/types/chat'
import { useAuth } from '@/context/AuthContext'
import { useSocket, useSocketEvent } from '@/context/SocketContext'
import { Send, Search, ChevronLeft, Image as ImageIcon, Plus, Loader2 } from 'lucide-react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useToast } from '@/components/common/Toast'
import { NewConversationModal } from '@/components/messages/NewConversationModal'

dayjs.extend(relativeTime)

export function MessagesPage() {
  const { id } = useParams<{ id: string }>()
  const cid = id ? Number(id) : null
  const { user } = useAuth()
  const { refreshUnreadMessages, isUserOnline } = useSocket()
  const toast = useToast()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [content, setContent] = useState('')
  const [composing, setComposing] = useState(false)
  const [sendingImage, setSendingImage] = useState(false)
  const [convQuery, setConvQuery] = useState('')
  const convQueryRef = useRef('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [threadError, setThreadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  // Set while prepending older pages so the view doesn't jump to the bottom.
  const preserveScrollRef = useRef(false)

  const loadConversations = async () => {
    const q = convQueryRef.current.trim()
    try {
      const data = await api<any>(
        q ? `/messages/conversations?q=${encodeURIComponent(q)}` : '/messages/conversations',
      )
      setConversations(data.conversations)
      setLoadError(null)
      void refreshUnreadMessages()
    } catch (err: any) {
      setLoadError(err?.message || 'Could not load your conversations.')
    }
  }

  const loadMessages = async () => {
    if (!cid) return
    try {
      const data = await api<any>(`/messages/conversations/${cid}/messages`)
      setMessages(data.messages)
      setHasMore(Boolean(data.hasMore))
      await api<any>(`/messages/conversations/${cid}/read`, { method: 'POST' })
      setThreadError(null)
      void refreshUnreadMessages()
    } catch (err: any) {
      setThreadError(err?.message || 'Could not load this conversation.')
    }
  }

  // Fetch the page of history older than what's already on screen.
  const loadOlder = async () => {
    if (!cid || loadingOlder || messages.length === 0) return
    setLoadingOlder(true)
    preserveScrollRef.current = true
    try {
      const oldest = messages[0].id
      const data = await api<any>(`/messages/conversations/${cid}/messages?before=${oldest}`)
      setMessages((list) => [...data.messages, ...list])
      setHasMore(Boolean(data.hasMore))
    } catch (err: any) {
      preserveScrollRef.current = false
      toast.push({ title: 'Could not load older messages', description: err.message, type: 'error' })
    } finally {
      setLoadingOlder(false)
    }
  }

  // Reload the list whenever the search term changes (debounced while typing).
  useEffect(() => {
    const timer = setTimeout(() => {
      convQueryRef.current = convQuery
      void loadConversations()
    }, convQuery ? 250 : 0)
    return () => clearTimeout(timer)
  }, [convQuery])

  useEffect(() => {
    loadMessages()
  }, [cid])

  // Keep the newest message in view, except when older history is being prepended.
  useEffect(() => {
    if (preserveScrollRef.current) {
      preserveScrollRef.current = false
      return
    }
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, cid])

  useSocketEvent('message:new', (incoming: ChatMessage) => {
    if (incoming.conversationId !== cid) return
    setMessages((list) => (list.some((m) => m.id === incoming.id) ? list : [...list, incoming]))
    void (async () => {
      try {
        await api<any>(`/messages/conversations/${cid}/read`, { method: 'POST' })
        await refreshUnreadMessages()
      } catch {}
    })()
  })

  useSocketEvent('conversation:updated', () => {
    loadConversations()
  })

  // Another tab/device marked a conversation read — refresh its row and the badge.
  useSocketEvent('conversation:read', (payload: { conversationId?: number }) => {
    if (payload?.conversationId === cid) return
    loadConversations()
  })

  const send = async () => {
    if (!cid || (!content.trim())) return
    try {
      const data = await api<any>(`/messages/conversations/${cid}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      })
      setMessages((m) => [...m, data.message])
      setContent('')
      await loadConversations()
      await refreshUnreadMessages()
    } catch (err: any) {
      toast.push({ title: 'Failed', description: err.message, type: 'error' })
    }
  }

  const sendImage = async (file?: File) => {
    if (!file || !cid) return
    setSendingImage(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const uploaded = await apiForm<{ url: string }>('/uploads', form)
      const data = await api<any>(`/messages/conversations/${cid}/messages`, {
        method: 'POST',
        body: JSON.stringify({ imageUrl: uploaded.url }),
      })
      setMessages((m) => [...m, data.message])
      loadConversations()
      await refreshUnreadMessages()
    } catch (err: any) {
      toast.push({ title: 'Could not send photo', description: err.message, type: 'error' })
    } finally {
      setSendingImage(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const active = conversations.find((c) => c.id === cid)
  const activeOnline = active ? (isUserOnline(active.user.id) || active.user.online) : false


  return (
    <div className="surface flex h-[calc(100vh-8rem)] overflow-hidden">
      <div className={`${cid ? 'hidden md:flex' : 'flex'} w-full flex-col border-r border-slate-200/70 dark:border-slate-800/70 md:w-80`}>
        <div className="border-b border-slate-200/70 p-4 dark:border-slate-800/70">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">Messages</div>
            <button
              className="btn-ghost h-9 w-9 rounded-full p-0"
              title="New message"
              onClick={() => setComposing(true)}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="border-b border-slate-200/70 p-3 dark:border-slate-800/70">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={convQuery}
              onChange={(e) => setConvQuery(e.target.value)}
              placeholder="Search conversations"
              className="input-base py-2 pl-9 text-sm"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadError && (
            <div
              className="m-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-center text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
              role="alert"
            >
              {loadError}
              <button className="btn-ghost mt-2 w-full text-xs" onClick={() => void loadConversations()}>
                Try again
              </button>
            </div>
          )}
          {!loadError && conversations.length === 0 && (
            <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              {convQuery.trim() ? 'No conversations match your search.' : 'No conversations yet.'}
            </div>
          )}
          {conversations.map((c) => (
            <Link
              key={c.id}
              to={`/messages/${c.id}`}
              className={`flex items-center gap-3 p-3 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 ${cid === c.id ? 'bg-slate-100/90 dark:bg-slate-800/80' : ''}`}
            >
              <img
                src={c.user.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.user.username}`}
                alt={c.user.displayName}
                className="h-10 w-10 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <div className="truncate text-sm font-semibold">{c.user.displayName}</div>
                  {c.unreadCount > 0 && <span className="h-2 w-2 rounded-full bg-brand-600" />}
                </div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {c.lastMessage?.content || 'No messages yet'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className={`${cid ? 'flex' : 'hidden md:flex'} flex-1 flex-col`}>
        {cid ? (
          <>
            <div className="flex items-center gap-3 border-b border-slate-200/70 p-4 dark:border-slate-800/70">
              <button
                className="btn-ghost h-9 w-9 rounded-full p-0 md:hidden"
                title="Back to conversations"
                onClick={() => navigate('/messages')}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              {active && (
                <>
                  <img
                    src={active.user.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${active.user.username}`}
                    alt={active.user.displayName}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                  <div>
                    <div className="text-sm font-semibold">{active.user.displayName}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {activeOnline ? 'Online' : 'Offline'}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mx-auto flex max-w-2xl flex-col gap-2">
                {threadError && (
                  <div
                    className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-center text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
                    role="alert"
                  >
                    {threadError}
                    <button className="btn-ghost mt-2 w-full text-xs" onClick={() => void loadMessages()}>
                      Try again
                    </button>
                  </div>
                )}
                {hasMore && (
                  <div className="flex justify-center pb-1">
                    <button
                      className="btn-ghost text-xs"
                      onClick={() => void loadOlder()}
                      disabled={loadingOlder}
                    >
                      {loadingOlder && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Load older messages
                    </button>
                  </div>
                )}
                {messages.length === 0 && !threadError && (
                  <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    No messages yet — say hello 👋
                  </div>
                )}
                {messages.map((m) => {
                  const mine = m.sender.id === user?.id
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-3xl px-4 py-2 text-sm ${mine ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
                        {m.imageUrl && (
                          <img
                            src={m.imageUrl}
                            alt={mine ? 'Photo you sent' : `Photo from ${m.sender.displayName}`}
                            className="mb-2 rounded-2xl"
                          />
                        )}
                        <div className="whitespace-pre-wrap">{m.content}</div>
                        <div className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-slate-500'}`}>{dayjs(m.createdAt).fromNow()}</div>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>
            </div>
            <div className="border-t border-slate-200/70 p-4 dark:border-slate-800/70">
              <div className="mx-auto flex max-w-2xl gap-2">
                <input
                  className="flex-1 rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
                  placeholder="Type a message..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => void sendImage(e.target.files?.[0])}
                />
                <button
                  className="btn-ghost"
                  title="Send a photo"
                  onClick={() => fileRef.current?.click()}
                  disabled={sendingImage}
                >
                  {sendingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                </button>
                <button className="btn-primary" onClick={send} aria-label="Send message">
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-slate-500">
            <span>Select a conversation</span>
            <button className="btn-primary" onClick={() => setComposing(true)}>
              <Plus className="h-4 w-4" />
              New message
            </button>
          </div>
        )}
      </div>

      <NewConversationModal
        open={composing}
        onClose={() => setComposing(false)}
        onStarted={async (conversationId) => {
          await loadConversations()
          await refreshUnreadMessages()
          navigate(`/messages/${conversationId}`)
        }}
      />
    </div>
  )
}

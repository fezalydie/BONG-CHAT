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
import { LinkifiedText } from '@/components/common/LinkifiedText'
import { NewConversationModal } from '@/components/messages/NewConversationModal'
import { storyGradient } from '@/lib/stories'

dayjs.extend(relativeTime)

export function MessagesPage() {
  const { id } = useParams<{ id: string }>()
  const cid = id ? Number(id) : null
  const { user } = useAuth()
  const { refreshUnreadMessages, isUserOnline, sendTyping } = useSocket()
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
  const [threadLoading, setThreadLoading] = useState(false)
  // Incremented on every thread load so stale responses can be discarded.
  const threadRequestRef = useRef(0)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  // Set while prepending older pages so the view doesn't jump to the bottom.
  const preserveScrollRef = useRef(false)
  // Whether the newest message is in view; a new message only forces a scroll when true.
  const atBottomRef = useRef(true)
  const [partnerTyping, setPartnerTyping] = useState(false)
  const typingSentRef = useRef(false)
  const typingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The other participant's user id for the open conversation (for filtering typing events).
  const activeUserIdRef = useRef<number | null>(null)
  // Safety timer that clears the incoming "typing" indicator on its own, so it
  // can never get stuck if the sender disappears or a "stop-typing" is lost.
  const partnerTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    // Ignore a slow response that arrives after the user opened another thread.
    const request = ++threadRequestRef.current
    setThreadLoading(true)
    try {
      const data = await api<any>(`/messages/conversations/${cid}/messages`)
      if (request !== threadRequestRef.current) return
      setMessages(data.messages)
      setHasMore(Boolean(data.hasMore))
      await api<any>(`/messages/conversations/${cid}/read`, { method: 'POST' })
      setThreadError(null)
      void refreshUnreadMessages()
    } catch (err: any) {
      if (request === threadRequestRef.current) {
        setThreadError(err?.message || 'Could not load this conversation.')
      }
    } finally {
      if (request === threadRequestRef.current) setThreadLoading(false)
    }
  }

  // Fetch the page of history older than what's already on screen.
  const loadOlder = async () => {
    if (!cid || loadingOlder || messages.length === 0 || !hasMore) return
    setLoadingOlder(true)
    preserveScrollRef.current = true
    const box = scrollRef.current
    const previousHeight = box?.scrollHeight ?? 0
    try {
      const oldest = messages[0].id
      const data = await api<any>(`/messages/conversations/${cid}/messages?before=${oldest}`)
      setMessages((list) => [...data.messages, ...list])
      setHasMore(Boolean(data.hasMore))
      // Keep the messages the reader was looking at in the same place.
      if (box) {
        requestAnimationFrame(() => {
          box.scrollTop = box.scrollHeight - previousHeight
        })
      }
    } catch (err: any) {
      preserveScrollRef.current = false
      toast.push({ title: 'Could not load older messages', description: err.message, type: 'error' })
    } finally {
      setLoadingOlder(false)
    }
  }

  // Infinite scroll: reaching the top pulls in the next page of history.
  const onScroll = () => {
    const box = scrollRef.current
    if (!box) return
    const distanceFromBottom = box.scrollHeight - box.scrollTop - box.clientHeight
    atBottomRef.current = distanceFromBottom < 80
    if (box.scrollTop < 60) void loadOlder()
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
    // Opening a conversation should always land on the newest message.
    atBottomRef.current = true
    clearPartnerTyping()
    typingSentRef.current = false
    if (typingStopRef.current) {
      clearTimeout(typingStopRef.current)
      typingStopRef.current = null
    }
    // Never leave the previous conversation's thread on screen under the new
    // header while the next page loads.
    setMessages([])
    setHasMore(false)
    setThreadError(null)
    loadMessages()
  }, [cid])

  // Tell the other person when I start and stop typing (throttled to one
  // "typing" event per burst, with an automatic "stop" after a short idle).
  const notifyTyping = (value: string) => {
    const partnerId = activeUserIdRef.current
    if (!cid || !partnerId) return
    if (value.trim() && !typingSentRef.current) {
      typingSentRef.current = true
      sendTyping(partnerId, cid, true)
    }
    if (typingStopRef.current) clearTimeout(typingStopRef.current)
    typingStopRef.current = setTimeout(() => {
      if (typingSentRef.current) {
        typingSentRef.current = false
        sendTyping(partnerId, cid, false)
      }
    }, 1800)
  }

  // Show the "typing" indicator for a short while, refreshing it on every
  // keystroke event. It always clears itself, so a dropped "stop-typing" (or a
  // sender who closes the tab mid-sentence) can never leave the dots stuck.
  const flashPartnerTyping = () => {
    setPartnerTyping(true)
    if (partnerTypingTimeoutRef.current) clearTimeout(partnerTypingTimeoutRef.current)
    partnerTypingTimeoutRef.current = setTimeout(() => {
      setPartnerTyping(false)
      partnerTypingTimeoutRef.current = null
    }, 4000)
  }

  const clearPartnerTyping = () => {
    if (partnerTypingTimeoutRef.current) {
      clearTimeout(partnerTypingTimeoutRef.current)
      partnerTypingTimeoutRef.current = null
    }
    setPartnerTyping(false)
  }

  // Clear both timers on unmount so nothing fires after leaving the page.
  useEffect(
    () => () => {
      if (typingStopRef.current) clearTimeout(typingStopRef.current)
      if (partnerTypingTimeoutRef.current) clearTimeout(partnerTypingTimeoutRef.current)
    },
    [],
  )

  // Keep the newest message in view, except when older history is being prepended
  // or the reader has deliberately scrolled up into the history.
  useEffect(() => {
    if (preserveScrollRef.current) {
      preserveScrollRef.current = false
      return
    }
    if (!atBottomRef.current) return
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, cid])

  useSocketEvent('message:new', (incoming: ChatMessage) => {
    if (incoming.conversationId !== cid) return
    // A real message supersedes the typing indicator immediately.
    clearPartnerTyping()
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

  // The other person started/stopped typing in this conversation.
  useSocketEvent('typing', (payload: { conversationId?: number; userId?: number }) => {
    if (payload?.conversationId === cid && payload.userId === activeUserIdRef.current) {
      flashPartnerTyping()
    }
  })
  useSocketEvent('stop-typing', (payload: { conversationId?: number; userId?: number }) => {
    if (payload?.conversationId === cid && payload.userId === activeUserIdRef.current) {
      clearPartnerTyping()
    }
  })

  // Another tab/device marked a conversation read — refresh its row and the badge.
  useSocketEvent('conversation:read', (payload: { conversationId?: number }) => {
    if (payload?.conversationId === cid) return
    loadConversations()
  })

  const send = async () => {
    if (!cid || (!content.trim())) return
    // Sending ends the typing burst immediately.
    if (typingSentRef.current && activeUserIdRef.current) {
      typingSentRef.current = false
      if (typingStopRef.current) clearTimeout(typingStopRef.current)
      sendTyping(activeUserIdRef.current, cid, false)
    }
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
  // Prefer the conversation row; fall back to the other sender in the thread so
  // typing/stop-typing still match when a conversation is opened by direct link.
  const activeUserId =
    active?.user.id ??
    messages.find((m) => m.sender.id !== user?.id)?.sender.id ??
    null
  // Keep the ref in sync after render; the typing handlers read it at event time.
  useEffect(() => {
    activeUserIdRef.current = activeUserId
  }, [activeUserId])


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
                  {c.lastMessage?.content || (c.lastMessage?.imageUrl ? '📷 Photo' : 'No messages yet')}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className={`${cid ? 'flex' : 'hidden md:flex'} flex-1 flex-col`}>
        {cid ? (
          <>
            {active && active.user.id !== user?.id && (
              <div className="flex items-center gap-3 border-b border-slate-200/70 p-4 dark:border-slate-800/70">
                <button
                  className="btn-ghost h-9 w-9 rounded-full p-0 md:hidden"
                  title="Back to conversations"
                  onClick={() => navigate('/messages')}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <Link to={`/profile/${active.user.username}`}>
                  <img
                    src={active.user.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${active.user.username}`}
                    alt={active.user.displayName}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                </Link>
                <Link to={`/profile/${active.user.username}`} className="min-w-0">
                  <div className="text-sm font-semibold">{active.user.displayName}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {activeOnline ? 'Online' : 'Offline'}
                  </div>
                </Link>
              </div>
            )}
            {cid && !active && (
              <div className="flex items-center gap-3 border-b border-slate-200/70 p-4 dark:border-slate-800/70">
                <button
                  className="btn-ghost h-9 w-9 rounded-full p-0 md:hidden"
                  title="Back to conversations"
                  onClick={() => navigate('/messages')}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700" />
                <div>
                  <div className="text-sm font-semibold">Conversation</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {activeOnline ? 'Online' : 'Offline'}
                  </div>
                </div>
              </div>
            )}
            <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-4">
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
                      {loadingOlder ? 'Loading…' : 'Load older messages'}
                    </button>
                  </div>
                )}
                {threadLoading && (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  </div>
                )}
                {messages.length === 0 && !threadError && !threadLoading && (
                  <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    No messages yet — say hello 👋
                  </div>
                )}
                {messages.map((m) => {
                  const mine = m.sender.id === user?.id
                  const storyLabel = !m.story
                    ? ''
                    : mine
                      ? 'You replied to a story'
                      : m.story.authorId === user?.id
                        ? 'Replied to your story'
                        : `Replied to @${m.story.authorUsername}'s story`
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-3xl px-4 py-2 text-sm ${mine ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
                        {m.story && (
                          <div
                            className={`mb-2 flex items-center gap-2 rounded-2xl p-2 ${
                              mine ? 'bg-white/15' : 'bg-white dark:bg-slate-900/60'
                            }`}
                          >
                            {m.story.imageUrl ? (
                              <img
                                src={m.story.imageUrl}
                                alt="Story"
                                className="h-12 w-12 shrink-0 rounded-xl object-cover"
                              />
                            ) : m.story.videoUrl ? (
                              <video
                                src={m.story.videoUrl}
                                muted
                                preload="metadata"
                                className="h-12 w-12 shrink-0 rounded-xl object-cover"
                              />
                            ) : (
                              <div
                                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[10px] font-semibold text-white ${storyGradient(m.story.style)}`}
                              >
                                Story
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-[11px] font-semibold">{storyLabel}</div>
                              {m.story.content && (
                                <div
                                  className={`truncate text-[11px] ${
                                    mine ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'
                                  }`}
                                >
                                  {m.story.content}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {m.imageUrl && (
                          <img
                            src={m.imageUrl}
                            alt={mine ? 'Photo you sent' : `Photo from ${m.sender.displayName}`}
                            className="mb-2 rounded-2xl"
                          />
                        )}
                        <div className="whitespace-pre-wrap break-words">
                          <LinkifiedText
                            text={m.content}
                            parts={m.parts}
                            linkClassName={`break-all underline decoration-1 underline-offset-2 ${mine ? 'text-white' : 'text-brand-600 dark:text-brand-400'}`}
                          />
                        </div>
                        <div className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-slate-500'}`}>{dayjs(m.createdAt).fromNow()}</div>
                      </div>
                    </div>
                  )
                })}
                {partnerTyping && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1 rounded-3xl bg-slate-100 px-4 py-3 dark:bg-slate-800">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>
            <div className="border-t border-slate-200/70 p-4 dark:border-slate-800/70">
              <div className="mx-auto flex max-w-2xl gap-2">
                <input
                  className="flex-1 rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
                  placeholder="Type a message..."
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value)
                    notifyTyping(e.target.value)
                  }}
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

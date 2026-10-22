import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { Send, Sparkles, Loader2, Eraser, Sparkle } from 'lucide-react'
import { useToast } from '@/components/common/Toast'
import { AssistantMessage } from '@/components/ai/AssistantMessage'

interface Message {
  role: 'user' | 'assistant'
  content: string
  source?: 'builtin' | 'provider'
}

export function AIPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [assistantName, setAssistantName] = useState('Bongy')
  const toast = useToast()
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    api<any>('/ai/suggestions')
      .then((d) => {
        setSuggestions(d.prompts)
        if (d.assistant?.name) setAssistantName(d.assistant.name)
      })
      .catch(() => {})
  }, [])

  // Keep the newest turn in view as the conversation grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, loading])

  const send = async (text: string) => {
    const msg = text.trim()
    if (!msg || loading) return
    const history = [...messages]
    setMessages((m) => [...m, { role: 'user', content: msg }])
    setInput('')
    setLoading(true)
    try {
      const data = await api<any>('/ai/message', {
        method: 'POST',
        body: JSON.stringify({ message: msg, history }),
      })
      setMessages((m) => [...m, { role: 'assistant', content: data.reply, source: data.source }])
    } catch (err: any) {
      toast.push({ title: 'Bongy could not answer', description: err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const clear = () => {
    setMessages([])
    setInput('')
  }

  return (
    <div className="surface flex h-[calc(100vh-8rem)] flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-200/70 p-4 dark:border-slate-800/70">
        <Sparkles className="h-5 w-5 text-brand-600" />
        <div className="flex-1">
          <div className="font-semibold">{assistantName} — AI Assistant</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Ask anything about BONG CHAT</div>
        </div>
        {messages.length > 0 && (
          <button className="btn-ghost text-xs" onClick={clear} title="Clear conversation">
            <Eraser className="h-4 w-4" />
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {messages.length === 0 && (
            <>
              <div className="rounded-3xl bg-ink-100/70 p-4 text-sm text-ink-600 dark:bg-ink-800/60 dark:text-ink-300">
                Hi, I'm <strong>{assistantName}</strong> 👋 — your guide to BONG CHAT. Pick a question or type
                your own below.
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button key={s} className="btn-ghost" onClick={() => send(s)}>
                    <Sparkle className="h-3.5 w-3.5" />
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-3xl px-4 py-2.5 text-sm ${
                  m.role === 'user'
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800'
                }`}
              >
                {m.role === 'assistant' ? (
                  <>
                    <AssistantMessage text={m.content} />
                    {m.source === 'builtin' && (
                      <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                        Answered by the built-in assistant
                      </div>
                    )}
                  </>
                ) : (
                  <div className="whitespace-pre-wrap">{m.content}</div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-3xl bg-slate-100 px-4 py-2.5 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {assistantName} is thinking…
              </div>
            </div>
          )}

          {/* Keep the prompt chips reachable once the conversation has started. */}
          {messages.length > 0 && !loading && (
            <div className="flex flex-wrap gap-2 pt-1">
              {suggestions.slice(0, 3).map((s) => (
                <button key={s} className="btn-ghost text-xs" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-slate-200/70 p-4 dark:border-slate-800/70">
        <div className="mx-auto flex max-w-2xl gap-2">
          <input
            className="input-base"
            placeholder={`Ask ${assistantName}…`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send(input)}
          />
          <button className="btn-primary" onClick={() => send(input)} disabled={loading || !input.trim()} aria-label="Send">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}

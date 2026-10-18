import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Send, Sparkles } from 'lucide-react'
import { useToast } from '@/components/common/Toast'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function AIPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const toast = useToast()

  useEffect(() => {
    api<any>('/ai/suggestions').then((d) => setSuggestions(d.prompts))
  }, [])

  const send = async (text: string) => {
    const msg = text.trim()
    if (!msg) return
    const history = [...messages]
    setMessages((m) => [...m, { role: 'user', content: msg }])
    setInput('')
    setLoading(true)
    try {
      const data = await api<any>('/ai/message', { method: 'POST', body: JSON.stringify({ message: msg, history }) })
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }])
    } catch (err: any) {
      toast.push({ title: 'Failed', description: err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="surface flex h-[calc(100vh-8rem)] flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-200/70 p-4 dark:border-slate-800/70">
        <Sparkles className="h-5 w-5 text-brand-600" />
        <div>
          <div className="font-semibold">Bongy — AI Assistant</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Ask anything about BONG CHAT</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {messages.length === 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button key={s} className="btn-ghost" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-3xl px-4 py-2 text-sm ${m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && <div className="text-center text-xs text-slate-500">Bongy is thinking...</div>}
        </div>
      </div>
      <div className="border-t border-slate-200/70 p-4 dark:border-slate-800/70">
        <div className="mx-auto flex max-w-2xl gap-2">
          <input
            className="flex-1 rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
            placeholder="Ask Bongy..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send(input)}
          />
          <button className="btn-primary" onClick={() => send(input)}>
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

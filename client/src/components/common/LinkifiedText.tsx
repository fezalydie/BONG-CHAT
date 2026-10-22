import type { ReactNode } from 'react'

/**
 * Splits text into plain-text and URL segments so shared links become clickable.
 * Mirrors the server's `linkify` helper (http(s):// and www. hosts).
 */
const LINK_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi

export function linkifyText(text: string): Array<{ type: 'text' | 'link'; value: string }> {
  const parts: Array<{ type: 'text' | 'link'; value: string }> = []
  let lastIndex = 0
  for (const match of text.matchAll(LINK_RE)) {
    const start = match.index ?? 0
    if (start > lastIndex) parts.push({ type: 'text', value: text.slice(lastIndex, start) })
    parts.push({ type: 'link', value: match[0] })
    lastIndex = start + match[0].length
  }
  if (lastIndex < text.length) parts.push({ type: 'text', value: text.slice(lastIndex) })
  return parts
}

interface LinkifiedTextProps {
  text: string
  /** Pre-split segments from the server; computed locally when omitted. */
  parts?: Array<{ type: 'text' | 'link'; value: string }>
  className?: string
  linkClassName?: string
}

/**
 * Renders user-authored text with clickable links. Links open in a new tab and
 * never leak the opener. Plain text keeps its newlines via `whitespace-pre-wrap`
 * on the caller's element.
 */
export function LinkifiedText({ text, parts, className, linkClassName }: LinkifiedTextProps) {
  const segments = parts && parts.length > 0 ? parts : linkifyText(text)
  if (segments.length === 0) return <span className={className}>{text}</span>
  return (
    <span className={className}>
      {segments.map((part, i): ReactNode =>
        part.type === 'link' ? (
          <a
            key={i}
            href={/^https?:\/\//i.test(part.value) ? part.value : `https://${part.value}`}
            target="_blank"
            rel="noopener noreferrer"
            className={
              linkClassName ??
              'break-all underline decoration-1 underline-offset-2 hover:opacity-80'
            }
          >
            {part.value}
          </a>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </span>
  )
}

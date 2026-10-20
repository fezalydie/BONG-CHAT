/**
 * A deliberately tiny formatter for the assistant's replies.
 *
 * The built-in "Bongy" engine only ever emits a small, predictable subset of
 * markdown — **bold**, `•` / `-` bullets, `1.` numbered steps and blank-line
 * paragraphs. Rather than pull in a full markdown parser for that, this splits
 * the text into blocks and splits inline emphasis into spans. It renders text
 * as React nodes, so it never uses dangerouslySetInnerHTML.
 */
import type { ReactNode } from 'react'

/** Turn `**bold**` runs into <strong> elements, leaving the rest as text. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  parts.forEach((part, index) => {
    if (!part) return
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      nodes.push(<strong key={`${keyPrefix}-b${index}`}>{part.slice(2, -2)}</strong>)
    } else {
      nodes.push(<span key={`${keyPrefix}-t${index}`}>{part}</span>)
    }
  })
  return nodes
}

interface Block {
  type: 'p' | 'ul' | 'ol'
  items: string[]
}

/** Group consecutive lines of the same kind into blocks. */
function toBlocks(text: string): Block[] {
  const blocks: Block[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const bullet = /^[•\-*]\s+/.test(line) ? line.replace(/^[•\-*]\s+/, '') : null
    const numbered = /^\d+\.\s+/.test(line) ? line.replace(/^\d+\.\s+/, '') : null
    const item = bullet ?? numbered ?? line
    const type: Block['type'] = bullet ? 'ul' : numbered ? 'ol' : 'p'
    const last = blocks[blocks.length - 1]
    if (last && last.type === type && type !== 'p') last.items.push(item)
    else blocks.push({ type, items: [item] })
  }
  return blocks
}

export function AssistantMessage({ text }: { text: string }) {
  const blocks = toBlocks(text)
  return (
    <div className="space-y-2">
      {blocks.map((block, blockIndex) => {
        if (block.type === 'ul' || block.type === 'ol') {
          const List = block.type === 'ul' ? 'ul' : 'ol'
          return (
            <List
              key={`list-${blockIndex}`}
              className={block.type === 'ul' ? 'list-disc space-y-1 pl-5' : 'list-decimal space-y-1 pl-5'}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`li-${blockIndex}-${itemIndex}`}>{inline(item, `li-${blockIndex}-${itemIndex}`)}</li>
              ))}
            </List>
          )
        }
        return (
          <p key={`p-${blockIndex}`}>{inline(block.items[0], `p-${blockIndex}`)}</p>
        )
      })}
    </div>
  )
}

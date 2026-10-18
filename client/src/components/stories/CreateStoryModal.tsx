import { useRef, useState } from 'react'
import { Image as ImageIcon, Type as TypeIcon, Loader2 } from 'lucide-react'
import { api, apiForm } from '@/lib/api'
import { STORY_GRADIENTS, STORY_STYLES } from '@/lib/stories'
import { Modal } from '@/components/common/Modal'
import { useToast } from '@/components/common/Toast'
import { cn } from '@/utils/cn'

interface CreateStoryModalProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function CreateStoryModal({ open, onClose, onCreated }: CreateStoryModalProps) {
  const toast = useToast()
  const [content, setContent] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [style, setStyle] = useState('sunset')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const reset = () => {
    setContent('')
    setImageUrl('')
    setStyle('sunset')
  }

  const attach = async (file?: File) => {
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const data = await apiForm<{ url: string }>('/uploads', form)
      setImageUrl(data.url)
    } catch (err: any) {
      toast.push({ title: 'Upload failed', description: err.message, type: 'error' })
    } finally {
      setUploading(false)
    }
  }

  const publish = async () => {
    if (!content.trim() && !imageUrl) {
      toast.push({ title: 'Add a photo or some text first.', type: 'error' })
      return
    }
    setSaving(true)
    try {
      await api<any>('/stories', {
        method: 'POST',
        body: JSON.stringify({ content: content.trim(), imageUrl, style }),
      })
      toast.push({ title: 'Story published', description: 'It disappears in 24 hours.', type: 'success' })
      reset()
      onCreated()
      onClose()
    } catch (err: any) {
      toast.push({ title: 'Could not publish', description: err.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add to your story">
      <div className="space-y-4">
        <div
          className={cn(
            'relative flex min-h-64 items-center justify-center overflow-hidden rounded-3xl p-6',
            imageUrl ? 'bg-ink-950' : STORY_GRADIENTS[style],
          )}
        >
          {imageUrl ? (
            <>
              <img
                src={imageUrl}
                alt="Story preview"
                className="absolute inset-0 h-full w-full object-cover opacity-90"
              />
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={2}
                maxLength={280}
                placeholder="Add a caption…"
                className="relative z-10 mt-auto w-full resize-none rounded-2xl bg-black/50 px-4 py-3 text-center text-lg font-semibold text-white outline-none backdrop-blur placeholder:text-white/70"
              />
            </>
          ) : (
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={4}
              maxLength={280}
              autoFocus
              placeholder="Type your story…"
              className="w-full resize-none bg-transparent text-center text-2xl font-bold text-white outline-none placeholder:text-white/70"
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => void attach(event.target.files?.[0])}
          />
          <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
            {imageUrl ? 'Replace photo' : 'Photo'}
          </button>
          {imageUrl && (
            <button className="btn-ghost" onClick={() => setImageUrl('')}>
              <TypeIcon className="h-4 w-4" />
              Text only
            </button>
          )}
          <span className="ml-auto text-xs text-ink-400">{content.length}/280</span>
        </div>

        {!imageUrl && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Background</p>
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {STORY_STYLES.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setStyle(name)}
                  aria-label={`${name} background`}
                  className={cn(
                    'h-10 w-10 shrink-0 rounded-full ring-offset-2 transition',
                    STORY_GRADIENTS[name],
                    style === name ? 'ring-2 ring-brand-500 dark:ring-offset-ink-900' : 'opacity-80 hover:opacity-100',
                  )}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            className="btn-ghost"
            onClick={() => {
              reset()
              onClose()
            }}
          >
            Cancel
          </button>
          <button className="btn-primary" onClick={() => void publish()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Share to story
          </button>
        </div>
      </div>
    </Modal>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, apiForm } from '@/lib/api'
import { Image as ImageIcon, X } from 'lucide-react'
import { useToast } from '@/components/common/Toast'

export function CreatePostPage() {
  const [content, setContent] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()

  const uploadImage = async (file: File) => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const data = await apiForm<any>('/uploads', form)
      setImageUrl(data.url)
      toast.push({ title: 'Image uploaded', type: 'success' })
    } catch (err: any) {
      toast.push({ title: 'Upload failed', description: err.message, type: 'error' })
    } finally {
      setUploading(false)
    }
  }

  const submit = async () => {
    try {
      await api<any>('/posts', { method: 'POST', body: JSON.stringify({ content, imageUrl }) })
      toast.push({ title: 'Post created', type: 'success' })
      navigate('/')
    } catch (err: any) {
      toast.push({ title: 'Failed to post', description: err.message, type: 'error' })
    }
  }

  return (
    <div className="surface p-6">
      <h1 className="text-lg font-semibold">Create post</h1>
      <textarea
        className="mt-4 w-full rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
        rows={4}
        placeholder="What's on your mind?"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="mt-3">
        {imageUrl ? (
          <div className="relative">
            <img src={imageUrl} alt="preview" className="rounded-2xl" />
            <button className="absolute right-2 top-2 btn-ghost h-8 w-8 rounded-full p-0" onClick={() => setImageUrl('')}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label className="btn-ghost cursor-pointer">
            <ImageIcon className="h-4 w-4" />
            {uploading ? 'Uploading...' : 'Add photo'}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
            />
          </label>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <button className="btn-primary" onClick={submit} disabled={!content && !imageUrl}>
          Post
        </button>
      </div>
    </div>
  )
}

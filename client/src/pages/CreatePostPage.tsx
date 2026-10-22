import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, apiForm } from '@/lib/api'
import { Image as ImageIcon, Video as VideoIcon, X } from 'lucide-react'
import { useToast } from '@/components/common/Toast'

export function CreatePostPage() {
  const [content, setContent] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [uploading, setUploading] = useState<false | 'image' | 'video'>(false)
  const navigate = useNavigate()
  const toast = useToast()

  const upload = async (file: File, kind: 'image' | 'video') => {
    setUploading(kind)
    try {
      const form = new FormData()
      form.append('file', file)
      // Video goes to the video endpoint (larger limit, video mime types).
      const data = await apiForm<{ url: string }>(kind === 'video' ? '/uploads/video' : '/uploads', form)
      // A post carries one attachment; picking a new one replaces the old.
      if (kind === 'video') {
        setVideoUrl(data.url)
        setImageUrl('')
      } else {
        setImageUrl(data.url)
        setVideoUrl('')
      }
      toast.push({ title: kind === 'video' ? 'Video uploaded' : 'Image uploaded', type: 'success' })
    } catch (err: any) {
      toast.push({ title: 'Upload failed', description: err.message, type: 'error' })
    } finally {
      setUploading(false)
    }
  }

  const clearMedia = () => {
    setImageUrl('')
    setVideoUrl('')
  }

  const submit = async () => {
    try {
      await api<any>('/posts', { method: 'POST', body: JSON.stringify({ content, imageUrl, videoUrl }) })
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
        {imageUrl && (
          <div className="relative">
            <img src={imageUrl} alt="preview" className="rounded-2xl" />
            <button
              className="absolute right-2 top-2 btn-ghost h-8 w-8 rounded-full p-0"
              onClick={clearMedia}
              aria-label="Remove photo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {videoUrl && (
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video src={videoUrl} className="max-h-96 w-full" controls playsInline preload="metadata" />
            <button
              className="absolute right-2 top-2 btn-ghost h-8 w-8 rounded-full p-0"
              onClick={clearMedia}
              aria-label="Remove video"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {!imageUrl && !videoUrl && (
          <div className="flex flex-wrap gap-2">
            <label className="btn-ghost cursor-pointer">
              <ImageIcon className="h-4 w-4" />
              {uploading === 'image' ? 'Uploading...' : 'Add photo'}
              <input
                type="file"
                accept="image/*"
                hidden
                disabled={!!uploading}
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'image')}
              />
            </label>
            <label className="btn-ghost cursor-pointer">
              <VideoIcon className="h-4 w-4" />
              {uploading === 'video' ? 'Uploading...' : 'Add video'}
              <input
                type="file"
                accept="video/*"
                hidden
                disabled={!!uploading}
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'video')}
              />
            </label>
          </div>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <button className="btn-primary" onClick={submit} disabled={!content && !imageUrl && !videoUrl}>
          Post
        </button>
      </div>
    </div>
  )
}

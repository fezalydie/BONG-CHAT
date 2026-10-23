import type { PublicUser } from './user'

export interface Reel {
  id: number
  videoUrl: string
  caption: string
  views: number
  createdAt: string
  author: PublicUser
  likes: number
  comments: number
  likedByMe: boolean
}

export interface ReelComment {
  id: number
  content: string
  createdAt: string
  author: PublicUser
}

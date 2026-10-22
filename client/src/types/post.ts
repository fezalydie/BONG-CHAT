import type { PublicUser } from './user'

export interface Post {
  id: number
  content: string
  imageUrl: string
  videoUrl: string
  views: number
  createdAt: string
  hashtags: string[]
  author: PublicUser
  likes: number
  comments: number
  shares: number
  likedByMe: boolean
  sharedByMe: boolean
}

export interface Comment {
  id: number
  content: string
  createdAt: string
  author: PublicUser
}

export interface FeedItemPost {
  kind: 'post'
  post: Post
  sharedBy: null
  shareNote: string
  sharedAt: null
}

export interface FeedItemShare {
  kind: 'share'
  post: Post
  sharedBy: PublicUser
  shareNote: string
  sharedAt: string
}

export type FeedItem = FeedItemPost | FeedItemShare

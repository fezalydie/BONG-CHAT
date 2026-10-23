import type { PublicUser } from './user'

export interface Story {
  id: number
  content: string
  imageUrl: string
  videoUrl: string
  style: string
  createdAt: string
  expiresAt: string
  author: PublicUser
}

export interface StoryGroup {
  user: PublicUser
  stories: Story[]
  hasUnseen: boolean
  latestAt: string
}

export interface Notification {
  id: number
  type:
    | 'like'
    | 'comment'
    | 'follow'
    | 'follow_request'
    | 'follow_accepted'
    | 'share'
    | 'message'
    | 'system'
  entityId?: number | null
  link: string
  read: boolean
  createdAt: string
  data: Record<string, any>
}

export interface SearchResult {
  users: PublicUser[]
  posts: Array<{
    id: number
    content: string
    imageUrl: string
    videoUrl: string
    views: number
    createdAt: string
    author: PublicUser
  }>
  tags: string[]
  web: Array<{ label: string; url: string; kind: 'direct' | 'engine' }>
}

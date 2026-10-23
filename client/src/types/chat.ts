import type { PublicUser } from './user'

/** A compact copy of a story, stored with a reply so it survives expiry. */
export interface StoryReplyContext {
  id: number
  content: string
  imageUrl: string
  videoUrl: string
  style: string
  createdAt: string
  authorId: number
  authorUsername: string
}

export interface ChatMessage {
  id: number
  conversationId: number
  content: string
  imageUrl: string
  createdAt: string
  readAt: string | null
  parts: Array<{ type: 'text' | 'link'; value: string }>
  storyId?: number | null
  story?: StoryReplyContext | null
  sender: Pick<PublicUser, 'id' | 'username' | 'displayName' | 'avatarUrl'>
}

export interface Conversation {
  id: number
  user: PublicUser & { lastSeenAt?: string | null; online?: boolean }
  lastMessage: ChatMessage | null
  unreadCount: number
  lastMessageAt: string
}

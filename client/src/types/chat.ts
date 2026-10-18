import type { PublicUser } from './user'

export interface ChatMessage {
  id: number
  conversationId: number
  content: string
  imageUrl: string
  createdAt: string
  readAt: string | null
  parts: Array<{ type: 'text' | 'link'; value: string }>
  sender: Pick<PublicUser, 'id' | 'username' | 'displayName' | 'avatarUrl'>
}

export interface Conversation {
  id: number
  user: PublicUser & { lastSeenAt?: string | null; online?: boolean }
  lastMessage: ChatMessage | null
  unreadCount: number
  lastMessageAt: string
}

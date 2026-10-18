export interface PublicUser {
  id: number
  username: string
  displayName: string
  avatarUrl: string
  bio: string
  isPrivate: boolean
  createdAt: string
  lastSeenAt?: string | null
  online?: boolean
}

export interface AuthUser extends PublicUser {
  email: string
  coverUrl: string
  theme: string
  language: string
  notificationPrefs: Record<string, boolean>
}

export interface ViewerFlags {
  isMe: boolean
  isFollowing: boolean
  isFollowedBy: boolean
  isBlocked: boolean
  canViewContent: boolean
}

export interface UserStats {
  posts: number
  followers: number
  following: number
}

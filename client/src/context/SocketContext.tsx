import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';
import type { ChatMessage } from '@/types/chat';

type SocketHandler = (payload: any) => void;

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  onlineUsers: Set<number>;
  isUserOnline: (userId: number) => boolean;
  unreadMessages: number;
  refreshUnreadMessages: () => Promise<void>;
  subscribe: (event: string, handler: SocketHandler) => () => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, setUnreadNotifications } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());
  const [unreadMessages, setUnreadMessages] = useState(0);
  const handlers = useRef(new Map<string, Set<SocketHandler>>());

  const refreshUnreadMessages = useCallback(async () => {
    if (!user) {
      setUnreadMessages(0);
      return;
    }
    try {
      const { conversations } = await api<{ conversations: Array<{ unreadCount: number }> }>(
        '/messages/conversations',
      );
      setUnreadMessages(conversations.reduce((total, conversation) => total + conversation.unreadCount, 0));
    } catch {
      /* offline or signed out — keep the last known value */
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setSocket(null);
      setConnected(false);
      setOnlineUsers(new Set());
      setUnreadMessages(0);
      return;
    }
    void refreshUnreadMessages();

    const instance = io({ withCredentials: true, transports: ['websocket', 'polling'] });
    setSocket(instance);
    instance.on('connect', () => setConnected(true));
    instance.on('disconnect', () => setConnected(false));
    instance.on('presence:update', (payload: { userId: number; online: boolean }) => {
      setOnlineUsers((current) => {
        const next = new Set(current);
        if (payload.online) next.add(payload.userId);
        else next.delete(payload.userId);
        return next;
      });
    });
    // Live unread badge: only count messages that are not mine.
    instance.on('message:new', (payload: ChatMessage) => {
      if (payload.sender?.id && payload.sender.id !== user.id) {
        setUnreadMessages((current) => current + 1);
      }
    });
    // Live notification badge: the server sends the authoritative unread count.
    const onNotification = (payload: { unreadCount?: number }) => {
      setUnreadNotifications(
        typeof payload?.unreadCount === 'number' ? payload.unreadCount : (current) => current + 1,
      );
    };
    instance.on('notification:new', onNotification);

    const forward = (event: string) => (payload: unknown) => {
      handlers.current.get(event)?.forEach((handler) => handler(payload));
    };
    const events = ['message:new', 'notification:new', 'conversation:updated', 'conversation:read', 'chat:image'];
    const listeners: Array<[string, SocketHandler]> = events.map((event) => [event, forward(event)]);
    listeners.forEach(([event, listener]) => instance.on(event, listener));

    return () => {
      listeners.forEach(([event, listener]) => instance.off(event, listener));
      instance.off('notification:new', onNotification);
      instance.close();
    };
  }, [user?.id, refreshUnreadMessages, setUnreadNotifications]);

  const subscribe = useCallback((event: string, handler: SocketHandler) => {
    const set = handlers.current.get(event) ?? new Set<SocketHandler>();
    set.add(handler);
    handlers.current.set(event, set);
    return () => {
      set.delete(handler);
    };
  }, []);

  const isUserOnline = useCallback((userId: number) => onlineUsers.has(userId), [onlineUsers]);

  const value = useMemo<SocketContextValue>(
    () => ({
      socket,
      connected,
      onlineUsers,
      isUserOnline,
      unreadMessages,
      refreshUnreadMessages,
      subscribe,
    }),
    [socket, connected, onlineUsers, isUserOnline, unreadMessages, refreshUnreadMessages, subscribe],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used inside <SocketProvider>');
  return context;
}

/** Convenience hook for subscribing to a socket event inside a component. */
export function useSocketEvent(event: string, handler: SocketHandler): void {
  const { subscribe } = useSocket();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe(event, (payload) => ref.current(payload)), [event, subscribe]);
}

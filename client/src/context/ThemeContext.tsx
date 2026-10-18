import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';

export type ThemeChoice = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: ThemeChoice;
  resolved: 'light' | 'dark';
  /** Alias of `resolved` for consumers that expect the shadcn-style name. */
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeChoice) => void;
}

const isThemeChoice = (value: unknown): value is ThemeChoice =>
  value === 'light' || value === 'dark' || value === 'system';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuth();
  const [theme, setThemeState] = useState<ThemeChoice>(() => {
    const stored = localStorage.getItem('bongchat:theme') as ThemeChoice | null;
    return stored ?? 'system';
  });
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Follow the OS setting live while "system" is selected.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  // Adopt the theme stored on the account once the session is known.
  useEffect(() => {
    if (isThemeChoice(user?.theme) && user.theme !== theme) {
      setThemeState(user.theme);
      localStorage.setItem('bongchat:theme', user.theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.theme]);

  const resolved: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.style.colorScheme = resolved;
  }, [resolved]);

  const setTheme = useCallback(
    (next: ThemeChoice) => {
      setThemeState(next);
      localStorage.setItem('bongchat:theme', next);
      if (user) {
        setUser({ ...user, theme: next });
        void api<any>('/settings', {
          method: 'PUT',
          body: JSON.stringify({ theme: next }),
        }).catch(() => undefined);
      }
    },
    [setUser, user],
  );

  const value = useMemo(
    () => ({ theme, resolved, resolvedTheme: resolved, setTheme }),
    [theme, resolved, setTheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}

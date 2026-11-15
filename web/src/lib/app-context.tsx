import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { CircleCheck, CircleX, Info, X } from 'lucide-react'
import { ApiError, api, onUnauthorized, post } from './api'
import type { Catalog, PublicMeta, SessionUser } from './types'

/* ------------------------------------------------------------------ */
/* Toast                                                               */
/* ------------------------------------------------------------------ */

type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let toastSeq = 0

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([])

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    toastSeq += 1
    const id = toastSeq
    setItems((previous) => [...previous, { id, message, tone }])
    window.setTimeout(() => {
      setItems((previous) => previous.filter((item) => item.id !== id))
    }, 3600)
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-5 right-5 z-[90] flex w-[360px] flex-col gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="animate-rise pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 shadow-[var(--shadow-pop)]"
            >
              <span
                className="mt-0.5 shrink-0"
                style={{
                  color:
                    item.tone === 'success'
                      ? 'var(--positive)'
                      : item.tone === 'error'
                        ? 'var(--danger)'
                        : 'var(--info)',
                }}
              >
                {item.tone === 'success' ? (
                  <CircleCheck size={16} />
                ) : item.tone === 'error' ? (
                  <CircleX size={16} />
                ) : (
                  <Info size={16} />
                )}
              </span>
              <p className="flex-1 text-[13px] leading-5 text-ink">{item.message}</p>
              <button
                type="button"
                aria-label="关闭提示"
                className="text-faint transition hover:text-ink"
                onClick={() => setItems((previous) => previous.filter((entry) => entry.id !== item.id))}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}

/* ------------------------------------------------------------------ */
/* 主题                                                                */
/* ------------------------------------------------------------------ */

export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  mode: ThemeMode
  resolved: 'light' | 'dark'
  setMode: (mode: ThemeMode) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredTheme(): ThemeMode {
  const stored = localStorage.getItem('stb-theme')
  return stored === 'dark' || stored === 'system' || stored === 'light' ? stored : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredTheme())
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (event: MediaQueryListEvent): void => setSystemDark(event.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])

  const resolved: 'light' | 'dark' =
    mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
    localStorage.setItem('stb-theme', mode)
  }, [mode, resolved])

  const setMode = useCallback((next: ThemeMode) => setModeState(next), [])
  const toggle = useCallback(() => setModeState(resolved === 'dark' ? 'light' : 'dark'), [resolved])

  const value = useMemo(() => ({ mode, resolved, setMode, toggle }), [mode, resolved, setMode, toggle])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}

/* ------------------------------------------------------------------ */
/* 登录态                                                              */
/* ------------------------------------------------------------------ */

interface AuthContextValue {
  user: SessionUser | null
  meta: PublicMeta | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  setUser: (user: SessionUser | null) => void
  can: (permission: string) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [meta, setMeta] = useState<PublicMeta | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const result = await api<{ user: SessionUser | null }>('/api/me')
      setUser(result.user)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    onUnauthorized(() => setUser(null))
    return () => onUnauthorized(null)
  }, [])

  useEffect(() => {
    let active = true
    const bootstrap = async (): Promise<void> => {
      const metaPromise = api<PublicMeta>('/api/public/meta')
        .then((value) => {
          if (active) setMeta(value)
        })
        .catch(() => undefined)
      await Promise.all([refresh(), metaPromise])
      if (active) setLoading(false)
    }
    void bootstrap()
    return () => {
      active = false
    }
  }, [refresh])

  const login = useCallback(async (username: string, password: string) => {
    const result = await post<{ user: SessionUser }>('/api/auth/login', { username, password })
    setUser(result.user)
  }, [])

  const logout = useCallback(async () => {
    try {
      await post('/api/auth/logout')
    } catch {
      /* 会话可能已经过期 */
    }
    setUser(null)
  }, [])

  const can = useCallback(
    (permission: string) => Boolean(user?.permissions.includes(permission)),
    [user],
  )

  const value = useMemo(
    () => ({ user, meta, loading, login, logout, refresh, setUser, can }),
    [user, meta, loading, login, logout, refresh, can],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}

/* ------------------------------------------------------------------ */
/* 目录                                                                */
/* ------------------------------------------------------------------ */

interface CatalogContextValue {
  catalog: Catalog | null
  toolById: Map<string, Catalog['tools'][number]>
  subjectById: Map<string, Catalog['subjects'][number]>
}

const CatalogContext = createContext<CatalogContextValue | null>(null)

export function CatalogProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { user } = useAuth()
  const [catalog, setCatalog] = useState<Catalog | null>(null)

  useEffect(() => {
    if (!user) {
      setCatalog(null)
      return
    }
    let active = true
    api<Catalog>('/api/catalog')
      .then((value) => {
        if (active) setCatalog(value)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [user])

  const toolById = useMemo(
    () => new Map((catalog?.tools ?? []).map((tool) => [tool.id, tool])),
    [catalog],
  )
  const subjectById = useMemo(
    () => new Map((catalog?.subjects ?? []).map((subject) => [subject.id, subject])),
    [catalog],
  )

  const value = useMemo(
    () => ({ catalog, toolById, subjectById }),
    [catalog, toolById, subjectById],
  )
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

export function useCatalog(): CatalogContextValue {
  const context = useContext(CatalogContext)
  if (!context) throw new Error('useCatalog must be used inside CatalogProvider')
  return context
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return '操作失败，请稍后重试'
}

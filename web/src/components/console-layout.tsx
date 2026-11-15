import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  UserRound,
  X,
} from 'lucide-react'
import { useApi, useInterval } from '../lib/useApi'
import { useAuth, useTheme, useToast } from '../lib/app-context'
import { allNavItems, NAV_GROUPS, resolvePage } from '../lib/nav'
import { auditLabel, formatRelative } from '../lib/format'
import type { NotificationsResponse } from '../lib/types'
import { Avatar, Badge, Button, IconButton, cn } from './ui'

function BrandMark({ size = 32 }: { size?: number }): React.JSX.Element {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[9px] bg-brand font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] dark:text-[#0d1512]"
      style={{ width: size, height: size, fontSize: size * 0.46 }}
    >
      学
    </span>
  )
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }): React.JSX.Element {
  const { can } = useAuth()
  const notifications = useApi<NotificationsResponse>('/api/notifications')
  const pending = notifications.data?.badges.pending ?? 0

  return (
    <nav className="scroll-area flex-1 pb-4 pt-1">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => !item.permission || can(item.permission))
        if (items.length === 0) return null
        return (
          <div key={group.label}>
            <div className="nav-group-label">{group.label}</div>
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) => cn('nav-item', isActive && 'nav-item-active')}
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      size={16}
                      strokeWidth={isActive ? 1.9 : 1.7}
                      className={isActive ? 'text-brand' : 'text-faint'}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.to === '/feedback' && pending > 0 ? (
                      <span className="num rounded-full bg-warn-soft px-1.5 text-[10px] font-medium leading-[17px] text-warn">
                        {pending}
                      </span>
                    ) : null}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        )
      })}
    </nav>
  )
}

function SidebarFooter(): React.JSX.Element {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  return (
    <div className="border-t border-line/80 p-2.5">
      {user ? (
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-2 text-left transition hover:bg-surface"
        >
          <Avatar name={user.displayName} color={user.avatarColor} size={30} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium text-ink">{user.displayName}</span>
            <span className="block truncate text-[10.5px] text-faint">{user.roleName}</span>
          </span>
          <ChevronRight size={14} className="text-faint" />
        </button>
      ) : null}
      <div className="mt-1 flex items-center justify-between px-2 py-1">
        <span className="text-[10px] text-faint">v1.0 · 演示环境</span>
        <button
          type="button"
          onClick={async () => {
            await logout()
            toast('已退出登录', 'success')
            navigate('/login')
          }}
          className="flex items-center gap-1 text-[10.5px] text-faint transition hover:text-danger"
        >
          <LogOut size={11} />
          退出
        </button>
      </div>
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[60px] items-center gap-2.5 px-4">
        <BrandMark />
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold leading-tight tracking-[-0.01em] text-ink">
            学科工具箱
          </div>
          <div className="text-[10.5px] leading-tight text-faint">运营控制台</div>
        </div>
        <span className="ml-auto rounded-full border border-line bg-surface px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-faint">
          STB
        </span>
      </div>
      <SidebarNav onNavigate={onNavigate} />
      <SidebarFooter />
    </div>
  )
}

function NotificationCenter(): React.JSX.Element {
  const notifications = useApi<NotificationsResponse>('/api/notifications')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()
  useInterval(() => notifications.reload(), 60_000)

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const badges = notifications.data?.badges
  const total = (badges?.pending ?? 0) + (badges?.errors ?? 0)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="通知"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'relative flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-3 hover:text-ink',
          open && 'bg-surface-3 text-ink',
        )}
      >
        <Bell size={16.5} strokeWidth={1.7} />
        {total > 0 ? (
          <span className="absolute right-[5px] top-[4px] h-[6px] w-[6px] rounded-full bg-danger ring-2 ring-[var(--canvas)]" />
        ) : null}
      </button>
      {open ? (
        <div className="animate-pop absolute right-0 top-[calc(100%+8px)] z-50 w-[336px] overflow-hidden rounded-[14px] border border-line bg-surface shadow-[var(--shadow-pop)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <div className="text-[13px] font-semibold text-ink">通知与动态</div>
              <div className="text-[11px] text-faint">
                {badges?.pending ?? 0} 条待处理反馈 · {badges?.errors ?? 0} 条未解决崩溃
              </div>
            </div>
            <Badge tone={total > 0 ? 'amber' : 'neutral'}>{total > 0 ? '待关注' : '已清空'}</Badge>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {(notifications.data?.activity ?? []).slice(0, 6).map((item) => (
              <div key={item.id} className="flex gap-2.5 border-b border-line/70 px-4 py-2.5 last:border-0">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/60" />
                <div className="min-w-0">
                  <div className="text-[12px] leading-5 text-ink">
                    <span className="font-medium">{item.actorName}</span>
                    <span className="text-muted"> · {auditLabel(item.action)}</span>
                  </div>
                  <div className="truncate text-[11px] text-faint">{item.targetLabel || item.detail}</div>
                  <div className="mt-0.5 text-[10px] text-faint">{formatRelative(item.createdAt)}</div>
                </div>
              </div>
            ))}
            {(notifications.data?.activity ?? []).length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-faint">暂无动态</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              navigate('/team/audit')
            }}
            className="flex w-full items-center justify-center gap-1 border-t border-line bg-surface-2 py-2.5 text-[12px] text-muted transition hover:text-ink"
          >
            查看全部审计日志
            <ChevronRight size={13} />
          </button>
        </div>
      ) : null}
    </div>
  )
}

function UserMenu(): React.JSX.Element {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()
  const { toast } = useToast()

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!user) return <div />
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition hover:bg-surface-3',
          open && 'bg-surface-3',
        )}
      >
        <Avatar name={user.displayName} color={user.avatarColor} size={28} />
        <span className="hidden text-left sm:block">
          <span className="block text-[12px] font-medium leading-tight text-ink">{user.displayName}</span>
          <span className="block text-[10px] leading-tight text-faint">{user.roleName}</span>
        </span>
        <ChevronDown size={13} className="text-faint" />
      </button>
      {open ? (
        <div className="animate-pop absolute right-0 top-[calc(100%+8px)] z-50 w-[248px] overflow-hidden rounded-[14px] border border-line bg-surface shadow-[var(--shadow-pop)]">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <Avatar name={user.displayName} color={user.avatarColor} size={36} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-ink">{user.displayName}</div>
              <div className="truncate text-[11px] text-faint">{user.email || user.username}</div>
            </div>
          </div>
          <div className="p-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                navigate('/settings')
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-ink transition hover:bg-surface-2"
            >
              <UserRound size={14} className="text-faint" />
              个人资料
            </button>
            {user.permissions.includes('settings.manage') ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  navigate('/settings?tab=system')
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-ink transition hover:bg-surface-2"
              >
                <Settings size={14} className="text-faint" />
                系统设置
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                navigate('/team/roles')
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-ink transition hover:bg-surface-2"
            >
              <ShieldCheck size={14} className="text-faint" />
              我的权限
            </button>
          </div>
          <div className="border-t border-line p-1.5">
            <button
              type="button"
              onClick={async () => {
                setOpen(false)
                await logout()
                toast('已退出登录', 'success')
                navigate('/login')
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-danger transition hover:bg-danger-soft"
            >
              <LogOut size={14} />
              退出登录
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element | null {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const items = useMemo(() => {
    return allNavItems()
      .filter((item) => !item.permission || can(item.permission))
      .filter((item) => {
        if (!query.trim()) return true
        const haystack = `${item.label}${item.description ?? ''}${item.to}`.toLowerCase()
        return haystack.includes(query.trim().toLowerCase())
      })
  }, [can, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    window.setTimeout(() => inputRef.current?.focus(), 20)
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive((value) => Math.min(items.length - 1, value + 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive((value) => Math.max(0, value - 1))
      } else if (event.key === 'Enter') {
        const item = items[active]
        if (item) {
          event.preventDefault()
          navigate(item.to)
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, items, navigate, onClose, open])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-start justify-center p-4 pt-[12vh]">
      <div className="animate-overlay absolute inset-0 bg-[rgba(16,26,20,0.36)] backdrop-blur-[2px] dark:bg-black/55" onClick={onClose} />
      <div className="animate-pop relative w-full max-w-[520px] overflow-hidden rounded-[16px] border border-line bg-surface shadow-[var(--shadow-pop)]">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={16} className="text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索页面或跳转…"
            className="h-[46px] flex-1 border-0 bg-transparent text-[13.5px] outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] text-faint">ESC</kbd>
        </div>
        <div className="max-h-[360px] overflow-y-auto p-1.5">
          {items.map((item, index) => (
            <button
              key={item.to}
              type="button"
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                navigate(item.to)
                onClose()
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition',
                index === active ? 'bg-brand-soft' : 'hover:bg-surface-2',
              )}
            >
              <item.icon size={16} className={index === active ? 'text-brand' : 'text-faint'} />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium text-ink">{item.label}</span>
                <span className="block truncate text-[11px] text-faint">{item.description}</span>
              </span>
              {index === active ? <ChevronRight size={14} className="text-brand" /> : null}
            </button>
          ))}
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-[12px] text-faint">没有匹配的页面</div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function ConsoleLayout(): React.JSX.Element {
  const { user } = useAuth()
  const location = useLocation()
  const { resolved, toggle } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const page = resolvePage(location.pathname)

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="min-h-full">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[244px] border-r border-line bg-[var(--sidebar)] lg:flex lg:flex-col">
        <SidebarContent />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="animate-overlay absolute inset-0 bg-black/35 backdrop-blur-[1px]" onClick={() => setMobileOpen(false)} />
          <div className="animate-drawer relative flex h-full w-[264px] flex-col border-r border-line bg-[var(--sidebar)] shadow-[var(--shadow-pop)]">
            <button
              type="button"
              aria-label="关闭菜单"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-faint hover:bg-surface-3 hover:text-ink"
            >
              <X size={16} />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-[244px]">
        <header className="sticky top-0 z-30 flex h-[58px] items-center gap-3 border-b border-line bg-[color-mix(in_srgb,var(--canvas)_86%,transparent)] px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            aria-label="打开菜单"
            onClick={() => setMobileOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-3 hover:text-ink lg:hidden"
          >
            <Menu size={18} />
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden text-[11.5px] text-faint sm:inline">{page.group}</span>
            <span className="hidden text-[11.5px] text-faint sm:inline">/</span>
            <h2 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">{page.title}</h2>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="mr-1 hidden h-8 w-[206px] items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-left text-[11.5px] text-faint transition hover:border-line-strong md:flex"
            >
              <Search size={13} />
              <span className="flex-1">搜索或跳转</span>
              <kbd className="rounded border border-line bg-surface-2 px-1 text-[9.5px] leading-[15px]">⌘K</kbd>
            </button>
            <IconButton label={resolved === 'dark' ? '切换到浅色' : '切换到深色'} onClick={toggle}>
              {resolved === 'dark' ? <Sun size={16.5} strokeWidth={1.7} /> : <Moon size={16.5} strokeWidth={1.7} />}
            </IconButton>
            <NotificationCenter />
            <div className="mx-1 h-4 w-px bg-line" />
            <UserMenu />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <Outlet />
        </main>

        <footer className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-2 px-4 pb-8 text-[10.5px] text-faint sm:px-6 lg:px-8">
          <span>
            {user?.roleName ? `${user.displayName} · ${user.roleName}` : ''} · 学科工具箱运营控制台
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-positive" />
            服务运行中 · 数据仅供校内演示
          </span>
        </footer>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {user && user.permissions.length === 0 ? (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full border border-warn/30 bg-warn-soft px-3 py-1.5 text-[11px] text-warn">
            <CircleAlert size={13} /> 当前账号没有可访问的页面
          </div>
        </div>
      ) : null}
    </div>
  )
}

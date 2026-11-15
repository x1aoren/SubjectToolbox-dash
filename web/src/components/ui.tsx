import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronLeft, ChevronRight, Copy, Search, X } from 'lucide-react'
import { initials, toneStyle, type Tone } from '../lib/format'

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

/* ------------------------------------------------------------------ */
/* 按钮                                                                */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'danger-soft' | 'soft'
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  'danger-soft': 'btn-danger-soft',
  soft: 'border-0 bg-brand-soft text-brand hover:bg-[color-mix(in_srgb,var(--brand)_16%,var(--surface))]',
}

const SIZES: Record<ButtonSize, string> = {
  xs: 'btn-xs',
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
  trailing?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  trailing,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn('btn', VARIANTS[variant], SIZES[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner size={14} /> : icon}
      {children}
      {trailing}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  active?: boolean
}

export function IconButton({ label, active, className, children, ...rest }: IconButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'btn btn-icon',
        active && 'bg-surface-3 text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Spinner({ size = 16 }: { size?: number }): React.JSX.Element {
  return (
    <span
      role="status"
      aria-label="加载中"
      className="inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px] opacity-70"
      style={{ width: size, height: size }}
    />
  )
}

/* ------------------------------------------------------------------ */
/* 容器                                                                */
/* ------------------------------------------------------------------ */

export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div className={cn('card', className)} {...rest}>
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
  divided?: boolean
}

export function CardHeader({
  title,
  description,
  action,
  className,
  divided = false,
}: CardHeaderProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 px-5 pt-4.5',
        divided && 'border-b border-line pb-3.5',
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
        {description ? <p className="mt-0.5 text-[12px] leading-5 text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

interface PageHeaderProps {
  title: string
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
}

export function PageHeader({ title, description, actions, eyebrow }: PageHeaderProps): React.JSX.Element {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? <div className="mb-1.5 text-[11.5px] font-medium text-faint">{eyebrow}</div> : null}
        <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.02em] text-ink">{title}</h1>
        {description ? <p className="mt-1 text-[13px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 表单                                                                */
/* ------------------------------------------------------------------ */

interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  required?: boolean
  htmlFor?: string
  children: ReactNode
  className?: string
  error?: string | null
}

export function Field({ label, hint, required, htmlFor, children, className, error }: FieldProps): React.JSX.Element {
  return (
    <div className={className}>
      {label ? (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
          {required ? <span className="ml-0.5 text-danger">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <p className="field-hint text-danger">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input className={cn('input', className)} {...rest} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  return <textarea className={cn('textarea', className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return (
    <select className={cn('select', className)} {...rest}>
      {children}
    </select>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = '搜索',
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('relative', className)}>
      <Search
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
      />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="input pl-8.5"
        aria-label={placeholder}
      />
      {value ? (
        <button
          type="button"
          aria-label="清空搜索"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-ink"
          onClick={() => onChange('')}
        >
          <X size={13} />
        </button>
      ) : null}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[21px] w-[37px] shrink-0 items-center rounded-full border transition-colors',
        checked ? 'border-brand bg-brand' : 'border-line-strong bg-surface-3',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={cn(
          'inline-block h-[15px] w-[15px] rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* 展示                                                                */
/* ------------------------------------------------------------------ */

export function Badge({
  children,
  tone = 'neutral',
  dot = false,
  color,
  background,
  className,
}: {
  children: ReactNode
  tone?: Tone
  dot?: boolean
  color?: string
  background?: string
  className?: string
}): React.JSX.Element {
  const style = toneStyle(tone)
  return (
    <span
      className={cn('badge', className)}
      style={{ color: color ?? style.color, background: background ?? style.background }}
    >
      {dot ? <span className="badge-dot" /> : null}
      {children}
    </span>
  )
}

export function Avatar({
  name,
  color,
  size = 30,
}: {
  name: string
  color: string
  size?: number
}): React.JSX.Element {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium"
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${color} 18%, var(--surface))`,
        color,
        fontSize: Math.max(10, Math.round(size * 0.36)),
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 20%, transparent)`,
      }}
    >
      {initials(name)}
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon ? (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-3 text-faint">
          {icon}
        </div>
      ) : null}
      <p className="text-[13.5px] font-medium text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[12.5px] text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }): React.JSX.Element {
  return <div className={cn('animate-pulse rounded-md bg-surface-3', className)} />
}

export function Pagination({
  page,
  pageCount,
  total,
  onChange,
}: {
  page: number
  pageCount: number
  total: number
  onChange: (page: number) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[12px] text-muted">
      <span className="num">
        共 {total} 条 · 第 {page} / {pageCount} 页
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="xs"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          icon={<ChevronLeft size={13} />}
        >
          上一页
        </Button>
        <Button
          variant="outline"
          size="xs"
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
          trailing={<ChevronRight size={13} />}
        >
          下一页
        </Button>
      </div>
    </div>
  )
}

export interface TabItem {
  key: string
  label: string
  count?: number
}

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[]
  value: string
  onChange: (key: string) => void
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex items-center gap-1 border-b border-line', className)}>
      {items.map((item) => {
        const active = item.key === value
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cn(
              'relative -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[12.5px] font-medium transition-colors',
              active
                ? 'border-brand text-ink'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className="num rounded-full bg-surface-3 px-1.5 text-[10.5px] text-muted">
                {item.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}): React.JSX.Element {
  return (
    <div className="inline-flex items-center rounded-[9px] border border-line bg-surface p-0.5">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors',
              active ? 'bg-brand-soft text-brand-strong' : 'text-muted hover:text-ink',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 弹层                                                                */
/* ------------------------------------------------------------------ */

function useLockBody(open: boolean): void {
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])
}

function useEscape(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const MODAL_SIZES = {
  sm: 'max-w-[400px]',
  md: 'max-w-[520px]',
  lg: 'max-w-[680px]',
  xl: 'max-w-[860px]',
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps): React.JSX.Element | null {
  useLockBody(open)
  useEscape(open, onClose)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto p-4 pt-[9vh] sm:p-6 sm:pt-[10vh]">
      <div
        className="animate-overlay fixed inset-0 bg-[rgba(16,26,20,0.38)] backdrop-blur-[2px] dark:bg-[rgba(0,0,0,0.55)]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'animate-pop relative w-full rounded-[18px] border border-line bg-surface shadow-[var(--shadow-pop)]',
          MODAL_SIZES[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-1 pt-5">
          <div>
            {title ? <h2 className="text-[16px] font-semibold text-ink">{title}</h2> : null}
            {description ? <p className="mt-1 text-[12.5px] text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="rounded-lg p-1.5 text-faint transition hover:bg-surface-3 hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 rounded-b-[18px] border-t border-line bg-surface-2 px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

interface DrawerProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: ReactNode
  subtitle?: ReactNode
  footer?: ReactNode
  width?: number
}

export function Drawer({
  open,
  onClose,
  children,
  title,
  subtitle,
  footer,
  width = 620,
}: DrawerProps): React.JSX.Element | null {
  useLockBody(open)
  useEscape(open, onClose)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[65] flex justify-end">
      <div
        className="animate-overlay absolute inset-0 bg-[rgba(16,26,20,0.34)] backdrop-blur-[2px] dark:bg-[rgba(0,0,0,0.5)]"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        className="animate-drawer relative flex h-full w-full flex-col border-l border-line bg-surface shadow-[var(--shadow-pop)]"
        style={{ maxWidth: width }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title ? <div className="truncate text-[15px] font-semibold text-ink">{title}</div> : null}
            {subtitle ? <div className="mt-0.5 text-[12px] text-muted">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="rounded-lg p-1.5 text-faint transition hover:bg-surface-3 hover:text-ink"
          >
            <X size={17} />
          </button>
        </header>
        <div className="scroll-area flex-1">{children}</div>
        {footer ? <footer className="border-t border-line bg-surface">{footer}</footer> : null}
      </aside>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

export function CopyButton({
  text,
  label = '复制',
  size = 'xs',
}: {
  text: string
  label?: string
  size?: 'xs' | 'sm'
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Button
      variant="outline"
      size={size}
      onClick={() => void copy()}
      icon={copied ? <Check size={12} /> : <Copy size={12} />}
    >
      {copied ? '已复制' : label}
    </Button>
  )
}

export function KeyValue({
  label,
  children,
  className,
}: {
  label: ReactNode
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2', className)}>
      <span className="shrink-0 text-[12px] text-muted">{label}</span>
      <span className="min-w-0 text-right text-[12.5px] text-ink">{children}</span>
    </div>
  )
}

export function ProgressBar({
  value,
  color = 'var(--brand)',
  height = 5,
}: {
  value: number
  color?: string
  height?: number
}): React.JSX.Element {
  return (
    <div className="w-full overflow-hidden rounded-full bg-surface-3" style={{ height }}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: color }}
      />
    </div>
  )
}

const SHANGHAI = 'Asia/Shanghai'

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: SHANGHAI,
  month: '2-digit',
  day: '2-digit',
})

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: SHANGHAI,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const fullFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: SHANGHAI,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const weekdayFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: SHANGHAI,
  weekday: 'short',
})

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return dateFormatter.format(date).replace(/\//g, '-')
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return timeFormatter.format(date)
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return fullFormatter.format(date).replace(/\//g, '-')
}

export function formatDateTimeSeconds(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const text = new Intl.DateTimeFormat('zh-CN', {
    timeZone: SHANGHAI,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
  return text.replace(/\//g, '-')
}

export function formatWeekday(iso: string): string {
  return weekdayFormatter.format(new Date(iso))
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = Date.parse(iso)
  if (!Number.isFinite(date)) return '—'
  const diff = Date.now() - date
  if (diff < 0) return '刚刚'
  const minute = 60_000
  const hour = 3_600_000
  const day = 86_400_000
  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  return formatDateTime(iso)
}

export const formatRelative = relativeTime

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('zh-CN').format(value)
}

export function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (value >= 10_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return formatNumber(value)
}

export function compareVersions(left: string, right: string): number {
  const parse = (value: string): number[] =>
    value
      .split(/[.+\\-]/)
      .map((part) => Number.parseInt(part, 10))
      .filter((part) => Number.isFinite(part))
  const a = parse(left)
  const b = parse(right)
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${(value * 100).toFixed(digits).replace(/\.0$/, '')}%`
}

export function formatDelta(value: number | null | undefined): string {
  if (value === null || value === undefined) return '新增'
  const percent = Math.abs(value * 100)
  const digits = percent < 10 ? 1 : 0
  return `${percent.toFixed(digits).replace(/\.0$/, '')}%`
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return '—'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest > 0 ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  return `${minutes} 分钟`
}

export function initials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  if (/^[A-Za-z]/.test(trimmed)) {
    return trimmed
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('')
  }
  return trimmed.slice(-2)
}

/* ------------------------------------------------------------------ */
/* 目录常量与标签                                                       */
/* ------------------------------------------------------------------ */

export const SUBJECT_COLORS: Record<string, string> = {
  chinese: '#9C4438',
  math: '#34558B',
  english: '#2E7D6F',
  chemistry: '#6B4A8F',
  biology: '#2E7D32',
  geography: '#9A6B1F',
  other: '#546E7A',
}

export const SUBJECT_NAMES: Record<string, string> = {
  chinese: '语文',
  math: '数学',
  english: '英语',
  chemistry: '化学',
  biology: '生物',
  geography: '地理',
  other: '通用',
}

export type Tone = 'neutral' | 'brand' | 'green' | 'amber' | 'red' | 'blue' | 'violet'

export interface BadgeTone {
  tone: Tone
  color: string
  background: string
}

const TONE_STYLES: Record<Tone, BadgeTone> = {
  neutral: { tone: 'neutral', color: 'var(--muted)', background: 'var(--surface-3)' },
  brand: { tone: 'brand', color: 'var(--brand)', background: 'var(--brand-soft)' },
  green: { tone: 'green', color: 'var(--positive)', background: 'var(--positive-soft)' },
  amber: { tone: 'amber', color: 'var(--warn)', background: 'var(--warn-soft)' },
  red: { tone: 'red', color: 'var(--danger)', background: 'var(--danger-soft)' },
  blue: { tone: 'blue', color: 'var(--info)', background: 'var(--info-soft)' },
  violet: { tone: 'violet', color: 'var(--violet)', background: 'var(--violet-soft)' },
}

export function toneStyle(tone: Tone): BadgeTone {
  return TONE_STYLES[tone]
}

export const FEEDBACK_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: '待处理', tone: 'amber' },
  in_progress: { label: '处理中', tone: 'blue' },
  resolved: { label: '已解决', tone: 'green' },
  closed: { label: '已关闭', tone: 'neutral' },
}

export const FEEDBACK_PRIORITY: Record<string, { label: string; tone: Tone }> = {
  low: { label: '低', tone: 'neutral' },
  normal: { label: '普通', tone: 'neutral' },
  high: { label: '高', tone: 'amber' },
  urgent: { label: '紧急', tone: 'red' },
}

export const FEEDBACK_TYPE: Record<string, { label: string; tone: Tone }> = {
  bug: { label: '问题反馈', tone: 'red' },
  feature: { label: '功能建议', tone: 'blue' },
  content: { label: '内容纠错', tone: 'violet' },
  other: { label: '其他', tone: 'neutral' },
}

export const ROLE_TONE: Record<string, Tone> = {
  owner: 'brand',
  admin: 'blue',
  operator: 'green',
  analyst: 'violet',
  viewer: 'neutral',
}

export const AUDIT_LABELS: Record<string, string> = {
  'auth.login': '登录控制台',
  'auth.logout': '退出登录',
  'user.create': '创建账号',
  'user.update': '修改账号',
  'user.password': '修改密码',
  'user.reset_password': '重置密码',
  'user.delete': '删除账号',
  'config.publish': '发布云端配置',
  'config.rollback': '回滚云端配置',
  'config.draft': '编辑配置草稿',
  'feedback.reply': '回复反馈',
  'feedback.update': '更新反馈',
  'feedback.resolve': '标记已解决',
  'feedback.close': '关闭反馈',
  'error.resolve': '处理崩溃',
  'error.reopen': '重开崩溃',
  'key.create': '创建密钥',
  'key.revoke': '吊销密钥',
  'settings.update': '修改系统设置',
  'device.override': '调整设备功能开关',
  'telemetry.export': '导出遥测数据',
  'system.reset_demo': '重置演示数据',
  'system.purge': '清除数据记录',
}

export function auditLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action
}

export const EVENT_LABELS: Record<string, string> = {
  session_start: '会话开始',
  session_end: '会话结束',
  tool_open: '打开工具',
  tool_close: '关闭工具',
  search: '站内检索',
  error: '崩溃上报',
  feedback_open: '打开反馈',
  update_prompt: '更新提示',
  settings_change: '修改设置',
}

export function eventLabel(name: string): string {
  return EVENT_LABELS[name] ?? name
}

export const CHANNEL_LABELS: Record<string, string> = {
  stable: '稳定版',
  beta: '内测版',
}

/** 工具类型徽章：主工具不展示，示意图 / 功能入口需要在后台标注 */
export const TOOL_KIND_META: Record<string, { label: string; tone: Tone }> = {
  tool: { label: '工具', tone: 'neutral' },
  diagram: { label: '示意图', tone: 'violet' },
  feature: { label: '功能入口', tone: 'blue' },
}

export const ANNOUNCEMENT_LEVELS: Record<string, { label: string; tone: Tone }> = {
  info: { label: '通知', tone: 'blue' },
  warning: { label: '提醒', tone: 'amber' },
  critical: { label: '重要', tone: 'red' },
}

export const DEVICE_STATUS: Record<string, { label: string; tone: Tone }> = {
  online: { label: '在线', tone: 'green' },
  active: { label: '今日活跃', tone: 'brand' },
  stale: { label: '离线', tone: 'neutral' },
}

import type { FastifyRequest } from 'fastify'
import { db, nowIso } from './db.js'
import type { SessionUser } from './auth.js'

export class HttpError extends Error {
  statusCode: number
  code: string

  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.statusCode = statusCode
    this.code = code
  }
}

export function fail(statusCode: number, code: string, message: string): never {
  throw new HttpError(statusCode, code, message)
}

export function assert(condition: unknown, statusCode: number, code: string, message: string): asserts condition {
  if (!condition) fail(statusCode, code, message)
}

export function clientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0]!.trim()
  return request.ip || '127.0.0.1'
}

export interface Page {
  page: number
  pageSize: number
  offset: number
}

export function pagination(query: Record<string, unknown>, defaultSize = 20, maxSize = 100): Page {
  const rawPage = Number(query.page ?? 1)
  const rawSize = Number(query.pageSize ?? defaultSize)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1
  const pageSize = Math.min(
    maxSize,
    Number.isFinite(rawSize) && rawSize > 0 ? Math.floor(rawSize) : defaultSize,
  )
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export function paged<T>(items: T[], total: number, page: Page) {
  return {
    items,
    total,
    page: page.page,
    pageSize: page.pageSize,
    pageCount: Math.max(1, Math.ceil(total / page.pageSize)),
  }
}

export function audit(
  request: FastifyRequest,
  actor: SessionUser | null,
  action: string,
  targetType: string | null,
  targetId: string | null,
  targetLabel: string | null,
  detail: string,
): void {
  db()
    .prepare(
      `INSERT INTO audit_logs(actor_id, actor_name, action, target_type, target_id, target_label, detail, ip, created_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      actor?.id ?? null,
      actor?.displayName ?? '匿名',
      action,
      targetType,
      targetId,
      targetLabel,
      detail,
      clientIp(request),
      nowIso(),
    )
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function toCsv(headers: Array<{ key: string; label: string }>, rows: Array<Record<string, unknown>>): string {
  const lines = [headers.map((header) => csvCell(header.label)).join(',')]
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header.key])).join(','))
  }
  // Excel 需要 BOM 才能正确识别 UTF-8 中文
  return `\ufeff${lines.join('\r\n')}\r\n`
}

export function sendCsv(reply: import('fastify').FastifyReply, filename: string, body: string): void {
  reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .send(body)
}

/* ------------------------------------------------------------------ */
/* 日期范围：以 Asia/Shanghai 的「天」为界                                */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000
const SHANGHAI_OFFSET = 8 * 3_600_000

/**
 * 返回「近 N 个自然日（含今天）」的统计窗口：
 * [startIso, endIso) 从 N-1 天前的上海零点开始，到当前时刻为止（今天只统计到此刻）。
 * 同时给出上一个等长窗口 [prevStartIso, prevEndIso)（整体前移 N 天），
 * 环比比的是「同样统计到同一时刻」的两段数据，不会因为今天还没过完就显示暴跌。
 *
 * 早先这里刻意只统计「完整日」、把今天排除在外，导致新部署的服务器当天只有今天的
 * 真实数据时，概览和工具使用页全是 0，而单设备详情（不限时间）却有数据，看起来像统计坏了。
 */
export function trailingDays(days: number): {
  startIso: string
  endIso: string
  prevStartIso: string
  prevEndIso: string
  dates: string[]
} {
  const now = Date.now()
  const todayStart = now - ((now + SHANGHAI_OFFSET) % DAY_MS)
  const start = todayStart - (days - 1) * DAY_MS
  const end = now
  const prevStart = start - days * DAY_MS
  const prevEnd = end - days * DAY_MS
  const dates: string[] = []
  for (let index = 0; index < days; index += 1) {
    dates.push(isoDate(start + index * DAY_MS))
  }
  return {
    startIso: new Date(start).toISOString(),
    endIso: new Date(end).toISOString(),
    prevStartIso: new Date(prevStart).toISOString(),
    prevEndIso: new Date(prevEnd).toISOString(),
    dates,
  }
}

/** 今天（上海时区）的起止。 */
export function todayRange(): { startIso: string; endIso: string; date: string } {
  const now = Date.now()
  const start = now - ((now + SHANGHAI_OFFSET) % DAY_MS)
  return {
    startIso: new Date(start).toISOString(),
    endIso: new Date(start + DAY_MS).toISOString(),
    date: isoDate(start),
  }
}

/** 以 +08:00 显示的日期字符串，与 SQL 里的 date(x,'+8 hours') 对齐。 */
export function isoDate(ms: number): string {
  return new Date(ms + SHANGHAI_OFFSET).toISOString().slice(0, 10)
}

export function parseRange(value: unknown, allowed = [7, 14, 30]): number {
  const parsed = Number(value)
  return allowed.includes(parsed) ? parsed : allowed[1] ?? allowed[0]!
}

export function clampText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

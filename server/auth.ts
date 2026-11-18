import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { db, nowIso } from './db.js'
import { IS_PRODUCTION } from './env.js'
import { can, permissionsOf, roleName, type PermissionKey, type RoleId } from './permissions.js'

export const SESSION_COOKIE = 'stb_console_session'
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface UserRow {
  id: string
  username: string
  display_name: string
  email: string
  role: RoleId
  password_hash: string
  status: string
  avatar_color: string
  created_at: string
  last_login_at: string | null
  must_change_password: number
}

export interface SessionUser {
  id: string
  username: string
  displayName: string
  email: string
  role: RoleId
  roleName: string
  status: string
  avatarColor: string
  createdAt: string
  lastLoginAt: string | null
  permissions: PermissionKey[]
}

export function publicUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    roleName: roleName(row.role),
    status: row.status,
    avatarColor: row.avatar_color,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    permissions: permissionsOf(row.role),
  }
}

/* ------------------------------------------------------------------ */
/* 口令                                                                */
/* ------------------------------------------------------------------ */

const SCRYPT_N = 16384

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64, { N: SCRYPT_N, r: 8, p: 1 }).toString('hex')
  return `scrypt$${SCRYPT_N}$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 4) return false
  const [, nRaw, salt, expected] = parts
  const n = Number(nRaw)
  if (!salt || !expected || !Number.isFinite(n)) return false
  try {
    const actual = scryptSync(password, salt, 64, { N: n, r: 8, p: 1 })
    const expectedBuffer = Buffer.from(expected, 'hex')
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer)
  } catch {
    return false
  }
}

/** 生成一个便于抄写的初始密码，避免出现容易混淆的 0/O、1/l。 */
export function generatePassword(length = 14): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length]
  return out
}

export function isValidPassword(password: string): boolean {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128
}

/* ------------------------------------------------------------------ */
/* 会话                                                                */
/* ------------------------------------------------------------------ */

export function createSession(
  userId: string,
  ip: string | null,
  userAgent: string | null,
): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString('base64url')
  const createdAt = nowIso()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  db()
    .prepare(
      'INSERT INTO sessions(token, user_id, created_at, expires_at, ip, user_agent) VALUES(?,?,?,?,?,?)',
    )
    .run(token, userId, createdAt, expiresAt, ip, userAgent)
  return { token, expiresAt }
}

export function destroySession(token: string | undefined): void {
  if (!token) return
  db().prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PRODUCTION,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/', secure: IS_PRODUCTION })
}

export function currentUser(request: FastifyRequest): SessionUser | null {
  const token = (request.cookies as Record<string, string | undefined>)[SESSION_COOKIE]
  if (!token) return null
  const row = db()
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ? AND u.status = 'active'`,
    )
    .get(token, nowIso()) as unknown as unknown as UserRow | undefined
  return row ? publicUser(row) : null
}

export function requireUser(request: FastifyRequest): SessionUser {
  const user = currentUser(request)
  if (!user) {
    const error = new Error('请先登录') as Error & { statusCode: number; code: string }
    error.statusCode = 401
    error.code = 'unauthenticated'
    throw error
  }
  return user
}

export function requirePermission(request: FastifyRequest, permission: PermissionKey): SessionUser {
  const user = requireUser(request)
  if (!can(user.role, permission)) {
    const error = new Error('当前角色没有这项权限') as Error & { statusCode: number; code: string }
    error.statusCode = 403
    error.code = 'forbidden'
    throw error
  }
  return user
}

/* ------------------------------------------------------------------ */
/* 客户端接入密钥                                                       */
/* ------------------------------------------------------------------ */

export interface ApiKeyRow {
  id: string
  name: string
  prefix: string
  key_hash: string
  created_by: string | null
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export function issueApiKey(name: string, createdBy: string): { row: ApiKeyRow; secret: string } {
  const random = randomBytes(24).toString('base64url').replace(/[-_]/g, '')
  const secret = `stb_live_${random.slice(0, 28)}`
  const id = `key_${randomBytes(8).toString('hex')}`
  const prefix = `${secret.slice(0, 16)}…`
  const createdAt = nowIso()
  db()
    .prepare(
      'INSERT INTO api_keys(id, name, prefix, key_hash, created_by, created_at) VALUES(?,?,?,?,?,?)',
    )
    .run(id, name, prefix, hashKey(secret), createdBy, createdAt)
  const row: ApiKeyRow = {
    id,
    name,
    prefix,
    key_hash: hashKey(secret),
    created_by: createdBy,
    created_at: createdAt,
    last_used_at: null,
    revoked_at: null,
  }
  return { row, secret }
}

export function validateApiKey(request: FastifyRequest): ApiKeyRow | null {
  const raw = request.headers['x-stb-key']
  const header = Array.isArray(raw) ? raw[0] : raw
  if (!header) return null
  const row = db()
    .prepare('SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL')
    .get(hashKey(header)) as ApiKeyRow | undefined
  if (!row) return null
  const now = nowIso()
  if (!row.last_used_at || Date.now() - new Date(row.last_used_at).getTime() > 60_000) {
    db().prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(now, row.id)
  }
  return row
}

/* ------------------------------------------------------------------ */
/* 登录限流                                                            */
/* ------------------------------------------------------------------ */

const attempts = new Map<string, { count: number; resetAt: number }>()

export function loginRateLimited(key: string): boolean {
  const entry = attempts.get(key)
  if (!entry) return false
  if (Date.now() > entry.resetAt) {
    attempts.delete(key)
    return false
  }
  return entry.count >= 6
}

export function recordLoginFailure(key: string): void {
  const entry = attempts.get(key)
  const now = Date.now()
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + 5 * 60_000 })
    return
  }
  entry.count += 1
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key)
}

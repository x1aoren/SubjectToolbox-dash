import type { FastifyInstance } from 'fastify'
import {
  SESSION_COOKIE,
  clearLoginFailures,
  clearSessionCookie,
  createSession,
  currentUser,
  destroySession,
  generatePassword,
  hashPassword,
  isValidPassword,
  loginRateLimited,
  publicUser,
  recordLoginFailure,
  requireUser,
  setSessionCookie,
  verifyPassword,
  type UserRow,
} from '../auth.js'
import { db, getSetting, getSettings, nowIso } from '../db.js'
import { audit, clampText, clientIp, fail } from '../http.js'
import { isRoleId } from '../permissions.js'

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,23}$/

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/public/meta', async () => {
    const settings = getSettings()
    const counts = {
      devices: (db().prepare('SELECT COUNT(*) AS n FROM devices').get() as { n: number }).n,
      feedback: (db().prepare('SELECT COUNT(*) AS n FROM feedback').get() as { n: number }).n,
      events: (db().prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n,
    }
    const demo = Boolean(settings.demo_seeded_at)
    return {
      workspaceName: settings.workspace_name ?? '学科工具箱',
      orgName: settings.org_name ?? '',
      version: '1.0.0',
      counts,
      demoMode: demo,
      demoAccount: demo ? { username: 'admin', password: 'STB-admin-2026' } : null,
      serverTime: nowIso(),
    }
  })

  app.post('/api/auth/login', async (request, reply) => {
    const body = (request.body ?? {}) as { username?: string; password?: string }
    const username = clampText(body.username, 64).toLowerCase()
    const password = typeof body.password === 'string' ? body.password : ''
    if (!username || !password) fail(400, 'invalid_credentials', '请输入用户名和密码')

    const rateKey = `${username}|${clientIp(request)}`
    if (loginRateLimited(rateKey)) {
      fail(429, 'too_many_attempts', '尝试次数过多，请 5 分钟后再试')
    }

    const row = db().prepare('SELECT * FROM users WHERE username = ?').get(username) as
      | UserRow
      | undefined
    if (!row || !verifyPassword(password, row.password_hash)) {
      recordLoginFailure(rateKey)
      fail(401, 'invalid_credentials', '用户名或密码不正确')
    }
    if (row.status !== 'active') {
      fail(403, 'account_disabled', '该账号已被停用，请联系管理员')
    }

    clearLoginFailures(rateKey)
    const { token } = createSession(
      row.id,
      clientIp(request),
      String(request.headers['user-agent'] ?? '').slice(0, 200),
    )
    setSessionCookie(reply, token)
    db().prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), row.id)

    const actor = { ...publicUser(row), lastLoginAt: nowIso() }
    audit(request, actor, 'auth.login', 'session', null, null, '登录控制台')

    return { user: actor }
  })

  app.post('/api/auth/logout', async (request, reply) => {
    const token = (request.cookies as Record<string, string | undefined>)[SESSION_COOKIE]
    const user = currentUser(request)
    destroySession(token)
    clearSessionCookie(reply)
    if (user) audit(request, user, 'auth.logout', 'session', null, null, '退出登录')
    return { ok: true }
  })

  app.get('/api/me', async (request) => {
    // 未登录时返回 200 + null，避免首次打开控制台在浏览器控制台留下 401。
    return { user: currentUser(request) }
  })

  app.patch('/api/me', async (request) => {
    const user = requireUser(request)
    const body = (request.body ?? {}) as { displayName?: string; email?: string; avatarColor?: string }
    const displayName = clampText(body.displayName, 32) || user.displayName
    const email = clampText(body.email, 120)
    const avatarColor = /^#[0-9a-fA-F]{6}$/.test(String(body.avatarColor))
      ? String(body.avatarColor)
      : user.avatarColor

    db()
      .prepare('UPDATE users SET display_name = ?, email = ?, avatar_color = ? WHERE id = ?')
      .run(displayName, email, avatarColor, user.id)
    audit(request, user, 'user.update', 'user', user.id, displayName, '更新了个人资料')
    const updated = db().prepare('SELECT * FROM users WHERE id = ?').get(user.id) as unknown as UserRow
    return { user: publicUser(updated) }
  })

  app.post('/api/me/password', async (request) => {
    const user = requireUser(request)
    const body = (request.body ?? {}) as {
      currentPassword?: string
      newPassword?: string
    }
    const row = db().prepare('SELECT * FROM users WHERE id = ?').get(user.id) as unknown as UserRow
    if (!verifyPassword(String(body.currentPassword ?? ''), row.password_hash)) {
      fail(400, 'wrong_password', '当前密码不正确')
    }
    if (!isValidPassword(String(body.newPassword ?? ''))) {
      fail(400, 'weak_password', '新密码至少 8 位')
    }
    db()
      .prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
      .run(hashPassword(String(body.newPassword)), user.id)
    audit(request, user, 'user.password', 'user', user.id, user.displayName, '修改了自己的登录密码')
    return { ok: true }
  })

  app.get('/api/notifications', async (request) => {
    const user = requireUser(request)
    void user
    const activity = db()
      .prepare(
        `SELECT id, actor_name, action, target_type, target_label, detail, created_at
         FROM audit_logs ORDER BY created_at DESC LIMIT 12`,
      )
      .all() as Array<Record<string, unknown>>
    const pending = (
      db().prepare("SELECT COUNT(*) AS n FROM feedback WHERE status = 'pending'").get() as {
        n: number
      }
    ).n
    const urgent = (
      db()
        .prepare("SELECT COUNT(*) AS n FROM feedback WHERE priority = 'urgent' AND status IN ('pending','in_progress')")
        .get() as { n: number }
    ).n
    const errors = (
      db().prepare('SELECT COUNT(*) AS n FROM errors WHERE resolved = 0').get() as { n: number }
    ).n
    return { activity, badges: { pending, urgent, errors }, lastSeenAt: getSetting('last_publish_at') }
  })

  // 个人侧不需要独立的登录接口，这里仅为表单校验提供用户名规则
  void USERNAME_PATTERN
  void generatePassword
  void isRoleId
}

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { requirePermission } from '../auth.js'
import { generatePassword, hashPassword, isValidPassword } from '../auth.js'
import { can, isRoleId, PERMISSIONS, ROLES, ROLE_BY_ID, type RoleId } from '../permissions.js'
import { db, nowIso } from '../db.js'
import { audit, clampText, fail, paged, pagination } from '../http.js'

type Row = Record<string, unknown>

interface UserListRow {
  id: string
  username: string
  display_name: string
  email: string
  role: RoleId
  status: string
  avatar_color: string
  created_at: string
  last_login_at: string | null
  assigned_count: number
  open_count: number
}

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,23}$/

function userJson(row: UserListRow) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    roleName: ROLE_BY_ID.get(row.role)?.name ?? row.role,
    status: row.status,
    avatarColor: row.avatar_color,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    assignedFeedback: Number(row.assigned_count ?? 0),
    openFeedback: Number(row.open_count ?? 0),
  }
}

function getUser(id: string): UserListRow | undefined {
  return db()
    .prepare(
      `SELECT u.*,
        (SELECT COUNT(*) FROM feedback f WHERE f.assignee_id = u.id) AS assigned_count,
        (SELECT COUNT(*) FROM feedback f WHERE f.assignee_id = u.id AND f.status IN ('pending','in_progress')) AS open_count
       FROM users u WHERE u.id = ?`,
    )
    .get(id) as UserListRow | undefined
}

function activeOwnerCount(excludeId?: string): number {
  return (
    db()
      .prepare(
        `SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND status = 'active'${excludeId ? ' AND id != ?' : ''}`,
      )
      .get(...(excludeId ? [excludeId] : [])) as { n: number }
  ).n
}

function assertCanTouch(actorRole: RoleId, targetRole: RoleId, action: string): void {
  if (actorRole !== 'owner' && targetRole === 'owner') {
    fail(403, 'owner_protected', `只有超级管理员可以${action}超级管理员账号`)
  }
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/users', async (request) => {
    requirePermission(request, 'users.view')
    const query = request.query as Row
    const q = typeof query.q === 'string' ? query.q.trim() : ''
    const role = typeof query.role === 'string' ? query.role : ''
    const status = typeof query.status === 'string' ? query.status : ''
    const conditions: string[] = []
    const params: Array<string | number> = []
    if (q) {
      conditions.push('(u.username LIKE ? OR u.display_name LIKE ? OR u.email LIKE ?)')
      params.push(`%${q}%`, `%${q}%`, `%${q}%`)
    }
    if (isRoleId(role)) {
      conditions.push('u.role = ?')
      params.push(role)
    }
    if (status === 'active' || status === 'disabled') {
      conditions.push('u.status = ?')
      params.push(status)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = db()
      .prepare(
        `SELECT u.*,
          (SELECT COUNT(*) FROM feedback f WHERE f.assignee_id = u.id) AS assigned_count,
          (SELECT COUNT(*) FROM feedback f WHERE f.assignee_id = u.id AND f.status IN ('pending','in_progress')) AS open_count
         FROM users u ${where} ORDER BY u.created_at ASC`,
      )
      .all(...params) as unknown as UserListRow[]
    return {
      items: rows.map(userJson),
      roles: ROLES.map((roleItem) => ({
        ...roleItem,
        memberCount: rows.filter((row) => row.role === roleItem.id).length,
      })),
    }
  })

  app.get('/api/roles', async (request) => {
    requirePermission(request, 'users.view')
    const counts = db()
      .prepare('SELECT role, COUNT(*) AS n FROM users GROUP BY role')
      .all() as Array<{ role: string; n: number }>
    return {
      roles: ROLES.map((role) => ({
        ...role,
        memberCount: Number(counts.find((row) => row.role === role.id)?.n ?? 0),
      })),
      permissions: PERMISSIONS,
    }
  })

  app.post('/api/users', async (request) => {
    const actor = requirePermission(request, 'users.manage')
    const body = (request.body ?? {}) as {
      username?: string
      displayName?: string
      email?: string
      role?: string
      password?: string
    }
    const username = clampText(body.username, 24).toLowerCase()
    const displayName = clampText(body.displayName, 32)
    const email = clampText(body.email, 120)
    const role = body.role
    if (!USERNAME_PATTERN.test(username)) {
      fail(400, 'invalid_username', '用户名需为 3–24 位小写字母、数字或 . _ -，并以字母或数字开头')
    }
    if (!displayName) fail(400, 'invalid_name', '请填写显示姓名')
    if (!isRoleId(role)) fail(400, 'invalid_role', '请选择有效的角色')
    if (actor.role !== 'owner' && role === 'owner') {
      fail(403, 'owner_required', '只有超级管理员可以创建超级管理员账号')
    }
    if (db().prepare('SELECT id FROM users WHERE username = ?').get(username)) {
      fail(409, 'username_taken', '该用户名已被占用')
    }
    const providedPassword = typeof body.password === 'string' ? body.password : ''
    if (providedPassword && !isValidPassword(providedPassword)) {
      fail(400, 'weak_password', '初始密码至少 8 位')
    }
    const password = providedPassword || generatePassword()
    const id = `usr_${Math.random().toString(16).slice(2, 12)}`
    const createdAt = nowIso()
    const palette = ['#3F6E5A', '#34558B', '#6B4A8F', '#9A6B1F', '#2E7D6F', '#546E7A']
    db()
      .prepare(
        `INSERT INTO users(id, username, display_name, email, role, password_hash, status,
          avatar_color, created_at, must_change_password)
         VALUES(?,?,?,?,?,?,'active',?,?,?)`,
      )
      .run(
        id,
        username,
        displayName,
        email,
        role,
        hashPassword(password),
        palette[Math.floor(Math.random() * palette.length)]!,
        createdAt,
        providedPassword ? 0 : 1,
      )
    audit(
      request,
      actor,
      'user.create',
      'user',
      id,
      displayName,
      `创建账号 ${username}，角色「${ROLE_BY_ID.get(role)?.name}」`,
    )
    return {
      user: userJson(getUser(id)!),
      initialPassword: password,
      generated: !providedPassword,
    }
  })

  app.patch('/api/users/:id', async (request) => {
    const actor = requirePermission(request, 'users.manage')
    const id = String((request.params as Row).id)
    const target = getUser(id)
    if (!target) fail(404, 'not_found', '账号不存在')
    assertCanTouch(actor.role, target.role, '修改')

    const body = (request.body ?? {}) as {
      displayName?: string
      email?: string
      role?: string
      status?: string
    }
    const updates: string[] = []
    const values: Array<string | number> = []
    const notes: string[] = []

    if (body.displayName !== undefined) {
      const displayName = clampText(body.displayName, 32)
      if (!displayName) fail(400, 'invalid_name', '显示姓名不能为空')
      updates.push('display_name = ?')
      values.push(displayName)
      notes.push(`姓名 ${target.display_name} → ${displayName}`)
    }
    if (body.email !== undefined) {
      updates.push('email = ?')
      values.push(clampText(body.email, 120))
      notes.push('更新邮箱')
    }
    if (body.role !== undefined && body.role !== target.role) {
      if (!isRoleId(body.role)) fail(400, 'invalid_role', '无效的角色')
      if (body.role === 'owner' && actor.role !== 'owner') {
        fail(403, 'owner_required', '只有超级管理员可以授予超级管理员角色')
      }
      if (id === actor.id) fail(400, 'self_edit', '不能修改自己的角色')
      if (target.role === 'owner' && activeOwnerCount(id) === 0) {
        fail(400, 'last_owner', '至少要保留一个可用的超级管理员')
      }
      updates.push('role = ?')
      values.push(body.role)
      notes.push(`角色改为「${ROLE_BY_ID.get(body.role)?.name}」`)
    }
    if (body.status !== undefined && body.status !== target.status) {
      if (body.status !== 'active' && body.status !== 'disabled') {
        fail(400, 'invalid_status', '无效的账号状态')
      }
      if (id === actor.id) fail(400, 'self_edit', '不能停用自己的账号')
      if (target.status === 'active' && body.status === 'disabled' && target.role === 'owner') {
        if (activeOwnerCount(id) === 0) fail(400, 'last_owner', '至少要保留一个可用的超级管理员')
      }
      updates.push('status = ?')
      values.push(body.status)
      notes.push(body.status === 'active' ? '启用账号' : '停用账号')
    }

    if (updates.length === 0) fail(400, 'no_changes', '没有需要保存的修改')
    values.push(id)
    db()
      .prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
      .run(...values)
    if (body.status === 'disabled') {
      db().prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
    }
    audit(request, actor, 'user.update', 'user', id, target.display_name, notes.join('；'))
    return { user: userJson(getUser(id)!) }
  })

  app.post('/api/users/:id/password', async (request) => {
    const actor = requirePermission(request, 'users.manage')
    const id = String((request.params as Row).id)
    const target = getUser(id)
    if (!target) fail(404, 'not_found', '账号不存在')
    assertCanTouch(actor.role, target.role, '重置')
    const body = (request.body ?? {}) as { password?: string }
    const provided = typeof body.password === 'string' ? body.password : ''
    if (provided && !isValidPassword(provided)) fail(400, 'weak_password', '密码至少 8 位')
    const password = provided || generatePassword()
    db()
      .prepare('UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?')
      .run(hashPassword(password), provided ? 0 : 1, id)
    db().prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
    audit(request, actor, 'user.reset_password', 'user', id, target.display_name, '重置了账号密码')
    return { password, generated: !provided }
  })

  app.delete('/api/users/:id', async (request) => {
    const actor = requirePermission(request, 'users.manage')
    if (actor.role !== 'owner') fail(403, 'owner_required', '只有超级管理员可以删除账号')
    const id = String((request.params as Row).id)
    const target = getUser(id)
    if (!target) fail(404, 'not_found', '账号不存在')
    if (id === actor.id) fail(400, 'self_edit', '不能删除自己的账号')
    if (target.role === 'owner' && activeOwnerCount(id) === 0) {
      fail(400, 'last_owner', '至少要保留一个可用的超级管理员')
    }
    db().prepare('DELETE FROM users WHERE id = ?').run(id)
    audit(request, actor, 'user.delete', 'user', id, target.display_name, '删除了账号')
    return { ok: true }
  })
}

/* ------------------------------ 审计日志 ------------------------------ */

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/audit', async (request: FastifyRequest) => {
    requirePermission(request, 'audit.view')
    const page = pagination(request.query as Row, 30, 100)
    const q = typeof (request.query as Row).q === 'string' ? String((request.query as Row).q).trim() : ''
    const action = typeof (request.query as Row).action === 'string' ? String((request.query as Row).action) : ''
    const conditions: string[] = []
    const params: Array<string | number> = []
    if (q) {
      conditions.push('(actor_name LIKE ? OR target_label LIKE ? OR detail LIKE ? OR action LIKE ?)')
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
    }
    if (action) {
      conditions.push('action = ?')
      params.push(action)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = db()
      .prepare(
        `SELECT id, actor_name, action, target_type, target_id, target_label, detail, ip, created_at
         FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, page.pageSize, page.offset) as Row[]
    const total = (
      db().prepare(`SELECT COUNT(*) AS n FROM audit_logs ${where}`).get(...params) as { n: number }
    ).n
    const actions = (
      db()
        .prepare('SELECT action, COUNT(*) AS n FROM audit_logs GROUP BY action ORDER BY n DESC')
        .all() as Array<{ action: string; n: number }>
    ).map((row) => ({ action: row.action, count: Number(row.n) }))

    return {
      ...paged(
        rows.map((row) => ({
          id: Number(row.id),
          actorName: row.actor_name as string,
          action: row.action as string,
          targetType: (row.target_type as string) ?? null,
          targetId: (row.target_id as string) ?? null,
          targetLabel: (row.target_label as string) ?? null,
          detail: (row.detail as string) ?? '',
          ip: (row.ip as string) ?? '',
          createdAt: row.created_at as string,
        })),
        total,
        page,
      ),
      actions,
      canExport: can(requirePermission(request, 'audit.view').role, 'settings.manage'),
    }
  })
}

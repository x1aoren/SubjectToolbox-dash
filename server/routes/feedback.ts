import type { FastifyInstance, FastifyRequest } from 'fastify'
import { requirePermission } from '../auth.js'
import { can } from '../permissions.js'
import { db, nowIso } from '../db.js'
import { audit, clampText, fail, paged, pagination } from '../http.js'
import { TOOL_BY_ID } from '../catalog.js'

type Row = Record<string, unknown>
type SqlValue = string | number | null

const STATUSES = ['pending', 'in_progress', 'resolved', 'closed'] as const
const TYPES = ['bug', 'feature', 'content', 'other'] as const
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const

export const STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  in_progress: '处理中',
  resolved: '已解决',
  closed: '已关闭',
}

export const PRIORITY_LABEL: Record<string, string> = {
  low: '低',
  normal: '普通',
  high: '高',
  urgent: '紧急',
}

function one<T = Row>(sql: string, ...params: SqlValue[]): T {
  return db().prepare(sql).get(...params) as T
}

function many<T = Row>(sql: string, ...params: SqlValue[]): T[] {
  return db().prepare(sql).all(...params) as T[]
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0) || 0
}

function queryString(request: FastifyRequest, key: string): string {
  const value = (request.query as Row)[key]
  return typeof value === 'string' ? value.trim() : ''
}

interface FeedbackRow {
  id: string
  sn: string | null
  type: string
  title: string
  content: string
  contact: string | null
  tool_id: string | null
  app_version: string | null
  channel: string | null
  status: string
  priority: string
  assignee_id: string | null
  tags: string
  created_at: string
  updated_at: string
  last_reply_at: string | null
  closed_at: string | null
  device_model: string | null
  device_school: string | null
  device_grade: string | null
  assignee_name: string | null
  message_count: number
}

function feedbackJson(row: FeedbackRow) {
  let tags: string[] = []
  try {
    const parsed = JSON.parse(row.tags)
    if (Array.isArray(parsed)) tags = parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    tags = []
  }
  return {
    id: row.id,
    number: row.id.slice(-6).toUpperCase(),
    sn: row.sn,
    type: row.type,
    title: row.title,
    content: row.content,
    excerpt: row.content.length > 90 ? `${row.content.slice(0, 90)}…` : row.content,
    contact: row.contact,
    toolId: row.tool_id,
    toolTitle: row.tool_id ? TOOL_BY_ID.get(row.tool_id)?.title ?? row.tool_id : null,
    appVersion: row.app_version,
    channel: row.channel,
    status: row.status,
    priority: row.priority,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastReplyAt: row.last_reply_at,
    closedAt: row.closed_at,
    device: row.sn
      ? {
          sn: row.sn,
          model: row.device_model ?? '',
          school: row.device_school ?? '',
          grade: row.device_grade ?? '',
        }
      : null,
    messageCount: num(row.message_count),
  }
}

const LIST_SELECT = `
  SELECT f.*, d.model AS device_model, d.school AS device_school, d.grade AS device_grade,
         u.display_name AS assignee_name,
         (SELECT COUNT(*) FROM feedback_messages m WHERE m.feedback_id = f.id) AS message_count
  FROM feedback f
  LEFT JOIN devices d ON d.sn = f.sn
  LEFT JOIN users u ON u.id = f.assignee_id`

function detail(request: FastifyRequest, id: string) {
  const user = requirePermission(request, 'feedback.view')
  const row = db().prepare(`${LIST_SELECT} WHERE f.id = ?`).get(id) as unknown as FeedbackRow | undefined
  if (!row) fail(404, 'not_found', '反馈不存在')
  const revealInternal = can(user.role, 'feedback.reply')
  const messages = many(
    `SELECT m.*, u.avatar_color AS author_color FROM feedback_messages m
     LEFT JOIN users u ON u.id = m.author_id
     WHERE m.feedback_id = ? ${revealInternal ? '' : 'AND m.internal = 0'}
     ORDER BY m.created_at ASC, m.id ASC`,
    id,
  ).map((message) => ({
    id: num(message.id),
    authorType: message.author_type as string,
    authorName: message.author_name as string,
    authorColor: (message.author_color as string) ?? null,
    body: message.body as string,
    internal: num(message.internal) === 1,
    createdAt: message.created_at as string,
  }))
  return { feedback: feedbackJson(row), messages }
}

export async function feedbackRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/feedback/stats', async (request) => {
    requirePermission(request, 'feedback.view')
    const counts = many<{ status: string; n: number }>(
      'SELECT status, COUNT(*) AS n FROM feedback GROUP BY status',
    )
    const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0]))
    for (const row of counts) byStatus[row.status] = num(row.n)

    const byType = Object.fromEntries(TYPES.map((type) => [type, 0]))
    for (const row of many<{ type: string; n: number }>(
      'SELECT type, COUNT(*) AS n FROM feedback GROUP BY type',
    )) {
      byType[row.type] = num(row.n)
    }

    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const newThisWeek = num(
      one<{ n: number }>('SELECT COUNT(*) AS n FROM feedback WHERE created_at >= ?', weekAgo).n,
    )
    const urgentOpen = num(
      one<{ n: number }>(
        "SELECT COUNT(*) AS n FROM feedback WHERE priority IN ('high','urgent') AND status IN ('pending','in_progress')",
      ).n,
    )
    const avgResponse = one<{ hours: number | null }>(
      `SELECT AVG((julianday(first_reply.at) - julianday(f.created_at)) * 24) AS hours
       FROM feedback f
       JOIN (SELECT feedback_id, MIN(created_at) AS at FROM feedback_messages
             WHERE author_type = 'staff' AND internal = 0 GROUP BY feedback_id) AS first_reply
         ON first_reply.feedback_id = f.id`,
    )
    const unresolved = byStatus.pending + byStatus.in_progress

    return {
      total: counts.reduce((sum, row) => sum + num(row.n), 0),
      byStatus,
      byType,
      newThisWeek,
      urgentOpen,
      unresolved,
      avgResponseHours:
        avgResponse.hours === null || avgResponse.hours === undefined
          ? null
          : Math.round(avgResponse.hours * 10) / 10,
    }
  })

  app.get('/api/feedback', async (request) => {
    requirePermission(request, 'feedback.view')
    const page = pagination(request.query as Row, 20, 100)
    const status = queryString(request, 'status')
    const type = queryString(request, 'type')
    const priority = queryString(request, 'priority')
    const q = queryString(request, 'q')
    const assignee = queryString(request, 'assignee')
    const sort = queryString(request, 'sort') || 'inbox'

    const conditions: string[] = []
    const params: SqlValue[] = []
    if (status === 'open') {
      conditions.push("f.status IN ('pending','in_progress')")
    } else if ((STATUSES as readonly string[]).includes(status)) {
      conditions.push('f.status = ?')
      params.push(status)
    }
    if ((TYPES as readonly string[]).includes(type)) {
      conditions.push('f.type = ?')
      params.push(type)
    }
    if ((PRIORITIES as readonly string[]).includes(priority)) {
      conditions.push('f.priority = ?')
      params.push(priority)
    }
    if (q) {
      conditions.push('(f.title LIKE ? OR f.content LIKE ? OR f.contact LIKE ? OR f.sn LIKE ?)')
      const like = `%${q}%`
      params.push(like, like, like, like)
    }
    if (assignee === 'unassigned') {
      conditions.push('f.assignee_id IS NULL')
    } else if (assignee === 'me') {
      conditions.push('f.assignee_id = ?')
      params.push(requirePermission(request, 'feedback.view').id)
    } else if (assignee) {
      conditions.push('f.assignee_id = ?')
      params.push(assignee)
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const orderMap: Record<string, string> = {
      inbox:
        "CASE f.status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END, f.created_at DESC",
      newest: 'f.created_at DESC',
      oldest: 'f.created_at ASC',
      priority:
        "CASE f.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, f.created_at DESC",
      updated: 'f.updated_at DESC',
    }
    const orderBy = orderMap[sort] ?? orderMap.inbox

    const rows = many(
      `${LIST_SELECT} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      ...params,
      page.pageSize,
      page.offset,
    ) as unknown as FeedbackRow[]
    const total = num(
      one<{ n: number }>(`SELECT COUNT(*) AS n FROM feedback f ${where}`, ...params).n,
    )

    const staff = many<{ id: string; display_name: string; avatar_color: string; role: string }>(
      "SELECT id, display_name, avatar_color, role FROM users WHERE status = 'active' ORDER BY display_name",
    ).map((row) => ({
      id: row.id,
      name: row.display_name,
      color: row.avatar_color,
      role: row.role,
    }))

    return { ...paged(rows.map(feedbackJson), total, page), staff }
  })

  app.get('/api/feedback/:id', async (request) => {
    const id = String((request.params as Row).id)
    return detail(request, id)
  })

  app.post('/api/feedback/:id/replies', async (request) => {
    const user = requirePermission(request, 'feedback.reply')
    const id = String((request.params as Row).id)
    const row = db().prepare('SELECT * FROM feedback WHERE id = ?').get(id) as
      | FeedbackRow
      | undefined
    if (!row) fail(404, 'not_found', '反馈不存在')
    const body = (request.body ?? {}) as { body?: string; internal?: boolean; status?: string }
    const text = clampText(body.body, 4000)
    if (!text) fail(400, 'empty_reply', '回复内容不能为空')
    const internal = body.internal === true
    const at = nowIso()

    db()
      .prepare(
        `INSERT INTO feedback_messages(feedback_id, author_type, author_id, author_name, body, internal, created_at)
         VALUES(?,?,?,?,?,?,?)`,
      )
      .run(id, 'staff', user.id, user.displayName, text, internal ? 1 : 0, at)

    let nextStatus = row.status
    if (!internal && row.status === 'pending') nextStatus = 'in_progress'
    db()
      .prepare(
        `UPDATE feedback SET status = ?, last_reply_at = CASE WHEN ? = 1 THEN last_reply_at ELSE ? END,
           updated_at = ? WHERE id = ?`,
      )
      .run(nextStatus, internal ? 1 : 0, at, at, id)

    if (!internal && nextStatus !== row.status) {
      db()
        .prepare(
          `INSERT INTO feedback_messages(feedback_id, author_type, author_id, author_name, body, internal, created_at)
           VALUES(?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          'system',
          null,
          '系统',
          `状态由「${STATUS_LABEL[row.status]}」自动变更为「${STATUS_LABEL[nextStatus]}」`,
          0,
          at,
        )
    }

    audit(
      request,
      user,
      'feedback.reply',
      'feedback',
      id,
      row.title,
      internal ? '添加了内部备注' : '回复了用户反馈',
    )
    return detail(request, id)
  })

  app.patch('/api/feedback/:id', async (request) => {
    const user = requirePermission(request, 'feedback.manage')
    const id = String((request.params as Row).id)
    const row = db().prepare('SELECT * FROM feedback WHERE id = ?').get(id) as
      | FeedbackRow
      | undefined
    if (!row) fail(404, 'not_found', '反馈不存在')
    const body = (request.body ?? {}) as {
      status?: string
      priority?: string
      assigneeId?: string | null
      tags?: unknown
    }
    const at = nowIso()
    const updates: string[] = []
    const values: SqlValue[] = []
    const notes: string[] = []

    let nextStatus = row.status
    if (body.status && body.status !== row.status) {
      if (!(STATUSES as readonly string[]).includes(body.status)) {
        fail(400, 'invalid_status', '未知的反馈状态')
      }
      nextStatus = body.status
      updates.push('status = ?')
      values.push(nextStatus)
      updates.push('closed_at = ?')
      values.push(nextStatus === 'resolved' || nextStatus === 'closed' ? at : null)
      notes.push(`状态改为「${STATUS_LABEL[nextStatus]}」`)
      db()
        .prepare(
          `INSERT INTO feedback_messages(feedback_id, author_type, author_id, author_name, body, internal, created_at)
           VALUES(?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          'system',
          null,
          '系统',
          `${user.displayName} 把状态由「${STATUS_LABEL[row.status]}」改为「${STATUS_LABEL[nextStatus]}」`,
          0,
          at,
        )
    }

    if (body.priority && body.priority !== row.priority) {
      if (!(PRIORITIES as readonly string[]).includes(body.priority)) {
        fail(400, 'invalid_priority', '未知的优先级')
      }
      updates.push('priority = ?')
      values.push(body.priority)
      notes.push(`优先级改为「${PRIORITY_LABEL[body.priority]}」`)
    }

    if (body.assigneeId !== undefined) {
      const assigneeId = body.assigneeId ? String(body.assigneeId) : null
      if (assigneeId) {
        const exists = db()
          .prepare("SELECT id FROM users WHERE id = ? AND status = 'active'")
          .get(assigneeId)
        if (!exists) fail(400, 'invalid_assignee', '负责人不存在或已被停用')
      }
      updates.push('assignee_id = ?')
      values.push(assigneeId)
      const name = assigneeId
        ? (one<{ display_name: string }>('SELECT display_name FROM users WHERE id = ?', assigneeId)
            .display_name ?? '')
        : ''
      notes.push(assigneeId ? `指派给 ${name}` : '取消指派')
    }

    if (body.tags !== undefined) {
      if (!Array.isArray(body.tags)) fail(400, 'invalid_tags', 'tags 必须是数组')
      const tags = body.tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .slice(0, 8)
      updates.push('tags = ?')
      values.push(JSON.stringify(tags))
      notes.push('更新了标签')
    }

    if (updates.length === 0) fail(400, 'no_changes', '没有需要保存的修改')

    updates.push('updated_at = ?')
    values.push(at)
    values.push(id)
    db()
      .prepare(`UPDATE feedback SET ${updates.join(', ')} WHERE id = ?`)
      .run(...values)

    audit(request, user, 'feedback.update', 'feedback', id, row.title, notes.join('；'))
    return detail(request, id)
  })
}

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { requirePermission } from '../auth.js'
import { db } from '../db.js'
import {
  audit,
  clampText,
  fail,
  paged,
  pagination,
  sendCsv,
  toCsv,
  trailingDays,
  todayRange,
} from '../http.js'
import { TOOL_BY_ID } from '../catalog.js'

type Row = Record<string, unknown>
type SqlValue = string | number | null

function one<T = Row>(sql: string, ...params: SqlValue[]): T {
  return db().prepare(sql).get(...params) as T
}

function many<T = Row>(sql: string, ...params: SqlValue[]): T[] {
  return db().prepare(sql).all(...params) as T[]
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0) || 0
}

export function deviceStatus(lastSeenAt: string): 'online' | 'active' | 'stale' {
  const last = Date.parse(lastSeenAt)
  if (!Number.isFinite(last)) return 'stale'
  if (Date.now() - last <= 30 * 60_000) return 'online'
  const today = todayRange()
  if (lastSeenAt >= today.startIso) return 'active'
  return 'stale'
}

function deviceJson(row: Row) {
  const lastSeenAt = String(row.last_seen_at ?? '')
  return {
    sn: row.sn as string,
    model: (row.model as string) ?? '',
    manufacturer: (row.manufacturer as string) ?? '',
    osVersion: (row.os_version as string) ?? '',
    sdkInt: num(row.sdk_int),
    appVersion: (row.app_version as string) ?? '',
    versionCode: num(row.version_code),
    channel: (row.channel as string) ?? '',
    school: (row.school as string) ?? '',
    grade: (row.grade as string) ?? '',
    firstSeenAt: row.first_seen_at as string,
    lastSeenAt,
    totalSessions: num(row.total_sessions),
    totalOpens: num(row.total_opens),
    status: deviceStatus(lastSeenAt),
    feedbackCount: num(row.feedback_count),
    overrideCount: num(row.override_count),
  }
}

function queryString(request: FastifyRequest, key: string): string {
  const value = (request.query as Row)[key]
  return typeof value === 'string' ? value.trim() : ''
}

export async function telemetryRoutes(app: FastifyInstance): Promise<void> {
  /* ------------------------------ 设备 ------------------------------- */
  app.get('/api/devices', async (request) => {
    requirePermission(request, 'telemetry.view')
    const page = pagination(request.query as Row, 20, 100)
    const q = queryString(request, 'q')
    const version = queryString(request, 'version')
    const channel = queryString(request, 'channel')
    const grade = queryString(request, 'grade')
    const school = queryString(request, 'school')
    const activity = queryString(request, 'activity')
    const sort = queryString(request, 'sort') || 'lastSeen'
    const direction = queryString(request, 'direction') === 'asc' ? 'ASC' : 'DESC'

    const conditions: string[] = []
    const params: SqlValue[] = []
    if (q) {
      conditions.push('(d.sn LIKE ? OR d.model LIKE ? OR d.school LIKE ? OR d.manufacturer LIKE ?)')
      const like = `%${q}%`
      params.push(like, like, like, like)
    }
    if (version) {
      conditions.push('d.app_version = ?')
      params.push(version)
    }
    if (channel) {
      conditions.push('d.channel = ?')
      params.push(channel)
    }
    if (grade) {
      conditions.push('d.grade = ?')
      params.push(grade)
    }
    if (school) {
      conditions.push('d.school = ?')
      params.push(school)
    }
    const today = todayRange()
    if (activity === 'online') {
      conditions.push('d.last_seen_at >= ?')
      params.push(new Date(Date.now() - 30 * 60_000).toISOString())
    } else if (activity === 'active') {
      conditions.push('d.last_seen_at >= ?')
      params.push(today.startIso)
    } else if (activity === 'stale') {
      conditions.push('d.last_seen_at < ?')
      params.push(today.startIso)
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const orderMap: Record<string, string> = {
      lastSeen: 'd.last_seen_at',
      firstSeen: 'd.first_seen_at',
      sessions: 'd.total_sessions',
      opens: 'd.total_opens',
      model: 'd.model',
    }
    const orderBy = orderMap[sort] ?? orderMap.lastSeen

    const rows = many(
      `SELECT d.*, (SELECT COUNT(*) FROM feedback f WHERE f.sn = d.sn) AS feedback_count,
              (SELECT COUNT(*) FROM device_tool_overrides o WHERE o.sn = d.sn) AS override_count
       FROM devices d ${where}
       ORDER BY ${orderBy} ${direction}
       LIMIT ? OFFSET ?`,
      ...params,
      page.pageSize,
      page.offset,
    )
    const total = num(one<{ n: number }>(`SELECT COUNT(*) AS n FROM devices d ${where}`, ...params).n)

    const facets = {
      versions: many<{ version: string; n: number }>(
        'SELECT app_version AS version, COUNT(*) AS n FROM devices GROUP BY app_version ORDER BY n DESC',
      ).map((row) => ({ version: row.version, count: num(row.n) })),
      channels: many<{ channel: string; n: number }>(
        'SELECT channel, COUNT(*) AS n FROM devices GROUP BY channel',
      ).map((row) => ({ channel: row.channel, count: num(row.n) })),
      grades: many<{ grade: string; n: number }>(
        'SELECT grade, COUNT(*) AS n FROM devices GROUP BY grade ORDER BY n DESC',
      ).map((row) => ({ grade: row.grade || '未填写', count: num(row.n) })),
      schools: many<{ school: string; n: number }>(
        'SELECT school, COUNT(*) AS n FROM devices GROUP BY school ORDER BY n DESC',
      ).map((row) => ({ school: row.school || '未填写', count: num(row.n) })),
    }

    return { ...paged(rows.map(deviceJson), total, page), facets }
  })

  app.get('/api/devices/:sn', async (request) => {
    requirePermission(request, 'telemetry.view')
    const sn = String((request.params as Row).sn ?? '')
    const row = db()
      .prepare(
        `SELECT d.*,
                (SELECT COUNT(*) FROM device_tool_overrides o WHERE o.sn = d.sn) AS override_count
         FROM devices d WHERE d.sn = ?`,
      )
      .get(sn) as Row | undefined
    if (!row) fail(404, 'not_found', '设备不存在')
    const device = deviceJson(row)

    const { startIso, endIso, dates } = trailingDays(14)
    const sessions = many<{ d: string; n: number; devices: number }>(
      `SELECT date(occurred_at, '+8 hours') AS d, COUNT(*) AS n, COUNT(DISTINCT sn) AS devices
       FROM events WHERE sn = ? AND name = 'session_start' AND occurred_at >= ? AND occurred_at < ? GROUP BY d`,
      sn,
      startIso,
      endIso,
    )
    const opens = many<{ d: string; n: number }>(
      `SELECT date(occurred_at, '+8 hours') AS d, COUNT(*) AS n FROM events
       WHERE sn = ? AND name = 'tool_open' AND occurred_at >= ? AND occurred_at < ? GROUP BY d`,
      sn,
      startIso,
      endIso,
    )
    const sessionMap = new Map(sessions.map((entry) => [entry.d, entry]))
    const openMap = new Map(opens.map((entry) => [entry.d, num(entry.n)]))
    const usage = dates.map((date) => ({
      date,
      sessions: num(sessionMap.get(date)?.n),
      toolOpens: num(openMap.get(date)),
    }))

    const tools = many(
      `SELECT tool_id, COUNT(*) AS opens, COUNT(DISTINCT date(occurred_at, '+8 hours')) AS days
       FROM events WHERE sn = ? AND name = 'tool_open' GROUP BY tool_id ORDER BY opens DESC LIMIT 11`,
      sn,
    ).map((entry) => {
      const tool = TOOL_BY_ID.get(String(entry.tool_id))
      return {
        toolId: entry.tool_id as string,
        title: tool?.title ?? String(entry.tool_id),
        subjectId: tool?.subjectId ?? '',
        opens: num(entry.opens),
        days: num(entry.days),
      }
    })

    const recentEvents = many(
      `SELECT id, name, tool_id, app_version, props, occurred_at FROM events
       WHERE sn = ? ORDER BY occurred_at DESC LIMIT 40`,
      sn,
    ).map((entry) => ({
      id: num(entry.id),
      name: entry.name as string,
      toolId: entry.tool_id as string | null,
      toolTitle: entry.tool_id ? TOOL_BY_ID.get(String(entry.tool_id))?.title ?? null : null,
      appVersion: entry.app_version as string,
      props: entry.props as string,
      occurredAt: entry.occurred_at as string,
    }))

    const versions = many(
      `SELECT app_version AS version, MIN(occurred_at) AS first_seen, MAX(occurred_at) AS last_seen, COUNT(*) AS events
       FROM events WHERE sn = ? GROUP BY app_version ORDER BY last_seen DESC`,
      sn,
    ).map((entry) => ({
      version: entry.version as string,
      firstSeenAt: entry.first_seen as string,
      lastSeenAt: entry.last_seen as string,
      events: num(entry.events),
    }))

    const feedback = many(
      `SELECT id, title, type, status, priority, created_at FROM feedback
       WHERE sn = ? ORDER BY created_at DESC LIMIT 8`,
      sn,
    ).map((entry) => ({
      id: entry.id as string,
      title: entry.title as string,
      type: entry.type as string,
      status: entry.status as string,
      priority: entry.priority as string,
      createdAt: entry.created_at as string,
    }))

    const errors = many(
      `SELECT id, signature, message, resolved, occurred_at FROM errors
       WHERE sn = ? ORDER BY occurred_at DESC LIMIT 8`,
      sn,
    ).map((entry) => ({
      id: num(entry.id),
      signature: entry.signature as string,
      message: entry.message as string,
      resolved: num(entry.resolved) === 1,
      occurredAt: entry.occurred_at as string,
    }))

    return { device, usage, tools, recentEvents, versions, feedback, errors }
  })

  /* ------------------------------ 事件流 ----------------------------- */
  app.get('/api/events', async (request) => {
    requirePermission(request, 'telemetry.view')
    const page = pagination(request.query as Row, 30, 200)
    const name = queryString(request, 'name')
    const sn = queryString(request, 'sn')
    const toolId = queryString(request, 'toolId')
    const range = Number(queryString(request, 'range') || 0)
    const conditions: string[] = []
    const params: SqlValue[] = []
    if (name) {
      conditions.push('e.name = ?')
      params.push(name)
    }
    if (sn) {
      conditions.push('e.sn LIKE ?')
      params.push(`%${sn}%`)
    }
    if (toolId) {
      conditions.push('e.tool_id = ?')
      params.push(toolId)
    }
    if (range > 0) {
      conditions.push('e.occurred_at >= ?')
      params.push(new Date(Date.now() - range * 86_400_000).toISOString())
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows = many(
      `SELECT e.*, d.model, d.school, d.grade FROM events e
       LEFT JOIN devices d ON d.sn = e.sn
       ${where} ORDER BY e.occurred_at DESC, e.id DESC LIMIT ? OFFSET ?`,
      ...params,
      page.pageSize,
      page.offset,
    )
    const total = num(one<{ n: number }>(`SELECT COUNT(*) AS n FROM events e ${where}`, ...params).n)
    const names = many<{ name: string; n: number }>(
      'SELECT name, COUNT(*) AS n FROM events GROUP BY name ORDER BY n DESC',
    ).map((entry) => ({ name: entry.name, count: num(entry.n) }))

    return {
      ...paged(
        rows.map((row) => ({
          id: num(row.id),
          sn: row.sn as string,
          name: row.name as string,
          toolId: row.tool_id as string | null,
          toolTitle: row.tool_id ? TOOL_BY_ID.get(String(row.tool_id))?.title ?? null : null,
          subjectId: row.subject_id as string | null,
          appVersion: row.app_version as string,
          channel: row.channel as string,
          props: row.props as string,
          occurredAt: row.occurred_at as string,
          receivedAt: row.received_at as string,
          model: row.model as string | null,
          school: row.school as string | null,
          grade: row.grade as string | null,
        })),
        total,
        page,
      ),
      names,
    }
  })

  /* ------------------------------ 崩溃 ------------------------------- */
  app.get('/api/errors', async (request) => {
    requirePermission(request, 'telemetry.view')
    const page = pagination(request.query as Row, 10, 100)
    const status = queryString(request, 'status') || 'all'
    const q = queryString(request, 'q')
    const toolId = queryString(request, 'toolId')
    const conditions: string[] = []
    const params: SqlValue[] = []
    if (q) {
      conditions.push('(signature LIKE ? OR message LIKE ?)')
      params.push(`%${q}%`, `%${q}%`)
    }
    if (toolId) {
      conditions.push('tool_id = ?')
      params.push(toolId)
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const having =
      status === 'unresolved'
        ? 'HAVING SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) > 0'
        : status === 'resolved'
          ? 'HAVING SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) = 0'
          : ''

    const groups = many(
      `SELECT signature, MAX(message) AS message, MAX(tool_id) AS tool_id,
              COUNT(*) AS total, COUNT(DISTINCT sn) AS devices,
              SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) AS unresolved,
              MIN(occurred_at) AS first_seen, MAX(occurred_at) AS last_seen
       FROM errors ${where} GROUP BY signature ${having}
       ORDER BY last_seen DESC LIMIT ? OFFSET ?`,
      ...params,
      page.pageSize,
      page.offset,
    )
    const countRow = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM (
         SELECT signature FROM errors ${where} GROUP BY signature ${having}
       )`,
      ...params,
    )

    return paged(
      groups.map((group) => ({
        signature: group.signature as string,
        message: group.message as string,
        toolId: (group.tool_id as string) ?? null,
        toolTitle: group.tool_id ? TOOL_BY_ID.get(String(group.tool_id))?.title ?? null : null,
        total: num(group.total),
        devices: num(group.devices),
        unresolved: num(group.unresolved),
        firstSeenAt: group.first_seen as string,
        lastSeenAt: group.last_seen as string,
      })),
      num(countRow.n),
      page,
    )
  })

  app.get('/api/errors/detail', async (request) => {
    requirePermission(request, 'telemetry.view')
    const signature = queryString(request, 'signature')
    if (!signature) fail(400, 'missing_signature', '缺少 signature 参数')
    const summary = one(
      `SELECT signature, MAX(message) AS message, MAX(stack) AS stack, MAX(tool_id) AS tool_id,
              COUNT(*) AS total, COUNT(DISTINCT sn) AS devices,
              SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) AS unresolved,
              MIN(occurred_at) AS first_seen, MAX(occurred_at) AS last_seen
       FROM errors WHERE signature = ?`,
      signature,
    )
    if (!summary.signature) fail(404, 'not_found', '崩溃记录不存在')

    const occurrences = many(
      `SELECT e.id, e.sn, e.message, e.app_version, e.channel, e.occurred_at, e.resolved,
              d.model, d.school, d.grade
       FROM errors e LEFT JOIN devices d ON d.sn = e.sn
       WHERE e.signature = ? ORDER BY e.occurred_at DESC LIMIT 50`,
      signature,
    ).map((row) => ({
      id: num(row.id),
      sn: row.sn as string,
      message: row.message as string,
      appVersion: row.app_version as string,
      channel: row.channel as string,
      occurredAt: row.occurred_at as string,
      resolved: num(row.resolved) === 1,
      model: (row.model as string) ?? '',
      school: (row.school as string) ?? '',
      grade: (row.grade as string) ?? '',
    }))

    const versions = many<{ version: string; n: number }>(
      'SELECT app_version AS version, COUNT(*) AS n FROM errors WHERE signature = ? GROUP BY app_version ORDER BY n DESC',
      signature,
    ).map((row) => ({ version: row.version, count: num(row.n) }))

    return {
      signature: summary.signature as string,
      message: summary.message as string,
      stack: summary.stack as string,
      toolId: (summary.tool_id as string) ?? null,
      total: num(summary.total),
      devices: num(summary.devices),
      unresolved: num(summary.unresolved),
      firstSeenAt: summary.first_seen as string,
      lastSeenAt: summary.last_seen as string,
      occurrences,
      versions,
    }
  })

  app.post('/api/errors/resolve', async (request) => {
    const user = requirePermission(request, 'telemetry.manage')
    const body = (request.body ?? {}) as { signature?: string; resolved?: boolean }
    const signature = clampText(body.signature, 500)
    if (!signature) fail(400, 'missing_signature', '缺少 signature 参数')
    const resolved = body.resolved !== false
    db()
      .prepare(
        'UPDATE errors SET resolved = ?, resolved_at = ?, resolved_by = ? WHERE signature = ?',
      )
      .run(resolved ? 1 : 0, resolved ? new Date().toISOString() : null, resolved ? user.displayName : null, signature)
    audit(
      request,
      user,
      resolved ? 'error.resolve' : 'error.reopen',
      'error',
      signature,
      signature.slice(0, 80),
      resolved ? '把一组崩溃标记为已处理' : '重新打开一组崩溃',
    )
    return { ok: true }
  })

  /* ------------------------------ 导出 ------------------------------- */
  app.get('/api/export/devices.csv', async (request, reply) => {
    requirePermission(request, 'telemetry.export')
    const rows = many(
      `SELECT sn, model, manufacturer, os_version, app_version, channel, school, grade,
              first_seen_at, last_seen_at, total_sessions, total_opens FROM devices
       ORDER BY last_seen_at DESC`,
    )
    const csv = toCsv(
      [
        { key: 'sn', label: '设备 ID' },
        { key: 'model', label: '型号' },
        { key: 'manufacturer', label: '厂商' },
        { key: 'os_version', label: '系统' },
        { key: 'app_version', label: '应用版本' },
        { key: 'channel', label: '渠道' },
        { key: 'school', label: '学校' },
        { key: 'grade', label: '年级' },
        { key: 'first_seen_at', label: '首次活跃(UTC)' },
        { key: 'last_seen_at', label: '最近活跃(UTC)' },
        { key: 'total_sessions', label: '会话数' },
        { key: 'total_opens', label: '工具调用' },
      ],
      rows,
    )
    sendCsv(reply, `stb-devices-${new Date().toISOString().slice(0, 10)}.csv`, csv)
    return reply
  })

  app.get('/api/export/events.csv', async (request, reply) => {
    requirePermission(request, 'telemetry.export')
    const days = Math.min(30, Math.max(1, Number(queryString(request, 'range')) || 7))
    const rows = many(
      `SELECT occurred_at, sn, name, tool_id, app_version, channel, props FROM events
       WHERE occurred_at >= ? ORDER BY occurred_at DESC LIMIT 50000`,
      new Date(Date.now() - days * 86_400_000).toISOString(),
    )
    const csv = toCsv(
      [
        { key: 'occurred_at', label: '时间(UTC)' },
        { key: 'sn', label: '设备 ID' },
        { key: 'name', label: '事件' },
        { key: 'tool_id', label: '工具' },
        { key: 'app_version', label: '版本' },
        { key: 'channel', label: '渠道' },
        { key: 'props', label: '属性' },
      ],
      rows,
    )
    sendCsv(reply, `stb-events-${days}d-${new Date().toISOString().slice(0, 10)}.csv`, csv)
    return reply
  })
}

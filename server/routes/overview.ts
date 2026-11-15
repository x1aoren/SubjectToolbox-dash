import type { FastifyInstance } from 'fastify'
import { db } from '../db.js'
import { requirePermission } from '../auth.js'
import { parseRange, todayRange, trailingDays } from '../http.js'
import { SUBJECTS, TOOLS, TOOL_BY_ID } from '../catalog.js'

const DAY_MS = 86_400_000

type Row = Record<string, unknown>

function one<T = Row>(sql: string, ...params: Array<string | number | null>): T {
  return db().prepare(sql).get(...params) as T
}

function many<T = Row>(sql: string, ...params: Array<string | number | null>): T[] {
  return db().prepare(sql).all(...params) as T[]
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0) || 0
}

function delta(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? null : 0
  return (current - previous) / previous
}

export async function overviewRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/overview', async (request) => {
    requirePermission(request, 'dashboard.view')
    const range = parseRange((request.query as Row).range)
    const { startIso, endIso, dates } = trailingDays(range)
    const prevStartIso = new Date(Date.parse(startIso) - range * DAY_MS).toISOString()
    const today = todayRange()

    const sessionsCur = one<{ n: number; d: number; avg: number }>(
      `SELECT COUNT(*) AS n, COUNT(DISTINCT sn) AS d FROM events
       WHERE name = 'session_start' AND occurred_at >= ? AND occurred_at < ?`,
      startIso,
      endIso,
    )
    const sessionsPrev = one<{ n: number; d: number }>(
      `SELECT COUNT(*) AS n, COUNT(DISTINCT sn) AS d FROM events
       WHERE name = 'session_start' AND occurred_at >= ? AND occurred_at < ?`,
      prevStartIso,
      startIso,
    )
    const opensCur = one<{ n: number; d: number }>(
      `SELECT COUNT(*) AS n, COUNT(DISTINCT sn) AS d FROM events
       WHERE name = 'tool_open' AND occurred_at >= ? AND occurred_at < ?`,
      startIso,
      endIso,
    )
    const opensPrev = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM events WHERE name = 'tool_open' AND occurred_at >= ? AND occurred_at < ?`,
      prevStartIso,
      startIso,
    )
    const errorsCur = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM errors WHERE occurred_at >= ? AND occurred_at < ?`,
      startIso,
      endIso,
    )
    const errorsPrev = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM errors WHERE occurred_at >= ? AND occurred_at < ?`,
      prevStartIso,
      startIso,
    )
    const newDevicesCur = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM devices WHERE first_seen_at >= ? AND first_seen_at < ?`,
      startIso,
      endIso,
    )
    const newDevicesPrev = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM devices WHERE first_seen_at >= ? AND first_seen_at < ?`,
      prevStartIso,
      startIso,
    )
    const todayStats = one<{ devices: number; sessions: number; opens: number }>(
      `SELECT
         COUNT(DISTINCT CASE WHEN name = 'session_start' THEN sn END) AS devices,
         SUM(CASE WHEN name = 'session_start' THEN 1 ELSE 0 END) AS sessions,
         SUM(CASE WHEN name = 'tool_open' THEN 1 ELSE 0 END) AS opens
       FROM events WHERE occurred_at >= ? AND occurred_at < ?`,
      today.startIso,
      today.endIso,
    )
    const online = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM devices WHERE last_seen_at >= ?`,
      new Date(Date.now() - 30 * 60_000).toISOString(),
    )
    const pendingFeedback = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM feedback WHERE status = 'pending'`,
    )
    const inProgressFeedback = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM feedback WHERE status = 'in_progress'`,
    )
    const newFeedback = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM feedback WHERE created_at >= ? AND created_at < ?`,
      startIso,
      endIso,
    )
    const urgentFeedback = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM feedback
       WHERE priority IN ('high','urgent') AND status IN ('pending','in_progress')`,
    )
    const unresolved = one<{ n: number; d: number }>(
      `SELECT COUNT(*) AS n, COUNT(DISTINCT sn) AS d FROM errors WHERE resolved = 0`,
    )
    const avgSession = one<{ ms: number | null }>(
      `SELECT AVG(json_extract(props, '$.durationMs')) AS ms FROM events
       WHERE name = 'session_end' AND occurred_at >= ? AND occurred_at < ?`,
      startIso,
      endIso,
    )
    const retention = one<{ total: number; returned: number }>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN EXISTS (
                SELECT 1 FROM events e
                WHERE e.sn = d.sn AND e.name = 'session_start'
                  AND e.occurred_at >= datetime(d.first_seen_at, '+7 days')
                  AND e.occurred_at < ?
              ) THEN 1 ELSE 0 END) AS returned
       FROM devices d WHERE d.first_seen_at >= ? AND d.first_seen_at < ?`,
      endIso,
      new Date(Date.parse(endIso) - 14 * DAY_MS).toISOString(),
      new Date(Date.parse(endIso) - 7 * DAY_MS).toISOString(),
    )

    /* ------------------------------ 每日序列 ------------------------------ */
    const dayKey = (expr: string) => `date(${expr}, '+8 hours')`
    const sessionsByDay = many<{ d: string; n: number; devices: number }>(
      `SELECT ${dayKey('occurred_at')} AS d, COUNT(*) AS n, COUNT(DISTINCT sn) AS devices
       FROM events WHERE name = 'session_start' AND occurred_at >= ? AND occurred_at < ?
       GROUP BY d`,
      startIso,
      endIso,
    )
    const opensByDay = many<{ d: string; n: number }>(
      `SELECT ${dayKey('occurred_at')} AS d, COUNT(*) AS n FROM events
       WHERE name = 'tool_open' AND occurred_at >= ? AND occurred_at < ? GROUP BY d`,
      startIso,
      endIso,
    )
    const errorsByDay = many<{ d: string; n: number }>(
      `SELECT ${dayKey('occurred_at')} AS d, COUNT(*) AS n FROM errors
       WHERE occurred_at >= ? AND occurred_at < ? GROUP BY d`,
      startIso,
      endIso,
    )
    const devicesByDay = many<{ d: string; n: number }>(
      `SELECT ${dayKey('first_seen_at')} AS d, COUNT(*) AS n FROM devices
       WHERE first_seen_at >= ? AND first_seen_at < ? GROUP BY d`,
      startIso,
      endIso,
    )

    const sessionMap = new Map(sessionsByDay.map((row) => [row.d, row]))
    const openMap = new Map(opensByDay.map((row) => [row.d, row.n]))
    const errorMap = new Map(errorsByDay.map((row) => [row.d, row.n]))
    const deviceMap = new Map(devicesByDay.map((row) => [row.d, row.n]))

    const series = dates.map((date) => {
      const session = sessionMap.get(date)
      return {
        date,
        activeDevices: num(session?.devices),
        sessions: num(session?.n),
        toolOpens: num(openMap.get(date)),
        errors: num(errorMap.get(date)),
        newDevices: num(deviceMap.get(date)),
      }
    })

    /* ------------------------------ 工具 --------------------------------- */
    const toolOpens = many<{ tool_id: string; opens: number; devices: number }>(
      `SELECT tool_id, COUNT(*) AS opens, COUNT(DISTINCT sn) AS devices FROM events
       WHERE name = 'tool_open' AND occurred_at >= ? AND occurred_at < ? GROUP BY tool_id`,
      startIso,
      endIso,
    )
    const toolOpensPrev = many<{ tool_id: string; opens: number }>(
      `SELECT tool_id, COUNT(*) AS opens FROM events
       WHERE name = 'tool_open' AND occurred_at >= ? AND occurred_at < ? GROUP BY tool_id`,
      prevStartIso,
      startIso,
    )
    const toolErrors = many<{ tool_id: string; n: number }>(
      `SELECT tool_id, COUNT(*) AS n FROM errors
       WHERE occurred_at >= ? AND occurred_at < ? AND tool_id IS NOT NULL GROUP BY tool_id`,
      startIso,
      endIso,
    )
    const prevOpenMap = new Map(toolOpensPrev.map((row) => [row.tool_id, num(row.opens)]))
    const errorToolMap = new Map(toolErrors.map((row) => [row.tool_id, num(row.n)]))
    const totalToolOpens = toolOpens.reduce((sum, row) => sum + num(row.opens), 0)

    const tools = TOOLS.map((tool) => {
      const row = toolOpens.find((entry) => entry.tool_id === tool.id)
      const opens = num(row?.opens)
      return {
        toolId: tool.id,
        title: tool.title,
        subjectId: tool.subjectId,
        glyph: tool.glyph,
        opens,
        devices: num(row?.devices),
        share: totalToolOpens > 0 ? opens / totalToolOpens : 0,
        errors: errorToolMap.get(tool.id) ?? 0,
        delta: delta(opens, prevOpenMap.get(tool.id) ?? 0),
      }
    }).sort((a, b) => b.opens - a.opens)

    const subjectRows = many<{ subject_id: string; opens: number; devices: number }>(
      `SELECT subject_id, COUNT(*) AS opens, COUNT(DISTINCT sn) AS devices FROM events
       WHERE name = 'tool_open' AND occurred_at >= ? AND occurred_at < ? AND subject_id IS NOT NULL
       GROUP BY subject_id`,
      startIso,
      endIso,
    )
    const subjects = SUBJECTS.map((subject) => {
      const row = subjectRows.find((entry) => entry.subject_id === subject.id)
      return {
        subjectId: subject.id,
        name: subject.name,
        short: subject.short,
        accent: subject.accent,
        opens: num(row?.opens),
        devices: num(row?.devices),
      }
    }).sort((a, b) => b.opens - a.opens)

    const versions = many<{ version: string; n: number }>(
      `SELECT app_version AS version, COUNT(*) AS n FROM devices
       GROUP BY app_version ORDER BY n DESC`,
    ).map((row) => ({
      version: row.version || '未知',
      devices: num(row.n),
    }))
    const versionTotal = versions.reduce((sum, row) => sum + row.devices, 0)

    const channels = many<{ channel: string; n: number }>(
      `SELECT channel, COUNT(*) AS n FROM devices GROUP BY channel`,
    ).map((row) => ({ channel: row.channel, devices: num(row.n) }))

    const grades = many<{ grade: string; n: number }>(
      `SELECT grade, COUNT(*) AS n FROM devices GROUP BY grade ORDER BY n DESC`,
    ).map((row) => ({ grade: row.grade || '未填写', devices: num(row.n) }))

    /* ------------------------------ 热力图 -------------------------------- */
    const heatRows = many<{ weekday: number; hour: number; n: number }>(
      `SELECT CAST(strftime('%w', occurred_at, '+8 hours') AS INTEGER) AS weekday,
              CAST(strftime('%H', occurred_at, '+8 hours') AS INTEGER) AS hour,
              COUNT(*) AS n
       FROM events WHERE name = 'tool_open' AND occurred_at >= ? AND occurred_at < ?
       GROUP BY weekday, hour`,
      startIso,
      endIso,
    )
    const heatmap: Array<{ weekday: number; hour: number; count: number }> = []
    for (let weekday = 0; weekday < 7; weekday += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        const row = heatRows.find((entry) => entry.weekday === weekday && entry.hour === hour)
        heatmap.push({ weekday, hour, count: num(row?.n) })
      }
    }

    const topErrors = many(
      `SELECT signature, MAX(message) AS message, MAX(tool_id) AS tool_id,
              COUNT(*) AS count, COUNT(DISTINCT sn) AS devices,
              SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) AS unresolved,
              MAX(occurred_at) AS last_seen
       FROM errors WHERE occurred_at >= ? AND occurred_at < ?
       GROUP BY signature ORDER BY count DESC LIMIT 5`,
      startIso,
      endIso,
    ).map((row) => ({
      signature: row.signature as string,
      message: row.message as string,
      toolId: (row.tool_id as string) ?? null,
      count: num(row.count),
      devices: num(row.devices),
      unresolved: num(row.unresolved),
      lastSeenAt: row.last_seen as string,
    }))

    const recentFeedback = many(
      `SELECT f.id, f.type, f.title, f.status, f.priority, f.created_at, f.app_version,
              d.model, d.school, d.grade
       FROM feedback f LEFT JOIN devices d ON d.sn = f.sn
       ORDER BY f.created_at DESC LIMIT 6`,
    ).map((row) => ({
      id: row.id as string,
      type: row.type as string,
      title: row.title as string,
      status: row.status as string,
      priority: row.priority as string,
      createdAt: row.created_at as string,
      appVersion: (row.app_version as string) ?? '',
      deviceModel: (row.model as string) ?? '',
      school: (row.school as string) ?? '',
      grade: (row.grade as string) ?? '',
    }))

    const activity = many(
      `SELECT id, actor_name, action, target_type, target_label, detail, created_at
       FROM audit_logs WHERE action NOT IN ('auth.login','auth.logout') AND actor_name != '系统'
       ORDER BY created_at DESC LIMIT 8`,
    ).map((row) => ({
      id: num(row.id),
      actorName: row.actor_name as string,
      action: row.action as string,
      targetType: row.target_type as string,
      targetLabel: row.target_label as string,
      detail: row.detail as string,
      createdAt: row.created_at as string,
    }))

    const errorRate = num(sessionsCur.n) > 0 ? num(errorsCur.n) / num(sessionsCur.n) : 0

    return {
      generatedAt: new Date().toISOString(),
      range,
      today: {
        date: today.date,
        activeDevices: num(todayStats.devices),
        sessions: num(todayStats.sessions),
        toolOpens: num(todayStats.opens),
      },
      kpis: {
        activeDevices: num(sessionsCur.d),
        activeDevicesDelta: delta(num(sessionsCur.d), num(sessionsPrev.d)),
        sessions: num(sessionsCur.n),
        sessionsDelta: delta(num(sessionsCur.n), num(sessionsPrev.n)),
        toolOpens: num(opensCur.n),
        toolOpensDelta: delta(num(opensCur.n), num(opensPrev.n)),
        pendingFeedback: num(pendingFeedback.n),
        inProgressFeedback: num(inProgressFeedback.n),
        newFeedback: num(newFeedback.n),
        urgentFeedback: num(urgentFeedback.n),
        unresolvedErrors: num(unresolved.n),
        errorDevices: num(unresolved.d),
        errorRate,
        errorRateDelta: delta(num(errorsCur.n), num(errorsPrev.n)),
        newDevices: num(newDevicesCur.n),
        newDevicesDelta: delta(num(newDevicesCur.n), num(newDevicesPrev.n)),
        avgSessionMinutes: Math.round(num(avgSession.ms) / 60_000),
        retention7d: num(retention.total) > 0 ? num(retention.returned) / num(retention.total) : 0,
        onlineDevices: num(online.n),
        totalDevices: versionTotal,
      },
      series,
      tools,
      subjects,
      versions: versions.map((row) => ({
        ...row,
        share: versionTotal > 0 ? row.devices / versionTotal : 0,
      })),
      channels,
      grades,
      heatmap,
      topErrors,
      recentFeedback,
      activity,
      toolMeta: TOOLS.map((tool) => ({
        id: tool.id,
        title: tool.title,
        subjectId: tool.subjectId,
        summary: tool.summary,
        glyph: tool.glyph,
        subject: TOOL_BY_ID.get(tool.id)?.subjectId ?? '',
      })),
    }
  })
}

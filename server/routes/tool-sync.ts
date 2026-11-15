import type { FastifyInstance } from 'fastify'
import { requirePermission } from '../auth.js'
import { db } from '../db.js'
import { TOOLS, TOOL_BY_ID } from '../catalog.js'
import { overrideCount } from '../overrides.js'

type Row = Record<string, unknown>

export async function toolSyncRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/tools/sync', async (request) => {
    requirePermission(request, 'config.view')
    const synced = db()
      .prepare(
        `SELECT tool_id, title, subject_id, first_reported_at, last_reported_at, last_sn, report_count
         FROM client_tools ORDER BY last_reported_at DESC`,
      )
      .all() as Row[]
    const perDevice = db()
      .prepare('SELECT tool_id, COUNT(DISTINCT sn) AS devices FROM device_tools GROUP BY tool_id')
      .all() as Array<{ tool_id: string; devices: number }>
    const deviceCount = (
      db().prepare('SELECT COUNT(DISTINCT sn) AS n FROM device_tools').get() as { n: number }
    ).n
    const syncedById = new Map(synced.map((row) => [String(row.tool_id), row]))
    const deviceMap = new Map(perDevice.map((row) => [row.tool_id, Number(row.devices)]))

    const tools = TOOLS.map((tool) => {
      const row = syncedById.get(tool.id)
      return {
        toolId: tool.id,
        expectedTitle: tool.title,
        expectedSubjectId: tool.subjectId,
        title: (row?.title as string) ?? tool.title,
        subjectId: (row?.subject_id as string) ?? tool.subjectId,
        synced: Boolean(row),
        reportCount: Number(row?.report_count ?? 0),
        devices: deviceMap.get(tool.id) ?? 0,
        lastReportedAt: (row?.last_reported_at as string) ?? null,
        titleMismatch: Boolean(row) && String(row?.title) !== tool.title,
        extra: false,
      }
    })
    const extras = synced
      .filter((row) => !TOOL_BY_ID.has(String(row.tool_id)))
      .map((row) => ({
        toolId: String(row.tool_id),
        expectedTitle: '',
        expectedSubjectId: '',
        title: String(row.title),
        subjectId: String(row.subject_id),
        synced: true,
        reportCount: Number(row.report_count ?? 0),
        devices: deviceMap.get(String(row.tool_id)) ?? 0,
        lastReportedAt: (row.last_reported_at as string) ?? null,
        titleMismatch: false,
        extra: true,
      }))

    const lastReportedAt = synced.reduce<string | null>(
      (latest, row) => {
        const value = String(row.last_reported_at ?? '')
        return latest === null || value > latest ? value : latest
      },
      null,
    )

    return {
      tools: [...tools, ...extras],
      expectedCount: TOOLS.length,
      syncedCount: tools.filter((tool) => tool.synced).length,
      deviceCount: Number(deviceCount),
      missing: tools.filter((tool) => !tool.synced).map((tool) => tool.toolId),
      titleMismatch: tools.filter((tool) => tool.titleMismatch).map((tool) => tool.toolId),
      extras: extras.map((tool) => tool.toolId),
      lastReportedAt,
      overrideCount: (
        db().prepare('SELECT COUNT(*) AS n FROM device_tool_overrides').get() as { n: number }
      ).n,
    }
  })

  app.get('/api/tools/overrides/summary', async (request) => {
    requirePermission(request, 'config.view')
    const rows = db()
      .prepare(
        `SELECT o.sn, o.tool_id, o.enabled, o.note, o.updated_by_name, o.updated_at,
                d.model, d.school, d.grade
         FROM device_tool_overrides o
         LEFT JOIN devices d ON d.sn = o.sn
         ORDER BY o.updated_at DESC LIMIT 100`,
      )
      .all() as Row[]
    return {
      items: rows.map((row) => ({
        sn: row.sn as string,
        toolId: row.tool_id as string,
        toolTitle: TOOL_BY_ID.get(String(row.tool_id))?.title ?? String(row.tool_id),
        enabled: Number(row.enabled) === 1,
        note: (row.note as string) ?? '',
        updatedBy: (row.updated_by_name as string) ?? '',
        updatedAt: row.updated_at as string,
        model: (row.model as string) ?? '',
        school: (row.school as string) ?? '',
        grade: (row.grade as string) ?? '',
      })),
    }
  })

  // 供设备详情页之外的地方复用（避免把 overrideCount 的 SQL 散落各处）
  void overrideCount
}

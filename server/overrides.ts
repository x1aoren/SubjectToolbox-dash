import { db, nowIso } from './db.js'
import { TOOL_BY_ID } from './catalog.js'

export interface DeviceOverride {
  toolId: string
  enabled: boolean
  note: string
  updatedBy: string
  updatedAt: string
}

export function overrideRows(sn: string): DeviceOverride[] {
  const rows = db()
    .prepare(
      `SELECT tool_id, enabled, note, updated_by_name, updated_at
       FROM device_tool_overrides WHERE sn = ? ORDER BY tool_id`,
    )
    .all(sn) as Array<{
    tool_id: string
    enabled: number
    note: string
    updated_by_name: string
    updated_at: string
  }>
  return rows.map((row) => ({
    toolId: row.tool_id,
    enabled: row.enabled === 1,
    note: row.note,
    updatedBy: row.updated_by_name,
    updatedAt: row.updated_at,
  }))
}

export function overrideMap(sn: string): Map<string, { enabled: boolean; note: string }> {
  return new Map(overrideRows(sn).map((row) => [row.toolId, { enabled: row.enabled, note: row.note }]))
}

export function setOverride(input: {
  sn: string
  toolId: string
  enabled: boolean | null
  note: string
  userId: string
  userName: string
}): void {
  if (!TOOL_BY_ID.has(input.toolId)) {
    throw new Error('未知工具')
  }
  if (input.enabled === null) {
    db().prepare('DELETE FROM device_tool_overrides WHERE sn = ? AND tool_id = ?').run(
      input.sn,
      input.toolId,
    )
    return
  }
  db()
    .prepare(
      `INSERT INTO device_tool_overrides(sn, tool_id, enabled, note, updated_by, updated_by_name, updated_at)
       VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(sn, tool_id) DO UPDATE SET
         enabled = excluded.enabled,
         note = excluded.note,
         updated_by = excluded.updated_by,
         updated_by_name = excluded.updated_by_name,
         updated_at = excluded.updated_at`,
    )
    .run(input.sn, input.toolId, input.enabled ? 1 : 0, input.note, input.userId, input.userName, nowIso())
}

export function clearOverrides(sn: string): number {
  const result = db().prepare('DELETE FROM device_tool_overrides WHERE sn = ?').run(sn)
  return Number(result.changes ?? 0)
}

export function overrideCount(sn: string): number {
  return (
    db().prepare('SELECT COUNT(*) AS n FROM device_tool_overrides WHERE sn = ?').get(sn) as {
      n: number
    }
  ).n
}

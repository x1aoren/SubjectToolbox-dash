import type { FastifyInstance } from 'fastify'
import { requirePermission } from '../auth.js'
import { db, nowIso, setSetting } from '../db.js'
import { audit, clampText, fail } from '../http.js'
import {
  diffConfig,
  effectiveConfig,
  parseStoredConfig,
  validateConfig,
  type RemoteConfig,
} from '../config-domain.js'
import { TOOLS, TOOL_BY_ID } from '../catalog.js'
import { clampReason, clearOverrides, overrideMap, overrideRows, setOverride } from '../overrides.js'

type Row = Record<string, unknown>

interface StateRow {
  draft_json: string
  active_revision_id: number | null
  updated_at: string
  updated_by: string | null
  updated_by_name: string
}

interface RevisionRow {
  id: number
  version_no: number
  json: string
  summary: string
  published_by: string | null
  published_by_name: string
  published_at: string
}

function state(): StateRow {
  const row = db().prepare('SELECT * FROM config_state WHERE id = 1').get() as StateRow | undefined
  if (!row) fail(500, 'config_missing', '远程配置尚未初始化')
  return row
}

function activeRevision(): RevisionRow | null {
  const current = state()
  if (!current.active_revision_id) return null
  return (db()
    .prepare('SELECT * FROM config_revisions WHERE id = ?')
    .get(current.active_revision_id) as RevisionRow | undefined) ?? null
}

function revisionJson(row: RevisionRow | null): RemoteConfig {
  return parseStoredConfig(row?.json ?? state().draft_json)
}

function revisionSummary(row: RevisionRow | null) {
  if (!row) return null
  return {
    id: row.id,
    versionNo: row.version_no,
    summary: row.summary,
    publishedBy: row.published_by_name,
    publishedAt: row.published_at,
    size: Buffer.byteLength(row.json, 'utf8'),
  }
}

function configPayload() {
  const current = state()
  const active = activeRevision()
  const draft = parseStoredConfig(current.draft_json)
  const published = revisionJson(active)
  const changes = diffConfig(published, draft)
  return {
    draft,
    published,
    activeRevision: revisionSummary(active),
    status: {
      hasChanges: changes.length > 0,
      changes,
      updatedAt: current.updated_at,
      updatedBy: current.updated_by_name,
      publishedAt: active?.published_at ?? null,
      publishedBy: active?.published_by_name ?? '',
    },
  }
}


function overridePayload(sn: string) {
  const device = db()
    .prepare('SELECT sn, model, manufacturer, app_version, channel FROM devices WHERE sn = ?')
    .get(sn) as
    | { sn: string; model: string; manufacturer: string; app_version: string; channel: string }
    | undefined
  if (!device) fail(404, 'not_found', '设备不存在')
  const config = revisionJson(activeRevision())
  const base = effectiveConfig(config, {
    version: device.app_version,
    channel: device.channel,
    sn,
  })
  const rows = overrideRows(sn)
  const rowMap = new Map(rows.map((row) => [row.toolId, row]))
  const globalReasonById = new Map(config.tools.map((tool) => [tool.toolId, tool.disabledReason]))
  const tools = TOOLS.map((tool) => {
    const state = base.tools[tool.id]!
    const row = rowMap.get(tool.id)
    return {
      toolId: tool.id,
      title: tool.title,
      subjectId: tool.subjectId,
      glyph: tool.glyph,
      icon: tool.icon,
      summary: tool.summary,
      kind: tool.kind ?? 'tool',
      parentId: tool.parentId ?? null,
      globalEnabled: state.enabled,
      overrideEnabled: row ? row.enabled : null,
      effectiveEnabled: row ? row.enabled : state.enabled,
      note: row?.note ?? '',
      reason: row?.reason ?? '',
      disabledReasonGlobal: globalReasonById.get(tool.id) ?? '',
      updatedBy: row?.updatedBy ?? '',
      updatedAt: row?.updatedAt ?? null,
    }
  })
  const lastUpdated = rows.reduce<string | null>(
    (latest, row) => (latest === null || row.updatedAt > latest ? row.updatedAt : latest),
    null,
  )
  return {
    sn,
    device: {
      sn: device.sn,
      model: device.model,
      manufacturer: device.manufacturer,
      appVersion: device.app_version,
      channel: device.channel,
    },
    tools,
    overrideCount: rows.length,
    updatedAt: lastUpdated,
  }
}
export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/config', async (request) => {
    requirePermission(request, 'config.view')
    return configPayload()
  })

  app.put('/api/config/draft', async (request) => {
    const user = requirePermission(request, 'config.edit')
    const body = (request.body ?? {}) as { config?: unknown }
    const raw = body.config ?? request.body
    const config = validateConfig(raw)
    db()
      .prepare(
        `UPDATE config_state SET draft_json = ?, updated_at = ?, updated_by = ?, updated_by_name = ? WHERE id = 1`,
      )
      .run(JSON.stringify(config, null, 2), nowIso(), user.id, user.displayName)
    audit(request, user, 'config.draft', 'config', 'draft', '远程配置草稿', '保存了远程配置草稿')
    return configPayload()
  })

  app.post('/api/config/publish', async (request) => {
    const user = requirePermission(request, 'config.publish')
    const body = (request.body ?? {}) as { summary?: string; config?: unknown }
    const current = state()
    const active = activeRevision()
    const draft = body.config ? validateConfig(body.config) : parseStoredConfig(current.draft_json)
    const published = revisionJson(active)
    const changes = diffConfig(published, draft)
    if (changes.length === 0) fail(400, 'no_changes', '草稿与线上配置一致，没有需要发布的修改')

    const nextVersion = (
      db().prepare('SELECT COALESCE(MAX(version_no), 0) AS n FROM config_revisions').get() as {
        n: number
      }
    ).n + 1
    const summary = clampText(body.summary, 120) || `发布修订 #${nextVersion}`
    const publishedAt = nowIso()
    const inserted = db()
      .prepare(
        `INSERT INTO config_revisions(version_no, json, summary, published_by, published_by_name, published_at)
         VALUES(?,?,?,?,?,?)`,
      )
      .run(nextVersion, JSON.stringify(draft, null, 2), summary, user.id, user.displayName, publishedAt)

    db()
      .prepare(
        `UPDATE config_state SET draft_json = ?, active_revision_id = ?, updated_at = ?, updated_by = ?, updated_by_name = ? WHERE id = 1`,
      )
      .run(JSON.stringify(draft, null, 2), Number(inserted.lastInsertRowid), publishedAt, user.id, user.displayName)
    setSetting('last_publish_at', publishedAt)
    audit(
      request,
      user,
      'config.publish',
      'config',
      String(nextVersion),
      `修订 #${nextVersion}`,
      summary,
    )
    return { ok: true, revision: { versionNo: nextVersion, summary, publishedAt, publishedBy: user.displayName }, config: configPayload() }
  })

  app.post('/api/config/rollback', async (request) => {
    const user = requirePermission(request, 'config.publish')
    const body = (request.body ?? {}) as { revisionId?: number; summary?: string }
    const revisionId = Number(body.revisionId)
    if (!Number.isFinite(revisionId)) fail(400, 'invalid_revision', '缺少要回滚的修订')
    const target = db().prepare('SELECT * FROM config_revisions WHERE id = ?').get(revisionId) as
      | RevisionRow
      | undefined
    if (!target) fail(404, 'not_found', '修订不存在')

    const nextVersion = (
      db().prepare('SELECT COALESCE(MAX(version_no), 0) AS n FROM config_revisions').get() as {
        n: number
      }
    ).n + 1
    const publishedAt = nowIso()
    const summary =
      clampText(body.summary, 120) || `回滚至修订 #${target.version_no}（${target.summary}）`
    const inserted = db()
      .prepare(
        `INSERT INTO config_revisions(version_no, json, summary, published_by, published_by_name, published_at)
         VALUES(?,?,?,?,?,?)`,
      )
      .run(nextVersion, target.json, summary, user.id, user.displayName, publishedAt)
    db()
      .prepare(
        `UPDATE config_state SET draft_json = ?, active_revision_id = ?, updated_at = ?, updated_by = ?, updated_by_name = ? WHERE id = 1`,
      )
      .run(target.json, Number(inserted.lastInsertRowid), publishedAt, user.id, user.displayName)
    setSetting('last_publish_at', publishedAt)
    audit(
      request,
      user,
      'config.rollback',
      'config',
      String(nextVersion),
      `修订 #${nextVersion}`,
      summary,
    )
    return { ok: true, config: configPayload() }
  })

  app.get('/api/config/revisions', async (request) => {
    requirePermission(request, 'config.view')
    const current = state()
    const rows = db()
      .prepare('SELECT id, version_no, json, summary, published_by_name, published_at FROM config_revisions ORDER BY version_no DESC LIMIT 60')
      .all() as unknown as RevisionRow[]
    return {
      items: rows.map((row) => ({
        ...revisionSummary(row),
        active: row.id === current.active_revision_id,
      })),
    }
  })

  app.get('/api/config/revisions/:id', async (request) => {
    requirePermission(request, 'config.view')
    const id = Number((request.params as Row).id)
    const row = db().prepare('SELECT * FROM config_revisions WHERE id = ?').get(id) as
      | RevisionRow
      | undefined
    if (!row) fail(404, 'not_found', '修订不存在')
    const current = state()
    return {
      revision: {
        ...revisionSummary(row),
        active: row.id === current.active_revision_id,
        config: parseStoredConfig(row.json),
      },
    }
  })

  app.get('/api/config/preview', async (request) => {
    requirePermission(request, 'config.view')
    const query = request.query as Row
    const source = query.source === 'draft' ? 'draft' : 'published'
    const version = clampText(query.version, 24) || '1.1.0'
    const channel = query.channel === 'beta' ? 'beta' : 'stable'
    const sn = clampText(query.sn, 64) || 'stb-preview-device'
    const config = source === 'draft' ? parseStoredConfig(state().draft_json) : revisionJson(activeRevision())
    const overrides = overrideMap(sn)
    const effective = effectiveConfig(config, { version, channel, sn }, overrides)
    return {
      source,
      revision: revisionSummary(activeRevision()),
      context: { version, channel, sn },
      config: effective,
      deviceOverrides: overrides.size,
      toolTitles: Object.fromEntries([...TOOL_BY_ID].map(([id, tool]) => [id, tool.title])),
    }
  })
  /* ------------------------- 单设备功能开关 ------------------------- */

  app.get('/api/devices/:sn/overrides', async (request) => {
    requirePermission(request, 'config.view')
    return overridePayload(String((request.params as Row).sn ?? ''))
  })

  app.put('/api/devices/:sn/overrides', async (request) => {
    const user = requirePermission(request, 'config.edit')
    const sn = String((request.params as Row).sn ?? '')
    const device = db().prepare('SELECT model FROM devices WHERE sn = ?').get(sn) as
      | { model: string }
      | undefined
    if (!device) fail(404, 'not_found', '设备不存在')
    const body = (request.body ?? {}) as {
      toolId?: string
      enabled?: boolean | null
      note?: string
      reason?: string
    }
    const toolId = clampText(body.toolId, 80)
    if (!TOOL_BY_ID.has(toolId)) fail(400, 'unknown_tool', '未知工具')
    const enabled =
      body.enabled === null || body.enabled === undefined ? null : Boolean(body.enabled)
    const note = clampText(body.note, 200)
    const reason = clampReason(body.reason)
    setOverride({
      sn,
      toolId,
      enabled,
      note,
      reason,
      userId: user.id,
      userName: user.displayName,
    })
    const title = TOOL_BY_ID.get(toolId)?.title ?? toolId
    audit(
      request,
      user,
      'device.override',
      'device',
      sn,
      `${device.model} · ${sn}`,
      enabled === null
        ? `恢复 ${title} 的云端默认状态`
        : `${enabled ? '单独启用' : '单独停用'} ${title}${reason ? `，停用原因：${clampText(reason, 60)}` : ''}${note ? `，备注：${clampText(note, 60)}` : ''}`,
    )
    return overridePayload(sn)
  })

  app.delete('/api/devices/:sn/overrides', async (request) => {
    const user = requirePermission(request, 'config.edit')
    const sn = String((request.params as Row).sn ?? '')
    const device = db().prepare('SELECT model FROM devices WHERE sn = ?').get(sn) as
      | { model: string }
      | undefined
    if (!device) fail(404, 'not_found', '设备不存在')
    const removed = clearOverrides(sn)
    audit(
      request,
      user,
      'device.override',
      'device',
      sn,
      `${device.model} · ${sn}`,
      `清空该设备的所有单独开关（${removed} 项）`,
    )
    return overridePayload(sn)
  })
}

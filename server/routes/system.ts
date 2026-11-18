import type { FastifyInstance, FastifyRequest } from 'fastify'
import { statSync } from 'node:fs'
import { requirePermission, requireUser, issueApiKey, validateApiKey } from '../auth.js'
import { DB_PATH, DATA_DIR, db, getSettings, nowIso, tx } from '../db.js'
import { IS_PRODUCTION } from '../env.js'
import { audit, clampText, fail } from '../http.js'
import { seedDatabase } from '../seed.js'
import { TOOLS, TOOL_BY_ID, RELEASES, SUBJECTS, CHANNELS } from '../catalog.js'

type Row = Record<string, unknown>
type SqlValue = string | number | null

interface SettingsPayload {
  workspace_name: string
  org_name: string
  telemetry_enabled: string
  feedback_enabled: string
  retention_days: string
  allow_anonymous_ingest: string
}

function serializeSettings() {
  const settings = getSettings()
  return {
    workspaceName: settings.workspace_name ?? '',
    orgName: settings.org_name ?? '',
    telemetryEnabled: settings.telemetry_enabled !== '0',
    feedbackEnabled: settings.feedback_enabled !== '0',
    retentionDays: Number(settings.retention_days ?? 180) || 180,
    allowAnonymousIngest: settings.allow_anonymous_ingest === '1',
    demoSeededAt: settings.demo_seeded_at ?? '',
    lastPublishAt: settings.last_publish_at || null,
  }
}

function systemInfo() {
  const database = db()
  let dbBytes = 0
  try {
    dbBytes = statSync(DB_PATH).size
  } catch {
    dbBytes = 0
  }
  const count = (table: string): number =>
    Number((database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n)
  return {
    devices: count('devices'),
    events: count('events'),
    errors: count('errors'),
    feedback: count('feedback'),
    users: count('users'),
    revisions: count('config_revisions'),
    dbBytes,
    dataDir: DATA_DIR,
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  }
}


const PURGE_CATEGORIES = new Set(['events', 'errors', 'feedback', 'devices', 'toolSync', 'audit'])

function countOf(table: string): number {
  return Number((db().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n)
}

function dataSummary() {
  let dbBytes = 0
  try {
    dbBytes = statSync(DB_PATH).size
  } catch {
    dbBytes = 0
  }
  return {
    events: countOf('events'),
    errors: countOf('errors'),
    feedback: countOf('feedback'),
    feedbackMessages: countOf('feedback_messages'),
    devices: countOf('devices'),
    overrides: countOf('device_tool_overrides'),
    deviceTools: countOf('device_tools'),
    clientTools: countOf('client_tools'),
    auditLogs: countOf('audit_logs'),
    configRevisions: countOf('config_revisions'),
    dbBytes,
  }
}
export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings', async (request) => {
    requirePermission(request, 'settings.manage')
    return { settings: serializeSettings(), system: systemInfo() }
  })

  app.patch('/api/settings', async (request) => {
    const user = requirePermission(request, 'settings.manage')
    const body = (request.body ?? {}) as Record<string, unknown>
    const mapping: Array<{ field: keyof SettingsPayload; key: string; type: 'string' | 'bool' | 'int' }> = [
      { field: 'workspace_name', key: 'workspaceName', type: 'string' },
      { field: 'org_name', key: 'orgName', type: 'string' },
      { field: 'telemetry_enabled', key: 'telemetryEnabled', type: 'bool' },
      { field: 'feedback_enabled', key: 'feedbackEnabled', type: 'bool' },
      { field: 'retention_days', key: 'retentionDays', type: 'int' },
      { field: 'allow_anonymous_ingest', key: 'allowAnonymousIngest', type: 'bool' },
    ]
    const updates: Array<[string, string]> = []
    const notes: string[] = []
    for (const entry of mapping) {
      if (!(entry.key in body)) continue
      const value = body[entry.key]
      if (entry.type === 'bool') {
        if (typeof value !== 'boolean') fail(400, 'invalid_value', `${entry.key} 必须是布尔值`)
        updates.push([entry.field, value ? '1' : '0'])
        notes.push(`${entry.key}=${value ? '开' : '关'}`)
      } else if (entry.type === 'int') {
        const parsed = Number(value)
        if (!Number.isFinite(parsed) || parsed < 30 || parsed > 3650) {
          fail(400, 'invalid_value', '数据留存需在 30–3650 天之间')
        }
        updates.push([entry.field, String(Math.floor(parsed))])
        notes.push(`留存 ${parsed} 天`)
      } else {
        if (typeof value !== 'string') fail(400, 'invalid_value', `${entry.key} 必须是字符串`)
        updates.push([entry.field, clampText(value, 80)])
        notes.push(`${entry.key} 已更新`)
      }
    }
    if (updates.length === 0) fail(400, 'no_changes', '没有需要保存的修改')
    const statement = db().prepare(
      'INSERT INTO settings(key, value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    for (const [key, value] of updates) statement.run(key, value)
    audit(request, user, 'settings.update', 'settings', updates[0]![0], '系统设置', notes.join('；'))
    return { settings: serializeSettings() }
  })

  app.get('/api/keys', async (request) => {
    requirePermission(request, 'keys.manage')
    const rows = db()
      .prepare(
        `SELECT k.id, k.name, k.prefix, k.created_at, k.last_used_at, k.revoked_at,
                u.display_name AS created_by_name
         FROM api_keys k LEFT JOIN users u ON u.id = k.created_by
         ORDER BY k.created_at DESC`,
      )
      .all() as Row[]
    return {
      items: rows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
        prefix: row.prefix as string,
        createdAt: row.created_at as string,
        lastUsedAt: (row.last_used_at as string) ?? null,
        revokedAt: (row.revoked_at as string) ?? null,
        createdBy: (row.created_by_name as string) ?? '',
      })),
    }
  })

  app.post('/api/keys', async (request) => {
    const user = requirePermission(request, 'keys.manage')
    const body = (request.body ?? {}) as { name?: string }
    const name = clampText(body.name, 60) || '客户端密钥'
    const { row, secret } = issueApiKey(name, user.id)
    audit(request, user, 'key.create', 'api_key', row.id, name, '创建了客户端上报密钥')
    return { key: { id: row.id, name: row.name, prefix: row.prefix, createdAt: row.created_at }, secret }
  })

  app.post('/api/keys/:id/revoke', async (request) => {
    const user = requirePermission(request, 'keys.manage')
    const id = String((request.params as Row).id)
    const row = db().prepare('SELECT * FROM api_keys WHERE id = ?').get(id) as Row | undefined
    if (!row) fail(404, 'not_found', '密钥不存在')
    if (row.revoked_at) fail(400, 'already_revoked', '该密钥已经吊销')
    db().prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ?').run(nowIso(), id)
    audit(request, user, 'key.revoke', 'api_key', id, String(row.name), '吊销了客户端上报密钥')
    return { ok: true }
  })

  app.get('/api/catalog', async (request) => {
    requireUser(request)
    return {
      subjects: SUBJECTS,
      tools: TOOLS,
      releases: RELEASES.map((release) => ({
        versionName: release.versionName,
        versionCode: release.versionCode,
        date: release.date,
        headline: release.headline,
      })),
      channels: CHANNELS,
    }
  })

  app.get('/api/integration', async (request: FastifyRequest) => {
    requireUser(request)
    const key = validateApiKey(request)
    const activeKey = db()
      .prepare('SELECT name, prefix, created_at FROM api_keys WHERE revoked_at IS NULL ORDER BY created_at DESC LIMIT 1')
      .get() as Row | undefined
    const settings = serializeSettings()
    return {
      apiBase: `${request.protocol}://${request.headers.host ?? '127.0.0.1:8787'}`,
      settings: {
        telemetryEnabled: settings.telemetryEnabled,
        feedbackEnabled: settings.feedbackEnabled,
        allowAnonymousIngest: settings.allowAnonymousIngest,
      },
      key: activeKey
        ? { name: activeKey.name as string, prefix: activeKey.prefix as string, createdAt: activeKey.created_at as string }
        : null,
      requestKeyMatched: Boolean(key),
      events: [
        { name: 'session_start', description: '会话开始，props.sessionId 关联同一会话' },
        { name: 'session_end', description: '会话结束，props.durationMs 用于平均时长' },
        { name: 'tool_open', description: '打开工具，必须带 toolId' },
        { name: 'tool_close', description: '退出工具，props.durationMs 记录停留时长' },
        { name: 'search', description: '工具内检索，props.queryLength / resultCount' },
        { name: 'error', description: '崩溃上报，建议走 /v1/telemetry/errors 以保留堆栈' },
      ],
      tools: TOOLS.map((tool) => ({
        id: tool.id,
        title: tool.title,
        subjectId: tool.subjectId,
        summary: tool.summary,
      })),
      releases: RELEASES.map((release) => ({
        versionName: release.versionName,
        versionCode: release.versionCode,
        date: release.date,
        headline: release.headline,
      })),
      toolTitles: Object.fromEntries([...TOOL_BY_ID].map(([id, tool]) => [id, tool.title])),
    }
  })


  app.get('/api/system/data-summary', async (request) => {
    requirePermission(request, 'settings.manage')
    return dataSummary()
  })

  app.post('/api/system/purge', async (request) => {
    const user = requirePermission(request, 'settings.manage')
    const body = (request.body ?? {}) as { categories?: unknown; confirm?: string }
    if (body.confirm !== 'CLEAR') fail(400, 'confirm_required', '请输入 CLEAR 确认清除数据')
    if (!Array.isArray(body.categories)) fail(400, 'invalid_categories', 'categories 必须是数组')
    const categories = Array.from(
      new Set(body.categories.filter((item): item is string => typeof item === 'string')),
    ).filter((item) => PURGE_CATEGORIES.has(item))
    if (categories.length === 0) fail(400, 'no_categories', '至少选择一类要清除的数据')

    const before = dataSummary()
    const has = (category: string) => categories.includes(category)
    const deleted = {
      devices: 0,
      events: 0,
      errors: 0,
      feedback: 0,
      deviceTools: 0,
      overrides: 0,
      clientTools: 0,
      auditLogs: 0,
    }

    tx(() => {
      if (has('devices')) {
        deleted.deviceTools += Number(
          (db().prepare('DELETE FROM device_tools').run().changes ?? 0) as number,
        )
        deleted.overrides += Number(
          (db().prepare('DELETE FROM device_tool_overrides').run().changes ?? 0) as number,
        )
        deleted.events += Number((db().prepare('DELETE FROM events').run().changes ?? 0) as number)
        deleted.errors += Number((db().prepare('DELETE FROM errors').run().changes ?? 0) as number)
        deleted.feedback += Number(
          (db().prepare('DELETE FROM feedback').run().changes ?? 0) as number,
        )
        db().prepare("DELETE FROM attachments WHERE target_type = 'feedback'").run()
        deleted.devices += Number((db().prepare('DELETE FROM devices').run().changes ?? 0) as number)
      }
      if (has('events') && !has('devices')) {
        deleted.events += Number((db().prepare('DELETE FROM events').run().changes ?? 0) as number)
      }
      if (has('errors') && !has('devices')) {
        deleted.errors += Number((db().prepare('DELETE FROM errors').run().changes ?? 0) as number)
      }
      if (has('feedback') && !has('devices')) {
        deleted.feedback += Number(
          (db().prepare('DELETE FROM feedback').run().changes ?? 0) as number,
        )
        db().prepare("DELETE FROM attachments WHERE target_type = 'feedback'").run()
      }
      if (has('toolSync')) {
        deleted.deviceTools += Number(
          (db().prepare('DELETE FROM device_tools').run().changes ?? 0) as number,
        )
        deleted.clientTools += Number(
          (db().prepare('DELETE FROM client_tools').run().changes ?? 0) as number,
        )
      }
      if (has('audit')) {
        deleted.auditLogs += Number(
          (db().prepare('DELETE FROM audit_logs').run().changes ?? 0) as number,
        )
      }
    })

    try {
      db().exec('PRAGMA wal_checkpoint(TRUNCATE)')
      db().exec('VACUUM')
    } catch {
      // VACUUM 失败不影响数据清除结果
    }

    audit(
      request,
      user,
      'system.purge',
      'system',
      null,
      '数据清除',
      `清除 ${categories.join('、')}；设备 ${deleted.devices}、事件 ${deleted.events}、崩溃 ${deleted.errors}、反馈 ${deleted.feedback}`,
    )

    return {
      ok: true,
      categories,
      before,
      deleted,
      after: dataSummary(),
    }
  })
  app.post('/api/system/reset-demo', async (request) => {
    // 生产环境不允许重建演示数据（契约第 3 节）
    if (IS_PRODUCTION) fail(403, 'not_available', '生产环境不允许重建演示数据')
    const user = requirePermission(request, 'keys.manage')
    const body = (request.body ?? {}) as { confirm?: string }
    if (body.confirm !== 'RESET') fail(400, 'confirm_required', '请输入 RESET 确认重置演示数据')
    const result = seedDatabase({ reset: true })
    audit(request, user, 'system.reset_demo', 'system', null, '演示数据', '重建了遥测、反馈与配置演示数据')
    return {
      ok: true,
      message: '演示数据已重建，所有登录会话已失效，请重新登录。',
      stats: result,
    }
  })

  app.get('/api/system/health', async () => {
    return { ok: true, time: nowIso() }
  })

  // 防止未使用的类型告警
  void (null as unknown as SqlValue)
}

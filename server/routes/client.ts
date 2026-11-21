import type { FastifyInstance, FastifyRequest } from 'fastify'
import { createHash } from 'node:crypto'
import { validateApiKey } from '../auth.js'
import { db, getSetting, nowIso } from '../db.js'
import { clampText, fail } from '../http.js'
import { effectiveConfig, parseStoredConfig, type RemoteConfig } from '../config-domain.js'
import { TOOL_BY_ID } from '../catalog.js'
import { overrideMap } from '../overrides.js'
import { allow } from '../rate-limit.js'

type Row = Record<string, unknown>

const EVENT_NAMES = new Set([
  'session_start',
  'session_end',
  'tool_open',
  'tool_close',
  'search',
  'feedback_open',
  'update_prompt',
  'settings_change',
  'error',
])

const FEEDBACK_TYPES = new Set(['bug', 'feature', 'content', 'other'])
const SN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,63}$/

function publishedConfig(): { config: RemoteConfig; revision: number | null } {
  const state = db()
    .prepare('SELECT active_revision_id FROM config_state WHERE id = 1')
    .get() as { active_revision_id: number | null } | undefined
  if (!state?.active_revision_id) {
    return { config: parseStoredConfig(JSON.stringify({})), revision: null }
  }
  const row = db()
    .prepare('SELECT version_no, json FROM config_revisions WHERE id = ?')
    .get(state.active_revision_id) as { version_no: number; json: string } | undefined
  if (!row) return { config: parseStoredConfig(JSON.stringify({})), revision: null }
  return { config: parseStoredConfig(row.json), revision: row.version_no }
}

function authorizeClient(request: FastifyRequest, feature: 'telemetry' | 'feedback' | 'config'): void {
  if (feature === 'telemetry' && getSetting('telemetry_enabled', '1') !== '1') {
    fail(503, 'telemetry_disabled', '遥测采集已由管理员暂停')
  }
  if (feature === 'feedback' && getSetting('feedback_enabled', '1') !== '1') {
    fail(503, 'feedback_disabled', '意见反馈通道已暂时关闭')
  }
  const key = validateApiKey(request)
  if (!key && getSetting('allow_anonymous_ingest', '1') !== '1') {
    fail(401, 'missing_api_key', '缺少有效的 X-STB-Key 请求头')
  }
}

function deviceRow(sn: string): Row | undefined {
  return db().prepare('SELECT * FROM devices WHERE sn = ?').get(sn) as Row | undefined
}

function bucketOf(sn: string): number {
  return (createHash('sha1').update(sn).digest().readUInt32BE(0) % 100) + 1
}

function feedbackPublic(row: Row) {
  const messages = db()
    .prepare(
      `SELECT author_type, author_name, body, created_at FROM feedback_messages
       WHERE feedback_id = ? AND internal = 0 ORDER BY created_at ASC, id ASC`,
    )
    .all(String(row.id)) as Row[]
  return {
    id: String(row.id),
    number: String(row.id).slice(-6).toUpperCase(),
    type: row.type as string,
    title: row.title as string,
    content: row.content as string,
    status: row.status as string,
    priority: row.priority as string,
    appVersion: (row.app_version as string) ?? '',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    messages: messages.map((message) => ({
      authorType: message.author_type as string,
      authorName: message.author_name as string,
      body: message.body as string,
      createdAt: message.created_at as string,
    })),
  }
}


/** 客户端 handshake 时上报自己的工具清单，用于后台校准云端工具列表。 */
function syncClientTools(sn: string, rawTools: unknown, at: string): number {
  if (!Array.isArray(rawTools)) return 0
  const seen = new Map<string, { title: string; subjectId: string }>()
  for (const raw of rawTools.slice(0, 60)) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as Row
    const id = clampText(entry.id, 80)
    if (!id) continue
    seen.set(id, {
      title: clampText(entry.title, 80) || id,
      subjectId: clampText(entry.subjectId, 40) || 'other',
    })
  }
  if (seen.size === 0) return 0

  const trackDevice = db().prepare(
    `INSERT INTO device_tools(sn, tool_id, title, subject_id, last_reported_at)
     VALUES(?,?,?,?,?)
     ON CONFLICT(sn, tool_id) DO UPDATE SET
       title = excluded.title,
       subject_id = excluded.subject_id,
       last_reported_at = excluded.last_reported_at`,
  )
  const trackGlobal = db().prepare(
    `INSERT INTO client_tools(tool_id, title, subject_id, first_reported_at, last_reported_at, last_sn, report_count)
     VALUES(?,?,?,?,?,?,1)
     ON CONFLICT(tool_id) DO UPDATE SET
       title = excluded.title,
       subject_id = excluded.subject_id,
       last_reported_at = excluded.last_reported_at,
       last_sn = excluded.last_sn,
       report_count = client_tools.report_count + 1`,
  )
  const ids = [...seen.keys()]
  const placeholders = ids.map(() => '?').join(',')
  db().exec('BEGIN')
  try {
    db()
      .prepare(`DELETE FROM device_tools WHERE sn = ? AND tool_id NOT IN (${placeholders})`)
      .run(sn, ...ids)
    for (const [id, meta] of seen) {
      trackDevice.run(sn, id, meta.title, meta.subjectId, at)
      trackGlobal.run(id, meta.title, meta.subjectId, at, at, sn)
    }
    db().exec('COMMIT')
  } catch (error) {
    db().exec('ROLLBACK')
    throw error
  }
  return seen.size
}
/** 单设备覆盖指纹：数量 + 最近更新时间；前台轮询据此判断“是否需要拉全量配置”。
 *  设备级启停不发布修订，因此不能只看全局 revision。 */
function deviceOverrideMark(sn: string): { count: number; updatedAt: string | null } {
  const row = db()
    .prepare(
      'SELECT COUNT(*) AS n, MAX(updated_at) AS m FROM device_tool_overrides WHERE sn = ?',
    )
    .get(sn) as { n: number; m: string | null } | undefined
  return { count: Number(row?.n ?? 0), updatedAt: row?.m ?? null }
}

export async function clientRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/health', async () => ({
    ok: true,
    time: nowIso(),
    revision: publishedConfig().revision,
  }))

  app.get('/v1/config', async (request, reply) => {
    authorizeClient(request, 'config')
    const query = request.query as Row
    const version = clampText(query.version, 24) || '0.0.0'
    const channel = query.channel === 'beta' ? 'beta' : 'stable'
    const sn = clampText(query.sn, 64) || 'anonymous'
    if (!allow(`cfg:${sn}`, 60, 3_600_000)) {
      fail(429, 'too_many_requests', '配置拉取过于频繁，请稍后再试')
    }
    const { config, revision } = publishedConfig()
    const effective = effectiveConfig(config, { version, channel, sn }, overrideMap(sn))
    reply.header('Cache-Control', 'no-store')
    return { revision, ...effective }
  })

  // 前台短轮询：只返回当前生效配置的修订号 + 本机单设备覆盖指纹，客户端发现变化后再走 /v1/config 拉全量。
  // 30–60 秒一次，最坏 120 次/小时；留出重试余量按 180 次/小时限流。
  app.get('/v1/config/revision', async (request) => {
    authorizeClient(request, 'config')
    const query = request.query as Row
    const sn = clampText(query.sn, 64) || 'anonymous'
    if (!allow(`rev:${sn}`, 180, 3_600_000)) {
      fail(429, 'too_many_requests', '修订号查询过于频繁，请稍后再试')
    }
    // 心跳语义：能每 30–60 秒轮询一次，说明这台设备正在前台使用。
    // 顺手刷新 last_seen_at，否则控制台的「在线 / 活跃」要等到下一次遥测上报才更新。
    if (sn !== 'anonymous') {
      db().prepare('UPDATE devices SET last_seen_at = ? WHERE sn = ?').run(nowIso(), sn)
    }
    return {
      ok: true,
      revision: publishedConfig().revision,
      deviceOverrides: deviceOverrideMark(sn),
      serverTime: nowIso(),
    }
  })

  app.post('/v1/telemetry/handshake', async (request) => {
    // 配置与设备登记不依赖遥测采集开关：管理员暂停统计时仍要能下发工具开关。
    authorizeClient(request, 'config')
    const body = (request.body ?? {}) as Row
    const sn = clampText(body.sn, 64)
    if (!SN_PATTERN.test(sn)) {
      fail(400, 'invalid_sn', 'sn 需为 6–64 位字母、数字或 . _ : -')
    }
    if (!allow(`hs:${sn}`, 12, 3_600_000)) {
      fail(429, 'too_many_requests', '同步过于频繁，请稍后再试')
    }
    const at = nowIso()
    const version = clampText(body.appVersion, 24) || '未知'
    const channel = body.channel === 'beta' ? 'beta' : 'stable'
    const sdkInt = Number(body.sdkInt)

    db()
      .prepare(
        `INSERT INTO devices(sn, model, manufacturer, os_version, sdk_int, app_version,
           version_code, channel, school, grade, first_seen_at, last_seen_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(sn) DO UPDATE SET
           model = excluded.model,
           manufacturer = excluded.manufacturer,
           os_version = excluded.os_version,
           sdk_int = excluded.sdk_int,
           app_version = excluded.app_version,
           version_code = excluded.version_code,
           channel = excluded.channel,
           school = CASE WHEN excluded.school != '' THEN excluded.school ELSE devices.school END,
           grade = CASE WHEN excluded.grade != '' THEN excluded.grade ELSE devices.grade END,
           last_seen_at = excluded.last_seen_at`,
      )
      .run(
        sn,
        clampText(body.model, 60),
        clampText(body.manufacturer, 40),
        clampText(body.osVersion, 40),
        Number.isFinite(sdkInt) ? Math.floor(sdkInt) : 26,
        version,
        Number.isFinite(Number(body.versionCode)) ? Math.floor(Number(body.versionCode)) : 0,
        channel,
        clampText(body.school, 60),
        clampText(body.grade, 20),
        at,
        at,
      )

    const toolsSynced = syncClientTools(sn, body.tools, at)
    const { config, revision } = publishedConfig()
    const effective = effectiveConfig(config, { version, channel, sn }, overrideMap(sn))
    return {
      ok: true,
      serverTime: at,
      revision,
      toolsSynced,
      // 供客户端初始化“单设备覆盖指纹”，避免前台轮询首 tick 多拉一次全量配置
      deviceOverrides: deviceOverrideMark(sn),
      config: effective,
    }
  })

  app.post('/v1/telemetry/events', async (request) => {
    authorizeClient(request, 'telemetry')
    const body = (request.body ?? {}) as Row
    const sn = clampText(body.sn, 64)
    const device = deviceRow(sn)
    if (!device) fail(404, 'device_not_registered', '请先调用 /v1/telemetry/handshake 注册设备')
    // 客户端前台按 sync.telemetryFlushIntervalSeconds（60 秒）节奏上报，附加失败重试余量，
    // 每台设备每小时 240 次足够；调大间隔时这里可以同步放宽，调小则要小心课堂高峰期的放大。
    if (!allow(`ev:${sn}`, 240, 3_600_000)) {
      fail(429, 'too_many_requests', '上报过于频繁，请稍后再试')
    }
    if (!Array.isArray(body.events)) fail(400, 'invalid_events', 'events 必须是数组')
    if (body.events.length > 500) fail(400, 'too_many_events', '单次最多上报 500 条事件')

    let accepted = 0
    let sessions = 0
    let opens = 0
    const receivedAt = nowIso()
    let latest = String(device.last_seen_at)

    const insert = db().prepare(
      `INSERT INTO events(sn, name, tool_id, subject_id, app_version, channel, props, occurred_at, received_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
    )
    const insertError = db().prepare(
      `INSERT INTO errors(sn, signature, message, stack, tool_id, app_version, channel, occurred_at)
       VALUES(?,?,?,?,?,?,?,?)`,
    )

    db().exec('BEGIN')
    try {
      for (const raw of body.events) {
        if (!raw || typeof raw !== 'object') continue
        const event = raw as Row
        const name = clampText(event.name, 40)
        if (!EVENT_NAMES.has(name)) continue
        let occurredAt = receivedAt
        if (typeof event.occurredAt === 'string') {
          const parsed = Date.parse(event.occurredAt)
          if (Number.isFinite(parsed)) occurredAt = new Date(parsed).toISOString()
        }
        const toolId =
          typeof event.toolId === 'string' && TOOL_BY_ID.has(event.toolId)
            ? event.toolId
            : null
        const props =
          event.props && typeof event.props === 'object'
            ? JSON.stringify(event.props).slice(0, 4000)
            : '{}'
        const appVersion = clampText(event.appVersion, 24) || String(device.app_version)
        const channel = event.channel === 'beta' ? 'beta' : String(device.channel)

        insert.run(
          sn,
          name,
          toolId,
          toolId ? TOOL_BY_ID.get(toolId)!.subjectId : null,
          appVersion,
          channel,
          props,
          occurredAt,
          receivedAt,
        )
        accepted += 1
        if (name === 'session_start') sessions += 1
        if (name === 'tool_open') opens += 1
        if (name === 'error' && event.props && typeof event.props === 'object') {
          const crash = event.props as Row
          const signature = clampText(crash.signature, 500)
          if (signature) {
            insertError.run(
              sn,
              signature,
              clampText(crash.message, 500),
              clampText(crash.stack, 8000),
              toolId,
              appVersion,
              channel,
              occurredAt,
            )
          }
        }
        if (occurredAt > latest) latest = occurredAt
      }
      db()
        .prepare(
          `UPDATE devices SET last_seen_at = ?,
             total_sessions = total_sessions + ?, total_opens = total_opens + ?
           WHERE sn = ?`,
        )
        .run(latest, sessions, opens, sn)
      db().exec('COMMIT')
    } catch (error) {
      db().exec('ROLLBACK')
      throw error
    }

    return { ok: true, accepted, receivedAt }
  })

  app.post('/v1/telemetry/errors', async (request) => {
    authorizeClient(request, 'telemetry')
    const body = (request.body ?? {}) as Row
    const sn = clampText(body.sn, 64)
    const device = deviceRow(sn)
    if (!device) fail(404, 'device_not_registered', '请先调用 /v1/telemetry/handshake 注册设备')
    if (!allow(`err:${sn}`, 20, 3_600_000)) {
      fail(429, 'too_many_requests', '崩溃上报过于频繁，请稍后再试')
    }
    if (!Array.isArray(body.errors)) fail(400, 'invalid_errors', 'errors 必须是数组')
    if (body.errors.length > 50) fail(400, 'too_many_errors', '单次最多上报 50 条崩溃')

    const insertError = db().prepare(
      `INSERT INTO errors(sn, signature, message, stack, tool_id, app_version, channel, occurred_at)
       VALUES(?,?,?,?,?,?,?,?)`,
    )
    const insertEvent = db().prepare(
      `INSERT INTO events(sn, name, tool_id, subject_id, app_version, channel, props, occurred_at, received_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
    )
    let accepted = 0
    for (const raw of body.errors) {
      if (!raw || typeof raw !== 'object') continue
      const error = raw as Row
      const signature = clampText(error.signature, 500) || 'unknown'
      if (!signature) continue
      let occurredAt = nowIso()
      if (typeof error.occurredAt === 'string') {
        const parsed = Date.parse(error.occurredAt)
        if (Number.isFinite(parsed)) occurredAt = new Date(parsed).toISOString()
      }
      const toolId =
        typeof error.toolId === 'string' && TOOL_BY_ID.has(error.toolId) ? error.toolId : null
      insertError.run(
        sn,
        signature,
        clampText(error.message, 500),
        clampText(error.stack, 8000),
        toolId,
        clampText(error.appVersion, 24) || String(device.app_version),
        String(device.channel),
        occurredAt,
      )
      insertEvent.run(
        sn,
        'error',
        toolId,
        toolId ? TOOL_BY_ID.get(toolId)!.subjectId : null,
        clampText(error.appVersion, 24) || String(device.app_version),
        String(device.channel),
        JSON.stringify({ signature }),
        occurredAt,
        nowIso(),
      )
      accepted += 1
    }
    if (accepted > 0) {
      db().prepare('UPDATE devices SET last_seen_at = ? WHERE sn = ?').run(nowIso(), sn)
    }
    return { ok: true, accepted }
  })

  app.post('/v1/feedback', async (request) => {
    authorizeClient(request, 'feedback')
    const body = (request.body ?? {}) as Row
    const sn = clampText(body.sn, 64)
    const device = deviceRow(sn)
    if (!device) fail(404, 'device_not_registered', '请先调用 /v1/telemetry/handshake 注册设备')
    if (!allow(`fb:${sn}`, 10, 3_600_000)) {
      fail(429, 'too_many_requests', '反馈提交过于频繁，请稍后再试')
    }
    const type = clampText(body.type, 20) || 'other'
    if (!FEEDBACK_TYPES.has(type)) fail(400, 'invalid_type', '反馈类型需为 bug / feature / content / other')
    const title = clampText(body.title, 80)
    const content = clampText(body.content, 2000)
    if (title.length < 4) fail(400, 'invalid_title', '标题至少 4 个字')
    if (content.length < 4) fail(400, 'invalid_content', '反馈内容至少 4 个字')

    const recent = db()
      .prepare("SELECT COUNT(*) AS n FROM feedback WHERE sn = ? AND created_at >= datetime('now','-1 day')")
      .get(sn) as { n: number }
    if (Number(recent.n) >= 5) fail(429, 'too_many_feedback', '同一设备一天内最多提交 5 条反馈')

    const toolId =
      typeof body.toolId === 'string' && TOOL_BY_ID.has(body.toolId) ? body.toolId : null
    const id = `fb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    const at = nowIso()

    db().exec('BEGIN')
    try {
      db()
        .prepare(
          `INSERT INTO feedback(id, sn, type, title, content, contact, tool_id, app_version,
             channel, status, priority, tags, created_at, updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,'pending','normal','[]',?,?)`,
        )
        .run(
          id,
          sn,
          type,
          title,
          content,
          clampText(body.contact, 80) || null,
          toolId,
          String(device.app_version),
          String(device.channel),
          at,
          at,
        )
      db()
        .prepare(
          `INSERT INTO feedback_messages(feedback_id, author_type, author_id, author_name, body, internal, created_at)
           VALUES(?,'user',NULL,?,?,0,?)`,
        )
        .run(id, clampText(body.contact, 40) || '设备用户', content, at)
      db().exec('COMMIT')
    } catch (error) {
      db().exec('ROLLBACK')
      throw error
    }

    return {
      ok: true,
      feedback: { id, number: id.slice(-6).toUpperCase(), status: 'pending', createdAt: at },
    }
  })


  app.get('/v1/feedback', async (request) => {
    authorizeClient(request, 'feedback')
    const query = request.query as Row
    const sn = clampText(query.sn, 64)
    if (!sn) fail(400, 'missing_sn', '缺少设备标识 sn')
    if (!allow(`fbr:${sn}`, 60, 3_600_000)) {
      fail(429, 'too_many_requests', '查询过于频繁，请稍后再试')
    }
    const rows = db()
      .prepare(
        `SELECT * FROM feedback WHERE sn = ? ORDER BY created_at DESC LIMIT 20`,
      )
      .all(sn) as Row[]
    return {
      ok: true,
      feedback: rows.map((row) => feedbackPublic(row)),
    }
  })
  app.get('/v1/feedback/:id', async (request) => {
    authorizeClient(request, 'feedback')
    const id = String((request.params as Row).id)
    const query = request.query as Row
    const row = db().prepare('SELECT * FROM feedback WHERE id = ?').get(id) as Row | undefined
    if (!row) fail(404, 'not_found', '反馈不存在')
    if (query.sn && row.sn !== query.sn) {
      fail(403, 'forbidden', '只能查看本设备提交的反馈')
    }
    return { feedback: feedbackPublic(row) }
  })

  app.post('/v1/feedback/:id/replies', async (request) => {
    authorizeClient(request, 'feedback')
    const id = String((request.params as Row).id)
    const body = (request.body ?? {}) as Row
    const row = db().prepare('SELECT * FROM feedback WHERE id = ?').get(id) as Row | undefined
    if (!row) fail(404, 'not_found', '反馈不存在')
    if (!body.sn || row.sn !== body.sn) {
      fail(403, 'forbidden', '只能回复本设备提交的反馈')
    }
    const content = clampText(body.body, 2000)
    if (content.length < 1) fail(400, 'invalid_content', '回复内容不能为空')
    const at = nowIso()
    db()
      .prepare(
        `INSERT INTO feedback_messages(feedback_id, author_type, author_id, author_name, body, internal, created_at)
         VALUES(?,'user',NULL,'设备用户',?,0,?)`,
      )
      .run(id, content, at)
    const reopened = row.status === 'resolved' || row.status === 'closed'
    db()
      .prepare(
        `UPDATE feedback SET status = ?, closed_at = NULL, last_reply_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(reopened ? 'pending' : String(row.status), at, at, id)
    if (reopened) {
      db()
        .prepare(
          `INSERT INTO feedback_messages(feedback_id, author_type, author_id, author_name, body, internal, created_at)
           VALUES(?,'system',NULL,'系统','用户追加回复，反馈已重新打开',0,?)`,
        )
        .run(id, at)
    }
    return { ok: true, feedback: feedbackPublic({ ...row, status: reopened ? 'pending' : row.status, updated_at: at }) }
  })

  // 让预览接口与客户端看到的桶一致，保留给调试面板使用
  void bucketOf
}

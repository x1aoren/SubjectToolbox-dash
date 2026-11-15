import { createHash } from 'node:crypto'
import { fail } from './http.js'
import { TOOL_BY_ID } from './catalog.js'

/* ------------------------------------------------------------------ */
/* 远程配置的数据结构                                                   */
/* ------------------------------------------------------------------ */

export interface ToolConfig {
  toolId: string
  enabled: boolean
  minVersion: string
  channels: string[]
  message: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  level: 'info' | 'warning' | 'critical'
  channels: string[]
  enabled: boolean
  pinned: boolean
  startAt: string | null
  endAt: string | null
  minVersion?: string
}

export interface FeatureFlag {
  key: string
  enabled: boolean
  description: string
}

export interface RemoteConfig {
  maintenance: {
    enabled: boolean
    message: string
    startAt: string | null
    endAt: string | null
  }
  release: {
    latestVersion: string
    latestVersionCode: number
    minSupportedVersion: string
    forceUpdate: boolean
    updateNotes: string
  }
  content: {
    version: string
    rollout: number
    notes: string
  }
  tools: ToolConfig[]
  announcements: Announcement[]
  features: FeatureFlag[]
}

const CHANNEL_IDS = new Set(['stable', 'beta'])
const LEVELS = new Set(['info', 'warning', 'critical'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function channels(value: unknown): string[] {
  if (!Array.isArray(value)) return ['stable', 'beta']
  const filtered = value.filter((item): item is string => typeof item === 'string' && CHANNEL_IDS.has(item))
  return filtered.length > 0 ? Array.from(new Set(filtered)) : ['stable']
}

export function validateConfig(input: unknown): RemoteConfig {
  if (!isRecord(input)) fail(400, 'invalid_config', '配置必须是一个 JSON 对象')
  const maintenanceRaw = isRecord(input.maintenance) ? input.maintenance : {}
  const releaseRaw = isRecord(input.release) ? input.release : {}
  const contentRaw = isRecord(input.content) ? input.content : {}

  if (!Array.isArray(input.tools)) fail(400, 'invalid_config', 'tools 必须是数组')
  if (!Array.isArray(input.announcements)) fail(400, 'invalid_config', 'announcements 必须是数组')
  if (!Array.isArray(input.features)) fail(400, 'invalid_config', 'features 必须是数组')

  const tools: ToolConfig[] = input.tools.map((entry, index) => {
    if (!isRecord(entry)) fail(400, 'invalid_config', `tools[${index}] 不是对象`)
    const toolId = str(entry.toolId)
    if (!toolId) fail(400, 'invalid_config', `tools[${index}] 缺少 toolId`)
    return {
      toolId,
      enabled: bool(entry.enabled, true),
      minVersion: str(entry.minVersion, '1.0.0'),
      channels: channels(entry.channels),
      message: str(entry.message),
    }
  })
  const toolIds = new Set(tools.map((tool) => tool.toolId))
  if (toolIds.size !== tools.length) fail(400, 'invalid_config', 'tools 里有重复的 toolId')
  for (const tool of tools) {
    if (!TOOL_BY_ID.has(tool.toolId)) {
      fail(400, 'invalid_config', `未知工具：${tool.toolId}（必须与 STB 注册表一致）`)
    }
  }
  const missingTools = [...TOOL_BY_ID.keys()].filter((id) => !toolIds.has(id))
  if (missingTools.length > 0) {
    fail(400, 'invalid_config', `tools 缺少 STB 工具：${missingTools.join(', ')}`)
  }

  const announcements: Announcement[] = input.announcements.map((entry, index) => {
    if (!isRecord(entry)) fail(400, 'invalid_config', `announcements[${index}] 不是对象`)
    const id = str(entry.id) || `ann-${index + 1}`
    const title = str(entry.title)
    if (!title) fail(400, 'invalid_config', '公告标题不能为空')
    const level = str(entry.level, 'info')
    if (!LEVELS.has(level)) fail(400, 'invalid_config', `公告级别非法：${level}`)
    return {
      id,
      title,
      body: str(entry.body),
      level: level as Announcement['level'],
      channels: channels(entry.channels),
      enabled: bool(entry.enabled, true),
      pinned: bool(entry.pinned),
      startAt: isoOrNull(entry.startAt),
      endAt: isoOrNull(entry.endAt),
      ...(typeof entry.minVersion === 'string' && entry.minVersion
        ? { minVersion: entry.minVersion }
        : {}),
    }
  })
  if (new Set(announcements.map((item) => item.id)).size !== announcements.length) {
    fail(400, 'invalid_config', '公告 id 重复')
  }

  const features: FeatureFlag[] = input.features.map((entry, index) => {
    if (!isRecord(entry)) fail(400, 'invalid_config', `features[${index}] 不是对象`)
    const key = str(entry.key)
    if (!key) fail(400, 'invalid_config', `features[${index}] 缺少 key`)
    return { key, enabled: bool(entry.enabled), description: str(entry.description) }
  })
  if (new Set(features.map((item) => item.key)).size !== features.length) {
    fail(400, 'invalid_config', 'features key 重复')
  }

  const rollout = Number(contentRaw.rollout)
  if (!Number.isFinite(rollout) || rollout < 0 || rollout > 100) {
    fail(400, 'invalid_config', 'content.rollout 必须是 0–100 的数字')
  }

  const latestVersionCode = Number(releaseRaw.latestVersionCode)
  if (!Number.isFinite(latestVersionCode) || latestVersionCode < 1) {
    fail(400, 'invalid_config', 'release.latestVersionCode 必须是正整数')
  }

  const latestVersion = str(releaseRaw.latestVersion, '1.0.0')
  const minSupportedVersion = str(releaseRaw.minSupportedVersion, '1.0.0')
  if (compareVersions(minSupportedVersion, latestVersion) > 0) {
    fail(400, 'invalid_config', '最低支持版本不能高于最新版本')
  }

  return {
    maintenance: {
      enabled: bool(maintenanceRaw.enabled),
      message: str(maintenanceRaw.message),
      startAt: isoOrNull(maintenanceRaw.startAt),
      endAt: isoOrNull(maintenanceRaw.endAt),
    },
    release: {
      latestVersion,
      latestVersionCode: Math.floor(latestVersionCode),
      minSupportedVersion,
      forceUpdate: bool(releaseRaw.forceUpdate),
      updateNotes: str(releaseRaw.updateNotes),
    },
    content: {
      version: str(contentRaw.version, '1'),
      rollout: Math.round(rollout),
      notes: str(contentRaw.notes),
    },
    tools,
    announcements,
    features,
  }
}

/* ------------------------------------------------------------------ */
/* 版本号                                                              */
/* ------------------------------------------------------------------ */

export function compareVersions(left: string, right: string): number {
  const parse = (value: string): number[] =>
    value
      .split(/[.+-]/)
      .map((part) => Number.parseInt(part, 10))
      .filter((part) => Number.isFinite(part))
  const a = parse(left)
  const b = parse(right)
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

/* ------------------------------------------------------------------ */
/* 差异摘要                                                            */
/* ------------------------------------------------------------------ */

export interface ConfigChange {
  key: string
  label: string
  detail: string
  count: number
}

function arraysEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function diffConfig(
  published: RemoteConfig,
  draft: RemoteConfig,
): ConfigChange[] {
  const changes: ConfigChange[] = []

  if (!arraysEqual(published.maintenance, draft.maintenance)) {
    changes.push({
      key: 'maintenance',
      label: '维护模式',
      detail: draft.maintenance.enabled ? '已开启维护模式' : '维护模式设置已调整',
      count: 1,
    })
  }

  const releaseFields: Array<[keyof RemoteConfig['release'], string]> = [
    ['latestVersion', '最新版本'],
    ['latestVersionCode', '版本号'],
    ['minSupportedVersion', '最低支持版本'],
    ['forceUpdate', '强制更新'],
    ['updateNotes', '更新说明'],
  ]
  const releaseChanges = releaseFields.filter(
    ([field]) => published.release[field] !== draft.release[field],
  )
  if (releaseChanges.length > 0) {
    changes.push({
      key: 'release',
      label: '版本策略',
      detail: releaseChanges.map(([, label]) => label).join('、'),
      count: releaseChanges.length,
    })
  }

  const contentChanges = (
    ['version', 'rollout', 'notes'] as Array<keyof RemoteConfig['content']>
  ).filter((field) => published.content[field] !== draft.content[field])
  if (contentChanges.length > 0) {
    changes.push({
      key: 'content',
      label: '内容清单',
      detail:
        draft.content.rollout !== published.content.rollout
          ? `灰度比例 ${published.content.rollout}% → ${draft.content.rollout}%`
          : '内容版本信息已调整',
      count: contentChanges.length,
    })
  }

  const publishedTools = new Map(published.tools.map((tool) => [tool.toolId, tool]))
  const draftTools = new Map(draft.tools.map((tool) => [tool.toolId, tool]))
  const toolTouched: string[] = []
  for (const [toolId, tool] of draftTools) {
    const previous = publishedTools.get(toolId)
    if (!previous || !arraysEqual(previous, tool)) {
      toolTouched.push(TOOL_BY_ID.get(toolId)?.title ?? toolId)
    }
  }
  for (const toolId of publishedTools.keys()) {
    if (!draftTools.has(toolId)) toolTouched.push(TOOL_BY_ID.get(toolId)?.title ?? toolId)
  }
  if (toolTouched.length > 0) {
    changes.push({
      key: 'tools',
      label: '工具开关',
      detail: toolTouched.slice(0, 4).join('、') + (toolTouched.length > 4 ? ' 等' : ''),
      count: toolTouched.length,
    })
  }

  const publishedAnnouncements = new Map(published.announcements.map((item) => [item.id, item]))
  const draftAnnouncements = new Map(draft.announcements.map((item) => [item.id, item]))
  const added = [...draftAnnouncements.keys()].filter((id) => !publishedAnnouncements.has(id))
  const removed = [...publishedAnnouncements.keys()].filter((id) => !draftAnnouncements.has(id))
  const edited = [...draftAnnouncements.entries()].filter(([id, item]) => {
    const previous = publishedAnnouncements.get(id)
    return previous && !arraysEqual(previous, item)
  })
  const announcementCount = added.length + removed.length + edited.length
  if (announcementCount > 0) {
    const parts: string[] = []
    if (added.length > 0) parts.push(`新增 ${added.length} 条`)
    if (edited.length > 0) parts.push(`修改 ${edited.length} 条`)
    if (removed.length > 0) parts.push(`删除 ${removed.length} 条`)
    changes.push({
      key: 'announcements',
      label: '公告',
      detail: parts.join(' · '),
      count: announcementCount,
    })
  }

  const featureChanged = draft.features.filter((feature) => {
    const previous = published.features.find((item) => item.key === feature.key)
    return !previous || previous.enabled !== feature.enabled || previous.description !== feature.description
  })
  const featureRemoved = published.features.filter(
    (feature) => !draft.features.some((item) => item.key === feature.key),
  )
  if (featureChanged.length + featureRemoved.length > 0) {
    changes.push({
      key: 'features',
      label: '功能开关',
      detail: `${featureChanged.length + featureRemoved.length} 个开关有变化`,
      count: featureChanged.length + featureRemoved.length,
    })
  }

  return changes
}

/* ------------------------------------------------------------------ */
/* 下发给客户端的生效配置                                               */
/* ------------------------------------------------------------------ */

export interface ClientContext {
  version: string
  channel: string
  sn: string
}

/** 客户端节流策略：由服务端下发，客户端不要硬编码更大的频率。 */
export const CLIENT_POLICY = {
  /** 两次配置同步之间的最小间隔（6 小时） */
  configSyncIntervalSeconds: 6 * 60 * 60,
  /** 遥测队列的最小上报间隔（10 分钟） */
  telemetryFlushIntervalSeconds: 10 * 60,
  /** 单次上报的最大事件数 */
  telemetryBatchMax: 200,
  /** 本地队列上限 */
  telemetryQueueMaxEvents: 800,
  /** 本地队列文件上限（字节） */
  telemetryQueueMaxBytes: 512 * 1024,
} as const

export interface ToolOverrideState {
  enabled: boolean
  note: string
}

function bucketOf(sn: string): number {
  if (!sn) return 100
  const hash = createHash('sha1').update(sn).digest()
  return (hash.readUInt32BE(0) % 100) + 1
}

export function effectiveConfig(
  config: RemoteConfig,
  context: ClientContext,
  overrides?: Map<string, ToolOverrideState>,
) {
  const channel = CHANNEL_IDS.has(context.channel) ? context.channel : 'stable'
  const version = context.version || '0.0.0'
  const now = Date.now()

  const tools: Record<
    string,
    { enabled: boolean; message: string; source: 'global' | 'device'; reason?: string; note?: string }
  > = {}
  for (const tool of config.tools) {
    const channelOk = tool.channels.includes(channel)
    const versionOk = compareVersions(version, tool.minVersion) >= 0
    const globalEnabled = tool.enabled && channelOk && versionOk
    const override = overrides?.get(tool.toolId)
    // 设备级开关优先于云端全局开关：既可以单独关闭，也可以单独放行。
    const enabled = override ? override.enabled : globalEnabled
    tools[tool.toolId] = {
      enabled,
      message: tool.message,
      source: override ? 'device' : 'global',
      ...(override?.note ? { note: override.note } : {}),
      ...(enabled
        ? {}
        : {
            reason: override
              ? 'device_disabled'
              : !tool.enabled
                ? 'disabled'
                : !channelOk
                  ? 'channel_excluded'
                  : 'version_too_low',
          }),
    }
  }

  const announcements = config.announcements
    .filter((item) => {
      if (!item.enabled) return false
      if (!item.channels.includes(channel)) return false
      if (item.startAt && Date.parse(item.startAt) > now) return false
      if (item.endAt && Date.parse(item.endAt) < now) return false
      if (item.minVersion && compareVersions(version, item.minVersion) < 0) return false
      return true
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned))
    .map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      level: item.level,
      pinned: item.pinned,
      startAt: item.startAt,
      endAt: item.endAt,
    }))

  const maintenance =
    config.maintenance.enabled &&
    (!config.maintenance.startAt || Date.parse(config.maintenance.startAt) <= now) &&
    (!config.maintenance.endAt || Date.parse(config.maintenance.endAt) >= now)

  const bucket = bucketOf(context.sn)
  const contentAvailable = config.content.rollout >= 100 || bucket <= config.content.rollout

  return {
    version: 1,
    channel,
    clientVersion: version,
    serverTime: new Date().toISOString(),
    maintenance: {
      enabled: maintenance,
      message: config.maintenance.message,
      startAt: config.maintenance.startAt,
      endAt: config.maintenance.endAt,
    },
    release: {
      ...config.release,
      updateAvailable: compareVersions(version, config.release.latestVersion) < 0,
      updateRequired:
        compareVersions(version, config.release.minSupportedVersion) < 0 &&
        config.release.forceUpdate,
    },
    content: {
      version: config.content.version,
      notes: config.content.notes,
      available: contentAvailable,
      bucket,
    },
    tools,
    announcements,
    features: Object.fromEntries(config.features.map((feature) => [feature.key, feature.enabled])),
    sync: {
      configIntervalSeconds: CLIENT_POLICY.configSyncIntervalSeconds,
      telemetryFlushIntervalSeconds: CLIENT_POLICY.telemetryFlushIntervalSeconds,
      telemetryBatchMax: CLIENT_POLICY.telemetryBatchMax,
      nextConfigAt: new Date(now + CLIENT_POLICY.configSyncIntervalSeconds * 1000).toISOString(),
    },
  }
}

export function parseStoredConfig(json: string): RemoteConfig {
  try {
    return validateConfig(JSON.parse(json))
  } catch {
    // 数据库里的配置理论上永远合法；真坏了也不能让整站不可用
    return validateConfig({
      maintenance: { enabled: false, message: '', startAt: null, endAt: null },
      release: {
        latestVersion: '1.0.0',
        latestVersionCode: 1,
        minSupportedVersion: '1.0.0',
        forceUpdate: false,
        updateNotes: '',
      },
      content: { version: '1', rollout: 100, notes: '' },
      tools: [...TOOL_BY_ID.keys()].map((toolId) => ({
        toolId,
        enabled: true,
        minVersion: '1.0.0',
        channels: ['stable', 'beta'],
        message: '',
      })),
      announcements: [],
      features: [],
    })
  }
}

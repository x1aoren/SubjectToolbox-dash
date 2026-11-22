export interface SessionUser {
  id: string
  username: string
  displayName: string
  email: string
  role: string
  roleName: string
  status: string
  avatarColor: string
  createdAt: string
  lastLoginAt: string | null
  permissions: string[]
}

export interface PublicMeta {
  workspaceName: string
  orgName: string
  version: string
  counts: { devices: number; feedback: number; events: number }
  demoMode: boolean
  demoAccount: { username: string; password: string } | null
  /** 生产模式：不播种演示数据、不展示演示账号、不允许重建演示数据 */
  production: boolean
  serverTime: string
}

/** 工具类型：普通工具 / 交互示意图子项 / 主页功能入口 */
export type ToolKind = 'tool' | 'diagram' | 'feature'

/** 停用原因的来源：单设备覆盖 / 全局配置 */
export type DisabledReasonSource = 'device' | 'global'

export interface Subject {
  id: string
  name: string
  short: string
  accent: string
  order: number
}

export interface ToolMeta {
  id: string
  subjectId: string
  title: string
  summary: string
  glyph: string
  /** 与客户端同款 Lucide 图标（kebab-case） */
  icon: string
  weight?: number
  /** 缺省视为 'tool' */
  kind?: ToolKind
  /** 子工具所属的父工具 id；主工具为 null */
  parentId?: string | null
}

export interface ReleaseMeta {
  versionName: string
  versionCode: number
  date: string
  headline: string
}

export interface Catalog {
  subjects: Subject[]
  tools: ToolMeta[]
  releases: ReleaseMeta[]
  channels: Array<{ id: string; name: string }>
}

export interface OverviewKpis {
  activeDevices: number
  activeDevicesDelta: number | null
  sessions: number
  sessionsDelta: number | null
  toolOpens: number
  toolOpensDelta: number | null
  pendingFeedback: number
  inProgressFeedback: number
  newFeedback: number
  urgentFeedback: number
  unresolvedErrors: number
  errorDevices: number
  errorRate: number
  errorRateDelta: number | null
  newDevices: number
  newDevicesDelta: number | null
  avgSessionMinutes: number
  retention7d: number
  onlineDevices: number
  totalDevices: number
}

export interface Overview {
  generatedAt: string
  range: number
  today: { date: string; activeDevices: number; sessions: number; toolOpens: number }
  kpis: OverviewKpis
  series: Array<{
    date: string
    activeDevices: number
    sessions: number
    toolOpens: number
    errors: number
    newDevices: number
  }>
  tools: Array<{
    toolId: string
    title: string
    subjectId: string
    glyph: string
    icon: string
    opens: number
    devices: number
    share: number
    errors: number
    delta: number | null
  }>
  subjects: Array<{
    subjectId: string
    name: string
    short: string
    accent: string
    opens: number
    devices: number
  }>
  versions: Array<{ version: string; devices: number; share: number }>
  channels: Array<{ channel: string; devices: number }>
  grades: Array<{ grade: string; devices: number }>
  heatmap: Array<{ weekday: number; hour: number; count: number }>
  topErrors: Array<{
    signature: string
    message: string
    toolId: string | null
    count: number
    devices: number
    unresolved: number
    lastSeenAt: string
  }>
  recentFeedback: Array<{
    id: string
    type: string
    title: string
    status: string
    priority: string
    createdAt: string
    appVersion: string
    deviceModel: string
    school: string
    grade: string
  }>
  activity: Array<{
    id: number
    actorName: string
    action: string
    targetType: string
    targetLabel: string
    detail: string
    createdAt: string
  }>
  toolMeta: Array<{
    id: string
    title: string
    subjectId: string
    summary: string
    glyph: string
    icon: string
    subject: string
  }>
}

export interface Device {
  sn: string
  model: string
  manufacturer: string
  osVersion: string
  sdkInt: number
  appVersion: string
  versionCode: number
  channel: string
  school: string
  grade: string
  firstSeenAt: string
  lastSeenAt: string
  totalSessions: number
  totalOpens: number
  status: 'online' | 'active' | 'stale'
  feedbackCount: number
  overrideCount: number
}

export interface DeviceListResponse {
  items: Device[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  facets: {
    versions: Array<{ version: string; count: number }>
    channels: Array<{ channel: string; count: number }>
    grades: Array<{ grade: string; count: number }>
    schools: Array<{ school: string; count: number }>
  }
}

export interface DeviceDetailResponse {
  device: Device
  usage: Array<{ date: string; sessions: number; toolOpens: number }>
  tools: Array<{ toolId: string; title: string; subjectId: string; opens: number; days: number }>
  recentEvents: Array<{
    id: number
    name: string
    toolId: string | null
    toolTitle: string | null
    appVersion: string
    props: string
    occurredAt: string
  }>
  versions: Array<{ version: string; firstSeenAt: string; lastSeenAt: string; events: number }>
  feedback: Array<{
    id: string
    title: string
    type: string
    status: string
    priority: string
    createdAt: string
  }>
  errors: Array<{
    id: number
    signature: string
    message: string
    resolved: boolean
    occurredAt: string
  }>
}

export interface EventItem {
  id: number
  sn: string
  name: string
  toolId: string | null
  toolTitle: string | null
  subjectId: string | null
  appVersion: string
  channel: string
  props: string
  occurredAt: string
  receivedAt: string
  model: string | null
  school: string | null
  grade: string | null
}

export interface EventListResponse {
  items: EventItem[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  names: Array<{ name: string; count: number }>
}

export interface ErrorGroup {
  signature: string
  message: string
  toolId: string | null
  toolTitle: string | null
  total: number
  devices: number
  unresolved: number
  firstSeenAt: string
  lastSeenAt: string
}

export interface ErrorDetail {
  signature: string
  message: string
  stack: string
  toolId: string | null
  total: number
  devices: number
  unresolved: number
  firstSeenAt: string
  lastSeenAt: string
  occurrences: Array<{
    id: number
    sn: string
    message: string
    appVersion: string
    channel: string
    occurredAt: string
    resolved: boolean
    model: string
    school: string
    grade: string
  }>
  versions: Array<{ version: string; count: number }>
}

export interface FeedbackItem {
  id: string
  number: string
  sn: string | null
  type: string
  title: string
  content: string
  excerpt: string
  contact: string | null
  toolId: string | null
  toolTitle: string | null
  appVersion: string | null
  channel: string | null
  status: string
  priority: string
  assigneeId: string | null
  assigneeName: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
  lastReplyAt: string | null
  closedAt: string | null
  device: { sn: string; model: string; school: string; grade: string } | null
  messageCount: number
}

export interface FeedbackMessage {
  id: number
  authorType: 'user' | 'staff' | 'system'
  authorName: string
  authorColor: string | null
  body: string
  internal: boolean
  createdAt: string
}

export interface StaffMember {
  id: string
  name: string
  color: string
  role: string
}

export interface FeedbackListResponse {
  items: FeedbackItem[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  staff: StaffMember[]
}

export interface FeedbackDetailResponse {
  feedback: FeedbackItem
  messages: FeedbackMessage[]
}

export interface FeedbackStats {
  total: number
  byStatus: Record<string, number>
  byType: Record<string, number>
  newThisWeek: number
  urgentOpen: number
  unresolved: number
  avgResponseHours: number | null
}

export interface ToolConfig {
  toolId: string
  enabled: boolean
  minVersion: string
  channels: string[]
  /** 全局停用原因文案（0–120 字，空串表示使用客户端默认文案） */
  disabledReason: string
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
  maintenance: { enabled: boolean; message: string; startAt: string | null; endAt: string | null }
  release: {
    latestVersion: string
    latestVersionCode: number
    minSupportedVersion: string
    forceUpdate: boolean
    updateNotes: string
  }
  content: { version: string; rollout: number; notes: string }
  tools: ToolConfig[]
  announcements: Announcement[]
  features: FeatureFlag[]
}

export interface ConfigChange {
  key: string
  label: string
  detail: string
  count: number
}

export interface RevisionSummary {
  id: number
  versionNo: number
  summary: string
  publishedBy: string
  publishedAt: string
  size: number
  active?: boolean
}

export interface ConfigPayload {
  draft: RemoteConfig
  published: RemoteConfig
  activeRevision: RevisionSummary | null
  status: {
    hasChanges: boolean
    changes: ConfigChange[]
    updatedAt: string
    updatedBy: string
    publishedAt: string | null
    publishedBy: string
  }
}

export interface ConfigPreview {
  source: 'draft' | 'published'
  revision: RevisionSummary | null
  context: { version: string; channel: string; sn: string }
  config: {
    version: number
    channel: string
    clientVersion: string
    serverTime: string
    maintenance: { enabled: boolean; message: string; startAt: string | null; endAt: string | null }
    release: {
      latestVersion: string
      latestVersionCode: number
      minSupportedVersion: string
      forceUpdate: boolean
      updateNotes: string
      updateAvailable: boolean
      updateRequired: boolean
    }
    content: { version: string; notes: string; available: boolean; bucket: number }
    tools: Record<string, {
      enabled: boolean
      reason?: string
      source?: 'global' | 'device'
      note?: string
      /** 仅 enabled=false 时下发：override.reason || tool.disabledReason */
      disabledReason?: string
      /** 停用原因文本来源：单设备原因填了就是 device，否则 global */
      disabledReasonSource?: DisabledReasonSource
    }>
    announcements: Array<{
      id: string
      title: string
      body: string
      level: string
      pinned: boolean
      startAt: string | null
      endAt: string | null
    }>
    features: Record<string, boolean>
    sync: {
      configIntervalSeconds: number
      telemetryFlushIntervalSeconds: number
      telemetryBatchMax: number
      nextConfigAt: string
    }
  }
  toolTitles: Record<string, string>
  deviceOverrides: number
}

export interface TeamUser {
  id: string
  username: string
  displayName: string
  email: string
  role: string
  roleName: string
  status: string
  avatarColor: string
  createdAt: string
  lastLoginAt: string | null
  assignedFeedback: number
  openFeedback: number
}

export interface RoleDefinition {
  id: string
  name: string
  description: string
  tone: string
  permissions: string[]
  memberCount: number
}

export interface PermissionDefinition {
  key: string
  name: string
  group: string
  description: string
}

export interface AuditItem {
  id: number
  actorName: string
  action: string
  targetType: string | null
  targetId: string | null
  targetLabel: string | null
  detail: string
  ip: string
  createdAt: string
}

export interface ApiKeyItem {
  id: string
  name: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
  createdBy: string
}

export interface SystemSettings {
  workspaceName: string
  orgName: string
  telemetryEnabled: boolean
  feedbackEnabled: boolean
  retentionDays: number
  allowAnonymousIngest: boolean
  demoSeededAt: string
  lastPublishAt: string | null
}

export interface SystemInfo {
  devices: number
  events: number
  errors: number
  feedback: number
  users: number
  revisions: number
  dbBytes: number
  dataDir: string
  node: string
  platform: string
  startedAt: string
  uptimeSeconds: number
}

export interface IntegrationInfo {
  apiBase: string
  settings: { telemetryEnabled: boolean; feedbackEnabled: boolean; allowAnonymousIngest: boolean }
  key: { name: string; prefix: string; createdAt: string } | null
  requestKeyMatched: boolean
  events: Array<{ name: string; description: string }>
  tools: Array<{ id: string; title: string; subjectId: string; summary: string }>
  releases: ReleaseMeta[]
  toolTitles: Record<string, string>
}

export interface NotificationsResponse {
  activity: Array<{
    id: number
    actorName: string
    action: string
    targetType: string
    targetLabel: string
    detail: string
    createdAt: string
  }>
  badges: { pending: number; urgent: number; errors: number }
  lastSeenAt: string | null
}

export interface DeviceOverrideTool {
  toolId: string
  title: string
  subjectId: string
  glyph: string
  icon: string
  summary: string
  globalEnabled: boolean
  overrideEnabled: boolean | null
  effectiveEnabled: boolean
  note: string
  /** 本设备停用原因（空串表示未填，客户端回退到全局原因） */
  reason: string
  /** 子工具所属的父工具 id；主工具为 null */
  parentId: string | null
  kind: ToolKind
  /** 已发布配置里的全局停用原因，供后台对照显示 */
  disabledReasonGlobal: string
  updatedBy: string
  updatedAt: string | null
}

export interface DeviceOverrideResponse {
  sn: string
  device: { sn: string; model: string; manufacturer: string; appVersion: string; channel: string }
  tools: DeviceOverrideTool[]
  overrideCount: number
  updatedAt: string | null
}

export interface ToolSyncItem {
  toolId: string
  expectedTitle: string
  expectedSubjectId: string
  title: string
  subjectId: string
  synced: boolean
  reportCount: number
  devices: number
  lastReportedAt: string | null
  titleMismatch: boolean
  extra: boolean
}

export interface ToolSyncResponse {
  tools: ToolSyncItem[]
  expectedCount: number
  syncedCount: number
  deviceCount: number
  missing: string[]
  titleMismatch: string[]
  extras: string[]
  lastReportedAt: string | null
  overrideCount: number
}
export interface DataSummary {
  events: number
  errors: number
  feedback: number
  feedbackMessages: number
  devices: number
  overrides: number
  deviceTools: number
  clientTools: number
  auditLogs: number
  configRevisions: number
  dbBytes: number
}

export interface PurgeResponse {
  ok: boolean
  categories: string[]
  before: DataSummary
  deleted: {
    devices: number
    events: number
    errors: number
    feedback: number
    deviceTools: number
    overrides: number
    clientTools: number
    auditLogs: number
  }
  after: DataSummary
}

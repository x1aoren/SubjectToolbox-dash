/**
 * 控制台权限模型。
 *
 * 角色是固定的一组能力，账号可以自由选择角色；权限点按「域.动作」命名，
 * 服务端每个写接口都会显式校验，前端只负责把没有权限的入口藏掉。
 */

export const PERMISSIONS = [
  { key: 'dashboard.view', name: '查看概览', group: '概览', description: '访问全局指标、趋势图与待办' },
  { key: 'telemetry.view', name: '查看遥测数据', group: '遥测', description: '设备、工具使用、事件流与崩溃记录' },
  { key: 'telemetry.export', name: '导出遥测数据', group: '遥测', description: '把设备与事件导出为 CSV' },
  { key: 'telemetry.manage', name: '处理遥测异常', group: '遥测', description: '把一组崩溃标记为已处理或重新打开' },
  { key: 'config.view', name: '查看云端配置', group: '云端控制', description: '查看草稿、生效配置与发布历史' },
  { key: 'config.edit', name: '编辑云端配置', group: '云端控制', description: '修改工具开关、公告、版本策略与内容清单' },
  { key: 'config.publish', name: '发布云端配置', group: '云端控制', description: '把草稿发布为生效修订，或回滚历史修订' },
  { key: 'feedback.view', name: '查看意见反馈', group: '意见反馈', description: '读取反馈内容、设备信息与对话记录' },
  { key: 'feedback.reply', name: '回复意见反馈', group: '意见反馈', description: '以工作人员身份回复用户，或添加内部备注' },
  { key: 'feedback.manage', name: '管理意见反馈', group: '意见反馈', description: '改状态、优先级、指派负责人与标签' },
  { key: 'users.view', name: '查看成员', group: '成员与权限', description: '查看账号列表与角色' },
  { key: 'users.manage', name: '管理成员', group: '成员与权限', description: '创建账号、调整角色、启停与重置密码' },
  { key: 'audit.view', name: '查看审计日志', group: '成员与权限', description: '查询控制台上的敏感操作记录' },
  { key: 'settings.manage', name: '管理系统设置', group: '系统', description: '遥测采集开关、留存策略与接入密钥' },
  { key: 'keys.manage', name: '管理接入密钥', group: '系统', description: '创建或吊销客户端上报密钥（仅超级管理员）' },
] as const

export type PermissionKey = (typeof PERMISSIONS)[number]['key']

export type RoleId = 'owner' | 'admin' | 'operator' | 'analyst' | 'viewer'

export interface Role {
  id: RoleId
  name: string
  description: string
  /** 单色 token：owner 用品牌绿、analyst 用蓝、viewer 用灰 */
  tone: 'brand' | 'blue' | 'violet' | 'green' | 'gray'
  permissions: PermissionKey[]
}

const ALL: PermissionKey[] = PERMISSIONS.map((p) => p.key)

export const ROLES: Role[] = [
  {
    id: 'owner',
    name: '超级管理员',
    description: '完整控制权，包括账号、密钥与演示数据重置',
    tone: 'brand',
    permissions: ALL,
  },
  {
    id: 'admin',
    name: '管理员',
    description: '负责日常运营与配置发布，可管理成员，但不能操作接入密钥',
    tone: 'blue',
    permissions: [
      'dashboard.view',
      'telemetry.view',
      'telemetry.export',
      'telemetry.manage',
      'config.view',
      'config.edit',
      'config.publish',
      'feedback.view',
      'feedback.reply',
      'feedback.manage',
      'users.view',
      'users.manage',
      'audit.view',
      'settings.manage',
    ],
  },
  {
    id: 'operator',
    name: '运营专员',
    description: '处理反馈、编辑配置草稿，发布由管理员执行',
    tone: 'green',
    permissions: [
      'dashboard.view',
      'telemetry.view',
      'telemetry.manage',
      'config.view',
      'config.edit',
      'feedback.view',
      'feedback.reply',
      'feedback.manage',
      'users.view',
    ],
  },
  {
    id: 'analyst',
    name: '数据分析师',
    description: '只读遥测与反馈，可导出数据用于教研分析',
    tone: 'violet',
    permissions: [
      'dashboard.view',
      'telemetry.view',
      'telemetry.export',
      'config.view',
      'feedback.view',
      'audit.view',
    ],
  },
  {
    id: 'viewer',
    name: '只读成员',
    description: '查看概览、遥测、配置与反馈，不能做任何修改',
    tone: 'gray',
    permissions: ['dashboard.view', 'telemetry.view', 'config.view', 'feedback.view'],
  },
]

export const ROLE_BY_ID = new Map(ROLES.map((r) => [r.id, r]))

export const ROLE_IDS = ROLES.map((r) => r.id)

export function isRoleId(value: unknown): value is RoleId {
  return typeof value === 'string' && ROLE_BY_ID.has(value as RoleId)
}

export function roleName(role: RoleId): string {
  return ROLE_BY_ID.get(role)?.name ?? role
}

export function permissionsOf(role: RoleId): PermissionKey[] {
  return ROLE_BY_ID.get(role)?.permissions ?? []
}

export function can(role: RoleId, permission: PermissionKey): boolean {
  return permissionsOf(role).includes(permission)
}

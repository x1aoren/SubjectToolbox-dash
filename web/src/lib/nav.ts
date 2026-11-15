import {
  Activity,
  CodeXml,
  Database,
  GitCommitHorizontal,
  Inbox,
  LayoutDashboard,
  ListFilter,
  Megaphone,
  Power,
  Rocket,
  ScrollText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Tablet,
  TriangleExclamationPoint,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  permission?: string
  end?: boolean
  description?: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: '工作台',
    items: [
      {
        to: '/',
        label: '概览',
        icon: LayoutDashboard,
        permission: 'dashboard.view',
        end: true,
        description: '关键指标、趋势与待办',
      },
    ],
  },
  {
    label: '遥测数据',
    items: [
      {
        to: '/telemetry/devices',
        label: '设备',
        icon: Tablet,
        permission: 'telemetry.view',
        description: '校园平板清单与活跃状态',
      },
      {
        to: '/telemetry/tools',
        label: '工具使用',
        icon: Wrench,
        permission: 'telemetry.view',
        description: '11 个学科工具的使用情况',
      },
      {
        to: '/telemetry/errors',
        label: '崩溃记录',
        icon: TriangleExclamationPoint,
        permission: 'telemetry.view',
        description: '按签名聚合的异常与堆栈',
      },
      {
        to: '/telemetry/events',
        label: '事件流',
        icon: ListFilter,
        permission: 'telemetry.view',
        description: '客户端上报的原始事件',
      },
    ],
  },
  {
    label: '云端控制',
    items: [
      {
        to: '/control',
        label: '配置概览',
        icon: SlidersHorizontal,
        permission: 'config.view',
        end: true,
        description: '草稿状态、预览与发布',
      },
      {
        to: '/control/tools',
        label: '工具开关',
        icon: Power,
        permission: 'config.view',
        description: '逐工具启用、最低版本与提示语',
      },
      {
        to: '/control/announcements',
        label: '公告',
        icon: Megaphone,
        permission: 'config.view',
        description: '首页公告与维护通知',
      },
      {
        to: '/control/release',
        label: '版本与内容',
        icon: Rocket,
        permission: 'config.view',
        description: '最低版本、更新说明与内容灰度',
      },
      {
        to: '/control/history',
        label: '发布记录',
        icon: GitCommitHorizontal,
        permission: 'config.view',
        description: '修订历史、回滚与差异',
      },
    ],
  },
  {
    label: '意见反馈',
    items: [
      {
        to: '/feedback',
        label: '反馈收件箱',
        icon: Inbox,
        permission: 'feedback.view',
        description: '用户反馈、回复与流转',
      },
    ],
  },
  {
    label: '团队与权限',
    items: [
      {
        to: '/team',
        label: '成员',
        icon: Users,
        permission: 'users.view',
        end: true,
        description: '账号、角色与启停',
      },
      {
        to: '/team/roles',
        label: '角色权限',
        icon: ShieldCheck,
        permission: 'users.view',
        description: '五种角色的能力矩阵',
      },
      {
        to: '/team/audit',
        label: '审计日志',
        icon: ScrollText,
        permission: 'audit.view',
        description: '控制台上的敏感操作',
      },
    ],
  },
  {
    label: '系统',
    items: [
      {
        to: '/settings',
        label: '设置',
        icon: Settings,
        description: '工作区、密钥与安全',
      },
      {
        to: '/data',
        label: '数据管理',
        icon: Database,
        permission: 'settings.manage',
        description: '选择性清除遥测、反馈与设备数据',
      },
      {
        to: '/integration',
        label: '接入文档',
        icon: CodeXml,
        description: '客户端上报与配置接口',
      },
    ],
  },
]

export const PAGE_META: Record<string, { group: string; title: string; description: string }> = {
  '/': { group: '工作台', title: '概览', description: '遥测、反馈与云端配置的整体运行状况' },
  '/telemetry/devices': { group: '遥测数据', title: '设备', description: '校园平板的装机、活跃与版本分布' },
  '/telemetry/tools': { group: '遥测数据', title: '工具使用', description: '各学科工具的使用频度、覆盖设备与异常' },
  '/telemetry/errors': { group: '遥测数据', title: '崩溃记录', description: '按异常签名聚合，便于定位与批量处理' },
  '/telemetry/events': { group: '遥测数据', title: '事件流', description: '客户端上报的原始事件与属性' },
  '/control': { group: '云端控制', title: '配置概览', description: '草稿、线上修订与下发内容' },
  '/control/tools': { group: '云端控制', title: '工具开关', description: '逐工具控制可见性与最低版本' },
  '/control/announcements': { group: '云端控制', title: '公告', description: '首页横幅与维护通知的排期' },
  '/control/release': { group: '云端控制', title: '版本与内容', description: '版本策略、强制更新与内容灰度' },
  '/control/history': { group: '云端控制', title: '发布记录', description: '云端配置的修订历史' },
  '/feedback': { group: '意见反馈', title: '反馈收件箱', description: '用户的建议、问题与内容纠错' },
  '/team': { group: '团队与权限', title: '成员', description: '控制台账号与角色管理' },
  '/team/roles': { group: '团队与权限', title: '角色权限', description: '五种角色的能力矩阵' },
  '/team/audit': { group: '团队与权限', title: '审计日志', description: '谁在什么时候做了什么' },
  '/settings': { group: '系统', title: '设置', description: '工作区信息、采集策略、密钥与数据' },
  '/data': { group: '系统', title: '数据管理', description: '选择性清除遥测、反馈与设备数据' },
  '/integration': { group: '系统', title: '接入文档', description: 'SubjectToolbox 客户端如何接入遥测与配置服务' },
}

export function resolvePage(pathname: string): { group: string; title: string; description: string } {
  const exact = PAGE_META[pathname]
  if (exact) return exact
  if (pathname.startsWith('/telemetry/devices/')) {
    return { group: '遥测数据', title: '设备详情', description: '单台设备的活动、版本与反馈' }
  }
  if (pathname.startsWith('/feedback')) {
    return { group: '意见反馈', title: '反馈收件箱', description: '用户的建议、问题与内容纠错' }
  }
  const match = Object.keys(PAGE_META)
    .filter((key) => key !== '/' && pathname.startsWith(key))
    .sort((a, b) => b.length - a.length)[0]
  return match ? PAGE_META[match]! : { group: '控制台', title: '页面', description: '' }
}

export function allNavItems(): NavItem[] {
  return NAV_GROUPS.flatMap((group) => group.items)
}

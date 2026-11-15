import { Fragment } from 'react'
import { Check, Minus, ShieldCheck, Users } from 'lucide-react'
import { useApi } from '../lib/useApi'
import { ROLE_TONE } from '../lib/format'
import type { PermissionDefinition, RoleDefinition } from '../lib/types'
import { Badge, Card, CardHeader, EmptyState, Skeleton, cn } from '../components/ui'

const TONE_VAR: Record<string, string> = {
  brand: 'var(--brand)',
  blue: 'var(--info)',
  violet: 'var(--violet)',
  green: 'var(--positive)',
  gray: 'var(--muted)',
  neutral: 'var(--muted)',
}

interface RolesResponse {
  roles: RoleDefinition[]
  permissions: PermissionDefinition[]
}

export function RolesPage(): React.JSX.Element {
  const { data, loading } = useApi<RolesResponse>('/api/roles')

  if (loading && !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-[132px] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-[460px] rounded-2xl" />
      </div>
    )
  }

  if (!data) {
    return <EmptyState title="角色数据加载失败" description="请刷新页面重试。" />
  }

  const groups = Array.from(new Set(data.permissions.map((permission) => permission.group)))

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.02em] text-ink">角色权限</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          五种固定角色覆盖从日常运营到只读观察的场景；账号可以随时切换角色，但权限矩阵本身不可编辑。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {data.roles.map((role) => (
          <Card key={role.id} className="flex h-full flex-col p-4">
            <div className="flex items-start justify-between">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{
                  background: `color-mix(in srgb, ${TONE_VAR[role.tone] ?? 'var(--brand)'} 12%, var(--surface))`,
                  color: TONE_VAR[role.tone] ?? 'var(--brand)',
                }}
              >
                <ShieldCheck size={15} />
              </span>
              <Badge tone={ROLE_TONE[role.id] ?? 'neutral'}>
                {role.id === 'owner' ? '最高权限' : role.id === 'viewer' ? '只读' : '内置角色'}
              </Badge>
            </div>
            <div className="mt-2.5 text-[13px] font-semibold text-ink">{role.name}</div>
            <p className="mt-1 text-[11px] leading-5 text-muted">{role.description}</p>
            <div className="mt-auto flex items-center justify-between pt-3 text-[10.5px] text-faint">
              <span className="flex items-center gap-1">
                <Users size={11} /> {role.memberCount} 位成员
              </span>
              <span className="num">{role.permissions.length} / {data.permissions.length} 权限</span>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-3 overflow-hidden">
        <CardHeader
          title="权限矩阵"
          description="服务端对每个管理接口逐一校验；前端只负责隐藏无权限的入口"
          action={<Badge tone="brand">{data.permissions.length} 项权限 · {data.roles.length} 个角色</Badge>}
        />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-y border-line bg-surface-2 px-5 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wide text-faint">
                  权限
                </th>
                {data.roles.map((role) => (
                  <th
                    key={role.id}
                    className="border-y border-l border-line bg-surface-2 px-2 py-2.5 text-center text-[11px] font-medium text-muted"
                  >
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group}>
                  <tr>
                    <td
                      colSpan={data.roles.length + 1}
                      className="border-b border-line bg-surface px-5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint"
                    >
                      {group}
                    </td>
                  </tr>
                  {data.permissions
                    .filter((permission) => permission.group === group)
                    .map((permission) => (
                      <tr key={permission.key} className="group">
                        <td className="sticky left-0 z-10 border-b border-line bg-surface px-5 py-2.5 group-hover:bg-surface-2">
                          <div className="text-[12px] text-ink">{permission.name}</div>
                          <div className="text-[10px] text-faint">
                            {permission.description} · <code className="font-mono">{permission.key}</code>
                          </div>
                        </td>
                        {data.roles.map((role) => {
                          const allowed = role.permissions.includes(permission.key)
                          return (
                            <td
                              key={role.id}
                              className={cn(
                                'border-b border-l border-line px-2 py-2.5 text-center group-hover:bg-surface-2',
                              )}
                            >
                              <span
                                className={cn(
                                  'inline-flex h-5 w-5 items-center justify-center rounded-full',
                                  allowed ? 'bg-brand-soft text-brand' : 'bg-surface-3 text-faint/50',
                                )}
                              >
                                {allowed ? <Check size={12} /> : <Minus size={12} />}
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {data.roles.slice(0, 3).map((role) => (
          <Card key={role.id} className="px-4 py-3">
            <div className="text-[11px] font-medium text-ink">{role.name}</div>
            <p className="mt-1 text-[10.5px] leading-4 text-faint">
              {role.id === 'owner'
                ? '拥有全部权限，包括接入密钥与演示数据重置，建议只保留 1–2 个账号。'
                : role.id === 'admin'
                  ? '可以发布云端配置与管理成员，适合信息技术组负责人。'
                  : '负责反馈处理与配置草稿编辑，发布动作交给管理员。'}
            </p>
          </Card>
        ))}
      </div>
    </div>
  )
}

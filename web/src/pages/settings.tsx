import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Check,
  Copy,
  Database,
  KeyRound,
  Lock,
  Monitor,
  Moon,
  Palette,
  Plus,
  Server,
  ShieldCheck,
  Sun,
  Trash2,
  TriangleExclamationPoint,
  UserRound,
} from 'lucide-react'
import { patch, post } from '../lib/api'
import { errorMessage, useAuth, useTheme, useToast } from '../lib/app-context'
import { useApi } from '../lib/useApi'
import {
  formatBytes,
  formatDateTime,
  formatNumber,
  formatUptime,
  relativeTime,
} from '../lib/format'
import type { ApiKeyItem, SystemInfo, SystemSettings } from '../lib/types'
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Switch,
  Tabs,
  cn,
} from '../components/ui'

const AVATAR_COLORS = ['#3F6E5A', '#34558B', '#6B4A8F', '#9A6B1F', '#2E7D6F', '#546E7A', '#9C4438']

export function SettingsPage(): React.JSX.Element {
  const { user, can, meta } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const isOwner = user?.role === 'owner'
  const isProduction = meta?.production === true
  const tabs = useMemo(
    () => [
      { key: 'profile', label: '个人资料' },
      { key: 'security', label: '安全' },
      ...(can('settings.manage') ? [{ key: 'system', label: '系统设置' }] : []),
      ...(can('keys.manage') ? [{ key: 'keys', label: '接入密钥' }] : []),
      // 生产环境不提供演示数据入口，整个 DemoSection 不可达
      ...(isOwner && !isProduction ? [{ key: 'demo', label: '演示数据' }] : []),
    ],
    [can, isOwner, isProduction],
  )
  const requested = searchParams.get('tab') ?? 'profile'
  const tab = tabs.some((item) => item.key === requested) ? requested : 'profile'

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.02em] text-ink">设置</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          {isProduction
            ? '控制台账号、采集策略与接入密钥'
            : '控制台账号、采集策略、接入密钥与演示数据'}
        </p>
      </div>

      <Tabs
        items={tabs}
        value={tab}
        onChange={(key) => setSearchParams(key === 'profile' ? {} : { tab: key }, { replace: true })}
        className="mb-4"
      />

      {tab === 'profile' ? <ProfileSection /> : null}
      {tab === 'security' ? <SecuritySection /> : null}
      {tab === 'system' ? <SystemSection /> : null}
      {tab === 'keys' ? <KeysSection /> : null}
      {!isProduction && tab === 'demo' ? <DemoSection /> : null}
    </div>
  )
}

function ProfileSection(): React.JSX.Element {
  const { user, refresh } = useAuth()
  const { mode, setMode } = useTheme()
  const { toast } = useToast()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [color, setColor] = useState(user?.avatarColor ?? AVATAR_COLORS[0]!)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    setDisplayName(user.displayName)
    setEmail(user.email)
    setColor(user.avatarColor)
  }, [user])

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await patch('/api/me', { displayName, email, avatarColor: color })
      await refresh()
      toast('个人资料已更新', 'success')
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const dirty = displayName !== user?.displayName || email !== user?.email || color !== user?.avatarColor

  return (
    <div className="grid gap-3 xl:grid-cols-12">
      <Card className="xl:col-span-7">
        <CardHeader title="个人资料" description="显示在审计日志、反馈回复与成员列表中" />
        <div className="p-5 pt-4">
          <div className="flex items-center gap-4">
            <Avatar name={displayName || '?'} color={color} size={56} />
            <div>
              <div className="text-[13px] font-medium text-ink">{user?.roleName}</div>
              <div className="text-[11px] text-faint">
                @{user?.username} · 加入于 {formatDateTime(user?.createdAt)}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3.5 sm:grid-cols-2">
            <Field label="显示姓名" required>
              <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={32} />
            </Field>
            <Field label="邮箱">
              <Input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@stb.edu.cn"
              />
            </Field>
          </div>

          <div className="mt-3.5">
            <span className="field-label">头像颜色</span>
            <div className="flex items-center gap-2">
              {AVATAR_COLORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-label={`选择颜色 ${item}`}
                  onClick={() => setColor(item)}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full transition',
                    color === item ? 'ring-2 ring-offset-2 ring-offset-[var(--surface)]' : 'hover:scale-105',
                  )}
                  style={{ background: item, boxShadow: color === item ? `0 0 0 2px ${item}` : undefined }}
                >
                  {color === item ? <Check size={13} className="text-white" /> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <Button size="sm" loading={saving} disabled={!dirty} onClick={() => void save()}>
              保存资料
            </Button>
            <span className="text-[10.5px] text-faint">姓名与颜色会立即更新到所有页面</span>
          </div>
        </div>
      </Card>

      <div className="space-y-3 xl:col-span-5">
        <Card>
          <CardHeader title="外观" description="只影响当前浏览器，不影响其他成员" />
          <div className="p-5 pt-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'light' as const, label: '浅色', icon: Sun },
                { key: 'dark' as const, label: '深色', icon: Moon },
                { key: 'system' as const, label: '跟随系统', icon: Monitor },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setMode(option.key)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-[11px] transition',
                    mode === option.key
                      ? 'border-brand/40 bg-brand-soft text-brand-strong'
                      : 'border-line bg-surface text-muted hover:bg-surface-2',
                  )}
                >
                  <option.icon size={16} />
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[10.5px] text-faint">
              <Palette size={11} /> 主题偏好保存在本浏览器的 localStorage。
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="账号信息" />
          <div className="space-y-2 px-5 pb-4 pt-2 text-[12px]">
            <div className="flex justify-between">
              <span className="text-muted">角色</span>
              <Badge tone="brand">{user?.roleName}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">最近登录</span>
              <span className="text-ink">{relativeTime(user?.lastLoginAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">权限项</span>
              <span className="num text-ink">{user?.permissions.length} 项</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function SecuritySection(): React.JSX.Element {
  const { user } = useAuth()
  const { toast } = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    setError(null)
    if (next.length < 8) {
      setError('新密码至少 8 位')
      return
    }
    if (next !== confirm) {
      setError('两次输入的新密码不一致')
      return
    }
    setSaving(true)
    try {
      await post('/api/me/password', { currentPassword: current, newPassword: next })
      toast('密码已更新', 'success')
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-3 xl:grid-cols-12">
      <Card className="xl:col-span-7">
        <CardHeader title="修改密码" description="修改后其他设备上的会话仍会保留，可联系管理员强制下线" />
        <div className="max-w-[420px] space-y-3.5 p-5 pt-4">
          <Field label="当前密码" required>
            <Input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </Field>
          <Field label="新密码" required hint="至少 8 位，建议包含大小写字母与数字">
            <Input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
          </Field>
          <Field label="确认新密码" required>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
          {error ? (
            <div className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-[12px] text-danger">
              {error}
            </div>
          ) : null}
          <Button size="sm" loading={saving} disabled={!current || !next} onClick={() => void submit()}>
            更新密码
          </Button>
        </div>
      </Card>

      <div className="space-y-3 xl:col-span-5">
        <Card>
          <CardHeader title="安全建议" />
          <ul className="space-y-2.5 px-5 pb-4 pt-2 text-[11.5px] leading-5 text-muted">
            <li>· 控制台账号仅限信息技术组与教研负责人使用。</li>
            <li>· 不要把初始密码转发到学生群或公开文档。</li>
            <li>· 发布配置、重置密码等操作都会记入审计日志。</li>
            <li>· 账号停用后，所有登录会话会立即失效。</li>
          </ul>
        </Card>
        <Card className="border-brand/25 bg-brand-soft/40">
          <div className="flex items-start gap-2.5 p-4">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand" />
            <div>
              <div className="text-[12px] font-medium text-ink">权限跟随角色</div>
              <p className="mt-0.5 text-[10.5px] leading-4 text-muted">
                你的角色是「{user?.roleName}」。需要调整权限时，请超级管理员在成员页修改角色。
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

interface SettingsResponse {
  settings: SystemSettings
  system: SystemInfo
}

function SystemSection(): React.JSX.Element {
  const { can } = useAuth()
  const { toast } = useToast()
  const { data, loading, reload } = useApi<SettingsResponse>(can('settings.manage') ? '/api/settings' : null)
  const [form, setForm] = useState<SystemSettings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data) setForm(data.settings)
  }, [data])

  if (!form || (loading && !data)) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    )
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(data?.settings)
  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await patch('/api/settings', {
        workspaceName: form.workspaceName,
        orgName: form.orgName,
        telemetryEnabled: form.telemetryEnabled,
        feedbackEnabled: form.feedbackEnabled,
        retentionDays: form.retentionDays,
        allowAnonymousIngest: form.allowAnonymousIngest,
      })
      toast('系统设置已保存', 'success')
      reload()
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-3 xl:grid-cols-12">
      <div className="space-y-3 xl:col-span-7">
        <Card>
          <CardHeader title="工作区信息" description="显示在左侧栏与控制台标题处" />
          <div className="grid gap-3.5 p-5 pt-3 sm:grid-cols-2">
            <Field label="工作区名称">
              <Input
                value={form.workspaceName}
                onChange={(event) => setForm({ ...form, workspaceName: event.target.value })}
              />
            </Field>
            <Field label="组织名称">
              <Input value={form.orgName} onChange={(event) => setForm({ ...form, orgName: event.target.value })} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="数据采集" description="这些开关只影响客户端上报，不会删除历史数据" />
          <div className="divide-y divide-line">
            {[
              {
                key: 'telemetryEnabled' as const,
                title: '遥测采集',
                description: '关闭后 /v1/telemetry/* 返回 503，客户端应静默跳过上报。',
              },
              {
                key: 'feedbackEnabled' as const,
                title: '意见反馈',
                description: '关闭后客户端反馈入口仍可见，但提交会失败。',
              },
            ].map((item) => (
              <div key={item.key} className="flex items-start justify-between gap-4 px-5 py-3.5">
                <div>
                  <div className="text-[12.5px] font-medium text-ink">{item.title}</div>
                  <p className="mt-0.5 text-[11px] text-muted">{item.description}</p>
                </div>
                <Switch
                  checked={form[item.key]}
                  label={item.title}
                  onChange={(checked) => setForm({ ...form, [item.key]: checked })}
                />
              </div>
            ))}
            <div className="flex items-start justify-between gap-4 px-5 py-3.5">
              <div>
                <div className="text-[12.5px] font-medium text-ink">允许匿名上报</div>
                <p className="mt-0.5 text-[11px] text-muted">
                  关闭后客户端必须携带有效的 X-STB-Key。校内演示环境建议保持开启。
                </p>
              </div>
              <Switch
                checked={form.allowAnonymousIngest}
                label="允许匿名上报"
                onChange={(checked) => setForm({ ...form, allowAnonymousIngest: checked })}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5">
              <div>
                <div className="text-[12.5px] font-medium text-ink">数据留存</div>
                <p className="mt-0.5 text-[11px] text-muted">演示环境不会自动清理，正式部署需要定时任务。</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={30}
                  max={3650}
                  value={form.retentionDays}
                  onChange={(event) => setForm({ ...form, retentionDays: Number(event.target.value) })}
                  className="h-8 w-[90px]"
                />
                <span className="text-[11px] text-muted">天</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-line px-5 py-3">
            <span className="text-[10.5px] text-faint">保存后会写入审计日志</span>
            <Button size="sm" loading={saving} disabled={!dirty} onClick={() => void save()}>
              保存设置
            </Button>
          </div>
        </Card>
      </div>

      <div className="space-y-3 xl:col-span-5">
        <Card>
          <CardHeader title="系统状态" action={<Server size={15} className="text-faint" />} />
          <div className="space-y-2 px-5 pb-4 pt-2 text-[12px]">
            <Row icon={<Database size={12} />} label="数据库体积" value={formatBytes(data?.system.dbBytes)} />
            <Row icon={<Server size={12} />} label="Node.js" value={data?.system.node ?? '—'} />
            <Row icon={<Monitor size={12} />} label="运行平台" value={data?.system.platform ?? '—'} />
            <Row label="已运行" value={data ? formatUptime(data.system.uptimeSeconds) : '—'} />
            <Row label="数据目录" value={<code className="font-mono text-[10px]">{data?.system.dataDir}</code>} />
          </div>
        </Card>
        <Card>
          <CardHeader title="数据规模" />
          <div className="grid grid-cols-2 gap-px bg-line">
            {[
              { label: '设备', value: data?.system.devices ?? 0 },
              { label: '事件', value: data?.system.events ?? 0 },
              { label: '反馈', value: data?.system.feedback ?? 0 },
              { label: '崩溃', value: data?.system.errors ?? 0 },
              { label: '成员', value: data?.system.users ?? 0 },
              { label: '修订', value: data?.system.revisions ?? 0 },
            ].map((item) => (
              <div key={item.label} className="bg-surface px-4 py-3">
                <div className="text-[10px] text-faint">{item.label}</div>
                <div className="num mt-0.5 text-[16px] font-semibold text-ink">{formatNumber(item.value)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

function Row({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-muted">
        {icon}
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-ink">{value}</span>
    </div>
  )
}

function KeysSection(): React.JSX.Element {
  const { can } = useAuth()
  const { toast } = useToast()
  const { data, reload } = useApi<{ items: ApiKeyItem[] }>(can('keys.manage') ? '/api/keys' : null)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [secret, setSecret] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyItem | null>(null)
  const [copied, setCopied] = useState(false)

  const create = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await post<{ secret: string }>('/api/keys', { name: name || '客户端密钥' })
      setCreateOpen(false)
      setName('')
      setSecret(result.secret)
      reload()
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader
          title="客户端接入密钥"
          description="客户端在 X-STB-Key 请求头里携带；吊销后立即失效"
          action={
            <Button size="sm" icon={<Plus size={13} />} onClick={() => setCreateOpen(true)}>
              创建密钥
            </Button>
          }
        />
        <div className="overflow-x-auto">
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <th>名称</th>
                <th>密钥前缀</th>
                <th>创建人</th>
                <th>创建时间</th>
                <th>最近使用</th>
                <th>状态</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((item) => (
                <tr key={item.id}>
                  <td className="text-[12px] font-medium text-ink">{item.name}</td>
                  <td>
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">
                      {item.prefix}
                    </code>
                  </td>
                  <td className="text-[11.5px] text-muted">{item.createdBy || '—'}</td>
                  <td className="text-[11px] text-faint">{formatDateTime(item.createdAt)}</td>
                  <td className="text-[11px] text-faint">
                    {item.lastUsedAt ? relativeTime(item.lastUsedAt) : '尚未使用'}
                  </td>
                  <td>
                    {item.revokedAt ? (
                      <Badge tone="neutral">已吊销</Badge>
                    ) : (
                      <Badge tone="green" dot>
                        有效
                      </Badge>
                    )}
                  </td>
                  <td className="text-right">
                    {!item.revokedAt ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={<Trash2 size={11} />}
                        className="text-danger hover:bg-danger-soft"
                        onClick={() => setRevokeTarget(item)}
                      >
                        吊销
                      </Button>
                    ) : (
                      <span className="text-[10.5px] text-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!data ? (
                <tr>
                  <td colSpan={7}>
                    <Skeleton className="h-8 w-full" />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-5 py-3 text-[10.5px] leading-4 text-faint">
          完整密钥只在创建时展示一次，服务端只保存 SHA-256 摘要。演示密钥见 <code>data/seed-credentials.txt</code>。
        </div>
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="创建接入密钥"
        description="为客户端或联调环境创建一枚新密钥。"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button size="sm" icon={<KeyRound size={13} />} loading={busy} onClick={() => void create()}>
              创建密钥
            </Button>
          </>
        }
      >
        <Field label="密钥名称" hint="例如：Android 客户端 · 内测">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="客户端密钥" autoFocus />
        </Field>
      </Modal>

      <Modal
        open={Boolean(secret)}
        onClose={() => setSecret(null)}
        title="密钥已创建"
        description="这是唯一一次展示完整密钥，请立即保存。"
        footer={
          <Button size="sm" onClick={() => setSecret(null)}>
            我已保存
          </Button>
        }
      >
        <div className="rounded-xl border border-line bg-surface-2 p-4">
          <code className="block break-all font-mono text-[12px] text-ink">{secret}</code>
        </div>
        <Button
          className="mt-3 w-full"
          variant="outline"
          icon={copied ? <Check size={13} /> : <Copy size={13} />}
          onClick={() => {
            if (!secret) return
            void navigator.clipboard.writeText(secret)
            setCopied(true)
          }}
        >
          {copied ? '已复制' : '复制密钥'}
        </Button>
      </Modal>

      <Modal
        open={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        title="吊销密钥"
        description="吊销后使用该密钥的客户端将无法上报，直到换用新密钥。"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setRevokeTarget(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={busy}
              onClick={async () => {
                if (!revokeTarget) return
                setBusy(true)
                try {
                  await post(`/api/keys/${revokeTarget.id}/revoke`)
                  toast('密钥已吊销', 'success')
                  setRevokeTarget(null)
                  reload()
                } catch (error) {
                  toast(errorMessage(error), 'error')
                } finally {
                  setBusy(false)
                }
              }}
            >
              确认吊销
            </Button>
          </>
        }
      >
        <div className="rounded-xl border border-line bg-surface-2 p-3.5 text-[12px]">
          {revokeTarget?.name} · <code className="font-mono">{revokeTarget?.prefix}</code>
        </div>
      </Modal>
    </div>
  )
}

function DemoSection(): React.JSX.Element {
  const { toast } = useToast()
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const reset = async (): Promise<void> => {
    setBusy(true)
    try {
      await post('/api/system/reset-demo', { confirm })
      toast('演示数据已重建，正在跳转到登录页…', 'success')
      window.setTimeout(() => {
        window.location.href = '/login'
      }, 1200)
    } catch (error) {
      toast(errorMessage(error), 'error')
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3 xl:grid-cols-12">
      <Card className="border-danger/25 xl:col-span-7">
        <CardHeader
          title="重建演示数据"
          description="重新生成 320 台设备、30 天遥测、52 条反馈与 3 个配置修订"
          action={<Badge tone="red">危险操作</Badge>}
        />
        <div className="p-5 pt-3">
          <div className="flex items-start gap-2.5 rounded-xl border border-danger/20 bg-danger-soft/60 p-3.5">
            <TriangleExclamationPoint size={16} className="mt-0.5 shrink-0 text-danger" />
            <div className="text-[11.5px] leading-5 text-ink">
              该操作会清空当前数据库中的设备、事件、反馈、配置与账号，并用固定的随机种子重新生成演示数据。
              所有登录会话会立即失效，需要重新登录。
            </div>
          </div>
          <div className="mt-4 max-w-[360px]">
            <Field label="输入 RESET 确认">
              <Input
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="RESET"
                className="font-mono"
              />
            </Field>
          </div>
          <Button
            className="mt-4"
            variant="danger"
            size="sm"
            disabled={confirm !== 'RESET'}
            loading={busy}
            onClick={() => void reset()}
          >
            重建演示数据
          </Button>
        </div>
      </Card>

      <Card className="xl:col-span-5">
        <CardHeader title="重置后会发生什么" />
        <ul className="space-y-2.5 px-5 pb-5 pt-2 text-[11.5px] leading-5 text-muted">
          <li>· 演示账号恢复为 admin / STB-admin-2026。</li>
          <li>· 客户端上报密钥会重新生成，旧密钥立即失效。</li>
          <li>· 云端配置回到「1.1.0 发布」修订，草稿带 2 项未发布修改。</li>
          <li>· 适合演示前恢复干净状态；正式部署请勿使用。</li>
        </ul>
      </Card>
    </div>
  )
}

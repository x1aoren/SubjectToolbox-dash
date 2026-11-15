import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, KeyRound, Pencil, Plus, Search, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'
import { del, patch, post } from '../lib/api'
import { errorMessage, useAuth, useToast } from '../lib/app-context'
import { useApi, useDebounced } from '../lib/useApi'
import {
  ROLE_TONE,
  formatDateTime,
  formatNumber,
  relativeTime,
} from '../lib/format'
import type { RoleDefinition, TeamUser } from '../lib/types'
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  SearchInput,
  Select,
  Skeleton,
  Switch,
  cn,
} from '../components/ui'

interface UserListResponse {
  items: TeamUser[]
  roles: RoleDefinition[]
}

export function TeamPage(): React.JSX.Element {
  const { user: currentUser, can } = useAuth()
  const { toast } = useToast()
  const [q, setQ] = useState('')
  const debouncedQ = useDebounced(q, 250)
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<TeamUser | null>(null)
  const [resetTarget, setResetTarget] = useState<TeamUser | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TeamUser | null>(null)
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const { data, loading, error, reload } = useApi<UserListResponse>(
    `/api/users?q=${encodeURIComponent(debouncedQ)}&role=${role}&status=${status}`,
  )
  const canManage = can('users.manage')
  const isOwner = currentUser?.role === 'owner'
  const roles = data?.roles ?? []

  const stats = useMemo(() => {
    const items = data?.items ?? []
    return {
      total: items.length,
      active: items.filter((item) => item.status === 'active').length,
      openFeedback: items.reduce((sum, item) => sum + item.openFeedback, 0),
    }
  }, [data])

  const toggleStatus = async (target: TeamUser): Promise<void> => {
    setBusy(true)
    try {
      await patch(`/api/users/${target.id}`, { status: target.status === 'active' ? 'disabled' : 'active' })
      toast(target.status === 'active' ? '账号已停用' : '账号已启用', 'success')
      reload()
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.02em] text-ink">成员</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            共 {formatNumber(stats.total)} 个账号 · {formatNumber(stats.active)} 个启用 · 账号仅用于控制台登录
          </p>
        </div>
        {canManage ? (
          <Button size="sm" icon={<UserPlus size={13} />} onClick={() => setCreateOpen(true)}>
            创建账号
          </Button>
        ) : null}
      </div>

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="搜索姓名、用户名或邮箱" className="w-full sm:w-[250px]" />
          <Select value={role} onChange={(event) => setRole(event.target.value)} className="w-[132px]">
            <option value="">全部角色</option>
            {roles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(event) => setStatus(event.target.value)} className="w-[120px]">
            <option value="">全部状态</option>
            <option value="active">已启用</option>
            <option value="disabled">已停用</option>
          </Select>
          <span className="ml-auto hidden text-[11px] text-faint sm:block">
            当前账号：{currentUser?.displayName}（{currentUser?.roleName}）
          </span>
        </div>
      </Card>

      {error ? (
        <Card>
          <EmptyState title="成员列表加载失败" description={error.message} action={<Button variant="outline" onClick={reload}>重新加载</Button>} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table min-w-[980px]">
              <thead>
                <tr>
                  <th>成员</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th className="text-right" title="办理中 / 累计负责">负责反馈 <span className="font-normal">(进行/累计)</span></th>
                  <th>最近登录</th>
                  <th>创建时间</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {(data?.items ?? []).map((member) => {
                  const isSelf = member.id === currentUser?.id
                  return (
                    <tr key={member.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={member.displayName} color={member.avatarColor} size={32} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[12.5px] font-medium text-ink">{member.displayName}</span>
                              {isSelf ? <Badge tone="brand">我</Badge> : null}
                            </div>
                            <div className="text-[10.5px] text-faint">
                              @{member.username}
                              {member.email ? ` · ${member.email}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone={ROLE_TONE[member.role] ?? 'neutral'}>{member.roleName}</Badge>
                      </td>
                      <td>
                        <Badge tone={member.status === 'active' ? 'green' : 'neutral'} dot>
                          {member.status === 'active' ? '已启用' : '已停用'}
                        </Badge>
                      </td>
                      <td className="num text-right text-[12px] text-ink">
                        {member.openFeedback > 0 ? member.openFeedback : '—'}
                        <span className="ml-1 text-[10px] text-faint">/ {member.assignedFeedback}</span>
                      </td>
                      <td className="text-[11.5px] text-muted">
                        {member.lastLoginAt ? relativeTime(member.lastLoginAt) : '从未登录'}
                      </td>
                      <td className="text-[11px] text-faint">{formatDateTime(member.createdAt)}</td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          {canManage ? (
                            <>
                              <Button
                                variant="ghost"
                                size="xs"
                                icon={<Pencil size={11} />}
                                onClick={() => setEditTarget(member)}
                              >
                                编辑
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                icon={<KeyRound size={11} />}
                                onClick={() => setResetTarget(member)}
                              >
                                重置
                              </Button>
                              {isSelf ? null : (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    disabled={busy}
                                    onClick={() => void toggleStatus(member)}
                                    className={member.status === 'active' ? 'text-warn' : 'text-positive'}
                                  >
                                    {member.status === 'active' ? '停用' : '启用'}
                                  </Button>
                                  {isOwner && member.role !== 'owner' ? (
                                    <Button
                                      variant="ghost"
                                      size="xs"
                                      icon={<Trash2 size={11} />}
                                      className="text-danger hover:bg-danger-soft"
                                      onClick={() => setDeleteTarget(member)}
                                    >
                                      删除
                                    </Button>
                                  ) : null}
                                </>
                              )}
                            </>
                          ) : (
                            <span className="text-[10.5px] text-faint">只读</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {loading && !data
                  ? Array.from({ length: 5 }, (_, index) => (
                      <tr key={index}>
                        <td colSpan={7}>
                          <Skeleton className="h-8 w-full" />
                        </td>
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
          </div>
          {(data?.items.length ?? 0) === 0 ? (
            <EmptyState icon={<Users size={18} />} title="没有匹配的成员" description="换个关键词或清空筛选条件。" />
          ) : null}
        </Card>
      )}

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        roles={roles}
        onCreated={(username, password) => {
          setCreateOpen(false)
          setCredentials({ username, password })
          reload()
        }}
      />
      <EditUserModal
        target={editTarget}
        roles={roles}
        currentUser={currentUser}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          setEditTarget(null)
          reload()
        }}
      />
      <ResetPasswordModal
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onDone={() => {
          setResetTarget(null)
          reload()
        }}
      />
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="删除账号"
        description="删除后该账号会立即失去访问权限，历史操作记录仍会保留。"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 size={12} />}
              loading={busy}
              onClick={async () => {
                if (!deleteTarget) return
                setBusy(true)
                try {
                  await del(`/api/users/${deleteTarget.id}`)
                  toast('账号已删除', 'success')
                  setDeleteTarget(null)
                  reload()
                } catch (error) {
                  toast(errorMessage(error), 'error')
                } finally {
                  setBusy(false)
                }
              }}
            >
              确认删除
            </Button>
          </>
        }
      >
        {deleteTarget ? (
          <div className="rounded-xl border border-line bg-surface-2 p-3.5 text-[12px]">
            将删除 <span className="font-medium text-ink">{deleteTarget.displayName}</span>（@
            {deleteTarget.username}）· {deleteTarget.roleName}
          </div>
        ) : null}
      </Modal>

      <CredentialsModal
        credentials={credentials}
        onClose={() => setCredentials(null)}
      />

      <div className="mt-3 flex items-center gap-2 text-[10.5px] text-faint">
        <ShieldCheck size={12} />
        控制台账号与 STB 客户端无关：客户端仍然完全离线，不提供学生账号体系。
      </div>
    </div>
  )
}

function CreateUserModal({
  open,
  onClose,
  roles,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  roles: RoleDefinition[]
  onCreated: (username: string, password: string) => void
}): React.JSX.Element {
  const { toast } = useToast()
  const [form, setForm] = useState({ username: '', displayName: '', email: '', role: 'operator', password: '' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm({ username: '', displayName: '', email: '', role: 'operator', password: '' })
      setError(null)
    }
  }, [open])

  const submit = async (): Promise<void> => {
    setCreating(true)
    setError(null)
    try {
      const result = await post<{ initialPassword: string }>('/api/users', {
        username: form.username,
        displayName: form.displayName,
        email: form.email,
        role: form.role,
        password: form.password || undefined,
      })
      toast('账号已创建', 'success')
      onCreated(form.username, result.initialPassword)
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="创建账号"
      description="账号用于登录控制台；初始密码只会展示一次。"
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={creating}>
            取消
          </Button>
          <Button
            size="sm"
            icon={<Plus size={13} />}
            loading={creating}
            disabled={!form.username || !form.displayName}
            onClick={() => void submit()}
          >
            创建账号
          </Button>
        </>
      }
    >
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="用户名" required hint="3–24 位小写字母、数字或 . _ -">
          <Input
            value={form.username}
            onChange={(event) => setForm({ ...form, username: event.target.value })}
            placeholder="例如 zhangwei"
            className="font-mono"
            autoFocus
          />
        </Field>
        <Field label="显示姓名" required>
          <Input
            value={form.displayName}
            onChange={(event) => setForm({ ...form, displayName: event.target.value })}
            placeholder="例如 张伟"
          />
        </Field>
        <Field label="邮箱" hint="可选，用于标识成员">
          <Input
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="name@stb.edu.cn"
          />
        </Field>
        <Field label="角色" required hint={roles.find((item) => item.id === form.role)?.description}>
          <Select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
            {roles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="初始密码" className="sm:col-span-2" hint="留空自动生成 14 位随机密码；成员首次登录后应尽快修改">
          <Input
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            placeholder="留空自动生成"
            className="font-mono"
          />
        </Field>
      </div>
      {error ? (
        <div className="mt-3 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-[12px] text-danger">
          {error}
        </div>
      ) : null}
    </Modal>
  )
}

function EditUserModal({
  target,
  roles,
  currentUser,
  onClose,
  onSaved,
}: {
  target: TeamUser | null
  roles: RoleDefinition[]
  currentUser: { id: string; role: string } | null
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const { toast } = useToast()
  const [form, setForm] = useState({ displayName: '', email: '', role: '', status: 'active' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (target) {
      setForm({
        displayName: target.displayName,
        email: target.email,
        role: target.role,
        status: target.status,
      })
      setError(null)
    }
  }, [target])

  const isSelf = target?.id === currentUser?.id
  const submit = async (): Promise<void> => {
    if (!target) return
    setSaving(true)
    setError(null)
    try {
      await patch(`/api/users/${target.id}`, form)
      toast('成员信息已更新', 'success')
      onSaved()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={target ? `编辑 ${target.displayName}` : '编辑成员'}
      description={target ? `@${target.username} · 创建于 ${formatDateTime(target.createdAt)}` : undefined}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" loading={saving} onClick={() => void submit()}>
            保存修改
          </Button>
        </>
      }
    >
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="显示姓名" required>
          <Input
            value={form.displayName}
            onChange={(event) => setForm({ ...form, displayName: event.target.value })}
          />
        </Field>
        <Field label="邮箱">
          <Input
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="name@stb.edu.cn"
          />
        </Field>
        <Field label="角色" hint={isSelf ? '不能修改自己的角色' : roles.find((item) => item.id === form.role)?.description}>
          <Select
            value={form.role}
            disabled={isSelf || (target?.role === 'owner' && currentUser?.role !== 'owner')}
            onChange={(event) => setForm({ ...form, role: event.target.value })}
          >
            {roles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="账号状态" hint={isSelf ? '不能停用自己的账号' : '停用后该账号的会话会被立即清理'}>
          <div className="flex h-9 items-center gap-2">
            <Switch
              checked={form.status === 'active'}
              disabled={isSelf}
              label="账号状态"
              onChange={(checked) => setForm({ ...form, status: checked ? 'active' : 'disabled' })}
            />
            <span className="text-[12px] text-ink">{form.status === 'active' ? '已启用' : '已停用'}</span>
          </div>
        </Field>
      </div>
      {error ? (
        <div className="mt-3 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-[12px] text-danger">
          {error}
        </div>
      ) : null}
    </Modal>
  )
}

function ResetPasswordModal({
  target,
  onClose,
  onDone,
}: {
  target: TeamUser | null
  onClose: () => void
  onDone: () => void
}): React.JSX.Element {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (target) {
      setPassword(null)
      setCopied(false)
      setError(null)
    }
  }, [target])

  const reset = async (): Promise<void> => {
    if (!target) return
    setBusy(true)
    setError(null)
    try {
      const result = await post<{ password: string }>(`/api/users/${target.id}/password`, {})
      setPassword(result.password)
      toast('密码已重置，旧会话已失效', 'success')
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title="重置密码"
      description={target ? `为 ${target.displayName}（@${target.username}）生成新的初始密码。` : undefined}
      footer={
        password ? (
          <Button size="sm" onClick={onDone}>
            完成
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button size="sm" icon={<KeyRound size={13} />} loading={busy} onClick={() => void reset()}>
              生成新密码
            </Button>
          </>
        )
      }
    >
      {password ? (
        <div>
          <div className="rounded-xl border border-line bg-surface-2 p-4 text-center">
            <div className="text-[11px] text-faint">新密码只展示一次，请立即复制发给成员</div>
            <div className="mt-2 flex items-center justify-center gap-2">
              <code className="rounded-lg bg-surface px-3 py-1.5 font-mono text-[15px] tracking-wide text-ink">
                {password}
              </code>
              <Button
                variant="outline"
                size="sm"
                icon={copied ? <Check size={12} /> : <Copy size={12} />}
                onClick={() => {
                  void navigator.clipboard.writeText(password)
                  setCopied(true)
                }}
              >
                {copied ? '已复制' : '复制'}
              </Button>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-muted">
            该成员的所有登录会话已失效，下次登录需要使用新密码。
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface-2 p-4 text-[12px] leading-6 text-muted">
          重置后旧密码立即失效，所有登录会话会被清理。建议引导成员登录后在「设置 → 安全」里修改密码。
        </div>
      )}
      {error ? (
        <div className="mt-3 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-[12px] text-danger">
          {error}
        </div>
      ) : null}
    </Modal>
  )
}

function CredentialsModal({
  credentials,
  onClose,
}: {
  credentials: { username: string; password: string } | null
  onClose: () => void
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  useEffect(() => setCopied(false), [credentials])
  return (
    <Modal
      open={Boolean(credentials)}
      onClose={onClose}
      title="账号创建成功"
      description="初始密码只展示这一次，请复制后发给成员。"
      footer={
        <Button size="sm" onClick={onClose}>
          我知道了
        </Button>
      }
    >
      <div className="rounded-xl border border-line bg-surface-2 p-4">
        <div className="grid gap-2 text-[12px]">
          <div className="flex items-center justify-between">
            <span className="text-faint">用户名</span>
            <code className="font-mono text-ink">{credentials?.username}</code>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-faint">初始密码</span>
            <code className="font-mono text-ink">{credentials?.password}</code>
          </div>
        </div>
      </div>
      <Button
        className="mt-3 w-full"
        variant="outline"
        icon={copied ? <Check size={13} /> : <Copy size={13} />}
        onClick={() => {
          if (!credentials) return
          void navigator.clipboard.writeText(`用户名：${credentials.username}\n初始密码：${credentials.password}`)
          setCopied(true)
        }}
      >
        {copied ? '已复制账号信息' : '复制账号信息'}
      </Button>
      <p className="mt-3 text-[10.5px] leading-5 text-faint">
        首次登录后建议让成员在「设置 → 安全」中修改密码；管理员也可以在成员列表里重置。
      </p>
    </Modal>
  )
}

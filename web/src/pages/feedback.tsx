import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Inbox,
  MessageSquare,
  Monitor,
  RefreshCw,
  Send,
  Tag,
  UserRound,
} from 'lucide-react'
import { patch, post } from '../lib/api'
import { errorMessage, useAuth, useToast } from '../lib/app-context'
import { useApi, useDebounced } from '../lib/useApi'
import {
  CHANNEL_LABELS,
  FEEDBACK_PRIORITY,
  FEEDBACK_STATUS,
  FEEDBACK_TYPE,
  formatDateTime,
  formatNumber,
  relativeTime,
  toneStyle,
} from '../lib/format'
import type {
  FeedbackDetailResponse,
  FeedbackListResponse,
  FeedbackStats,
  StaffMember,
} from '../lib/types'
import {
  Avatar,
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  Input,
  Modal,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
  Tabs,
  Textarea,
  cn,
} from '../components/ui'

const STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'in_progress', label: '处理中' },
  { key: 'resolved', label: '已解决' },
  { key: 'closed', label: '已关闭' },
]

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: string
  hint: string
  accent: string
}): React.JSX.Element {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="kpi-label">{label}</span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
      </div>
      <div className="num mt-2 text-[24px] font-semibold tracking-tight text-ink">{value}</div>
      <div className="mt-0.5 text-[11px] text-faint">{hint}</div>
    </Card>
  )
}

export function FeedbackPage(): React.JSX.Element {
  const [searchParams] = useSearchParams()
  const { can } = useAuth()
  const { toast } = useToast()
  const [status, setStatus] = useState(searchParams.get('status') ?? 'all')
  const [q, setQ] = useState(searchParams.get('q') ?? '')
  const debouncedQ = useDebounced(q, 300)
  const [type, setType] = useState('')
  const [priority, setPriority] = useState('')
  const [assignee, setAssignee] = useState('')
  const [sort, setSort] = useState('inbox')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [internal, setInternal] = useState(false)
  const [sending, setSending] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [tagOpen, setTagOpen] = useState(false)
  const [tagText, setTagText] = useState('')

  const list = useApi<FeedbackListResponse>(
    `/api/feedback?status=${status}&type=${type}&priority=${priority}&assignee=${assignee}&sort=${sort}&q=${encodeURIComponent(debouncedQ)}&page=${page}&pageSize=15`,
  )
  const stats = useApi<FeedbackStats>('/api/feedback/stats')
  const detail = useApi<FeedbackDetailResponse>(
    selected ? `/api/feedback/${encodeURIComponent(selected)}` : null,
  )

  useEffect(() => {
    setPage(1)
  }, [status, debouncedQ, type, priority, assignee, sort])

  const counts = stats.data?.byStatus ?? {}
  const staff: StaffMember[] = list.data?.staff ?? []
  const feedback = detail.data?.feedback
  const messages = detail.data?.messages ?? []
  const canReply = can('feedback.reply')
  const canManage = can('feedback.manage')

  const unassigned = useMemo(
    () => staff.find((member) => member.id === feedback?.assigneeId),
    [staff, feedback?.assigneeId],
  )

  const refreshAll = (): void => {
    list.reload()
    stats.reload()
    if (selected) detail.reload()
  }

  const openFeedback = (id: string): void => {
    setSelected(id)
    setReply('')
    setInternal(false)
  }

  const updateField = async (body: Record<string, unknown>, message: string): Promise<void> => {
    if (!selected) return
    setUpdating(true)
    try {
      await patch(`/api/feedback/${selected}`, body)
      toast(message, 'success')
      refreshAll()
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setUpdating(false)
    }
  }

  const sendReply = async (): Promise<void> => {
    if (!selected || !reply.trim()) return
    setSending(true)
    try {
      await post(`/api/feedback/${selected}/replies`, { body: reply.trim(), internal })
      setReply('')
      toast(internal ? '内部备注已保存' : '回复已发送', 'success')
      refreshAll()
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.02em] text-ink">反馈收件箱</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            共 {formatNumber(stats.data?.total ?? 0)} 条反馈 · 未解决 {formatNumber(stats.data?.unresolved ?? 0)} 条
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={<RefreshCw size={13} />} onClick={refreshAll} loading={list.loading}>
            刷新
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="待处理"
          value={formatNumber(counts.pending ?? 0)}
          hint="等待首次响应"
          accent="var(--warn)"
        />
        <StatCard
          label="处理中"
          value={formatNumber(counts.in_progress ?? 0)}
          hint="已回复，等待确认"
          accent="var(--info)"
        />
        <StatCard
          label="本周新增"
          value={formatNumber(stats.data?.newThisWeek ?? 0)}
          hint="用户新提交的反馈"
          accent="var(--brand)"
        />
        <StatCard
          label="平均首响"
          value={stats.data?.avgResponseHours ? `${stats.data.avgResponseHours} 小时` : '—'}
          hint="首次公开回复耗时"
          accent="var(--violet)"
        />
      </div>

      <Card className="mt-3 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 pt-1">
          <Tabs
            items={STATUS_TABS.map((tab) => ({
              key: tab.key,
              label: tab.label,
              count:
                tab.key === 'all'
                  ? stats.data?.total
                  : counts[tab.key] ?? 0,
            }))}
            value={status}
            onChange={setStatus}
            className="border-0"
          />
          <span className="ml-auto pb-1 text-[11px] text-faint">
            待处理 + 处理中 = {formatNumber(stats.data?.unresolved ?? 0)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2/60 px-3 py-2.5">
          <SearchInput value={q} onChange={setQ} placeholder="搜索标题、内容或联系方式" className="w-full sm:w-[250px]" />
          <Select value={type} onChange={(event) => setType(event.target.value)} className="w-[118px]">
            <option value="">全部类型</option>
            {Object.entries(FEEDBACK_TYPE).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </Select>
          <Select value={priority} onChange={(event) => setPriority(event.target.value)} className="w-[112px]">
            <option value="">全部优先级</option>
            {Object.entries(FEEDBACK_PRIORITY).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </Select>
          <Select value={assignee} onChange={(event) => setAssignee(event.target.value)} className="w-[124px]">
            <option value="">全部负责人</option>
            <option value="me">我负责的</option>
            <option value="unassigned">未指派</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
          <Select value={sort} onChange={(event) => setSort(event.target.value)} className="w-[124px]">
            <option value="inbox">收件箱排序</option>
            <option value="newest">最新提交</option>
            <option value="oldest">最早提交</option>
            <option value="priority">按优先级</option>
            <option value="updated">最近更新</option>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="table table-clickable min-w-[1000px]">
            <thead>
              <tr>
                <th>反馈</th>
                <th>类型</th>
                <th>设备</th>
                <th>版本</th>
                <th>优先级</th>
                <th>状态</th>
                <th>负责人</th>
                <th>最近更新</th>
                <th className="text-right">消息</th>
              </tr>
            </thead>
            <tbody>
              {(list.data?.items ?? []).map((item) => {
                const typeStyle = FEEDBACK_TYPE[item.type] ?? FEEDBACK_TYPE.other!
                const statusStyle = FEEDBACK_STATUS[item.status] ?? FEEDBACK_STATUS.pending!
                const priorityStyle = FEEDBACK_PRIORITY[item.priority] ?? FEEDBACK_PRIORITY.normal!
                return (
                  <tr key={item.id} onClick={() => openFeedback(item.id)}>
                    <td className="max-w-[360px]">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-medium text-ink">{item.title}</span>
                        {item.priority === 'urgent' ? <Badge tone="red">紧急</Badge> : null}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-faint">
                        <span className="font-mono">#{item.number}</span>
                        <span>·</span>
                        <span className="truncate">{item.excerpt}</span>
                      </div>
                      {item.tags.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {item.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded bg-surface-3 px-1.5 py-0.5 text-[9.5px] text-muted">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <Badge tone={typeStyle.tone}>{typeStyle.label}</Badge>
                    </td>
                    <td>
                      <div className="text-[11.5px] text-ink">{item.device?.model || '—'}</div>
                      <div className="text-[10px] text-faint">
                        {item.device?.grade || ''} {item.device?.school || ''}
                      </div>
                    </td>
                    <td className="num text-[11.5px] text-muted">{item.appVersion ?? '—'}</td>
                    <td>
                      <Badge tone={priorityStyle.tone}>{priorityStyle.label}</Badge>
                    </td>
                    <td>
                      <Badge tone={statusStyle.tone} dot>
                        {statusStyle.label}
                      </Badge>
                    </td>
                    <td className="text-[11.5px] text-muted">{item.assigneeName ?? '未指派'}</td>
                    <td className="text-[11px] text-muted">{relativeTime(item.updatedAt)}</td>
                    <td className="num text-right text-[11.5px] text-muted">{item.messageCount}</td>
                  </tr>
                )
              })}
              {list.loading && !list.data
                ? Array.from({ length: 8 }, (_, index) => (
                    <tr key={index}>
                      <td colSpan={9}>
                        <Skeleton className="h-7 w-full" />
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>

        {!list.loading && (list.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Inbox size={18} />}
            title="这个筛选条件下没有反馈"
            description="试试切换状态标签，或清空搜索条件。"
          />
        ) : null}

        {list.data ? (
          <Pagination page={list.data.page} pageCount={list.data.pageCount} total={list.data.total} onChange={setPage} />
        ) : null}
      </Card>

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        width={680}
        title={feedback?.title ?? '反馈详情'}
        subtitle={
          feedback
            ? `#${feedback.number} · ${formatDateTime(feedback.createdAt)} · ${feedback.device?.model ?? '未知设备'}`
            : '加载中'
        }
        footer={
          canReply ? (
            <div className="px-4 py-3">
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInternal(false)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] transition',
                    !internal ? 'bg-brand-soft text-brand-strong' : 'text-muted hover:bg-surface-3',
                  )}
                >
                  回复用户
                </button>
                <button
                  type="button"
                  onClick={() => setInternal(true)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] transition',
                    internal ? 'bg-warn-soft text-warn' : 'text-muted hover:bg-surface-3',
                  )}
                >
                  内部备注
                </button>
                <span className="ml-auto text-[10px] text-faint">
                  {internal ? '仅控制台成员可见' : '会同步到客户端反馈详情'}
                </span>
              </div>
              <div className="flex items-end gap-2">
                <Textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder={internal ? '记录排查结论、待办或与用户沟通的要点…' : '回复这位同学…'}
                  rows={2}
                  maxLength={2000}
                  className={internal ? 'border-warn/30 bg-warn-soft/30' : ''}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault()
                      void sendReply()
                    }
                  }}
                />
                <Button
                  onClick={() => void sendReply()}
                  loading={sending}
                  disabled={!reply.trim()}
                  icon={<Send size={13} />}
                  className="mb-0.5"
                >
                  {internal ? '保存备注' : '发送'}
                </Button>
              </div>
              <div className="mt-1 text-[10px] text-faint">⌘ / Ctrl + Enter 快速发送</div>
            </div>
          ) : (
            <div className="px-4 py-3 text-[11.5px] text-faint">当前角色只能查看反馈，不能回复或添加备注。</div>
          )
        }
      >
        {detail.loading && !detail.data ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : feedback ? (
          <div className="p-5">
            {/* 元信息 */}
            <div className="rounded-xl border border-line bg-surface-2/70 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={(FEEDBACK_TYPE[feedback.type] ?? FEEDBACK_TYPE.other!).tone}>
                  {(FEEDBACK_TYPE[feedback.type] ?? FEEDBACK_TYPE.other!).label}
                </Badge>
                {feedback.toolTitle ? <Badge tone="neutral">{feedback.toolTitle}</Badge> : null}
                <Badge tone="neutral">v{feedback.appVersion ?? '未知'}</Badge>
                <Badge tone="neutral">{CHANNEL_LABELS[feedback.channel ?? ''] ?? feedback.channel}</Badge>
                {feedback.contact ? (
                  <span className="text-[10.5px] text-faint">联系方式：{feedback.contact}</span>
                ) : null}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div>
                  <div className="mb-1 text-[10px] text-faint">状态</div>
                  {canManage ? (
                    <Select
                      value={feedback.status}
                      disabled={updating}
                      onChange={(event) => void updateField({ status: event.target.value }, '状态已更新')}
                      className="h-8 text-[12px]"
                    >
                      {Object.entries(FEEDBACK_STATUS).map(([key, value]) => (
                        <option key={key} value={key}>
                          {value.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge tone={(FEEDBACK_STATUS[feedback.status] ?? FEEDBACK_STATUS.pending!).tone}>
                      {(FEEDBACK_STATUS[feedback.status] ?? FEEDBACK_STATUS.pending!).label}
                    </Badge>
                  )}
                </div>
                <div>
                  <div className="mb-1 text-[10px] text-faint">优先级</div>
                  {canManage ? (
                    <Select
                      value={feedback.priority}
                      disabled={updating}
                      onChange={(event) => void updateField({ priority: event.target.value }, '优先级已更新')}
                      className="h-8 text-[12px]"
                    >
                      {Object.entries(FEEDBACK_PRIORITY).map(([key, value]) => (
                        <option key={key} value={key}>
                          {value.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge tone={(FEEDBACK_PRIORITY[feedback.priority] ?? FEEDBACK_PRIORITY.normal!).tone}>
                      {(FEEDBACK_PRIORITY[feedback.priority] ?? FEEDBACK_PRIORITY.normal!).label}
                    </Badge>
                  )}
                </div>
                <div>
                  <div className="mb-1 text-[10px] text-faint">负责人</div>
                  {canManage ? (
                    <Select
                      value={feedback.assigneeId ?? ''}
                      disabled={updating}
                      onChange={(event) =>
                        void updateField({ assigneeId: event.target.value || null }, '负责人已更新')
                      }
                      className="h-8 text-[12px]"
                    >
                      <option value="">未指派</option>
                      {staff.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <span className="text-[12px] text-ink">{unassigned?.name ?? '未指派'}</span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Tag size={11} className="text-faint" />
                {feedback.tags.length === 0 ? (
                  <span className="text-[10.5px] text-faint">暂无标签</span>
                ) : (
                  feedback.tags.map((tag) => (
                    <span key={tag} className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted">
                      {tag}
                    </span>
                  ))
                )}
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTagText(feedback.tags.join('，'))
                      setTagOpen(true)
                    }}
                    className="ml-1 text-[10.5px] text-brand hover:text-brand-strong"
                  >
                    编辑
                  </button>
                ) : null}
              </div>

              {feedback.device ? (
                <div className="mt-3 flex items-center gap-2 border-t border-line/70 pt-2.5">
                  <Monitor size={12} className="text-faint" />
                  <Link
                    to={`/telemetry/devices/${encodeURIComponent(feedback.device.sn)}`}
                    className="text-[11px] text-muted transition hover:text-brand"
                  >
                    {feedback.device.model} · {feedback.device.school} {feedback.device.grade}
                  </Link>
                  <span className="ml-auto font-mono text-[9.5px] text-faint">{feedback.device.sn}</span>
                </div>
              ) : null}
            </div>

            {/* 对话 */}
            <div className="mt-5">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-faint">
                <MessageSquare size={12} />
                对话记录
                <span className="text-[10px] normal-case tracking-normal text-faint">（{messages.length} 条）</span>
              </div>
              <div className="space-y-3.5">
                {messages.map((message) => {
                  if (message.authorType === 'system') {
                    return (
                      <div key={message.id} className="flex justify-center">
                        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[10px] text-faint">
                          {message.body} · {relativeTime(message.createdAt)}
                        </span>
                      </div>
                    )
                  }
                  const isStaff = message.authorType === 'staff'
                  const isInternal = message.internal
                  return (
                    <div
                      key={message.id}
                      className={cn('flex gap-2.5', isStaff && !isInternal ? 'flex-row-reverse' : '')}
                    >
                      <Avatar
                        name={message.authorName}
                        color={message.authorColor ?? (isStaff ? '#3F6E5A' : '#546E7A')}
                        size={28}
                      />
                      <div className={cn('min-w-0 max-w-[86%]', isStaff && !isInternal ? 'items-end text-right' : '')}>
                        <div
                          className={cn(
                            'mb-1 flex items-center gap-2 text-[10.5px]',
                            isStaff && !isInternal ? 'justify-end' : '',
                          )}
                        >
                          <span className="font-medium text-ink">{message.authorName}</span>
                          {isInternal ? (
                            <span className="rounded bg-warn-soft px-1 py-0.5 text-[9px] text-warn">内部备注</span>
                          ) : null}
                          <span className="text-faint" title={formatDateTime(message.createdAt)}>
                            {relativeTime(message.createdAt)}
                          </span>
                        </div>
                        <div
                          className={cn(
                            'whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-left text-[12.5px] leading-6',
                            isInternal
                              ? 'border border-dashed border-warn/35 bg-warn-soft/40 text-ink'
                              : isStaff
                                ? 'bg-brand-soft text-ink'
                                : 'border border-line bg-surface-2 text-ink',
                          )}
                        >
                          {message.body}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[10.5px] text-faint">
              <UserRound size={12} />
              用户侧只能看到公开回复；内部备注不会同步到客户端。
            </div>
          </div>
        ) : (
          <EmptyState title="反馈详情加载失败" description="请关闭抽屉后重试。" />
        )}
      </Drawer>

      <Modal
        open={tagOpen}
        onClose={() => setTagOpen(false)}
        title="编辑标签"
        description="用逗号或空格分隔，最多 8 个，方便后续筛选。"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setTagOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              loading={updating}
              onClick={() => {
                const tags = tagText
                  .split(/[，,\s]+/)
                  .map((tag) => tag.trim())
                  .filter(Boolean)
                void updateField({ tags }, '标签已更新').then(() => setTagOpen(false))
              }}
            >
              保存标签
            </Button>
          </>
        }
      >
        <Input
          value={tagText}
          onChange={(event) => setTagText(event.target.value)}
          placeholder="例如：函数编辑器，性能，1.2.0"
          autoFocus
        />
      </Modal>

      <div className="mt-3 flex items-center justify-between text-[10.5px] text-faint">
        <span>
          反馈来自客户端「设置 → 意见反馈」，设备 SN 用于定位问题，不包含学生姓名。
        </span>
        <span className="flex items-center gap-1.5" style={{ color: toneStyle('neutral').color }}>
          <span className="h-1.5 w-1.5 rounded-full bg-positive" />
          自动回复未启用
        </span>
      </div>
    </div>
  )
}

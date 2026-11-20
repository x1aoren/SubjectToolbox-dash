import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ChevronLeft,
  Copy,
  Inbox,
  Power,
  RotateCcw,
  Tablet,
  TriangleExclamationPoint,
} from 'lucide-react'
import { del, put } from '../lib/api'
import { useAuth, useCatalog, useToast } from '../lib/app-context'
import { useApi, useInterval } from '../lib/useApi'
import {
  CHANNEL_LABELS,
  DEVICE_STATUS,
  FEEDBACK_STATUS,
  SUBJECT_COLORS,
  TOOL_KIND_META,
  eventLabel,
  formatDateTime,
  formatDateTimeSeconds,
  formatNumber,
  formatRelative,
  relativeTime,
} from '../lib/format'
import type { ConfigPreview, DeviceDetailResponse, DeviceOverrideResponse, DeviceOverrideTool } from '../lib/types'
import { AreaChart, BarList } from '../components/charts'
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  KeyValue,
  Modal,
  Skeleton,
  Switch,
} from '../components/ui'

export function DeviceDetailPage(): React.JSX.Element {
  const { sn = '' } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const { toolById } = useCatalog()
  const { toast } = useToast()
  const [updatingTool, setUpdatingTool] = useState<string | null>(null)
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({})
  const [clearOpen, setClearOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const { data, loading, error, reload } = useApi<DeviceDetailResponse>(
    `/api/devices/${encodeURIComponent(sn)}`,
  )
  // 客户端约 60 秒上报一次遥测，页面 30 秒自动刷新一次，单机数据接近实时。
  useInterval(() => reload(), 30_000)
  const overrides = useApi<DeviceOverrideResponse>(
    can('config.view') ? `/api/devices/${encodeURIComponent(sn)}/overrides` : null,
  )
  const preview = useApi<ConfigPreview>(
    previewOpen && data
      ? `/api/config/preview?sn=${encodeURIComponent(sn)}&version=${encodeURIComponent(data.device.appVersion)}&channel=${data.device.channel}`
      : null,
  )

  const canEdit = can('config.edit')

  const setToolOverride = async (tool: DeviceOverrideTool, enabled: boolean | null): Promise<void> => {
    setUpdatingTool(tool.toolId)
    try {
      await put(`/api/devices/${encodeURIComponent(sn)}/overrides`, {
        toolId: tool.toolId,
        enabled,
        // 切换开关时保留已填写的停用原因，避免来回拨动丢失文案
        reason: reasonDrafts[tool.toolId] ?? tool.reason ?? '',
        note: tool.note,
      })
      toast(
        enabled === null
          ? `${tool.title} 已恢复为云端默认`
          : `${tool.title} 已在这台设备上${enabled ? '单独启用' : '单独停用'}`,
        'success',
      )
      overrides.reload()
      reload()
    } catch (failure) {
      toast(failure instanceof Error ? failure.message : '保存失败', 'error')
    } finally {
      setUpdatingTool(null)
    }
  }

  const saveReason = async (tool: DeviceOverrideTool): Promise<void> => {
    const reason = (reasonDrafts[tool.toolId] ?? tool.reason ?? '').trim()
    setUpdatingTool(tool.toolId)
    try {
      await put(`/api/devices/${encodeURIComponent(sn)}/overrides`, {
        toolId: tool.toolId,
        enabled: false,
        reason,
        note: tool.note,
      })
      setReasonDrafts((previous) => {
        const next = { ...previous }
        delete next[tool.toolId]
        return next
      })
      toast(
        reason
          ? `${tool.title} 的本设备停用原因已保存`
          : `${tool.title} 的本设备停用原因已清空，客户端将回退到全局原因`,
        'success',
      )
      overrides.reload()
      reload()
    } catch (failure) {
      toast(failure instanceof Error ? failure.message : '保存失败', 'error')
    } finally {
      setUpdatingTool(null)
    }
  }

  const clearOverrides = async (): Promise<void> => {
    try {
      await del(`/api/devices/${encodeURIComponent(sn)}/overrides`)
      toast('已恢复这台设备的全部云端默认设置', 'success')
      setClearOpen(false)
      overrides.reload()
      reload()
    } catch (failure) {
      toast(failure instanceof Error ? failure.message : '操作失败', 'error')
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <div className="grid gap-3 xl:grid-cols-12">
          <Skeleton className="h-[300px] rounded-2xl xl:col-span-8" />
          <Skeleton className="h-[300px] rounded-2xl xl:col-span-4" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <EmptyState
          icon={<Tablet size={18} />}
          title="没有找到这台设备"
          description={
            error?.status === 404
              ? '设备可能已被数据清理，或链接来自旧列表；刷新设备列表后再进入。'
              : error?.message ?? '设备可能尚未上报，或链接已失效。'
          }
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={reload}>
                重试
              </Button>
              <Button variant="outline" onClick={() => navigate('/telemetry/devices')}>
                返回设备列表
              </Button>
            </div>
          }
        />
      </Card>
    )
  }

  const { device } = data
  const status = DEVICE_STATUS[device.status] ?? DEVICE_STATUS.stale!
  const totalOpens = data.tools.reduce((sum, tool) => sum + tool.opens, 0)

  return (
    <div className="animate-fade-in">
      <Link
        to="/telemetry/devices"
        className="mb-4 inline-flex items-center gap-1 text-[12px] text-muted transition hover:text-ink"
      >
        <ChevronLeft size={14} />
        设备列表
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-3 text-muted">
            <Tablet size={20} strokeWidth={1.7} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[21px] font-semibold tracking-[-0.02em] text-ink">
                {device.manufacturer} {device.model}
              </h1>
              <Badge tone={status.tone} dot>
                {status.label}
              </Badge>
              <Badge tone={device.channel === 'beta' ? 'violet' : 'neutral'}>
                {CHANNEL_LABELS[device.channel] ?? device.channel}
              </Badge>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <code className="font-mono text-[11px] text-faint">{device.sn}</code>
              <button
                type="button"
                aria-label="复制设备 SN"
                onClick={() => void navigator.clipboard.writeText(device.sn)}
                className="rounded p-0.5 text-faint transition hover:text-ink"
              >
                <Copy size={12} />
              </button>
              <span className="text-[11px] text-faint">
                · {device.school || '未填写学校'} {device.grade}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/telemetry/events?sn=${device.sn}`}>
            <Button variant="outline" size="sm">
              查看全部事件
            </Button>
          </Link>
        </div>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: '累计会话', value: formatNumber(device.totalSessions) },
          { label: '工具调用', value: formatNumber(device.totalOpens) },
          { label: '使用工具', value: `${data.tools.length} 个` },
          { label: '反馈记录', value: `${device.feedbackCount} 条` },
        ].map((item) => (
          <Card key={item.label} className="px-4 py-3">
            <div className="kpi-label">{item.label}</div>
            <div className="num mt-1 text-[20px] font-semibold tracking-tight text-ink">{item.value}</div>
          </Card>
        ))}
      </div>

      {can('config.view') ? (
        <Card className="mb-3 overflow-hidden">
          <CardHeader
            title="单设备功能控制"
            description="设备级开关优先于云端全局开关；保存后在该设备下次同步配置时生效，不需要发布修订"
            action={
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <Badge tone={overrides.data && overrides.data.overrideCount > 0 ? 'amber' : 'neutral'}>
                  {overrides.data?.overrideCount ?? 0} 项单独控制
                </Badge>
                <Button
                  variant="ghost"
                  size="xs"
                  icon={<Power size={11} />}
                  onClick={() => setPreviewOpen(true)}
                >
                  查看生效配置
                </Button>
                {canEdit && (overrides.data?.overrideCount ?? 0) > 0 ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={<RotateCcw size={11} />}
                    onClick={() => setClearOpen(true)}
                  >
                    全部恢复
                  </Button>
                ) : null}
              </div>
            }
          />
          <div className="overflow-x-auto">
            <table className="table min-w-[1120px]">
              <thead>
                <tr>
                  <th>工具</th>
                  <th>云端默认</th>
                  <th>本设备</th>
                  <th>状态</th>
                  <th className="w-[300px]">停用原因（本设备）</th>
                  <th className="w-[250px]">内部备注 / 更新</th>
                </tr>
              </thead>
              <tbody>
                {(overrides.data?.tools ?? []).map((tool) => {
                  const accent = SUBJECT_COLORS[tool.subjectId] ?? 'var(--brand)'
                  const state =
                    tool.overrideEnabled === null
                      ? { label: '跟随云端', tone: 'neutral' as const }
                      : tool.overrideEnabled
                        ? { label: '单独启用', tone: 'green' as const }
                        : { label: '单独停用', tone: 'red' as const }
                  const parentTool = tool.parentId ? toolById.get(tool.parentId) : undefined
                  const kindMeta = TOOL_KIND_META[tool.kind ?? 'tool'] ?? TOOL_KIND_META.tool!
                  const reasonDraft = reasonDrafts[tool.toolId] ?? tool.reason ?? ''
                  const reasonDirty = reasonDraft.trim() !== (tool.reason ?? '')
                  return (
                    <tr key={tool.toolId}>
                      <td className="min-w-[240px]">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px]"
                            style={{
                              background: `color-mix(in srgb, ${accent} 12%, var(--surface))`,
                              color: accent,
                            }}
                          >
                            {tool.glyph}
                          </span>
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <div className="truncate text-[12.5px] font-medium text-ink">
                                {parentTool ? <span className="text-muted">{parentTool.title} › </span> : null}
                                {tool.title}
                              </div>
                              {tool.kind && tool.kind !== 'tool' ? (
                                <Badge tone={kindMeta.tone} className="shrink-0">
                                  {kindMeta.label}
                                </Badge>
                              ) : null}
                            </div>
                            <div className="font-mono text-[10px] text-faint">{tool.toolId}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone={tool.globalEnabled ? 'green' : 'neutral'}>
                          {tool.globalEnabled ? '启用' : '停用'}
                        </Badge>
                      </td>
                      <td>
                        <Switch
                          checked={tool.effectiveEnabled}
                          disabled={!canEdit || updatingTool === tool.toolId}
                          label={`${tool.title} 在这台设备上的开关`}
                          onChange={(checked) =>
                            void setToolOverride(tool, checked === tool.globalEnabled ? null : checked)
                          }
                        />
                      </td>
                      <td>
                        <Badge tone={state.tone} dot={tool.overrideEnabled !== null}>
                          {state.label}
                        </Badge>
                      </td>
                      <td>
                        {tool.overrideEnabled === false ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={reasonDraft}
                              disabled={!canEdit || updatingTool === tool.toolId}
                              onChange={(event) =>
                                setReasonDrafts((previous) => ({
                                  ...previous,
                                  [tool.toolId]: event.target.value,
                                }))
                              }
                              placeholder="留空则使用全局停用原因"
                              title="仅在本设备单独停用时生效；留空则回退到全局停用原因 / 客户端默认文案"
                              className="h-8 min-w-0 flex-1 text-[11.5px]"
                              maxLength={120}
                              aria-label={`${tool.title} 的本设备停用原因`}
                            />
                            <Button
                              variant="outline"
                              size="xs"
                              disabled={!canEdit || !reasonDirty || updatingTool === tool.toolId}
                              loading={updatingTool === tool.toolId}
                              onClick={() => void saveReason(tool)}
                            >
                              保存
                            </Button>
                          </div>
                        ) : (
                          <div
                            className="max-w-[250px] truncate text-[10.5px] text-faint"
                            title={tool.disabledReasonGlobal || undefined}
                          >
                            {tool.disabledReasonGlobal ? `全局：${tool.disabledReasonGlobal}` : '—'}
                          </div>
                        )}
                      </td>
                      <td className="max-w-[280px]">
                        <div className="truncate text-[11px] text-muted" title={tool.note}>
                          {tool.note || '—'}
                        </div>
                        <div className="text-[10px] text-faint">
                          {tool.updatedAt
                            ? `${tool.updatedBy || '管理员'} · ${relativeTime(tool.updatedAt)}`
                            : '未单独调整'}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!overrides.data ? (
                  <tr>
                    <td colSpan={6}>
                      <Skeleton className="h-7 w-full" />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-5 py-2.5 text-[10.5px] leading-5 text-faint">
            提示：把开关拨回云端默认值即可清除单独控制。设备级设置会写审计日志，但不会随云端草稿发布。
            「停用原因（本设备）」只在单独停用时可填，客户端优先展示它，留空则回退到全局停用原因。
          </div>
        </Card>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-8">
          <Card>
            <CardHeader
              title="近 14 天活跃"
              description={`首次活跃 ${relativeTime(device.firstSeenAt)} · 最近 ${relativeTime(device.lastSeenAt)}`}
              action={
                <div className="flex items-center gap-3 text-[10.5px] text-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-brand" />
                    会话
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-info" />
                    工具调用
                  </span>
                </div>
              }
            />
            <div className="px-3 pb-3 pt-2">
              <AreaChart
                labels={data.usage.map((point) => point.date.slice(5))}
                series={[
                  {
                    key: 'sessions',
                    label: '会话',
                    values: data.usage.map((point) => point.sessions),
                    color: 'var(--brand)',
                  },
                  {
                    key: 'opens',
                    label: '工具调用',
                    values: data.usage.map((point) => point.toolOpens),
                    color: 'var(--info)',
                  },
                ]}
                height={200}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="工具使用" description={`共 ${formatNumber(totalOpens)} 次打开`} />
            <div className="p-5">
              {data.tools.length === 0 ? (
                <EmptyState title="还没有工具使用记录" />
              ) : (
                <BarList
                  items={data.tools.map((tool) => ({
                    key: tool.toolId,
                    label: tool.title,
                    value: tool.opens,
                    color: SUBJECT_COLORS[tool.subjectId] ?? 'var(--brand)',
                    meta: `${tool.days}天`,
                  }))}
                />
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="最近事件" description="客户端上报的原始事件（最近 40 条）" />
            <div className="overflow-hidden px-1 pb-1">
              <table className="table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>事件</th>
                    <th>工具</th>
                    <th>版本</th>
                    <th>属性</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentEvents.slice(0, 12).map((event) => {
                    const nameTone =
                      event.name === 'session_start'
                        ? 'blue'
                        : event.name === 'tool_open'
                          ? 'brand'
                          : event.name === 'error'
                            ? 'red'
                            : 'neutral'
                    return (
                      <tr key={event.id}>
                        <td className="num whitespace-nowrap text-[11.5px] text-muted">
                          {formatDateTimeSeconds(event.occurredAt)}
                        </td>
                        <td>
                          <Badge tone={nameTone}>{eventLabel(event.name)}</Badge>
                        </td>
                        <td className="text-[12px] text-ink">{event.toolTitle ?? '—'}</td>
                        <td className="num text-[11.5px] text-muted">{event.appVersion}</td>
                        <td className="max-w-[240px] truncate font-mono text-[10.5px] text-faint" title={event.props}>
                          {event.props}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {data.recentEvents.length === 0 ? <EmptyState title="还没有上报事件" /> : null}
            </div>
          </Card>
        </div>

        <div className="space-y-3 xl:col-span-4">
          <Card>
            <CardHeader title="设备信息" />
            <div className="divide-y divide-line/70 px-5 pb-2 pt-1">
              <KeyValue label="设备 SN">
                <span className="font-mono text-[10.5px]">{device.sn}</span>
              </KeyValue>
              <KeyValue label="系统">
                {device.osVersion} · SDK {device.sdkInt}
              </KeyValue>
              <KeyValue label="应用版本">
                {device.appVersion}（code {device.versionCode}）
              </KeyValue>
              <KeyValue label="学校 / 年级">
                {device.school || '未填写'} {device.grade}
              </KeyValue>
              <KeyValue label="首次活跃">{formatDateTime(device.firstSeenAt)}</KeyValue>
              <KeyValue label="最近活跃">{formatDateTime(device.lastSeenAt)}</KeyValue>
            </div>
          </Card>

          <Card>
            <CardHeader title="版本轨迹" description="按事件时间回推的版本变化" />
            <div className="space-y-2.5 px-5 pb-4 pt-2">
              {data.versions.map((version, index) => (
                <div key={`${version.version}-${version.lastSeenAt}`} className="flex items-start gap-2.5">
                  <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        background: index === 0 ? 'var(--brand)' : 'var(--line-strong)',
                      }}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="num text-[12px] font-medium text-ink">{version.version}</span>
                      <span className="num text-[10.5px] text-faint">{formatNumber(version.events)} 事件</span>
                    </div>
                    <div className="text-[10.5px] text-faint">
                      {relativeTime(version.lastSeenAt)} · 首次 {formatDateTime(version.firstSeenAt)}
                    </div>
                  </div>
                </div>
              ))}
              {data.versions.length === 0 ? <div className="py-4 text-[12px] text-faint">暂无版本记录</div> : null}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="反馈记录"
              action={
                <Link
                  to={`/feedback?q=${device.sn}`}
                  className="text-[11.5px] text-muted hover:text-ink"
                >
                  全部
                </Link>
              }
            />
            <div className="px-5 pb-3 pt-2">
              {data.feedback.length === 0 ? (
                <div className="flex items-center gap-2 py-4 text-[12px] text-faint">
                  <Inbox size={14} /> 这台设备还没有提交反馈
                </div>
              ) : (
                <div className="space-y-2.5">
                  {data.feedback.map((item) => {
                    const status = FEEDBACK_STATUS[item.status] ?? FEEDBACK_STATUS.pending!
                    return (
                      <Link
                        key={item.id}
                        to={`/feedback?q=${device.sn}`}
                        className="block rounded-lg border border-line px-2.5 py-2 transition hover:bg-surface-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="line-clamp-2 text-[12px] text-ink">{item.title}</span>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </div>
                        <div className="mt-1 text-[10px] text-faint">{relativeTime(item.createdAt)}</div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="崩溃记录" description={`${data.errors.filter((item) => !item.resolved).length} 条未解决`} />
            <div className="px-5 pb-3 pt-2">
              {data.errors.length === 0 ? (
                <div className="flex items-center gap-2 py-4 text-[12px] text-faint">
                  <TriangleExclamationPoint size={14} /> 没有崩溃记录
                </div>
              ) : (
                <div className="space-y-2">
                  {data.errors.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        navigate(`/telemetry/errors?signature=${encodeURIComponent(item.signature)}`)
                      }
                      className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface-2"
                    >
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: item.resolved ? 'var(--positive)' : 'var(--danger)' }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11.5px] text-ink">{item.message || item.signature}</span>
                        <span className="block text-[10px] text-faint">{relativeTime(item.occurredAt)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <div className="flex items-center gap-2 px-1 text-[10.5px] text-faint">
            <Avatar name={device.manufacturer} color="#546E7A" size={18} />
            设备上报内容不含账号、姓名等个人身份信息
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-[10.5px] text-faint">
        <span>最近刷新 {formatRelative(new Date().toISOString())}</span>
        <button type="button" onClick={reload} className="transition hover:text-ink">
          重新加载
        </button>
      </div>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="该设备的生效配置"
        description="把设备 SN 带入 /v1/config 后，客户端会收到的完整 JSON（含设备级开关与停用原因）。"
        size="lg"
        footer={
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPreviewOpen(false)}>
              关闭
            </Button>
            {preview.data ? (
              <Button
                variant="outline"
                size="sm"
                icon={<Copy size={12} />}
                onClick={() =>
                  void navigator.clipboard.writeText(JSON.stringify(preview.data?.config, null, 2))
                }
              >
                复制 JSON
              </Button>
            ) : null}
          </div>
        }
      >
        {preview.data ? (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-faint">
              <Badge tone="neutral">revision #{preview.data.revision?.versionNo ?? '—'}</Badge>
              <span>设备 SN：{preview.data.context.sn}</span>
              <span>·</span>
              <span>{preview.data.deviceOverrides} 项设备级覆盖</span>
            </div>
            <PreviewDisabledTools preview={preview.data} />
            <pre className="code-block max-h-[54vh]">{JSON.stringify(preview.data.config, null, 2)}</pre>
          </>
        ) : (
          <div className="py-10 text-center text-[12px] text-faint">正在计算…</div>
        )}
      </Modal>

      <Modal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="恢复云端默认"
        description="会清除这台设备上的所有单独开关，立即回到云端全局配置。"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setClearOpen(false)}>
              取消
            </Button>
            <Button variant="danger" size="sm" icon={<RotateCcw size={12} />} onClick={() => void clearOverrides()}>
              全部恢复
            </Button>
          </>
        }
      >
        <div className="rounded-xl border border-line bg-surface-2 p-3.5 text-[12px] leading-5 text-muted">
          当前有 {overrides.data?.overrideCount ?? 0} 项单独控制。恢复后不会影响其他设备，也不会改变云端全局开关。
        </div>
      </Modal>
    </div>
  )
}

/** 生效配置预览里的停用工具摘要：直观看到客户端会收到哪条停用原因、来自全局还是本设备覆盖 */
function PreviewDisabledTools({ preview }: { preview: ConfigPreview }): React.JSX.Element | null {
  const disabled = Object.entries(preview.config.tools).filter(([, state]) => !state.enabled)
  if (disabled.length === 0) return null
  return (
    <div className="mb-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
      <div className="mb-1 text-[10.5px] font-medium text-faint">停用工具与下发原因</div>
      <div className="space-y-1">
        {disabled.map(([toolId, state]) => (
          <div key={toolId} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="shrink-0 text-ink">{preview.toolTitles[toolId] ?? toolId}</span>
            <span
              className="min-w-0 flex-1 truncate text-right text-muted"
              title={state.disabledReason ?? ''}
            >
              {state.disabledReason || '（客户端默认文案）'}
            </span>
            <Badge tone={state.disabledReasonSource === 'device' ? 'amber' : 'neutral'}>
              {state.disabledReasonSource === 'device' ? '单设备' : '全局'}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

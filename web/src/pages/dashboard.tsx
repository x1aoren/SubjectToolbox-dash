import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  Download,
  Inbox,
  MousePointerClick,
  RefreshCw,
  Activity,
  Tablet,
  TriangleExclamationPoint,
} from 'lucide-react'
import { useApi, useInterval } from '../lib/useApi'
import { useAuth } from '../lib/app-context'
import {
  DEVICE_STATUS,
  FEEDBACK_PRIORITY,
  FEEDBACK_STATUS,
  FEEDBACK_TYPE,
  SUBJECT_COLORS,
  SUBJECT_NAMES,
  auditLabel,
  formatDelta,
  formatNumber,
  formatPercent,
  formatRelative,
  relativeTime,
  toneStyle,
} from '../lib/format'
import type { Overview } from '../lib/types'
import { ToolBadge } from '../lib/tool-icons'
import { AreaChart, BarList, Donut, Heatmap, Sparkline } from '../components/charts'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  IconButton,
  Segmented,
  Skeleton,
  cn,
} from '../components/ui'

const RANGE_OPTIONS = [
  { value: 7, label: '近 7 天' },
  { value: 14, label: '近 14 天' },
  { value: 30, label: '近 30 天' },
]

function DeltaChip({
  value,
  invert = false,
}: {
  value: number | null
  invert?: boolean
}): React.JSX.Element {
  if (value === null) {
    return <span className="text-[11px] font-medium text-faint">新增</span>
  }
  const up = value >= 0
  const good = invert ? !up : up
  const color = value === 0 ? 'var(--faint)' : good ? 'var(--positive)' : 'var(--danger)'
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-medium" style={{ color }}>
      {value === 0 ? null : up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
      {formatDelta(value)}
    </span>
  )
}

function KpiCard({
  label,
  value,
  delta,
  icon: Icon,
  accent,
  spark,
  footer,
  to,
}: {
  label: string
  value: string
  delta?: number | null
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
  accent: string
  spark?: number[]
  footer?: React.ReactNode
  to?: string
}): React.JSX.Element {
  const body = (
    <Card className="group relative h-full overflow-hidden p-4 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-2">
        <span className="kpi-label">{label}</span>
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${accent} 12%, var(--surface))`, color: accent }}
        >
          <Icon size={14} strokeWidth={1.8} />
        </span>
      </div>
      <div className="mt-2.5 flex items-end justify-between gap-2">
        <span className="kpi-value">{value}</span>
        {spark ? <Sparkline values={spark} color={accent} width={84} height={28} /> : null}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
        {delta !== undefined ? <DeltaChip value={delta} /> : null}
        <span>{footer}</span>
      </div>
      {to ? (
        <ChevronRight
          size={14}
          className="absolute right-4 top-11 text-transparent transition group-hover:text-faint"
        />
      ) : null}
    </Card>
  )
  return to ? (
    <Link to={to} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  )
}

function FeedbackRow({
  item,
}: {
  item: Overview['recentFeedback'][number]
}): React.JSX.Element {
  const type = FEEDBACK_TYPE[item.type] ?? FEEDBACK_TYPE.other!
  const status = FEEDBACK_STATUS[item.status] ?? FEEDBACK_STATUS.pending!
  return (
    <div className="flex items-start gap-3 border-b border-line/70 px-5 py-2.5 last:border-0">
      <Badge tone={type.tone}>{type.label}</Badge>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium text-ink">{item.title}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-faint">
          <span>{item.deviceModel || '未知设备'}</span>
          <span>·</span>
          <span>{item.grade || item.school || '未填写'}</span>
          <span>·</span>
          <span>v{item.appVersion}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
        <span className="text-[10px] text-faint">{relativeTime(item.createdAt)}</span>
      </div>
    </div>
  )
}

export function DashboardPage(): React.JSX.Element {
  const { can, user } = useAuth()
  const navigate = useNavigate()
  const [range, setRange] = useState(7)
  const { data, loading, error, reload } = useApi<Overview>(`/api/overview?range=${range}`)
  // 客户端约 60 秒上报一次遥测，页面 30 秒自动刷新一次，数据接近实时；手动刷新按钮仍然可用。
  useInterval(() => reload(), 30_000)

  if (!data && loading) {
    return (
      <div>
        <div className="mb-5">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="mt-2 h-3.5 w-64" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-[108px] rounded-2xl" />
          ))}
        </div>
        <div className="mt-3 grid gap-3 xl:grid-cols-12">
          <Skeleton className="h-[300px] rounded-2xl xl:col-span-8" />
          <Skeleton className="h-[300px] rounded-2xl xl:col-span-4" />
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <Card className="mt-6">
        <EmptyState
          icon={<TriangleExclamationPoint size={20} />}
          title="概览数据加载失败"
          description={error?.message ?? '请检查服务是否运行'}
          action={
            <Button variant="outline" onClick={reload}>
              重新加载
            </Button>
          }
        />
      </Card>
    )
  }

  const kpis = data.kpis
  const todayStats = data.today
  const deviceSpark = data.series.map((point) => point.activeDevices)
  const sessionSpark = data.series.map((point) => point.sessions)
  const openSpark = data.series.map((point) => point.toolOpens)
  const subjectRows = data.tools.map((tool) => ({
    key: tool.toolId,
    label: tool.title,
    value: tool.opens,
    color: SUBJECT_COLORS[tool.subjectId] ?? 'var(--brand)',
    meta: formatPercent(tool.share, 0),
  }))
  const totalDevices = data.versions.reduce((sum, item) => sum + item.devices, 0)
  const versionColors = ['var(--brand)', 'var(--info)', 'var(--violet)', 'var(--warn)', 'var(--faint)']
  const versionSegments = data.versions.map((item, index) => ({
    key: item.version,
    label: item.version,
    value: item.devices,
    color: versionColors[index % versionColors.length]!,
  }))

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.02em] text-ink">概览</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            统计数据截至今日 {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
            · 今日已有 <span className="font-medium text-ink">{todayStats.activeDevices}</span> 台设备活跃
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />
          <IconButton label="刷新数据" onClick={reload}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </IconButton>
          {can('telemetry.export') ? (
            <a href="/api/export/devices.csv">
              <Button variant="outline" size="sm" icon={<Download size={13} />}>
                导出设备
              </Button>
            </a>
          ) : null}
        </div>
      </div>

      {/* ------------------------------- KPI ------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={`活跃设备 · 近 ${range} 天`}
          value={formatNumber(kpis.activeDevices)}
          delta={kpis.activeDevicesDelta}
          icon={Tablet}
          accent="var(--brand)"
          spark={deviceSpark}
          footer={`今日 ${todayStats.activeDevices} 台${kpis.onlineDevices > 0 ? ` · 在线 ${kpis.onlineDevices}` : ''}`}
          to="/telemetry/devices"
        />
        <KpiCard
          label="使用会话"
          value={formatNumber(kpis.sessions)}
          delta={kpis.sessionsDelta}
          icon={Activity}
          accent="var(--info)"
          spark={sessionSpark}
          footer={`平均 ${kpis.avgSessionMinutes} 分钟 / 次`}
        />
        <KpiCard
          label="工具调用"
          value={formatNumber(kpis.toolOpens)}
          delta={kpis.toolOpensDelta}
          icon={MousePointerClick}
          accent="var(--violet)"
          spark={openSpark}
          footer={`人均 ${(kpis.toolOpens / Math.max(1, kpis.activeDevices)).toFixed(1)} 次`}
          to="/telemetry/tools"
        />
        <KpiCard
          label="待处理反馈"
          value={formatNumber(kpis.pendingFeedback)}
          icon={Inbox}
          accent="var(--warn)"
          footer={`处理中 ${kpis.inProgressFeedback} · 高优 ${kpis.urgentFeedback}`}
          to="/feedback"
        />
      </div>

      {/* ------------------------------ 主图 ------------------------------- */}
      <div className="mt-3 grid gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader
            title="活跃设备与使用会话"
            description={`近 ${range} 天（含今天，今日为实时数据）· 上海时区`}
            action={
              <div className="flex items-center gap-3 text-[10.5px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-brand" />
                  活跃设备
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-info" />
                  使用会话
                </span>
              </div>
            }
          />
          <div className="px-3 pb-4 pt-2">
            <AreaChart
              labels={data.series.map((point) => point.date.slice(5))}
              series={[
                {
                  key: 'active',
                  label: '活跃设备',
                  values: data.series.map((point) => point.activeDevices),
                  color: 'var(--brand)',
                },
                {
                  key: 'sessions',
                  label: '使用会话',
                  values: data.series.map((point) => point.sessions),
                  color: 'var(--info)',
                },
              ]}
              height={248}
            />
          </div>
        </Card>

        <Card className="flex flex-col xl:col-span-4">
          <CardHeader title="版本分布" description={`共 ${formatNumber(totalDevices)} 台在册设备`} />
          <div className="flex flex-1 flex-col justify-between px-5 pb-5 pt-4">
            <div className="flex items-center justify-center">
              <Donut
                segments={versionSegments}
                centerValue={formatNumber(totalDevices)}
                centerLabel="总设备"
                size={144}
                thickness={14}
              />
            </div>
            <div className="mt-5 space-y-2.5">
              {data.versions.map((version, index) => {
                const badge =
                  version.version === '1.0.0'
                    ? { label: '旧版', tone: 'amber' as const }
                    : version.version.startsWith('0.9')
                      ? { label: '内测', tone: 'violet' as const }
                      : { label: '最新', tone: 'green' as const }
                return (
                  <div key={version.version} className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: versionColors[index % versionColors.length] }}
                    />
                    <span className="num text-[12px] text-ink">{version.version}</span>
                    <Badge tone={badge.tone} className="!h-[18px] !px-1.5 !text-[10px]">
                      {badge.label}
                    </Badge>
                    <span className="ml-auto num text-[11.5px] text-muted">
                      {formatNumber(version.devices)} 台
                    </span>
                    <span className="num w-10 text-right text-[11px] text-faint">
                      {formatPercent(version.share, 0)}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="mt-5 grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-surface-2 py-2.5">
              <div className="px-3">
                <div className="text-[10px] text-faint">新增设备</div>
                <div className="num mt-0.5 flex items-baseline gap-1 text-[15px] font-semibold text-ink">
                  {formatNumber(kpis.newDevices)}
                  <DeltaChip value={kpis.newDevicesDelta} />
                </div>
              </div>
              <div className="px-3">
                <div className="text-[10px] text-faint">7 日留存</div>
                <div className="num mt-0.5 text-[15px] font-semibold text-ink">
                  {formatPercent(kpis.retention7d, 0)}
                </div>
              </div>
              <div className="px-3">
                <div className="text-[10px] text-faint">未解决崩溃</div>
                <div className="num mt-0.5 text-[15px] font-semibold text-ink">
                  {formatNumber(kpis.unresolvedErrors)}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ---------------------------- 工具 + 反馈 ---------------------------- */}
      <div className="mt-3 grid gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader
            title="工具使用排行"
            description="按工具打开次数排序"
            action={
              <Link to="/telemetry/tools" className="flex items-center gap-0.5 text-[11.5px] text-muted hover:text-ink">
                全部工具
                <ChevronRight size={13} />
              </Link>
            }
          />
          <div className="p-5">
            <div className="mb-3 grid grid-cols-[26px_1fr_52px_48px] items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-faint">
              <span>#</span>
              <span>工具</span>
              <span className="text-right">调用</span>
              <span className="text-right">占比</span>
            </div>
            <div className="space-y-2.5">
              {subjectRows.map((row, index) => {
                const tool = data.tools[index]
                if (!tool) return null
                const max = Math.max(...data.tools.map((item) => item.opens), 1)
                return (
                  <div key={row.key} className="grid grid-cols-[26px_1fr_52px_48px] items-center gap-2">
                    <span className="num text-[12px] font-medium text-faint">{index + 1}</span>
                    <div className="flex min-w-0 items-center gap-2">
                      <ToolBadge icon={tool.icon} glyph={tool.glyph} subjectId={tool.subjectId} size={26} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[12.5px] font-medium text-ink">{tool.title}</span>
                          <span className="shrink-0 text-[10.5px] text-faint">
                            {SUBJECT_NAMES[tool.subjectId] ?? tool.subjectId}
                          </span>
                        </div>
                        <div className="mt-1 h-[4px] overflow-hidden rounded-full bg-surface-3">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(2, (tool.opens / max) * 100)}%`,
                              background: row.color,
                              opacity: 0.8,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <span className="num text-right text-[12px] font-medium text-ink">
                      {formatNumber(tool.opens)}
                    </span>
                    <span className="num flex items-center justify-end gap-0.5 text-[11px] text-faint">
                      {tool.delta !== null ? (
                        tool.delta >= 0 ? (
                          <ArrowUpRight size={10} className="text-positive" />
                        ) : (
                          <ArrowDownRight size={10} className="text-danger" />
                        )
                      ) : null}
                      {formatPercent(tool.share, 0)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </Card>

        <Card className="flex flex-col xl:col-span-5">
          <CardHeader
            title="最新反馈"
            description={`${kpis.pendingFeedback} 条待处理 · ${kpis.inProgressFeedback} 条处理中`}
            action={
              <Link to="/feedback" className="flex items-center gap-0.5 text-[11.5px] text-muted hover:text-ink">
                收件箱
                <ChevronRight size={13} />
              </Link>
            }
          />
          <div className="mt-2 flex-1">
            {data.recentFeedback.length > 0 ? (
              data.recentFeedback.map((item) => <FeedbackRow key={item.id} item={item} />)
            ) : (
              <EmptyState icon={<Inbox size={18} />} title="还没有反馈" description="学生提交的建议会出现在这里。" />
            )}
          </div>
          <div className="border-t border-line px-5 py-2.5">
            <div className="flex items-center justify-between text-[11px] text-faint">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-warn" />
                高优先级 {kpis.urgentFeedback} 条
              </span>
              <button
                type="button"
                onClick={() => navigate('/feedback?status=open')}
                className="flex items-center gap-0.5 text-muted hover:text-ink"
              >
                去处理
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* --------------------------- 热力图 + 动态 --------------------------- */}
      <div className="mt-3 grid gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader
            title="活跃时段"
            description="工具调用在一天中的分布 · 上海时区"
            action={<span className="text-[10.5px] text-faint">按小时聚合</span>}
          />
          <div className="px-5 pb-5 pt-4">
            <div className="overflow-x-auto">
              <div className="min-w-[520px]">
                <Heatmap cells={data.heatmap} formatValue={(value) => `${value} 次`} />
              </div>
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader
            title="最近动态"
            description="控制台上的敏感操作会留痕"
            action={
              can('audit.view') ? (
                <Link to="/team/audit" className="flex items-center gap-0.5 text-[11.5px] text-muted hover:text-ink">
                  审计日志
                  <ChevronRight size={13} />
                </Link>
              ) : null
            }
          />
          <div className="px-5 py-2">
            {data.activity.length === 0 ? (
              <div className="py-10 text-center text-[12px] text-faint">暂无动态</div>
            ) : (
              <ol className="relative">
                {data.activity.slice(0, 6).map((item, index) => (
                  <li key={item.id} className="relative flex gap-2.5 pb-3 last:pb-0">
                    {index < Math.min(5, data.activity.length - 1) ? (
                      <span className="absolute left-[10px] top-6 h-[calc(100%-14px)] w-px bg-line" />
                    ) : null}
                    <span className="relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-[9px] font-medium text-muted">
                      {item.actorName.slice(-1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] leading-5 text-ink">
                        <span className="font-medium">{item.actorName}</span>
                        <span className="text-muted"> {auditLabel(item.action)}</span>
                      </div>
                      <div className="truncate text-[10.5px] text-faint">{item.detail}</div>
                    </div>
                    <span className="shrink-0 text-[10px] text-faint">{relativeTime(item.createdAt)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Card>
      </div>

      {/* ------------------------------ 崩溃 ------------------------------- */}
      <Card className="mt-3">
        <CardHeader
          title="崩溃概览"
          description={`本周期 ${formatNumber(data.topErrors.reduce((sum, item) => sum + item.count, 0))} 次异常上报 · 每千次会话约 ${Math.round(kpis.errorRate * 1000)} 次`}
          action={
            <Link to="/telemetry/errors" className="flex items-center gap-0.5 text-[11.5px] text-muted hover:text-ink">
              全部崩溃
              <ChevronRight size={13} />
            </Link>
          }
        />
        <div className="grid gap-px overflow-hidden bg-line sm:grid-cols-2 xl:grid-cols-5">
          {data.topErrors.map((item) => (
            <button
              key={item.signature}
              type="button"
              onClick={() => navigate(`/telemetry/errors?signature=${encodeURIComponent(item.signature)}`)}
              className="group flex flex-col gap-1.5 bg-surface px-4 py-3.5 text-left transition hover:bg-surface-2"
            >
              <div className="flex items-center justify-between">
                <span className="num text-[17px] font-semibold leading-none text-ink">
                  {formatNumber(item.count)}
                </span>
                {item.unresolved > 0 ? (
                  <Badge tone="red" dot>
                    未解决
                  </Badge>
                ) : (
                  <Badge tone="green">已处理</Badge>
                )}
              </div>
              <div className="truncate text-[11.5px] font-medium text-ink" title={item.message}>
                {item.message || item.signature}
              </div>
              <div className="flex items-center justify-between text-[10px] text-faint">
                <span>{item.toolId ? data.toolMeta.find((tool) => tool.id === item.toolId)?.title ?? item.toolId : '全局'}</span>
                <span>{item.devices} 台设备</span>
              </div>
            </button>
          ))}
          {data.topErrors.length === 0 ? (
            <div className="col-span-full bg-surface">
              <EmptyState icon={<TriangleExclamationPoint size={18} />} title="本周期没有崩溃记录" />
            </div>
          ) : null}
        </div>
      </Card>

      <div className="mt-4 flex items-center justify-between text-[10.5px] text-faint">
        <span>
          数据由 SubjectToolbox 客户端匿名上报 · 保留 {kpis.totalDevices} 台设备的历史记录
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-positive" />
          更新于 {formatRelative(data.generatedAt)}
        </span>
      </div>
    </div>
  )
}

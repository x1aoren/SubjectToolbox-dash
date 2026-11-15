import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  MousePointerClick,
  RefreshCw,
  TriangleExclamationPoint,
  Users,
  Wrench,
} from 'lucide-react'
import { useApi } from '../lib/useApi'
import {
  SUBJECT_COLORS,
  SUBJECT_NAMES,
  formatNumber,
  formatPercent,
  relativeTime,
} from '../lib/format'
import type { Overview } from '../lib/types'
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  IconButton,
  ProgressBar,
  Segmented,
  Skeleton,
} from '../components/ui'

const RANGES = [
  { value: 7, label: '近 7 天' },
  { value: 14, label: '近 14 天' },
  { value: 30, label: '近 30 天' },
]

export function ToolsPage(): React.JSX.Element {
  const [range, setRange] = useState(30)
  const { data, loading, error, reload } = useApi<Overview>(`/api/overview?range=${range}`)

  if (!data && loading) {
    return (
      <div>
        <Skeleton className="mb-5 h-6 w-32" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-[86px] rounded-2xl" />
          ))}
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-[150px] rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <Card>
        <EmptyState
          title="工具数据加载失败"
          description={error?.message ?? '请稍后重试'}
          action={<IconButton label="重试" onClick={reload}><RefreshCw size={15} /></IconButton>}
        />
      </Card>
    )
  }

  const totalOpens = data.tools.reduce((sum, tool) => sum + tool.opens, 0)
  const totalErrors = data.tools.reduce((sum, tool) => sum + tool.errors, 0)
  const topTool = data.tools[0]
  const subjects = data.subjects.filter((subject) => subject.opens > 0)
  const subjectTotal = subjects.reduce((sum, subject) => sum + subject.opens, 0)

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.02em] text-ink">工具使用</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            7 个学科 · 11 个离线工具 · 近 {range} 天共 {formatNumber(totalOpens)} 次打开
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented options={RANGES} value={range} onChange={setRange} />
          <IconButton label="刷新" onClick={reload}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </IconButton>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="kpi-label">工具调用</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <MousePointerClick size={14} />
            </span>
          </div>
          <div className="num mt-2 text-[26px] font-semibold tracking-tight text-ink">{formatNumber(totalOpens)}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-faint">
            {data.tools[0]?.delta !== null && data.tools[0]?.delta !== undefined ? (
              <span
                className="inline-flex items-center gap-0.5 font-medium"
                style={{ color: data.tools[0].delta >= 0 ? 'var(--positive)' : 'var(--danger)' }}
              >
                {data.tools[0].delta >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                {formatPercent(Math.abs(data.tools[0].delta), 1)}
              </span>
            ) : null}
            排行第一为 {topTool?.title ?? '—'}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="kpi-label">覆盖设备</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-info-soft text-info">
              <Users size={14} />
            </span>
          </div>
          <div className="num mt-2 text-[26px] font-semibold tracking-tight text-ink">
            {formatNumber(data.kpis.activeDevices)}
          </div>
          <div className="mt-1 text-[11px] text-faint">至少使用过一次工具的设备</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="kpi-label">人均调用</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-soft text-violet">
              <Wrench size={14} />
            </span>
          </div>
          <div className="num mt-2 text-[26px] font-semibold tracking-tight text-ink">
            {(totalOpens / Math.max(1, data.kpis.activeDevices)).toFixed(1)}
          </div>
          <div className="mt-1 text-[11px] text-faint">次 / 设备 · 统计期 {range} 天</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="kpi-label">关联异常</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-danger-soft text-danger">
              <TriangleExclamationPoint size={14} />
            </span>
          </div>
          <div className="num mt-2 text-[26px] font-semibold tracking-tight text-ink">{formatNumber(totalErrors)}</div>
          <div className="mt-1 text-[11px] text-faint">崩溃记录按工具归因</div>
        </Card>
      </div>

      <Card className="mt-3">
        <CardHeader
          title="学科分布"
          description={`近 ${range} 天工具调用按学科拆分`}
          action={<span className="text-[10.5px] text-faint">共 {formatNumber(subjectTotal)} 次</span>}
        />
        <div className="px-5 pb-4 pt-4">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-3">
            {subjects.map((subject) => (
              <div
                key={subject.subjectId}
                style={{
                  width: `${(subject.opens / Math.max(1, subjectTotal)) * 100}%`,
                  background: subject.accent,
                  opacity: 0.82,
                }}
                title={`${subject.name}：${subject.opens} 次`}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {subjects.map((subject) => (
              <div key={subject.subjectId} className="flex items-center gap-1.5 text-[11.5px]">
                <span className="h-2 w-2 rounded-full" style={{ background: subject.accent }} />
                <span className="text-ink">{subject.name}</span>
                <span className="num text-faint">
                  {formatPercent(subject.opens / Math.max(1, subjectTotal), 1)}
                </span>
                <span className="num text-faint">· {formatNumber(subject.opens)}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.tools.map((tool) => {
          const accent = SUBJECT_COLORS[tool.subjectId] ?? 'var(--brand)'
          return (
            <Link
              key={tool.toolId}
              to={`/telemetry/events?toolId=${encodeURIComponent(tool.toolId)}`}
              className="group"
            >
              <Card className="flex h-full flex-col p-4 transition-colors hover:border-line-strong">
                <div className="flex items-start gap-2.5">
                  <span
                    className="num flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[14px] font-medium"
                    style={{ background: `color-mix(in srgb, ${accent} 12%, var(--surface))`, color: accent }}
                  >
                    {tool.glyph}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13.5px] font-semibold text-ink">{tool.title}</span>
                      <ChevronRight
                        size={13}
                        className="shrink-0 text-transparent transition group-hover:text-faint"
                      />
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-faint">
                      <span>{SUBJECT_NAMES[tool.subjectId] ?? tool.subjectId}</span>
                      <span>·</span>
                      <span className="num">{tool.toolId}</span>
                    </div>
                  </div>
                  {tool.errors > 0 ? (
                    <Badge tone="red">{tool.errors} 异常</Badge>
                  ) : (
                    <Badge tone="green">稳定</Badge>
                  )}
                </div>

                <div className="mt-3.5 grid grid-cols-3 gap-2 rounded-lg bg-surface-2 px-2.5 py-2">
                  <div>
                    <div className="text-[9.5px] text-faint">调用</div>
                    <div className="num text-[14px] font-semibold text-ink">{formatNumber(tool.opens)}</div>
                  </div>
                  <div>
                    <div className="text-[9.5px] text-faint">设备</div>
                    <div className="num text-[14px] font-semibold text-ink">{formatNumber(tool.devices)}</div>
                  </div>
                  <div>
                    <div className="text-[9.5px] text-faint">占比</div>
                    <div className="num text-[14px] font-semibold text-ink">{formatPercent(tool.share, 1)}</div>
                  </div>
                </div>

                <div className="mt-auto pt-3">
                  <ProgressBar value={tool.share / Math.max(0.0001, data.tools[0]?.share ?? 1)} color={accent} height={4} />
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-faint">
                    <span>相对使用强度</span>
                    <span className="flex items-center gap-0.5">
                      {tool.delta === null ? (
                        <span className="text-faint">无可比数据</span>
                      ) : tool.delta >= 0 ? (
                        <>
                          <ArrowUpRight size={10} className="text-positive" />
                          <span className="text-positive">{formatPercent(tool.delta, 1)}</span>
                          <span className="ml-1">环比</span>
                        </>
                      ) : (
                        <>
                          <ArrowDownRight size={10} className="text-danger" />
                          <span className="text-danger">{formatPercent(Math.abs(tool.delta), 1)}</span>
                          <span className="ml-1">环比</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-between text-[10.5px] text-faint">
        <span>点击工具卡片可查看该工具的原始事件流</span>
        <span>更新于 {relativeTime(data.generatedAt)}</span>
      </div>
    </div>
  )
}

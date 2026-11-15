import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ListFilter, RefreshCw } from 'lucide-react'
import { useApi, useDebounced } from '../lib/useApi'
import { useCatalog } from '../lib/app-context'
import {
  CHANNEL_LABELS,
  eventLabel,
  formatDateTimeSeconds,
  formatNumber,
} from '../lib/format'
import type { EventListResponse } from '../lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
  cn,
} from '../components/ui'

function compactProps(json: string): string {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return json
    return Object.entries(parsed)
      .slice(0, 3)
      .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
      .join('  ')
  } catch {
    return json
  }
}

const EVENT_TONE: Record<string, 'brand' | 'blue' | 'violet' | 'red' | 'neutral'> = {
  session_start: 'blue',
  session_end: 'neutral',
  tool_open: 'brand',
  tool_close: 'neutral',
  search: 'violet',
  error: 'red',
  feedback_open: 'brand',
}

export function EventsPage(): React.JSX.Element {
  const { catalog } = useCatalog()
  const [name, setName] = useState('')
  const [sn, setSnFilter] = useState('')
  const debouncedDevice = useDebounced(sn, 350)
  const [toolId, setToolId] = useState('')
  const [range, setRange] = useState('7')
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [name, debouncedDevice, toolId, range])

  const { data, loading, error, reload } = useApi<EventListResponse>(
    `/api/events?name=${encodeURIComponent(name)}&sn=${encodeURIComponent(debouncedDevice)}&toolId=${encodeURIComponent(toolId)}&range=${range}&page=${page}&pageSize=30`,
  )

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.02em] text-ink">事件流</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            客户端上报的原始事件 · 当前筛选 {formatNumber(data?.total ?? 0)} 条
          </p>
        </div>
        <IconButton label="刷新" onClick={reload}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </IconButton>
      </div>

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={sn}
            onChange={setSnFilter}
            placeholder="按设备 SN 过滤"
            className="w-full sm:w-[220px]"
          />
          <Select value={toolId} onChange={(event) => setToolId(event.target.value)} className="w-[150px]">
            <option value="">全部工具</option>
            {(catalog?.tools ?? []).map((tool) => (
              <option key={tool.id} value={tool.id}>
                {tool.title}
              </option>
            ))}
          </Select>
          <Select value={range} onChange={(event) => setRange(event.target.value)} className="w-[120px]">
            <option value="1">近 24 小时</option>
            <option value="7">近 7 天</option>
            <option value="14">近 14 天</option>
            <option value="30">近 30 天</option>
          </Select>
          <span className="ml-auto hidden text-[11px] text-faint sm:block">每页 30 条</span>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
          <button
            type="button"
            onClick={() => setName('')}
            className={cn(
              'rounded-full px-2.5 py-1 text-[11px] transition',
              name === '' ? 'bg-brand-soft text-brand-strong' : 'text-muted hover:bg-surface-3',
            )}
          >
            全部事件
          </button>
          {(data?.names ?? []).map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => setName(item.name === name ? '' : item.name)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition',
                name === item.name ? 'bg-brand-soft text-brand-strong' : 'text-muted hover:bg-surface-3',
              )}
            >
              {eventLabel(item.name)}
              <span className="num text-[10px] text-faint">{formatNumber(item.count)}</span>
            </button>
          ))}
        </div>
      </Card>

      {error ? (
        <Card>
          <EmptyState
            title="事件加载失败"
            description={error.message}
            action={<Button variant="outline" onClick={reload}>重新加载</Button>}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table min-w-[980px]">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>事件</th>
                  <th>工具</th>
                  <th>设备</th>
                  <th>版本</th>
                  <th>属性</th>
                </tr>
              </thead>
              <tbody>
                {(data?.items ?? []).map((item) => (
                  <tr key={item.id}>
                    <td className="num whitespace-nowrap text-[11.5px] text-muted">
                      {formatDateTimeSeconds(item.occurredAt)}
                    </td>
                    <td>
                      <Badge tone={EVENT_TONE[item.name] ?? 'neutral'}>{eventLabel(item.name)}</Badge>
                    </td>
                    <td className="text-[12px] text-ink">
                      {item.toolTitle ?? <span className="text-faint">—</span>}
                    </td>
                    <td>
                      <Link
                        to={`/telemetry/devices/${encodeURIComponent(item.sn)}`}
                        className="block max-w-[190px] truncate font-mono text-[10.5px] text-muted transition hover:text-brand"
                        title={item.sn}
                      >
                        {item.sn}
                      </Link>
                      <span className="text-[10px] text-faint">
                        {[item.model, item.grade].filter(Boolean).join(' · ') || '未知设备'}
                      </span>
                    </td>
                    <td>
                      <span className="num text-[11.5px] text-ink">{item.appVersion}</span>
                      <div className="text-[10px] text-faint">
                        {CHANNEL_LABELS[item.channel] ?? item.channel}
                      </div>
                    </td>
                    <td className="max-w-[300px]">
                      <span
                        className="block truncate font-mono text-[10.5px] text-faint"
                        title={item.props}
                      >
                        {compactProps(item.props)}
                      </span>
                    </td>
                  </tr>
                ))}
                {loading && !data
                  ? Array.from({ length: 10 }, (_, index) => (
                      <tr key={index}>
                        <td colSpan={6}>
                          <Skeleton className="h-7 w-full" />
                        </td>
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
          </div>
          {!loading && (data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={<ListFilter size={18} />}
              title="没有匹配的事件"
              description="事件通常来自客户端 handshake 之后的上报，检查筛选条件或缩短时间范围。"
            />
          ) : null}
          {data ? (
            <Pagination page={data.page} pageCount={data.pageCount} total={data.total} onChange={setPage} />
          ) : null}
        </Card>
      )}

      <div className="mt-3 text-[10.5px] text-faint">
        事件按客户端时间排序；同一次会话可通过 props.sessionId 串联。
      </div>
    </div>
  )
}

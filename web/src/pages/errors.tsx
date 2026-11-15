import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CheckCircle2,
  Copy,
  RefreshCw,
  RotateCcw,
  TriangleExclamationPoint,
} from 'lucide-react'
import { post } from '../lib/api'
import { errorMessage, useAuth, useCatalog, useToast } from '../lib/app-context'
import { useApi, useDebounced } from '../lib/useApi'
import {
  formatDateTime,
  formatNumber,
  relativeTime,
} from '../lib/format'
import type { ErrorDetail, ErrorGroup } from '../lib/types'
import {
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  IconButton,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
  Tabs,
} from '../components/ui'

interface ErrorListResponse {
  items: ErrorGroup[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export function ErrorsPage(): React.JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams()
  const [status, setStatus] = useState('unresolved')
  const [q, setQ] = useState('')
  const debouncedQ = useDebounced(q, 300)
  const [toolId, setToolId] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string | null>(searchParams.get('signature'))
  const [resolving, setResolving] = useState(false)
  const { can } = useAuth()
  const { toast } = useToast()
  const { catalog } = useCatalog()
  const { data, loading, error, reload } = useApi<ErrorListResponse>(
    `/api/errors?status=${status}&q=${encodeURIComponent(debouncedQ)}&toolId=${encodeURIComponent(toolId)}&page=${page}&pageSize=10`,
  )
  const detail = useApi<ErrorDetail>(
    selected ? `/api/errors/detail?signature=${encodeURIComponent(selected)}` : null,
  )

  useEffect(() => {
    setPage(1)
  }, [status, debouncedQ, toolId])

  useEffect(() => {
    const signature = searchParams.get('signature')
    if (signature) setSelected(signature)
  }, [searchParams])

  const openDetail = (signature: string): void => {
    setSelected(signature)
    const next = new URLSearchParams(searchParams)
    next.set('signature', signature)
    setSearchParams(next, { replace: true })
  }

  const closeDetail = (): void => {
    setSelected(null)
    const next = new URLSearchParams(searchParams)
    next.delete('signature')
    setSearchParams(next, { replace: true })
  }

  const resolve = async (resolved: boolean): Promise<void> => {
    if (!selected) return
    setResolving(true)
    try {
      await post('/api/errors/resolve', { signature: selected, resolved })
      toast(resolved ? '已标记为处理完成' : '已重新打开这组崩溃', 'success')
      reload()
      detail.reload()
    } catch (failure) {
      toast(errorMessage(failure), 'error')
    } finally {
      setResolving(false)
    }
  }

  const counts = data?.items.reduce(
    (accumulator, item) => {
      accumulator.total += item.total
      accumulator.unresolved += item.unresolved
      accumulator.devices += item.devices
      return accumulator
    },
    { total: 0, unresolved: 0, devices: 0 },
  ) ?? { total: 0, unresolved: 0, devices: 0 }

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.02em] text-ink">崩溃记录</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            按异常签名聚合 · 当前列表 {formatNumber(counts.total)} 次上报、涉及 {formatNumber(counts.devices)} 台次设备
          </p>
        </div>
        <div className="flex items-center gap-2">
          <IconButton label="刷新" onClick={reload}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </IconButton>
        </div>
      </div>

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            items={[
              { key: 'all', label: '全部' },
              { key: 'unresolved', label: '未解决' },
              { key: 'resolved', label: '已处理' },
            ]}
            value={status}
            onChange={setStatus}
            className="border-0"
          />
          <div className="mx-1 hidden h-4 w-px bg-line sm:block" />
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="搜索异常消息或签名"
            className="w-full sm:w-[260px]"
          />
          <Select value={toolId} onChange={(event) => setToolId(event.target.value)} className="w-[150px]">
            <option value="">全部工具</option>
            {(catalog?.tools ?? []).map((tool) => (
              <option key={tool.id} value={tool.id}>
                {tool.title}
              </option>
            ))}
          </Select>
          <span className="ml-auto hidden text-[11px] text-faint sm:block">
            共 {formatNumber(data?.total ?? 0)} 组
          </span>
        </div>
      </Card>

      {error ? (
        <Card>
          <EmptyState
            title="崩溃列表加载失败"
            description={error.message}
            action={<Button variant="outline" onClick={reload}>重新加载</Button>}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table table-clickable min-w-[920px]">
              <thead>
                <tr>
                  <th>异常</th>
                  <th>工具</th>
                  <th className="text-right">上报</th>
                  <th className="text-right">设备</th>
                  <th>状态</th>
                  <th>最近出现</th>
                </tr>
              </thead>
              <tbody>
                {(data?.items ?? []).map((item) => (
                  <tr key={item.signature} onClick={() => openDetail(item.signature)}>
                    <td className="max-w-[520px]">
                      <div className="truncate text-[12.5px] font-medium text-ink" title={item.signature}>
                        {item.message || item.signature}
                      </div>
                      <div className="truncate font-mono text-[10.5px] text-faint" title={item.signature}>
                        {item.signature}
                      </div>
                    </td>
                    <td className="text-[12px] text-muted">{item.toolTitle ?? '全局'}</td>
                    <td className="num text-right text-[12.5px] font-medium text-ink">
                      {formatNumber(item.total)}
                    </td>
                    <td className="num text-right text-[12px] text-ink">{formatNumber(item.devices)}</td>
                    <td>
                      {item.unresolved > 0 ? (
                        <Badge tone="red" dot>
                          {item.unresolved} 条未解决
                        </Badge>
                      ) : (
                        <Badge tone="green">
                          <CheckCircle2 size={11} /> 已处理
                        </Badge>
                      )}
                    </td>
                    <td className="text-[11.5px] text-muted">{relativeTime(item.lastSeenAt)}</td>
                  </tr>
                ))}
                {loading && !data
                  ? Array.from({ length: 6 }, (_, index) => (
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
              icon={<TriangleExclamationPoint size={18} />}
              title={status === 'unresolved' ? '没有未解决的崩溃' : '没有匹配的崩溃记录'}
              description="调整筛选条件，或切换到全部查看历史记录。"
            />
          ) : null}
          {data ? (
            <Pagination page={data.page} pageCount={data.pageCount} total={data.total} onChange={setPage} />
          ) : null}
        </Card>
      )}

      <Drawer
        open={Boolean(selected)}
        onClose={closeDetail}
        title={detail.data?.message || '崩溃详情'}
        subtitle={detail.data ? `${detail.data.total} 次上报 · ${detail.data.devices} 台设备 · 首次 ${formatDateTime(detail.data.firstSeenAt)}` : '加载中'}
        width={760}
        footer={
          detail.data ? (
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="text-[11px] text-faint">
                最近出现 {relativeTime(detail.data.lastSeenAt)}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={closeDetail}>
                  关闭
                </Button>
                {can('telemetry.manage') ? (
                  detail.data.unresolved > 0 ? (
                    <Button
                      size="sm"
                      icon={<CheckCircle2 size={13} />}
                      loading={resolving}
                      onClick={() => void resolve(true)}
                    >
                      标记已处理
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<RotateCcw size={13} />}
                      loading={resolving}
                      onClick={() => void resolve(false)}
                    >
                      重新打开
                    </Button>
                  )
                ) : null}
              </div>
            </div>
          ) : null
        }
      >
        {detail.loading && !detail.data ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : detail.data ? (
          <div className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={detail.data.unresolved > 0 ? 'red' : 'green'} dot>
                {detail.data.unresolved > 0 ? `${detail.data.unresolved} 条未解决` : '已处理'}
              </Badge>
              {detail.data.toolId ? (
                <Badge tone="brand">
                  {catalog?.tools.find((tool) => tool.id === detail.data?.toolId)?.title ?? detail.data.toolId}
                </Badge>
              ) : (
                <Badge tone="neutral">全局异常</Badge>
              )}
              <span className="font-mono text-[10.5px] text-faint">{detail.data.signature}</span>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(detail.data!.stack)}
                className="ml-auto flex items-center gap-1 text-[10.5px] text-faint transition hover:text-ink"
              >
                <Copy size={11} /> 复制堆栈
              </button>
            </div>

            <div className="mt-4">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">堆栈</div>
              <pre className="code-block max-h-[260px] whitespace-pre-wrap break-all">{detail.data.stack || '客户端未上报堆栈'}</pre>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">版本分布</div>
                <div className="space-y-1.5">
                  {detail.data.versions.map((version) => (
                    <div key={version.version} className="flex items-center justify-between text-[12px]">
                      <span className="num text-ink">{version.version}</span>
                      <span className="num text-muted">{version.count} 次</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">影响设备</div>
                <div className="text-[12px] text-muted">
                  {detail.data.devices} 台设备上报过这个问题，最近一次在 {formatDateTime(detail.data.lastSeenAt)}。
                </div>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">最近上报</div>
              <div className="overflow-hidden rounded-xl border border-line">
                <table className="table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>设备</th>
                      <th>版本</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.data.occurrences.map((occurrence) => (
                      <tr key={occurrence.id}>
                        <td className="num whitespace-nowrap text-[11.5px] text-muted">
                          {formatDateTime(occurrence.occurredAt)}
                        </td>
                        <td>
                          <div className="text-[12px] text-ink">{occurrence.model || occurrence.sn}</div>
                          <div className="text-[10px] text-faint">
                            {occurrence.school} {occurrence.grade} · {occurrence.sn}
                          </div>
                        </td>
                        <td className="num text-[11.5px] text-muted">{occurrence.appVersion}</td>
                        <td>
                          <Badge tone={occurrence.resolved ? 'green' : 'amber'}>
                            {occurrence.resolved ? '已处理' : '待处理'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState title="崩溃详情加载失败" description="请关闭后重试。" />
        )}
      </Drawer>
    </div>
  )
}


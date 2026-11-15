import { Fragment, useEffect, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { useApi, useDebounced } from '../lib/useApi'
import { AUDIT_LABELS, auditLabel, formatDateTime, formatNumber, relativeTime } from '../lib/format'
import type { AuditItem } from '../lib/types'
import {
  Badge,
  Card,
  EmptyState,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
} from '../components/ui'

interface AuditResponse {
  items: AuditItem[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  actions: Array<{ action: string; count: number }>
}

const ACTION_TONE: Record<string, 'brand' | 'red' | 'amber' | 'blue' | 'neutral'> = {
  'auth.login': 'neutral',
  'auth.logout': 'neutral',
  'config.publish': 'brand',
  'config.rollback': 'amber',
  'config.draft': 'blue',
  'feedback.reply': 'blue',
  'feedback.update': 'blue',
  'error.resolve': 'brand',
  'user.create': 'brand',
  'user.delete': 'red',
  'user.reset_password': 'amber',
  'key.create': 'brand',
  'key.revoke': 'red',
  'system.reset_demo': 'red',
  'device.override': 'amber',
}

export function AuditPage(): React.JSX.Element {
  const [q, setQ] = useState('')
  const debouncedQ = useDebounced(q, 300)
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [debouncedQ, action])

  const { data, loading } = useApi<AuditResponse>(
    `/api/audit?q=${encodeURIComponent(debouncedQ)}&action=${encodeURIComponent(action)}&page=${page}&pageSize=30`,
  )

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.02em] text-ink">审计日志</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          登录、发布、回复、账号变更等敏感操作都会记录，共 {formatNumber(data?.total ?? 0)} 条。
        </p>
      </div>

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="搜索操作者、对象或详情" className="w-full sm:w-[270px]" />
          <Select value={action} onChange={(event) => setAction(event.target.value)} className="w-[180px]">
            <option value="">全部动作</option>
            {(data?.actions ?? []).map((item) => (
              <option key={item.action} value={item.action}>
                {auditLabel(item.action)}（{item.count}）
              </option>
            ))}
          </Select>
          <span className="ml-auto hidden text-[11px] text-faint sm:block">按时间倒序</span>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table min-w-[960px]">
            <thead>
              <tr>
                <th className="w-[150px]">时间</th>
                <th className="w-[120px]">操作者</th>
                <th className="w-[150px]">动作</th>
                <th>对象</th>
                <th>详情</th>
                <th className="w-[120px]">来源 IP</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((item) => (
                <tr key={item.id}>
                  <td className="num whitespace-nowrap text-[11.5px] text-muted">
                    <div>{formatDateTime(item.createdAt)}</div>
                    <div className="text-[10px] text-faint">{relativeTime(item.createdAt)}</div>
                  </td>
                  <td className="text-[12px] text-ink">{item.actorName}</td>
                  <td>
                    <Badge tone={ACTION_TONE[item.action] ?? 'neutral'}>{auditLabel(item.action)}</Badge>
                  </td>
                  <td className="max-w-[220px]">
                    <div className="truncate text-[11.5px] text-ink">{item.targetLabel || '—'}</div>
                    <div className="text-[9.5px] uppercase tracking-wide text-faint">{item.targetType}</div>
                  </td>
                  <td className="max-w-[360px] truncate text-[11.5px] text-muted" title={item.detail}>
                    {item.detail}
                  </td>
                  <td className="font-mono text-[10px] text-faint">{item.ip}</td>
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
            icon={<ScrollText size={18} />}
            title="没有匹配的日志"
            description="换一个关键词或动作类型试试。"
          />
        ) : null}
        {data ? (
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} onChange={setPage} />
        ) : null}
      </Card>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10.5px] text-faint">
        <span>支持的动作：</span>
        {Object.entries(AUDIT_LABELS).slice(0, 10).map(([key, label]) => (
          <Fragment key={key}>
            <span className="rounded bg-surface-2 px-1.5 py-0.5">{label}</span>
          </Fragment>
        ))}
        <span>…</span>
      </div>
    </div>
  )
}

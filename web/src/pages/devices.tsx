import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, RotateCcw, Tablet } from 'lucide-react'
import { useApi, useDebounced } from '../lib/useApi'
import { useAuth } from '../lib/app-context'
import { qs } from '../lib/api'
import {
  CHANNEL_LABELS,
  DEVICE_STATUS,
  formatNumber,
  formatRelative,
  relativeTime,
} from '../lib/format'
import type { DeviceListResponse } from '../lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
} from '../components/ui'

export function DevicesPage(): React.JSX.Element {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const debouncedQ = useDebounced(q, 300)
  const [version, setVersion] = useState('')
  const [channel, setChannel] = useState('')
  const [grade, setGrade] = useState('')
  const [activity, setActivity] = useState('')
  const [sort, setSort] = useState('lastSeen')
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [debouncedQ, version, channel, grade, activity, sort])

  const path = useMemo(
    () =>
      `/api/devices${qs({
        q: debouncedQ,
        version,
        channel,
        grade,
        activity,
        sort,
        page,
        pageSize: 20,
      })}`,
    [debouncedQ, version, channel, grade, activity, sort, page],
  )
  const { data, loading, error, reload } = useApi<DeviceListResponse>(path)

  const facets = data?.facets
  const totalDevices = facets ? facets.versions.reduce((sum, item) => sum + item.count, 0) : 0
  const onlineCount = data?.items.filter((item) => item.status === 'online').length ?? 0
  const hasFilters = Boolean(q || version || channel || grade || activity)

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.02em] text-ink">设备</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            共 {formatNumber(totalDevices)} 台在册平板 · 本页 {onlineCount} 台在线
          </p>
        </div>
        <div className="flex items-center gap-2">
          {can('telemetry.export') ? (
            <a href="/api/export/devices.csv">
              <Button variant="outline" size="sm" icon={<Download size={13} />}>
                导出 CSV
              </Button>
            </a>
          ) : null}
        </div>
      </div>

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="搜索 SN、型号或学校" className="w-full sm:w-[248px]" />
          <Select value={version} onChange={(event) => setVersion(event.target.value)} className="w-[126px]">
            <option value="">全部版本</option>
            {(facets?.versions ?? []).map((item) => (
              <option key={item.version} value={item.version}>
                {item.version}（{item.count}）
              </option>
            ))}
          </Select>
          <Select value={channel} onChange={(event) => setChannel(event.target.value)} className="w-[112px]">
            <option value="">全部渠道</option>
            {(facets?.channels ?? []).map((item) => (
              <option key={item.channel} value={item.channel}>
                {CHANNEL_LABELS[item.channel] ?? item.channel}
              </option>
            ))}
          </Select>
          <Select value={grade} onChange={(event) => setGrade(event.target.value)} className="w-[108px]">
            <option value="">全部年级</option>
            {(facets?.grades ?? []).map((item) => (
              <option key={item.grade} value={item.grade}>
                {item.grade}
              </option>
            ))}
          </Select>
          <Select value={activity} onChange={(event) => setActivity(event.target.value)} className="w-[116px]">
            <option value="">全部状态</option>
            <option value="online">在线</option>
            <option value="active">今日活跃</option>
            <option value="stale">已离线</option>
          </Select>
          <Select value={sort} onChange={(event) => setSort(event.target.value)} className="w-[126px]">
            <option value="lastSeen">最近活跃</option>
            <option value="opens">工具调用</option>
            <option value="sessions">会话数</option>
            <option value="firstSeen">首次活跃</option>
          </Select>
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={12} />}
              onClick={() => {
                setQ('')
                setVersion('')
                setChannel('')
                setGrade('')
                setActivity('')
                setSort('lastSeen')
              }}
            >
              重置
            </Button>
          ) : null}
          <span className="ml-auto hidden text-[11px] text-faint sm:block">
            共 {formatNumber(data?.total ?? 0)} 条结果
          </span>
        </div>
      </Card>

      {error ? (
        <Card>
          <EmptyState
            title="设备列表加载失败"
            description={error.message}
            action={
              <Button variant="outline" onClick={reload}>
                重新加载
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table table-clickable min-w-[980px]">
              <thead>
                <tr>
                  <th>设备</th>
                  <th>学校 / 年级</th>
                  <th>版本</th>
                  <th>渠道</th>
                  <th className="text-right">会话</th>
                  <th className="text-right">工具调用</th>
                  <th className="text-right">反馈</th>
                  <th>最近活跃</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data
                  ? Array.from({ length: 8 }, (_, index) => (
                      <tr key={index}>
                        <td colSpan={9}>
                          <Skeleton className="h-7 w-full" />
                        </td>
                      </tr>
                    ))
                  : (data?.items ?? []).map((device) => {
                      const status = DEVICE_STATUS[device.status] ?? DEVICE_STATUS.stale!
                      return (
                        <tr
                          key={device.sn}
                          onClick={() => navigate(`/telemetry/devices/${encodeURIComponent(device.sn)}`)}
                        >
                          <td>
                            <div className="flex items-center gap-2.5">
                              <span className="icon-tile bg-surface-3 text-muted">
                                <Tablet size={15} strokeWidth={1.7} />
                              </span>
                              <div className="min-w-0">
                                <div className="truncate text-[12.5px] font-medium text-ink">
                                  {device.manufacturer} {device.model}
                                </div>
                                <div className="flex items-center gap-1.5"><span className="font-mono text-[10.5px] text-faint">{device.sn}</span>{device.overrideCount > 0 ? <span className="rounded bg-warn-soft px-1 text-[9px] text-warn">{device.overrideCount} 项单独控制</span> : null}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="text-[12px] text-ink">{device.school || '—'}</div>
                            <div className="text-[10.5px] text-faint">{device.grade || '未填写'}</div>
                          </td>
                          <td>
                            <span className="num text-[12px] text-ink">{device.appVersion}</span>
                            <div className="text-[10px] text-faint">{device.osVersion}</div>
                          </td>
                          <td>
                            <Badge tone={device.channel === 'beta' ? 'violet' : 'neutral'}>
                              {CHANNEL_LABELS[device.channel] ?? device.channel}
                            </Badge>
                          </td>
                          <td className="num text-right text-[12px] text-ink">
                            {formatNumber(device.totalSessions)}
                          </td>
                          <td className="num text-right text-[12px] text-ink">
                            {formatNumber(device.totalOpens)}
                          </td>
                          <td className="num text-right text-[12px] text-muted">
                            {device.feedbackCount > 0 ? device.feedbackCount : '—'}
                          </td>
                          <td>
                            <div className="text-[12px] text-ink" title={formatRelative(device.lastSeenAt)}>
                              {relativeTime(device.lastSeenAt)}
                            </div>
                            <div className="text-[10px] text-faint">
                              {relativeTime(device.firstSeenAt)}首次活跃
                            </div>
                          </td>
                          <td>
                            <Badge tone={status.tone} dot>
                              {status.label}
                            </Badge>
                          </td>
                        </tr>
                      )
                    })}
              </tbody>
            </table>
          </div>
          {!loading && (data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={<Tablet size={18} />}
              title="没有匹配的设备"
              description="换一个关键词，或清空筛选条件再试。"
            />
          ) : null}
          {data ? (
            <Pagination page={data.page} pageCount={data.pageCount} total={data.total} onChange={setPage} />
          ) : null}
        </Card>
      )}

      <div className="mt-3 text-[10.5px] text-faint">
        设备 SN 由客户端从硬件序列号或系统安装标识生成，统一用作遥测、配置与反馈的主键；型号与学校仅用于排查问题。
      </div>
    </div>
  )
}

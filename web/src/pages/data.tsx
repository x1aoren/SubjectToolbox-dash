import { useMemo, useState } from 'react'
import {
  Database,
  ListFilter,
  MessageSquareText,
  ScrollText,
  ShieldAlert,
  Tablet,
  Trash2,
  TriangleExclamationPoint,
  Wrench,
} from 'lucide-react'
import { post } from '../lib/api'
import { errorMessage, useToast } from '../lib/app-context'
import { formatBytes, formatNumber } from '../lib/format'
import type { DataSummary, PurgeResponse } from '../lib/types'
import { useApi } from '../lib/useApi'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Modal,
  Skeleton,
  cn,
} from '../components/ui'

interface Category {
  key: string
  label: string
  description: string
  icon: typeof Database
  count: (data: DataSummary) => number
  warning?: string
}

const CATEGORIES: Category[] = [
  {
    key: 'events',
    label: '遥测事件',
    description: '会话开始/结束、工具打开/关闭、检索等原始事件',
    icon: ListFilter,
    count: (data) => data.events,
  },
  {
    key: 'errors',
    label: '崩溃记录',
    description: '客户端上报的异常堆栈与签名',
    icon: TriangleExclamationPoint,
    count: (data) => data.errors,
  },
  {
    key: 'feedback',
    label: '意见反馈',
    description: '反馈内容、公开回复与内部备注',
    icon: MessageSquareText,
    count: (data) => data.feedback,
  },
  {
    key: 'toolSync',
    label: '工具清单同步',
    description: '客户端上报的工具清单与设备覆盖记录',
    icon: Wrench,
    count: (data) => data.deviceTools + data.clientTools,
  },
  {
    key: 'devices',
    label: '设备档案',
    description: '设备列表、设备级开关，以及这些设备的遥测、崩溃与反馈',
    icon: Tablet,
    count: (data) => data.devices,
    warning: '会连同所有设备的遥测事件、崩溃和反馈一起清除',
  },
  {
    key: 'audit',
    label: '审计日志',
    description: '控制台上的登录、发布、权限等敏感操作记录',
    icon: ScrollText,
    count: (data) => data.auditLogs,
    warning: '本次清除操作仍会留下一条审计记录',
  },
]

export function DataPage(): React.JSX.Element {
  const { toast } = useToast()
  const summary = useApi<DataSummary>('/api/system/data-summary')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const data = summary.data

  const selectedCategories = useMemo(
    () => CATEGORIES.filter((category) => selected.has(category.key)),
    [selected],
  )

  function toggle(key: string): void {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function purge(): Promise<void> {
    if (confirm !== 'CLEAR') return
    setBusy(true)
    try {
      const result = await post<PurgeResponse>('/api/system/purge', {
        categories: selectedCategories.map((category) => category.key),
        confirm: 'CLEAR',
      })
      toast(
        `已清除：设备 ${formatNumber(result.deleted.devices)}、事件 ${formatNumber(result.deleted.events)}、崩溃 ${formatNumber(result.deleted.errors)}、反馈 ${formatNumber(result.deleted.feedback)}`,
        'success',
      )
      setOpen(false)
      setConfirm('')
      setSelected(new Set())
      summary.reload()
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!data && summary.loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-[420px] w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.02em] text-ink">
            数据管理
          </h1>
          <p className="mt-1 text-[12.5px] text-muted">
            选择性清除遥测、反馈或设备数据；清除不可恢复，建议先导出 CSV。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="neutral">数据库 {data ? formatBytes(data.dbBytes) : '—'}</Badge>
          <Button
            variant="danger"
            disabled={selected.size === 0}
            onClick={() => setOpen(true)}
          >
            <Trash2 size={15} /> 清除选中数据
          </Button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SmallStat label="设备" value={data?.devices ?? 0} />
        <SmallStat label="遥测事件" value={data?.events ?? 0} />
        <SmallStat label="意见反馈" value={data?.feedback ?? 0} />
        <SmallStat label="审计日志" value={data?.auditLogs ?? 0} />
      </div>

      <Card>
        <CardHeader
          title="选择要清除的数据"
          description="每类数据独立清除；选择「设备档案」会级联清除该设备的关联数据。"
          action={
            selected.size > 0 ? (
              <button
                type="button"
                className="text-[11.5px] text-muted hover:text-ink"
                onClick={() => setSelected(new Set())}
              >
                取消选择
              </button>
            ) : null
          }
        />
        <div className="divide-y divide-line/70">
          {CATEGORIES.map((category) => {
            const Icon = category.icon
            const checked = selected.has(category.key)
            return (
              <label
                key={category.key}
                className={cn(
                  'flex cursor-pointer items-start gap-3 px-5 py-4 transition-colors',
                  checked ? 'bg-danger-soft/30' : 'hover:bg-surface-2/60',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--danger)]"
                  checked={checked}
                  onChange={() => toggle(category.key)}
                />
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-ink">{category.label}</span>
                    <span className="font-mono text-[11px] text-faint">
                      {data ? formatNumber(category.count(data)) : '—'}
                    </span>
                    {category.warning ? <Badge tone="amber">注意</Badge> : null}
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-5 text-muted">
                    {category.description}
                  </span>
                  {category.warning ? (
                    <span className="mt-1 flex items-center gap-1 text-[11px] text-warn">
                      <ShieldAlert size={12} /> {category.warning}
                    </span>
                  ) : null}
                </span>
              </label>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 px-5 py-3">
          <span className="text-[11px] text-faint">
            账号、云端配置修订与接入密钥不在此处清除，避免误删后无法登录或下发。
          </span>
          <span className="text-[11.5px] text-muted">
            已选 {selected.size} 类
          </span>
        </div>
      </Card>

      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false)
        }}
        title="确认清除数据"
        description="此操作不可撤销。清除后相关列表会立即变空，数据库会尝试收缩。"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => void purge()}
              disabled={confirm !== 'CLEAR' || busy}
            >
              {busy ? '清除中…' : '确认清除'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-danger/30 bg-danger-soft/50 p-3">
            <div className="flex items-center gap-2 text-[12px] font-medium text-danger">
              <Trash2 size={14} /> 将清除以下数据
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selectedCategories.map((category) => (
                <Badge key={category.key} tone="red">
                  {category.label}
                </Badge>
              ))}
            </div>
            <div className="mt-2 text-[11px] leading-5 text-danger/90">
              如果选择了「设备档案」，所有设备及其遥测、崩溃、反馈也会一并清除。
            </div>
          </div>
          <Field label="输入 CLEAR 确认" hint="区分大小写">
            <Input
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="CLEAR"
              autoFocus
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

function SmallStat({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="text-[11px] text-faint">{label}</div>
      <div className="mt-1 text-[19px] font-semibold tabular-nums text-ink">
        {formatNumber(value)}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Check, Copy, GitCommitHorizontal, RotateCcw, Rocket } from 'lucide-react'
import { post } from '../lib/api'
import { errorMessage, useAuth, useToast } from '../lib/app-context'
import { useApi } from '../lib/useApi'
import { formatDateTime, formatRelative } from '../lib/format'
import type { RevisionSummary } from '../lib/types'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Skeleton,
  Textarea,
  cn,
} from '../components/ui'

interface RevisionListResponse {
  items: RevisionSummary[]
}

interface RevisionDetailResponse {
  revision: RevisionSummary & { config: unknown; active: boolean }
}

export function ControlHistoryPage(): React.JSX.Element {
  const { can } = useAuth()
  const { toast } = useToast()
  const list = useApi<RevisionListResponse>('/api/config/revisions')
  const [detailId, setDetailId] = useState<number | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState<RevisionSummary | null>(null)
  const [summary, setSummary] = useState('')
  const [rolling, setRolling] = useState(false)
  const detail = useApi<RevisionDetailResponse>(
    detailId !== null ? `/api/config/revisions/${detailId}` : null,
  )
  const canPublish = can('config.publish')

  const rollback = async (): Promise<void> => {
    if (!rollbackTarget) return
    setRolling(true)
    try {
      await post('/api/config/rollback', {
        revisionId: rollbackTarget.id,
        summary: summary.trim(),
      })
      toast(`已回滚到修订 #${rollbackTarget.versionNo}`, 'success')
      setRollbackTarget(null)
      setSummary('')
      list.reload()
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setRolling(false)
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.02em] text-ink">发布记录</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          每次发布都会生成一条不可修改的修订；回滚会以新的修订号重新发布旧内容。
        </p>
      </div>

      <Card>
        <CardHeader
          title={`修订历史${list.data ? ` · ${list.data.items.length} 条` : ''}`}
          description="按发布时间倒序，标记为「生效中」的是当前线上版本"
          action={<GitCommitHorizontal size={15} className="text-faint" />}
        />
        <div className="p-5 pt-3">
          {list.loading && !list.data ? (
            <div className="space-y-2">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : (list.data?.items.length ?? 0) === 0 ? (
            <EmptyState title="还没有发布记录" description="发布第一份云端配置后会出现在这里。" />
          ) : (
            <ol className="relative">
              {list.data!.items.map((revision, index) => (
                <li key={revision.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {index < list.data!.items.length - 1 ? (
                    <span className="absolute left-[15px] top-7 h-[calc(100%-16px)] w-px bg-line" />
                  ) : null}
                  <span
                    className={cn(
                      'relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
                      revision.active
                        ? 'border-brand/30 bg-brand-soft text-brand'
                        : 'border-line bg-surface-2 text-faint',
                    )}
                  >
                    {revision.active ? <Check size={14} /> : <GitCommitHorizontal size={14} />}
                  </span>
                  <div className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num text-[12.5px] font-semibold text-ink">
                        修订 #{revision.versionNo}
                      </span>
                      {revision.active ? (
                        <Badge tone="green" dot>
                          生效中
                        </Badge>
                      ) : null}
                      <span className="ml-auto text-[10.5px] text-faint" title={formatDateTime(revision.publishedAt)}>
                        {formatRelative(revision.publishedAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-5 text-muted">{revision.summary}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-faint">
                      <span>{revision.publishedBy || '—'} 发布</span>
                      <span>·</span>
                      <span>{(revision.size / 1024).toFixed(1)} KB</span>
                      <span>·</span>
                      <span>{formatDateTime(revision.publishedAt)}</span>
                    </div>
                    <div className="mt-2.5 flex items-center gap-1.5">
                      <Button variant="outline" size="xs" onClick={() => setDetailId(revision.id)}>
                        查看内容
                      </Button>
                      {canPublish && !revision.active ? (
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={<RotateCcw size={11} />}
                          onClick={() => {
                            setRollbackTarget(revision)
                            setSummary(`回滚至修订 #${revision.versionNo}：${revision.summary}`)
                          }}
                        >
                          回滚到此版本
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Card>

      <Modal
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        title={detail.data ? `修订 #${detail.data.revision.versionNo}` : '修订内容'}
        description={detail.data?.revision.summary}
        size="lg"
        footer={
          <>
            <Badge tone={detail.data?.revision.active ? 'green' : 'neutral'}>
              {detail.data?.revision.active ? '生效中' : '历史修订'}
            </Badge>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDetailId(null)}>
                关闭
              </Button>
              {detail.data ? (
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Copy size={12} />}
                  onClick={() =>
                    void navigator.clipboard.writeText(JSON.stringify(detail.data?.revision.config, null, 2))
                  }
                >
                  复制 JSON
                </Button>
              ) : null}
            </div>
          </>
        }
      >
        {detail.data ? (
          <>
            <div className="mb-2 flex items-center gap-2 text-[10.5px] text-faint">
              <span>{detail.data.revision.publishedBy} 发布</span>
              <span>·</span>
              <span>{formatDateTime(detail.data.revision.publishedAt)}</span>
              <span>·</span>
              <span>{(detail.data.revision.size / 1024).toFixed(1)} KB</span>
            </div>
            <pre className="code-block max-h-[54vh]">
              {JSON.stringify(detail.data.revision.config, null, 2)}
            </pre>
          </>
        ) : (
          <div className="py-10 text-center text-[12px] text-faint">正在加载…</div>
        )}
      </Modal>

      <Modal
        open={Boolean(rollbackTarget)}
        onClose={() => setRollbackTarget(null)}
        title="回滚云端配置"
        description="会以新的修订号重新发布这个历史版本，客户端下一次拉取时生效。"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setRollbackTarget(null)}>
              取消
            </Button>
            <Button
              size="sm"
              icon={<RotateCcw size={13} />}
              loading={rolling}
              onClick={() => void rollback()}
            >
              确认回滚
            </Button>
          </>
        }
      >
        <div className="rounded-xl border border-line bg-surface-2 p-3.5">
          <div className="flex items-center gap-2">
            <Badge tone="amber">目标修订 #{rollbackTarget?.versionNo}</Badge>
            <span className="text-[11px] text-faint">{rollbackTarget ? formatDateTime(rollbackTarget.publishedAt) : ''}</span>
          </div>
          <p className="mt-2 text-[12px] text-muted">{rollbackTarget?.summary}</p>
        </div>
        <div className="mt-4">
          <Field label="回滚说明">
            <Textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={2}
              maxLength={120}
              placeholder="说明回滚原因"
            />
          </Field>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-warn/25 bg-warn-soft px-3 py-2 text-[11px] leading-5 text-warn">
          <Rocket size={12} className="mt-0.5 shrink-0" />
          回滚会覆盖当前的草稿与线上配置，未发布的草稿修改会丢失。
        </div>
      </Modal>

      <div className="mt-3 text-[10.5px] text-faint">
        提示：回滚不会删除已有的修订记录，所有历史都保留可查。
      </div>
    </div>
  )
}

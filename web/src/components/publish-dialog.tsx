import { useEffect, useState } from 'react'
import { Rocket } from 'lucide-react'
import { post } from '../lib/api'
import { errorMessage, useToast } from '../lib/app-context'
import type { ConfigPayload } from '../lib/types'
import { Button, Modal, Textarea } from './ui'

export function PublishDialog({
  open,
  onClose,
  payload,
  onPublished,
}: {
  open: boolean
  onClose: () => void
  payload: ConfigPayload | null
  onPublished: () => void
}): React.JSX.Element {
  const [summary, setSummary] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      setSummary('')
      setError(null)
    }
  }, [open])

  const publish = async (): Promise<void> => {
    setPublishing(true)
    setError(null)
    try {
      await post('/api/config/publish', { summary: summary.trim() })
      toast('云端配置已发布', 'success')
      onPublished()
      onClose()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setPublishing(false)
    }
  }

  const changes = payload?.status.changes ?? []

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="发布云端配置"
      description="发布会立即替换线上修订，客户端下次拉取配置时生效。"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={publishing}>
            取消
          </Button>
          <Button
            icon={<Rocket size={14} />}
            onClick={() => void publish()}
            loading={publishing}
            disabled={changes.length === 0}
          >
            确认发布
          </Button>
        </>
      }
    >
      <div className="rounded-xl border border-line bg-surface-2 p-3.5">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">本次变更</div>
        {changes.length === 0 ? (
          <p className="text-[12px] text-muted">草稿与线上配置一致，没有需要发布的修改。</p>
        ) : (
          <ul className="space-y-1.5">
            {changes.map((change) => (
              <li key={change.key} className="flex items-start gap-2 text-[12px]">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                <span className="text-ink">
                  <span className="font-medium">{change.label}</span>
                  <span className="text-muted"> · {change.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4">
        <label htmlFor="publish-summary" className="field-label">
          修订说明
        </label>
        <Textarea
          id="publish-summary"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="例如：关闭电子教材入口，补充期中考试公告"
          maxLength={120}
          rows={2}
        />
        <p className="field-hint">会写入发布记录与审计日志，建议写清楚这次调整的原因。</p>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-[12px] text-danger">
          {error}
        </div>
      ) : null}
    </Modal>
  )
}

export function SaveBar({
  dirty,
  saving,
  onSave,
  onReset,
  canEdit,
}: {
  dirty: boolean
  saving: boolean
  onSave: () => void
  onReset: () => void
  canEdit: boolean
}): React.JSX.Element | null {
  if (!canEdit) return null
  if (!dirty && !saving) return null
  return (
    <div className="sticky bottom-4 z-20 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-[var(--shadow-pop)] backdrop-blur">
      <div className="flex items-center gap-2 text-[12px]">
        <span className={dirty ? 'h-2 w-2 rounded-full bg-warn' : 'h-2 w-2 rounded-full bg-positive'} />
        <span className="text-ink">{dirty ? '有未保存的草稿修改' : '草稿已保存'}</span>
        <span className="text-faint">保存草稿不会立即下发给客户端</span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onReset} disabled={!dirty || saving}>
          放弃修改
        </Button>
        <Button size="sm" onClick={onSave} loading={saving} disabled={!dirty}>
          保存草稿
        </Button>
      </div>
    </div>
  )
}

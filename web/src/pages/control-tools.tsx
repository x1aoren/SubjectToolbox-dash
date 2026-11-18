import { useState } from 'react'
import { Power, Rocket, Save, Undo2 } from 'lucide-react'
import { useAuth, useCatalog, useToast } from '../lib/app-context'
import { useDraftConfig } from '../lib/use-draft'
import { errorMessage } from '../lib/app-context'
import {
  CHANNEL_LABELS,
  SUBJECT_COLORS,
  SUBJECT_NAMES,
  TOOL_KIND_META,
} from '../lib/format'
import type { RemoteConfig } from '../lib/types'
import { PublishDialog, SaveBar } from '../components/publish-dialog'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  Skeleton,
  Switch,
  cn,
} from '../components/ui'

export function ControlToolsPage(): React.JSX.Element {
  const { can } = useAuth()
  const { toolById } = useCatalog()
  const { toast } = useToast()
  const { payload, draft, setDraft, dirty, saving, save, reset, reload, loading } = useDraftConfig()
  const [publishOpen, setPublishOpen] = useState(false)
  const canEdit = can('config.edit')
  const canPublish = can('config.publish')

  if (!draft) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-[420px] w-full rounded-2xl" />
      </div>
    )
  }

  const updateTool = (toolId: string, patch: Partial<RemoteConfig['tools'][number]>): void => {
    if (!draft) return
    setDraft({
      ...draft,
      tools: draft.tools.map((tool) => (tool.toolId === toolId ? { ...tool, ...patch } : tool)),
    })
  }

  const toggleChannel = (toolId: string, channel: string): void => {
    const tool = draft.tools.find((item) => item.toolId === toolId)
    if (!tool) return
    const next = tool.channels.includes(channel)
      ? tool.channels.filter((item) => item !== channel)
      : [...tool.channels, channel]
    updateTool(toolId, { channels: next.length > 0 ? next : tool.channels })
  }

  const enabledCount = draft.tools.filter((tool) => tool.enabled).length
  const publishChanges = payload?.status.changes ?? []

  const handleSave = async (): Promise<void> => {
    try {
      await save()
      toast('草稿已保存，尚未下发给客户端', 'success')
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.02em] text-ink">工具开关</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            停用的工具在客户端仍会显示（置灰并标注已停用），点击会弹出停用原因；低于最低版本的设备会收到提示。
            <span className="ml-1 text-ink">
              当前启用 {enabledCount} / {draft.tools.length}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canPublish ? (
            <Button
              size="sm"
              icon={<Rocket size={13} />}
              disabled={!payload?.status.hasChanges && !dirty}
              onClick={() => {
                if (dirty) {
                  toast('请先保存草稿，再发布配置', 'info')
                  return
                }
                setPublishOpen(true)
              }}
            >
              发布配置
            </Button>
          ) : null}
        </div>
      </div>

      {!canEdit ? (
        <Card className="mb-3 border-warn/30 bg-warn-soft/40 px-4 py-2.5 text-[11.5px] text-warn">
          当前角色只能查看工具开关，修改需要「编辑云端配置」权限。
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader
          title="逐工具控制"
          description="开关只影响客户端的可用状态，不会删除客户端已缓存的内容；停用的工具仍会在原位显示"
          action={
            canEdit ? (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      tools: draft.tools.map((tool) => ({ ...tool, enabled: true })),
                    })
                  }
                >
                  全部启用
                </Button>
              </div>
            ) : null
          }
        />

        <div className="overflow-x-auto">
          <table className="table min-w-[1040px]">
            <thead>
              <tr>
                <th className="w-[268px]">工具</th>
                <th className="w-[110px]">状态</th>
                <th className="w-[150px]">最低版本</th>
                <th className="w-[190px]">下发渠道</th>
                <th>停用原因（全局）</th>
              </tr>
            </thead>
            <tbody>
              {draft.tools.map((tool) => {
                const meta = toolById.get(tool.toolId)
                const parent = meta?.parentId ? toolById.get(meta.parentId) : undefined
                const kindMeta = TOOL_KIND_META[meta?.kind ?? 'tool'] ?? TOOL_KIND_META.tool!
                const accent = SUBJECT_COLORS[meta?.subjectId ?? 'other'] ?? 'var(--brand)'
                return (
                  <tr key={tool.toolId} className={cn(!tool.enabled && 'opacity-60')}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span
                          className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px]"
                          style={{
                            background: `color-mix(in srgb, ${accent} 12%, var(--surface))`,
                            color: accent,
                          }}
                        >
                          {meta?.glyph ?? '·'}
                        </span>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <div className="truncate text-[12.5px] font-medium text-ink">
                              {parent ? <span className="text-muted">{parent.title} › </span> : null}
                              {meta?.title ?? tool.toolId}
                            </div>
                            {meta?.kind && meta.kind !== 'tool' ? (
                              <Badge tone={kindMeta.tone} className="shrink-0">
                                {kindMeta.label}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-faint">
                            <span>{SUBJECT_NAMES[meta?.subjectId ?? 'other']}</span>
                            <span>·</span>
                            <span className="truncate font-mono">{tool.toolId}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={tool.enabled}
                          disabled={!canEdit}
                          label={`启用 ${meta?.title ?? tool.toolId}`}
                          onChange={(checked) => updateTool(tool.toolId, { enabled: checked })}
                        />
                        <span className="text-[11px] text-muted">{tool.enabled ? '启用' : '停用'}</span>
                      </div>
                    </td>
                    <td>
                      <Input
                        value={tool.minVersion}
                        disabled={!canEdit}
                        onChange={(event) => updateTool(tool.toolId, { minVersion: event.target.value })}
                        className="h-8 w-[92px] font-mono text-[11.5px]"
                        placeholder="1.0.0"
                      />
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {(['stable', 'beta'] as const).map((channel) => {
                          const active = tool.channels.includes(channel)
                          return (
                            <button
                              key={channel}
                              type="button"
                              disabled={!canEdit}
                              onClick={() => toggleChannel(tool.toolId, channel)}
                              className={cn(
                                'rounded-full border px-2 py-0.5 text-[10.5px] transition',
                                active
                                  ? 'border-brand/30 bg-brand-soft text-brand-strong'
                                  : 'border-line bg-surface text-faint hover:text-muted',
                                !canEdit && 'cursor-not-allowed',
                              )}
                            >
                              {CHANNEL_LABELS[channel]}
                            </button>
                          )
                        })}
                      </div>
                    </td>
                    <td>
                      <Input
                        value={tool.disabledReason ?? ''}
                        disabled={!canEdit}
                        onChange={(event) =>
                          updateTool(tool.toolId, { disabledReason: event.target.value })
                        }
                        placeholder="留空则使用客户端默认文案"
                        title="留空则使用客户端默认文案（学校管理员暂时关闭了这个工具）"
                        className="h-8 text-[11.5px]"
                        maxLength={120}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Card className="px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] text-faint">
            <Power size={12} /> 停用工具
          </div>
          <div className="num mt-1 text-[18px] font-semibold text-ink">
            {draft.tools.filter((tool) => !tool.enabled).length} 个
          </div>
        </Card>
        <Card className="px-4 py-3">
          <div className="text-[11px] text-faint">草稿状态</div>
          <div className="mt-1 flex items-center gap-2">
            <Badge tone={dirty ? 'amber' : 'green'} dot>
              {dirty ? '未保存修改' : '已保存'}
            </Badge>
          </div>
        </Card>
        <Card className="px-4 py-3">
          <div className="text-[11px] text-faint">线上修订</div>
          <div className="mt-1 text-[13px] font-medium text-ink">
            #{payload?.activeRevision?.versionNo ?? '—'} · {payload?.activeRevision?.publishedBy ?? '—'}
          </div>
        </Card>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[11px] leading-5 text-muted">
        <Undo2 size={13} className="mt-0.5 shrink-0 text-faint" />
        <p>
          发布后如果发现配置有误，可以在「发布记录」里回滚到上一修订。停用工具不会清空用户本地的生词本、置顶等个性化数据，
          重新启用后会自动恢复。
        </p>
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={() => void handleSave()} onReset={reset} canEdit={canEdit} />

      <PublishDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        payload={payload}
        onPublished={() => {
          reload()
          toast('云端配置已发布', 'success')
        }}
      />

      <div className="mt-3 flex items-center gap-2 text-[10.5px] text-faint">
        <Save size={11} />
        保存草稿不会立即生效，需要发布后客户端才能拉到新配置。
      </div>
      {loading ? <span className="text-[10px] text-faint">正在同步配置…</span> : null}
      {publishChanges.length > 0 ? null : null}
    </div>
  )
}

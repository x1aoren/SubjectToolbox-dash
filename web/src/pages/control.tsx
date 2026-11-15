import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Copy,
  FileJson,
  GitCommitHorizontal,
  Layers,
  Megaphone,
  Power,
  Rocket,
  Wrench,
} from 'lucide-react'
import { useApi } from '../lib/useApi'
import { useAuth } from '../lib/app-context'
import { useDraftConfig } from '../lib/use-draft'
import {
  formatDateTime,
  formatPercent,
  relativeTime,
} from '../lib/format'
import type { ConfigPreview, ToolSyncResponse } from '../lib/types'
import { PublishDialog } from '../components/publish-dialog'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Modal,
  ProgressBar,
  Segmented,
  Select,
  Skeleton,
} from '../components/ui'

function SectionRow({
  icon: Icon,
  title,
  description,
  meta,
  to,
  accent = 'var(--brand)',
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
  title: string
  description: string
  meta: React.ReactNode
  to: string
  accent?: string
}): React.JSX.Element {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 border-b border-line px-5 py-3.5 transition last:border-0 hover:bg-surface-2"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
        style={{ background: `color-mix(in srgb, ${accent} 12%, var(--surface))`, color: accent }}
      >
        <Icon size={15} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium text-ink">{title}</div>
        <div className="truncate text-[11px] text-faint">{description}</div>
      </div>
      <div className="shrink-0 text-right text-[11px] text-muted">{meta}</div>
      <ChevronRight size={14} className="shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-ink" />
    </Link>
  )
}

export function ControlOverviewPage(): React.JSX.Element {
  const { can } = useAuth()
  const { payload, loading, reload } = useDraftConfig()
  const [publishOpen, setPublishOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [previewSource, setPreviewSource] = useState<'published' | 'draft'>('published')
  const [version, setVersion] = useState('1.1.0')
  const [channel, setChannel] = useState('stable')
  const preview = useApi<ConfigPreview>(
    `/api/config/preview?source=published&version=${version}&channel=${channel}&sn=stb-preview-demo`,
  )
  const toolSync = useApi<ToolSyncResponse>('/api/tools/sync')
  const modalPreview = useApi<ConfigPreview>(
    previewOpen
      ? `/api/config/preview?source=${previewSource}&version=${version}&channel=${channel}&sn=stb-preview-demo`
      : null,
  )

  if (!payload) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid gap-3 xl:grid-cols-12">
          <Skeleton className="h-[360px] rounded-2xl xl:col-span-7" />
          <Skeleton className="h-[360px] rounded-2xl xl:col-span-5" />
        </div>
      </div>
    )
  }

  const { draft, status, activeRevision } = payload
  const disabledTools = draft.tools.filter((tool) => !tool.enabled)
  const activeAnnouncements = draft.announcements.filter((item) => item.enabled)
  const featuresOn = draft.features.filter((feature) => feature.enabled)
  const canEdit = can('config.edit')
  const canPublish = can('config.publish')

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.02em] text-ink">配置概览</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            云端配置以修订为单位发布 · 客户端在每次启动与每小时拉取时生效
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={<FileJson size={13} />} onClick={() => setPreviewOpen(true)}>
            预览下发内容
          </Button>
          {canPublish ? (
            <Button
              size="sm"
              icon={<Rocket size={13} />}
              disabled={!status.hasChanges}
              onClick={() => setPublishOpen(true)}
            >
              发布配置
            </Button>
          ) : null}
        </div>
      </div>

      {/* 草稿状态 */}
      <Card
        className={`mb-3 flex flex-wrap items-center gap-3 px-4 py-3.5 ${
          status.hasChanges ? 'border-warn/35 bg-warn-soft/40' : 'border-positive/25 bg-positive-soft/30'
        }`}
      >
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full ${
            status.hasChanges ? 'bg-warn/15 text-warn' : 'bg-positive/15 text-positive'
          }`}
        >
          {status.hasChanges ? <CircleAlert size={16} /> : <CheckCircle2 size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-medium text-ink">
            {status.hasChanges ? `草稿有 ${status.changes.reduce((sum, item) => sum + item.count, 0)} 项修改尚未发布` : '草稿与线上配置一致'}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            {status.hasChanges
              ? status.changes.map((change) => (
                  <span key={change.key} className="rounded-full bg-surface/80 px-2 py-0.5">
                    {change.label} · {change.detail}
                  </span>
                ))
              : `线上修订 #${activeRevision?.versionNo ?? '—'} 发布于 ${relativeTime(activeRevision?.publishedAt)}，更新人 ${activeRevision?.publishedBy ?? '—'}`}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10.5px] text-faint">
          草稿更新于 {relativeTime(status.updatedAt)} · {status.updatedBy || '—'}
        </div>
      </Card>

      <div className="grid gap-3 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-7">
          <Card className="overflow-hidden">
            <CardHeader
              title="配置分区"
              description={canEdit ? '修改后先保存草稿，确认无误再发布' : '当前角色可查看，不能修改配置'}
              className="pb-3"
            />
            <div className="mt-1 border-t border-line">
              <SectionRow
                icon={Power}
                title="工具开关"
                description={
                  disabledTools.length > 0
                    ? `已停用：${disabledTools.map((tool) => tool.toolId).join('、')}`
                    : '全部 11 个工具当前均已启用'
                }
                meta={`${draft.tools.length - disabledTools.length} / ${draft.tools.length} 启用`}
                to="/control/tools"
              />
              <SectionRow
                icon={Megaphone}
                title="公告"
                description={
                  activeAnnouncements.length > 0
                    ? activeAnnouncements.map((item) => item.title).slice(0, 2).join(' · ')
                    : '当前没有启用中的公告'
                }
                meta={`${draft.announcements.filter((item) => item.enabled).length} 条启用`}
                to="/control/announcements"
                accent="var(--info)"
              />
              <SectionRow
                icon={Rocket}
                title="版本策略"
                description={`最低支持 v${draft.release.minSupportedVersion} · ${
                  draft.release.forceUpdate ? '低于最低版本将强制更新' : '低于最低版本仅提示'
                }`}
                meta={`最新 v${draft.release.latestVersion}`}
                to="/control/release"
                accent="var(--violet)"
              />
              <SectionRow
                icon={Layers}
                title="内容清单"
                description={`内容版本 ${draft.content.version} · ${draft.content.notes || '未填写说明'}`}
                meta={`灰度 ${formatPercent(draft.content.rollout / 100, 0)}`}
                to="/control/release"
                accent="var(--warn)"
              />
              <SectionRow
                icon={Wrench}
                title="维护模式与功能开关"
                description={
                  draft.maintenance.enabled
                    ? `维护模式开启中：${draft.maintenance.message}`
                    : `${featuresOn.length} / ${draft.features.length} 个功能开关开启`
                }
                meta={draft.maintenance.enabled ? '维护中' : '正常'}
                to="/control/release"
                accent="var(--faint)"
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="最近一次发布"
              description="发布记录保留每一次修订，可随时回滚"
              action={
                can('config.view') ? (
                  <Link to="/control/history" className="flex items-center gap-0.5 text-[11.5px] text-muted hover:text-ink">
                    全部记录
                    <ChevronRight size={13} />
                  </Link>
                ) : null
              }
            />
            <div className="p-5 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <GitCommitHorizontal size={15} />
                </span>
                <span className="num text-[13px] font-semibold text-ink">
                  修订 #{activeRevision?.versionNo ?? '—'}
                </span>
                <Badge tone="green" dot>
                  生效中
                </Badge>
                <span className="ml-auto text-[10.5px] text-faint">
                  {formatDateTime(activeRevision?.publishedAt)}
                </span>
              </div>
              <p className="mt-2 text-[12px] leading-5 text-muted">{activeRevision?.summary}</p>
              <div className="mt-2 flex items-center gap-3 text-[10.5px] text-faint">
                <span>发布人 {activeRevision?.publishedBy ?? '—'}</span>
                <span>·</span>
                <span>{((activeRevision?.size ?? 0) / 1024).toFixed(1)} KB</span>
                <span>·</span>
                <span>所有渠道</span>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-3 xl:col-span-5">
          <Card>
            <CardHeader
              title="下发预览"
              description="按客户端版本与渠道计算生效结果"
              action={
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="text-[11.5px] text-muted hover:text-ink"
                >
                  查看 JSON
                </button>
              }
            />
            <div className="p-5 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={version} onChange={(event) => setVersion(event.target.value)} className="h-8 w-[126px] text-[12px]">
                  <option value="1.1.0">1.1.0</option>
                  <option value="1.0.0">1.0.0</option>
                  <option value="0.9.9">0.9.9</option>
                </Select>
                <Select value={channel} onChange={(event) => setChannel(event.target.value)} className="h-8 w-[108px] text-[12px]">
                  <option value="stable">稳定版</option>
                  <option value="beta">内测版</option>
                </Select>
                <button
                  type="button"
                  onClick={() => preview.reload()}
                  className="text-[11px] text-brand hover:text-brand-strong"
                >
                  重新计算
                </button>
              </div>

              {preview.data ? (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-[11.5px]">
                    <span className="text-muted">可用工具</span>
                    <span className="num text-ink">
                      {Object.values(preview.data.config.tools).filter((tool) => tool.enabled).length} /{' '}
                      {Object.keys(preview.data.config.tools).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-[11.5px]">
                    <span className="text-muted">命中公告</span>
                    <span className="num text-ink">{preview.data.config.announcements.length} 条</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-[11.5px]">
                    <span className="text-muted">内容灰度（设备桶）</span>
                    <span className="num text-ink">
                      {preview.data.config.content.available ? '已命中' : '未命中'} · bucket{' '}
                      {preview.data.config.content.bucket}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-[11.5px]">
                    <span className="text-muted">版本检查</span>
                    <span className="text-ink">
                      {preview.data.config.release.updateRequired
                        ? '需要强制更新'
                        : preview.data.config.release.updateAvailable
                          ? '有可用更新'
                          : '已是最新'}
                    </span>
                  </div>
                  {preview.data.config.maintenance.enabled ? (
                    <div className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[11.5px] text-warn">
                      维护模式生效：{preview.data.config.maintenance.message}
                    </div>
                  ) : null}
                  <p className="text-[10px] leading-4 text-faint">
                    预览使用固定设备 SN 计算灰度桶；线上客户端按自己的设备 SN 取模。
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              )}
            </div>
          </Card>


          <Card>
            <CardHeader
              title="工具清单同步"
              description="客户端在握手时上报实际注册的工具，用于校准云端列表"
              action={
                <button
                  type="button"
                  onClick={() => setSyncOpen(true)}
                  className="text-[11.5px] text-muted hover:text-ink"
                >
                  查看清单
                </button>
              }
            />
            <div className="p-5 pt-3">
              <div className="flex items-end justify-between">
                <div className="num text-[26px] font-semibold leading-none tracking-tight text-ink">
                  {toolSync.data?.syncedCount ?? '—'}
                  <span className="ml-1 text-[12px] font-normal text-faint">
                    / {toolSync.data?.expectedCount ?? 11}
                  </span>
                </div>
                <Badge
                  tone={
                    !toolSync.data
                      ? 'neutral'
                      : toolSync.data.syncedCount === toolSync.data.expectedCount &&
                          toolSync.data.titleMismatch.length === 0
                        ? 'green'
                        : 'amber'
                  }
                  dot
                >
                  {!toolSync.data
                    ? '加载中'
                    : toolSync.data.syncedCount === toolSync.data.expectedCount
                      ? '已同步'
                      : `${toolSync.data.missing.length} 个待同步`}
                </Badge>
              </div>
              <div className="mt-2">
                <ProgressBar
                  value={
                    toolSync.data
                      ? toolSync.data.syncedCount / Math.max(1, toolSync.data.expectedCount)
                      : 0
                  }
                  color="var(--brand)"
                />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-surface-2 px-2 py-2">
                  <div className="text-[9.5px] text-faint">上报设备</div>
                  <div className="num text-[13px] font-semibold text-ink">
                    {toolSync.data?.deviceCount ?? '—'}
                  </div>
                </div>
                <div className="rounded-lg bg-surface-2 px-2 py-2">
                  <div className="text-[9.5px] text-faint">单独控制</div>
                  <div className="num text-[13px] font-semibold text-ink">
                    {toolSync.data?.overrideCount ?? '—'}
                  </div>
                </div>
                <div className="rounded-lg bg-surface-2 px-2 py-2">
                  <div className="text-[9.5px] text-faint">最后上报</div>
                  <div className="text-[10.5px] font-medium text-ink">
                    {toolSync.data?.lastReportedAt ? relativeTime(toolSync.data.lastReportedAt) : '—'}
                  </div>
                </div>
              </div>
              {toolSync.data && (toolSync.data.missing.length > 0 || toolSync.data.titleMismatch.length > 0) ? (
                <div className="mt-2 rounded-lg border border-warn/25 bg-warn-soft px-3 py-2 text-[10.5px] leading-4 text-warn">
                  {toolSync.data.missing.length > 0
                    ? `${toolSync.data.missing.length} 个云端工具还没有客户端上报；`
                    : ''}
                  {toolSync.data.titleMismatch.length > 0
                    ? `${toolSync.data.titleMismatch.length} 个工具名称与云端不一致。`
                    : ''}
                </div>
              ) : null}
            </div>
          </Card>
          <Card>
            <CardHeader title="接入提示" description="客户端只需要两个接口" />
            <div className="space-y-2.5 p-5 pt-3">
              <div className="rounded-lg border border-line bg-surface-2 p-3">
                <div className="flex items-center gap-2">
                  <Badge tone="blue">GET</Badge>
                  <code className="font-mono text-[11px] text-ink">/v1/config</code>
                </div>
                <p className="mt-1.5 text-[10.5px] leading-4 text-faint">
                  带版本、渠道与设备 SN，返回工具开关、公告与版本策略。
                </p>
              </div>
              <div className="rounded-lg border border-line bg-surface-2 p-3">
                <div className="flex items-center gap-2">
                  <Badge tone="brand">POST</Badge>
                  <code className="font-mono text-[11px] text-ink">/v1/telemetry/events</code>
                </div>
                <p className="mt-1.5 text-[10.5px] leading-4 text-faint">
                  批量上报工具打开、检索与会话结束事件。
                </p>
              </div>
              <Link to="/integration" className="flex items-center gap-0.5 text-[11.5px] text-brand hover:text-brand-strong">
                完整接入文档
                <ChevronRight size={13} />
              </Link>
            </div>
          </Card>
        </div>
      </div>

      <PublishDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        payload={payload}
        onPublished={() => reload()}
      />

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="下发内容预览"
        description="这是客户端调用 /v1/config 时会拿到的完整 JSON。"
        size="lg"
        footer={
          <>
            <Segmented
              options={[
                { value: 'published', label: '线上修订' },
                { value: 'draft', label: '当前草稿' },
              ]}
              value={previewSource}
              onChange={setPreviewSource}
            />
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPreviewOpen(false)}>
                关闭
              </Button>
              {modalPreview.data ? (
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Copy size={12} />}
                  onClick={() => void navigator.clipboard.writeText(JSON.stringify(modalPreview.data?.config, null, 2))}
                >
                  复制 JSON
                </Button>
              ) : null}
            </div>
          </>
        }
      >
        {modalPreview.data ? (
          <>
            <div className="mb-2 flex items-center gap-2 text-[11px] text-faint">
              <Badge tone="neutral">revision #{modalPreview.data.revision?.versionNo ?? '—'}</Badge>
              <Badge tone={previewSource === 'draft' ? 'amber' : 'green'}>
                {previewSource === 'draft' ? '尚未发布' : '线上生效'}
              </Badge>
              <span>version {version} · {channel}</span>
            </div>
            <pre className="code-block max-h-[52vh]">
              {JSON.stringify(modalPreview.data.config, null, 2)}
            </pre>
          </>
        ) : (
          <div className="py-10 text-center text-[12px] text-faint">正在计算…</div>
        )}
      </Modal>

      <Modal
        open={syncOpen}
        onClose={() => setSyncOpen(false)}
        title="客户端工具清单"
        description="设备在 handshake 时上报自己注册的工具；云端用它校准工具开关与标题。"
        size="lg"
        footer={
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSyncOpen(false)}>
              关闭
            </Button>
            <Button variant="outline" size="sm" onClick={() => toolSync.reload()}>
              重新同步
            </Button>
          </div>
        }
      >
        {toolSync.data ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-faint">
              <Badge tone={toolSync.data.missing.length === 0 ? 'green' : 'amber'} dot>
                {toolSync.data.syncedCount} / {toolSync.data.expectedCount} 个工具已同步
              </Badge>
              <span>{toolSync.data.deviceCount} 台设备上报过清单</span>
              {toolSync.data.lastReportedAt ? (
                <span>· 最近 {relativeTime(toolSync.data.lastReportedAt)}</span>
              ) : null}
            </div>
            <div className="overflow-hidden rounded-xl border border-line">
              <table className="table">
                <thead>
                  <tr>
                    <th>工具</th>
                    <th>客户端上报</th>
                    <th className="text-right">设备</th>
                    <th>最近上报</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {toolSync.data.tools.map((tool) => (
                    <tr key={tool.toolId}>
                      <td>
                        <div className="text-[12px] font-medium text-ink">
                          {tool.extra ? tool.title : tool.expectedTitle}
                        </div>
                        <div className="font-mono text-[10px] text-faint">{tool.toolId}</div>
                      </td>
                      <td className="text-[12px] text-muted">{tool.synced ? tool.title : '—'}</td>
                      <td className="num text-right text-[12px] text-ink">{tool.devices}</td>
                      <td className="text-[10.5px] text-faint">
                        {tool.lastReportedAt ? relativeTime(tool.lastReportedAt) : '从未'}
                      </td>
                      <td>
                        {tool.extra ? (
                          <Badge tone="violet">云端未登记</Badge>
                        ) : !tool.synced ? (
                          <Badge tone="amber">待同步</Badge>
                        ) : tool.titleMismatch ? (
                          <Badge tone="red">标题不一致</Badge>
                        ) : (
                          <Badge tone="green">一致</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-faint">
              如果客户端新增了工具但云端没有登记，会显示为「云端未登记」，此时无法在云端单独控制它；请同步更新
              server/catalog.ts 或重启后台完成收录。
            </p>
          </>
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}
      </Modal>
    </div>
  )
}

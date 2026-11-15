import { useEffect, useState } from 'react'
import { CalendarClock, Megaphone, Pencil, Pin, Plus, Rocket, Trash2 } from 'lucide-react'
import { useAuth, useToast } from '../lib/app-context'
import { useDraftConfig } from '../lib/use-draft'
import { ANNOUNCEMENT_LEVELS, formatDateTime, formatPercent, toneStyle } from '../lib/format'
import type { Announcement } from '../lib/types'
import { PublishDialog, SaveBar } from '../components/publish-dialog'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Switch,
  Textarea,
  cn,
} from '../components/ui'

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function announcementStatus(item: Announcement): { label: string; tone: 'green' | 'amber' | 'neutral' | 'red' } {
  if (!item.enabled) return { label: '已停用', tone: 'neutral' }
  const now = Date.now()
  if (item.startAt && Date.parse(item.startAt) > now) return { label: '待生效', tone: 'amber' }
  if (item.endAt && Date.parse(item.endAt) < now) return { label: '已过期', tone: 'red' }
  return { label: '生效中', tone: 'green' }
}

const EMPTY: Announcement = {
  id: '',
  title: '',
  body: '',
  level: 'info',
  channels: ['stable', 'beta'],
  enabled: true,
  pinned: false,
  startAt: null,
  endAt: null,
}

export function ControlAnnouncementsPage(): React.JSX.Element {
  const { can } = useAuth()
  const { toast } = useToast()
  const { payload, draft, setDraft, dirty, saving, save, reset, reload } = useDraftConfig()
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const canEdit = can('config.edit')
  const canPublish = can('config.publish')

  if (!draft) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-[360px] w-full rounded-2xl" />
      </div>
    )
  }

  const announcements = draft.announcements
  const active = announcements.filter((item) => announcementStatus(item).label === '生效中')
  const preview = announcements.find((item) => item.id === previewId) ?? active[0] ?? announcements[0] ?? null

  const saveAnnouncement = (item: Announcement): void => {
    if (!draft) return
    const exists = announcements.some((entry) => entry.id === item.id)
    const next = exists
      ? announcements.map((entry) => (entry.id === item.id ? item : entry))
      : [...announcements, { ...item, id: item.id || `ann-${Date.now().toString(36)}` }]
    setDraft({ ...draft, announcements: next })
    setEditing(null)
    toast('已写入草稿，保存后生效', 'success')
  }

  const remove = (id: string): void => {
    if (!draft) return
    setDraft({ ...draft, announcements: announcements.filter((item) => item.id !== id) })
    if (previewId === id) setPreviewId(null)
    toast('已从草稿移除，保存后生效', 'info')
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.02em] text-ink">公告</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            共 {announcements.length} 条 · 生效中 {active.length} 条 · 客户端首页以横幅展示，置顶的排在前面
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={() => setEditing({ ...EMPTY })}>
              新建公告
            </Button>
          ) : null}
          {canPublish ? (
            <Button
              size="sm"
              icon={<Rocket size={13} />}
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

      <div className="grid gap-3 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-7">
          {announcements.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Megaphone size={18} />}
                title="还没有公告"
                description="发布版本更新、校园网维护或考试安排时，可以在这里创建。"
                action={
                  canEdit ? (
                    <Button size="sm" variant="outline" onClick={() => setEditing({ ...EMPTY })}>
                      新建第一条公告
                    </Button>
                  ) : null
                }
              />
            </Card>
          ) : (
            announcements.map((item) => {
              const level = ANNOUNCEMENT_LEVELS[item.level] ?? ANNOUNCEMENT_LEVELS.info!
              const status = announcementStatus(item)
              return (
                <Card
                  key={item.id}
                  className={cn(
                    'p-4 transition',
                    preview?.id === item.id && 'ring-1 ring-brand/25',
                    !item.enabled && 'opacity-70',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={level.tone}>{level.label}</Badge>
                        <Badge tone={status.tone} dot>
                          {status.label}
                        </Badge>
                        {item.pinned ? (
                          <Badge tone="brand">
                            <Pin size={9} /> 置顶
                          </Badge>
                        ) : null}
                        <span className="text-[10.5px] text-faint">
                          {item.channels.map((channel) => (channel === 'beta' ? '内测' : '稳定')).join(' / ')}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPreviewId(item.id)}
                        className="mt-2 block text-left text-[13.5px] font-medium text-ink hover:text-brand"
                      >
                        {item.title}
                      </button>
                      <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-muted">{item.body}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-faint">
                        <CalendarClock size={11} />
                        <span>
                          {item.startAt ? formatDateTime(item.startAt) : '立即'} →{' '}
                          {item.endAt ? formatDateTime(item.endAt) : '长期'}
                        </span>
                      </div>
                    </div>
                    {canEdit ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Switch
                          checked={item.enabled}
                          label="启用公告"
                          onChange={(checked) =>
                            setDraft({
                              ...draft,
                              announcements: announcements.map((entry) =>
                                entry.id === item.id ? { ...entry, enabled: checked } : entry,
                              ),
                            })
                          }
                        />
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={<Pencil size={11} />}
                          onClick={() => setEditing({ ...item })}
                        >
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={<Trash2 size={11} />}
                          onClick={() => remove(item.id)}
                          className="text-danger hover:bg-danger-soft"
                        >
                          移除
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </Card>
              )
            })
          )}
        </div>

        <div className="space-y-3 xl:col-span-5">
          <Card>
            <CardHeader title="客户端预览" description="近似 STB 首页横幅的实际样式" />
            <div className="p-5 pt-3">
              {preview ? (
                <div className="rounded-2xl border border-line bg-canvas p-3">
                  <div className="rounded-xl border border-line bg-surface p-3.5 shadow-[var(--shadow-card)]">
                    <div className="flex items-start gap-2.5">
                      <span
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px]"
                        style={{
                          background: toneStyle(ANNOUNCEMENT_LEVELS[preview.level]?.tone ?? 'blue').background,
                          color: toneStyle(ANNOUNCEMENT_LEVELS[preview.level]?.tone ?? 'blue').color,
                        }}
                      >
                        <Megaphone size={12} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-semibold text-ink">{preview.title}</div>
                        <p className="mt-1 whitespace-pre-wrap text-[11.5px] leading-5 text-muted">{preview.body}</p>
                        <div className="mt-2.5 flex items-center gap-2">
                          <span className="rounded-full bg-brand px-2.5 py-1 text-[10px] font-medium text-white dark:text-[#0d1512]">
                            知道了
                          </span>
                          <span className="text-[9.5px] text-faint">· 每个版本只提示一次</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center text-[12px] text-faint">选择一条公告查看预览</div>
              )}
              {announcements.length > 0 ? (
                <div className="mt-4">
                  <div className="mb-2 text-[10.5px] font-medium uppercase tracking-wide text-faint">快速切换</div>
                  <div className="flex flex-wrap gap-1.5">
                    {announcements.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setPreviewId(item.id)}
                        className={cn(
                          'max-w-full truncate rounded-full px-2.5 py-1 text-[10.5px] transition',
                          preview?.id === item.id
                            ? 'bg-brand-soft text-brand-strong'
                            : 'bg-surface-2 text-muted hover:text-ink',
                        )}
                      >
                        {item.title}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="排期说明" />
            <div className="space-y-2 px-5 pb-4 pt-2 text-[11.5px] leading-5 text-muted">
              <p>· 未填写开始时间表示立即生效，未填写结束时间表示长期有效。</p>
              <p>· 公告按渠道下发；内测版客户端会同时收到稳定版公告。</p>
              <p>· 置顶公告排在首页横幅最前，最多展示 3 条。</p>
            </div>
          </Card>
        </div>
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={() => void save().then(() => toast('草稿已保存', 'success')).catch(() => toast('保存失败', 'error'))} onReset={reset} canEdit={canEdit} />

      <AnnouncementModal
        value={editing}
        onClose={() => setEditing(null)}
        onSubmit={saveAnnouncement}
      />

      <PublishDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        payload={payload}
        onPublished={() => {
          reload()
          toast('云端配置已发布', 'success')
        }}
      />

      <div className="mt-3 text-[10.5px] text-faint">
        发布后客户端会在下次拉取配置时看到公告；已读状态由客户端本地记录，后台无法追踪阅读情况。
      </div>
    </div>
  )
}

function AnnouncementModal({
  value,
  onClose,
  onSubmit,
}: {
  value: Announcement | null
  onClose: () => void
  onSubmit: (announcement: Announcement) => void
}): React.JSX.Element {
  const [form, setForm] = useState<Announcement>(value ?? EMPTY)

  useEffect(() => {
    if (value) setForm(value)
  }, [value])

  const update = (patch: Partial<Announcement>): void => setForm((previous) => ({ ...previous, ...patch }))

  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title={value?.id ? '编辑公告' : '新建公告'}
      description="公告会随云端配置一起发布，先保存草稿再发布。"
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            size="sm"
            disabled={!form.title.trim() || !form.body.trim()}
            onClick={() => onSubmit(form)}
          >
            写入草稿
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="标题" required>
          <Input
            value={form.title}
            onChange={(event) => update({ title: event.target.value })}
            placeholder="例如：期中考试期间答疑与技术支持安排"
            maxLength={80}
          />
        </Field>
        <Field label="正文" required hint="建议 1–3 句，说明时间、影响和建议动作。">
          <Textarea
            value={form.body}
            onChange={(event) => update({ body: event.target.value })}
            rows={3}
            maxLength={500}
            placeholder="例如：11 月 20 日至 11 月 30 日，信息技术组每天 16:30–18:00 在综合楼三层值班…"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="级别">
            <Select
              value={form.level}
              onChange={(event) => update({ level: event.target.value as Announcement['level'] })}
            >
              <option value="info">通知</option>
              <option value="warning">提醒</option>
              <option value="critical">重要</option>
            </Select>
          </Field>
          <Field label="最低客户端版本" hint="留空表示所有版本可见">
            <Input
              value={form.minVersion ?? ''}
              onChange={(event) => update({ minVersion: event.target.value || undefined })}
              placeholder="例如 1.1.0"
              className="font-mono"
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="开始时间" hint="不填表示立即开始">
            <Input
              type="datetime-local"
              value={toLocalInput(form.startAt)}
              onChange={(event) => update({ startAt: fromLocalInput(event.target.value) })}
            />
          </Field>
          <Field label="结束时间" hint="不填表示长期有效">
            <Input
              type="datetime-local"
              value={toLocalInput(form.endAt)}
              onChange={(event) => update({ endAt: fromLocalInput(event.target.value) })}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-5 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
          <label className="flex items-center gap-2 text-[12px] text-ink">
            <Switch checked={form.enabled} label="启用" onChange={(checked) => update({ enabled: checked })} />
            启用
          </label>
          <label className="flex items-center gap-2 text-[12px] text-ink">
            <Switch checked={form.pinned} label="置顶" onChange={(checked) => update({ pinned: checked })} />
            置顶展示
          </label>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-faint">渠道</span>
            {(['stable', 'beta'] as const).map((channel) => {
              const checked = form.channels.includes(channel)
              return (
                <button
                  key={channel}
                  type="button"
                  onClick={() =>
                    update({
                      channels: checked
                        ? form.channels.filter((item) => item !== channel)
                        : [...form.channels, channel],
                    })
                  }
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[10.5px] transition',
                    checked
                      ? 'border-brand/30 bg-brand-soft text-brand-strong'
                      : 'border-line bg-surface text-faint',
                  )}
                >
                  {channel === 'stable' ? '稳定版' : '内测版'}
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] text-faint">
          <span>正文 {form.body.length} / 500 字</span>
          <span>灰度 {formatPercent(100, 0)} · 全渠道发布后生效</span>
        </div>
      </div>
    </Modal>
  )
}

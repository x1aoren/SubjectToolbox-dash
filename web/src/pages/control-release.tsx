import { useState } from 'react'
import {
  CalendarClock,
  Layers,
  Power,
  Rocket,
  ShieldAlert,
  Sparkles,
  ToggleRight,
} from 'lucide-react'
import { errorMessage, useAuth, useCatalog, useToast } from '../lib/app-context'
import { useDraftConfig } from '../lib/use-draft'
import { fromLocalInput, toLocalInput } from '../lib/date-input'
import { formatPercent, compareVersions } from '../lib/format'
import { PublishDialog, SaveBar } from '../components/publish-dialog'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Skeleton,
  Switch,
  Textarea,
  cn,
} from '../components/ui'

export function ControlReleasePage(): React.JSX.Element {
  const { can } = useAuth()
  const { catalog } = useCatalog()
  const { toast } = useToast()
  const { payload, draft, setDraft, dirty, saving, save, reset, reload } = useDraftConfig()
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

  const updateRelease = (patch: Partial<typeof draft.release>): void =>
    setDraft({ ...draft, release: { ...draft.release, ...patch } })
  const updateContent = (patch: Partial<typeof draft.content>): void =>
    setDraft({ ...draft, content: { ...draft.content, ...patch } })
  const updateMaintenance = (patch: Partial<typeof draft.maintenance>): void =>
    setDraft({ ...draft, maintenance: { ...draft.maintenance, ...patch } })

  const versionTooLow =
    compareVersions(draft.release.minSupportedVersion, draft.release.latestVersion) > 0

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.02em] text-ink">版本与内容</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            版本策略决定客户端是否提示更新；内容清单控制离线内容的灰度下发
          </p>
        </div>
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

      <div className="grid gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader
            title="版本策略"
            description="客户端每次启动会检查 /v1/config 中的 release 字段"
            action={<Badge tone="violet">1.1.0</Badge>}
          />
          <div className="grid gap-3.5 p-5 pt-3 sm:grid-cols-2">
            <Field label="最新版本名" hint="必须与 APK 的 versionName 一致">
              <Input
                value={draft.release.latestVersion}
                disabled={!canEdit}
                onChange={(event) => updateRelease({ latestVersion: event.target.value })}
                className="font-mono"
                list="release-versions"
              />
              <datalist id="release-versions">
                {(catalog?.releases ?? []).map((release) => (
                  <option key={release.versionName} value={release.versionName} />
                ))}
              </datalist>
            </Field>
            <Field label="versionCode">
              <Input
                type="number"
                min={1}
                value={draft.release.latestVersionCode}
                disabled={!canEdit}
                onChange={(event) => updateRelease({ latestVersionCode: Number(event.target.value) || 1 })}
                className="font-mono"
              />
            </Field>
            <Field
              label="最低支持版本"
              hint="低于该版本时会被要求更新；配合强制更新开关使用"
              error={versionTooLow ? '最低支持版本不能高于最新版本' : null}
            >
              <Input
                value={draft.release.minSupportedVersion}
                disabled={!canEdit}
                onChange={(event) => updateRelease({ minSupportedVersion: event.target.value })}
                className="font-mono"
              />
            </Field>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 sm:col-span-2">
              <div>
                <div className="text-[12px] font-medium text-ink">强制更新</div>
                <div className="text-[10.5px] text-faint">
                  低于最低支持版本时会显示更醒目的更新提示；不会阻止继续使用离线工具。
                </div>
              </div>
              <Switch
                checked={draft.release.forceUpdate}
                disabled={!canEdit}
                label="强制更新"
                onChange={(checked) => updateRelease({ forceUpdate: checked })}
              />
            </div>
            <Field label="更新说明" className="sm:col-span-2" hint="会展示在客户端的「发现新版本」提示里；学校平板通过应用市场更新，后台不提供下载地址">
              <Textarea
                value={draft.release.updateNotes}
                disabled={!canEdit}
                onChange={(event) => updateRelease({ updateNotes: event.target.value })}
                rows={4}
                maxLength={600}
              />
            </Field>
          </div>
        </Card>

        <div className="space-y-3 xl:col-span-5">
          <Card>
            <CardHeader
              title="内容清单"
              description="离线内容（古诗词、词库、方程式）的版本与灰度"
              action={<Layers size={15} className="text-faint" />}
            />
            <div className="space-y-3.5 p-5 pt-3">
              <Field label="内容版本" hint="对应 assets/content/manifest.json 的版本号">
                <Input
                  value={draft.content.version}
                  disabled={!canEdit}
                  onChange={(event) => updateContent({ version: event.target.value })}
                  className="font-mono"
                />
              </Field>
              <div>
                <div className="flex items-center justify-between">
                  <span className="field-label mb-0">灰度比例</span>
                  <span className="num text-[13px] font-semibold text-ink">
                    {draft.content.rollout}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={draft.content.rollout}
                  disabled={!canEdit}
                  onChange={(event) => updateContent({ rollout: Number(event.target.value) })}
                  className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3 accent-[var(--brand)]"
                  style={{ accentColor: 'var(--brand)' }}
                />
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[10px] text-faint">按设备 SN 哈希分桶，同一设备结果稳定</span>
                  <div className="flex gap-1">
                    {[0, 25, 50, 100].map((value) => (
                      <button
                        key={value}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => updateContent({ rollout: value })}
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] transition',
                          draft.content.rollout === value
                            ? 'bg-brand-soft text-brand-strong'
                            : 'text-faint hover:text-ink',
                        )}
                      >
                        {value}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <Field label="内容说明">
                <Textarea
                  value={draft.content.notes}
                  disabled={!canEdit}
                  onChange={(event) => updateContent({ notes: event.target.value })}
                  rows={2}
                  maxLength={200}
                />
              </Field>
              <div className="rounded-lg bg-surface-2 px-3 py-2 text-[10.5px] leading-4 text-faint">
                当前 {formatPercent(draft.content.rollout / 100, 0)} 的设备会命中这份内容；其余设备继续使用已缓存版本。
              </div>
            </div>
          </Card>

          <Card className={cn(draft.maintenance.enabled && 'border-warn/40')}>
            <CardHeader
              title="维护模式"
              description="开启后客户端首页展示维护提示"
              action={
                <Badge tone={draft.maintenance.enabled ? 'amber' : 'green'} dot>
                  {draft.maintenance.enabled ? '维护中' : '正常'}
                </Badge>
              }
            />
            <div className="space-y-3 p-5 pt-3">
              <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Power size={14} className={draft.maintenance.enabled ? 'text-warn' : 'text-faint'} />
                  <span className="text-[12px] text-ink">启用维护模式</span>
                </div>
                <Switch
                  checked={draft.maintenance.enabled}
                  disabled={!canEdit}
                  label="维护模式"
                  onChange={(checked) => updateMaintenance({ enabled: checked })}
                />
              </div>
              <Field label="维护提示">
                <Input
                  value={draft.maintenance.message}
                  disabled={!canEdit}
                  onChange={(event) => updateMaintenance({ message: event.target.value })}
                  placeholder="例如：今晚 22:00–23:00 进行词库更新，期间部分工具不可用"
                  maxLength={160}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="开始时间">
                  <Input
                    type="datetime-local"
                    value={toLocalInput(draft.maintenance.startAt)}
                    disabled={!canEdit}
                    onChange={(event) => updateMaintenance({ startAt: fromLocalInput(event.target.value) })}
                  />
                </Field>
                <Field label="结束时间">
                  <Input
                    type="datetime-local"
                    value={toLocalInput(draft.maintenance.endAt)}
                    disabled={!canEdit}
                    onChange={(event) => updateMaintenance({ endAt: fromLocalInput(event.target.value) })}
                  />
                </Field>
              </div>
            </div>
          </Card>
        </div>

        <Card className="xl:col-span-12">
          <CardHeader
            title="功能开关"
            description="给客户端预留的实验性与运营开关，键名与 STB 客户端约定一致"
            action={<Badge tone="brand">{draft.features.filter((feature) => feature.enabled).length} / {draft.features.length} 开启</Badge>}
          />
          <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
            {draft.features.map((feature) => (
              <div key={feature.key} className="flex items-start justify-between gap-3 bg-surface p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <ToggleRight size={13} className={feature.enabled ? 'text-brand' : 'text-faint'} />
                    <code className="truncate font-mono text-[11.5px] text-ink">{feature.key}</code>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-muted">{feature.description || '未填写说明'}</p>
                </div>
                <Switch
                  checked={feature.enabled}
                  disabled={!canEdit}
                  label={feature.key}
                  onChange={(checked) =>
                    setDraft({
                      ...draft,
                      features: draft.features.map((entry) =>
                        entry.key === feature.key ? { ...entry, enabled: checked } : entry,
                      ),
                    })
                  }
                />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[11px] leading-5 text-muted">
          <Rocket size={13} className="mt-0.5 shrink-0 text-faint" />
          强制更新只提升提示强度，不会影响已是最新版的设备，也不会阻止离线工具。
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[11px] leading-5 text-muted">
          <ShieldAlert size={13} className="mt-0.5 shrink-0 text-faint" />
          维护模式只是提示，不会阻止离线工具使用；真正停用工具请到「工具开关」。
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[11px] leading-5 text-muted">
          <Sparkles size={13} className="mt-0.5 shrink-0 text-faint" />
          内容热修通道默认关闭，开启前需要客户端支持按 manifest 增量更新。
        </div>
      </div>

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() =>
          void save()
            .then(() => toast('草稿已保存', 'success'))
            .catch((error) => toast(errorMessage(error), 'error'))
        }
        onReset={reset}
        canEdit={canEdit}
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

      <div className="mt-3 flex items-center gap-2 text-[10.5px] text-faint">
        <CalendarClock size={11} />
        版本策略与内容清单会随下一次发布一起生效，发布前可在「配置概览 → 下发预览」里检查。
      </div>
    </div>
  )
}

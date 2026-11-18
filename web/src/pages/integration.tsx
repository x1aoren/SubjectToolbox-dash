import { useState } from 'react'
import {
  BookOpen,
  CodeXml,
  KeyRound,
  MessageSquare,
  Radio,
  Send,
  ShieldCheck,
  Smartphone,
  Terminal,
  Wifi,
} from 'lucide-react'
import { useApi } from '../lib/useApi'
import { formatDateTime } from '../lib/format'
import type { IntegrationInfo } from '../lib/types'
import {
  Badge,
  Card,
  CardHeader,
  CopyButton,
  EmptyState,
  KeyValue,
  Skeleton,
} from '../components/ui'

const METHOD_TONE = { GET: 'blue', POST: 'brand' } as const

interface IntegrationEndpoint {
  id: string
  method: 'GET' | 'POST'
  path: string
  title: string
  description: string
  code: string
  /** 个别接口附带的响应示例（节选） */
  sample?: string
}

export function IntegrationPage(): React.JSX.Element {
  const { data, loading } = useApi<IntegrationInfo>('/api/integration')

  if (loading && !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-[420px] w-full rounded-2xl" />
      </div>
    )
  }

  if (!data) {
    return <EmptyState title="接入信息加载失败" description="请刷新页面重试。" />
  }

  const base = data.apiBase
  const key = '$STB_KEY'

  const endpoints: IntegrationEndpoint[] = [
    {
      id: 'handshake',
      method: 'POST' as const,
      path: '/v1/telemetry/handshake',
      title: '设备握手与配置下发',
      description:
        '客户端首次启动、版本变化或每小时恢复前台时调用。服务端据此登记设备，并在响应里直接返回生效中的云端配置，省掉一次 /v1/config 往返。',
      code: `curl -X POST "${base}/v1/telemetry/handshake" \\
  -H "Content-Type: application/json" \\
  -H "X-STB-Key: ${key}" \\
  -d '{
    "sn": "SN-8F3A2C91D4B6",
    "model": "MatePad 11",
    "manufacturer": "HUAWEI",
    "osVersion": "Android 12",
    "sdkInt": 31,
    "appVersion": "1.1.0",
    "versionCode": 2,
    "channel": "stable",
    "school": "市第二中学",
    "grade": "高二"
  }'`,
    },
    {
      id: 'events',
      method: 'POST' as const,
      path: '/v1/telemetry/events',
      title: '批量上报事件',
      description:
        '建议在会话结束或应用退到后台时批量提交，单次最多 500 条。sessionId 用于把同一次使用的工具打开、检索串起来。',
      code: `curl -X POST "${base}/v1/telemetry/events" \\
  -H "Content-Type: application/json" \\
  -H "X-STB-Key: ${key}" \\
  -d '{
    "sn": "SN-8F3A2C91D4B6",
    "events": [
      { "name": "session_start", "occurredAt": "2026-11-15T06:10:00.000Z",
        "props": { "sessionId": "s_9f2a" } },
      { "name": "tool_open", "toolId": "chinese.poetry",
        "occurredAt": "2026-11-15T06:10:12.000Z",
        "props": { "sessionId": "s_9f2a", "source": "home" } },
      { "name": "tool_close", "toolId": "chinese.poetry",
        "occurredAt": "2026-11-15T06:12:40.000Z",
        "props": { "sessionId": "s_9f2a", "durationMs": 148000 } }
    ]
  }'`,
    },
    {
      id: 'errors',
      method: 'POST' as const,
      path: '/v1/telemetry/errors',
      title: '上报崩溃',
      description:
        '单独接口保留完整堆栈，后台按 signature 聚合。signature 建议用「异常类名 + 首个业务栈帧」拼成，避免同类问题被拆散。',
      code: `curl -X POST "${base}/v1/telemetry/errors" \\
  -H "Content-Type: application/json" \\
  -H "X-STB-Key: ${key}" \\
  -d '{
    "sn": "SN-8F3A2C91D4B6",
    "errors": [{
      "signature": "java.lang.NullPointerException@MathCanvas.kt:412",
      "message": "Attempt to invoke virtual method on a null object reference",
      "stack": "java.lang.NullPointerException\\n  at cn.stb.feature.math.MathCanvasKt.draw...",
      "toolId": "math.function",
      "occurredAt": "2026-11-15T06:13:00.000Z"
    }]
  }'`,
    },
    {
      id: 'config',
      method: 'GET' as const,
      path: '/v1/config',
      title: '拉取云端配置',
      description:
        '不修改设备状态，可用于定时刷新。返回可用的工具列表、未过期的公告、版本策略与功能开关。被停用的工具 enabled=false，并带上已解析好的 disabledReason。',
      code: `curl "${base}/v1/config?version=1.1.0&channel=stable&sn=SN-8F3A2C91D4B6" \\
  -H "X-STB-Key: ${key}"`,
      sample: `{
  "version": 3,
  "channel": "stable",
  "clientVersion": "1.1.0",
  "tools": {
    "biology.diagram.cell-division": {
      "enabled": false,
      "source": "global",
      "disabledReason": "课堂演示告一段落，下周恢复",
      "disabledReasonSource": "global"
    },
    "other.feedback": {
      "enabled": false,
      "source": "device",
      "reason": "device_disabled",
      "disabledReason": "本机正在考试环境，反馈入口暂时关闭",
      "disabledReasonSource": "device"
    },
    "chinese.poetry": { "enabled": true, "source": "global" }
  },
  "announcements": [],
  "features": {},
  "sync": {
    "configIntervalSeconds": 900,
    "telemetryFlushIntervalSeconds": 300,
    "telemetryBatchMax": 500,
    "nextConfigAt": "2026-11-18T08:00:00.000Z"
  }
}`,
    },
    {
      id: 'feedback',
      method: 'POST' as const,
      path: '/v1/feedback',
      title: '提交意见反馈',
      description:
        'type 取 bug / feature / content / other；同一设备每天最多 5 条。返回 feedback.id 用于查询进度。',
      code: `curl -X POST "${base}/v1/feedback" \\
  -H "Content-Type: application/json" \\
  -H "X-STB-Key: ${key}" \\
  -d '{
    "sn": "SN-8F3A2C91D4B6",
    "type": "feature",
    "title": "希望函数编辑器支持极坐标",
    "content": "课本里有 r=2sinθ 的图形，希望能直接画。",
    "contact": "QQ 12345678",
    "toolId": "math.function"
  }'`,
    },
    {
      id: 'feedbackList',
      method: 'GET' as const,
      path: '/v1/feedback?sn=…',
      title: '按设备标识查询反馈与回复',
      description: '返回该设备最近 20 条反馈及公开回复，不需要登录；后台的内部备注不会返回。',
      code: `curl "${base}/v1/feedback?sn=SN-8F3A2C91D4B6" \\
  -H "X-STB-Key: ${key}"`,
    },
    {
      id: 'feedbackStatus',
      method: 'GET' as const,
      path: '/v1/feedback/{id}?sn=…',
      title: '查询反馈进度',
      description:
        '返回公开回复与当前状态。设备标识必须与提交时一致，避免越权读取别人的反馈。',
      code: `curl "${base}/v1/feedback/FEEDBACK_ID?sn=SN-8F3A2C91D4B6" \\
  -H "X-STB-Key: ${key}"`,
    },
  ]

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.02em] text-ink">接入文档</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          SubjectToolbox 客户端接入遥测、云端控制与意见反馈的接口说明。所有示例都可以直接复制。
        </p>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-8">
          <Card>
            <CardHeader
              title="鉴权"
              description={`所有 /v1 接口都接受 X-STB-Key 请求头；${data.settings.allowAnonymousIngest ? '当前允许匿名上报' : '当前强制校验密钥'}`}
              action={<KeyRound size={15} className="text-faint" />}
            />
            <div className="p-5 pt-3">
              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <Badge tone="brand">X-STB-Key</Badge>
                  <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink">
                    {data.key?.prefix ?? '尚未创建密钥'}
                  </code>
                  {data.key ? (
                    <span className="text-faint">创建于 {formatDateTime(data.key.createdAt)}</span>
                  ) : null}
                </div>
                <p className="mt-2 text-[11px] leading-5 text-muted">
                  完整密钥只在创建时显示一次，服务端仅存 SHA-256 摘要。使用方式：设置 → 接入密钥 → 新建，把
                  stb_live_… 写入 STB 的 local.properties（stb.apiKey），再关闭匿名上报并重新打包；客户端会自动在请求头带
                  X-STB-Key。
                </p>
              </div>
              <pre className="code-block mt-3">{`# 携带密钥
curl "${base}/v1/health" -H "X-STB-Key: ${key}"

# 返回
{ "ok": true, "revision": 3, "time": "..." }`}</pre>
            </div>
          </Card>

          {endpoints.map((endpoint) => (
            <Card key={endpoint.id}>
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={METHOD_TONE[endpoint.method]}>{endpoint.method}</Badge>
                    <code className="font-mono text-[12px] font-medium text-ink">{endpoint.path}</code>
                  </div>
                  <h3 className="mt-1.5 text-[13.5px] font-semibold text-ink">{endpoint.title}</h3>
                  <p className="mt-1 max-w-[640px] text-[11.5px] leading-5 text-muted">{endpoint.description}</p>
                </div>
                <CopyButton text={endpoint.code} label="复制示例" />
              </div>
              <pre className="code-block mx-5 mb-5 mt-3 max-h-[300px]">{endpoint.code}</pre>
              {endpoint.sample ? (
                <div className="-mt-2 mx-5 mb-5">
                  <div className="mb-1 text-[10.5px] font-medium text-faint">响应示例（节选）</div>
                  <pre className="code-block max-h-[340px]">{endpoint.sample}</pre>
                </div>
              ) : null}
            </Card>
          ))}

          <Card>
            <CardHeader
              title="停用原因与破坏性变更"
              description="全局 + 单设备两级停用原因，全局原因统一走 disabledReason；v2 不保留旧字段兼容"
              action={<ShieldCheck size={15} className="text-faint" />}
            />
            <div className="px-5 pb-5 pt-3">
              <div className="space-y-2.5 text-[11.5px] leading-5 text-muted">
                <p>
                  · <span className="text-ink">全局停用原因</span>：在「云端控制 → 工具开关」的「停用原因（全局）」填写，
                  发布后对该版本 / 渠道的所有设备生效（最长 120 字）。
                </p>
                <p>
                  · <span className="text-ink">单设备停用原因</span>：在设备详情的「停用原因（本设备）」里填写，只覆盖该设备；
                  留空则回退到全局原因。内部备注 <code className="font-mono text-[10.5px]">note</code> 永远不会下发给客户端。
                </p>
                <p>
                  · 下发字段 <code className="font-mono text-[10.5px]">disabledReason</code> 已由服务端按「单设备原因 &gt;
                  全局原因 &gt; 客户端默认文案」解析，<code className="font-mono text-[10.5px]">disabledReasonSource</code>
                  （<code className="font-mono text-[10.5px]">device</code> /{' '}
                  <code className="font-mono text-[10.5px]">global</code>）标明文本来源；已启用的工具不下发该字段。
                </p>
                <p>
                  · <span className="text-ink">破坏性变更（v2）</span>：后台与客户端 1.1.0 均未上线，因此不保留旧字段兼容。
                  <code className="font-mono text-[10.5px]">/v1/config</code> 的{' '}
                  <code className="font-mono text-[10.5px]">tools[toolId].message</code> 已删除，后台配置草稿 / 已发布配置的{' '}
                  <code className="font-mono text-[10.5px]">ToolConfig</code> 也不再包含{' '}
                  <code className="font-mono text-[10.5px]">message</code>；全局停用原因统一写入{' '}
                  <code className="font-mono text-[10.5px]">disabledReason</code>。客户端需按 v2 字段解析，不再有旧字段回退。
                </p>
                <p>
                  · <span className="text-ink">停用不隐藏</span>：客户端不再把被停用的工具从主页移除，而是在原位置灰并标注「已停用」，
                  点击后弹窗展示停用原因；单设备原因会额外标注「仅本设备」。
                </p>
              </div>
              <pre className="code-block mt-3">{`// 给某台设备单独填写停用原因（后台管理接口，需登录会话）
PUT /api/devices/SN-8F3A2C91D4B6/overrides
{
  "toolId": "other.feedback",
  "enabled": false,
  "reason": "本机正在考试环境，反馈入口暂时关闭",
  "note": "内部备注，不会下发给客户端"
}`}</pre>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Android 侧参考实现"
              description="与 STB 的 core/data/cloud 实现保持一致，仅作接入参考"
              action={<Smartphone size={15} className="text-faint" />}
            />
            <div className="p-5 pt-3">
              <pre className="code-block max-h-[380px]">{`// 建议放在 core:data，用 OkHttp / HttpURLConnection 均可。
// 只在学校网络可用时上报，失败静默丢弃，不影响离线工具。
suspend fun reportEvents(sn: String, events: List<StbEvent>) = withContext(Dispatchers.IO) {
    if (!NetworkAvailable()) return@withContext
    val body = JSONObject()
        .put("sn", sn)
        .put("events", JSONArray(events.map { it.toJson() }))
    runCatching {
        URL("\${BuildConfig.STB_API}/v1/telemetry/events").openConnection()
            .let { it as HttpURLConnection }
            .apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("X-STB-Key", BuildConfig.STB_KEY)
                doOutput = true
                connectTimeout = 5_000
                outputStream.use { it.write(body.toString().toByteArray()) }
                if (responseCode !in 200..299) throw IOException("HTTP \$responseCode")
            }
            .disconnect()
    }
}`}</pre>
              <p className="mt-2 text-[10.5px] leading-5 text-faint">
                注意：STB 目前只声明了 INTERNET 权限供电子教材使用。若接入上报，需要把「仅电子教材联网」的承诺更新为
                「可选上报，可在设置中关闭」，并在首次启动时征求同意。
              </p>
            </div>
          </Card>
        </div>

        <div className="space-y-3 xl:col-span-4">
          <Card>
            <CardHeader title="环境信息" action={<Radio size={15} className="text-faint" />} />
            <div className="divide-y divide-line/70 px-5 pb-2 pt-1">
              <KeyValue label="API 地址">
                <code className="break-all font-mono text-[10.5px]">{base}</code>
              </KeyValue>
              <KeyValue label="采集状态">
                <Badge tone={data.settings.telemetryEnabled ? 'green' : 'red'} dot>
                  {data.settings.telemetryEnabled ? '开启' : '已暂停'}
                </Badge>
              </KeyValue>
              <KeyValue label="反馈通道">
                <Badge tone={data.settings.feedbackEnabled ? 'green' : 'red'} dot>
                  {data.settings.feedbackEnabled ? '开启' : '已关闭'}
                </Badge>
              </KeyValue>
              <KeyValue label="匿名上报">
                <Badge tone={data.settings.allowAnonymousIngest ? 'amber' : 'green'}>
                  {data.settings.allowAnonymousIngest ? '允许（未校验密钥）' : '要求密钥'}
                </Badge>
              </KeyValue>
              <KeyValue label="鉴权结果">
                <Badge tone={data.requestKeyMatched ? 'green' : 'neutral'}>
                  {data.requestKeyMatched ? '当前请求携带了有效密钥' : '浏览器未携带密钥'}
                </Badge>
              </KeyValue>
            </div>
          </Card>

          <Card>
            <CardHeader title="事件字典" description="name 字段的取值约定" action={<Send size={15} className="text-faint" />} />
            <div className="px-5 pb-4 pt-2">
              <div className="space-y-2">
                {data.events.map((event) => (
                  <div key={event.name} className="rounded-lg border border-line bg-surface-2 px-2.5 py-2">
                    <code className="font-mono text-[11px] text-ink">{event.name}</code>
                    <p className="mt-0.5 text-[10.5px] leading-4 text-faint">{event.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="工具 ID" description="toolId 必须与 STB 注册表一致" action={<BookOpen size={15} className="text-faint" />} />
            <div className="px-5 pb-4 pt-2">
              <div className="space-y-1.5">
                {data.tools.map((tool) => (
                  <div key={tool.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                    <span className="text-ink">{tool.title}</span>
                    <code className="font-mono text-[10px] text-faint">{tool.id}</code>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="border-brand/25 bg-brand-soft/40">
            <div className="flex items-start gap-2.5 p-4">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand" />
              <div>
                <div className="text-[12px] font-medium text-ink">隐私边界</div>
                <p className="mt-1 text-[10.5px] leading-4 text-muted">
                  设备 SN 由客户端从硬件序列号或系统安装标识生成，不采集学号或姓名；后台不提供按学生检索的能力。反馈里的联系方式由用户主动填写。
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="快速自检" action={<Terminal size={15} className="text-faint" />} />
            <div className="p-5 pt-2">
              <pre className="code-block">{`curl ${base}/v1/health

# 预期
{"ok":true,"revision":3,"time":"..."}`}</pre>
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-faint">
                <Wifi size={11} /> 服务需与客户端在同一网络可访问
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-start gap-2.5 p-4">
              <MessageSquare size={15} className="mt-0.5 shrink-0 text-faint" />
              <div>
                <div className="text-[12px] font-medium text-ink">反馈闭环</div>
                <p className="mt-1 text-[10.5px] leading-4 text-muted">
                  后台的公开回复会出现在 /v1/feedback/:id 的 messages 里；内部备注永远不会下发。
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-[10.5px] text-faint">
        <CodeXml size={12} />
        本页为独立服务的接入说明，STB 仓库未做任何修改；示例代码可直接移植到新的 core:telemetry 模块。
      </div>
    </div>
  )
}

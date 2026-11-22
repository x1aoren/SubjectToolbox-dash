import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  Eye,
  EyeOff,
  Inbox,
  Lock,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react'
import { errorMessage, useAuth, useToast } from '../lib/app-context'
import { SUBJECT_NAMES, SUBJECT_COLORS } from '../lib/format'
import { Button } from '../components/ui'
import { BrandMark } from '../components/brand'

const FEATURES = [
  {
    icon: Activity,
    title: '遥测服务',
    text: '设备、会话与工具使用实时归集，看清每个学科工具在课堂里的真实用量。',
  },
  {
    icon: SlidersHorizontal,
    title: '云端控制',
    text: '远程下发工具开关、首页公告与版本策略，草稿、预览、发布与回滚全程留痕。',
  },
  {
    icon: Inbox,
    title: '意见反馈',
    text: '把学生的建议收进同一个收件箱，指派、回复、关闭，形成可追踪的闭环。',
  },
]

export function LoginPage(): React.JSX.Element {
  const { user, loading, login, meta } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (!loading && user) return <Navigate to={from} replace />

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      toast('登录成功', 'success')
      navigate(from, { replace: true })
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSubmitting(false)
    }
  }

  const fillDemo = (): void => {
    if (!meta?.demoAccount) return
    setUsername(meta.demoAccount.username)
    setPassword(meta.demoAccount.password)
    setError(null)
  }

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.06fr_1fr]">
      {/* ------------------------------ 品牌侧 ------------------------------ */}
      <section className="relative hidden overflow-hidden bg-[#1E4033] text-white lg:flex lg:flex-col lg:justify-between lg:p-11 xl:p-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
            backgroundSize: '46px 46px',
          }}
        />
        <div className="pointer-events-none absolute -left-24 top-1/3 h-[420px] w-[420px] rounded-full bg-[#5D9A80]/25 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-24 right-0 h-[360px] w-[360px] rounded-full bg-[#C8A15E]/15 blur-[110px]" />

        <div className="relative flex items-center gap-3">
          <BrandMark size={40} className="ring-1 ring-white/25" />
          <div>
            <div className="text-[14px] font-semibold tracking-wide">学科工具箱</div>
            <div className="text-[10.5px] tracking-[0.16em] text-white/45">SUBJECTTOOLBOX CONSOLE</div>
          </div>
        </div>

        <div className="relative max-w-[480px] py-12">
          <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[10.5px] tracking-wide text-white/70">
            <span className="h-1.5 w-1.5 rounded-full bg-[#9FD3B6]" />
            为校园离线工具补上服务端的一环
          </div>
          <h1 className="text-[32px] font-semibold leading-[1.28] tracking-[-0.02em] xl:text-[36px]">
            把课堂里的使用，
            <br />
            变成可以行动的洞察。
          </h1>
          <p className="mt-4 max-w-[400px] text-[13.5px] leading-6 text-white/60">
            遥测、云端控制与意见反馈，集中在同一个控制台。不打扰离线体验，只在需要时把配置送达。
          </p>

          <div className="mt-9 space-y-4">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="flex gap-3.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-white/12 bg-white/[0.06] text-[#B9DCC8]">
                  <feature.icon size={15} strokeWidth={1.7} />
                </span>
                <div>
                  <div className="text-[12.5px] font-medium text-white/90">{feature.title}</div>
                  <div className="mt-0.5 text-[11.5px] leading-5 text-white/45">{feature.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="mb-3 text-[10px] tracking-[0.16em] text-white/35">七个学科 · 十一个工具</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(SUBJECT_NAMES).map(([id, name]) => (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[11px] text-white/65"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: SUBJECT_COLORS[id], boxShadow: `0 0 0 2px ${SUBJECT_COLORS[id]}22` }}
                />
                {name}
              </span>
            ))}
          </div>
          <div className="mt-7 flex items-center justify-between text-[10.5px] text-white/30">
            <span>© 2026 市第二中学 · 信息技术组</span>
            <span>仅限校内授权使用</span>
          </div>
        </div>
      </section>

      {/* ------------------------------- 登录 ------------------------------- */}
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[368px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark size={36} />
            <div>
              <div className="text-[13px] font-semibold leading-tight text-ink">学科工具箱</div>
              <div className="text-[10.5px] leading-tight text-faint">运营控制台</div>
            </div>
          </div>

          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">登录控制台</h1>
          <p className="mt-1.5 text-[12.5px] text-muted">使用管理员账号继续，所有敏感操作都会被记录。</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div>
              <label htmlFor="username" className="field-label">
                用户名
              </label>
              <div className="relative">
                <UserRound
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                />
                <input
                  id="username"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="例如 admin"
                  className="input h-[42px] pl-9"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="field-label">
                密码
              </label>
              <div className="relative">
                <Lock
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="至少 8 位"
                  className="input h-[42px] pl-9 pr-10"
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-faint transition hover:text-ink"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error ? (
              <div className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-[12px] text-danger">
                {error}
              </div>
            ) : null}

            <Button
              type="submit"
              className="h-[42px] w-full"
              loading={submitting}
              trailing={!submitting ? <ArrowRight size={15} /> : undefined}
            >
              登录控制台
            </Button>
          </form>

          {meta?.demoAccount ? (
            <div className="mt-6 rounded-[13px] border border-dashed border-line-strong bg-surface-2/70 p-3.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted">
                  <ShieldCheck size={13} className="text-brand" />
                  演示账号
                </span>
                <button
                  type="button"
                  onClick={fillDemo}
                  className="text-[11px] font-medium text-brand transition hover:text-brand-strong"
                >
                  一键填入
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2 font-mono text-[11.5px] text-ink">
                <code className="rounded bg-surface px-1.5 py-0.5">{meta.demoAccount.username}</code>
                <span className="text-faint">/</span>
                <code className="rounded bg-surface px-1.5 py-0.5">{meta.demoAccount.password}</code>
              </div>
              <p className="mt-2 text-[10.5px] leading-4 text-faint">
                已接入 {meta.counts.devices} 台设备、{meta.counts.feedback} 条反馈、{meta.counts.events} 条遥测事件。
                其他角色账号见 README。
              </p>
            </div>
          ) : null}

          <p className="mt-6 flex items-center gap-1.5 text-[10.5px] leading-4 text-faint">
            <Lock size={11} />
            仅限授权管理员使用；登录失败 6 次将临时锁定 5 分钟。
          </p>
        </div>
      </section>
    </div>
  )
}

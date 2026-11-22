import { ShieldQuestionMark } from 'lucide-react'
import { Button, Card } from './ui'
import { BrandMark } from './brand'
import { useAuth } from '../lib/app-context'

export function BrandLoader(): React.JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-3">
        <BrandMark size={40} className="animate-pulse shadow-[var(--shadow-card)]" />
        <span className="text-[12px] text-muted">正在加载控制台…</span>
      </div>
    </div>
  )
}

export function NoPermission(): React.JSX.Element {
  const { user } = useAuth()
  return (
    <Card className="mx-auto mt-10 max-w-[420px] p-8 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-warn-soft text-warn">
        <ShieldQuestionMark size={20} />
      </div>
      <h2 className="text-[15px] font-semibold text-ink">没有访问权限</h2>
      <p className="mt-1 text-[12.5px] text-muted">
        当前账号（{user?.roleName}）没有访问这个页面的权限，请联系超级管理员调整角色。
      </p>
      <div className="mt-4">
        <Button variant="outline" onClick={() => window.history.back()}>
          返回上一页
        </Button>
      </div>
    </Card>
  )
}

export function NotFoundView(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-[40px] font-semibold tracking-tight text-line-strong">404</div>
      <p className="mt-2 text-[14px] font-medium text-ink">页面不存在</p>
      <p className="mt-1 text-[12.5px] text-muted">可能是链接过期，或者你输入了一个不存在的地址。</p>
      <Button className="mt-5" variant="outline" onClick={() => (window.location.href = '/')}>
        回到概览
      </Button>
    </div>
  )
}

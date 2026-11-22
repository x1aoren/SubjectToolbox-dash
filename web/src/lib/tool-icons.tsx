import {
  Atom,
  BookA,
  BookOpenText,
  Library,
  Mail,
  Microscope,
  Orbit,
  ScrollText,
  Sigma,
  SquareFunction,
  type LucideIcon,
} from 'lucide-react'
import { SUBJECT_COLORS } from './format'
import { cn } from '../components/ui'

type IconMap = Record<string, LucideIcon>

/**
 * 工具图标映射：键与 `server/catalog.ts` 的 `ToolIconName` 一一对应。
 *
 * 这套图标与客户端 `core/designsystem/src/main/res/drawable/ic_tool_*.xml` 是同一批
 * Lucide 线稿（客户端把它们编译成了 Android vector），所以控制台里看到的圆形、
 * 图钉、函数号等形状和学生在平板上看到的是同一个。换图标时两边一起改。
 */
export const TOOL_ICONS: IconMap = {
  'scroll-text': ScrollText,
  'book-a': BookA,
  'square-function': SquareFunction,
  'book-open-text': BookOpenText,
  atom: Atom,
  microscope: Microscope,
  orbit: Orbit,
  library: Library,
  sigma: Sigma,
  mail: Mail,
}

/** 图标名缺失或拼错时不至于渲染出空白，退化成单字缩写 */
export function toolIconOf(icon: string | undefined): LucideIcon | null {
  if (!icon) return null
  return TOOL_ICONS[icon] ?? null
}

/**
 * 工具徽标：学科淡色底 + 该工具自己的线稿图标。
 *
 * 四个页面（概览排行、工具使用、工具开关、设备详情）原本各写一遍「圆角方块 + 单字」，
 * 尺寸和圆角还不太一致；统一收到这里，顺便把单字换成和客户端一致的真图标。
 * [size] 是方块边长，图标按 0.48 缩放，圆角按 0.3 取，视觉重量在各尺寸下都比较接近。
 */
export function ToolBadge({
  icon,
  glyph,
  subjectId,
  size = 28,
  className,
}: {
  icon?: string
  glyph?: string
  subjectId?: string
  size?: number
  className?: string
}): React.JSX.Element {
  const accent = SUBJECT_COLORS[subjectId ?? 'other'] ?? 'var(--brand)'
  const Icon = toolIconOf(icon)
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center', className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        background: `color-mix(in srgb, ${accent} 12%, var(--surface))`,
        color: accent,
      }}
      aria-hidden
    >
      {Icon ? (
        <Icon size={Math.round(size * 0.48)} strokeWidth={1.8} />
      ) : (
        <span className="num text-[11px] font-medium">{glyph ?? '·'}</span>
      )}
    </span>
  )
}

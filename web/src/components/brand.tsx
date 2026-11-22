import { cn } from './ui'

/**
 * 控制台品牌标记。
 *
 * 与客户端共用同一套图标：侧栏、登录页、加载态都从 public/ 取图，
 * 不再用「学」字方块——那样每换一次 logo 就要改三处，也容易漏掉浏览器标签页。
 */
export function BrandMark({
  size = 32,
  className,
  radius,
  alt = '学科工具箱',
}: {
  size?: number
  className?: string
  radius?: number
  /** 旁边已有文字品牌名时传空串，避免读屏重复朗读 */
  alt?: string
}): React.JSX.Element {
  return (
    <img
      src="/brand-mark.png"
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      className={cn('shrink-0 select-none object-cover', className)}
      style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.3) }}
    />
  )
}

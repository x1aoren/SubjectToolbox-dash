import { useId, useMemo, useState } from 'react'
import { useMeasure } from '../lib/useApi'

/* ------------------------------------------------------------------ */
/* 迷你趋势线                                                          */
/* ------------------------------------------------------------------ */

export function Sparkline({
  values,
  color = 'var(--brand)',
  width = 96,
  height = 30,
  fill = true,
}: {
  values: number[]
  color?: string
  width?: number
  height?: number
  fill?: boolean
}): React.JSX.Element {
  const id = useId().replace(/:/g, '')
  if (values.length === 0) return <svg width={width} height={height} />
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const step = values.length > 1 ? width / (values.length - 1) : width
  const points = values.map((value, index) => {
    const x = index * step
    const y = height - 2 - ((value - min) / span) * (height - 5)
    return [x, y] as const
  })
  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill ? <path d={area} fill={`url(#spark-${id})`} /> : null}
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* 面积 / 折线图                                                       */
/* ------------------------------------------------------------------ */

export interface ChartSeries {
  key: string
  label: string
  values: number[]
  color: string
  dashed?: boolean
}

function smoothPath(points: ReadonlyArray<readonly [number, number]>): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0]![0]},${points[0]![1]}`
  let path = `M${points[0]![0].toFixed(2)},${points[0]![1].toFixed(2)}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index]!
    const p1 = points[index]!
    const p2 = points[index + 1]!
    const p3 = points[index + 2] ?? p2
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6
    path += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`
  }
  return path
}

function niceMax(value: number): number {
  if (value <= 0) return 4
  const exponent = Math.floor(Math.log10(value))
  const base = 10 ** exponent
  const fraction = value / base
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return nice * base
}

export function AreaChart({
  labels,
  series,
  height = 220,
  formatValue = (value: number) => String(value),
  yTicks = 4,
}: {
  labels: string[]
  series: ChartSeries[]
  height?: number
  formatValue?: (value: number) => string
  yTicks?: number
}): React.JSX.Element {
  const { ref, size } = useMeasure<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const id = useId().replace(/:/g, '')
  const padding = { top: 14, right: 14, bottom: 24, left: 40 }
  const width = Math.max(280, size.width)
  const innerWidth = Math.max(40, width - padding.left - padding.right)
  const innerHeight = Math.max(40, height - padding.top - padding.bottom)
  const maxValue = niceMax(Math.max(1, ...series.flatMap((item) => item.values)))
  const count = labels.length

  const xOf = (index: number): number =>
    padding.left + (count <= 1 ? innerWidth / 2 : (index / (count - 1)) * innerWidth)
  const yOf = (value: number): number =>
    padding.top + innerHeight - (value / maxValue) * innerHeight

  const ticks = useMemo(() => {
    return Array.from({ length: yTicks + 1 }, (_, index) => (maxValue / yTicks) * index)
  }, [maxValue, yTicks])

  const labelStep = Math.max(1, Math.ceil(count / 7))

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      <svg width={width} height={height} className="block overflow-visible" role="img" aria-label="趋势图">
        <defs>
          {series.map((item) => (
            <linearGradient key={item.key} id={`area-${id}-${item.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={item.color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={item.color} stopOpacity="0.01" />
            </linearGradient>
          ))}
        </defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yOf(tick)}
              y2={yOf(tick)}
              stroke="var(--line)"
              strokeDasharray="3 4"
              strokeWidth="1"
            />
            <text
              x={padding.left - 8}
              y={yOf(tick) + 3.5}
              textAnchor="end"
              fontSize="10.5"
              fill="var(--faint)"
              className="num"
            >
              {formatValue(tick)}
            </text>
          </g>
        ))}

        {labels.map((label, index) =>
          index % labelStep === 0 || index === count - 1 ? (
            <text
              key={`${label}-${index}`}
              x={xOf(index)}
              y={height - 6}
              textAnchor={index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle'}
              fontSize="10.5"
              fill="var(--faint)"
            >
              {label}
            </text>
          ) : null,
        )}

        {series.map((item) => {
          const points = item.values.map((value, index) => [xOf(index), yOf(value)] as const)
          const line = smoothPath(points)
          const area = `${line} L${xOf(count - 1)},${padding.top + innerHeight} L${xOf(0)},${padding.top + innerHeight} Z`
          return (
            <g key={item.key}>
              {!item.dashed ? <path d={area} fill={`url(#area-${id}-${item.key})`} /> : null}
              <path
                d={line}
                fill="none"
                stroke={item.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={item.dashed ? '4 4' : undefined}
              />
            </g>
          )
        })}

        {hover !== null ? (
          <g>
            <line
              x1={xOf(hover)}
              x2={xOf(hover)}
              y1={padding.top}
              y2={padding.top + innerHeight}
              stroke="var(--line-strong)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {series.map((item) => (
              <circle
                key={item.key}
                cx={xOf(hover)}
                cy={yOf(item.values[hover] ?? 0)}
                r="3.5"
                fill="var(--surface)"
                stroke={item.color}
                strokeWidth="2"
              />
            ))}
          </g>
        ) : null}

        <rect
          x={padding.left}
          y={padding.top}
          width={innerWidth}
          height={innerHeight}
          fill="transparent"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const bounds = (event.currentTarget as SVGRectElement).getBoundingClientRect()
            const ratio = (event.clientX - bounds.left) / Math.max(1, bounds.width)
            const index = Math.round(ratio * (count - 1))
            setHover(Math.max(0, Math.min(count - 1, index)))
          }}
        />
      </svg>

      {hover !== null ? (
        <div
          className="pointer-events-none absolute z-10 min-w-[132px] rounded-lg border border-line bg-surface px-3 py-2 shadow-[var(--shadow-pop)]"
          style={{
            left: Math.min(Math.max(xOf(hover) - 66, 0), Math.max(0, width - 150)),
            top: 4,
          }}
        >
          <div className="mb-1 text-[10.5px] font-medium text-faint">{labels[hover]}</div>
          {series.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-4 py-0.5">
              <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
                {item.label}
              </span>
              <span className="num text-[11.5px] font-medium text-ink">
                {formatValue(item.values[hover] ?? 0)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 横向条形排行                                                        */
/* ------------------------------------------------------------------ */

export function BarList({
  items,
  formatValue = (value: number) => String(value),
  emptyText = '暂无数据',
}: {
  items: Array<{ key: string; label: string; value: number; color?: string; meta?: string }>
  formatValue?: (value: number) => string
  emptyText?: string
}): React.JSX.Element {
  const max = Math.max(1, ...items.map((item) => item.value))
  if (items.length === 0) {
    return <div className="px-5 py-10 text-center text-[12.5px] text-muted">{emptyText}</div>
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.key} className="group flex items-center gap-3">
          <span className="w-[96px] shrink-0 truncate text-[12.5px] text-ink" title={item.label}>
            {item.label}
          </span>
          <div className="relative h-[7px] flex-1 overflow-hidden rounded-full bg-surface-3">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
              style={{
                width: `${Math.max(1.5, (item.value / max) * 100)}%`,
                background: item.color ?? 'var(--brand)',
                opacity: 0.85,
              }}
            />
          </div>
          <span className="num w-[52px] shrink-0 text-right text-[12px] font-medium text-ink">
            {formatValue(item.value)}
          </span>
          {item.meta ? (
            <span className="num hidden w-[44px] shrink-0 text-right text-[11px] text-faint sm:block">
              {item.meta}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 环形图                                                              */
/* ------------------------------------------------------------------ */

export function Donut({
  segments,
  size = 148,
  thickness = 15,
  centerLabel,
  centerValue,
}: {
  segments: Array<{ key: string; label: string; value: number; color: string }>
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string
}): React.JSX.Element {
  const total = segments.reduce((sum, item) => sum + item.value, 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={thickness}
        />
        {total > 0
          ? segments.map((segment) => {
              const fraction = segment.value / total
              const dash = fraction * circumference
              const element = (
                <circle
                  key={segment.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${Math.max(0, dash - 2)} ${circumference}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="round"
                />
              )
              offset += dash
              return element
            })
          : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-[22px] font-semibold leading-none text-ink">{centerValue}</span>
        <span className="mt-1 text-[10.5px] text-faint">{centerLabel}</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 活跃热力图                                                          */
/* ------------------------------------------------------------------ */

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

export function Heatmap({
  cells,
  formatValue = (value: number) => String(value),
}: {
  cells: Array<{ weekday: number; hour: number; count: number }>
  formatValue?: (value: number) => string
}): React.JSX.Element {
  const max = Math.max(1, ...cells.map((cell) => cell.count))
  const lookup = new Map(cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell.count]))
  const rows = [1, 2, 3, 4, 5, 6, 0]

  return (
    <div className="w-full">
      <div className="flex gap-2">
        <div className="flex w-7 flex-col gap-[3px] pt-0.5 text-[9.5px] text-faint">
          {rows.map((weekday, index) => (
            <span key={weekday} className="flex h-[15px] items-center">
              {WEEKDAYS[index]}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="grid gap-[3px]"
            style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
          >
            {rows.flatMap((weekday) =>
              Array.from({ length: 24 }, (_, hour) => {
                const count = lookup.get(`${weekday}-${hour}`) ?? 0
                const intensity = count === 0 ? 0 : 0.16 + (count / max) * 0.84
                return (
                  <div
                    key={`${weekday}-${hour}`}
                    title={`${WEEKDAYS[rows.indexOf(weekday)]} ${String(hour).padStart(2, '0')}:00 · ${formatValue(count)}`}
                    className="aspect-square rounded-[3px] transition-transform hover:scale-110"
                    style={{
                      background:
                        count === 0
                          ? 'var(--surface-3)'
                          : `color-mix(in srgb, var(--brand) ${Math.round(intensity * 100)}%, var(--surface-3))`,
                    }}
                  />
                )
              }),
            )}
          </div>
          <div className="mt-1.5 flex justify-between text-[9.5px] text-faint">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:00</span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-faint">
        <span>少</span>
        {[0.12, 0.32, 0.55, 0.78, 1].map((level) => (
          <span
            key={level}
            className="h-[9px] w-[9px] rounded-[2px]"
            style={{
              background:
                level === 0.12
                  ? 'var(--surface-3)'
                  : `color-mix(in srgb, var(--brand) ${Math.round(level * 100)}%, var(--surface-3))`,
            }}
          />
        ))}
        <span>多</span>
      </div>
    </div>
  )
}

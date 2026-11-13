import { useId } from 'react'

interface SparklineProps {
  values: number[]
  className?: string // size (h-*/w-*) and color (text-*); the line uses currentColor
}

const WIDTH = 96
const HEIGHT = 36

/** Tiny decorative trend line with a soft fill. The numbers it shows are also given as text. */
export default function Sparkline({ values, className = '' }: SparklineProps) {
  const gradientId = useId()
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = WIDTH / (values.length - 1)
  const points = values.map((value, i) => [i * step, HEIGHT - 3 - ((value - min) / range) * (HEIGHT - 6)] as const)
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={`shrink-0 overflow-visible ${className}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

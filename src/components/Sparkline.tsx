import { useMemo } from 'react'

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  fill?: boolean
}

export default function Sparkline({ data, width = 120, height = 32, color = 'var(--accent)', fill = true }: SparklineProps) {
  const path = useMemo(() => {
    if (data.length < 2) return ''
    const max = Math.max(...data, 1)
    const padding = 2
    const w = width - padding * 2
    const h = height - padding * 2
    const stepX = w / (data.length - 1)

    const points = data.map((v, i) => ({
      x: padding + i * stepX,
      y: padding + h - (v / max) * h,
    }))

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

    if (!fill) return line

    const fillPath = `${line} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`
    return fillPath
  }, [data, width, height, fill])

  const linePath = useMemo(() => {
    if (data.length < 2) return ''
    const max = Math.max(...data, 1)
    const padding = 2
    const w = width - padding * 2
    const h = height - padding * 2
    const stepX = w / (data.length - 1)
    return data.map((v, i) => {
      const x = padding + i * stepX
      const y = padding + h - (v / max) * h
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    }).join(' ')
  }, [data, width, height])

  if (data.length < 2) return null

  return (
    <svg width={width} height={height} className="sparkline" aria-hidden="true">
      {fill && (
        <path d={path} fill={color} opacity={0.12} />
      )}
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

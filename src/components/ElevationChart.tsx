import { useMemo } from 'react'
import type { TrackPoint } from '../types'
import { downsample, extent, niceTicks, scaleLinear, smoothLinePath } from '../utils/chartHelpers'
import { haversine } from '../utils/gpxParser'
import { areaPath } from '../utils/chartHelpers'

interface Props {
  track: TrackPoint[]
}

const W = 640
const H = 220
const PAD = { top: 14, right: 14, bottom: 26, left: 44 }

/** 海拔曲线:手写 SVG 面积图 */
export default function ElevationChart({ track }: Props) {
  const chart = useMemo(() => {
    const withEle = track.filter((p) => p.ele != null)
    if (withEle.length < 2) return null
    let cumulative = 0
    let prev: TrackPoint | null = null
    const series = withEle.map((p) => {
      if (prev) cumulative += haversine(prev.lat, prev.lon, p.lat, p.lon)
      prev = p
      return { distanceKm: cumulative / 1000, ele: p.ele as number }
    })
    const sampled = downsample(series, 240)
    const [x0, x1] = extent(sampled.map((d) => d.distanceKm))
    const [y0raw, y1raw] = extent(sampled.map((d) => d.ele))
    const ySpan = Math.max(10, y1raw - y0raw)
    const yTicks = niceTicks(y0raw - ySpan * 0.08, y1raw + ySpan * 0.08, 4)
    if (yTicks.length < 2) return null
    const yMin = yTicks[0]
    const yMax = yTicks[yTicks.length - 1]
    const x = scaleLinear([x0, x1], [PAD.left, W - PAD.right])
    const y = scaleLinear([yMin, yMax], [H - PAD.bottom, PAD.top])
    return {
      coords: sampled.map((d) => [x(d.distanceKm), y(d.ele)] as [number, number]),
      xTicks: niceTicks(x0, x1, 6),
      yTicks,
      x,
      y,
      baseline: H - PAD.bottom,
      minEle: y0raw,
      maxEle: y1raw,
    }
  }, [track])

  if (!chart) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-500">
        暂无海拔数据 — 导入含海拔的 GPX 或使用地图绘制(自动采样)后生成
      </div>
    )
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="海拔曲线">
      {chart.yTicks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={chart.y(t)} y2={chart.y(t)} stroke="rgba(148,163,184,0.12)" />
          <text x={PAD.left - 6} y={chart.y(t)} textAnchor="end" dominantBaseline="middle" style={{ fontSize: 10 }} className="fill-slate-500">
            {Math.round(t)}
          </text>
        </g>
      ))}
      {chart.xTicks.map((t) => (
        <text key={t} x={chart.x(t)} y={H - PAD.bottom + 14} textAnchor="middle" style={{ fontSize: 10 }} className="fill-slate-500">
          {t}
        </text>
      ))}
      {/* 海拔面积 */}
      <path d={areaPath(chart.coords, chart.baseline)} fill="url(#eleGradient)" stroke="none" />
      <path d={smoothLinePath(chart.coords)} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <defs>
        <linearGradient id="eleGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(245,158,11,0.45)" />
          <stop offset="100%" stopColor="rgba(245,158,11,0.03)" />
        </linearGradient>
      </defs>
      <text x={PAD.left + 4} y={PAD.top + 2} style={{ fontSize: 10 }} className="fill-slate-500">
        m · 最高 {Math.round(chart.maxEle)}m / 最低 {Math.round(chart.minEle)}m
      </text>
    </svg>
  )
}

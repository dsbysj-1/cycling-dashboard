import { useMemo } from 'react'
import type { RideRecord } from '../types'
import { areaPath, linePath, scaleLinear } from '../utils/chartHelpers'

interface Props {
  rides: RideRecord[] // 按日期倒序传入,内部取最近 10 次并转为时间正序
}

const W = 720
const H = 250
const PAD = { top: 28, right: 56, bottom: 34, left: 38 }
const MAX_POINTS = 10

/** 评分档位:作为背景分区,让分数高低一眼可读(与 ScoreCard 的配色一致) */
const ZONES = [
  { min: 85, max: 100, label: '优秀', color: 'rgba(52,211,153,0.10)' },
  { min: 70, max: 85, label: '良好', color: 'rgba(56,189,248,0.08)' },
  { min: 50, max: 70, label: '一般', color: 'rgba(251,191,36,0.07)' },
  { min: 0, max: 50, label: '较差', color: 'rgba(248,113,113,0.07)' },
]

const TOTAL_COLOR = '#38bdf8'
const WEATHER_COLOR = '#34d399'
const ROUTE_COLOR = '#fbbf24'

/**
 * 评分趋势:最近 10 次骑行。
 * 以综合评分折线为主线(面积 + 数值标签 + 末点强调),天气/路线分项用细线作对照,
 * 纵轴固定 0–100 并叠加评分档位分区,避免柱状图三色并排造成的拥挤。
 */
export default function TrendChart({ rides }: Props) {
  const data = useMemo(
    () => rides.filter((r) => r.scores != null).slice(0, MAX_POINTS).reverse(),
    [rides]
  )

  const chart = useMemo(() => {
    if (data.length === 0) return null
    const y = scaleLinear([0, 100], [H - PAD.bottom, PAD.top])
    const n = data.length
    const xScale = scaleLinear([0, Math.max(1, n - 1)], [PAD.left + 24, W - PAD.right - 24])
    const points = data.map((ride, i) => ({
      ride,
      x: n === 1 ? PAD.left + (W - PAD.left - PAD.right) / 2 : xScale(i),
      total: ride.scores!.total,
      weather: ride.scores!.weather,
      route: ride.scores!.route,
      label: ride.date.slice(5).replace('-', '/'),
    }))
    return { y, points, baseline: H - PAD.bottom }
  }, [data])

  const stats = useMemo(() => {
    if (data.length === 0) return null
    const totals = data.map((r) => r.scores!.total)
    const sum = totals.reduce((a, b) => a + b, 0)
    let bestIdx = 0
    totals.forEach((v, i) => {
      if (v > totals[bestIdx]) bestIdx = i
    })
    const last = totals[totals.length - 1]
    return {
      count: totals.length,
      avg: sum / totals.length,
      best: totals[bestIdx],
      bestDate: data[bestIdx].date.slice(5).replace('-', '/'),
      delta: totals.length > 1 ? last - totals[totals.length - 2] : null,
    }
  }, [data])

  if (!chart || !stats) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-500">
        暂无历史记录 — 保存骑行记录后展示最近 10 次评分趋势
      </div>
    )
  }

  const { y, points, baseline } = chart
  // 记录较多时隔一个显示日期,避免横轴拥挤
  const labelStep = points.length > 7 ? 2 : 1

  return (
    <div className="space-y-3">
      {/* 概览数字 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
        <span>
          <span className="text-slate-500">最近</span>
          <span className="ml-1.5 font-medium text-slate-200">{stats.count}</span>
          <span className="text-slate-500"> 次平均</span>
          <span className="ml-1.5 text-base font-semibold text-sky-300">{stats.avg.toFixed(1)}</span>
        </span>
        <span className="text-slate-500">
          最好 <span className="font-medium text-emerald-300">{stats.best}</span>
          <span className="text-slate-500">({stats.bestDate})</span>
        </span>
        {stats.delta != null && (
          <span className="text-slate-500">
            较上次
            <span className={`ml-1 font-medium ${stats.delta >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {stats.delta > 0 ? `+${stats.delta}` : stats.delta}
            </span>
          </span>
        )}
      </div>

      {/* 图例(放在图表外,避免遮挡曲线) */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-slate-400">
        <LegendItem color={TOTAL_COLOR} thick label="综合评分" />
        <LegendItem color={WEATHER_COLOR} label="天气适宜度" />
        <LegendItem color={ROUTE_COLOR} label="路线质量" />
        <span className="text-slate-600">纵轴固定 0–100,背景分区为评分档位</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="评分趋势">
        {/* 评分档位分区 */}
        {ZONES.map((zone) => (
          <g key={zone.label}>
            <rect
              x={PAD.left}
              y={y(zone.max)}
              width={W - PAD.left - PAD.right}
              height={Math.max(0, y(zone.min) - y(zone.max))}
              fill={zone.color}
            />
            <text
              x={W - PAD.right + 6}
              y={(y(zone.max) + y(zone.min)) / 2}
              dominantBaseline="middle"
              style={{ fontSize: 10 }}
              className="fill-slate-500"
            >
              {zone.label}
            </text>
          </g>
        ))}

        {/* 网格与纵轴刻度 */}
        {[0, 20, 40, 60, 80, 100].map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="rgba(148,163,184,0.14)"
              strokeDasharray={t === 0 ? undefined : '3 3'}
            />
            <text x={PAD.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" style={{ fontSize: 10 }} className="fill-slate-500">
              {t}
            </text>
          </g>
        ))}

        {/* 分项细线(作对照,弱化处理) */}
        <path
          d={linePath(points.map((p) => [p.x, y(p.weather)]))}
          fill="none"
          stroke={WEATHER_COLOR}
          strokeWidth="1.5"
          opacity="0.5"
          strokeLinejoin="round"
        />
        <path
          d={linePath(points.map((p) => [p.x, y(p.route)]))}
          fill="none"
          stroke={ROUTE_COLOR}
          strokeWidth="1.5"
          opacity="0.5"
          strokeLinejoin="round"
        />

        {/* 综合评分:面积 + 主线 + 数值 */}
        <path d={areaPath(points.map((p) => [p.x, y(p.total)]), baseline)} fill="url(#trendArea)" stroke="none" />
        <path
          d={linePath(points.map((p) => [p.x, y(p.total)]))}
          fill="none"
          stroke={TOTAL_COLOR}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => {
          const isLast = i === points.length - 1
          return (
            <g key={p.ride.id}>
              {isLast && <circle cx={p.x} cy={y(p.total)} r="7" fill="rgba(56,189,248,0.2)" />}
              <circle cx={p.x} cy={y(p.total)} r={isLast ? 4.5 : 3.2} fill={TOTAL_COLOR} />
              <text
                x={p.x}
                y={Math.max(PAD.top - 4, y(p.total) - 10)}
                textAnchor="middle"
                style={{ fontSize: 10, fontWeight: isLast ? 600 : 400 }}
                className={isLast ? 'fill-sky-200' : 'fill-slate-400'}
              >
                {p.total}
              </text>
            </g>
          )
        })}

        {/* 横轴:日期 */}
        {points.map((p, i) => (
          (i % labelStep === 0 || i === points.length - 1) && (
            <text
              key={`x-${p.ride.id}`}
              x={p.x}
              y={baseline + 16}
              textAnchor="middle"
              style={{ fontSize: 10 }}
              className="fill-slate-500"
            >
              {p.label}
            </text>
          )
        ))}

        <defs>
          <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
            {/* 面积保持很淡,避免盖住背景的档位色带 */}
            <stop offset="0%" stopColor="rgba(56,189,248,0.16)" />
            <stop offset="100%" stopColor="rgba(56,189,248,0.01)" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

/** 图例项:色块用线条形态表示,与图中的线型对应 */
function LegendItem({ color, label, thick }: { color: string; label: string; thick?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="18" height="8" aria-hidden="true">
        <line
          x1="0"
          y1="4"
          x2="18"
          y2="4"
          stroke={color}
          strokeWidth={thick ? 2.5 : 1.5}
          opacity={thick ? 1 : 0.6}
          strokeLinecap="round"
        />
        {thick && <circle cx="9" cy="4" r="2.6" fill={color} />}
      </svg>
      {label}
    </span>
  )
}

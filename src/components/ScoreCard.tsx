import type { RideRecord } from '../types'
import { rainLevelLabel } from '../utils/scoring'

/** 评分卡片:综合分、分项、降雨指数、文字评价与建议 */
export default function ScoreCard({ record }: { record: RideRecord }) {
  const scores = record.scores
  if (!scores) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-500">暂无评分数据</div>
    )
  }

  const rainLabel = rainLevelLabel(scores.rainFactor, record.env.precipitation, record.env.precipitationProbability)
  const scoreColor =
    scores.total >= 85 ? 'text-emerald-400' : scores.total >= 70 ? 'text-sky-400' : scores.total >= 50 ? 'text-amber-400' : 'text-red-400'
  const ring =
    scores.total >= 85 ? '#34d399' : scores.total >= 70 ? '#38bdf8' : scores.total >= 50 ? '#fbbf24' : '#f87171'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-5">
        {/* 综合评分环形 */}
        <div className="relative h-28 w-28 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" className="chart-grid" strokeWidth="10" />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke={ring}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${(scores.total / 100) * 2 * Math.PI * 42} ${2 * Math.PI * 42}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-bold ${scoreColor}`}>{scores.total}</span>
            <span className="text-[10px] text-slate-500">综合评分</span>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex gap-2">
            <SubScore label="天气 60%" value={scores.weather} color="bg-emerald-400/80" />
            <SubScore label="路线 40%" value={scores.route} color="bg-amber-400/80" />
          </div>
          <div className="rounded-lg border border-white/10 bg-night-800 px-3 py-2 text-xs leading-5 text-slate-300">
            <span className="text-sky-300">降雨指数：{scores.rainFactor}</span>({rainLabel})
            {(record.env.precipitation != null || record.env.precipitationProbability != null) && (
              <span className="text-slate-500">
                {' '}
                · 降水 {record.env.precipitation ?? '—'}mm · 概率 {record.env.precipitationProbability ?? '—'}%
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="rounded-lg border border-white/10 bg-night-800/70 px-4 py-3 text-sm leading-6 text-slate-200">{record.comment}</p>

      {record.suggestions.length > 0 && (
        <ul className="space-y-1.5">
          {record.suggestions.map((s, i) => (
            <li key={i} className="flex gap-2 text-xs leading-5 text-slate-400">
              <span className="text-amber-400">▲</span>
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SubScore({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex-1 rounded-lg border border-white/10 bg-night-800 px-3 py-2">
      <div className="flex items-baseline justify-between">
        <span className="whitespace-nowrap text-[10px] text-slate-500">{label}</span>
        <span className="text-lg font-semibold text-slate-100">{value}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

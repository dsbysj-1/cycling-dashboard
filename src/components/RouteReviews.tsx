import { useMemo } from 'react'
import { MessageSquare, Star, Users } from 'lucide-react'
import type { RideRecord } from '../types'

interface Props {
  /** 当前选中记录的路线名(规划路线的目的地) */
  routeName?: string
  /** 全部骑行记录,用于统计自己在该路线上的历史 */
  rides: RideRecord[]
}

/**
 * 路线评价:展示所选路线的评价信息。
 * 目前为个人本地应用,「其他骑友的评分与评论」暂为预留区域;
 * 先展示自己在该路线上的历史骑行统计,避免面板空置。
 */
export default function RouteReviews({ routeName, rides }: Props) {
  const stats = useMemo(() => {
    if (!routeName) return null
    const same = rides.filter((r) => r.routeName === routeName)
    const scored = same.filter((r) => r.scores)
    if (same.length === 0) return null
    const avg = scored.length
      ? Math.round((scored.reduce((a, r) => a + (r.scores?.total ?? 0), 0) / scored.length) * 10) / 10
      : null
    const totalKm = Math.round(same.reduce((a, r) => a + (r.distanceKm ?? 0), 0) * 10) / 10
    return { count: same.length, avg, totalKm, last: same[0]?.date ?? null }
  }, [routeName, rides])

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold tracking-wide text-slate-300">
        <span className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-sky-400" aria-hidden="true" />
          路线评价
        </span>
        {routeName && <span className="truncate text-xs font-normal text-slate-400" title={routeName}>· {routeName}</span>}
      </div>

      {!routeName ? (
        <p className="rounded-lg border border-dashed border-white/15 px-3 py-4 text-center text-xs leading-5 text-slate-500">
          当前记录没有关联路线 — 用「自动规划路线」生成或导入 GPX 后，这里会显示该路线的评价
        </p>
      ) : (
        <>
          {/* 自己的历史统计 */}
          {stats && (
            <div className="mb-3 flex items-center justify-around gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-center">
                <div className="text-base font-semibold text-slate-100">{stats.count}</div>
                <div className="text-[10px] text-slate-500">骑过（次）</div>
              </div>
              <div className="h-8 w-px bg-white/10" aria-hidden="true" />
              <div className="text-center">
                <div className="text-base font-semibold text-sky-300">{stats.avg ?? '—'}</div>
                <div className="text-[10px] text-slate-500">我的平均分</div>
              </div>
              <div className="h-8 w-px bg-white/10" aria-hidden="true" />
              <div className="text-center">
                <div className="text-base font-semibold text-slate-100">{stats.totalKm}</div>
                <div className="text-[10px] text-slate-500">累计（km）</div>
              </div>
              {stats.last && (
                <>
                  <div className="h-8 w-px bg-white/10" aria-hidden="true" />
                  <div className="text-center">
                    <div className="text-base font-semibold text-slate-100">{stats.last.slice(5)}</div>
                    <div className="text-[10px] text-slate-500">最近</div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 他人评价:预留区域 */}
          <div className="rounded-lg border border-dashed border-white/15 px-3 py-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              其他骑友的评分与评论
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-400">待开放</span>
            </div>
            <ul className="space-y-1 text-[11px] leading-5 text-slate-500">
              <li>· 骑友评分分布与综合评价</li>
              <li>· 路况、坡度与车流量反馈</li>
              <li>· 最佳骑行时段与注意事项</li>
            </ul>
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-slate-500">
              <Star className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              <span>本应用目前为本地个人版本，暂无社区数据；接入服务端后此处将展示真实评价</span>
            </p>
          </div>
        </>
      )}
    </section>
  )
}

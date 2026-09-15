import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, Wrench } from 'lucide-react'
import type { BikeWithStatus } from '../utils/tire'

interface Props {
  bikes: BikeWithStatus[]
  /** 跳转到「单车与轮胎」分页 */
  onManage: () => void
}

/** 保养提醒:汇总各车外胎寿命状态,需要关注的排前面 */
export default function MaintenanceAlerts({ bikes, onManage }: Props) {
  const { alerts, okCount } = useMemo(() => {
    const withTire = bikes.filter((b) => b.tire)
    const alerts = withTire
      .filter((b) => b.tire!.level !== 'ok')
      .sort((a, b) => b.tire!.ratio - a.tire!.ratio)
    return { alerts, okCount: withTire.length - alerts.length }
  }, [bikes])

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold tracking-wide text-slate-300">
        <span className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-amber-400" aria-hidden="true" />
          保养提醒
        </span>
        <button
          type="button"
          className="ml-auto text-xs font-normal text-sky-400 transition hover:text-sky-300"
          onClick={onManage}
        >
          管理单车
        </button>
      </div>

      {bikes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/15 px-3 py-4 text-center text-xs text-slate-500">
          还没有添加单车 — 添加后可跟踪外胎寿命并在此提醒
        </p>
      ) : alerts.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-xs text-slate-400">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
          {okCount} 辆车的外胎状态正常
        </p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((b) => {
            const level = b.tire!.level
            const expired = level === 'expired'
            return (
              <li
                key={b.id}
                className={`rounded-lg border px-3 py-2 ${
                  expired ? 'border-red-400/30 bg-red-500/10' : 'border-amber-400/30 bg-amber-500/10'
                }`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <AlertTriangle
                    className={`h-3.5 w-3.5 shrink-0 ${expired ? 'text-red-400' : 'text-amber-400'}`}
                    aria-hidden="true"
                  />
                  <span className="font-medium text-slate-200">{b.name}</span>
                  <span className={expired ? 'ml-auto text-red-300' : 'ml-auto text-amber-300'}>
                    {expired ? '已超期' : '接近寿命'}
                  </span>
                </div>
                <div className="mt-1 text-[11px] leading-5 text-slate-400">
                  {b.tire!.tireName}：已骑 {Math.round(b.tire!.usedKm)} / {b.tire!.lifeKm} km
                  {expired
                    ? `，超期 ${Math.round(Math.abs(b.tire!.remainingKm))} km，请注意检查外胎状态`
                    : `，还剩 ${Math.round(b.tire!.remainingKm)} km`}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

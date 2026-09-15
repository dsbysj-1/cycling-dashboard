import type { Bike, RideRecord } from '../types'
import { findTireType } from '../types'

export type TireLevel = 'ok' | 'soon' | 'expired'

export interface TireStatus {
  /** 该外胎类别的建议寿命(km) */
  lifeKm: number
  /** 外胎已骑里程(km) = 单车累计里程 - 安装时里程 */
  usedKm: number
  /** 距建议寿命还剩多少 km(负数表示已超期) */
  remainingKm: number
  /** 磨损比例 usedKm / lifeKm */
  ratio: number
  level: TireLevel
  tireName: string
}

export interface BikeWithStatus extends Bike {
  /** 该车归属骑行记录的距离总和(km) */
  totalKm: number
  /** 该车归属的骑行次数(含打卡生成的记录) */
  rideCount: number
  /** 最近一次骑行日期 YYYY-MM-DD */
  lastRideDate: string | null
  tire: TireStatus | null
}

/**
 * 单车统计:累计里程、骑行次数、最近骑行日期。
 * 骑行记录(含「今日骑行打卡」生成的记录)保存后即可在此看到变化,即自动同步到单车管理。
 */
export function bikeStats(
  bikeId: string,
  rides: RideRecord[]
): { totalKm: number; rideCount: number; lastRideDate: string | null } {
  let total = 0
  let count = 0
  let last: string | null = null
  for (const r of rides) {
    if (r.bikeId !== bikeId) continue
    count += 1
    if (r.distanceKm) total += r.distanceKm
    if (!last || r.date > last) last = r.date
  }
  return { totalKm: Math.round(total * 10) / 10, rideCount: count, lastRideDate: last }
}

/** 单车的累计里程 = 归属到该车的骑行记录距离之和 */
export function bikeTotalKm(bikeId: string, rides: RideRecord[]): number {
  let total = 0
  for (const r of rides) {
    if (r.bikeId === bikeId && r.distanceKm) total += r.distanceKm
  }
  return Math.round(total * 10) / 10
}

/** 外胎寿命状态:≥100% 已超期(提示检查),≥80% 接近寿命,其余正常 */
export function tireStatus(bike: Bike, totalKm: number): TireStatus | null {
  const tire = findTireType(bike.tireTypeId)
  if (!tire) return null
  const usedKm = Math.max(0, totalKm - bike.tireStartKm)
  const ratio = tire.lifeKm > 0 ? usedKm / tire.lifeKm : 0
  const level: TireLevel = ratio >= 1 ? 'expired' : ratio >= 0.8 ? 'soon' : 'ok'
  return {
    lifeKm: tire.lifeKm,
    usedKm,
    remainingKm: tire.lifeKm - usedKm,
    ratio,
    level,
    tireName: tire.name,
  }
}

/** 给单车列表附加累计里程、骑行次数与外胎状态 */
export function withTireStatus(bikes: Bike[], rides: RideRecord[]): BikeWithStatus[] {
  return bikes.map((bike) => {
    const { totalKm, rideCount, lastRideDate } = bikeStats(bike.id, rides)
    return { ...bike, totalKm, rideCount, lastRideDate, tire: tireStatus(bike, totalKm) }
  })
}

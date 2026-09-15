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
  tire: TireStatus | null
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

/** 给单车列表附加累计里程与外胎状态 */
export function withTireStatus(bikes: Bike[], rides: RideRecord[]): BikeWithStatus[] {
  return bikes.map((bike) => {
    const totalKm = bikeTotalKm(bike.id, rides)
    return { ...bike, totalKm, tire: tireStatus(bike, totalKm) }
  })
}

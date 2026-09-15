import { describe, expect, it } from 'vitest'
import type { Bike, RideRecord } from '../../types'
import { bikeStats, bikeTotalKm, tireStatus, withTireStatus } from '../tire'

const bike = (patch: Partial<Bike> = {}): Bike => ({
  id: 'b1',
  name: '小蓝',
  category: 'road',
  tireTypeId: 'road-clincher', // 建议寿命 4500km
  tireInstalledAt: '2026-01-01',
  tireStartKm: 0,
  createdAt: 1,
  updatedAt: 1,
  ...patch,
})

const ride = (patch: Partial<RideRecord> = {}): RideRecord =>
  ({
    id: 'r1',
    date: '2026-09-01',
    distanceKm: 30,
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  }) as RideRecord

describe('bikeStats', () => {
  it('汇总该车的里程、次数与最近骑行日期', () => {
    const stats = bikeStats('b1', [
      ride({ id: 'r1', date: '2026-09-01', distanceKm: 30, bikeId: 'b1' }),
      ride({ id: 'r2', date: '2026-09-10', distanceKm: 20.5, bikeId: 'b1' }),
      ride({ id: 'r3', date: '2026-09-12', distanceKm: 99, bikeId: 'b2' }), // 其它车,不计入
    ])
    expect(stats.totalKm).toBe(50.5)
    expect(stats.rideCount).toBe(2)
    expect(stats.lastRideDate).toBe('2026-09-10')
  })

  it('距离为空(打卡记录)时只计次数', () => {
    const stats = bikeStats('b1', [ride({ bikeId: 'b1', distanceKm: null })])
    expect(stats.totalKm).toBe(0)
    expect(stats.rideCount).toBe(1)
  })

  it('没有记录时全为 0 / null', () => {
    expect(bikeStats('b1', [])).toEqual({ totalKm: 0, rideCount: 0, lastRideDate: null })
  })

  it('bikeTotalKm 与 bikeStats.totalKm 口径一致', () => {
    const rides = [ride({ id: 'r1', distanceKm: 12.34, bikeId: 'b1' })]
    expect(bikeTotalKm('b1', rides)).toBe(bikeStats('b1', rides).totalKm)
  })
})

describe('tireStatus', () => {
  it('磨损比例 <80% 为正常', () => {
    expect(tireStatus(bike(), 3000)?.level).toBe('ok')
  })

  it('≥80% 提示接近寿命', () => {
    const status = tireStatus(bike(), 3600)
    expect(status?.level).toBe('soon')
    expect(status?.usedKm).toBe(3600)
    expect(status?.remainingKm).toBe(900)
  })

  it('≥100% 视为超期', () => {
    const status = tireStatus(bike(), 4600)
    expect(status?.level).toBe('expired')
    expect(status?.remainingKm).toBe(-100)
  })

  it('扣掉换胎时的起点里程', () => {
    const status = tireStatus(bike({ tireStartKm: 1000 }), 4600)
    expect(status?.usedKm).toBe(3600)
    expect(status?.level).toBe('soon')
  })

  it('累计里程小于换胎起点里程时已骑里程按 0 计', () => {
    expect(tireStatus(bike({ tireStartKm: 5000 }), 100)?.usedKm).toBe(0)
  })

  it('按外胎类别取对应寿命', () => {
    // 山地外胎 6500km:同样 5000km 里程仍未到 80%
    expect(tireStatus(bike({ tireTypeId: 'mtb-trail' }), 5000)?.level).toBe('ok')
    // 公路竞赛胎 3000km:5000km 已超期
    expect(tireStatus(bike({ tireTypeId: 'road-race' }), 5000)?.level).toBe('expired')
  })

  it('未知外胎类型返回 null', () => {
    expect(tireStatus(bike({ tireTypeId: 'unknown' }), 100)).toBeNull()
  })
})

describe('withTireStatus', () => {
  it('为每辆车附加统计字段', () => {
    const list = withTireStatus([bike()], [ride({ id: 'r1', distanceKm: 4000, bikeId: 'b1' })])
    expect(list[0].totalKm).toBe(4000)
    expect(list[0].rideCount).toBe(1)
    expect(list[0].lastRideDate).toBe('2026-09-01')
    expect(list[0].tire?.level).toBe('soon')
  })

  it('没有外胎类别时 tire 为 null,不影响其它字段', () => {
    const list = withTireStatus([bike({ tireTypeId: 'unknown' })], [])
    expect(list[0].tire).toBeNull()
    expect(list[0].totalKm).toBe(0)
  })
})

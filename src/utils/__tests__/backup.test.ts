import { describe, expect, it } from 'vitest'
import type { Bike, RideRecord } from '../../types'
import { BACKUP_APP, BACKUP_VERSION, createBackup, parseBackup } from '../backup'

/** 一份结构完整的骑行记录,测试里按需覆盖字段来构造异常数据 */
const validRide = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'r1',
  date: '2026-09-15',
  durationMin: 60,
  distanceKm: 24.5,
  avgSpeed: 24.5,
  maxSpeed: 32.1,
  cityName: '广州',
  cityCode: '101280101',
  location: { lat: 23.1291, lon: 113.2644 },
  env: { temperature: 22, windLevel: 2, humidity: 55, precipitation: 0, precipitationProbability: 10, aqi: 40, pm25: 20 },
  envMeta: { weatherFetched: true, aqiFetched: true, manualEdited: false },
  route: { elevationGain: 120, avgGrade: 1.5, surface: 'asphalt', traffic: 'low' },
  track: [{ lat: 23.12, lon: 113.32, ele: 12, time: '2026-09-15T08:00:00Z' }],
  speedSeries: [{ distanceKm: 0, speed: 20 }],
  scores: { total: 88, weather: 90, route: 85, rainFactor: 4 },
  comment: '不错',
  suggestions: ['注意补水'],
  notes: '',
  createdAt: 1000,
  updatedAt: 2000,
  ...patch,
})

const validBike = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'b1',
  name: '小蓝',
  category: 'road',
  tireTypeId: 'road-clincher',
  tireInstalledAt: '2026-01-01',
  tireStartKm: 0,
  createdAt: 1,
  updatedAt: 1,
  ...patch,
})

const validDay = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: '2026-09-15',
  date: '2026-09-15',
  rode: true,
  bikeId: 'b1',
  createdAt: 1,
  ...patch,
})

const payload = (patch: Record<string, unknown> = {}) => ({
  app: BACKUP_APP,
  version: BACKUP_VERSION,
  exportedAt: '2026-09-15T08:00:00Z',
  rides: [validRide()],
  bikes: [validBike()],
  days: [validDay()],
  ...patch,
})

describe('createBackup', () => {
  it('写入应用标识与格式版本', () => {
    const out = createBackup([], [], [])
    expect(out.app).toBe(BACKUP_APP)
    expect(out.version).toBe(BACKUP_VERSION)
    expect(out.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('parseBackup:整体校验', () => {
  it('接受合法备份并原样归一化', () => {
    const result = parseBackup(payload())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.rides).toHaveLength(1)
    expect(result.summary.bikes).toHaveLength(1)
    expect(result.summary.days).toHaveLength(1)
    expect(result.summary.skipped).toEqual({ rides: 0, bikes: 0, days: 0 })
    expect(result.summary.rides[0].distanceKm).toBe(24.5)
    expect(result.summary.rides[0].scores?.total).toBe(88)
  })

  it('拒绝非对象', () => {
    expect(parseBackup(null).ok).toBe(false)
    expect(parseBackup('[]').ok).toBe(false)
    expect(parseBackup(42).ok).toBe(false)
  })

  it('拒绝其它应用导出的文件', () => {
    const result = parseBackup(payload({ app: 'other-app' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('不是本应用')
  })

  it('没有可导入数据时明确报错', () => {
    const result = parseBackup(payload({ rides: [], bikes: [], days: [] }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('没有可导入的数据')
  })

  it('全部数据都非法时,错误信息里给出条数', () => {
    const result = parseBackup(payload({ rides: [{ id: 'x', date: '不是日期' }], bikes: [], days: [] }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('1')
  })

  it('缺字段的旧版本文件仍可导入(字段按默认值补齐)', () => {
    const result = parseBackup({ rides: [{ id: 'r1', date: '2026-09-15' }], bikes: [], days: [] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const r = result.summary.rides[0]
    expect(r.distanceKm).toBeNull()
    expect(r.track).toEqual([])
    expect(r.speedSeries).toEqual([])
    expect(r.scores).toBeNull()
    expect(r.env.temperature).toBeNull()
    expect(r.route.surface).toBeNull()
    expect(typeof r.createdAt).toBe('number')
  })
})

describe('parseBackup:骑行记录归一化', () => {
  it('跳过缺 id 或日期非法的记录并计数', () => {
    const result = parseBackup(
      payload({
        rides: [validRide(), { date: '2026-09-14' }, { id: 'r3', date: '2026/09/14' }, { id: 'r4', date: '2026-09-13' }],
      })
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.rides.map((r) => r.id)).toEqual(['r1', 'r4'])
    expect(result.summary.skipped.rides).toBe(2)
  })

  it('track / speedSeries 结构损坏时归一为空数组,而不是把脏数据写进库', () => {
    const result = parseBackup(
      payload({
        rides: [
          validRide({
            track: 'not-an-array',
            speedSeries: [{ distanceKm: 'x', speed: 1 }, { distanceKm: 1, speed: 2 }],
          }),
        ],
      })
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.rides[0].track).toEqual([])
    expect(result.summary.rides[0].speedSeries).toEqual([{ distanceKm: 1, speed: 2 }])
  })

  it('track 里的非法点被逐点剔除', () => {
    const result = parseBackup(
      payload({
        rides: [
          validRide({
            track: [
              { lat: 23.1, lon: 113.3, ele: 10, time: '2026-09-15T08:00:00Z' },
              { lat: 'x', lon: 113.4 },
              { lon: 113.5 },
            ],
          }),
        ],
      })
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.rides[0].track).toEqual([{ lat: 23.1, lon: 113.3, ele: 10, time: '2026-09-15T08:00:00Z' }])
  })

  it('枚举值非法时回落为 null,合法值保留', () => {
    const result = parseBackup(
      payload({
        rides: [
          validRide({ route: { elevationGain: 100, avgGrade: 2, surface: '火箭路', traffic: 'medium' } }),
        ],
      })
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.rides[0].route.surface).toBeNull()
    expect(result.summary.rides[0].route.traffic).toBe('medium')
  })

  it('scores 缺字段时整体作废(避免半截评分进图表)', () => {
    const result = parseBackup(payload({ rides: [validRide({ scores: { total: 88 } })] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.rides[0].scores).toBeNull()
  })

  it('suggestions 只保留字符串项', () => {
    const result = parseBackup(payload({ rides: [validRide({ suggestions: ['a', 42, null, 'b'] })] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.rides[0].suggestions).toEqual(['a', 'b'])
  })

  it('location 缺经纬度时归一为 null', () => {
    const result = parseBackup(payload({ rides: [validRide({ location: { lat: 23.1 } })] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.rides[0].location).toBeNull()
  })
})

describe('parseBackup:单车与打卡归一化', () => {
  it('未知外胎类别回落到第一个可用类型,日期非法则用今天', () => {
    const result = parseBackup(
      payload({ bikes: [validBike({ tireTypeId: 'not-exist', tireInstalledAt: '2026/01/01', category: '飞机' })] })
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const b = result.summary.bikes[0] as Bike
    expect(b.tireTypeId).toBe('road-race')
    expect(b.category).toBe('other')
    expect(b.tireInstalledAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('缺名称的单车被跳过', () => {
    const result = parseBackup(payload({ bikes: [{ id: 'b2' }] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.skipped.bikes).toBe(1)
  })

  it('打卡缺 id 时用日期兜底,日期非法则跳过', () => {
    const result = parseBackup(payload({ days: [validDay({ id: undefined }), { id: 'x', date: 'nope' }] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.days).toHaveLength(1)
    expect(result.summary.days[0].id).toBe('2026-09-15')
    expect(result.summary.skipped.days).toBe(1)
  })

  it('rode 非布尔值时按 false 处理', () => {
    const result = parseBackup(payload({ days: [validDay({ rode: 'yes' })] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.days[0].rode).toBe(false)
  })
})

describe('parseBackup:往返一致', () => {
  it('导出再导入后关键字段不变', () => {
    const ride = validRide() as unknown as RideRecord
    const backup = createBackup([ride], [], [])
    const result = parseBackup(JSON.parse(JSON.stringify(backup)))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.rides[0]).toEqual(ride)
  })
})

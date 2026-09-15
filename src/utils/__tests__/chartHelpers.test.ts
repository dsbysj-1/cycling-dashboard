import { describe, expect, it } from 'vitest'
import {
  areaPath,
  downsample,
  extent,
  linePath,
  monotoneAreaPath,
  monotonePath,
  niceTicks,
  radarVertex,
  scaleLinear,
} from '../chartHelpers'

describe('scaleLinear', () => {
  it('把 domain 线性映射到 range', () => {
    const scale = scaleLinear([0, 100], [10, 110])
    expect(scale(0)).toBe(10)
    expect(scale(50)).toBe(60)
    expect(scale(100)).toBe(110)
  })

  it('支持反向 range(SVG 的 y 轴)', () => {
    expect(scaleLinear([0, 100], [200, 20])(0)).toBe(200)
    expect(scaleLinear([0, 100], [200, 20])(100)).toBe(20)
  })

  it('domain 退化为一个点时返回 range 中点,不产生 NaN', () => {
    expect(scaleLinear([5, 5], [0, 100])(5)).toBe(50)
  })
})

describe('niceTicks', () => {
  it('返回落在区间内、递增的刻度', () => {
    const ticks = niceTicks(0, 100, 5)
    expect(ticks.length).toBeGreaterThan(1)
    expect(ticks[0]).toBeGreaterThanOrEqual(0)
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(100)
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]).toBeGreaterThan(ticks[i - 1])
  })

  it('海拔这类小数区间也能给出合理刻度', () => {
    const ticks = niceTicks(-12.5, 43.2, 4)
    expect(ticks.length).toBeGreaterThan(1)
    expect(ticks.every((t) => Number.isFinite(t))).toBe(true)
  })

  it('非有限输入返回空数组(由调用方降级)', () => {
    expect(niceTicks(NaN, 100)).toEqual([])
    expect(niceTicks(0, Infinity)).toEqual([])
  })

  it('min === max 时返回单个刻度,不进入死循环', () => {
    expect(niceTicks(7, 7)).toEqual([7])
  })
})

describe('path 生成', () => {
  it('linePath 首点用 M,其余用 L', () => {
    expect(linePath([])).toBe('')
    expect(linePath([[0, 1]])).toBe('M0.00,1.00')
    expect(linePath([[0, 1], [10, 11]])).toBe('M0.00,1.00 L10.00,11.00')
  })

  it('areaPath 沿基线闭合', () => {
    const d = areaPath([[0, 10], [20, 5]], 100)
    expect(d).toBe('M0.00,10.00 L20.00,5.00 L20.00,100.00 L0.00,100.00 Z')
  })

  it('monotonePath 点数不足时退化为折线,避免除零', () => {
    const points: [number, number][] = [[0, 0], [1, 1]]
    expect(monotonePath(points)).toBe(linePath(points))
    expect(monotonePath([])).toBe('')
  })

  it('monotoneAreaPath 与 monotonePath 使用同一条曲线,填充与描边不会错位', () => {
    const points: [number, number][] = [[0, 5], [10, 20], [20, 8]]
    const area = monotoneAreaPath(points, 100)
    expect(area.startsWith(monotonePath(points))).toBe(true)
    expect(area.endsWith('Z')).toBe(true)
  })

  it('单调插值不过冲:控制点不会超出相邻数据点的取值范围', () => {
    // 尖峰数据:0 → 100 → 0。普通 Catmull-Rom 会把曲线甩到 100 以上或 0 以下,
    // Fritsch–Carlson 限幅后所有坐标都应落在 [0, 100] 内。
    const d = monotonePath([[0, 0], [1, 100], [2, 0]])
    const nums = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
    expect(nums.length).toBeGreaterThan(0)
    expect(Math.max(...nums)).toBeLessThanOrEqual(100)
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(0)
  })
})

describe('radarVertex', () => {
  it('第一条轴指向正上方', () => {
    const [x, y] = radarVertex(100, 100, 50, 4, 0, 1)
    expect(x).toBeCloseTo(100, 6)
    expect(y).toBeCloseTo(50, 6)
  })

  it('value 会被裁剪到 0–1,不画出环外', () => {
    expect(radarVertex(100, 100, 50, 4, 0, 3)).toEqual(radarVertex(100, 100, 50, 4, 0, 1))
    expect(radarVertex(100, 100, 50, 4, 0, -1)).toEqual(radarVertex(100, 100, 50, 4, 0, 0))
  })
})

describe('extent', () => {
  it('取范围并忽略非有限值', () => {
    expect(extent([3, -1, 8, NaN, Infinity])).toEqual([-1, 8])
  })

  it('全为无效值时返回 [0, 0]', () => {
    expect(extent([])).toEqual([0, 0])
    expect(extent([NaN])).toEqual([0, 0])
  })
})

describe('downsample', () => {
  it('不超过上限时原样返回', () => {
    const items = [1, 2, 3]
    expect(downsample(items, 240)).toBe(items)
  })

  it('降采样后长度等于上限,且保留首尾点', () => {
    const items = Array.from({ length: 1000 }, (_, i) => i)
    const out = downsample(items, 240)
    expect(out).toHaveLength(240)
    expect(out[0]).toBe(0)
    expect(out[out.length - 1]).toBe(999)
  })

  it('降采样结果保持原顺序', () => {
    const out = downsample(Array.from({ length: 500 }, (_, i) => i), 50)
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1])
  })
})

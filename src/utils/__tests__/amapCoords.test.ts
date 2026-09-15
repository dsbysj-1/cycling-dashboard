import { describe, expect, it } from 'vitest'
import { readLngLat, readPath } from '../amapCoords'

/**
 * 高德各接口返回坐标的形态不统一(数组 / 对象 / LngLat 实例),
 * 这里是唯一把它们归一的地方,所以每种形态都要有用例兜住。
 */
describe('readLngLat', () => {
  it('接受 [lng, lat] 数组', () => {
    expect(readLngLat([113.32, 23.12])).toEqual({ lng: 113.32, lat: 23.12 })
  })

  it('接受 {lng, lat} 对象', () => {
    expect(readLngLat({ lng: 113.32, lat: 23.12 })).toEqual({ lng: 113.32, lat: 23.12 })
  })

  it('接受 LngLat 实例(getLng/getLat)', () => {
    const instance = { getLng: () => 113.32, getLat: () => 23.12 }
    expect(readLngLat(instance)).toEqual({ lng: 113.32, lat: 23.12 })
  })

  it('空值与非对象返回 null', () => {
    expect(readLngLat(null)).toBeNull()
    expect(readLngLat(undefined)).toBeNull()
    expect(readLngLat('')).toBeNull()
    expect(readLngLat(0)).toBeNull()
    expect(readLngLat('113.32,23.12')).toBeNull()
  })

  it('坐标为 NaN / Infinity / 字符串时返回 null', () => {
    expect(readLngLat([NaN, 23.12])).toBeNull()
    expect(readLngLat([Infinity, 23.12])).toBeNull()
    expect(readLngLat(['113.32', '23.12'])).toBeNull()
    expect(readLngLat({ lng: 113.32 })).toBeNull()
    expect(readLngLat({})).toBeNull()
  })

  it('纬度为 0 是合法坐标,不能被当成空值丢掉', () => {
    expect(readLngLat([0, 0])).toEqual({ lng: 0, lat: 0 })
    expect(readLngLat({ lng: 0, lat: 23.12 })).toEqual({ lng: 0, lat: 23.12 })
  })
})

describe('readPath', () => {
  it('批量转换并保持顺序', () => {
    expect(readPath([[113.3, 23.1], { lng: 113.4, lat: 23.2 }])).toEqual([
      { lat: 23.1, lon: 113.3 },
      { lat: 23.2, lon: 113.4 },
    ])
  })

  it('过滤掉无法解析的点,而不是产生 NaN 坐标', () => {
    const path = readPath([[113.3, 23.1], null, 'x', { lng: NaN, lat: 1 }, [113.4, 23.2]])
    expect(path).toEqual([
      { lat: 23.1, lon: 113.3 },
      { lat: 23.2, lon: 113.4 },
    ])
  })

  it('空数组返回空数组', () => {
    expect(readPath([])).toEqual([])
  })
})

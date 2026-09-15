import type { TrackPoint } from '../types'

const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation'
const BATCH_SIZE = 100

/**
 * 批量查询海拔(Open-Meteo Elevation 接口,免 Key,单次最多 100 个坐标)。
 * 用于「地图绘制路线」场景:高德 JS API 不提供免费海拔查询,改用此接口采样。
 */
export async function fetchElevations(points: { lat: number; lon: number }[]): Promise<number[]> {
  const elevations: number[] = []
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE)
    const lats = batch.map((p) => p.lat.toFixed(5)).join(',')
    const lons = batch.map((p) => p.lon.toFixed(5)).join(',')
    const res = await fetch(`${ELEVATION_URL}?latitude=${lats}&longitude=${lons}`)
    if (!res.ok) throw new Error(`海拔查询失败（HTTP ${res.status}）`)
    const data = await res.json()
    if (!Array.isArray(data?.elevation)) throw new Error('海拔数据格式异常')
    elevations.push(...(data.elevation as number[]))
  }
  return elevations
}

/** 给轨迹点补齐海拔并统计爬升,采样至多 100 个点以减少请求量 */
export async function enrichTrackElevation(track: TrackPoint[]): Promise<TrackPoint[]> {
  if (track.length < 2) return track
  const sampleCount = Math.min(track.length, 100)
  const step = (track.length - 1) / (sampleCount - 1)
  const sampled: TrackPoint[] = []
  for (let i = 0; i < sampleCount; i++) sampled.push(track[Math.round(i * step)])
  const elevations = await fetchElevations(sampled)
  const enriched = sampled.map((p, i) => ({ ...p, ele: elevations[i] }))
  // 用采样点估算爬升即可,原始轨迹点不逐个回填
  return enriched
}

/** 累计爬升(过滤 <1m 噪声) */
export function computeGain(points: TrackPoint[]): number {
  let gain = 0
  let prev: number | null = null
  for (const p of points) {
    if (p.ele == null || !Number.isFinite(p.ele)) continue
    if (prev != null && p.ele - prev > 1) gain += p.ele - prev
    if (prev == null || Math.abs(p.ele - prev) > 1) prev = p.ele
  }
  return Math.round(gain)
}

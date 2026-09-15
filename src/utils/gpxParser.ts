import type { TrackPoint } from '../types'

/** 用 DOMParser 解析 GPX 文本,提取轨迹点(lat/lon/ele/time) */
export function parseGPX(xml: string): { points: TrackPoint[]; name?: string } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('GPX 文件格式无效（XML 解析失败）')
  const nodes = Array.from(doc.getElementsByTagName('trkpt'))
  if (nodes.length === 0) throw new Error('GPX 文件中没有轨迹点（trkpt）')
  const points: TrackPoint[] = []
  for (const node of nodes) {
    const lat = parseFloat(node.getAttribute('lat') ?? '')
    const lon = parseFloat(node.getAttribute('lon') ?? '')
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const eleNode = node.getElementsByTagName('ele')[0]
    const timeNode = node.getElementsByTagName('time')[0]
    points.push({
      lat,
      lon,
      ele: eleNode ? parseFloat(eleNode.textContent ?? '') : undefined,
      time: timeNode?.textContent?.trim() || undefined,
    })
  }
  if (points.length < 2) throw new Error('有效轨迹点不足（至少需要 2 个）')
  const nameNode = doc.getElementsByTagName('name')[0]
  return { points, name: nameNode?.textContent?.trim() || undefined }
}

/** 球面距离(Haversine),米 */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** 轨迹总距离,米 */
export function trackDistanceMeters(points: TrackPoint[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon)
  }
  return total
}

/** 累计爬升,米(过滤 <1m 的噪声波动) */
export function elevationGainMeters(points: TrackPoint[]): number {
  let gain = 0
  let prev: number | null = null
  for (const p of points) {
    if (p.ele == null || !Number.isFinite(p.ele)) continue
    if (prev != null && p.ele - prev > 1) gain += p.ele - prev
    if (prev == null || Math.abs(p.ele - prev) > 1) prev = p.ele
  }
  return Math.round(gain)
}

/** 速度序列:相邻轨迹点由时间+距离计算,km/h;返回累计距离(km)与速度 */
export function speedSeriesFromTrack(points: TrackPoint[]): { distanceKm: number; speed: number }[] {
  const series: { distanceKm: number; speed: number }[] = []
  let cumulative = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const segMeters = haversine(a.lat, a.lon, b.lat, b.lon)
    cumulative += segMeters
    let speed = 0
    if (a.time && b.time) {
      const dt = (Date.parse(b.time) - Date.parse(a.time)) / 1000
      if (dt > 0) speed = Math.min(100, (segMeters / dt) * 3.6) // 上限 100km/h,过滤 GPS 抖动
    }
    series.push({ distanceKm: cumulative / 1000, speed })
  }
  return series
}

/** 从速度序列取最高速度(排除 GPS 抖动导致的异常值) */
export function maxSpeedFromSeries(series: { speed: number }[]): number | null {
  const values = series.map((s) => s.speed).filter((v) => v > 0)
  if (!values.length) return null
  return Math.round(Math.max(...values) * 10) / 10
}

/** GPX 轨迹统计:距离 km、爬升 m、平均坡度 %、起终点 */
export function summarizeTrack(points: TrackPoint[]): {
  distanceKm: number
  elevationGain: number
  avgGrade: number | null
  start: { lat: number; lon: number }
  end: { lat: number; lon: number }
} {
  const distanceKm = trackDistanceMeters(points) / 1000
  const elevationGain = elevationGainMeters(points)
  const hasEle = points.some((p) => p.ele != null)
  return {
    distanceKm: Math.round(distanceKm * 100) / 100,
    elevationGain,
    avgGrade: hasEle ? Math.round((elevationGain / Math.max(1, distanceKm * 1000)) * 10000) / 100 : null,
    start: { lat: points[0].lat, lon: points[0].lon },
    end: { lat: points[points.length - 1].lat, lon: points[points.length - 1].lon },
  }
}

/**
 * 高德返回的坐标形态不统一:POI / tip 里可能是 {lng, lat}、[lng, lat] 数组,
 * 也可能是 LngLat 实例(带 getLng/getLat)。地图绘制回调同样如此。
 *
 * 入参用 unknown、内部逐形态判断,这样调用处不必到处写类型断言或 any。
 */
function isCoord(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export function readLngLat(input: unknown): { lng: number; lat: number } | null {
  if (!input) return null

  if (Array.isArray(input)) {
    const [lng, lat] = input as unknown[]
    return isCoord(lng) && isCoord(lat) ? { lng, lat } : null
  }

  if (typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const lng = typeof raw.getLng === 'function' ? (raw.getLng as () => number)() : raw.lng
  const lat = typeof raw.getLat === 'function' ? (raw.getLat as () => number)() : raw.lat
  return isCoord(lng) && isCoord(lat) ? { lng, lat } : null
}

/** 批量把高德路径点转成 {lat, lon},过滤掉解析失败的点 */
export function readPath(inputs: unknown[]): { lat: number; lon: number }[] {
  const out: { lat: number; lon: number }[] = []
  for (const raw of inputs) {
    const ll = readLngLat(raw)
    if (ll) out.push({ lat: ll.lat, lon: ll.lng })
  }
  return out
}

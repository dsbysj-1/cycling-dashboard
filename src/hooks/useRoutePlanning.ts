import type { TrackPoint } from '../types'
import { haversine } from '../utils/gpxParser'

/**
 * 骑行路线自动规划:
 * 高德骑行路径规划单次只返回一条路线,因此「供用户选择的候选」由
 * 「周边骑行目的地 POI 搜索 + 逐条真实路径规划」生成 —— 每条都是真实路网路线。
 */

/** 周边目的地搜索关键词(公园/绿道最适合骑行) */
const NEARBY_KEYWORDS = '公园|绿道'
/** 以起点为中心的兜底搜索半径(米),仅在反查城市失败时使用 */
const NEARBY_RADIUS_M = 30000
/** 城市内搜索的返回条数:条数越多,可选的距离梯度越丰富 */
const SEARCH_PAGE_SIZE = 25
/**
 * 候选目的地的直线距离筛选范围(km)。
 * 下限取得较小:城市密集区周边多是几百米的口袋公园,但它们同样是可骑的短途目的地。
 */
const MIN_STRAIGHT_KM = 0.8
const MAX_STRAIGHT_KM = 30
/** 最多生成几条候选路线(每条都要一次路径规划请求) */
const MAX_CANDIDATES = 6

export interface DestinationSuggestion {
  id: string
  name: string
  address?: string
  location: { lng: number; lat: number }
  /** 与起点的直线距离(km),用于筛选与排序 */
  straightKm: number
}

export interface RouteCandidate {
  id: string
  /** 目的地名称,如「越秀公园」 */
  name: string
  address?: string
  /** 路线距离(km) */
  distanceKm: number
  /** 预计耗时(分钟) */
  durationMin: number
  /** 预计平均速度(km/h) */
  avgSpeed: number
  /** 路线几何(GPS 轨迹点) */
  path: TrackPoint[]
  /** 是否为用户明确指定的目的地(排在首位并自动选中) */
  primary?: boolean
}

/** 高德 POI 坐标可能是 LngLat 实例,也可能是 [lng, lat] 数组 */
function readLngLat(input: any): { lng: number; lat: number } | null {
  if (!input) return null
  if (Array.isArray(input)) {
    const [lng, lat] = input
    return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null
  }
  const lng = typeof input.getLng === 'function' ? input.getLng() : input.lng
  const lat = typeof input.getLat === 'function' ? input.getLat() : input.lat
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null
}

/** 从骑行规划结果中提取完整路径(拼接各段 path,去除连续重复点) */
function extractPath(route: any): TrackPoint[] {
  const points: TrackPoint[] = []
  const push = (raw: any) => {
    const ll = readLngLat(raw)
    if (!ll) return
    const last = points[points.length - 1]
    if (last && last.lat === ll.lat && last.lon === ll.lng) return
    points.push({ lat: ll.lat, lon: ll.lng })
  }
  const rides: any[] = route?.rides ?? []
  rides.forEach((step) => (step?.path ?? []).forEach(push))
  if (points.length < 2) (route?.path ?? []).forEach(push)
  return points
}

export interface ReverseGeocodeResult {
  /** 行政区划编码 */
  adcode: string | null
  /** 可读的地名:优先取最近的 POI 名称,其次由行政区+街道拼装 */
  name: string
  /** 起点所在的「市+区」,如「广州市天河区」,用于历史记录里显示到区 */
  district: string
}

/**
 * 逆地理编码:坐标 → 地名。
 * 起点由用户自由指定(定位/地图点选/搜索),不一定在表单所选城市内,
 * 因此需要用起点自身所在的城市去搜索目的地;同时这个地名会作为「起点位置」记录进历史。
 */
export function reverseGeocode(AMap: any, origin: [number, number]): Promise<ReverseGeocodeResult | null> {
  return new Promise((resolve) => {
    const geocoder = new AMap.Geocoder({})
    const timer = setTimeout(() => resolve(null), 8000)
    geocoder.getAddress(origin, (status: string, result: any) => {
      clearTimeout(timer)
      const regeocode = result?.regeocode
      if (status !== 'complete' || !regeocode) {
        resolve(null)
        return
      }
      const comp = regeocode.addressComponent ?? {}
      const adcode = comp.adcode ? String(comp.adcode) : null
      const poiName = regeocode.pois?.[0]?.name
      const assembled = [comp.city, comp.district, comp.street, comp.streetNumber]
        .filter((v: unknown) => typeof v === 'string' && v.length > 0)
        .join('')
      // 「市+区」:city 字段在直辖市可能为空,此时退回 province
      const cityName = typeof comp.city === 'string' && comp.city ? comp.city : (comp.province ?? '')
      const district = [cityName, comp.district]
        .filter((v: unknown) => typeof v === 'string' && v.length > 0)
        .join('')
      resolve({
        adcode,
        name: String(poiName || assembled || regeocode.formattedAddress || '').trim(),
        district: String(district).trim(),
      })
    })
  })
}

/** 反查起点所在城市的行政区划编码(adcode) */
export async function resolveOriginAdcode(AMap: any, origin: [number, number]): Promise<string | null> {
  const result = await reverseGeocode(AMap, origin)
  return result?.adcode ?? null
}

/** 反查坐标对应的起点信息(地名 + 所在市区);失败时返回 null */
export async function reverseGeocodePlace(
  AMap: any,
  origin: [number, number]
): Promise<{ name: string; district: string } | null> {
  const result = await reverseGeocode(AMap, origin)
  if (!result) return null
  return { name: result.name, district: result.district }
}

/**
 * 搜索起点周边适合骑行的目的地(POI)。
 *
 * 用「城市内关键词搜索」而不是「周边搜索」:高德周边搜索严格按距离排序且有条数上限,
 * 在城市密集区只会返回几百米内的口袋公园(实测 pageSize=50 最远也仅 3.4km),
 * 拿不到真正适合骑行的目的地;城市内搜索会返回全市范围内更有代表性的公园/绿道。
 * 城市编码由起点反查得到,因此起点可以在任意城市。
 */
export function searchRideDestinations(
  AMap: any,
  origin: [number, number],
  adcode: string | null
): Promise<DestinationSuggestion[]> {
  const request = () =>
    new Promise<DestinationSuggestion[]>((resolve, reject) => {
      const options = adcode
        ? { city: adcode, pageSize: SEARCH_PAGE_SIZE, extensions: 'base', citylimit: true }
        : { pageSize: SEARCH_PAGE_SIZE, extensions: 'base' }
      const placeSearch = new AMap.PlaceSearch(options)
      const timer = setTimeout(() => reject(new Error('目的地搜索超时，请重试')), 15000)

      const collect = (status: string, result: any) => {
        clearTimeout(timer)
        if (status !== 'complete') {
          reject(new Error(result?.info ?? '目的地搜索失败'))
          return
        }
        const pois: any[] = result?.poiList?.pois ?? []
        const suggestions = pois
          .map((poi) => {
            const ll = readLngLat(poi.location)
            if (!ll) return null
            const straightKm = haversine(origin[1], origin[0], ll.lat, ll.lng) / 1000
            return {
              id: String(poi.id ?? poi.name),
              name: String(poi.name ?? '未命名地点'),
              address: poi.address || undefined,
              location: ll,
              straightKm,
            }
          })
          .filter((x): x is NonNullable<typeof x> => x != null)
          .filter((x) => x.straightKm >= MIN_STRAIGHT_KM && x.straightKm <= MAX_STRAIGHT_KM)
          .sort((a, b) => a.straightKm - b.straightKm)

        // 按距离均匀取样,避免候选全部挤在同一距离段(密集区尤其明显)
        if (suggestions.length <= MAX_CANDIDATES) {
          resolve(suggestions)
          return
        }
        const step = (suggestions.length - 1) / (MAX_CANDIDATES - 1)
        const picked: DestinationSuggestion[] = []
        const seen = new Set<string>()
        for (let i = 0; i < MAX_CANDIDATES; i++) {
          const item = suggestions[Math.round(i * step)]
          if (item && !seen.has(item.id)) {
            seen.add(item.id)
            picked.push(item)
          }
        }
        resolve(picked)
      }

      if (adcode) placeSearch.search(NEARBY_KEYWORDS, collect)
      else placeSearch.searchNearBy(NEARBY_KEYWORDS, new AMap.LngLat(origin[0], origin[1]), NEARBY_RADIUS_M, collect)
    })

  // 高德搜索有 QPS 限制,偶发失败时短暂等待后重试一次
  return request().catch(async (err: unknown) => {
    await new Promise((r) => setTimeout(r, 900))
    return request().catch(() => {
      throw err
    })
  })
}

export interface PlannedRoute {
  distanceKm: number
  durationMin: number
  path: TrackPoint[]
}

/** 骑行路径规划(真实路网) */
export function planRideRoute(
  AMap: any,
  origin: [number, number],
  destination: [number, number]
): Promise<PlannedRoute> {
  return new Promise((resolve, reject) => {
    const riding = new AMap.Riding({ policy: 0 })
    const timer = setTimeout(() => reject(new Error('路线规划超时，请重试')), 15000)
    riding.search(origin, destination, (status: string, result: any) => {
      clearTimeout(timer)
      if (status !== 'complete') {
        reject(new Error(result?.info ?? '路线规划失败'))
        return
      }
      const route = (result?.routes ?? [])[0]
      if (!route) {
        reject(new Error('未找到骑行路线'))
        return
      }
      const path = extractPath(route)
      if (path.length < 2) {
        reject(new Error('路线几何数据为空'))
        return
      }
      const distanceKm = Math.round((route.distance / 1000) * 100) / 100
      const durationMin = Math.max(1, Math.round(route.time / 60))
      resolve({ distanceKm, durationMin, path })
    })
  })
}

export interface RoutePlanningOptions {
  /** 只在指定地点周围搜索(用于「指定目的地」模式) */
  destination?: { name: string; lng: number; lat: number } | null
  /** 进度回调:正在规划去往某地的路线 */
  onProgress?: (label: string, index: number, total: number) => void
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** 连续规划多条路线时的间隔:高德接口有 QPS 限制,过度并发会静默失败 */
const PLAN_INTERVAL_MS = 220

/**
 * 生成候选骑行路线。
 * 未指定目的地时:自动搜索起点周边的公园/绿道,逐条规划真实路线;
 * 指定目的地时:优先规划该目的地,再把周边目的地作为备选一起列出。
 */
export async function buildRouteCandidates(
  AMap: any,
  origin: [number, number],
  options: RoutePlanningOptions = {}
): Promise<RouteCandidate[]> {
  const { destination, onProgress } = options
  const candidates: RouteCandidate[] = []

  /** 规划单条路线,失败时隔一会儿重试一次(应对 QPS 限流) */
  const planWithRetry = async (target: [number, number]) => {
    try {
      return await planRideRoute(AMap, origin, target)
    } catch (err) {
      await sleep(600)
      try {
        return await planRideRoute(AMap, origin, target)
      } catch {
        throw err
      }
    }
  }

  const toCandidate = async (
    name: string,
    address: string | undefined,
    id: string,
    target: [number, number],
    index: number,
    total: number,
    primary = false
  ) => {
    onProgress?.(name, index, total)
    try {
      const planned = await planWithRetry(target)
      candidates.push({
        id,
        name,
        address,
        distanceKm: planned.distanceKm,
        durationMin: planned.durationMin,
        avgSpeed: Math.round((planned.distanceKm / (planned.durationMin / 60)) * 10) / 10,
        path: planned.path,
        primary,
      })
    } catch {
      // 单个目的地规划失败不影响其他候选
    }
    // 控制请求节奏,避免触发限流
    await sleep(PLAN_INTERVAL_MS)
  }

  if (destination) {
    await toCandidate(destination.name, undefined, 'dest', [destination.lng, destination.lat], 1, 1, true)
  }

  // 周边搜索失败(限流等)时,若已有指定目的地的路线则继续使用,不整体失败
  let suggestions: DestinationSuggestion[] = []
  let nearbyError: Error | null = null
  try {
    // 先反查起点所在城市,再用该城市搜索目的地(起点可位于任意城市)
    const adcode = await resolveOriginAdcode(AMap, origin)
    suggestions = await searchRideDestinations(AMap, origin, adcode)
  } catch (err) {
    nearbyError = err instanceof Error ? err : new Error(String(err))
  }

  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i]
    if (destination && s.name === destination.name) continue
    await toCandidate(s.name, s.address, s.id, [s.location.lng, s.location.lat], i + 1, suggestions.length)
  }

  if (candidates.length === 0) {
    if (nearbyError) throw nearbyError
    throw new Error(
      destination
        ? `无法规划去往「${destination.name}」的骑行路线`
        : '起点周边 30km 内没有搜索到合适的骑行目的地，可换个起点或指定目的地'
    )
  }
  // 明确指定的目的地排在最前,其余按距离由近到远
  return candidates.sort((a, b) =>
    a.primary === b.primary ? a.distanceKm - b.distanceKm : a.primary ? -1 : 1
  )
}

/** 目的地输入提示(高德 AutoComplete) */
export function fetchPlaceTips(AMap: any, keyword: string, city: string): Promise<DestinationSuggestion[]> {
  return new Promise((resolve) => {
    if (!keyword.trim()) {
      resolve([])
      return
    }
    const autoComplete = new AMap.AutoComplete({ city, citylimit: false })
    autoComplete.search(keyword, (status: string, result: any) => {
      if (status !== 'complete') {
        resolve([])
        return
      }
      const tips: any[] = result?.tips ?? []
      resolve(
        tips
          .map((tip) => {
            const ll = readLngLat(tip.location)
            if (!ll) return null
            return {
              id: String(tip.id ?? tip.name),
              name: String(tip.name ?? ''),
              address: tip.district || tip.address || undefined,
              location: ll,
              straightKm: 0,
            }
          })
          .filter((x): x is NonNullable<typeof x> => x != null && x.name !== '')
          .slice(0, 6)
      )
    })
  })
}

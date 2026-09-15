/** 轨迹点(GPX 或地图绘制产生) */
export interface TrackPoint {
  lat: number
  lon: number
  /** 海拔,米;可能缺失 */
  ele?: number
  /** ISO 时间戳;可能缺失 */
  time?: string
}

/** 环境数据:API 采集或用户手动填写 */
export interface EnvData {
  /** 平均/白天气温,℃ */
  temperature: number | null
  /** 风力等级(1-12);由风速换算或手动选择 */
  windLevel: number | null
  /** 相对湿度,% */
  humidity: number | null
  /** 骑行期间总降水量,mm;无逐小时数据时为当日汇总 */
  precipitation: number | null
  /** 降雨概率,%(0-100) */
  precipitationProbability: number | null
  /** 空气质量指数 */
  aqi: number | null
  /** PM2.5,μg/m³ */
  pm25: number | null
}

/** 路线属性 */
export interface RouteInfo {
  /** 累计爬升,米 */
  elevationGain: number | null
  /** 平均坡度,% */
  avgGrade: number | null
  /** 路面类型 */
  surface: SurfaceType | null
  /** 交通流量 */
  traffic: TrafficLevel | null
}

export type SurfaceType = 'asphalt' | 'cement' | 'gravel' | 'mixed'
export type TrafficLevel = 'low' | 'medium' | 'high'

/** 环境数据的来源标记,用于展示「手动修改」徽标与数据来源说明 */
export interface EnvMeta {
  weatherFetched: boolean
  aqiFetched: boolean
  manualEdited: boolean
  /** 采集失败原因,用于提示用户手动填写 */
  weatherError?: string
  aqiError?: string
  /** 天气数据补充说明(如历史接口不含降雨概率) */
  weatherNote?: string
  /** 空气质量数据来源(Open-Meteo 空气质量 / sojson) */
  aqiSource?: string
}

/** 各项得分 */
export interface Scores {
  /** 综合评分 = 天气×0.6 + 路线×0.4 */
  total: number
  weather: number
  route: number
  /** 降雨指数 rainFactor = 降水量×0.6 + 降雨概率×0.4 */
  rainFactor: number
}

/* ---------------- 单车与轮胎 ---------------- */

export type BikeCategoryId = 'road' | 'mtb' | 'gravel' | 'touring' | 'folding' | 'ebike' | 'other'

export const BIKE_CATEGORIES: Record<BikeCategoryId, string> = {
  road: '公路车',
  mtb: '山地车',
  gravel: '砾石车',
  touring: '旅行/通勤车',
  folding: '折叠车',
  ebike: '电助力车',
  other: '其他',
}

export interface TireTypeInfo {
  id: string
  name: string
  /** 建议使用寿命(km):骑到该里程后建议检查/更换外胎 */
  lifeKm: number
}

/** 轮胎类别与对应的固定建议寿命 */
export const TIRE_TYPES: TireTypeInfo[] = [
  { id: 'road-clincher', name: '公路开口胎', lifeKm: 5000 },
  { id: 'road-race', name: '公路竞赛胎', lifeKm: 3000 },
  { id: 'road-tubeless', name: '公路真空胎', lifeKm: 5500 },
  { id: 'mtb-trail', name: '山地外胎', lifeKm: 3500 },
  { id: 'gravel', name: '砾石外胎', lifeKm: 4500 },
  { id: 'touring', name: '旅行/通勤外胎', lifeKm: 8000 },
]

export function findTireType(id: string): TireTypeInfo | undefined {
  return TIRE_TYPES.find((t) => t.id === id)
}

/** 单车 */
export interface Bike {
  id: string
  /** 自定义单车名称 */
  name: string
  category: BikeCategoryId
  /** 外胎类型(TIRE_TYPES 中的 id) */
  tireTypeId: string
  /** 外胎安装日期 YYYY-MM-DD */
  tireInstalledAt: string
  /** 安装该外胎时单车的累计里程(km),用于计算外胎磨损 */
  tireStartKm: number
  notes?: string
  createdAt: number
  updatedAt: number
}

export interface RideRecord {
  id: string
  /** 路线编号/名称:新建时默认给出序号(1、2、3…),可在历史列表里重命名 */
  label?: string
  /** 本次骑行使用的单车(Bike 的 id);旧记录或未选择时为空 */
  bikeId?: string
  /** 骑行日期 YYYY-MM-DD */
  date: string
  /** 时长,分钟 */
  durationMin: number | null
  /** 距离,公里 */
  distanceKm: number | null
  /** 平均速度,km/h */
  avgSpeed: number | null
  /** 最高速度,km/h */
  maxSpeed: number | null
  /** 骑行地点:城市名 + sojson 城市编码 */
  cityName: string
  cityCode: string
  /** 起点位置名称(如「天河体育中心」「我的位置」),由规划起点/轨迹起点自动得出,可手动修正 */
  startName?: string
  /** 起点所在的「市+区」(如「广州市天河区」),用于历史记录里显示到区 */
  startDistrict?: string
  /** 骑行起点坐标(天气查询用) */
  location: { lat: number; lon: number } | null
  env: EnvData
  envMeta: EnvMeta
  route: RouteInfo
  /** 轨迹点(GPX 导入 / 规划路线 / 地图绘制) */
  track: TrackPoint[]
  /** 路线名称:规划路线的目的地名、GPX 轨迹名或手绘 */
  routeName?: string
  /** 速度序列(由 GPX 时间戳计算),用于速度曲线 */
  speedSeries: { distanceKm: number; speed: number }[]
  scores: Scores | null
  /** 文字评价与改进建议 */
  comment: string
  suggestions: string[]
  notes: string
  createdAt: number
  updatedAt: number
}

export const SURFACE_LABELS: Record<SurfaceType, string> = {
  asphalt: '柏油路',
  cement: '水泥路',
  gravel: '碎石路',
  mixed: '混合路',
}

export const TRAFFIC_LABELS: Record<TrafficLevel, string> = {
  low: '少',
  medium: '中',
  high: '多',
}

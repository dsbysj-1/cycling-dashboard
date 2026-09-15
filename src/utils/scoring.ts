import type { EnvData, RouteInfo, Scores, SurfaceType, TrafficLevel } from '../types'

/**
 * 评分模型(与需求文档一致):
 * - 天气适宜度 60%:气温 / AQI / 风速 / 湿度 / 下雨指数
 * - 路线质量 40%:海拔爬升 / 平均坡度 / 路面类型 / 交通流量
 * 各维度独立函数,便于单元测试与权重调整。
 */

export const WEATHER_WEIGHT = 0.6
export const ROUTE_WEIGHT = 0.4

/* ---------------- 天气适宜度 ---------------- */

/** 气温:15–25℃ 不扣分;每偏离 5℃ 扣 10 分(线性) */
export function temperatureDeduction(temp: number | null): number {
  if (temp == null) return 0
  const deviation = temp < 15 ? 15 - temp : temp > 25 ? temp - 25 : 0
  return Math.round((deviation / 5) * 10)
}

/** AQI:<50 不扣;50–100 扣 10;100–150 扣 30;>150 扣 50 */
export function aqiDeduction(aqi: number | null): number {
  if (aqi == null) return 0
  if (aqi < 50) return 0
  if (aqi <= 100) return 10
  if (aqi <= 150) return 30
  return 50
}

/** 风速:<3 级不扣;3–4 级扣 10;5 级以上扣 30 */
export function windDeduction(windLevel: number | null): number {
  if (windLevel == null) return 0
  if (windLevel < 3) return 0
  if (windLevel <= 4) return 10
  return 30
}

/** 湿度:40–60% 不扣;超出范围扣 10 */
export function humidityDeduction(humidity: number | null): number {
  if (humidity == null) return 0
  return humidity >= 40 && humidity <= 60 ? 0 : 10
}

/** 降雨强度因子:降水量(mm) × 0.6 + 降雨概率(%) × 0.4 */
export function calcRainFactor(precipitation: number | null, probability: number | null): number {
  const p = Math.max(0, precipitation ?? 0)
  const prob = Math.max(0, probability ?? 0)
  return Math.round((p * 0.6 + prob * 0.4) * 10) / 10
}

/**
 * 下雨指数扣分:
 * 0 不扣;≤5 扣 10;≤15 扣 25;≤30 扣 45;>30 扣 70
 * 降雨概率 >70% 但实际降水量为 0 时,按「可能下雨」扣 15
 */
export function rainDeduction(rainFactor: number, precipitation: number | null, probability: number | null): number {
  if (rainFactor <= 0) {
    if ((precipitation ?? 0) === 0 && (probability ?? 0) > 70) return 15
    return 0
  }
  if (rainFactor <= 5) return 10
  if (rainFactor <= 15) return 25
  if (rainFactor <= 30) return 45
  return 70
}

export function computeWeatherScore(env: EnvData): { score: number; rainFactor: number } {
  const rainFactor = calcRainFactor(env.precipitation, env.precipitationProbability)
  const deductions =
    temperatureDeduction(env.temperature) +
    aqiDeduction(env.aqi) +
    windDeduction(env.windLevel) +
    humidityDeduction(env.humidity) +
    rainDeduction(rainFactor, env.precipitation, env.precipitationProbability)
  return { score: Math.max(0, 100 - deductions), rainFactor }
}

/* ---------------- 路线质量 ---------------- */

/** 海拔爬升:每 100m 扣 5 分(线性) */
export function elevationDeduction(gain: number | null): number {
  if (gain == null) return 0
  return Math.round((Math.max(0, gain) / 100) * 5)
}

/** 平均坡度:<2% 不扣;2–5% 扣 10;>5% 扣 25 */
export function gradeDeduction(grade: number | null): number {
  if (grade == null) return 0
  if (grade < 2) return 0
  if (grade <= 5) return 10
  return 25
}

/** 路面类型:柏油路 0;水泥路 5;碎石路 15;混合路 10 */
export function surfaceDeduction(surface: SurfaceType | null): number {
  switch (surface) {
    case 'asphalt':
      return 0
    case 'cement':
      return 5
    case 'mixed':
      return 10
    case 'gravel':
      return 15
    default:
      return 0
  }
}

/** 交通流量:少 0;中 10;多 20 */
export function trafficDeduction(traffic: TrafficLevel | null): number {
  switch (traffic) {
    case 'low':
      return 0
    case 'medium':
      return 10
    case 'high':
      return 20
    default:
      return 0
  }
}

export function computeRouteScore(route: RouteInfo): number {
  const deductions =
    elevationDeduction(route.elevationGain) +
    gradeDeduction(route.avgGrade) +
    surfaceDeduction(route.surface) +
    trafficDeduction(route.traffic)
  return Math.max(0, 100 - deductions)
}

/* ---------------- 综合评分与评价 ---------------- */

export function computeScores(env: EnvData, route: RouteInfo): Scores {
  const { score: weather, rainFactor } = computeWeatherScore(env)
  const routeScore = computeRouteScore(route)
  return {
    total: Math.round(weather * WEATHER_WEIGHT + routeScore * ROUTE_WEIGHT),
    weather,
    route: routeScore,
    rainFactor,
  }
}

/** 降雨指数等级描述 */
export function rainLevelLabel(rainFactor: number, precipitation: number | null, probability: number | null): string {
  if (rainFactor <= 0) {
    if ((precipitation ?? 0) === 0 && (probability ?? 0) > 70) return '可能下雨'
    return '无雨'
  }
  if (rainFactor <= 5) return '微量/小雨'
  if (rainFactor <= 15) return '小到中雨'
  if (rainFactor <= 30) return '中到大雨'
  return '暴雨'
}

/** 文字评价 */
export function buildComment(env: EnvData, scores: Scores): string {
  const rainLabel = rainLevelLabel(scores.rainFactor, env.precipitation, env.precipitationProbability)
  const parts: string[] = []
  if (scores.total >= 85) parts.push('今日天气极佳，适合长距离骑行。')
  else if (scores.total >= 70) parts.push('整体条件不错，适合按计划骑行。')
  else if (scores.total >= 50) parts.push('骑行条件一般，建议适当缩短路线。')
  else parts.push('骑行条件较差，建议改期或改为室内训练。')

  if (scores.rainFactor > 15) parts.push('雨势较大，路面湿滑，不建议外出骑行。')
  else if (scores.rainFactor > 5) parts.push('降雨概率较高，路面可能湿滑，建议改期或缩短路线。')
  else if (rainLabel === '可能下雨') parts.push('降雨概率偏高，建议携带雨具并规划避雨点。')
  return parts.join('')
}

/** 改进建议:根据具体扣分项生成 */
export function buildSuggestions(env: EnvData, route: RouteInfo): string[] {
  const suggestions: string[] = []
  if (env.aqi != null && aqiDeduction(env.aqi) >= 30) suggestions.push('空气质量较差，建议佩戴口罩或改为室内训练。')
  if (env.windLevel != null && env.windLevel >= 3) suggestions.push('风速较大，注意侧风，避免高速下压弯。')
  if (env.temperature != null) {
    if (env.temperature > 30) suggestions.push('气温偏高，注意及时补水与防晒。')
    if (env.temperature < 5) suggestions.push('气温偏低，注意保暖与轮胎抓地力下降。')
  }
  if (env.humidity != null && (env.humidity > 80 || env.humidity < 30)) suggestions.push('湿度不适宜，注意补水节奏。')

  const rainFactor = calcRainFactor(env.precipitation, env.precipitationProbability)
  if (rainFactor > 0 || rainDeduction(rainFactor, env.precipitation, env.precipitationProbability) > 0)
    suggestions.push('存在降雨风险，建议携带雨具。')

  if (route.elevationGain != null && route.elevationGain >= 300) suggestions.push('累计爬升较大，合理分配体能并检查刹车。')
  if (route.avgGrade != null && route.avgGrade > 5) suggestions.push('平均坡度较陡，注意变速节奏与爬坡补水。')
  if (route.surface === 'gravel' || route.surface === 'mixed') suggestions.push('非柏油路面较多，注意抓地力并降低过弯速度。')
  if (route.traffic === 'high') suggestions.push('交通流量较大，佩戴头盔并靠右骑行。')
  return suggestions
}

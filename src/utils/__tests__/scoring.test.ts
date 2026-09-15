import { describe, expect, it } from 'vitest'
import type { EnvData, RouteInfo } from '../../types'
import {
  aqiDeduction,
  buildComment,
  buildSuggestions,
  calcRainFactor,
  computeRouteScore,
  computeScores,
  computeWeatherScore,
  elevationDeduction,
  gradeDeduction,
  humidityDeduction,
  rainDeduction,
  rainLevelLabel,
  surfaceDeduction,
  temperatureDeduction,
  trafficDeduction,
  windDeduction,
} from '../scoring'

/** 理想天气:所有项都不扣分 */
const IDEAL_ENV: EnvData = {
  temperature: 20,
  windLevel: 2,
  humidity: 50,
  precipitation: 0,
  precipitationProbability: 0,
  aqi: 30,
  pm25: 15,
}

/** 理想路线:没有任何扣分项 */
const IDEAL_ROUTE: RouteInfo = {
  elevationGain: 0,
  avgGrade: 0,
  surface: 'asphalt',
  traffic: 'low',
}

const env = (patch: Partial<EnvData>): EnvData => ({ ...IDEAL_ENV, ...patch })
const route = (patch: Partial<RouteInfo>): RouteInfo => ({ ...IDEAL_ROUTE, ...patch })

describe('天气适宜度:气温', () => {
  it('15–25℃ 不扣分', () => {
    expect(temperatureDeduction(15)).toBe(0)
    expect(temperatureDeduction(20)).toBe(0)
    expect(temperatureDeduction(25)).toBe(0)
  })

  it('每偏离 5℃ 扣 10 分', () => {
    expect(temperatureDeduction(10)).toBe(10)
    expect(temperatureDeduction(30)).toBe(10)
    expect(temperatureDeduction(5)).toBe(20)
    expect(temperatureDeduction(0)).toBe(30)
    expect(temperatureDeduction(35)).toBe(20)
  })

  it('缺失数据不扣分', () => {
    expect(temperatureDeduction(null)).toBe(0)
  })
})

describe('天气适宜度:AQI', () => {
  it('按 50/100/150 分档', () => {
    expect(aqiDeduction(49)).toBe(0)
    expect(aqiDeduction(50)).toBe(10)
    expect(aqiDeduction(100)).toBe(10)
    expect(aqiDeduction(101)).toBe(30)
    expect(aqiDeduction(150)).toBe(30)
    expect(aqiDeduction(151)).toBe(50)
    expect(aqiDeduction(null)).toBe(0)
  })
})

describe('天气适宜度:风速与湿度', () => {
  it('风力 3–4 级扣 10,5 级以上扣 30', () => {
    expect(windDeduction(2)).toBe(0)
    expect(windDeduction(3)).toBe(10)
    expect(windDeduction(4)).toBe(10)
    expect(windDeduction(5)).toBe(30)
    expect(windDeduction(null)).toBe(0)
  })

  it('湿度 40–60% 不扣分,超出扣 10', () => {
    expect(humidityDeduction(40)).toBe(0)
    expect(humidityDeduction(50)).toBe(0)
    expect(humidityDeduction(60)).toBe(0)
    expect(humidityDeduction(39)).toBe(10)
    expect(humidityDeduction(61)).toBe(10)
    expect(humidityDeduction(null)).toBe(0)
  })
})

describe('天气适宜度:下雨指数', () => {
  it('rainFactor = 降水量×0.6 + 降雨概率×0.4', () => {
    expect(calcRainFactor(0, 0)).toBe(0)
    expect(calcRainFactor(1, 0)).toBe(0.6)
    expect(calcRainFactor(0, 100)).toBe(40)
    expect(calcRainFactor(5, 50)).toBe(23)
  })

  it('负值按 0 处理', () => {
    expect(calcRainFactor(-5, -10)).toBe(0)
  })

  it('按 5/15/30 分档扣分', () => {
    expect(rainDeduction(0, 0, 0)).toBe(0)
    expect(rainDeduction(5, 5, 5)).toBe(10)
    expect(rainDeduction(5.1, 5, 6)).toBe(25)
    expect(rainDeduction(15, 10, 20)).toBe(25)
    expect(rainDeduction(15.1, 10, 25)).toBe(45)
    expect(rainDeduction(30, 20, 50)).toBe(45)
    expect(rainDeduction(30.1, 20, 60)).toBe(70)
  })

  it('概率 >70% 但无降水时按「可能下雨」扣 15', () => {
    expect(rainDeduction(0, 0, 71)).toBe(15)
    expect(rainDeduction(0, 0, 70)).toBe(0)
  })
})

describe('天气适宜度总分', () => {
  it('全部理想条件得 100 分', () => {
    const { score, rainFactor } = computeWeatherScore(IDEAL_ENV)
    expect(score).toBe(100)
    expect(rainFactor).toBe(0)
  })

  it('各项扣分累加且保底 0 分', () => {
    const bad = env({
      temperature: 40, // 偏离 15℃ → 30
      aqi: 200, // 50
      windLevel: 6, // 30
      humidity: 90, // 10
      precipitation: 10,
      precipitationProbability: 90, // rainFactor 42 → 70
    })
    const { score, rainFactor } = computeWeatherScore(bad)
    expect(rainFactor).toBe(42)
    expect(score).toBe(0)
  })
})

describe('路线质量', () => {
  it('海拔每 100m 扣 5 分', () => {
    expect(elevationDeduction(0)).toBe(0)
    expect(elevationDeduction(100)).toBe(5)
    expect(elevationDeduction(300)).toBe(15)
    expect(elevationDeduction(-50)).toBe(0)
    expect(elevationDeduction(null)).toBe(0)
  })

  it('平均坡度 <2% 不扣,2–5% 扣 10,>5% 扣 25', () => {
    expect(gradeDeduction(1.9)).toBe(0)
    expect(gradeDeduction(2)).toBe(10)
    expect(gradeDeduction(5)).toBe(10)
    expect(gradeDeduction(5.1)).toBe(25)
    expect(gradeDeduction(null)).toBe(0)
  })

  it('路面类型:柏油 0 / 水泥 5 / 混合 10 / 碎石 15', () => {
    expect(surfaceDeduction('asphalt')).toBe(0)
    expect(surfaceDeduction('cement')).toBe(5)
    expect(surfaceDeduction('mixed')).toBe(10)
    expect(surfaceDeduction('gravel')).toBe(15)
    expect(surfaceDeduction(null)).toBe(0)
  })

  it('交通流量:少 0 / 中 10 / 多 20', () => {
    expect(trafficDeduction('low')).toBe(0)
    expect(trafficDeduction('medium')).toBe(10)
    expect(trafficDeduction('high')).toBe(20)
    expect(trafficDeduction(null)).toBe(0)
  })

  it('理想路线得 100 分,各项扣分累加且保底 0 分', () => {
    expect(computeRouteScore(IDEAL_ROUTE)).toBe(100)
    expect(computeRouteScore(route({ elevationGain: 1000, avgGrade: 6, surface: 'gravel', traffic: 'high' }))).toBe(0)
    expect(computeRouteScore(route({ elevationGain: 200, surface: 'cement', traffic: 'medium' }))).toBe(75)
  })
})

describe('综合评分', () => {
  it('= 天气×0.6 + 路线×0.4', () => {
    const scores = computeScores(IDEAL_ENV, IDEAL_ROUTE)
    expect(scores).toEqual({ total: 100, weather: 100, route: 100, rainFactor: 0 })
  })

  it('权重按 60/40 生效', () => {
    // 天气 80(湿度与风力各扣 10),路线 50(爬升 1000m 扣 50)
    const scores = computeScores(env({ humidity: 90, windLevel: 3 }), route({ elevationGain: 1000 }))
    expect(scores.weather).toBe(80)
    expect(scores.route).toBe(50)
    expect(scores.total).toBe(68) // 80×0.6 + 50×0.4
  })

  it('rainFactor 单独透出,便于界面展示', () => {
    expect(computeScores(env({ precipitation: 2, precipitationProbability: 60 }), IDEAL_ROUTE).rainFactor).toBe(25.2)
  })
})

describe('降雨等级与文字评价', () => {
  it('按 rainFactor 分档', () => {
    expect(rainLevelLabel(0, 0, 0)).toBe('无雨')
    expect(rainLevelLabel(0, 0, 80)).toBe('可能下雨')
    expect(rainLevelLabel(3, 5, 0)).toBe('微量/小雨')
    expect(rainLevelLabel(10, 10, 10)).toBe('小到中雨')
    expect(rainLevelLabel(20, 20, 20)).toBe('中到大雨')
    expect(rainLevelLabel(40, 30, 55)).toBe('暴雨')
  })

  it('综合分档位生成对应文案', () => {
    expect(buildComment(IDEAL_ENV, { total: 90, weather: 95, route: 85, rainFactor: 0 })).toContain('天气极佳')
    expect(buildComment(IDEAL_ENV, { total: 75, weather: 75, route: 75, rainFactor: 0 })).toContain('整体条件不错')
    expect(buildComment(IDEAL_ENV, { total: 60, weather: 60, route: 60, rainFactor: 0 })).toContain('条件一般')
    expect(buildComment(IDEAL_ENV, { total: 40, weather: 40, route: 40, rainFactor: 0 })).toContain('条件较差')
  })

  it('雨势影响文案', () => {
    expect(buildComment(IDEAL_ENV, { total: 40, weather: 20, route: 60, rainFactor: 20 })).toContain('不建议外出骑行')
    expect(buildComment(env({ precipitation: 0, precipitationProbability: 80 }), {
      total: 70,
      weather: 85,
      route: 60,
      rainFactor: 0,
    })).toContain('携带雨具')
  })
})

describe('改进建议', () => {
  it('按扣分项给出建议', () => {
    const suggestions = buildSuggestions(
      env({ aqi: 120, windLevel: 4, temperature: 32, humidity: 85, precipitation: 1, precipitationProbability: 50 }),
      route({ elevationGain: 300, avgGrade: 6, surface: 'gravel', traffic: 'high' })
    )
    expect(suggestions.some((s) => s.includes('口罩'))).toBe(true)
    expect(suggestions.some((s) => s.includes('侧风'))).toBe(true)
    expect(suggestions.some((s) => s.includes('补水与防晒'))).toBe(true)
    expect(suggestions.some((s) => s.includes('雨具'))).toBe(true)
    expect(suggestions.some((s) => s.includes('爬升较大'))).toBe(true)
    expect(suggestions.some((s) => s.includes('坡度较陡'))).toBe(true)
    expect(suggestions.some((s) => s.includes('抓地力'))).toBe(true)
    expect(suggestions.some((s) => s.includes('头盔'))).toBe(true)
  })

  it('理想条件不给建议', () => {
    expect(buildSuggestions(IDEAL_ENV, IDEAL_ROUTE)).toEqual([])
  })

  it('低温与低湿度也会给出提示', () => {
    const suggestions = buildSuggestions(env({ temperature: 0, humidity: 20 }), IDEAL_ROUTE)
    expect(suggestions.some((s) => s.includes('保暖'))).toBe(true)
    expect(suggestions.some((s) => s.includes('补水节奏'))).toBe(true)
  })
})

/** 常用城市表:sojson 城市编码 + 坐标(Open-Meteo 天气查询用) */
export interface CityInfo {
  name: string
  /** sojson / 中国天气网城市编码 */
  code: string
  lat: number
  lon: number
}

export const CITIES: CityInfo[] = [
  { name: '广州', code: '101280101', lat: 23.1291, lon: 113.2644 },
  { name: '北京', code: '101010100', lat: 39.9042, lon: 116.4074 },
  { name: '上海', code: '101020100', lat: 31.2304, lon: 121.4737 },
  { name: '深圳', code: '101280601', lat: 22.5431, lon: 114.0579 },
  { name: '佛山', code: '101280800', lat: 23.0218, lon: 113.1219 },
  { name: '东莞', code: '101281601', lat: 23.0207, lon: 113.7518 },
  { name: '珠海', code: '101280701', lat: 22.2707, lon: 113.5767 },
  { name: '中山', code: '101281701', lat: 22.5159, lon: 113.3926 },
  { name: '惠州', code: '101280301', lat: 23.1115, lon: 114.4161 },
  { name: '杭州', code: '101210101', lat: 30.2741, lon: 120.1551 },
  { name: '成都', code: '101270101', lat: 30.5728, lon: 104.0668 },
  { name: '武汉', code: '101200101', lat: 30.5928, lon: 114.3055 },
  { name: '西安', code: '101110101', lat: 34.3416, lon: 108.9398 },
  { name: '南京', code: '101190101', lat: 32.0603, lon: 118.7969 },
  { name: '重庆', code: '101040100', lat: 29.563, lon: 106.5516 },
  { name: '长沙', code: '101250101', lat: 28.2282, lon: 112.9388 },
  { name: '郑州', code: '101180101', lat: 34.7466, lon: 113.6254 },
  { name: '天津', code: '101030100', lat: 39.3434, lon: 117.3616 },
  { name: '苏州', code: '101190401', lat: 31.2989, lon: 120.5853 },
  { name: '厦门', code: '101230201', lat: 24.4798, lon: 118.0894 },
  { name: '昆明', code: '101290101', lat: 25.0389, lon: 102.7183 },
  { name: '青岛', code: '101120201', lat: 36.0671, lon: 120.3826 },
]

export function findCity(name: string): CityInfo | undefined {
  return CITIES.find((c) => c.name === name)
}

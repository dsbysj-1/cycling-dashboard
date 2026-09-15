/**
 * 华为手表骑行数据接入层。
 *
 * 当前阶段 Health Kit 权限审核中,这里返回本地模拟数据,不发起任何真实网络请求;
 * 权限通过后只需替换 fetchHuaweiRideData 内部实现(函数签名与返回结构保持不变),调用方无需改动。
 */

/** 华为骑行记录(与未来真实接口约定的字段一致) */
export interface HuaweiRideMock {
  /** 距离,公里 */
  distance: number
  /** 时长,分钟 */
  duration: number
  /** 平均速度,km/h */
  averageSpeed: number
  /** 最高速度,km/h */
  maxSpeed: number
  /** 累计爬升,米 */
  elevationGain: number
  /** 路线名称 */
  routeName: string
}

export interface HuaweiSyncOptions {
  /** 模拟网络延迟(毫秒) */
  delayMs?: number
  /** 模拟失败概率(0–1),用于验证容错提示 */
  failRate?: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * 生成一份合理的模拟骑行数据(每次同步数值略有不同,便于观察表单更新与评分重算)。
 * 平均速度由距离/时长反推,保证三者自洽;最高速度高于平均速度。
 */
export function createMockRide(): HuaweiRideMock {
  const distance = round1(18 + Math.random() * 14) // 18.0 – 32.0 km
  const speedTarget = 16 + Math.random() * 6 // 目标均速 16 – 22 km/h
  const duration = Math.max(30, Math.round((distance / speedTarget) * 60))
  const averageSpeed = round1(distance / (duration / 60))
  const maxSpeed = round1(averageSpeed * (1.45 + Math.random() * 0.35))
  return {
    distance,
    duration,
    averageSpeed,
    maxSpeed,
    elevationGain: Math.round(40 + Math.random() * 260),
    routeName: '华为手表同步路线',
  }
}

/**
 * 获取华为手表骑行数据。
 *
 * TODO: 接入真实后端接口 /api/huawei/cycling-records
 *   权限审核通过后,把下面的模拟实现替换为:
 *     const res = await fetch('/api/huawei/cycling-records')
 *     if (!res.ok) throw new Error(`同步失败,请稍后重试 (HTTP ${res.status})`)
 *     return (await res.json()) as HuaweiRideMock
 *   调用方(useHuaweiSync)无需改动。
 */
export async function fetchHuaweiRideData(options: HuaweiSyncOptions = {}): Promise<HuaweiRideMock> {
  const { delayMs = 1500, failRate = 0.1 } = options

  // 模拟网络请求耗时
  await new Promise((resolve) => setTimeout(resolve, delayMs))

  // 模拟 10% 的请求失败,用于验证失败提示与容错
  if (Math.random() < failRate) {
    throw new Error('同步失败，请稍后重试')
  }

  return createMockRide()
}

/** 手写 SVG 图表的辅助函数:比例尺、刻度、path 生成 */

export type Scale = (value: number) => number

/** 线性比例尺:把 domain 区间映射到 range 区间 */
export function scaleLinear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain
  const [r0, r1] = range
  if (d1 === d0) return () => (r0 + r1) / 2
  return (value: number) => r0 + ((value - d0) / (d1 - d0)) * (r1 - r0)
}

/** 取「好看」的刻度值;输入非有限值时返回空数组,由调用方降级处理 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  if (min === max) return [min]
  const span = max - min
  if (span <= 0) return [min, max]
  const step = Math.pow(10, Math.floor(Math.log10(span / count)))
  const err = span / count / step
  const mult = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1
  const niceStep = step * mult
  if (!Number.isFinite(niceStep) || niceStep <= 0) return [min, max]
  const start = Math.ceil(min / niceStep) * niceStep
  const ticks: number[] = []
  // 上限保护:避免浮点步进不生效导致死循环
  for (let v = start, i = 0; v <= max + niceStep * 0.01 && i < 1000; i++) {
    ticks.push(Math.round(v * 1e6) / 1e6)
    const next = v + niceStep
    if (next === v) break
    v = next
  }
  return ticks.length ? ticks : [min, max]
}

/** 折线 path */
export function linePath(points: [number, number][]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')
}

/** 面积图 path(沿基线 baseline 闭合) */
export function areaPath(points: [number, number][], baseline: number): string {
  if (points.length === 0) return ''
  const head = points[0]
  const tail = points[points.length - 1]
  return `${linePath(points)} L${tail[0].toFixed(2)},${baseline.toFixed(2)} L${head[0].toFixed(2)},${baseline.toFixed(2)} Z`
}

/**
 * 单调三次插值平滑(Fritsch–Carlson):曲线在数据点之间过渡自然,且**不会过冲**。
 * Catmull-Rom 在陡升陡降处会"甩"出数据范围,导致海拔/速度曲线跑出图表框,
 * 这里改用限幅后的节点导数,保证曲线始终落在相邻数据点的取值范围内。
 */
export function monotonePath(points: [number, number][]): string {
  const n = points.length
  if (n < 3) return linePath(points)

  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const dx: number[] = []
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1] - xs[i]
    slope[i] = dx[i] === 0 ? 0 : (ys[i + 1] - ys[i]) / dx[i]
  }

  // 节点导数:相邻割线异号(极值点)时取 0,同号时按加权调和平均限幅
  const m: number[] = new Array(n)
  m[0] = slope[0]
  m[n - 1] = slope[n - 2]
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      m[i] = 0
    } else {
      const w1 = 2 * dx[i] + dx[i - 1]
      const w2 = dx[i] + 2 * dx[i - 1]
      m[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i])
    }
  }

  let d = `M${xs[0].toFixed(2)},${ys[0].toFixed(2)}`
  for (let i = 0; i < n - 1; i++) {
    const c1x = xs[i] + dx[i] / 3
    const c1y = ys[i] + (m[i] * dx[i]) / 3
    const c2x = xs[i + 1] - dx[i] / 3
    const c2y = ys[i + 1] - (m[i + 1] * dx[i]) / 3
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${xs[i + 1].toFixed(2)},${ys[i + 1].toFixed(2)}`
  }
  return d
}

/** 面积图 path:用同一条单调曲线沿基线闭合,保证填充与描边完全重合 */
export function monotoneAreaPath(points: [number, number][], baseline: number): string {
  if (points.length === 0) return ''
  const head = points[0]
  const tail = points[points.length - 1]
  return `${monotonePath(points)} L${tail[0].toFixed(2)},${baseline.toFixed(2)} L${head[0].toFixed(2)},${baseline.toFixed(2)} Z`
}

/** 雷达图顶点坐标:axisCount 条轴均匀分布,value 归一化 0–1 */
export function radarVertex(
  cx: number,
  cy: number,
  radius: number,
  axisCount: number,
  axisIndex: number,
  value: number
): [number, number] {
  const angle = -Math.PI / 2 + (axisIndex * 2 * Math.PI) / axisCount
  const r = radius * Math.max(0, Math.min(1, value))
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
}

/** 数值范围;忽略非有限值(全为无效值时返回 [0, 0]) */
export function extent(values: number[]): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (!Number.isFinite(v)) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  if (min === Infinity) return [0, 0]
  return [min, max]
}

/** 降采样到至多 max 个点,避免长轨迹 SVG 过大 */
export function downsample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  const step = (items.length - 1) / (max - 1)
  const out: T[] = []
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)])
  return out
}

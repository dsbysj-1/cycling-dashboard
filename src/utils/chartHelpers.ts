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

/** 平滑曲线 path( Catmull-Rom 转 Bezier ),让曲线更接近主流图表观感 */
export function smoothLinePath(points: [number, number][], tension = 0.5): string {
  if (points.length < 3) return linePath(points)
  let d = `M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension * 2
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension * 2
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension * 2
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension * 2
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`
  }
  return d
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

import { memo } from 'react'
import { radarVertex } from '../utils/chartHelpers'

interface Props {
  weather: number
  route: number
}

const SIZE = 260
const CENTER = SIZE / 2
const RADIUS = 92
const LEVELS = [0.25, 0.5, 0.75, 1]

/** 三轴雷达图:天气适宜度 / 路线质量 / 骑行表现(已移除维度,留空展示) */
function ScoreRadar({ weather, route }: Props) {
  const axes = [
    { label: '天气适宜度', value: weather / 100 },
    { label: '路线质量', value: route / 100 },
    { label: '骑行表现', value: null },
  ]

  const dataVertices = axes
    .map((a, i) => (a.value != null ? radarVertex(CENTER, CENTER, RADIUS, axes.length, i, a.value) : null))
    .filter((v): v is [number, number] => v != null)

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full" role="img" aria-label="评分雷达图">
      {/* 网格 */}
      {LEVELS.map((lv) => (
        <polygon
          key={lv}
          points={axes.map((_, i) => radarVertex(CENTER, CENTER, RADIUS, axes.length, i, lv).join(',')).join(' ')}
          fill="none"
          className="chart-grid"
          strokeWidth="1"
        />
      ))}
      {/* 轴线 */}
      {axes.map((_, i) => {
        const [x, y] = radarVertex(CENTER, CENTER, RADIUS, axes.length, i, 1)
        return <line key={i} x1={CENTER} y1={CENTER} x2={x} y2={y} className="chart-grid-strong" strokeWidth="1" />
      })}
      {/* 数据面:仅天气 + 路线两维 */}
      {dataVertices.length >= 2 && (
        <>
          <polygon points={dataVertices.map((v) => v.join(',')).join(' ')} className="chart-radar-shape" strokeWidth="2" />
          {dataVertices.map((v, i) => (
            <circle key={i} cx={v[0]} cy={v[1]} r="3.5" className="chart-radar-dot" />
          ))}
        </>
      )}
      {/* 轴标签 */}
      {axes.map((axis, i) => {
        const [x, y] = radarVertex(CENTER, CENTER, RADIUS + 24, axes.length, i, 1)
        const anchor = Math.abs(x - CENTER) < 4 ? 'middle' : x > CENTER ? 'start' : 'end'
        return (
          <text
            key={axis.label}
            x={x}
            y={y}
            textAnchor={anchor}
            dominantBaseline="middle"
            className="fill-t2 text-[11px]"
            style={{ fontSize: 11 }}
          >
            {axis.label}
            {axis.value != null ? ` ${Math.round(axis.value * 100)}` : '(已移除)'}
          </text>
        )
      })}
    </svg>
  )
}

/** 该组件重渲染成本较高(图表计算 / 长列表),用 memo 避免父级状态变化时无谓重算 */
export default memo(ScoreRadar)

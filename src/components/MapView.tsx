/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'
import type { TrackPoint } from '../types'
import { useAmap } from '../hooks/useAmap'
import { useTheme } from '../hooks/useTheme'

interface Props {
  track?: TrackPoint[] | null
  /** 开启后可在地图上手动绘制路线,双击结束 */
  drawEnabled?: boolean
  onDrawn?: (points: TrackPoint[]) => void
  /** 开启点选模式:单击地图取坐标(用于选择起点/目的地) */
  pickMode?: boolean
  onPick?: (point: { lat: number; lon: number }) => void
  /** 点选模式下的提示文案 */
  pickHint?: string
  /** 起点标记:在没有轨迹时显示,便于确认选中的起点位置 */
  originMarker?: { lat: number; lon: number } | null
  className?: string
}

/**
 * 高德地图:轨迹渲染 + 手动绘制路线 + 地图点选。
 * Key 未配置 / 安全密钥缺失 / 加载失败时降级为提示,不影响其他功能。
 */
export default function MapView({
  track,
  drawEnabled = false,
  onDrawn,
  pickMode = false,
  onPick,
  pickHint = '点击地图选择起点',
  originMarker,
  className,
}: Props) {
  const { amap, status, error } = useAmap()
  const { theme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const mouseToolRef = useRef<any>(null)
  const overlaysRef = useRef<any[]>([])
  const originMarkerRef = useRef<any>(null)
  const [mapReady, setMapReady] = useState(false)
  const onDrawnRef = useRef(onDrawn)
  onDrawnRef.current = onDrawn
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  // 初始化地图(高德实例由 useAmap 全局共享)
  useEffect(() => {
    if (!amap || !containerRef.current || mapRef.current) return
    const map = new amap.Map(containerRef.current, {
      center: [113.2644, 23.1291], // 默认广州
      zoom: 12,
      mapStyle: theme === 'dark' ? 'amap://styles/dark' : 'amap://styles/normal',
      viewMode: '2D',
    })
    mapRef.current = map
    setMapReady(true)
    return () => {
      map.destroy?.()
      mapRef.current = null
      setMapReady(false)
    }
    // 主题变化不重建地图,由下面的 effect 切换底图样式
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amap])

  // 昼夜切换:同步高德底图样式
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    map.setMapStyle?.(theme === 'dark' ? 'amap://styles/dark' : 'amap://styles/normal')
  }, [theme, mapReady])

  // 轨迹变化时重绘 polyline
  useEffect(() => {
    const map = mapRef.current
    if (!map || !amap || !mapReady) return
    overlaysRef.current.forEach((o) => map.remove(o))
    overlaysRef.current = []
    if (track && track.length >= 2) {
      const path = track.map((p) => new amap.LngLat(p.lon, p.lat))
      const polyline = new amap.Polyline({
        path,
        strokeColor: '#38bdf8',
        strokeWeight: 5,
        showDir: true,
        lineJoin: 'round',
      })
      map.add(polyline)
      overlaysRef.current.push(polyline)
      const start = new amap.CircleMarker({ center: path[0], radius: 6, color: '#34d399', strokeWeight: 2 })
      const end = new amap.CircleMarker({
        center: path[path.length - 1],
        radius: 6,
        color: '#f87171',
        strokeWeight: 2,
      })
      map.add([start, end])
      overlaysRef.current.push(start, end)
      // 第二参数 immediately=true:高德的默认移动是带动画的,长路线会缓慢平移,改为立即定位
      map.setFitView(overlaysRef.current, true, [40, 40, 40, 40])
    }
  }, [track, amap, mapReady])

  // 绘制模式切换
  useEffect(() => {
    const map = mapRef.current
    if (!map || !amap || !mapReady) return
    mouseToolRef.current?.close?.(false)

    if (!drawEnabled) return
    const tool = new amap.MouseTool(map)
    mouseToolRef.current = tool
    tool.polyline({ strokeColor: '#fbbf24', strokeWeight: 5, showDir: true })
    // 注意:高德的 on() 返回实例本身(链式调用),不是取消订阅函数,必须用 off 解绑
    const onDraw = (e: any) => {
      const path: any[] = e?.obj?.getPath?.() ?? []
      if (path.length < 2) return
      const points: TrackPoint[] = path.map((lnglat) => ({
        lat: typeof lnglat.getLat === 'function' ? lnglat.getLat() : lnglat.lat,
        lon: typeof lnglat.getLng === 'function' ? lnglat.getLng() : lnglat.lng,
      }))
      onDrawnRef.current?.(points)
    }
    tool.on('draw', onDraw)
    return () => {
      tool.off?.('draw', onDraw)
      tool.close?.(false)
      if (mouseToolRef.current === tool) mouseToolRef.current = null
    }
  }, [drawEnabled, amap, mapReady])

  // 地图点选:单击取坐标(用于选择起点/目的地)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !amap || !mapReady || !pickMode) return
    const onClick = (e: any) => {
      const lnglat = e?.lnglat
      if (!lnglat) return
      const lng = typeof lnglat.getLng === 'function' ? lnglat.getLng() : lnglat.lng
      const lat = typeof lnglat.getLat === 'function' ? lnglat.getLat() : lnglat.lat
      if (Number.isFinite(lat) && Number.isFinite(lng)) onPickRef.current?.({ lat, lon: lng })
    }
    // 注意:高德 map.on 返回实例本身,必须用 off 解绑
    map.on('click', onClick)
    map.setDefaultCursor?.('crosshair')
    return () => {
      map.off('click', onClick)
      map.setDefaultCursor?.('default')
    }
  }, [pickMode, amap, mapReady])

  // 起点标记:通过搜索/定位/点选设定起点后,把地图移到该点,让用户看到自己选在哪里
  useEffect(() => {
    const map = mapRef.current
    if (!map || !amap || !mapReady) return
    if (originMarkerRef.current) {
      map.remove(originMarkerRef.current)
      originMarkerRef.current = null
    }
    // 已有轨迹时由 setFitView 决定视野,不再单独显示起点标记
    const showMarker = originMarker && (!track || track.length < 2)
    if (showMarker && originMarker) {
      const center = new amap.LngLat(originMarker.lon, originMarker.lat)
      // 第二参数 immediately=true:否则高德会从当前位置缓慢平移动画到目标点
      map.setCenter(center, true)
      // 用 HTML 图钉而不是 CircleMarker:在地图底图上更醒目,也便于确认位置
      const marker = new amap.Marker({
        position: center,
        anchor: 'bottom-center',
        zIndex: 130,
        content:
          '<div data-origin-pin="1" style="transform:translateY(2px)">' +
          '<svg width="28" height="34" viewBox="0 0 26 32" fill="none">' +
          '<path d="M13 1C6.37 1 1 6.37 1 13c0 8.5 12 18 12 18s12-9.5 12-18C25 6.37 19.63 1 13 1z" ' +
          'fill="#fbbf24" stroke="#0b1020" stroke-width="2"/>' +
          '<circle cx="13" cy="13" r="4.5" fill="#0b1020"/>' +
          '</svg></div>',
      })
      map.add(marker)
      originMarkerRef.current = marker
    }
  }, [originMarker, track, amap, mapReady])

  if (status === 'nokey') {
    return (
      <Placeholder className={className}>
        未配置高德地图 Key。在项目根目录 <code className="text-sky-300">.env</code> 中设置{' '}
        <code className="text-sky-300">VITE_AMAP_KEY</code>(申请地址 lbs.amap.com,服务平台选「Web端(JS API)」)后重启 dev
        服务器即可启用地图与自动路线规划。其他功能不受影响。
      </Placeholder>
    )
  }

  if (status === 'error') {
    return (
      <Placeholder className={className}>
        地图加载失败:{error}
        <br />
        常见原因:Key 类型不是「Web端(JS API)」、Key 配错,或 2021-12 后申请的 Key 未配置安全密钥(在{' '}
        <code className="text-sky-300">.env</code> 的 <code className="text-sky-300">VITE_AMAP_SECURITY_CODE</code>{' '}
        填入高德控制台的 jscode)。其他功能不受影响。
      </Placeholder>
    )
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <div ref={containerRef} className="h-full min-h-[320px] w-full overflow-hidden rounded-xl" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex min-h-[320px] items-center justify-center rounded-xl bg-night-800 text-sm text-slate-400">
          地图加载中…
        </div>
      )}
      {drawEnabled && mapReady && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg bg-black/60 px-3 py-1.5 text-xs text-amber-300">
          绘制模式:单击加点,双击结束并计算路线
        </div>
      )}
      {pickMode && mapReady && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg bg-black/70 px-3 py-1.5 text-xs text-sky-300">
          {pickHint}(点选后自动关闭)
        </div>
      )}
    </div>
  )
}

function Placeholder({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-white/15 bg-night-800/50 p-6 text-center text-sm leading-6 text-slate-400 ${className ?? ''}`}
    >
      <div>{children}</div>
    </div>
  )
}

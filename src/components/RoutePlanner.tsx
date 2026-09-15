import { useCallback, useEffect, useRef, useState } from 'react'
import { Crosshair, MapPin, Navigation } from 'lucide-react'
import type { RouteCandidate } from '../hooks/useRoutePlanning'
import { buildRouteCandidates, fetchPlaceTips, type DestinationSuggestion } from '../hooks/useRoutePlanning'
import { AMAP_KEY, useAmap } from '../hooks/useAmap'

/** 起点:由地图点选、定位或搜索得到 */
export interface RouteOrigin {
  lat: number
  lon: number
  /** 展示用标签:我的位置 / 地图选点 / 地点名 */
  label: string
}

interface Props {
  /** 当前表单选择的城市(仅用于输入提示的城市偏好) */
  city: string
  /** 城市中心坐标,作为默认起点 */
  cityCenter: { lat: number; lon: number } | null
  /** 已选中的候选路线 id */
  selectedId: string | null
  /** 选择某条候选路线:由父组件负责写入表单并采集数据 */
  onSelect: (candidate: RouteCandidate) => void
  /** 显式指定的起点;为 null 时使用城市中心 */
  origin: RouteOrigin | null
  onOriginChange: (origin: RouteOrigin | null) => void
  /** 是否处于「地图点选起点」模式 */
  picking: boolean
  onPickingChange: (picking: boolean) => void
}

/** 关键词输入提示(防抖),起点与目的地共用 */
function usePlaceTips(city: string) {
  const { amap, status } = useAmap()
  const [keyword, setKeyword] = useState('')
  const [tips, setTips] = useState<DestinationSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    if (!amap || status !== 'ready' || !keyword.trim()) {
      setTips([])
      return
    }
    timer.current = window.setTimeout(async () => {
      const list = await fetchPlaceTips(amap, keyword, city)
      setTips(list)
      setOpen(list.length > 0)
    }, 350)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [keyword, amap, status, city])

  const clear = useCallback(() => {
    setKeyword('')
    setTips([])
    setOpen(false)
  }, [])

  return { keyword, setKeyword, tips, open, setOpen, clear }
}

/** 输入提示下拉列表 */
function TipsDropdown({
  open,
  tips,
  onPick,
}: {
  open: boolean
  tips: DestinationSuggestion[]
  onPick: (tip: DestinationSuggestion) => void
}) {
  if (!open || tips.length === 0) return null
  return (
    <ul className="absolute z-30 mt-1 max-h-56 w-full max-w-md overflow-auto rounded-lg border border-white/10 bg-night-900 py-1 shadow-xl shadow-black/50">
      {tips.map((tip) => (
        <li key={tip.id}>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/10"
            onClick={() => onPick(tip)}
          >
            <span>{tip.name}</span>
            {tip.address && <span className="shrink-0 text-slate-500">{tip.address}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * 自动路线规划面板:
 * 起点支持四种方式(城市中心 / 我的位置 / 关键词搜索 / 地图点选),以起点为中心自动搜索
 * 周边适合骑行的目的地,逐条规划真实骑行路线供选择;也可指定目的地直接规划。
 * 选中后由父组件自动填入距离/时长并采集环境数据。
 */
export default function RoutePlanner({
  city,
  cityCenter,
  selectedId,
  onSelect,
  origin,
  onOriginChange,
  picking,
  onPickingChange,
}: Props) {
  const { amap, status } = useAmap()
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')

  const originTips = usePlaceTips(city)
  const destTips = usePlaceTips(city)
  const [destination, setDestination] = useState<DestinationSuggestion | null>(null)

  const [candidates, setCandidates] = useState<RouteCandidate[]>([])
  const [planning, setPlanning] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  // 实际生效的起点:显式指定优先,否则用城市中心
  const effectiveOrigin = origin ?? (cityCenter ? { ...cityCenter, label: `${city}市中心` } : null)
  const originLabel = effectiveOrigin?.label ?? '未设置'

  // 起点变化后,原有候选路线已失效,清空避免误选
  const originKey = origin
    ? `${origin.lat.toFixed(5)},${origin.lon.toFixed(5)}`
    : `city:${cityCenter ? `${cityCenter.lat},${cityCenter.lon}` : 'none'}`
  useEffect(() => {
    setCandidates([])
    setProgress('')
    setError('')
  }, [originKey])

  /** 使用浏览器定位作为起点 */
  const handleLocate = () => {
    if (!navigator.geolocation) {
      setLocError('当前浏览器不支持定位，可改用地图点选或搜索起点')
      return
    }
    setLocating(true)
    setLocError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onOriginChange({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: '我的位置' })
        setLocating(false)
        setDestination(null)
        destTips.clear()
      },
      (err) => {
        setLocError(`定位失败（${err.message}），可改用地图点选或搜索起点`)
        setLocating(false)
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    )
  }

  const handlePlan = async (withDestination: boolean) => {
    if (!amap || status !== 'ready') {
      setError('地图服务未就绪，无法规划路线')
      return
    }
    if (!effectiveOrigin) {
      setError('请先选择城市或指定起点')
      return
    }
    setError('')
    setPlanning(true)
    setCandidates([])
    destTips.setOpen(false)
    setProgress(
      withDestination && destination ? `正在规划去往 ${destination.name} 的路线…` : '正在搜索起点周边的骑行目的地…'
    )
    try {
      const list = await buildRouteCandidates(amap, [effectiveOrigin.lon, effectiveOrigin.lat], {
        destination:
          withDestination && destination
            ? { name: destination.name, lng: destination.location.lng, lat: destination.location.lat }
            : null,
        onProgress: (label, index, total) => setProgress(`正在规划 ${index}/${total}:${label}…`),
      })
      setCandidates(list)
      setProgress('')
      // 指定了目的地时自动选中该路线(其余候选供切换),省一次点击
      const primary = list.find((c) => c.primary)
      if (withDestination && primary) onSelect(primary)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setProgress('')
    } finally {
      setPlanning(false)
    }
  }

  if (status === 'nokey') {
    return (
      <div className="rounded-xl border border-dashed border-white/15 bg-night-800/50 p-4 text-xs leading-6 text-slate-400">
        自动路线规划需要高德 Key。请在 <code className="text-sky-300">.env</code> 配置{' '}
        <code className="text-sky-300">VITE_AMAP_KEY</code> 与安全密钥后重启 dev 服务器。
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-night-800/50 p-4">
      {/* 起点选择 */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">起点</span>
          <span className="inline-flex items-center gap-1 text-xs text-slate-200">
            <MapPin className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            {originLabel}
          </span>
          {effectiveOrigin && (
            <span className="text-[11px] text-slate-500">
              ({effectiveOrigin.lat.toFixed(4)}, {effectiveOrigin.lon.toFixed(4)})
            </span>
          )}
          {origin && (
            <button
              type="button"
              className="text-[11px] text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
              onClick={() => {
                onOriginChange(null)
                onPickingChange(false)
                originTips.clear()
              }}
            >
              重置为{city}市中心
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[190px] flex-1">
            <input
              className="field-input"
              placeholder="搜索起点，如 天河体育中心"
              value={originTips.keyword}
              onChange={(e) => originTips.setKeyword(e.target.value)}
              onFocus={() => originTips.setOpen(originTips.tips.length > 0)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && originTips.tips.length > 0) {
                  const tip = originTips.tips[0]
                  onOriginChange({ lat: tip.location.lat, lon: tip.location.lng, label: tip.name })
                  originTips.clear()
                }
              }}
            />
            <TipsDropdown
              open={originTips.open}
              tips={originTips.tips}
              onPick={(tip) => {
                onOriginChange({ lat: tip.location.lat, lon: tip.location.lng, label: tip.name })
                originTips.clear()
              }}
            />
          </div>
          <button
            type="button"
            className={picking ? 'btn bg-sky-500 text-white hover:bg-sky-400' : 'btn-ghost'}
            onClick={() => onPickingChange(!picking)}
          >
            <Crosshair className="h-4 w-4" aria-hidden="true" />
            {picking ? '取消点选' : '在地图上选择起点'}
          </button>
          <button type="button" className="btn-ghost" disabled={locating} onClick={handleLocate}>
            <Navigation className="h-4 w-4" aria-hidden="true" />
            {locating ? '定位中…' : '使用我的位置'}
          </button>
        </div>
        {locError && <p className="text-xs text-amber-300/90">{locError}</p>}
      </div>

      {/* 目的地 */}
      <div className="relative">
        <label className="field-label">目的地（可选，留空则自动推荐起点周边的骑行目的地）</label>
        <div className="flex flex-wrap gap-2">
          <input
            className="field-input !w-auto min-w-[200px] flex-1"
            placeholder="搜索地点，如 越秀公园 / 大学城"
            value={destTips.keyword}
            onChange={(e) => {
              destTips.setKeyword(e.target.value)
              setDestination(null)
            }}
            onFocus={() => destTips.setOpen(destTips.tips.length > 0)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && destTips.tips.length > 0) {
                setDestination(destTips.tips[0])
                destTips.setKeyword(destTips.tips[0].name)
                destTips.setOpen(false)
              }
            }}
          />
          <button type="button" className="btn-primary" disabled={planning || !effectiveOrigin} onClick={() => void handlePlan(true)}>
            {destination ? '规划到该地' : '规划路线'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={planning || !effectiveOrigin}
            onClick={() => void handlePlan(false)}
          >
            {planning ? '规划中…' : '自动推荐周边路线'}
          </button>
        </div>
        <TipsDropdown
          open={destTips.open}
          tips={destTips.tips}
          onPick={(tip) => {
            setDestination(tip)
            destTips.setKeyword(tip.name)
            destTips.setOpen(false)
          }}
        />
      </div>

      {!AMAP_KEY && <p className="text-xs text-amber-300/90">未配置高德 Key,无法自动规划路线。</p>}
      {progress && <p className="text-xs text-sky-300">{progress}</p>}
      {error && <p className="text-xs text-red-300/90">{error}</p>}

      {candidates.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">
            共 {candidates.length} 条候选路线，点击即自动填入数据并采集环境信息：
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {candidates.map((c) => {
              const active = c.id === selectedId
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                      active
                        ? 'border-sky-400/60 bg-sky-400/10'
                        : 'border-white/10 bg-night-900/70 hover:border-white/20 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-100">
                        {c.name}
                        {c.primary && (
                          <span className="ml-2 rounded bg-sky-400/20 px-1.5 py-0.5 text-[10px] text-sky-300">目的地</span>
                        )}
                      </span>
                      {active && <span className="shrink-0 text-[10px] text-sky-300">已选择</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                      <span className="text-emerald-300">{c.distanceKm} km</span>
                      <span>约 {c.durationMin} 分钟</span>
                      <span>均速 {c.avgSpeed} km/h</span>
                    </div>
                    {c.address && <div className="mt-0.5 truncate text-[10px] text-slate-500">{c.address}</div>}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

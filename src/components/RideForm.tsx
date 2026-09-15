import { useCallback, useMemo, useRef, useState } from 'react'
import type { EnvData, RideRecord, SurfaceType, TrafficLevel, TrackPoint } from '../types'
import { SURFACE_LABELS, TRAFFIC_LABELS } from '../types'
import { CITIES } from '../data/cities'
import { parseGPX, maxSpeedFromSeries, speedSeriesFromTrack, summarizeTrack, trackDistanceMeters } from '../utils/gpxParser'
import { computeGain, enrichTrackElevation } from '../hooks/useElevation'
import { useWeather } from '../hooks/useWeather'
import type { RouteCandidate } from '../hooks/useRoutePlanning'
import { reverseGeocodePlace } from '../hooks/useRoutePlanning'
import { useAmap } from '../hooks/useAmap'
import type { BikeWithStatus } from '../utils/tire'
import { BIKE_CATEGORIES } from '../types'
import type { HuaweiRideMock } from '../utils/huaweiMock'
import { buildComment, buildSuggestions, computeScores, rainLevelLabel } from '../utils/scoring'
import MapView from './MapView'
import RoutePlanner, { type RouteOrigin } from './RoutePlanner'
import HuaweiSyncButton from './HuaweiSyncButton'
import Toast, { type ToastMessage, type ToastType } from './Toast'

interface Props {
  initialRecord?: RideRecord | null
  onSave: (record: RideRecord) => void
  onCancelEdit?: () => void
  /** 可选的单车列表(带外胎寿命状态) */
  bikes?: BikeWithStatus[]
}

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY_ENV: EnvData = {
  temperature: null,
  windLevel: null,
  humidity: null,
  precipitation: null,
  precipitationProbability: null,
  aqi: null,
  pm25: null,
}

/** 骑行数据录入:手动输入 + GPX 导入 + 地图绘制路线 + 环境数据采集(可手动修正) */
export default function RideForm({ initialRecord, onSave, onCancelEdit, bikes = [] }: Props) {
  const isEdit = initialRecord != null
  const [date, setDate] = useState(initialRecord?.date ?? todayLocal())
  const [bikeId, setBikeId] = useState(initialRecord?.bikeId ?? '')
  const [cityName, setCityName] = useState(initialRecord?.cityName || '广州')
  const [customCode, setCustomCode] = useState(
    initialRecord && !CITIES.some((c) => c.name === initialRecord.cityName) ? initialRecord.cityCode : ''
  )
  const [durationMin, setDurationMin] = useState(initialRecord?.durationMin?.toString() ?? '')
  const [distanceKm, setDistanceKm] = useState(initialRecord?.distanceKm?.toString() ?? '')
  const [avgSpeed, setAvgSpeed] = useState(initialRecord?.avgSpeed?.toString() ?? '')
  const [maxSpeed, setMaxSpeed] = useState(initialRecord?.maxSpeed?.toString() ?? '')
  const [elevationGain, setElevationGain] = useState(initialRecord?.route.elevationGain?.toString() ?? '')
  const [avgGrade, setAvgGrade] = useState(initialRecord?.route.avgGrade?.toString() ?? '')
  const [surface, setSurface] = useState<SurfaceType>(initialRecord?.route.surface ?? 'asphalt')
  const [traffic, setTraffic] = useState<TrafficLevel>(initialRecord?.route.traffic ?? 'low')
  const [notes, setNotes] = useState(initialRecord?.notes ?? '')
  /** 起点位置名称:规划起点/轨迹起点自动得出,也可手动填写 */
  const [startName, setStartName] = useState(initialRecord?.startName ?? '')
  /** 起点所在市区(如「广州市天河区」) */
  const [startDistrict, setStartDistrict] = useState(initialRecord?.startDistrict ?? '')
  /** 起点名称是否正在通过逆地理编码获取 */
  const [startNameLoading, setStartNameLoading] = useState(false)
  const { amap } = useAmap()
  const amapRef = useRef(amap)
  amapRef.current = amap

  const [track, setTrack] = useState<TrackPoint[] | null>(initialRecord?.track.length ? initialRecord.track : null)
  const [trackSource, setTrackSource] = useState<'gpx' | 'drawn' | 'route' | null>(
    initialRecord && initialRecord.track.length ? 'gpx' : null
  )
  const [routeName, setRouteName] = useState(initialRecord?.routeName ?? '')
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  /** 路线规划起点:null 表示使用所选城市的中心 */
  const [routeOrigin, setRouteOrigin] = useState<RouteOrigin | null>(null)
  /** 是否处于「在地图上选择起点」模式 */
  const [pickingOrigin, setPickingOrigin] = useState(false)
  const [speedSeries, setSpeedSeries] = useState(initialRecord?.speedSeries ?? [])
  const [rideTimes, setRideTimes] = useState<{ startISO: string; endISO: string } | null>(null)
  const [gpxMessage, setGpxMessage] = useState('')
  const [drawMode, setDrawMode] = useState(false)
  const [elevLoading, setElevLoading] = useState(false)

  const [env, setEnv] = useState<EnvData>(initialRecord?.env ?? EMPTY_ENV)
  const [envMeta, setEnvMeta] = useState(
    initialRecord?.envMeta ?? { weatherFetched: false, aqiFetched: false, manualEdited: false }
  )
  const { loading: envLoading, fetchEnv } = useWeather()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const toastIdRef = useRef(0)

  /** 弹出一条 Toast(同一时刻只显示一条,重复触发会重新计时) */
  const showToast = useCallback((message: string, type: ToastType) => {
    toastIdRef.current += 1
    setToast({ id: toastIdRef.current, message, type })
  }, [])

  const city = CITIES.find((c) => c.name === cityName)
  const cityCode = customCode.trim() || city?.code || ''
  const selectedBike = bikes.find((b) => b.id === bikeId) ?? null
  const location = useMemo(() => {
    if (track && track.length > 0) return { lat: track[0].lat, lon: track[0].lon }
    return city ? { lat: city.lat, lon: city.lon } : null
  }, [track, city])

  /** 采集环境数据:坐标为显式传入时优先使用(如刚选中的规划路线起点) */
  const fetchEnvFor = useCallback(
    async (
      loc: { lat: number; lon: number } | null,
      times: { startISO: string; endISO: string } | null
    ) => {
      if (!loc) {
        setEnvMeta((m) => ({ ...m, weatherError: '请先选择城市,或导入/规划/绘制路线以确定位置' }))
        return
      }
      const result = await fetchEnv({
        lat: loc.lat,
        lon: loc.lon,
        date,
        cityCode,
        rideStartISO: times?.startISO ?? null,
        rideEndISO: times?.endISO ?? null,
      })
      setEnv((prev) => ({ ...prev, ...result.weather, ...(result.aqi ?? {}) }))
      setEnvMeta(result.meta)
    },
    [cityCode, date, fetchEnv]
  )

  /* 实时评分预览 */
  const preview = useMemo(() => {
    const scores = computeScores(env, {
      elevationGain: elevationGain ? parseFloat(elevationGain) : null,
      avgGrade: avgGrade ? parseFloat(avgGrade) : null,
      surface,
      traffic,
    })
    return { scores, rainLabel: rainLevelLabel(scores.rainFactor, env.precipitation, env.precipitationProbability) }
  }, [env, elevationGain, avgGrade, surface, traffic])

  /** 根据坐标反查起点地名与所在市区并写入表单(失败时退化为坐标文本) */
  const applyStartNameFromPoint = useCallback(async (point: TrackPoint, preferredName?: string) => {
    const coords = `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`
    const ns = amapRef.current
    if (!ns) {
      setStartName(preferredName || coords)
      return
    }
    setStartNameLoading(true)
    try {
      const place = await reverseGeocodePlace(ns, [point.lon, point.lat])
      setStartName(preferredName || place?.name || coords)
      setStartDistrict(place?.district ?? '')
    } catch {
      setStartName(preferredName || coords)
    } finally {
      setStartNameLoading(false)
    }
  }, [])

  /* ---------------- GPX 导入 ---------------- */
  const handleGPXFile = async (file: File) => {
    setGpxMessage('')
    try {
      const xml = await file.text()
      const { points, name } = parseGPX(xml)
      const summary = summarizeTrack(points)
      const series = speedSeriesFromTrack(points)
      setTrack(points)
      setTrackSource('gpx')
      setSelectedCandidateId(null)
      setRouteName(name || file.name.replace(/\.gpx$/i, ''))
      void applyStartNameFromPoint(points[0]) // 起点位置由首个轨迹点反查得到
      setDistanceKm(String(summary.distanceKm))
      if (summary.avgGrade != null) setAvgGrade(String(summary.avgGrade))
      setElevationGain(String(summary.elevationGain))
      setSpeedSeries(series)
      const peak = maxSpeedFromSeries(series)
      if (peak != null) setMaxSpeed(String(peak))
      const firstTime = points.find((p) => p.time)?.time
      const lastTime = [...points].reverse().find((p) => p.time)?.time
      if (firstTime && lastTime && firstTime !== lastTime) {
        setRideTimes({ startISO: firstTime, endISO: lastTime })
        const minutes = (Date.parse(lastTime) - Date.parse(firstTime)) / 60000
        if (minutes > 1) {
          setDurationMin(String(Math.round(minutes)))
          setAvgSpeed(String(Math.round((summary.distanceKm / (minutes / 60)) * 10) / 10))
        }
        setGpxMessage(
          `已导入 ${file.name}:${points.length} 个轨迹点,距离 ${summary.distanceKm} km,爬升 ${summary.elevationGain} m。已识别骑行时段,获取环境数据时将按该时段提取逐小时降雨。`
        )
      } else {
        setRideTimes(null)
        setGpxMessage(
          `已导入 ${file.name}:${points.length} 个轨迹点,距离 ${summary.distanceKm} km,爬升 ${summary.elevationGain} m(无时间戳,不生成速度曲线)。`
        )
      }
    } catch (err) {
      setGpxMessage(`GPX 导入失败:${err instanceof Error ? err.message : String(err)}`)
      setRideTimes(null)
    }
  }

  /* ---------------- 地图绘制 ---------------- */
  const handleDrawn = async (points: TrackPoint[]) => {
    if (points.length < 2) return
    setTrack(points)
    setTrackSource('drawn')
    setSpeedSeries([])
    setRideTimes(null)
    setDrawMode(false)
    setRouteName('手绘路线')
    void applyStartNameFromPoint(points[0])
    // 高德 JS API 无免费海拔查询,用 Open-Meteo Elevation 采样估算;采样点同时用于海拔曲线
    setElevLoading(true)
    try {
      const enriched = await enrichTrackElevation(points)
      const km = Math.round((trackDistanceMeters(enriched) / 1000) * 100) / 100
      const gain = computeGain(enriched)
      setTrack(enriched)
      setDistanceKm(String(km))
      setElevationGain(String(gain))
      setAvgGrade(String(Math.round((gain / Math.max(1, km * 1000)) * 10000) / 100))
      setGpxMessage(`已绘制路线:${km} km,海拔采样 ${enriched.length} 点估算爬升 ${gain} m。`)
    } catch (err) {
      const km = Math.round((trackDistanceMeters(points) / 1000) * 100) / 100
      setDistanceKm(String(km))
      setGpxMessage(
        `已绘制路线:${km} km。海拔采样失败(${err instanceof Error ? err.message : String(err)}),请手动填写累计爬升。`
      )
    } finally {
      setElevLoading(false)
    }
  }

  /* ---------------- 自动规划的路线:选中后自动填数据并采集环境数据 ---------------- */
  const handleRouteCandidate = async (candidate: RouteCandidate) => {
    setSelectedCandidateId(candidate.id)
    setRouteName(candidate.name)
    // 起点位置:名称用用户选定的起点(我的位置 / 搜索到的地点 / 地图选点),
    // 同时反查该点的所在市区,历史记录里显示到区
    const start = candidate.path[0]
    void applyStartNameFromPoint(start, routeOrigin?.label)
    setTrack(candidate.path)
    setTrackSource('route')
    setSpeedSeries([])
    setRideTimes(null)
    setDrawMode(false)
    setDistanceKm(String(candidate.distanceKm))
    setDurationMin(String(candidate.durationMin))
    setAvgSpeed(String(candidate.avgSpeed))
    setMaxSpeed('')
    setGpxMessage(`已选择「${candidate.name}」:${candidate.distanceKm} km,预计 ${candidate.durationMin} 分钟。正在采样海拔并采集环境数据…`)

    // 海拔采样(Open-Meteo Elevation),同时用于海拔曲线与爬升估算
    let gain: number | null = null
    setElevLoading(true)
    try {
      const enriched = await enrichTrackElevation(candidate.path)
      gain = computeGain(enriched)
      setTrack(enriched)
      setElevationGain(String(gain))
      setAvgGrade(String(Math.round((gain / Math.max(1, candidate.distanceKm * 1000)) * 10000) / 100))
    } catch {
      // 采样失败不阻塞流程,累加爬升可手动填写
    } finally {
      setElevLoading(false)
    }

    // 用路线起点作为位置,自动采集天气与空气质量
    await fetchEnvFor({ lat: start.lat, lon: start.lon }, null)

    setGpxMessage(
      `已选择「${candidate.name}」:${candidate.distanceKm} km,预计 ${candidate.durationMin} 分钟` +
        (gain != null ? `,采样估算爬升 ${gain} m` : ',海拔采样失败请手动填写爬升') +
        '。环境数据已自动采集,可直接保存。'
    )
  }

  /* ---------------- 华为手表数据同步(当前为本地模拟数据) ---------------- */
  const handleHuaweiData = useCallback(
    (data: HuaweiRideMock) => {
      setDistanceKm(String(data.distance))
      setDurationMin(String(data.duration))
      setAvgSpeed(String(data.averageSpeed))
      setMaxSpeed(String(data.maxSpeed))
      setElevationGain(String(data.elevationGain))
      setRouteName(data.routeName)
      setNotes(`路线名称:${data.routeName}`)
      // 表单字段变化后,右侧评分预览会通过 useMemo 自动重新计算
      showToast('华为数据同步成功', 'success')
    },
    [showToast]
  )

  /* ---------------- 环境数据采集 ---------------- */
  const handleFetchEnv = async () => {
    await fetchEnvFor(location, rideTimes)
  }

  const setEnvField = (key: keyof EnvData, raw: string) => {
    const value = raw.trim() === '' ? null : Number(raw)
    setEnv((prev) => ({ ...prev, [key]: value != null && Number.isFinite(value) ? value : null }))
    setEnvMeta((m) => ({ ...m, manualEdited: true }))
  }

  /* ---------------- 保存 ---------------- */
  const handleSubmit = () => {
    const distance = parseFloat(distanceKm)
    if (!date) {
      alert('请填写骑行日期')
      return
    }
    if (!Number.isFinite(distance) || distance <= 0) {
      alert('请填写有效的骑行距离(km)')
      return
    }
    const gain = elevationGain ? parseFloat(elevationGain) : null
    const grade = avgGrade ? parseFloat(avgGrade) : null
    const route = {
      elevationGain: gain != null && Number.isFinite(gain) ? gain : null,
      avgGrade: grade != null && Number.isFinite(grade) ? grade : null,
      surface,
      traffic,
    }
    const scores = computeScores(env, route)
    const now = Date.now()
    const record: RideRecord = {
      id: initialRecord?.id ?? `ride_${now}_${Math.random().toString(36).slice(2, 8)}`,
      label: initialRecord?.label,
      bikeId: bikeId || undefined,
      date,
      durationMin: durationMin ? parseFloat(durationMin) : null,
      distanceKm: Math.round(distance * 100) / 100,
      avgSpeed: avgSpeed ? parseFloat(avgSpeed) : null,
      maxSpeed: maxSpeed ? parseFloat(maxSpeed) : null,
      cityName: customCode.trim() && !city ? '自定义城市' : cityName,
      cityCode,
      startName: startName.trim() || undefined,
      startDistrict: startDistrict.trim() || undefined,
      location,
      env,
      envMeta,
      route,
      track: track ?? [],
      routeName: routeName.trim() || undefined,
      speedSeries,
      scores,
      comment: buildComment(env, scores),
      suggestions: buildSuggestions(env, route),
      notes,
      createdAt: initialRecord?.createdAt ?? now,
      updatedAt: now,
    }
    // 保存时若所选单车的外胎已超期,提醒用户检查外胎状态
    if (selectedBike?.tire?.level === 'expired') {
      showToast(
        `单车「${selectedBike.name}」的外胎已超过建议使用寿命,请注意检查外胎状态`,
        'error'
      )
    }
    onSave(record)
    if (!isEdit) {
      // 新建保存后重置表单
      setDistanceKm('')
      setDurationMin('')
      setAvgSpeed('')
      setMaxSpeed('')
      setTrack(null)
      setTrackSource(null)
      setRouteName('')
      setStartName('')
      setStartDistrict('')
      setSelectedCandidateId(null)
      setSpeedSeries([])
      setRideTimes(null)
      setGpxMessage('')
      setEnv(EMPTY_ENV)
      setEnvMeta({ weatherFetched: false, aqiFetched: false, manualEdited: false })
      setNotes('')
      setBikeId('')
    }
  }

  const num = (v: string | number | null | undefined) => (v == null ? '' : String(v))

  return (
    <div className="space-y-5">
      {/* 基本信息 */}
      <section>
        <h3 className="card-title">📋 基本信息</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div>
            <label className="field-label">骑行日期 *</label>
            <input type="date" className="field-input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="field-label">城市(空气质量查询)</label>
            <select
              className="field-input"
              value={cityName}
              onChange={(e) => {
                setCityName(e.target.value)
                setCustomCode('')
              }}
            >
              {CITIES.map((c) => (
                <option key={c.code} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">自定义城市编码(可选)</label>
            <input
              className="field-input"
              placeholder="如 101280601"
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">
              起点位置{startNameLoading && <span className="ml-1 text-sky-400">获取中…</span>}
            </label>
            <input
              className="field-input"
              placeholder="规划路线或导入 GPX 后自动填入,也可手动填写"
              value={startName}
              onChange={(e) => setStartName(e.target.value)}
              title={location ? `坐标:${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}` : undefined}
            />
          </div>
          <div>
            <label className="field-label">起点所在区</label>
            <input
              className="field-input"
              placeholder="自动识别,如 广州市天河区"
              value={startDistrict}
              onChange={(e) => setStartDistrict(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">单车</label>
            <select className="field-input" value={bikeId} onChange={(e) => setBikeId(e.target.value)}>
              <option value="">未指定</option>
              {bikes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}({BIKE_CATEGORIES[b.category]})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">距离 (km) *</label>
            <input type="number" min="0" step="0.1" className="field-input" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} />
          </div>
          <div>
            <label className="field-label">时长 (分钟)</label>
            <input type="number" min="0" className="field-input" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
          </div>
          <div>
            <label className="field-label">平均速度 (km/h)</label>
            <input type="number" min="0" step="0.1" className="field-input" value={avgSpeed} onChange={(e) => setAvgSpeed(e.target.value)} />
          </div>
          <div>
            <label className="field-label">最高速度 (km/h)</label>
            <input type="number" min="0" step="0.1" className="field-input" value={maxSpeed} onChange={(e) => setMaxSpeed(e.target.value)} />
          </div>
        </div>
        {selectedBike?.tire?.level === 'expired' && (
          <p className="mt-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-300">
            ⚠ 单车「{selectedBike.name}」的{selectedBike.tire.tireName}已超过建议使用寿命(已骑{' '}
            {Math.round(selectedBike.tire.usedKm)} km / 建议 {selectedBike.tire.lifeKm} km,超期{' '}
            {Math.round(Math.abs(selectedBike.tire.remainingKm))} km),请注意检查外胎状态,及时更换。
          </p>
        )}
        {selectedBike?.tire?.level === 'soon' && (
          <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-300">
            单车「{selectedBike.name}」的{selectedBike.tire.tireName}接近建议寿命,还剩{' '}
            {Math.round(selectedBike.tire.remainingKm)} km,请留意胎面磨损。
          </p>
        )}
      </section>

      {/* 华为手表数据同步 */}
      <section className="rounded-xl border border-white/10 bg-night-800/50 px-4 py-3">
        <h3 className="card-title mb-3">⌚ 华为手表健康数据</h3>
        <HuaweiSyncButton
          onSynced={handleHuaweiData}
          onError={(msg) => showToast(msg, 'error')}
        />
        <p className="mt-2 text-[11px] leading-5 text-slate-500">
          当前为本地模拟数据(Health Kit 权限审核中):同步后会填充距离、时长、平均速度、最高速度、累计爬升与备注,右侧评分预览会自动重算。
          真实接口已在 <code className="text-slate-400">utils/huaweiMock.ts</code> 中预留。
        </p>
      </section>

      {/* 数据来源 */}
      <section>
        <h3 className="card-title">🗺️ 路线(自动规划 / GPX 导入 / 地图绘制)</h3>

        <RoutePlanner
          city={cityName}
          cityCenter={city ? { lat: city.lat, lon: city.lon } : null}
          selectedId={selectedCandidateId}
          onSelect={(c) => void handleRouteCandidate(c)}
          origin={routeOrigin}
          onOriginChange={(o) => {
            setRouteOrigin(o)
            setSelectedCandidateId(null)
          }}
          picking={pickingOrigin}
          onPickingChange={(on) => {
            setPickingOrigin(on)
            if (on) setDrawMode(false) // 点选与手绘互斥,避免地图点击语义冲突
          }}
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-500">或者:</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".gpx,application/gpx+xml,text/xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleGPXFile(file)
              e.target.value = ''
            }}
          />
          <button type="button" className="btn-ghost" onClick={() => fileInputRef.current?.click()}>
            导入 GPX 文件
          </button>
          <button
            type="button"
            className={drawMode ? 'btn bg-amber-500 text-white hover:bg-amber-400' : 'btn-ghost'}
            onClick={() => {
              setDrawMode((v) => !v)
              setPickingOrigin(false) // 手绘与点选互斥
            }}
          >
            {drawMode ? '结束绘制' : '地图绘制路线'}
          </button>
          {trackSource && (
            <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-xs text-sky-300">
              {trackSource === 'gpx' ? 'GPX 轨迹' : trackSource === 'route' ? `规划路线 · ${routeName || '未命名'}` : '绘制路线'} ·{' '}
              {track?.length ?? 0} 点
            </span>
          )}
          {elevLoading && <span className="text-xs text-slate-400">海拔采样中…</span>}
        </div>
        {gpxMessage && <p className="mt-2 text-xs text-slate-400">{gpxMessage}</p>}
        <div className="mt-3">
          <MapView
            track={track}
            drawEnabled={drawMode}
            onDrawn={(p) => void handleDrawn(p)}
            pickMode={pickingOrigin}
            pickHint="点击地图选择起点"
            originMarker={routeOrigin}
            onPick={(point) => {
              setRouteOrigin({ lat: point.lat, lon: point.lon, label: '地图选点' })
              setSelectedCandidateId(null)
              setPickingOrigin(false)
            }}
          />
        </div>
      </section>

      {/* 路线属性 */}
      <section>
        <h3 className="card-title">🛣️ 路线属性</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <label className="field-label">累计爬升 (m)</label>
            <input type="number" min="0" className="field-input" value={num(elevationGain)} onChange={(e) => setElevationGain(e.target.value)} />
          </div>
          <div>
            <label className="field-label">平均坡度 (%)</label>
            <input type="number" min="0" step="0.1" className="field-input" value={num(avgGrade)} onChange={(e) => setAvgGrade(e.target.value)} />
          </div>
          <div>
            <label className="field-label">路面类型</label>
            <select className="field-input" value={surface} onChange={(e) => setSurface(e.target.value as SurfaceType)}>
              {Object.entries(SURFACE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">交通流量</label>
            <select className="field-input" value={traffic} onChange={(e) => setTraffic(e.target.value as TrafficLevel)}>
              {Object.entries(TRAFFIC_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* 环境数据 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="card-title mb-0">🌦️ 环境数据(自动采集,可手动修正)</h3>
          <button type="button" className="btn-primary" disabled={envLoading} onClick={() => void handleFetchEnv()}>
            {envLoading ? '采集中…' : '获取环境数据'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <label className="field-label">气温 (℃)</label>
            <input type="number" step="0.1" className="field-input" value={num(env.temperature)} onChange={(e) => setEnvField('temperature', e.target.value)} />
          </div>
          <div>
            <label className="field-label">风力 (级)</label>
            <input type="number" min="0" max="12" className="field-input" value={num(env.windLevel)} onChange={(e) => setEnvField('windLevel', e.target.value)} />
          </div>
          <div>
            <label className="field-label">湿度 (%)</label>
            <input type="number" min="0" max="100" className="field-input" value={num(env.humidity)} onChange={(e) => setEnvField('humidity', e.target.value)} />
          </div>
          <div>
            <label className="field-label">降水量 (mm)</label>
            <input type="number" min="0" step="0.1" className="field-input" value={num(env.precipitation)} onChange={(e) => setEnvField('precipitation', e.target.value)} />
          </div>
          <div>
            <label className="field-label">降雨概率 (%)</label>
            <input type="number" min="0" max="100" className="field-input" value={num(env.precipitationProbability)} onChange={(e) => setEnvField('precipitationProbability', e.target.value)} />
          </div>
          <div>
            <label className="field-label">AQI</label>
            <input type="number" min="0" className="field-input" value={num(env.aqi)} onChange={(e) => setEnvField('aqi', e.target.value)} />
          </div>
          <div>
            <label className="field-label">PM2.5 (μg/m³)</label>
            <input type="number" min="0" className="field-input" value={num(env.pm25)} onChange={(e) => setEnvField('pm25', e.target.value)} />
          </div>
          <div className="flex items-end">
            <div className="flex flex-wrap gap-1.5 pb-1 text-[10px]">
              {envMeta.weatherFetched && <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">天气已采集</span>}
              {envMeta.aqiFetched && (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">
                  AQI已采集{envMeta.aqiSource ? ` · ${envMeta.aqiSource}` : ''}
                </span>
              )}
              {envMeta.manualEdited && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300">已手动修改</span>}
              {rideTimes && <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-300">已识别骑行时段</span>}
            </div>
          </div>
        </div>
        {envMeta.weatherNote && <p className="mt-2 text-xs text-slate-400">天气:{envMeta.weatherNote}</p>}
        {(envMeta.weatherError || envMeta.aqiError) && (
          <div className="mt-2 space-y-1 text-xs text-red-300/90">
            {envMeta.weatherError && <p>天气:{envMeta.weatherError}(可手动填写)</p>}
            {envMeta.aqiError && <p>空气质量:{envMeta.aqiError}</p>}
          </div>
        )}
      </section>

      {/* 备注与保存 */}
      <section className="space-y-3">
        <div>
          <label className="field-label">备注</label>
          <textarea rows={2} className="field-input resize-none" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="骑行感受、路线名等" />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-sky-400/20 bg-sky-400/5 px-4 py-3">
          <div className="text-sm">
            <span className="text-slate-400">评分预览:</span>
            <span className="ml-2 text-2xl font-bold text-sky-300">{preview.scores.total}</span>
            <span className="ml-2 text-xs text-slate-400">
              天气 {preview.scores.weather} · 路线 {preview.scores.route} · 降雨指数 {preview.scores.rainFactor}({preview.rainLabel})
            </span>
          </div>
          <div className="flex gap-2">
            {isEdit && (
              <button type="button" className="btn-ghost" onClick={onCancelEdit}>
                取消
              </button>
            )}
            <button type="button" className="btn-primary" onClick={handleSubmit}>
              {isEdit ? '保存修改' : '保存骑行记录'}
            </button>
          </div>
        </div>
      </section>

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { MapPin, Bike as BikeIcon, Moon, Sun } from 'lucide-react'
import type { RideRecord } from './types'
import { useRides, useBikes, useDays } from './hooks/useIndexedDB'
import { useTheme } from './hooks/useTheme'
import { withTireStatus } from './utils/tire'
import RideForm from './components/RideForm'
import RideCheckIn from './components/RideCheckIn'
import ScoreCard from './components/ScoreCard'
import ScoreRadar from './components/ScoreRadar'
import RouteReviews from './components/RouteReviews'
import StatsOverview from './components/StatsOverview'
import MaintenanceAlerts from './components/MaintenanceAlerts'
import SpeedChart from './components/SpeedChart'
import ElevationChart from './components/ElevationChart'
import TrendChart from './components/TrendChart'
import HistoryList from './components/HistoryList'
import ManageBikes from './components/ManageBikes'
import MapView from './components/MapView'

type TabId = 'record' | 'dashboard' | 'history' | 'bikes'

const TABS: { id: TabId; label: string }[] = [
  { id: 'record', label: '记录' },
  { id: 'dashboard', label: '看板' },
  { id: 'history', label: '历史' },
  { id: 'bikes', label: '单车与轮胎' },
]

/** 生成下一条记录的路线编号:取现有数字编号最大值 +1,重命名过的非数字名称不参与 */
function nextRideLabel(rides: RideRecord[]): string {
  const nums = rides
    .map((r) => (r.label ?? '').trim())
    .filter((s) => /^\d+$/.test(s))
    .map((s) => parseInt(s, 10))
  const max = nums.length ? Math.max(...nums) : 0
  // 与记录条数取较大值,避免用户全部改名后编号从 1 重来
  return String(Math.max(max, rides.length) + 1)
}

export default function App() {
  const { rides, loading, mode, save, remove } = useRides()
  const { bikes: rawBikes, save: saveBike, remove: removeBike } = useBikes()
  const { days, save: saveDay, remove: removeDay } = useDays()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<RideRecord | null>(null)
  const [tab, setTab] = useState<TabId>('record')
  const { theme, toggle: toggleTheme } = useTheme()

  /** 打开某条记录进行编辑(自动切回「记录」页) */
  const startEdit = (record: RideRecord) => {
    setEditing(record)
    setTab('record')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** 单车列表附加上累计里程与外胎寿命状态 */
  const bikes = useMemo(() => withTireStatus(rawBikes, rides), [rawBikes, rides])

  // 默认选中最新一条
  useEffect(() => {
    if (rides.length > 0 && (selectedId == null || !rides.some((r) => r.id === selectedId))) {
      setSelectedId(rides[0].id)
    }
  }, [rides, selectedId])

  const selected = useMemo(() => rides.find((r) => r.id === selectedId) ?? null, [rides, selectedId])

  /** 外胎是否需要关注:超期(红)/接近寿命(琥珀),用于分页角标 */
  const tireAlert = useMemo(() => {
    const levels = bikes.map((b) => b.tire?.level).filter(Boolean)
    if (levels.includes('expired')) return 'expired' as const
    if (levels.includes('soon')) return 'soon' as const
    return null
  }, [bikes])

  /** 当前记录使用的单车名称 */
  const selectedBikeName = useMemo(() => {
    if (!selected?.bikeId) return null
    return bikes.find((b) => b.id === selected.bikeId)?.name ?? null
  }, [selected, bikes])

  const handleSave = async (record: RideRecord) => {
    // 新建记录没有编号时自动分配(1、2、3…),之后可在历史列表里重命名
    await save(record.label ? record : { ...record, label: nextRideLabel(rides) })
    setSelectedId(record.id)
    setEditing(null)
  }

  /** 在历史列表里重命名路线编号 */
  const handleRename = async (id: string, label: string) => {
    const record = rides.find((r) => r.id === id)
    if (!record || (record.label ?? '') === label) return
    await save({ ...record, label: label || undefined, updatedAt: Date.now() })
  }

  /**
   * 今日骑行打卡:
   * 骑了 → 生成一条今天的骑行记录并关联所选单车,该车的累计里程/骑行次数/最近骑行日期
   * 与外胎寿命随即在「单车与轮胎管理」中更新(自动同步);距离可留空,之后补充详细数据。
   * 没骑 → 只记录当天的休息状态。
   */
  const handleCheckIn = async (input: { rode: boolean; bikeId?: string; distanceKm?: number }) => {
    const today = (() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()
    const now = Date.now()
    const existing = days.find((d) => d.date === today) ?? null

    if (!input.rode) {
      await removeDay(today) // 覆盖当天原有打卡，避免残留旧的骑行记录关联
      await saveDay({ id: today, date: today, rode: false, createdAt: now })
      if (existing?.rideId) await remove(existing.rideId)
      return null
    }

    const record: RideRecord = {
      id: `ride_checkin_${now}_${Math.random().toString(36).slice(2, 8)}`,
      label: nextRideLabel(rides), // 打卡记录同样分配路线编号
      bikeId: input.bikeId,
      checkIn: true,
      date: today,
      durationMin: null,
      distanceKm: input.distanceKm ?? null,
      avgSpeed: null,
      maxSpeed: null,
      cityName: '',
      cityCode: '',
      location: null,
      env: {
        temperature: null,
        windLevel: null,
        humidity: null,
        precipitation: null,
        precipitationProbability: null,
        aqi: null,
        pm25: null,
      },
      envMeta: { weatherFetched: false, aqiFetched: false, manualEdited: false },
      route: { elevationGain: null, avgGrade: null, surface: null, traffic: null },
      track: [],
      speedSeries: [],
      scores: null, // 打卡记录不参与评分与趋势
      comment: '',
      suggestions: [],
      notes: '',
      createdAt: now,
      updatedAt: now,
    }
    await save(record)
    // 同一天重复打卡时,删掉上一次生成的记录,保持一天一条
    if (existing?.rideId && existing.rideId !== record.id) await remove(existing.rideId)
    await saveDay({
      id: today,
      date: today,
      rode: true,
      bikeId: input.bikeId,
      distanceKm: input.distanceKm,
      rideId: record.id,
      createdAt: now,
    })
    setSelectedId(record.id)
    return record.id
  }

  /** 撤销今日打卡(打卡生成的骑行记录一并删除) */
  const handleClearToday = async () => {
    const today = (() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()
    const entry = days.find((d) => d.date === today)
    if (!entry) return
    if (entry.rideId) await remove(entry.rideId)
    await removeDay(today)
  }

  /** 打卡后重新打卡一天,避免残留 */

  return (
    <div className="min-h-full">
      {/* 顶栏 */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-night-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🚴</span>
            <h1 className="text-base font-bold tracking-wide text-slate-100">骑行评分监测看板</h1>
            <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[10px] text-sky-300">
              天气 60% · 路线 40%
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            {loading ? (
              <span>加载中…</span>
            ) : (
              <>
                <span className="hidden sm:inline">{rides.length} 条记录</span>
                <span className="hidden rounded-full border border-white/10 bg-white/5 px-2 py-0.5 sm:inline">
                  {mode === 'indexeddb' ? 'IndexedDB' : mode === 'localstorage' ? 'localStorage(降级)' : '存储初始化中'}
                </span>
              </>
            )}
            {/* 明暗(昼夜)切换 */}
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? '切换到日间（浅色）模式' : '切换到夜间（深色）模式'}
              aria-label={theme === 'dark' ? '切换到日间模式' : '切换到夜间模式'}
              className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300 transition hover:bg-white/10"
            >
              {theme === 'dark' ? (
                <Sun className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
              ) : (
                <Moon className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{theme === 'dark' ? '日间' : '夜间'}</span>
            </button>
          </div>
        </div>

        {/* 分页导航:把长页面拆成四块,每屏只显示相关内容 */}
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 md:px-6">
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`relative whitespace-nowrap rounded-t-lg px-4 py-2 text-sm transition ${
                  active ? 'font-medium text-sky-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.label}
                {t.id === 'history' && rides.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-400">{rides.length}</span>
                )}
                {t.id === 'bikes' && tireAlert && (
                  <span
                    className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                      tireAlert === 'expired' ? 'bg-red-400' : 'bg-amber-400'
                    }`}
                    title={tireAlert === 'expired' ? '有外胎超过建议寿命' : '有外胎接近寿命'}
                  />
                )}
                {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-sky-400" />}
              </button>
            )
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-6">
        {/* ===== 记录:今日打卡 + 录入 + 本次评分 ===== */}
        {tab === 'record' && (
          <>
            <RideCheckIn
              bikes={bikes}
              days={days}
              rides={rides}
              onCheckIn={handleCheckIn}
              onClearToday={handleClearToday}
              onEditRide={startEdit}
            />

            <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
              <section className="card xl:col-span-7">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-300">
                  {editing ? '✏️ 编辑骑行记录' : '➕ 记录一次骑行'}
                  {editing && (
                    <button
                      type="button"
                      className="ml-auto text-xs font-normal text-slate-400 hover:text-slate-200"
                      onClick={() => setEditing(null)}
                    >
                      取消编辑
                    </button>
                  )}
                </div>
                <RideForm
                  key={editing?.id ?? 'new'}
                  initialRecord={editing}
                  bikes={bikes}
                  onSave={(r) => void handleSave(r)}
                  onCancelEdit={() => setEditing(null)}
                />
              </section>

              {/* 右列:本次评分 + 路线评价(同一列内纵向堆叠) */}
              <div className="space-y-5 xl:col-span-5">
                <section className="card">
                  <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold tracking-wide text-slate-300">
                    <span>📊 本次评分{selected ? ` · ${selected.date}` : ''}</span>
                    {selected?.routeName && <span className="text-xs font-normal text-slate-400">路线：{selected.routeName}</span>}
                    {selectedBikeName && (
                      <span className="flex items-center gap-1 text-xs font-normal text-sky-300/90">
                        <BikeIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="truncate" title={selectedBikeName}>
                          单车：{selectedBikeName}
                        </span>
                      </span>
                    )}
                    {selected?.startName && (
                      <span className="flex max-w-full items-center gap-1 text-xs font-normal text-amber-300/90">
                        <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="truncate" title={selected.startName}>
                          起点：{selected.startName}
                        </span>
                      </span>
                    )}
                  </div>
                  {selected ? (
                    <ScoreCard record={selected} />
                  ) : (
                    <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-slate-500">
                      <span className="text-3xl">🚴‍♂️</span>
                      <p>还没有骑行记录</p>
                      <p className="text-xs">在左侧录入数据、导入 GPX 或绘制路线后保存，即可看到评分</p>
                    </div>
                  )}
                </section>

                {/* 路线评价:自己在该路线上的历史统计 + 他人评价(预留) */}
                <RouteReviews routeName={selected?.routeName} rides={rides} />

                {/* 近 30 天概览与保养提醒:填补右列空白,提供日常最常看的两类信息 */}
                <StatsOverview rides={rides} />
                <MaintenanceAlerts bikes={bikes} onManage={() => setTab('bikes')} />
              </div>
            </div>
          </>
        )}

        {/* ===== 看板:图表 + 地图 + 趋势 ===== */}
        {tab === 'dashboard' && (
          <>
            <section className="card">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-300">
                📈 评分趋势（最近 10 次）
              </div>
              <TrendChart rides={rides} />
            </section>

            {selected ? (
              <>
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <section className="card">
                    <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-300">
                      ⚡ 速度曲线
                      <span className="text-xs font-normal text-slate-500">{selected.date}</span>
                    </div>
                    <SpeedChart data={selected.speedSeries} />
                  </section>
                  <section className="card">
                    <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-300">
                      ⛰️ 海拔曲线
                    </div>
                    <ElevationChart track={selected.track} />
                  </section>
                </div>

                {selected.track.length >= 2 && (
                  <section className="card">
                    <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-300">
                      🗺️ 骑行轨迹 · {selected.date}
                    </div>
                    <MapView track={selected.track} />
                  </section>
                )}

                {selected.scores && (
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <section className="card">
                      <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-300">
                        🎯 评分雷达
                        <span className="text-xs font-normal text-slate-500">
                          天气 {selected.scores.weather} · 路线 {selected.scores.route}
                        </span>
                      </div>
                      <div className="flex justify-center">
                        <ScoreRadar weather={selected.scores.weather} route={selected.scores.route} />
                      </div>
                    </section>
                  </div>
                )}
              </>
            ) : (
              <section className="card">
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-slate-500">
                  <p>还没有骑行记录</p>
                  <p className="text-xs">保存记录后，这里会显示速度曲线、海拔曲线与骑行轨迹地图</p>
                </div>
              </section>
            )}
          </>
        )}

        {/* ===== 历史 ===== */}
        {tab === 'history' && (
          <section className="card">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-300">🗂️ 历史记录</div>
            <HistoryList
              rides={rides}
              bikes={bikes}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(id)}
              onEdit={startEdit}
              onDelete={(id) => void remove(id)}
              onRename={(id, label) => void handleRename(id, label)}
            />
          </section>
        )}

        {/* ===== 单车与轮胎 ===== */}
        {tab === 'bikes' && (
          <ManageBikes bikes={bikes} onSave={(bike) => void saveBike(bike)} onRemove={(id) => void removeBike(id)} />
        )}

        <footer className="space-y-2 pb-6 text-center text-[11px] text-slate-500">
          <p>天气与空气质量：Open-Meteo · 海拔：Open-Meteo Elevation · 地图与路线：高德 · 数据仅保存在本地浏览器</p>
          <p>
            <a className="transition hover:text-slate-300" href="./privacy.html" target="_blank" rel="noreferrer">
              隐私政策
            </a>
            <span className="mx-2 text-slate-600">·</span>
            <a className="transition hover:text-slate-300" href="./terms.html" target="_blank" rel="noreferrer">
              用户协议
            </a>
          </p>
        </footer>
      </main>
    </div>
  )
}

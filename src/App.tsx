import { useEffect, useMemo, useState } from 'react'
import { MapPin } from 'lucide-react'
import type { RideRecord } from './types'
import { useRides } from './hooks/useIndexedDB'
import RideForm from './components/RideForm'
import ScoreCard from './components/ScoreCard'
import ScoreRadar from './components/ScoreRadar'
import SpeedChart from './components/SpeedChart'
import ElevationChart from './components/ElevationChart'
import TrendChart from './components/TrendChart'
import HistoryList from './components/HistoryList'
import MapView from './components/MapView'

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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<RideRecord | null>(null)

  // 默认选中最新一条
  useEffect(() => {
    if (rides.length > 0 && (selectedId == null || !rides.some((r) => r.id === selectedId))) {
      setSelectedId(rides[0].id)
    }
  }, [rides, selectedId])

  const selected = useMemo(() => rides.find((r) => r.id === selectedId) ?? null, [rides, selectedId])

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
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                  {mode === 'indexeddb' ? 'IndexedDB' : mode === 'localstorage' ? 'localStorage(降级)' : '存储初始化中'}
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-6">
        {/* 录入 + 当前评分 */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <section className="card xl:col-span-7">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-300">
              {editing ? '✏️ 编辑骑行记录' : '➕ 记录一次骑行'}
              {editing && (
                <button type="button" className="ml-auto text-xs font-normal text-slate-400 hover:text-slate-200" onClick={() => setEditing(null)}>
                  取消编辑
                </button>
              )}
            </div>
            <RideForm
              key={editing?.id ?? 'new'}
              initialRecord={editing}
              onSave={(r) => void handleSave(r)}
              onCancelEdit={() => setEditing(null)}
            />
          </section>

          <section className="card xl:col-span-5">
            <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold tracking-wide text-slate-300">
              <span>📊 本次评分{selected ? ` · ${selected.date}` : ''}</span>
              {selected?.routeName && <span className="text-xs font-normal text-slate-400">路线:{selected.routeName}</span>}
              {selected?.startName && (
                <span className="flex max-w-full items-center gap-1 text-xs font-normal text-amber-300/90">
                  <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate" title={selected.startName}>
                    起点:{selected.startName}
                  </span>
                </span>
              )}
            </div>
            {selected ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ScoreCard record={selected} />
                <div className="flex items-center justify-center">
                  <ScoreRadar weather={selected.scores?.weather ?? 0} route={selected.scores?.route ?? 0} />
                </div>
              </div>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-slate-500">
                <span className="text-3xl">🚴‍♂️</span>
                <p>还没有骑行记录</p>
                <p className="text-xs">在左侧录入数据、导入 GPX 或绘制路线后保存,即可看到评分</p>
              </div>
            )}
          </section>
        </div>

        {/* 图表区 */}
        {selected && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section className="card">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-300">⚡ 速度曲线</div>
              <SpeedChart data={selected.speedSeries} />
            </section>
            <section className="card">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-300">⛰️ 海拔曲线</div>
              <ElevationChart track={selected.track} />
            </section>
          </div>
        )}

        {/* 轨迹地图 */}
        {selected && selected.track.length >= 2 && (
          <section className="card">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-300">
              🗺️ 骑行轨迹 · {selected.date}
            </div>
            <MapView track={selected.track} />
          </section>
        )}

        {/* 趋势 + 历史 */}
        <section className="card">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-300">📈 评分趋势(最近 10 次)</div>
          <TrendChart rides={rides} />
        </section>

        <section className="card">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-300">🗂️ 历史记录</div>
          <HistoryList
            rides={rides}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onEdit={(r) => {
              setEditing(r)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            onDelete={(id) => void remove(id)}
            onRename={(id, label) => void handleRename(id, label)}
          />
        </section>

        <footer className="space-y-2 pb-6 text-center text-[11px] text-slate-600">
          <p>天气与空气质量:Open-Meteo · 海拔:Open-Meteo Elevation · 地图与路线:高德 · 数据仅保存在本地浏览器</p>
          <p>
            <a className="transition hover:text-slate-400" href="./privacy.html" target="_blank" rel="noreferrer">
              隐私政策
            </a>
            <span className="mx-2 text-slate-700">·</span>
            <a className="transition hover:text-slate-400" href="./terms.html" target="_blank" rel="noreferrer">
              用户协议
            </a>
          </p>
        </footer>
      </main>
    </div>
  )
}

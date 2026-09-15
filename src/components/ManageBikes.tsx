import { useState } from 'react'
import { Bike as BikeIcon, Pencil, Plus, RefreshCcw, Trash2 } from 'lucide-react'
import type { Bike, BikeCategoryId } from '../types'
import { BIKE_CATEGORIES, TIRE_TYPES, findTireType } from '../types'
import type { BikeWithStatus } from '../utils/tire'

interface Props {
  /** 已附加累计里程与外胎状态的单车列表 */
  bikes: BikeWithStatus[]
  onSave: (bike: Bike) => void
  onRemove: (id: string) => void
}

interface Draft {
  id?: string
  name: string
  category: BikeCategoryId
  tireTypeId: string
  tireInstalledAt: string
  tireStartKm: string
  notes: string
}

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const emptyDraft = (): Draft => ({
  name: '',
  category: 'road',
  tireTypeId: 'road-clincher',
  tireInstalledAt: todayLocal(),
  tireStartKm: '0',
  notes: '',
})

const BAR_COLOR: Record<string, string> = {
  ok: 'bg-emerald-400/80',
  soon: 'bg-amber-400/90',
  expired: 'bg-red-400/90',
}

/** 单车与轮胎管理:类别、自定义名称、外胎类型与寿命跟踪(超期提醒检查外胎) */
export default function ManageBikes({ bikes, onSave, onRemove }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')

  const startEdit = (b: BikeWithStatus) => {
    setDraft({
      id: b.id,
      name: b.name,
      category: b.category,
      tireTypeId: b.tireTypeId,
      tireInstalledAt: b.tireInstalledAt,
      tireStartKm: String(b.tireStartKm),
      notes: b.notes ?? '',
    })
    setError('')
  }

  const submit = () => {
    if (!draft) return
    const name = draft.name.trim()
    if (!name) {
      setError('请填写单车名称')
      return
    }
    const startKm = parseFloat(draft.tireStartKm)
    const existing = draft.id ? bikes.find((b) => b.id === draft.id) : undefined
    onSave({
      id: draft.id ?? `bike_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      category: draft.category,
      tireTypeId: draft.tireTypeId,
      tireInstalledAt: draft.tireInstalledAt || todayLocal(),
      tireStartKm: Number.isFinite(startKm) && startKm > 0 ? Math.round(startKm * 10) / 10 : 0,
      notes: draft.notes.trim() || undefined,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    })
    setDraft(null)
    setError('')
  }

  /** 换胎:把外胎安装里程重置为当前累计里程,寿命重新计算 */
  const quickRetire = (b: BikeWithStatus) => {
    if (!confirm(`为「${b.name}」换上新外胎?\n外胎安装里程将重置为当前累计里程 ${b.totalKm} km。`)) return
    onSave({ ...b, tireInstalledAt: todayLocal(), tireStartKm: b.totalKm, updatedAt: Date.now() })
  }

  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-300">
          <BikeIcon className="h-4 w-4 text-sky-400" aria-hidden="true" />
          单车与轮胎管理
        </span>
        <span className="hidden text-[11px] text-slate-500 sm:inline">
          外胎寿命为各类别的建议更换里程,超过后会提醒检查外胎状态
        </span>
        {!draft && (
          <button type="button" className="btn-primary ml-auto !py-1.5" onClick={() => { setDraft(emptyDraft()); setError('') }}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            添加单车
          </button>
        )}
      </div>

      {/* 新增/编辑表单 */}
      {draft && (
        <div className="mb-4 space-y-3 rounded-xl border border-sky-400/20 bg-sky-400/5 p-4">
          <div className="text-xs font-medium text-slate-300">{draft.id ? '编辑单车' : '添加单车'}</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="field-label">单车名称 *</label>
              <input
                className="field-input"
                placeholder="如 小蓝 / 大闪电"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus
              />
            </div>
            <div>
              <label className="field-label">单车类别</label>
              <select
                className="field-input"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as BikeCategoryId })}
              >
                {Object.entries(BIKE_CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">外胎类型(建议寿命)</label>
              <select
                className="field-input"
                value={draft.tireTypeId}
                onChange={(e) => setDraft({ ...draft, tireTypeId: e.target.value })}
              >
                {TIRE_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}(建议 {t.lifeKm} km)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">外胎安装日期</label>
              <input
                type="date"
                className="field-input"
                value={draft.tireInstalledAt}
                onChange={(e) => setDraft({ ...draft, tireInstalledAt: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">安装时单车累计里程 (km)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                className="field-input"
                value={draft.tireStartKm}
                onChange={(e) => setDraft({ ...draft, tireStartKm: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">备注</label>
              <input
                className="field-input"
                placeholder="可选"
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-300">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={submit}>
              保存
            </button>
            <button type="button" className="btn-ghost" onClick={() => { setDraft(null); setError('') }}>
              取消
            </button>
          </div>
        </div>
      )}

      {/* 单车列表 */}
      {bikes.length === 0 && !draft ? (
        <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-white/15 text-sm text-slate-500">
          还没有添加单车 — 添加后在记录骑行时可以选择单车,并跟踪外胎寿命
        </div>
      ) : (
        bikes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">名称</th>
                  <th className="px-3 py-2 font-medium">类别</th>
                  <th className="px-3 py-2 font-medium">外胎</th>
                  <th className="px-3 py-2 font-medium">累计里程</th>
                  <th className="px-3 py-2 font-medium">外胎寿命</th>
                  <th className="px-3 py-2 font-medium">状态</th>
                  <th className="px-3 py-2 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {bikes.map((b) => {
                  const tire = b.tire
                  const level = tire?.level ?? 'ok'
                  const statusText =
                    level === 'expired'
                      ? `已超期 ${Math.round(Math.abs(tire!.remainingKm))} km,请注意检查外胎状态`
                      : level === 'soon'
                        ? `接近寿命,还剩 ${Math.round(tire!.remainingKm)} km`
                        : `还剩 ${Math.round(tire!.remainingKm)} km`
                  return (
                    <tr key={b.id} className="border-b border-white/5">
                      <td className="px-3 py-2.5 font-medium text-slate-100">{b.name}</td>
                      <td className="px-3 py-2.5 text-slate-400">{BIKE_CATEGORIES[b.category]}</td>
                      <td className="px-3 py-2.5 text-slate-400">
                        {findTireType(b.tireTypeId)?.name ?? '—'}
                        <span className="ml-1 text-[10px] text-slate-600">装于 {b.tireInstalledAt}</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{b.totalKm} km</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                            <span
                              className={`block h-full rounded-full ${BAR_COLOR[level]}`}
                              style={{ width: `${Math.min(100, (tire?.ratio ?? 0) * 100)}%` }}
                            />
                          </span>
                          <span className="whitespace-nowrap text-xs text-slate-400">
                            {Math.round(tire?.usedKm ?? 0)} / {tire?.lifeKm ?? '—'} km
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <span
                          className={
                            level === 'expired'
                              ? 'font-medium text-red-300'
                              : level === 'soon'
                                ? 'text-amber-300'
                                : 'text-slate-400'
                          }
                        >
                          {statusText}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            className="rounded-md px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-400/10"
                            title="把外胎安装里程重置为当前累计里程"
                            onClick={() => quickRetire(b)}
                          >
                            <RefreshCcw className="mr-1 inline h-3 w-3" aria-hidden="true" />
                            换胎
                          </button>
                          <button
                            type="button"
                            className="rounded-md px-2 py-1 text-xs text-sky-300 hover:bg-sky-400/10"
                            onClick={() => startEdit(b)}
                          >
                            <Pencil className="mr-1 inline h-3 w-3" aria-hidden="true" />
                            编辑
                          </button>
                          <button
                            type="button"
                            className="rounded-md px-2 py-1 text-xs text-red-300 hover:bg-red-400/10"
                            onClick={() => {
                              if (confirm(`删除单车「${b.name}」?\n历史骑行记录会保留,只是不再关联这辆车。`)) onRemove(b.id)
                            }}
                          >
                            <Trash2 className="mr-1 inline h-3 w-3" aria-hidden="true" />
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </section>
  )
}

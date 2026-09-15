import { useRef, useState } from 'react'
import { Download, HardDriveDownload, Upload } from 'lucide-react'
import type { Bike, DayCheckIn, RideRecord } from '../types'
import Toast, { type ToastMessage } from './Toast'

export interface BackupPayload {
  app: string
  version: number
  exportedAt: string
  rides: RideRecord[]
  bikes: Bike[]
  days: DayCheckIn[]
}

interface Props {
  rides: RideRecord[]
  bikes: Bike[]
  days: DayCheckIn[]
  /** 导入(合并同 id 记录);返回实际写入的条数 */
  onImport: (payload: BackupPayload) => Promise<{ rides: number; bikes: number; days: number }>
}

function todayStamp(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 数据备份与恢复:把骑行记录、单车与打卡数据整体导出为 JSON,或从备份文件恢复。
 * 用于更换设备、重装浏览器或长期归档(应用本身的数据只存在本地浏览器里)。
 */
export default function DataBackup({ rides, bikes, days, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)

  const exportAll = () => {
    const payload: BackupPayload = {
      app: 'cycling-dashboard',
      version: 1,
      exportedAt: new Date().toISOString(),
      rides,
      bikes,
      days,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `骑行看板数据备份_${todayStamp()}.json`
    a.click()
    URL.revokeObjectURL(url)
    setToast({
      id: Date.now(),
      type: 'success',
      message: `已导出 ${rides.length} 条记录、${bikes.length} 辆车、${days.length} 条打卡`,
    })
  }

  const handleFile = async (file: File) => {
    setBusy(true)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as Partial<BackupPayload>
      const inRides = Array.isArray(parsed.rides) ? parsed.rides : []
      const inBikes = Array.isArray(parsed.bikes) ? parsed.bikes : []
      const inDays = Array.isArray(parsed.days) ? parsed.days : []
      if (inRides.length + inBikes.length + inDays.length === 0) {
        throw new Error('备份文件里没有可导入的数据')
      }
      const ok = confirm(
        `将导入:${inRides.length} 条骑行记录、${inBikes.length} 辆车、${inDays.length} 条打卡。\n` +
          '同 ID 的记录会被覆盖,其余保持不变。是否继续?'
      )
      if (!ok) return
      const written = await onImport({ app: 'cycling-dashboard', version: 1, exportedAt: parsed.exportedAt ?? '', rides: inRides, bikes: inBikes, days: inDays })
      setToast({
        id: Date.now(),
        type: 'success',
        message: `已导入 ${written.rides} 条记录、${written.bikes} 辆车、${written.days} 条打卡`,
      })
    } catch (err) {
      setToast({
        id: Date.now(),
        type: 'error',
        message: `导入失败:${err instanceof Error ? err.message : String(err)}`,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold tracking-wide text-slate-300">
        <span className="flex items-center gap-2">
          <HardDriveDownload className="h-4 w-4 text-sky-400" aria-hidden="true" />
          数据备份与恢复
        </span>
        <span className="text-xs font-normal text-slate-500">
          当前 {rides.length} 条记录 · {bikes.length} 辆车 · {days.length} 条打卡
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" onClick={exportAll}>
          <Download className="h-4 w-4" aria-hidden="true" />
          导出全部数据(JSON)
        </button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" aria-hidden="true" />
          {busy ? '导入中…' : '从备份恢复'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ''
          }}
        />
      </div>

      <p className="mt-2 text-[11px] leading-5 text-slate-500">
        应用数据仅保存在当前浏览器中,清除浏览器数据会一并丢失。更换设备或浏览器前请先导出备份;
        导入采用合并方式(同 ID 覆盖),不会删除备份文件之外的数据。
      </p>

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </section>
  )
}

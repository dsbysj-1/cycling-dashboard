import { memo, useRef, useState } from 'react'
import { Download, HardDriveDownload, Upload } from 'lucide-react'
import type { Bike, DayCheckIn, RideRecord } from '../types'
import { createBackup, parseBackup, type ImportSummary } from '../utils/backup'
import Toast, { type ToastMessage } from './Toast'

interface Props {
  rides: RideRecord[]
  bikes: Bike[]
  days: DayCheckIn[]
  /** 导入(合并同 id 记录);入参已完成校验与归一化,返回实际写入的条数 */
  onImport: (summary: ImportSummary) => Promise<{ rides: number; bikes: number; days: number }>
}

function todayStamp(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 数据备份与恢复:把骑行记录、单车与打卡数据整体导出为 JSON,或从备份文件恢复。
 * 用于更换设备、重装浏览器或长期归档(应用本身的数据只存在本地浏览器里)。
 * 导入前会逐条校验并归一化,格式不合法的记录会被跳过并明确告知,不会污染现有数据。
 */
function DataBackup({ rides, bikes, days, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)

  const exportAll = () => {
    const payload = createBackup(rides, bikes, days)
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
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('文件不是合法的 JSON,可能已损坏')
      }

      const result = parseBackup(parsed)
      if (!result.ok) throw new Error(result.error)

      const { summary } = result
      const skippedTotal = summary.skipped.rides + summary.skipped.bikes + summary.skipped.days
      const skippedNote = skippedTotal > 0
        ? `\n其中 ${skippedTotal} 条数据格式不合法,将被跳过` +
          `(记录 ${summary.skipped.rides} · 单车 ${summary.skipped.bikes} · 打卡 ${summary.skipped.days})。`
        : ''

      const ok = confirm(
        `将导入:${summary.rides.length} 条骑行记录、${summary.bikes.length} 辆车、${summary.days.length} 条打卡。` +
          `${skippedNote}\n同 ID 的记录会被覆盖,其余保持不变。是否继续?`
      )
      if (!ok) return

      const written = await onImport(summary)
      setToast({
        id: Date.now(),
        type: skippedTotal > 0 ? 'info' : 'success',
        message:
          `已导入 ${written.rides} 条记录、${written.bikes} 辆车、${written.days} 条打卡` +
          (skippedTotal > 0 ? `,跳过 ${skippedTotal} 条格式不合法数据` : ''),
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
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold tracking-wide text-t2">
        <span className="flex items-center gap-2">
          <HardDriveDownload className="h-4 w-4 text-accent-sky" aria-hidden="true" />
          数据备份与恢复
        </span>
        <span className="text-xs font-normal text-t4">
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

      <p className="mt-2 text-[11px] leading-5 text-t4">
        应用数据仅保存在当前浏览器中,清除浏览器数据会一并丢失。更换设备或浏览器前请先导出备份;
        导入采用合并方式(同 ID 覆盖),不会删除备份文件之外的数据,格式不合法或缺失的字段会被补齐或跳过。
      </p>

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </section>
  )
}

/** 该组件重渲染成本较高(图表计算 / 长列表),用 memo 避免父级状态变化时无谓重算 */
export default memo(DataBackup)

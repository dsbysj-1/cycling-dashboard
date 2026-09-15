import { RefreshCw, Watch } from 'lucide-react'
import { useHuaweiSync } from '../hooks/useHuaweiSync'
import type { HuaweiRideMock } from '../utils/huaweiMock'

interface Props {
  /** 同步成功后回调,由父组件把数据填入表单 */
  onSynced: (data: HuaweiRideMock) => void
  /** 同步失败时回调,用于弹出 Toast */
  onError: (message: string) => void
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * 同步华为手表数据(当前为本地模拟数据)。
 * 含连接状态指示器与同步结果摘要;真实接口见 utils/huaweiMock.ts 的 TODO 说明。
 */
export default function HuaweiSyncButton({ onSynced, onError }: Props) {
  const { syncing, connected, lastSyncedAt, data, sync } = useHuaweiSync()

  const handleClick = async () => {
    const result = await sync()
    if (result) {
      onSynced(result)
      return
    }
    onError('同步失败，请稍后重试')
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={syncing}
        className="btn-primary"
        title="当前阶段为本地模拟数据，Health Kit 权限审核通过后自动切换为真实接口"
      >
        {syncing ? (
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Watch className="h-4 w-4" aria-hidden="true" />
        )}
        {syncing ? '同步中…' : '同步华为手表数据'}
      </button>

      {/* 连接状态指示器 */}
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-fill px-2.5 py-1 text-[11px] text-t2">
        <span
          className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-accent-emerald' : 'bg-t5'}`}
          aria-hidden="true"
        />
        {connected ? '已连接' : '未连接'}
        {connected && lastSyncedAt != null && <span className="text-t4">· {formatTime(lastSyncedAt)} 同步</span>}
      </span>

      {data && (
        <span className="text-[11px] text-t4">
          上次：{data.distance} km · {data.duration} 分钟 · 爬升 {data.elevationGain} m
        </span>
      )}
    </div>
  )
}

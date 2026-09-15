import { useCallback, useState } from 'react'
import { fetchHuaweiRideData, type HuaweiRideMock, type HuaweiSyncOptions } from '../utils/huaweiMock'

export type HuaweiSyncStatus = 'idle' | 'syncing' | 'success' | 'error'

export interface HuaweiSyncState {
  status: HuaweiSyncStatus
  syncing: boolean
  /** 是否已连接(成功同步过一次即视为已配对) */
  connected: boolean
  /** 最近一次同步成功的时间戳 */
  lastSyncedAt: number | null
  /** 最近一次同步到的数据 */
  data: HuaweiRideMock | null
  error: string
  /** 触发同步:成功返回数据,失败返回 null(错误信息在 error 中) */
  sync: (options?: HuaweiSyncOptions) => Promise<HuaweiRideMock | null>
  /** 重置为未同步状态 */
  reset: () => void
}

/**
 * 华为手表数据同步状态管理。
 * 目前底层是本地模拟数据(见 utils/huaweiMock.ts),接入真实接口后本 Hook 无需改动。
 */
export function useHuaweiSync(): HuaweiSyncState {
  const [status, setStatus] = useState<HuaweiSyncStatus>('idle')
  const [connected, setConnected] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const [data, setData] = useState<HuaweiRideMock | null>(null)
  const [error, setError] = useState('')

  const sync = useCallback(async (options?: HuaweiSyncOptions) => {
    setStatus('syncing')
    setError('')
    try {
      const result = await fetchHuaweiRideData(options)
      setData(result)
      setConnected(true)
      setLastSyncedAt(Date.now())
      setStatus('success')
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : '同步失败，请稍后重试')
      setStatus('error')
      return null
    }
  }, [])

  const reset = useCallback(() => {
    setStatus('idle')
    setError('')
  }, [])

  return { status, syncing: status === 'syncing', connected, lastSyncedAt, data, error, sync, reset }
}

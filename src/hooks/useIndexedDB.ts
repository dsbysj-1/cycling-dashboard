import { useCallback, useEffect, useState } from 'react'
import type { Bike, DayCheckIn, RideRecord } from '../types'

const DB_NAME = 'cycling-dashboard'
const DB_VERSION = 3
const RIDES_STORE = 'rides'
const BIKES_STORE = 'bikes'
const DAYS_STORE = 'days'
const LS_RIDES = 'cycling-dashboard:rides'
const LS_BIKES = 'cycling-dashboard:bikes'
const LS_DAYS = 'cycling-dashboard:days'

type StorageMode = 'indexeddb' | 'localstorage'

/** 写入失败(配额不足、存储被禁用等):界面据此提示用户导出备份 */
export class StorageWriteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageWriteError'
  }
}

function describeError(err: unknown): string {
  if (err instanceof StorageWriteError) return err.message
  if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
    return '本地存储空间已满,请先导出备份并清理旧记录'
  }
  return err instanceof Error ? err.message : String(err)
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB 不可用'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(RIDES_STORE)) {
        db.createObjectStore(RIDES_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(BIKES_STORE)) {
        db.createObjectStore(BIKES_STORE, { keyPath: 'id' })
      }
      // v3:每日骑行打卡
      if (!db.objectStoreNames.contains(DAYS_STORE)) {
        db.createObjectStore(DAYS_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'))
  })
  // 数据库连接意外失效时允许下次重新打开
  dbPromise.catch(() => {
    dbPromise = null
  })
  return dbPromise
}

function tx<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode)
        const request = run(transaction.objectStore(storeName))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB 操作失败'))
      })
  )
}

/** 单事务批量写入:整体成功或整体回滚,避免出现「导入一半」的中间状态 */
function txPutMany<T>(storeName: string, items: T[]): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        if (items.length === 0) {
          resolve()
          return
        }
        const transaction = db.transaction(storeName, 'readwrite')
        const store = transaction.objectStore(storeName)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB 批量写入失败'))
        transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB 批量写入被中止'))
        for (const item of items) store.put(item)
      })
  )
}

/* ---------------- localStorage 降级实现 ---------------- */

function lsRead<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]') as T[]
  } catch {
    return []
  }
}

function lsWrite(key: string, items: unknown[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items))
  } catch (err) {
    // 配额不足或隐私模式下不可用,必须显式抛出:否则保存会静默失败
    throw new StorageWriteError(describeError(err))
  }
}

/* ---------------- 统一存储接口 ---------------- */

interface StoreApi<T extends { id: string }> {
  getAll(): Promise<T[]>
  put(item: T): Promise<void>
  putMany(items: T[]): Promise<void>
  remove(id: string): Promise<void>
}

function makeStore<T extends { id: string }>(storeName: string, lsKey: string): StoreApi<T> {
  return {
    async getAll(): Promise<T[]> {
      if (dbPromise === null && typeof indexedDB !== 'undefined') openDB()
      if (dbPromise) {
        try {
          return await tx<T[]>(storeName, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
        } catch {
          // 打开/读写失败则降级
          dbPromise = null
        }
      }
      return lsRead<T>(lsKey)
    },

    async put(item: T): Promise<void> {
      if (dbPromise) {
        try {
          await tx(storeName, 'readwrite', (s) => s.put(item))
          return
        } catch {
          dbPromise = null
        }
      }
      const items = lsRead<T>(lsKey).filter((x) => x.id !== item.id)
      items.push(item)
      lsWrite(lsKey, items)
    },

    async putMany(items: T[]): Promise<void> {
      if (dbPromise) {
        try {
          await txPutMany(storeName, items)
          return
        } catch {
          dbPromise = null
        }
      }
      const incoming = new Map(items.map((item) => [item.id, item]))
      const merged = lsRead<T>(lsKey).filter((x) => !incoming.has(x.id)).concat(items)
      lsWrite(lsKey, merged)
    },

    async remove(id: string): Promise<void> {
      if (dbPromise) {
        try {
          await tx(storeName, 'readwrite', (s) => s.delete(id))
          return
        } catch {
          dbPromise = null
        }
      }
      lsWrite(lsKey, lsRead<T>(lsKey).filter((x) => x.id !== id))
    },
  }
}

const rideSort = (a: RideRecord, b: RideRecord) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt
const bikeSort = (a: Bike, b: Bike) => a.createdAt - b.createdAt
const daySort = (a: DayCheckIn, b: DayCheckIn) => b.date.localeCompare(a.date)

export const ridesStore = makeStore<RideRecord>(RIDES_STORE, LS_RIDES)
export const bikesStore = makeStore<Bike>(BIKES_STORE, LS_BIKES)
export const daysStore = makeStore<DayCheckIn>(DAYS_STORE, LS_DAYS)

/* ---------------- 跨标签页同步 ---------------- */

/**
 * 同一浏览器开多个标签页时,任一页写入后通知其它页重新读取,
 * 避免「A 页看不到 B 页刚存的记录」以及两边各自覆盖。
 * BroadcastChannel 不把消息投递给发送者自己,所以不会打断本页的乐观更新。
 */
const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('cycling-dashboard') : null

/* ---------------- React Hook ---------------- */

/** 合并写入:同 id 覆盖,并保持排序 */
function mergeSorted<T extends { id: string }>(prev: T[], incoming: T[], sortFn: (a: T, b: T) => number): T[] {
  if (incoming.length === 0) return prev
  const map = new Map(prev.map((item) => [item.id, item]))
  for (const item of incoming) map.set(item.id, item)
  return Array.from(map.values()).sort(sortFn)
}

function useCollection<T extends { id: string }>(store: StoreApi<T>, sortFn: (a: T, b: T) => number) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<StorageMode | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await store.getAll())
      setMode(dbPromise !== null ? 'indexeddb' : 'localstorage')
    } finally {
      setLoading(false)
    }
  }, [store])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 其它标签页写入后同步(本页自己的写入不会触发)
  useEffect(() => {
    if (!channel) return
    const onMessage = () => void refresh()
    channel.addEventListener('message', onMessage)
    return () => channel.removeEventListener('message', onMessage)
  }, [refresh])

  /**
   * 写入统一走「乐观更新 + 失败回滚」:
   * 先就地更新本地状态(界面立即响应,不再整表重读),写入失败时提示原因并重新拉取真实数据。
   */
  const run = useCallback(
    async (optimistic: (prev: T[]) => T[], persist: () => Promise<void>) => {
      setItems(optimistic)
      try {
        await persist()
        setError(null)
        channel?.postMessage('changed')
      } catch (err) {
        setError(describeError(err))
        void refresh()
      }
    },
    [refresh]
  )

  const save = useCallback(
    (item: T) => run((prev) => mergeSorted(prev, [item], sortFn), () => store.put(item)),
    [run, sortFn, store]
  )

  /** 批量写入(数据恢复用):单事务落库,写完只合并一次状态 */
  const saveMany = useCallback(
    (items: T[]) => run((prev) => mergeSorted(prev, items, sortFn), () => store.putMany(items)),
    [run, sortFn, store]
  )

  const remove = useCallback(
    (id: string) => run((prev) => prev.filter((item) => item.id !== id), () => store.remove(id)),
    [run, store]
  )

  return { items, loading, mode, error, clearError: () => setError(null), save, saveMany, remove, refresh }
}

/** 骑行记录存储:优先 IndexedDB,不可用时自动降级 localStorage */
export function useRides() {
  const { items, loading, mode, error, clearError, save, saveMany, remove, refresh } = useCollection(
    ridesStore,
    rideSort
  )
  return { rides: items, loading, mode, error, clearError, save, saveMany, remove, refresh }
}

/** 单车存储(与骑行记录同一个 IndexedDB 库,v2 新增 bikes 表) */
export function useBikes() {
  const { items, loading, error, clearError, save, saveMany, remove, refresh } = useCollection(bikesStore, bikeSort)
  return { bikes: items, loading, error, clearError, save, saveMany, remove, refresh }
}

/** 每日骑行打卡存储(v3 新增 days 表) */
export function useDays() {
  const { items, loading, error, clearError, save, saveMany, remove, refresh } = useCollection(daysStore, daySort)
  return { days: items, loading, error, clearError, save, saveMany, remove, refresh }
}

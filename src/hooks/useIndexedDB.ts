import { useCallback, useEffect, useState } from 'react'
import type { RideRecord } from '../types'

const DB_NAME = 'cycling-dashboard'
const DB_VERSION = 1
const STORE_NAME = 'rides'
const LS_KEY = 'cycling-dashboard:rides'

type StorageMode = 'indexeddb' | 'localstorage'

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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
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

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode)
        const request = run(transaction.objectStore(STORE_NAME))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB 操作失败'))
      })
  )
}

/* ---------------- localStorage 降级实现 ---------------- */

function lsRead(): RideRecord[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as RideRecord[]
  } catch {
    return []
  }
}

function lsWrite(records: RideRecord[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(records))
}

/* ---------------- 统一存储接口 ---------------- */

export const ridesStore = {
  async getAll(): Promise<RideRecord[]> {
    if (dbPromise === null && typeof indexedDB !== 'undefined') openDB()
    if (dbPromise) {
      try {
        const records = await tx<RideRecord[]>('readonly', (s) => s.getAll() as IDBRequest<RideRecord[]>)
        return records.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
      } catch {
        // 打开/读写失败则降级
        dbPromise = null
      }
    }
    return lsRead().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  },

  async put(record: RideRecord): Promise<void> {
    if (dbPromise) {
      try {
        await tx('readwrite', (s) => s.put(record))
        return
      } catch {
        dbPromise = null
      }
    }
    const records = lsRead().filter((r) => r.id !== record.id)
    records.push(record)
    lsWrite(records)
  },

  async remove(id: string): Promise<void> {
    if (dbPromise) {
      try {
        await tx('readwrite', (s) => s.delete(id))
        return
      } catch {
        dbPromise = null
      }
    }
    lsWrite(lsRead().filter((r) => r.id !== id))
  },
}

/**
 * 骑行记录存储 Hook:优先 IndexedDB,不可用时自动降级 localStorage。
 * 返回记录列表、加载状态与增删改方法。
 */
export function useRides() {
  const [rides, setRides] = useState<RideRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<StorageMode | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const all = await ridesStore.getAll()
      setRides(all)
      setMode(dbPromise !== null ? 'indexeddb' : 'localstorage')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const save = useCallback(
    async (record: RideRecord) => {
      await ridesStore.put(record)
      await refresh()
    },
    [refresh]
  )

  const remove = useCallback(
    async (id: string) => {
      await ridesStore.remove(id)
      await refresh()
    },
    [refresh]
  )

  return { rides, loading, mode, save, remove, refresh }
}

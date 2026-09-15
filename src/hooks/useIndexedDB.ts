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

/* ---------------- localStorage 降级实现 ---------------- */

function lsRead<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]') as T[]
  } catch {
    return []
  }
}

function lsWrite(key: string, items: unknown[]): void {
  localStorage.setItem(key, JSON.stringify(items))
}

/* ---------------- 统一存储接口 ---------------- */

interface StoreApi<T extends { id: string }> {
  getAll(): Promise<T[]>
  put(item: T): Promise<void>
  remove(id: string): Promise<void>
}

function makeStore<T extends { id: string }>(
  storeName: string,
  lsKey: string,
  sortFn: (a: T, b: T) => number
): StoreApi<T> {
  return {
    async getAll(): Promise<T[]> {
      if (dbPromise === null && typeof indexedDB !== 'undefined') openDB()
      if (dbPromise) {
        try {
          const items = await tx<T[]>(storeName, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
          return items.sort(sortFn)
        } catch {
          // 打开/读写失败则降级
          dbPromise = null
        }
      }
      return lsRead<T>(lsKey).sort(sortFn)
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

export const ridesStore = makeStore<RideRecord>(RIDES_STORE, LS_RIDES, rideSort)
export const bikesStore = makeStore<Bike>(BIKES_STORE, LS_BIKES, bikeSort)
export const daysStore = makeStore<DayCheckIn>(DAYS_STORE, LS_DAYS, daySort)

/* ---------------- React Hook ---------------- */

function useCollection<T extends { id: string }>(store: StoreApi<T>) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<StorageMode | null>(null)

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

  const save = useCallback(
    async (item: T) => {
      await store.put(item)
      await refresh()
    },
    [refresh, store]
  )

  const remove = useCallback(
    async (id: string) => {
      await store.remove(id)
      await refresh()
    },
    [refresh, store]
  )

  return { items, loading, mode, save, remove, refresh }
}

/** 骑行记录存储:优先 IndexedDB,不可用时自动降级 localStorage */
export function useRides() {
  const { items, loading, mode, save, remove, refresh } = useCollection(ridesStore)
  return { rides: items, loading, mode, save, remove, refresh }
}

/** 单车存储(与骑行记录同一个 IndexedDB 库,v2 新增 bikes 表) */
export function useBikes() {
  const { items, loading, mode, save, remove, refresh } = useCollection(bikesStore)
  return { bikes: items, loading, mode, save, remove, refresh }
}

/** 每日骑行打卡存储(v3 新增 days 表) */
export function useDays() {
  const { items, loading, mode, save, remove, refresh } = useCollection(daysStore)
  return { days: items, loading, mode, save, remove, refresh }
}

import { useEffect, useState } from 'react'
import AMapLoader from '@amap/amap-jsapi-loader'

export const AMAP_KEY = import.meta.env.VITE_AMAP_KEY as string | undefined
const AMAP_SECURITY_CODE = import.meta.env.VITE_AMAP_SECURITY_CODE as string | undefined

/** 需要的插件:鼠标工具(手绘)、骑行路径规划、POI 搜索、输入提示、逆地理编码(反查起点城市) */
const PLUGINS = ['AMap.MouseTool', 'AMap.Riding', 'AMap.PlaceSearch', 'AMap.AutoComplete', 'AMap.Geocoder']

declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode: string }
  }
}

export type AmapStatus = 'loading' | 'ready' | 'nokey' | 'error'

let amapPromise: Promise<any> | null = null

/** 加载高德 JS API:全局只加载一次,地图与路线规划共享同一实例 */
export function loadAmap(): Promise<any> {
  if (!AMAP_KEY) return Promise.reject(new Error('未配置高德地图 Key'))
  if (!amapPromise) {
    // 2021-12 后申请的 Key 必须配置安全密钥,否则地图与路径规划服务都会拒绝请求
    if (AMAP_SECURITY_CODE) window._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_CODE }
    amapPromise = AMapLoader.load({ key: AMAP_KEY, version: '2.0', plugins: PLUGINS }).catch((err) => {
      amapPromise = null // 失败后允许重试
      throw err
    })
  }
  return amapPromise
}

/** 组件内使用:返回 AMap 命名空间与加载状态(加载中 / 就绪 / 未配置 Key / 加载失败) */
export function useAmap() {
  const [amap, setAmap] = useState<any>(null)
  const [status, setStatus] = useState<AmapStatus>(AMAP_KEY ? 'loading' : 'nokey')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!AMAP_KEY) return
    let cancelled = false
    loadAmap()
      .then((ns) => {
        if (cancelled) return
        setAmap(ns)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { amap, status, error }
}

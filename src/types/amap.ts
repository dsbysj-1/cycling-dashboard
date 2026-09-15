/**
 * 高德 JS API 的最小类型声明(只覆盖本项目实际用到的部分)。
 *
 * 官方没有提供 TS 类型,这里手写子集作为 SDK 与应用的唯一交界:
 * 好处是这几处不再需要 `any` 放行,字段名写错或 SDK 返回结构变化时编译期就能发现。
 * 新增用到的 API 时请在此补充,不要退回 `any`。
 */

/** 经纬度输入:高德接口同时接受 LngLat 实例、[lng, lat] 数组,POI 里也常见 {lng, lat} 对象 */
export type AMapLngLatInput =
  | [number, number]
  | { lng: number; lat: number }
  | { getLng(): number; getLat(): number }

/** LngLat 实例 */
export interface AMapLngLat {
  getLng(): number
  getLat(): number
}

/** 地图事件:点击事件带 lnglat,绘制事件带 obj(MouseTool 产出的覆盖物) */
export interface AMapMapEvent {
  lnglat?: AMapLngLatInput
  obj?: { getPath?(): AMapLngLatInput[] }
}

/** 地图上的覆盖物(折线 / 圆点 / 标记):应用只做增删,不读它的属性 */
export type AMapOverlay = object

export interface AMapMap {
  add(overlay: AMapOverlay | AMapOverlay[]): void
  remove(overlay: AMapOverlay | AMapOverlay[]): void
  setFitView(overlays?: AMapOverlay[], immediately?: boolean, avoid?: number[]): void
  setMapStyle(style: string): void
  setCenter(center: AMapLngLatInput, immediately?: boolean): void
  setDefaultCursor(cursor: string): void
  on(event: string, handler: (event: AMapMapEvent) => void): void
  off(event: string, handler: (event: AMapMapEvent) => void): void
  destroy(): void
}

export interface AMapMouseTool {
  polyline(options: Record<string, unknown>): void
  on(event: string, handler: (event: AMapMapEvent) => void): void
  off(event: string, handler: (event: AMapMapEvent) => void): void
  close(removeOverlays?: boolean): void
}

/* ---------------- 服务回调结果 ---------------- */

/** 服务类接口(搜索/规划/逆地理编码)的回调结果都带 info / infocode */
export interface AMapServiceResult {
  info?: string
  infocode?: string
}

export interface GeocoderAddressComponent {
  adcode?: string | number
  province?: string
  city?: string
  district?: string
  street?: string
  streetNumber?: string
}

export interface GeocoderPoi {
  name?: string
  address?: string
}

export interface GeocoderRegeocode {
  addressComponent?: GeocoderAddressComponent
  pois?: GeocoderPoi[]
  formattedAddress?: string
}

export interface GeocoderResult extends AMapServiceResult {
  regeocode?: GeocoderRegeocode
}

export interface PlaceSearchPoi {
  id?: string
  name?: string
  address?: string
  location?: AMapLngLatInput
  distance?: string | number
}

export interface PlaceSearchResult extends AMapServiceResult {
  poiList?: { pois?: PlaceSearchPoi[] }
}

/** 骑行规划结果的路径分段(高德把一条骑行路线拆成若干 rides,每段有自己的 path) */
export interface RidingStep {
  path?: AMapLngLatInput[]
}

export interface RidingRoute {
  /** 距离,米 */
  distance: number
  /** 预计耗时,秒 */
  time: number
  path?: AMapLngLatInput[]
  rides?: RidingStep[]
}

export interface RidingResult extends AMapServiceResult {
  routes?: RidingRoute[]
}

export interface AutoCompleteTip {
  id?: string
  name?: string
  district?: string
  address?: string
  location?: AMapLngLatInput
}

export interface AutoCompleteResult extends AMapServiceResult {
  tips?: AutoCompleteTip[]
}

/* ---------------- 服务类 ---------------- */

export interface AMapGeocoder {
  getAddress(
    location: AMapLngLatInput,
    callback: (status: string, result: GeocoderResult) => void
  ): void
}

export interface AMapPlaceSearch {
  search(keyword: string, callback: (status: string, result: PlaceSearchResult) => void): void
  searchNearBy(
    keyword: string,
    center: AMapLngLatInput,
    radius: number,
    callback: (status: string, result: PlaceSearchResult) => void
  ): void
}

export interface AMapRiding {
  search(
    origin: AMapLngLatInput,
    destination: AMapLngLatInput,
    callback: (status: string, result: RidingResult) => void
  ): void
}

export interface AMapAutoComplete {
  search(keyword: string, callback: (status: string, result: AutoCompleteResult) => void): void
}

/**
 * AMap 命名空间:由 @amap/amap-jsapi-loader 加载后返回。
 * 构造参数统一用 Record<string, unknown>,因为各 SDK 的 options 字段很多且与业务无关;
 * 真正需要约束的是「回调结果」的结构,所以那部分做了完整声明。
 */
export interface AMapNamespace {
  LngLat: new (lng: number, lat: number) => AMapLngLat
  Map: new (container: HTMLElement | string, options?: Record<string, unknown>) => AMapMap
  Polyline: new (options: Record<string, unknown>) => AMapOverlay
  CircleMarker: new (options: Record<string, unknown>) => AMapOverlay
  Marker: new (options: Record<string, unknown>) => AMapOverlay
  MouseTool: new (map: AMapMap) => AMapMouseTool
  Geocoder: new (options?: Record<string, unknown>) => AMapGeocoder
  PlaceSearch: new (options?: Record<string, unknown>) => AMapPlaceSearch
  Riding: new (options?: Record<string, unknown>) => AMapRiding
  AutoComplete: new (options?: Record<string, unknown>) => AMapAutoComplete
}

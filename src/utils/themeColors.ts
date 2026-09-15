/**
 * 读取主题 CSS 变量,用于必须传「颜色字符串」的场景(高德地图的样式参数等)。
 *
 * SVG 展示属性不支持 var(),所以图表请优先用 index.css 里的 .chart-* / .score-* 类;
 * 只有高德 SDK 这类只接受颜色字符串的接口,才需要这个函数。
 */
export function themeColor(varName: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  return value || fallback
}

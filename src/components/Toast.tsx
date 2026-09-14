import { useEffect } from 'react'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastMessage {
  id: number
  message: string
  type: ToastType
}

interface Props {
  toast: ToastMessage
  onClose: () => void
  /** 自动关闭时间(毫秒) */
  duration?: number
}

const STYLES: Record<ToastType, { box: string; icon: string }> = {
  success: { box: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200', icon: 'text-emerald-300' },
  error: { box: 'border-red-400/30 bg-red-500/15 text-red-200', icon: 'text-red-300' },
  info: { box: 'border-sky-400/30 bg-sky-500/15 text-sky-200', icon: 'text-sky-300' },
}

/** 轻量 Toast:固定显示在窗口底部居中,自动消失,不引入额外的 UI 组件库 */
export default function Toast({ toast, onClose, duration = 2600 }: Props) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, duration)
    return () => window.clearTimeout(timer)
  }, [toast.id, duration, onClose])

  const style = STYLES[toast.type]
  const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertCircle : Info

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 px-4">
      <div
        role="status"
        aria-live="polite"
        className={`flex animate-toast-in items-center gap-2 rounded-xl border px-4 py-2.5 text-sm shadow-xl shadow-black/40 backdrop-blur ${style.box}`}
      >
        <Icon className={`h-4 w-4 shrink-0 ${style.icon}`} aria-hidden="true" />
        <span className="whitespace-nowrap">{toast.message}</span>
      </div>
    </div>
  )
}

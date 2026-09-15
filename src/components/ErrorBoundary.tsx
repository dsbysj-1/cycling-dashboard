import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * 错误边界:任何子组件抛错时给出可恢复的提示,而不是让整个应用白屏。
 * (例如地图/图表数据异常时,用户仍能查看历史记录并继续录入)
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[骑行看板] 渲染出错：', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-3xl p-6">
          <div className="rounded-2xl border border-red-400/30 bg-red-500/5 p-6">
            <h2 className="mb-2 text-base font-semibold text-red-300">页面出现异常</h2>
            <p className="mb-4 text-sm leading-6 text-slate-300">
              渲染过程中发生错误，已阻止白屏。本地数据仍保存在浏览器中，不会丢失。
            </p>
            <pre className="mb-4 max-h-40 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-red-200/90">
              {this.state.error.message}
            </pre>
            <div className="flex gap-2">
              <button type="button" className="btn-primary" onClick={() => this.setState({ error: null })}>
                尝试恢复
              </button>
              <button type="button" className="btn-ghost" onClick={() => window.location.reload()}>
                重新加载页面
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

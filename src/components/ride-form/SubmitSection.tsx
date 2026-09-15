import type { RideFormModel } from './useRideForm'

type Props = Pick<RideFormModel, 'notes' | 'setNotes' | 'preview' | 'isEdit' | 'handleSubmit'> & {
  onCancelEdit?: () => void
}

/** 备注 + 实时评分预览 + 保存(评分随表单字段变化即时重算) */
export default function SubmitSection({ notes, setNotes, preview, isEdit, handleSubmit, onCancelEdit }: Props) {
  return (
    <section className="space-y-3">
      <div>
        <label className="field-label">备注</label>
        <textarea
          rows={2}
          className="field-input resize-none"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="骑行感受、路线名等"
        />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-accent-sky/20 bg-accent-sky/5 px-4 py-3">
        <div className="text-sm">
          <span className="text-t3">评分预览：</span>
          <span className="ml-2 text-2xl font-bold text-accent-sky-text">{preview.scores.total}</span>
          <span className="ml-2 text-xs text-t3">
            天气 {preview.scores.weather} · 路线 {preview.scores.route} · 降雨指数 {preview.scores.rainFactor}(
            {preview.rainLabel})
          </span>
        </div>
        <div className="flex gap-2">
          {isEdit && (
            <button type="button" className="btn-ghost" onClick={onCancelEdit}>
              取消
            </button>
          )}
          <button type="button" className="btn-primary" onClick={handleSubmit}>
            {isEdit ? '保存修改' : '保存骑行记录'}
          </button>
        </div>
      </div>
    </section>
  )
}

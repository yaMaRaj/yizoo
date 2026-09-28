import { useEffect } from 'react'
import { useConfirmStore } from './confirm-store'

export function ConfirmDialog() {
  const open = useConfirmStore((s) => s.open)
  const title = useConfirmStore((s) => s.title)
  const message = useConfirmStore((s) => s.message)
  const confirmLabel = useConfirmStore((s) => s.confirmLabel)
  const cancelLabel = useConfirmStore((s) => s.cancelLabel)
  const danger = useConfirmStore((s) => s.danger)
  const close = useConfirmStore((s) => s.close)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
      if (e.key === 'Enter') close(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  return (
    <div className="modal-backdrop confirm-backdrop">
      <div className="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{title}</h2>
        <p className="confirm-message">{message}</p>
        <div className="form-actions">
          <button className="btn" type="button" onClick={() => close(false)}>
            {cancelLabel}
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            type="button"
            autoFocus
            onClick={() => close(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

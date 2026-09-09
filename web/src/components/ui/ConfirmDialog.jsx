import React, { useState } from 'react'
import Modal from './Modal'

/**
 * ConfirmDialog — the in-app replacement for `window.confirm`.
 *
 * `window.confirm` renders OS chrome in the middle of a styled app, can't show
 * a diff or a list, and blocks the thread. This is a headerless `ui/Modal` with
 * a title, a body, and two buttons.
 *
 * Props:
 *   isOpen, onClose
 *   title, children   what is about to happen
 *   confirmLabel      default "Confirm"
 *   destructive       styles the confirm button as .btn-danger
 *   onConfirm         may return a promise; the button shows a busy state and
 *                     the dialog closes on resolve, stays open on reject
 */
const ConfirmDialog = ({
  isOpen,
  onClose,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
}) => {
  const [busy, setBusy] = useState(false)

  const handleConfirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
      onClose()
    } catch {
      // The caller surfaces its own error; keep the dialog open so the action
      // can be retried or cancelled.
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <h3 className="text-lg font-bold text-gray-900">{title}</h3>
      <div className="mt-2 text-sm text-gray-600 space-y-2">{children}</div>
      <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button type="button" onClick={onClose} disabled={busy} className="btn-quiet">
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className={destructive ? 'btn-danger' : 'btn-primary'}
        >
          {busy ? 'Working...' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export default ConfirmDialog

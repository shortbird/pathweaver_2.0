import React, { useState } from 'react'
import { arrayOf, bool, func, number, shape, string } from 'prop-types'
import { toast } from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Spinner } from '../ui/Spinner'
import { useRequestSubjectMove, subjectMoveError } from '../../hooks/api/useSubjectCreditMoves'
import { xpLabel } from './xpLabels'

/**
 * "Move credit to another subject" on Courses and Credits (2026-10-02).
 *
 * A family asks; Optio approves or declines in the credit dashboard. Nothing
 * moves until then, so the copy says "ask", and the row shows "Move
 * requested" afterwards. `target` is either a quest that earned credit in
 * `from` (xp is that subject's share) or an own-curriculum course (kind
 * 'course': the whole course moves).
 *
 * The page keys this by its target, so each opening starts with an empty form.
 */
const MoveCreditModal = ({ isOpen, onClose, onRequested, target, subjects, studentId }) => {
  const [toSubject, setToSubject] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const requestMove = useRequestSubjectMove()

  if (!target) return null

  const saving = requestMove.isPending
  const choices = (subjects || []).filter((s) => s.key !== target.from.key)
  const toName = choices.find((s) => s.key === toSubject)?.name
  const isCourse = target.kind === 'course'

  const submit = async () => {
    if (!toSubject || saving) return
    setError(null)
    try {
      await requestMove.mutateAsync({
        quest_id: target.questId,
        from_subject: target.from.key,
        to_subject: toSubject,
        reason: reason.trim() || undefined,
        ...(studentId ? { student_id: studentId } : {}),
      })
      toast.success('Sent to Optio')
      onRequested?.()
      onClose()
    } catch (err) {
      setError(subjectMoveError(err, 'Could not send it. Please try again.'))
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => {} : onClose}
      closeOnOverlayClick={!saving}
      title="Move credit to another subject"
      size="md"
      footer={
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} disabled={saving} className="btn-quiet">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={!toSubject || saving} className="btn-primary">
            {saving && <Spinner size="sm" className="border-white" />}
            {saving ? 'Sending' : 'Send to Optio'}
          </button>
        </div>
      }
    >
      <p className="text-sm text-gray-700">
        <span className="font-semibold text-gray-900">{target.title}</span>
      </p>
      <p className="text-sm text-gray-600 mt-1">
        Optio looks at the request and moves the credit if it fits the new subject.
      </p>

      <label htmlFor="move-credit-subject" className="block text-sm font-medium text-gray-700 mt-4">
        Move to
      </label>
      <select
        id="move-credit-subject"
        value={toSubject}
        onChange={(e) => setToSubject(e.target.value)}
        className="input-field mt-1 w-full"
        disabled={saving}
      >
        <option value="">Pick a subject</option>
        {choices.map((s) => (
          <option key={s.key} value={s.key}>{s.name}</option>
        ))}
      </select>

      {toName && (
        <p className="text-sm text-gray-800 mt-3" data-testid="move-credit-summary">
          {isCourse
            ? `This course and its credit from ${target.from.name} to ${toName}`
            : `${xpLabel(target.xp)} from ${target.from.name} to ${toName}`}
        </p>
      )}

      <label htmlFor="move-credit-reason" className="block text-sm font-medium text-gray-700 mt-4">
        Why (optional)
      </label>
      <textarea
        id="move-credit-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={1000}
        rows={3}
        className="input-field mt-1 w-full"
        placeholder="For example: Archery is a sport, so it belongs in PE."
        disabled={saving}
      />

      {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
    </Modal>
  )
}

MoveCreditModal.propTypes = {
  isOpen: bool.isRequired,
  onClose: func.isRequired,
  onRequested: func,
  target: shape({
    kind: string,
    questId: string.isRequired,
    title: string.isRequired,
    xp: number,
    from: shape({ key: string.isRequired, name: string.isRequired }).isRequired,
  }),
  subjects: arrayOf(shape({ key: string.isRequired, name: string.isRequired })),
  studentId: string,
}

export default MoveCreditModal

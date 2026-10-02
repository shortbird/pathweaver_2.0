import React, { useState } from 'react'
import { func, number, shape, string } from 'prop-types'
import { toast } from 'react-hot-toast'
import { Spinner } from '../ui/Spinner'
import EmptyState from '../ui/EmptyState'
import {
  useDecideSubjectMove,
  useSubjectMoveQueue,
  subjectMoveError,
} from '../../hooks/api/useSubjectCreditMoves'

/**
 * Families asking to move a quest's credit to another subject (2026-10-02).
 * A tab of the Credit Review Dashboard, superadmin only. Approve moves the
 * credit (backend subject_credit_move_service) and tells the family; Decline
 * needs a note, which the family reads.
 */
const formatDate = (iso) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

const MoveRequestCard = ({ item, onDecided }) => {
  const decide = useDecideSubjectMove()
  const [declining, setDeclining] = useState(false)
  const [note, setNote] = useState('')

  const run = async (decision) => {
    try {
      await decide.mutateAsync({ requestId: item.id, decision, note: note.trim() || undefined })
      toast.success(decision === 'approve'
        ? `Moved to ${item.to_subject_name}`
        : 'Declined. The family will see your note.')
      onDecided?.()
    } catch (err) {
      toast.error(subjectMoveError(err, 'That did not go through. Please try again.'))
    }
  }

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{item.quest_title}</p>
          <p className="text-sm text-gray-700 mt-0.5">
            {item.student_name}
            {item.requested_by_name && item.requested_by_name !== item.student_name
              ? `, asked by ${item.requested_by_name}` : ''}
            {item.created_at ? ` on ${formatDate(item.created_at)}` : ''}
          </p>
          <p className="text-sm text-gray-900 mt-2">
            <span className="font-semibold">{(item.xp || 0).toLocaleString()} XP</span>
            {' '}from {item.from_subject_name} to {item.to_subject_name}
          </p>
          {item.reason && <p className="text-sm text-gray-600 mt-1">&ldquo;{item.reason}&rdquo;</p>}
        </div>
        {!declining && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button type="button" onClick={() => setDeclining(true)} disabled={decide.isPending} className="btn-quiet">
              Decline
            </button>
            <button type="button" onClick={() => run('approve')} disabled={decide.isPending} className="btn-primary">
              {decide.isPending && <Spinner size="sm" className="border-white" />}
              Approve
            </button>
          </div>
        )}
      </div>
      {declining && (
        <div className="mt-3">
          <label htmlFor={`decline-note-${item.id}`} className="block text-sm font-medium text-gray-700">
            Why not? The family reads this.
          </label>
          <textarea
            id={`decline-note-${item.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={2}
            className="input-field mt-1 w-full"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button type="button" onClick={() => { setDeclining(false); setNote('') }} className="btn-quiet">
              Back
            </button>
            <button
              type="button"
              onClick={() => run('decline')}
              disabled={!note.trim() || decide.isPending}
              className="btn-danger"
            >
              Decline
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

MoveRequestCard.propTypes = {
  item: shape({
    id: string.isRequired,
    quest_title: string,
    student_name: string,
    requested_by_name: string,
    from_subject_name: string,
    to_subject_name: string,
    xp: number,
    reason: string,
    created_at: string,
  }).isRequired,
  onDecided: func,
}

const SubjectMovesSection = ({ onDecided }) => {
  const { data: items = [], isLoading, isError, refetch } = useSubjectMoveQueue('pending')

  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="md" /></div>
  if (isError) {
    return (
      <div className="card text-center">
        <p className="text-sm text-gray-700">Subject moves did not load.</p>
        <button type="button" onClick={() => refetch()} className="btn-quiet mt-4">Try again</button>
      </div>
    )
  }
  if (!items.length) {
    return <EmptyState title="No subject moves waiting" hint="When a family asks to move a quest's credit to another subject, it shows up here." />
  }
  return (
    <ul className="space-y-3 max-w-3xl" aria-label="Subject moves waiting on Optio">
      {items.map((item) => <MoveRequestCard key={item.id} item={item} onDecided={onDecided} />)}
    </ul>
  )
}

SubjectMovesSection.propTypes = {
  onDecided: func,
}

export default SubjectMovesSection

import React, { useEffect, useRef, useState } from 'react'
import { func, number, shape, string } from 'prop-types'
import { toast } from 'react-hot-toast'
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline'
import { useCancelSubjectMove, subjectMoveError } from '../../hooks/api/useSubjectCreditMoves'

/**
 * The ⋯ menu on a quest row or own-curriculum course in Courses and Credits.
 * One item for now: "Move credit to another subject". While a move waits on
 * Optio the menu gives way to a "Move requested" pill with Cancel, so a
 * family cannot ask twice (the backend refuses a second one anyway).
 */
const CreditMoveMenu = ({ title, pendingRequest, studentId, onMove, onChanged }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const cancelMove = useCancelSubjectMove()

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (pendingRequest) {
    const cancel = async () => {
      try {
        await cancelMove.mutateAsync({ requestId: pendingRequest.id, studentId })
        toast.success('Request cancelled')
        onChanged?.()
      } catch (err) {
        toast.error(subjectMoveError(err, 'Could not cancel it. Please try again.'))
      }
    }
    return (
      <span className="inline-flex items-center gap-2 flex-shrink-0">
        <span
          className="px-2 py-0.5 text-xs font-medium rounded bg-optio-purple/10 text-optio-purple"
          title={`Asked Optio to move this to ${pendingRequest.to_subject_name}`}
        >
          Move requested
        </span>
        <button
          type="button"
          onClick={cancel}
          disabled={cancelMove.isPending}
          className="text-xs font-medium text-gray-500 hover:text-optio-purple hover:underline disabled:opacity-50"
        >
          Cancel
        </button>
      </span>
    )
  }

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`More options for ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
      >
        <EllipsisHorizontalIcon className="w-5 h-5" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 w-64 rounded-lg border border-gray-200 bg-white shadow-lg z-20 py-1 text-sm">
          <button
            role="menuitem"
            type="button"
            onClick={() => { setOpen(false); onMove() }}
            className="w-full text-left px-4 py-2 hover:bg-gray-50"
          >
            Move credit to another subject
          </button>
        </div>
      )}
    </div>
  )
}

CreditMoveMenu.propTypes = {
  title: string.isRequired,
  pendingRequest: shape({ id: string.isRequired, to_subject_name: string, xp: number }),
  studentId: string,
  onMove: func.isRequired,
  onChanged: func,
}

export default CreditMoveMenu

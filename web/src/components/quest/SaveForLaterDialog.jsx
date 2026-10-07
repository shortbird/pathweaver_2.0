import React from 'react'
import DialogModal from '../ui/Modal'

/**
 * "Save for later": one question, two answers (ticket e17134c6, 2026-10-07).
 *
 * An iCreate org admin would not press the old "End quest" because she "didn't
 * know what would happen". So the question names the choice and each answer
 * says where the quest goes, and both say the work and XP are kept:
 *
 *   - "I'll come back to it"  POST /archive              -> Saved for Later
 *   - "I'm done with it"      POST /archive lost_interest -> hidden everywhere,
 *                                                         work stays in the portfolio
 *
 * Cancel does nothing. `onChoose('later' | 'done')` gets the answer; the
 * caller sends the request (with the child's student_id in family scope).
 * `REASON_FOR` maps an answer to the archive body's reason.
 *
 * `hasSavedForLaterList`: the student dashboard (and a parent's view of the
 * child's) lists saved quests with Resume. The staff and parent role homes
 * have no such list, so for them the way back is the quest page.
 */
export const REASON_FOR = { later: undefined, done: 'lost_interest' }

export default function SaveForLaterDialog({
  isOpen,
  onClose,
  onChoose,
  questLabel = 'quest',
  hasSavedForLaterList = true,
  busy = false,
}) {
  const laterHint = hasSavedForLaterList
    ? `It moves to Saved for Later on the dashboard, and Resume there brings it back.`
    : `It leaves your active list, and you can open it again here to pick it back up.`
  return (
    <DialogModal isOpen={isOpen} onClose={busy ? () => {} : onClose} size="sm">
      <h3 className="text-lg font-bold text-gray-900">Will you come back to this {questLabel}?</h3>
      <p className="mt-2 text-sm text-gray-600">All work and XP are kept either way.</p>
      <div className="mt-4 space-y-2">
        <button
          type="button"
          onClick={() => onChoose('later')}
          disabled={busy}
          className="w-full text-left rounded-xl border border-gray-200 px-4 py-3 hover:border-optio-purple hover:bg-optio-purple/5 disabled:opacity-50"
        >
          <span className="block text-sm font-semibold text-gray-900">I&apos;ll come back to it</span>
          <span className="block text-xs text-gray-600 mt-0.5">{laterHint}</span>
        </button>
        <button
          type="button"
          onClick={() => onChoose('done')}
          disabled={busy}
          className="w-full text-left rounded-xl border border-gray-200 px-4 py-3 hover:border-optio-purple hover:bg-optio-purple/5 disabled:opacity-50"
        >
          <span className="block text-sm font-semibold text-gray-900">I&apos;m done with it</span>
          <span className="block text-xs text-gray-600 mt-0.5">
            It leaves every list. Its work and XP stay in the portfolio.
          </span>
        </button>
      </div>
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onClose} disabled={busy} className="btn-quiet">
          Cancel
        </button>
      </div>
    </DialogModal>
  )
}

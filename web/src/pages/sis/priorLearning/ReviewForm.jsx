/**
 * Extracted from sis/PriorLearningPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import inputClass from './inputClass'
import creditsFromSuggestion from './creditsFromSuggestion'

const ReviewForm = ({ record, subjects, busy, prefill, onSubmit }) => {
  const [notes, setNotes] = useState(record.review_notes || '')
  const [credits, setCredits] = useState(() => (
    Object.fromEntries(Object.entries(record.awarded_credits || {}).map(([k, v]) => [k, String(v)]))
  ))

  // "Use these numbers" fills the boxes; the reviewer still presses Accept, so
  // the suggestion never becomes an award without a person in between. Keyed on
  // the suggestion object so re-analyzing refills, but typing does not get
  // overwritten on every render.
  useEffect(() => {
    if (prefill) setCredits(creditsFromSuggestion(prefill))
  }, [prefill])

  const awarded = () => Object.fromEntries(
    Object.entries(credits)
      .map(([subject, value]) => [subject, parseFloat(value)])
      .filter(([, value]) => Number.isFinite(value) && value > 0)
  )

  return (
    <div className="pt-3 border-t border-gray-100 space-y-3">
      <div>
        <p className="text-sm font-medium text-gray-700 mb-1.5">Credit to award</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {subjects.map((subject) => (
            <label key={subject.key} className="flex items-center gap-2 text-sm">
              <span className="flex-1 text-gray-600">{subject.name}</span>
              <input type="number" min="0" step="0.25" placeholder="0"
                     aria-label={`${subject.name} credits`}
                     value={credits[subject.key] || ''}
                     onChange={(e) => setCredits({ ...credits, [subject.key]: e.target.value })}
                     className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={`notes-${record.id}`}>
          Notes for the family
        </label>
        <textarea id={`notes-${record.id}`} rows={2} className={inputClass} value={notes}
                  onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy}
                onClick={() => onSubmit({ status: 'accepted', review_notes: notes, awarded_credits: awarded() })}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink disabled:opacity-50">
          Accept &amp; award
        </button>
        {record.status === 'submitted' && (
          <button type="button" disabled={busy}
                  onClick={() => onSubmit({ status: 'under_review', review_notes: notes })}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 disabled:opacity-50">
            Mark in review
          </button>
        )}
        <button type="button" disabled={busy}
                onClick={() => onSubmit({ status: 'rejected', review_notes: notes })}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-red-300 text-red-700 disabled:opacity-50">
          Don’t accept
        </button>
      </div>
    </div>
  )
}

export default ReviewForm

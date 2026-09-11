import React from 'react'
import { sumSubjects } from '../aiReview'

export const ALL_SUBJECTS = [
  'language_arts', 'math', 'science', 'social_studies',
  'financial_literacy', 'health', 'pe', 'fine_arts',
  'cte', 'digital_literacy', 'electives',
]

export const formatSubject = (s) => {
  if (s === 'pe') return 'PE'
  if (s === 'cte') return 'CTE'
  return s.replace(/_/g, ' ')
}

/**
 * How the XP splits across diploma subjects.
 *
 * Read-only for anyone who cannot act on the item, so the split reads as a
 * fact rather than a form. Every edit hands the whole next split to `onChange`
 * as a value, never an updater, because the owner derives the XP to award from
 * it and needs the number in hand. The total stays in view because the server
 * refuses a split that does not add up to the XP being awarded, and the
 * reviewer should see that mismatch before they click.
 */
const SubjectSplitEditor = ({ subjects, onChange, editable, targetXp }) => {
  const current = subjects || {}
  const entries = Object.entries(current)
  const total = sumSubjects(current)
  const offTarget = editable && targetXp != null && entries.length > 0 && total !== targetXp

  if (!entries.length && !editable) return null

  const rename = (from, to) => {
    if (to === from) return
    const next = {}
    if (current[to] !== undefined) {
      // Merge into the existing subject rather than making a duplicate row.
      for (const [k, v] of entries) {
        if (k === from) continue
        next[k] = k === to ? (parseInt(v, 10) || 0) + (parseInt(current[from], 10) || 0) : v
      }
      onChange(next)
      return
    }
    for (const [k, v] of entries) next[k === from ? to : k] = v
    onChange(next)
  }

  const setXp = (subject, value) => {
    onChange({ ...current, [subject]: parseInt(value, 10) || 0 })
  }

  const remove = (subject) => {
    const next = { ...current }
    delete next[subject]
    onChange(next)
  }

  const add = () => {
    const unused = ALL_SUBJECTS.find(s => current[s] === undefined)
    if (unused) onChange({ ...current, [unused]: 0 })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Subject XP Distribution
        </h3>
        <span className={`text-xs ${offTarget ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
          Total: {total} XP{offTarget ? ` (needs ${targetXp})` : ''}
        </span>
      </div>

      {editable ? (
        <div className="space-y-2">
          {entries.map(([subject, xp]) => (
            <div key={subject} className="flex items-center gap-2">
              <select
                value={subject}
                aria-label={`Subject for ${formatSubject(subject)}`}
                onChange={(e) => rename(subject, e.target.value)}
                // 16px on mobile to avoid iOS auto-zoom on focus.
                className="flex-1 min-w-0 text-base md:text-sm rounded-lg border-gray-200 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple capitalize py-2 md:py-1.5"
              >
                {ALL_SUBJECTS.map(s => (
                  <option key={s} value={s} className="capitalize">{formatSubject(s)}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="5"
                inputMode="numeric"
                aria-label={`XP for ${formatSubject(subject)}`}
                value={xp}
                onChange={(e) => setXp(subject, e.target.value)}
                className="w-20 md:w-24 text-base md:text-sm text-right rounded-lg border-gray-200 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple py-2 md:py-1.5"
              />
              <span className="text-xs text-gray-400 w-6 shrink-0">XP</span>
              <button
                type="button"
                onClick={() => remove(subject)}
                className="p-2 md:p-1 -mr-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded touch-manipulation"
                title="Remove subject"
                aria-label={`Remove ${subject}`}
              >
                <svg className="w-5 h-5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          {entries.length < ALL_SUBJECTS.length && (
            <button
              type="button"
              onClick={add}
              className="flex items-center gap-1 text-sm md:text-xs font-medium text-optio-purple hover:text-optio-purple-dark mt-1 min-h-[36px] md:min-h-0 touch-manipulation"
            >
              <svg className="w-4 h-4 md:w-3.5 md:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add subject
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {entries.map(([subject, xp]) => (
            <div key={subject} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded-lg text-sm">
              <span className="text-gray-700 capitalize">{formatSubject(subject)}</span>
              <span className="font-medium text-gray-900">{xp} XP</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SubjectSplitEditor

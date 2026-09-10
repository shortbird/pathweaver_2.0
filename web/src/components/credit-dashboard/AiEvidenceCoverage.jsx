import React, { useState } from 'react'

/**
 * What the AI actually managed to read.
 *
 * The single most important thing on the panel when it goes wrong. A verdict
 * formed over three of five pieces of evidence is not wrong, but a reviewer who
 * thinks it saw all five will trust it further than they should — so the count
 * is always visible and the panel opens itself whenever something was missed.
 */
const AiEvidenceCoverage = ({ evidence, stats, flags, onJumpToEvidence }) => {
  const items = evidence || []
  const missed = items.filter(e => e.status === 'skipped')

  // The loader raises a flag for every piece it could not open AND records the
  // reason on the item. Rendering both says the same thing twice and buries the
  // flags that are not about one file -- a dropped citation, a refused schema,
  // a task with no criteria. Those are the ones worth a coloured box.
  const generalFlags = (flags || []).filter(f => !(items.length && /^\[E\d+\]/.test(f)))

  const [open, setOpen] = useState(missed.length > 0 || generalFlags.length > 0)

  if (!items.length && !generalFlags.length) return null

  const read = stats?.read ?? items.filter(e => e.status === 'read').length
  const total = stats?.items ?? items.length

  return (
    <div className="border-t border-gray-200 pt-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-900 min-h-[32px] touch-manipulation"
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span>
          The AI read {read} of {total} piece{total === 1 ? '' : 's'} of evidence
        </span>
        {missed.length > 0 && (
          <span className="text-amber-700 font-medium">
            ({missed.length} missed)
          </span>
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <ul className="space-y-1">
            {items.map(entry => (
              <li key={`${entry.index}-${entry.item || 1}`}
                  className="flex items-start gap-2 text-[11px] text-gray-600">
                <button
                  type="button"
                  onClick={() => onJumpToEvidence?.(entry.index)}
                  className="px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-100 shrink-0 min-h-[26px] touch-manipulation"
                  aria-label={`Jump to evidence ${entry.index}`}
                >
                  E{entry.index}
                </button>
                <span className="min-w-0">
                  <span className="text-gray-700">{entry.label}</span>
                  {entry.status === 'skipped' ? (
                    <span className="text-amber-700"> — not read: {entry.skip_reason}</span>
                  ) : (
                    <span className="text-gray-400"> — read as {entry.how}</span>
                  )}
                  {entry.note && <span className="text-gray-400"> ({entry.note})</span>}
                </span>
              </li>
            ))}
          </ul>

          {generalFlags.length > 0 && (
            <ul className="rounded-lg bg-amber-50 border border-amber-200 p-2 space-y-1">
              {generalFlags.map((flag, i) => (
                <li key={i} className="text-[11px] text-amber-900">{flag}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}


export default AiEvidenceCoverage

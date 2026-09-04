/**
 * Extracted from sis/PriorLearningPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import LOW_CONFIDENCE from './LOW_CONFIDENCE'
import transcriptRows from './transcriptRows'
import TERM_LABELS from './TERM_LABELS'
import UnlockPrompt from './UnlockPrompt'

const AiSuggestion = ({ suggestion, busy, onUnlock, onUse }) => {
  const rows = transcriptRows(suggestion)
  const locked = suggestion.locked_files || []
  const totalCredits = rows.reduce((sum, r) => sum + (Number(r.credits) || 0), 0)
  const flags = suggestion.flags || []

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50/60 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-3 py-2 border-b border-purple-200">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-optio-purple uppercase tracking-wide">
            Suggested transcript — not a decision
          </p>
          <p className="text-sm text-gray-700 truncate">
            {[suggestion.school_name,
              [suggestion.started_on, suggestion.ended_on].filter(Boolean).join(' – ')]
              .filter(Boolean).join(' · ') || 'School not identified'}
          </p>
        </div>
        {!!rows.length && (
          <button type="button" onClick={onUse}
                  className="text-xs font-medium text-optio-purple hover:underline shrink-0">
            Use these numbers
          </button>
        )}
      </div>

      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 text-left">
                <th scope="col" className="font-medium px-3 py-1.5">Course</th>
                <th scope="col" className="font-medium px-3 py-1.5">Subject</th>
                <th scope="col" className="font-medium px-3 py-1.5">Term</th>
                <th scope="col" className="font-medium px-3 py-1.5 text-right">Credits</th>
                <th scope="col" className="font-medium px-3 py-1.5 text-right">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const shaky = row.confidence != null && row.confidence < LOW_CONFIDENCE
                return (
                  <tr key={i} className={`border-t border-purple-100 ${shaky ? 'bg-amber-50' : ''}`}>
                    <td className="px-3 py-1.5 text-gray-900">
                      {row.name}
                      {row.rationale && (
                        <span className="block text-xs text-gray-500">{row.rationale}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-gray-600">{row.subject}</td>
                    <td className="px-3 py-1.5 text-gray-600">{TERM_LABELS[row.term] || '—'}</td>
                    <td className="px-3 py-1.5 text-right text-gray-900 tabular-nums">{row.credits}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${shaky ? 'text-amber-800 font-medium' : 'text-gray-500'}`}>
                      {row.confidence == null ? '—' : `${Math.round(row.confidence * 100)}%`}
                      {shaky && <span className="block text-xs">check this</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-purple-200 font-medium text-gray-900">
                <td className="px-3 py-1.5" colSpan={3}>Total</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {Math.round(totalCredits * 100) / 100}
                </td>
                <td className="px-3 py-1.5 text-right text-gray-500 tabular-nums">
                  {Math.round(totalCredits * 2000)} XP
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="px-3 py-2 text-sm text-gray-600">
          No credit proposed from this evidence.
        </p>
      )}

      {locked.length > 0 && onUnlock && (
        <UnlockPrompt files={locked} busy={busy} onUnlock={onUnlock} />
      )}

      {(suggestion.summary || flags.length > 0) && (
        <div className="px-3 py-2 border-t border-purple-200 space-y-1">
          {flags.map((flag, i) => (
            <p key={i} className="text-sm text-amber-800">Check: {flag}</p>
          ))}
          {suggestion.summary && (
            <details>
              <summary className="text-xs text-gray-500 cursor-pointer">What the reader saw</summary>
              <p className="text-sm text-gray-600 mt-1">{suggestion.summary}</p>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

export default AiSuggestion

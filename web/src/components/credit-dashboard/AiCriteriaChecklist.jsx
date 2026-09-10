import React from 'react'
import { CRITERION_STATUS_META, criteriaForDisplay } from './aiReview'

/**
 * The Definition of Done, with the AI's verdict beside each line.
 *
 * Without a review this is the plain list it has always been. That is the point:
 * the criteria are the school's standard, and the AI only annotates them. A
 * reviewer who distrusts the annotations still has the checklist.
 *
 * Every verdict carries screen-reader text as well as a colour, because a
 * red-green colourblind reviewer reading a column of ticks and crosses gets the
 * same answer from both or the feature is worse than no feature.
 */
const AiCriteriaChecklist = ({ criteria, aiReview, onJumpToEvidence, readableRefs }) => {
  const rows = criteriaForDisplay({ success_criteria: criteria }, aiReview)
  if (!rows.length) return null

  const inferred = rows[0]?.inferred
  const annotated = rows.some(r => r.status && r.status !== 'unassessed')

  return (
    <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1.5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Definition of Done
        </p>
        {inferred && (
          <p className="text-[11px] text-amber-700">
            This task set no criteria. The AI read the description instead.
          </p>
        )}
      </div>

      <ul className="space-y-1.5">
        {rows.map(row => {
          const meta = CRITERION_STATUS_META[row.status] || null
          return (
            <li key={row.index} className="flex items-start gap-2 text-sm text-gray-700">
              <span
                className={`font-bold w-4 shrink-0 text-center ${meta ? meta.className : 'text-green-600'}`}
                aria-hidden="true"
              >
                {meta ? meta.symbol : '✓'}
              </span>
              <span className="min-w-0">
                {meta && <span className="sr-only">{meta.srText}. </span>}
                <span>{row.text}</span>
                {row.note && (
                  <span className="block text-xs text-gray-500 mt-0.5">{row.note}</span>
                )}
                {row.evidenceRefs.length > 0 && (
                  <span className="inline-flex flex-wrap gap-1 mt-1">
                    {row.evidenceRefs.map(ref => {
                      const reachable = !readableRefs || readableRefs.includes(ref)
                      return (
                        <button
                          key={ref}
                          type="button"
                          disabled={!reachable}
                          onClick={() => reachable && onJumpToEvidence?.(ref)}
                          aria-label={`Jump to evidence ${ref}`}
                          title={reachable ? `Jump to evidence ${ref}` : 'That evidence is no longer here'}
                          className={`text-[11px] px-1.5 py-0.5 rounded border min-h-[28px] md:min-h-0 touch-manipulation ${
                            reachable
                              ? 'border-optio-purple/30 text-optio-purple hover:bg-optio-purple/10'
                              : 'border-gray-200 text-gray-300 cursor-not-allowed'
                          }`}
                        >
                          E{ref}
                        </button>
                      )
                    })}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>

      {annotated && (
        <p className="mt-2 text-[11px] text-gray-400">
          Verdicts are the AI&apos;s. You decide.
        </p>
      )}
    </div>
  )
}


export default AiCriteriaChecklist

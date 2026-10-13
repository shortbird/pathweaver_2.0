import React from 'react'
import { TRANSCRIPT_SUBJECT_NAMES, XP_PER_CREDIT, formatCredits } from '../../utils/creditRequirements'
import { safeHref } from '../../utils/safeHref'

const dateRange = (entry) => {
  const monthYear = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  return [entry.started_on, entry.ended_on].filter(Boolean).map(monthYear).join(' – ')
}

const Document = ({ item }) => {
  const href = item.url ? safeHref(item.url) : null
  const label = item.title || item.file_name || 'Document'
  if (item.evidence_type === 'image' && href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block">
        <img src={href} alt={label} loading="lazy"
             className="w-full h-24 object-cover rounded-lg border border-gray-200" />
      </a>
    )
  }
  if (item.evidence_type === 'text') {
    return <p className="col-span-full text-xs text-gray-600 whitespace-pre-wrap line-clamp-4">{item.content}</p>
  }
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noreferrer"
       className="col-span-full flex items-center gap-2 text-xs text-optio-purple hover:underline min-w-0">
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span className="truncate">{label}</span>
    </a>
  )
}

/**
 * One accepted prior-learning record in a portfolio: what the student did
 * before or outside Optio, the credit it earned, and its documents.
 *
 * Documents show unless the family marked them private on their Prior
 * Learning page (Tanner, 2026-10-13: "show all. families are able to mark
 * portfolio docs as private"); the backend leaves private ones out, so this
 * card never sees them.
 */
const PriorLearningCard = ({ entry, className = '' }) => {
  const credits = Object.entries(entry.awarded_credits || {}).filter(([, c]) => Number(c) > 0)
  const docs = entry.evidence || []
  const when = dateRange(entry)

  return (
    <div className={`rounded-xl border border-gray-200 overflow-hidden bg-white flex flex-col break-inside-avoid ${className}`}>
      <div className="bg-gradient-primary px-4 py-3">
        <p className="text-white/80 text-[11px] font-semibold uppercase tracking-wide">Prior learning</p>
        <h4 className="text-white font-bold text-sm leading-tight mt-0.5">{entry.title}</h4>
        {(entry.provider || when) && (
          <p className="text-white/80 text-xs mt-0.5">{[entry.provider, when].filter(Boolean).join(' · ')}</p>
        )}
      </div>
      <div className="p-3 space-y-3">
        {entry.description && entry.description !== entry.title && (
          <p className="text-xs text-gray-600 whitespace-pre-wrap line-clamp-4">{entry.description}</p>
        )}
        {credits.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {formatCredits(entry.total_credits)} credits
            </p>
            <ul className="mt-1 space-y-0.5">
              {credits.map(([subject, c]) => (
                <li key={subject} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-gray-600 truncate">{TRANSCRIPT_SUBJECT_NAMES[subject] || subject}</span>
                  <span className="text-gray-500 tabular-nums whitespace-nowrap">
                    {Math.round(Number(c) * XP_PER_CREDIT).toLocaleString()} XP
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {docs.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {docs.map((item) => <Document key={item.id} item={item} />)}
          </div>
        )}
      </div>
    </div>
  )
}

export default PriorLearningCard

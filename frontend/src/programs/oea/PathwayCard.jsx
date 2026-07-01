/**
 * PathwayCard - one OEA diploma pathway in the selection comparison view.
 *
 * Shows the credit split (foundation / elective / total), description, who it's
 * best for, and the per-subject requirement breakdown. Selectable; the current
 * selection is highlighted with the Optio purple border.
 *
 * Web port of frontend-v2/src/components/oea/PathwayCard.tsx.
 */
import React from 'react'

function CreditPill({ label, value }) {
  return (
    <div className="flex flex-col items-center px-3 py-2 rounded-lg bg-[#F3EFF4] min-w-[72px]">
      <span className="text-lg font-bold text-neutral-900">{value}</span>
      <span className="text-xs text-neutral-500">{label}</span>
    </div>
  )
}

export default function PathwayCard({ pathway, selected, saving, onSelect }) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 transition-colors ${
        selected ? 'border-optio-purple ring-1 ring-optio-purple' : 'border-neutral-200'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 pr-3">
          <h3 className="text-lg font-bold text-neutral-900">{pathway.name}</h3>
          <p className="text-sm font-medium text-optio-purple">{pathway.tagline}</p>
        </div>
        {selected && (
          <span className="w-6 h-6 rounded-full bg-optio-purple flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </span>
        )}
      </div>

      <div className="flex gap-2 mt-4">
        <CreditPill label="Foundation" value={pathway.foundation_credits} />
        <CreditPill label="Elective" value={pathway.elective_credits} />
        <CreditPill label="Total" value={pathway.total_credits} />
      </div>

      <p className="text-sm text-neutral-600 mt-4">{pathway.description}</p>

      <div className="bg-neutral-50 rounded-lg p-3 mt-4">
        <p className="text-xs font-semibold text-neutral-500 mb-1">BEST FOR</p>
        <p className="text-sm text-neutral-700">{pathway.best_for}</p>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold text-neutral-500 mb-1">REQUIREMENTS</p>
        {pathway.requirements.map((r) => (
          <div key={r.key} className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  r.category === 'foundation' ? 'bg-optio-purple' : 'bg-optio-pink'
                }`}
              />
              <span className="text-sm text-neutral-700">{r.label}</span>
            </div>
            <span className="text-sm font-medium text-neutral-900">
              {r.credits} {r.credits === 1 ? 'credit' : 'credits'}
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onSelect(pathway.key)}
        disabled={!!saving}
        className={`mt-5 w-full min-h-[44px] rounded-lg font-semibold transition-colors disabled:opacity-60 ${
          selected
            ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
            : 'border border-optio-purple text-optio-purple hover:bg-[#F3EFF4]'
        }`}
      >
        {saving && selected ? 'Saving...' : selected ? 'Selected pathway' : 'Choose this pathway'}
      </button>
    </div>
  )
}

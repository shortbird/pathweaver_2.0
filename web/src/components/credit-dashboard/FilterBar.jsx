import React from 'react'

const DIPLOMA_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'pending_org_approval', label: 'Pending Org Approval' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'grow_this', label: 'Grow This' },
  { value: 'finalized', label: 'Finalized' },
  { value: 'merged', label: 'Merged' },
]

// Mobile-friendly defaults: `text-base` (16px) keeps iOS Safari from zooming
// the page when the user focuses the select / input. We shrink back to
// `text-xs` on md+ where the dense desktop layout is the priority.
const inputClass =
  'w-full text-base md:text-xs rounded border-gray-300 focus:ring-optio-purple focus:border-optio-purple min-h-[44px] md:min-h-0 px-3 md:px-2 py-2 md:py-1.5'

// Only superadmins receive AI fields from the API, so only they get the filter.
// An org admin seeing an empty "AI recommends approve" list would read it as
// nothing being ready rather than as data they cannot see.
const AI_RECOMMENDATIONS = [
  { value: '', label: 'AI: any' },
  { value: 'approve', label: 'AI recommends approve' },
  { value: 'grow_this', label: 'AI recommends Grow This' },
  { value: 'needs_human', label: 'AI: needs a person' },
  { value: 'not_run', label: 'AI: no verdict yet' },
]

const FilterBar = ({ filters, onFiltersChange, showAiFilter = false }) => {
  const update = (key, value) => {
    onFiltersChange(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="p-3 space-y-2 border-b border-gray-200 bg-white">
      <select
        aria-label="Status"
        value={filters.status}
        onChange={e => update('status', e.target.value)}
        className={inputClass}
      >
        {DIPLOMA_STATUSES.map(s => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      {showAiFilter && (
        <select
          aria-label="AI recommendation"
          value={filters.ai || ''}
          onChange={e => update('ai', e.target.value)}
          className={inputClass}
        >
          {AI_RECOMMENDATIONS.map(a => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
      )}
      <input
        type="text"
        placeholder="Search student..."
        value={filters.student_id}
        onChange={e => update('student_id', e.target.value)}
        className={inputClass}
      />
    </div>
  )
}

export default FilterBar

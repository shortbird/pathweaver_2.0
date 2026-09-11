import React, { useState, useEffect } from 'react'

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

// The queue refetches on every filter change, so the name box waits for the
// reviewer to pause typing rather than firing a request per keystroke. The
// value the page holds is the settled one; the box shows what is typed.
const StudentSearch = ({ value, onChange }) => {
  const [text, setText] = useState(value || '')
  // When the page changes the settled value (a reset, a role default), the
  // box follows it. Derived during render, the way React asks, rather than
  // through an effect that would render twice.
  const [seen, setSeen] = useState(value || '')
  if ((value || '') !== seen) {
    setSeen(value || '')
    setText(value || '')
  }
  useEffect(() => {
    if (text === (value || '')) return undefined
    const timer = setTimeout(() => onChange(text.trim()), 300)
    return () => clearTimeout(timer)
  }, [text, value, onChange])
  return (
    <input
      type="search"
      aria-label="Search student"
      placeholder="Search student by name..."
      value={text}
      onChange={e => setText(e.target.value)}
      className={inputClass}
    />
  )
}

// `layout="row"` lays the controls side by side for the full-width queue;
// the default stacks them for the narrow list on a phone.
const FilterBar = ({ filters, onFiltersChange, showAiFilter = false, layout = 'stack' }) => {
  const update = (key, value) => {
    onFiltersChange(prev => ({ ...prev, [key]: value }))
  }

  const wrap = layout === 'row'
    ? 'flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-200 bg-white [&>*]:w-auto [&>*]:min-w-[12rem]'
    : 'p-3 space-y-2 border-b border-gray-200 bg-white'

  return (
    <div className={wrap}>
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
      <StudentSearch value={filters.student} onChange={value => update('student', value)} />
    </div>
  )
}

export default FilterBar

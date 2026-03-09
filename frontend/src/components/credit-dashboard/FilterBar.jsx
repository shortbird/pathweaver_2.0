import React from 'react'

const DIPLOMA_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'pending_review', label: 'Pending Advisor' },
  { value: 'approved', label: 'Approved' },
  { value: 'grow_this', label: 'Grow This' },
  { value: 'finalized', label: 'Finalized' },
  { value: 'merged', label: 'Merged' },
]

const ACCREDITOR_STATUSES = [
  { value: '', label: 'All Accreditor' },
  { value: 'not_reviewed', label: 'Not Reviewed' },
  { value: 'pending_accreditor', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'overridden', label: 'Overridden' },
]

const FilterBar = ({ filters, onFiltersChange }) => {
  const update = (key, value) => {
    onFiltersChange(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="p-3 space-y-2 border-b border-gray-200 bg-white">
      <div className="flex gap-2">
        <select
          value={filters.status}
          onChange={e => update('status', e.target.value)}
          className="flex-1 text-xs rounded border-gray-300 focus:ring-optio-purple focus:border-optio-purple"
        >
          {DIPLOMA_STATUSES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select
          value={filters.accreditor_status}
          onChange={e => update('accreditor_status', e.target.value)}
          className="flex-1 text-xs rounded border-gray-300 focus:ring-optio-purple focus:border-optio-purple"
        >
          {ACCREDITOR_STATUSES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      <input
        type="text"
        placeholder="Search student..."
        value={filters.student_id}
        onChange={e => update('student_id', e.target.value)}
        className="w-full text-xs rounded border-gray-300 focus:ring-optio-purple focus:border-optio-purple"
      />
    </div>
  )
}

export default FilterBar

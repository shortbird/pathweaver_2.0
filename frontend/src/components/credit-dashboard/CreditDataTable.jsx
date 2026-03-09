import React, { useState } from 'react'
import FilterBar from './FilterBar'

const statusColors = {
  pending_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  grow_this: 'bg-orange-100 text-orange-800',
  finalized: 'bg-blue-100 text-blue-800',
  merged: 'bg-gray-100 text-gray-500',
  confirmed: 'bg-emerald-100 text-emerald-800',
  flagged: 'bg-red-100 text-red-800',
  not_reviewed: 'bg-gray-100 text-gray-500',
  pending_accreditor: 'bg-blue-100 text-blue-700',
  overridden: 'bg-red-100 text-red-700',
}

const CreditDataTable = ({
  items, selectedItems, onToggleSelection, onSelectAll, onRowClick,
  filters, onFiltersChange, loading, total, page, perPage, onPageChange
}) => {
  const [sortKey, setSortKey] = useState('submitted_at')
  const [sortDir, setSortDir] = useState('desc')
  const totalPages = Math.ceil(total / perPage)

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = [...items].sort((a, b) => {
    const aVal = a[sortKey] || ''
    const bVal = b[sortKey] || ''
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  const allSelected = items.length > 0 && items.every(i => selectedItems.includes(i.completion_id))

  const SortHeader = ({ label, sortField }) => (
    <th
      onClick={() => toggleSort(sortField)}
      className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === sortField && (
          <svg className={`w-3 h-3 transition-transform ${sortDir === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        )}
      </span>
    </th>
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <FilterBar filters={filters} onFiltersChange={onFiltersChange} />

      <div className="flex-1 overflow-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-3 py-2 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => {
                    if (allSelected) onSelectAll([])
                    else onSelectAll(items.map(i => i.completion_id))
                  }}
                  className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                />
              </th>
              <SortHeader label="Student" sortField="student_name" />
              <SortHeader label="Task" sortField="task_title" />
              <SortHeader label="Quest" sortField="quest_title" />
              <SortHeader label="Subjects" sortField="pillar" />
              <SortHeader label="XP" sortField="xp_value" />
              <SortHeader label="Advisor Status" sortField="diploma_status" />
              <SortHeader label="Accreditor" sortField="accreditor_status" />
              <SortHeader label="Date" sortField="submitted_at" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={9} className="text-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple mx-auto" />
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-500 text-sm">
                  No items found
                </td>
              </tr>
            ) : sorted.map(item => (
              <tr
                key={item.completion_id}
                onClick={() => onRowClick(item)}
                className="hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedItems.includes(item.completion_id)}
                    onChange={() => onToggleSelection(item.completion_id)}
                    className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                  />
                </td>
                <td className="px-3 py-2 text-sm text-gray-900">{item.student_name}</td>
                <td className="px-3 py-2 text-sm text-gray-700 max-w-[200px] truncate">{item.task_title}</td>
                <td className="px-3 py-2 text-sm text-gray-500 max-w-[150px] truncate">{item.quest_title}</td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {Object.keys(item.suggested_subjects || {}).map(s => s.replace(/_/g, ' ')).join(', ') || '-'}
                </td>
                <td className="px-3 py-2 text-sm font-medium text-gray-900">{item.xp_value}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${
                    statusColors[item.diploma_status] || 'bg-gray-100'
                  }`}>
                    {(item.diploma_status || '').replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${
                    statusColors[item.accreditor_status] || 'bg-gray-100'
                  }`}>
                    {(item.accreditor_status || '').replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-400">
                  {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 bg-white text-sm text-gray-500">
          <span>{total} items</span>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50 hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="px-3 py-1">{page} of {totalPages}</span>
            <button
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default CreditDataTable

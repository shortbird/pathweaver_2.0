import React, { useState } from 'react'
import FilterBar from './FilterBar'
import AiBadge from './AiBadge'
import StatusPill from './StatusPill'
import { aiItemSummary } from './aiReview'
import { XpInflationBadge } from './taskOrigin'
import SortHeader from '../ui/SortHeader'
import ReviewQueueTable, { QueueHeader } from './ReviewQueueTable'

/**
 * The queue as a table. Clicking a row opens it in the grader; the checkboxes
 * are for merge and the other bulk actions, which is why they stop the click.
 */
const CreditDataTable = ({
  items, selectedItems, onToggleSelection, onSelectAll, onRowClick,
  filters, onFiltersChange, loading, total, page, perPage, onPageChange,
  showAi = false,
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

  const sortState = { key: sortKey, dir: sortDir }
  const th = 'px-3 py-2 text-left text-xs text-gray-500 uppercase tracking-wider'
  const sortable = (label, col) => (
    <SortHeader label={label} col={col} sort={sortState} onSort={toggleSort} className={th} />
  )
  const columns = [
    { key: 'student', header: sortable('Student', 'student_name'),
      cellClassName: 'px-3 py-2 text-sm text-gray-900', cell: item => item.student_name },
    { key: 'task', header: sortable('Task', 'task_title'),
      cellClassName: 'px-3 py-2 text-sm text-gray-700 max-w-[200px] truncate', cell: item => item.task_title },
    { key: 'quest', header: sortable('Quest', 'quest_title'),
      cellClassName: 'px-3 py-2 text-sm text-gray-500 max-w-[150px] truncate', cell: item => item.quest_title },
    { key: 'subjects', header: sortable('Subjects', 'pillar'),
      cellClassName: 'px-3 py-2 text-xs text-gray-500',
      cell: item => Object.keys(item.suggested_subjects || {}).map(s => s.replace(/_/g, ' ')).join(', ') || '-' },
    { key: 'xp', header: sortable('XP', 'xp_value'),
      cellClassName: 'px-3 py-2 text-sm font-medium text-gray-900',
      cell: item => (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span>{item.xp_value}</span>
          <XpInflationBadge xpValue={item.xp_value} aiSuggestedXp={item.ai_suggested_xp} />
        </div>
      ) },
    { key: 'evidence', header: <QueueHeader>Evidence</QueueHeader>,
      cellClassName: 'px-3 py-2 text-xs text-gray-500', cell: item => item.evidence_block_count ?? '-' },
    { key: 'status', header: sortable('Status', 'diploma_status'),
      cellClassName: 'px-3 py-2', cell: item => <StatusPill status={item.diploma_status} /> },
    ...(showAi ? [{ key: 'ai', header: sortable('AI', 'ai_recommendation'),
      cellClassName: 'px-3 py-2', cell: item => <AiBadge size="xs" {...aiItemSummary(item)} /> }] : []),
    { key: 'date', header: sortable('Date', 'submitted_at'),
      cellClassName: 'px-3 py-2 text-xs text-gray-400',
      cell: item => (item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : '-') },
  ]

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <FilterBar filters={filters} onFiltersChange={onFiltersChange} showAiFilter={showAi} layout="row" />

      <div className="flex-1 overflow-auto">
        <ReviewQueueTable
          items={sorted}
          columns={columns}
          rowLabel={item => `${item.student_name || 'student'}: ${item.task_title || 'task'}`}
          selectedIds={selectedItems}
          onToggleSelection={onToggleSelection}
          onSelectAll={onSelectAll}
          onRowClick={onRowClick}
          loading={loading}
        />
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

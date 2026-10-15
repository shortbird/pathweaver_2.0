import React from 'react'

/**
 * A review queue as a table: a checkbox per row for the bulk bar, and a row
 * click that opens the item in the grader. Shared by the credit queue
 * (CreditDataTable) and the SIS Submissions queue, so the two look and behave
 * alike (Tanner, 2026-10-15). The checkboxes stop the row click, so selecting
 * never opens anything.
 *
 * `columns` is [{ key, header, cell(item), cellClassName }]. `header` is the
 * whole <th> -- a SortHeader for a sortable column -- because the credit queue
 * sorts on the client and the submissions queue is ordered by the server.
 */
const ReviewQueueTable = ({
  items, columns, getId = (item) => item.completion_id, rowLabel = () => 'item',
  selectedIds, onToggleSelection, onSelectAll, onRowClick,
  loading = false, emptyText = 'No items found',
}) => {
  const allSelected = items.length > 0 && items.every((i) => selectedIds.includes(getId(i)))
  const span = columns.length + 1

  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50 sticky top-0">
        <tr>
          <th className="px-3 py-2 w-8">
            <input
              type="checkbox"
              aria-label="Select all"
              checked={allSelected}
              onChange={() => {
                if (allSelected) onSelectAll([])
                else onSelectAll(items.map(getId))
              }}
              className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
            />
          </th>
          {columns.map((c) => <React.Fragment key={c.key}>{c.header}</React.Fragment>)}
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {loading ? (
          <tr>
            <td colSpan={span} className="text-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple mx-auto" />
            </td>
          </tr>
        ) : items.length === 0 ? (
          <tr>
            <td colSpan={span} className="text-center py-12 text-gray-500 text-sm">
              {emptyText}
            </td>
          </tr>
        ) : items.map((item) => (
          <tr
            key={getId(item)}
            onClick={() => onRowClick(item)}
            className="hover:bg-gray-50 cursor-pointer"
          >
            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                aria-label={`Select ${rowLabel(item)}`}
                checked={selectedIds.includes(getId(item))}
                onChange={() => onToggleSelection(getId(item))}
                className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
              />
            </td>
            {columns.map((c) => (
              <td key={c.key} className={c.cellClassName || 'px-3 py-2 text-sm text-gray-700'}>
                {c.cell(item)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The plain header cell, for a column that does not sort. */
export const QueueHeader = ({ children, className = '' }) => (
  <th className={`px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${className}`.trim()}>
    {children}
  </th>
)

export default ReviewQueueTable

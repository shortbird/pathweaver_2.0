import React from 'react'
import FilterBar from './FilterBar'
import StatusTimeline from './StatusTimeline'

const statusColors = {
  pending_org_approval: 'bg-purple-100 text-purple-800',
  pending_review: 'bg-yellow-100 text-yellow-800',
  grow_this: 'bg-orange-100 text-orange-800',
  finalized: 'bg-emerald-100 text-emerald-800',
  merged: 'bg-gray-100 text-gray-500',
}

const statusLabels = {
  pending_org_approval: 'pending org',
  pending_review: 'pending review',
  grow_this: 'grow this',
  finalized: 'finalized',
  merged: 'merged',
}

const ItemList = ({
  items, selectedItem, selectedItems, onSelect, onToggleSelection,
  filters, onFiltersChange, loading, total, page, perPage, onPageChange
}) => {
  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="flex flex-col h-full">
      <FilterBar filters={filters} onFiltersChange={onFiltersChange} />

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            No items found
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {items.map(item => (
              <div
                key={item.completion_id}
                onClick={() => onSelect(item)}
                className={`px-4 md:px-3 py-3 md:py-2.5 min-h-[60px] md:min-h-0 cursor-pointer hover:bg-white transition-colors touch-manipulation ${
                  selectedItem?.completion_id === item.completion_id
                    ? 'bg-white border-l-2 border-l-optio-purple'
                    : 'border-l-2 border-l-transparent'
                }`}
              >
                <div className="flex items-start gap-3 md:gap-2">
                  {/* Larger checkbox tap area on mobile — wrap in label so the
                      full 44x44 region is clickable, not just the tiny native
                      checkbox glyph. */}
                  <label
                    className="flex items-center justify-center -m-2 p-2 md:p-0 md:m-0 cursor-pointer"
                    onClick={e => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedItems.includes(item.completion_id)}
                      onChange={(e) => {
                        e.stopPropagation()
                        onToggleSelection(item.completion_id)
                      }}
                      onClick={e => e.stopPropagation()}
                      className="w-5 h-5 md:w-4 md:h-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                    />
                  </label>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {item.student_name}
                      </span>
                      <span className={`inline-flex text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        statusColors[item.diploma_status] || 'bg-gray-100 text-gray-600'
                      }`}>
                        {statusLabels[item.diploma_status] || item.diploma_status?.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm md:text-xs text-gray-600 truncate mt-0.5">{item.task_title}</p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] md:text-[10px] text-gray-400">
                      <span>{item.xp_value} XP</span>
                      <span>{item.evidence_block_count} blocks</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 bg-white text-xs text-gray-500">
          <span>{total} items</span>
          <div className="flex gap-2 md:gap-1">
            <button
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="px-3 md:px-2 py-2 md:py-1 min-h-[40px] md:min-h-0 rounded border border-gray-300 disabled:opacity-50 touch-manipulation"
            >
              Prev
            </button>
            <span className="px-2 py-1 self-center">{page}/{totalPages}</span>
            <button
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="px-3 md:px-2 py-2 md:py-1 min-h-[40px] md:min-h-0 rounded border border-gray-300 disabled:opacity-50 touch-manipulation"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ItemList

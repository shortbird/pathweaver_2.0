import React from 'react'

/**
 * One pill per diploma status, shared by the queue list, the table and the
 * grader header. Three copies of this map disagreed on the label for
 * pending_org_approval before it was pulled out.
 */
export const STATUS_COLORS = {
  pending_org_approval: 'bg-optio-purple/10 text-optio-purple-dark',
  pending_review: 'bg-yellow-100 text-yellow-800',
  grow_this: 'bg-orange-100 text-orange-800',
  finalized: 'bg-emerald-100 text-emerald-800',
  merged: 'bg-gray-100 text-gray-500',
}

export const STATUS_LABELS = {
  pending_org_approval: 'pending org',
  pending_review: 'pending review',
  grow_this: 'grow this',
  finalized: 'finalized',
  merged: 'merged',
}

const StatusPill = ({ status, size = 'sm', className = '' }) => {
  if (!status) return null
  const sizing = size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'
  return (
    <span
      className={`inline-flex rounded-full font-medium whitespace-nowrap ${sizing} ${
        STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'
      } ${className}`}
    >
      {STATUS_LABELS[status] || status.replace(/_/g, ' ')}
    </span>
  )
}

export default StatusPill

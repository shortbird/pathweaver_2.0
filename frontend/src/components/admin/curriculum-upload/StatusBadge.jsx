import React from 'react'

/**
 * Status badge for curriculum upload status display.
 */
const StatusBadge = ({ status }) => {
  const styles = {
    processing: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    ready_for_review: 'bg-blue-100 text-blue-800 border-blue-200',
    approved: 'bg-green-100 text-green-800 border-green-200',
    error: 'bg-red-100 text-red-800 border-red-200',
    rejected: 'bg-gray-100 text-gray-600 border-gray-200',
    pending: 'bg-gray-100 text-gray-600 border-gray-200'
  }
  const labels = {
    processing: 'Processing',
    ready_for_review: 'Review',
    approved: 'Complete',
    error: 'Failed',
    rejected: 'Rejected',
    pending: 'Pending'
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border ${styles[status] || styles.pending}`}>
      {status === 'processing' && (
        <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse" />
      )}
      {labels[status] || status}
    </span>
  )
}

export default StatusBadge

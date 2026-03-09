import React, { useState } from 'react'
import api from '../../services/api'
import { toast } from 'react-hot-toast'

const BulkActionBar = ({ selectedCount, items, selectedIds, effectiveRole, onDeselectAll, onMerge, onRefresh }) => {
  const [bulkLoading, setBulkLoading] = useState(false)

  const selectedItems = items.filter(i => selectedIds.includes(i.completion_id))
  const allSameStudent = new Set(selectedItems.map(i => i.student_id)).size === 1
  const canMerge = selectedCount >= 2 && allSameStudent

  const handleBulkApprove = async () => {
    try {
      setBulkLoading(true)
      const pendingItems = selectedItems.filter(i => i.diploma_status === 'pending_review')
      for (const item of pendingItems) {
        await api.post(`/api/advisor/credit-queue/${item.completion_id}/approve`, {})
      }
      toast.success(`Approved ${pendingItems.length} items`)
      onDeselectAll()
      onRefresh()
    } catch (err) {
      toast.error('Bulk approve failed')
    } finally {
      setBulkLoading(false)
    }
  }

  const handleBulkConfirm = async () => {
    try {
      setBulkLoading(true)
      const approvedItems = selectedItems.filter(i => i.diploma_status === 'approved')
      for (const item of approvedItems) {
        await api.post(`/api/credit-dashboard/items/${item.completion_id}/confirm`, {})
      }
      toast.success(`Confirmed ${approvedItems.length} items`)
      onDeselectAll()
      onRefresh()
    } catch (err) {
      toast.error('Bulk confirm failed')
    } finally {
      setBulkLoading(false)
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-xl flex items-center gap-4 z-50">
      <span className="text-sm font-medium">{selectedCount} selected</span>

      {(effectiveRole === 'advisor' || effectiveRole === 'superadmin') && (
        <button
          onClick={handleBulkApprove}
          disabled={bulkLoading}
          className="px-3 py-1.5 text-sm bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          Approve All
        </button>
      )}

      {(effectiveRole === 'accreditor' || effectiveRole === 'superadmin') && (
        <button
          onClick={handleBulkConfirm}
          disabled={bulkLoading}
          className="px-3 py-1.5 text-sm bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
        >
          Confirm All
        </button>
      )}

      {canMerge && (
        <button
          onClick={onMerge}
          disabled={bulkLoading}
          className="px-3 py-1.5 text-sm bg-optio-purple rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          Merge Selected (m)
        </button>
      )}

      <button
        onClick={onDeselectAll}
        className="px-3 py-1.5 text-sm bg-gray-700 rounded-lg hover:bg-gray-600"
      >
        Deselect
      </button>
    </div>
  )
}

export default BulkActionBar

import React, { useState } from 'react'
import api from '../../services/api'
import { toast } from 'react-hot-toast'
import { orgApproveFinalized } from './useCreditDecision'

/** "Added 3 to the transcript. Sent 2 to Optio for review." */
export const bulkApproveMessage = (added, sent) => {
  const parts = []
  if (added) parts.push(`Added ${added} to the transcript.`)
  if (sent) parts.push(`Sent ${sent} to Optio for review.`)
  return parts.join(' ') || 'Nothing here was waiting on you.'
}

const BulkActionBar = ({ selectedCount, items, selectedIds, effectiveRole, onDeselectAll, onMerge, onRefresh }) => {
  const [bulkLoading, setBulkLoading] = useState(false)

  const selectedItems = items.filter(i => selectedIds.includes(i.completion_id))
  const allSameStudent = new Set(selectedItems.map(i => i.student_id)).size === 1
  const canMerge = selectedCount >= 2 && allSameStudent

  // How many of this selection the AI would approve. Shown, never acted on:
  // bulk approve sends no feedback and no XP change, so it must not be the path
  // that quietly accepts a recommendation nobody read.
  const aiApproveCount = selectedItems.filter(
    i => i.ai_status === 'complete' && i.ai_recommendation === 'approve'
  ).length
  const showAiCount = effectiveRole === 'superadmin' && selectedItems.some(i => i.ai_status)

  const handleBulkApprove = async () => {
    try {
      setBulkLoading(true)
      // What each approval did: the school stage either puts the credit on
      // the transcript or sends it to Optio (the server says which), and
      // Optio's own approval always puts it on the transcript.
      let added = 0
      let sent = 0
      for (const item of selectedItems) {
        if (effectiveRole === 'org_admin' && item.diploma_status === 'pending_org_approval') {
          const res = await api.post(`/api/credit-dashboard/items/${item.completion_id}/org-approve`, {})
          if (orgApproveFinalized(res)) added++
          else sent++
        } else if (effectiveRole !== 'org_admin' && item.diploma_status === 'pending_review') {
          // Optio's queue: the school-stage seat (org_admin, which the SIS
          // console passes for every school reviewer) cannot approve here.
          await api.post(`/api/credit-dashboard/items/${item.completion_id}/approve`, {})
          added++
        }
      }
      toast.success(bulkApproveMessage(added, sent))
      onDeselectAll()
      onRefresh()
    } catch (err) {
      toast.error('Bulk approve failed')
    } finally {
      setBulkLoading(false)
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-xl flex items-center gap-4 z-50">
      <span className="text-sm font-medium">{selectedCount} selected</span>

      {showAiCount && (
        <span
          className="text-xs text-gray-300"
          title="Bulk approve sends no feedback and makes no XP change. Open an item to use the AI's."
        >
          {aiApproveCount} AI-approve
        </span>
      )}

      {(effectiveRole === 'advisor' || effectiveRole === 'superadmin' || effectiveRole === 'org_admin') && (
        <button
          onClick={handleBulkApprove}
          disabled={bulkLoading}
          className="px-3 py-1.5 text-sm bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          Approve All
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

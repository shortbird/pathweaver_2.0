import React, { useState, useEffect } from 'react'
import api from '../../services/api'
import { toast } from 'react-hot-toast'

const MergeModal = ({ completionIds, items, onClose, onMerged }) => {
  const [survivorId, setSurvivorId] = useState(completionIds[0] || '')
  const [finalXp, setFinalXp] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [itemDetails, setItemDetails] = useState({})

  // Fetch evidence for each item
  useEffect(() => {
    const fetchDetails = async () => {
      const details = {}
      for (const id of completionIds) {
        try {
          const res = await api.get(`/api/credit-dashboard/items/${id}`)
          details[id] = res.data?.data || res.data
        } catch (err) {
          console.error(`Failed to fetch detail for ${id}`)
        }
      }
      setItemDetails(details)
    }
    fetchDetails()
  }, [completionIds])

  const handleMerge = async () => {
    if (!survivorId) {
      toast.error('Select a survivor task')
      return
    }
    if (!finalXp || parseInt(finalXp, 10) < 0) {
      toast.error('Enter a valid XP value')
      return
    }

    try {
      setLoading(true)
      await api.post('/api/credit-dashboard/merge', {
        completion_ids: completionIds,
        survivor_id: survivorId,
        final_xp: parseInt(finalXp, 10),
        reason
      })
      toast.success('Tasks merged successfully')
      onMerged()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Merge failed')
    } finally {
      setLoading(false)
    }
  }

  const totalOriginalXp = items.reduce((sum, i) => sum + (i.xp_value || 0), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Merge {completionIds.length} Tasks</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Task cards with evidence preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map(item => {
              const detail = itemDetails[item.completion_id]
              const evidenceBlocks = detail?.evidence_blocks || []
              const isSurvivor = survivorId === item.completion_id

              return (
                <div
                  key={item.completion_id}
                  onClick={() => setSurvivorId(item.completion_id)}
                  className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
                    isSurvivor
                      ? 'border-optio-purple bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="radio"
                      checked={isSurvivor}
                      onChange={() => setSurvivorId(item.completion_id)}
                      className="text-optio-purple focus:ring-optio-purple"
                    />
                    <span className="font-medium text-sm text-gray-900">{item.task_title}</span>
                    {isSurvivor && (
                      <span className="text-xs px-1.5 py-0.5 bg-optio-purple text-white rounded">Survivor</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-2">{item.xp_value} XP - {item.quest_title}</p>

                  {/* Evidence preview */}
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {evidenceBlocks.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No evidence</p>
                    ) : (
                      evidenceBlocks.slice(0, 3).map((block, i) => (
                        <div key={i} className="text-xs text-gray-600 truncate">
                          {block.block_type === 'text' && (typeof block.content === 'string' ? block.content : block.content?.text || '').substring(0, 100)}
                          {block.block_type === 'image' && '[Image]'}
                          {block.block_type === 'link' && `[Link: ${typeof block.content === 'string' ? block.content : block.content?.url || ''}]`}
                          {block.block_type === 'file' && `[File: ${block.metadata?.filename || 'file'}]`}
                          {block.block_type === 'document' && `[Doc: ${block.content?.items?.[0]?.title || 'document'}]`}
                        </div>
                      ))
                    )}
                    {evidenceBlocks.length > 3 && (
                      <p className="text-xs text-gray-400">+{evidenceBlocks.length - 3} more blocks</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Merge summary */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Merge Summary</h3>
            <p className="text-sm text-gray-600">
              {items.length} tasks @ {totalOriginalXp} XP total will become 1 task.
              All evidence from merged tasks will be consolidated into the selected survivor.
            </p>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Final XP Value</label>
                <input
                  type="number"
                  value={finalXp}
                  onChange={e => setFinalXp(e.target.value)}
                  placeholder="Enter final XP..."
                  className="w-full text-sm rounded-lg border-gray-300 focus:ring-optio-purple focus:border-optio-purple"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Merge Reason</label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Why are these tasks being merged?"
                rows={2}
                className="w-full text-sm rounded-lg border-gray-300 focus:ring-optio-purple focus:border-optio-purple"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleMerge}
            disabled={loading || !survivorId || !finalXp}
            className="px-4 py-2 text-sm font-medium text-white bg-optio-purple rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Merging...' : 'Confirm Merge'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default MergeModal

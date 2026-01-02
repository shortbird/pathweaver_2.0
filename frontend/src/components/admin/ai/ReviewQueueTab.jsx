import React, { useState, useEffect, useCallback } from 'react'
import api from '../../../services/api'
import toast from 'react-hot-toast'
import { MagnifyingGlassIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'

const ReviewQueueTab = () => {
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending_review')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [processing, setProcessing] = useState(false)
  const [selectedQuests, setSelectedQuests] = useState(new Set())
  const [selectedQuestForReview, setSelectedQuestForReview] = useState(null)

  useEffect(() => {
    fetchQuests()
  }, [statusFilter, sourceFilter, currentPage])

  const fetchQuests = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        status: statusFilter,
        page: currentPage,
        per_page: 20
      })

      if (sourceFilter !== 'all') {
        params.append('generation_source', sourceFilter)
      }

      const response = await api.get(`/api/admin/ai-quest-review?${params}`)
      setQuests(response.data.quests || [])
      setTotalPages(response.data.pagination?.total_pages || 1)
    } catch (error) {
      toast.error('Failed to load AI-generated quests')
      setQuests([])
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (questReviewId) => {
    setProcessing(true)
    try {
      await api.post(`/api/admin/ai-quest-review/${questReviewId}/approve`, {})
      toast.success('Quest approved and published!')
      fetchQuests()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to approve quest')
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async (questReviewId) => {
    if (!window.confirm('Are you sure you want to reject this quest?')) {
      return
    }

    setProcessing(true)
    try {
      await api.post(`/api/admin/ai-quest-review/${questReviewId}/reject`, {})
      toast.success('Quest rejected')
      fetchQuests()
    } catch (error) {
      toast.error('Failed to reject quest')
    } finally {
      setProcessing(false)
    }
  }

  const handleBulkApprove = async () => {
    if (selectedQuests.size === 0) {
      toast.error('Please select quests to approve')
      return
    }

    if (!window.confirm(`Approve ${selectedQuests.size} selected quests?`)) {
      return
    }

    setProcessing(true)
    try {
      const response = await api.post('/api/admin/ai-quest-review/bulk-approve', {
        quest_review_ids: Array.from(selectedQuests)
      })

      if (response.data.success) {
        toast.success(`${response.data.summary.approved_count} quests approved!`)
        if (response.data.summary.failed_count > 0) {
          toast.error(`${response.data.summary.failed_count} quests failed`)
        }
        setSelectedQuests(new Set())
        fetchQuests()
      }
    } catch (error) {
      toast.error('Failed to bulk approve quests')
    } finally {
      setProcessing(false)
    }
  }

  const handleBulkReject = async () => {
    if (selectedQuests.size === 0) {
      toast.error('Please select quests to reject')
      return
    }

    if (!window.confirm(`Reject ${selectedQuests.size} selected quests?`)) {
      return
    }

    setProcessing(true)
    try {
      const response = await api.post('/api/admin/ai-quest-review/bulk-reject', {
        quest_review_ids: Array.from(selectedQuests)
      })

      if (response.data.success) {
        toast.success(`${response.data.summary.rejected_count} quests rejected`)
        setSelectedQuests(new Set())
        fetchQuests()
      }
    } catch (error) {
      toast.error('Failed to bulk reject quests')
    } finally {
      setProcessing(false)
    }
  }

  const toggleQuestSelection = (questId) => {
    const newSelection = new Set(selectedQuests)
    if (newSelection.has(questId)) {
      newSelection.delete(questId)
    } else {
      newSelection.add(questId)
    }
    setSelectedQuests(newSelection)
  }

  const toggleSelectAll = () => {
    if (selectedQuests.size === filteredQuests.length) {
      setSelectedQuests(new Set())
    } else {
      setSelectedQuests(new Set(filteredQuests.map(q => q.id)))
    }
  }

  // Keyboard shortcuts
  const handleKeyPress = useCallback((e) => {
    if (selectedQuestForReview) {
      if (e.key.toLowerCase() === 'a') {
        handleApprove(selectedQuestForReview.id)
        setSelectedQuestForReview(null)
      } else if (e.key.toLowerCase() === 'r') {
        handleReject(selectedQuestForReview.id)
        setSelectedQuestForReview(null)
      } else if (e.key === 'Escape') {
        setSelectedQuestForReview(null)
      }
    }
  }, [selectedQuestForReview])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress)
    return () => document.removeEventListener('keydown', handleKeyPress)
  }, [handleKeyPress])

  const getStatusBadge = (status) => {
    const statusStyles = {
      pending_review: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800'
    }
    return statusStyles[status] || 'bg-gray-100 text-gray-800'
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const filteredQuests = quests.filter(quest => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    const questData = quest.quest_data || {}
    return (
      questData.title?.toLowerCase().includes(search) ||
      questData.big_idea?.toLowerCase().includes(search) ||
      questData.description?.toLowerCase().includes(search)
    )
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading review queue...</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900">AI Quest Review Queue</h2>
        <p className="text-sm text-gray-600 mt-1">
          Review and approve AI-generated quests before publishing
        </p>
      </div>

      {/* Filters and Actions */}
      <div className="px-6 py-4 border-b bg-gray-50">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {/* Status Filter */}
            {['pending_review', 'approved', 'rejected', 'all'].map((status) => (
              <button
                key={status}
                onClick={() => {
                  setStatusFilter(status)
                  setCurrentPage(1)
                }}
                className={`px-3 py-2 rounded-lg font-medium capitalize text-sm transition-colors ${
                  statusFilter === status
                    ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {status.replace('_', ' ')}
              </button>
            ))}

            {/* Source Filter */}
            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value)
                setCurrentPage(1)
              }}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm"
            >
              <option value="all">All Sources</option>
              <option value="ai_generated">AI Generated</option>
              <option value="advisor_ai">Advisor AI</option>
              <option value="student_ai">Student AI</option>
            </select>
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search quests..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            />
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedQuests.size > 0 && (
          <div className="mt-4 flex items-center gap-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-sm font-medium text-blue-900">
              {selectedQuests.size} selected
            </span>
            <button
              onClick={handleBulkApprove}
              disabled={processing}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircleIcon className="w-4 h-4" />
              Approve All
            </button>
            <button
              onClick={handleBulkReject}
              disabled={processing}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              <XCircleIcon className="w-4 h-4" />
              Reject All
            </button>
          </div>
        )}
      </div>

      {/* Quest Table */}
      <div className="flex-1 overflow-auto p-6">
        {filteredQuests.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No quests found matching your filters
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="p-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedQuests.size === filteredQuests.length && filteredQuests.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700">Quest Title</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700">Source</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700">Submitted</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700">Quality</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="p-3 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuests.map((quest) => (
                <tr
                  key={quest.id}
                  className="border-t border-gray-200 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedQuestForReview(quest)}
                >
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedQuests.has(quest.id)}
                      onChange={() => toggleQuestSelection(quest.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="p-3 text-sm text-gray-900 font-medium">
                    {quest.quest_data?.title || 'Untitled Quest'}
                  </td>
                  <td className="p-3 text-sm text-gray-600">
                    {quest.generation_source || 'Unknown'}
                  </td>
                  <td className="p-3 text-sm text-gray-600">
                    {formatDate(quest.created_at)}
                  </td>
                  <td className="p-3 text-sm">
                    {quest.quality_score ? (
                      <span className={`font-medium ${
                        quest.quality_score >= 80 ? 'text-green-600' :
                        quest.quality_score >= 60 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {quest.quality_score}%
                      </span>
                    ) : (
                      <span className="text-gray-400">N/A</span>
                    )}
                  </td>
                  <td className="p-3 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(quest.status)}`}>
                      {quest.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-3 text-sm" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleApprove(quest.id)}
                        disabled={processing || quest.status === 'approved'}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                        title="Approve (A)"
                      >
                        <CheckCircleIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleReject(quest.id)}
                        disabled={processing || quest.status === 'rejected'}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                        title="Reject (R)"
                      >
                        <XCircleIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 mt-6">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {selectedQuestForReview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6 border-b">
              <h3 className="text-xl font-bold text-gray-900">
                {selectedQuestForReview.quest_data?.title || 'Untitled Quest'}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Press A to approve, R to reject, Esc to close
              </p>
            </div>
            <div className="p-6">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                {JSON.stringify(selectedQuestForReview.quest_data, null, 2)}
              </pre>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setSelectedQuestForReview(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => {
                  handleReject(selectedQuestForReview.id)
                  setSelectedQuestForReview(null)
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Reject (R)
              </button>
              <button
                onClick={() => {
                  handleApprove(selectedQuestForReview.id)
                  setSelectedQuestForReview(null)
                }}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Approve (A)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReviewQueueTab

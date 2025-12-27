import React, { useState, useEffect } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { XMarkIcon, MagnifyingGlassIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'

const AIQuestReviewModal = ({ isOpen, onClose, onApprove }) => {
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending_review')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [processing, setProcessing] = useState(false)
  const [selectedQuests, setSelectedQuests] = useState(new Set())

  useEffect(() => {
    if (isOpen) {
      fetchQuests()
    }
  }, [isOpen, statusFilter, sourceFilter, currentPage])

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
      console.error('Error fetching quests:', error)
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
      if (onApprove) onApprove()
    } catch (error) {
      console.error('Error approving quest:', error)
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
      console.error('Error rejecting quest:', error)
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
        if (onApprove) onApprove()
      }
    } catch (error) {
      console.error('Error in bulk approve:', error)
      toast.error('Failed to bulk approve quests')
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b flex justify-between items-center bg-gradient-to-r from-optio-purple to-optio-pink">
          <div>
            <h3 className="text-xl font-bold text-white" style={{ fontFamily: 'Poppins, sans-serif' }}>
              AI-Generated Quest Review
            </h3>
            <p className="text-sm text-white/80 mt-1">Review and approve quests before publishing</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full transition-colors text-white"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
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
                  className={`px-3 py-2 rounded-lg font-medium capitalize text-sm ${
                    statusFilter === status
                      ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  style={{ fontFamily: 'Poppins, sans-serif' }}
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
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                style={{ fontFamily: 'Poppins, sans-serif' }}
                aria-label="Filter quests by source"
              >
                <option value="all">All Sources</option>
                <option value="batch">Batch Generated</option>
                <option value="manual">Manual</option>
                <option value="badge_aligned">Badge Aligned</option>
              </select>
            </div>

            {/* Bulk Actions */}
            {selectedQuests.size > 0 && statusFilter === 'pending_review' && (
              <button
                onClick={handleBulkApprove}
                disabled={processing}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold text-sm flex items-center gap-2"
                style={{ fontFamily: 'Poppins, sans-serif' }}
              >
                <CheckCircleIcon className="w-4 h-4" />
                Approve {selectedQuests.size} Selected
              </button>
            )}
          </div>

          {/* Search */}
          <div className="mt-3 relative">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by title or description..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              style={{ fontFamily: 'Poppins, sans-serif' }}
              aria-label="Search quests by title or description"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
            </div>
          ) : filteredQuests.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-xl border border-gray-200">
              <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-lg font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                No quests found
              </h3>
              <p className="text-gray-600" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {searchTerm
                  ? 'No quests match your search'
                  : statusFilter === 'pending_review'
                  ? 'No quests awaiting review'
                  : `No ${statusFilter} quests found`
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Select All */}
              {statusFilter === 'pending_review' && filteredQuests.length > 0 && (
                <label className="flex items-center gap-2 p-3 bg-gray-100 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedQuests.size === filteredQuests.length}
                    onChange={toggleSelectAll}
                    className="w-5 h-5 text-optio-purple rounded focus:ring-optio-purple"
                  />
                  <span className="text-sm font-medium text-gray-700" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Select All ({filteredQuests.length})
                  </span>
                </label>
              )}

              {/* Quest Cards */}
              {filteredQuests.map((quest) => {
                const questData = quest.quest_data || {}
                return (
                  <div
                    key={quest.id}
                    className={`bg-white border-2 rounded-lg p-5 hover:shadow-md transition-all ${
                      selectedQuests.has(quest.id) ? 'border-optio-purple' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Checkbox */}
                      {quest.status === 'pending_review' && (
                        <input
                          type="checkbox"
                          checked={selectedQuests.has(quest.id)}
                          onChange={() => toggleQuestSelection(quest.id)}
                          className="mt-1 w-5 h-5 text-optio-purple rounded focus:ring-optio-purple"
                          aria-label={`Select quest: ${questData.title || 'Untitled Quest'}`}
                        />
                      )}

                      {/* Content */}
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <h4 className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {questData.title || 'Untitled Quest'}
                          </h4>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${getStatusBadge(quest.status)}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {quest.status.replace('_', ' ')}
                          </span>
                        </div>

                        <p className="text-gray-600 mb-3 text-sm leading-relaxed" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          {questData.big_idea || questData.description || 'No description available'}
                        </p>

                        <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          <span><strong>Source:</strong> {quest.generation_source || 'unknown'}</span>
                          <span><strong>Submitted:</strong> {formatDate(quest.submitted_at)}</span>
                          {quest.quality_score && (
                            <span><strong>Quality:</strong> {quest.quality_score.toFixed(1)}/10</span>
                          )}
                        </div>

                        {/* Actions */}
                        {quest.status === 'pending_review' && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApprove(quest.id)}
                              disabled={processing}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold text-sm flex items-center gap-2"
                              style={{ fontFamily: 'Poppins, sans-serif' }}
                            >
                              <CheckCircleIcon className="w-4 h-4" />
                              Approve & Publish
                            </button>
                            <button
                              onClick={() => handleReject(quest.id)}
                              disabled={processing}
                              className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-semibold text-sm flex items-center gap-2"
                              style={{ fontFamily: 'Poppins, sans-serif' }}
                            >
                              <XCircleIcon className="w-4 h-4" />
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer with Pagination */}
        <div className="px-6 py-4 border-t bg-gray-50">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {filteredQuests.length} quest{filteredQuests.length !== 1 ? 's' : ''}
              {selectedQuests.size > 0 && ` (${selectedQuests.size} selected)`}
            </p>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  style={{ fontFamily: 'Poppins, sans-serif' }}
                >
                  Previous
                </button>

                <span className="text-sm text-gray-600" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  style={{ fontFamily: 'Poppins, sans-serif' }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AIQuestReviewModal

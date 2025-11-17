import React, { useState, useEffect } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { X, Search } from 'lucide-react'
import UnifiedQuestForm from './UnifiedQuestForm'

const QuestSuggestionsModal = ({ isOpen, onClose }) => {
  const [questIdeas, setQuestIdeas] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [processing, setProcessing] = useState(false)
  const [showQuestForm, setShowQuestForm] = useState(false)
  const [selectedIdeaForQuest, setSelectedIdeaForQuest] = useState(null)

  useEffect(() => {
    if (isOpen) {
      fetchQuestIdeas()
    }
  }, [isOpen, statusFilter, currentPage])

  const fetchQuestIdeas = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/api/admin/quest-ideas?status=${statusFilter}&page=${currentPage}&per_page=10`)
      setQuestIdeas(response.data.quest_ideas || [])
      setTotalPages(response.data.total_pages || 1)
    } catch (error) {
      console.error('Error fetching quest ideas:', error)
      toast.error('Failed to load quest suggestions')
      setQuestIdeas([])
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async (ideaId) => {
    if (!window.confirm('Are you sure you want to reject this quest suggestion?')) {
      return
    }

    setProcessing(true)
    try {
      await api.put(`/api/admin/quest-ideas/${ideaId}/reject`, {})
      toast.success('Quest suggestion rejected')
      fetchQuestIdeas()
    } catch (error) {
      console.error('Error rejecting quest idea:', error)
      toast.error('Failed to reject quest suggestion')
    } finally {
      setProcessing(false)
    }
  }

  const handleCreateQuestFromIdea = (idea) => {
    setSelectedIdeaForQuest(idea)
    setShowQuestForm(true)
  }

  const handleQuestFormClose = () => {
    setShowQuestForm(false)
    setSelectedIdeaForQuest(null)
  }

  const handleQuestFormSuccess = async (newQuest) => {
    try {
      await api.put(`/api/admin/quest-ideas/${selectedIdeaForQuest.id}/approve`, {})
      fetchQuestIdeas()
      setShowQuestForm(false)
      setSelectedIdeaForQuest(null)
      toast.success('Quest created successfully from suggestion!')
    } catch (error) {
      console.error('Error updating quest idea status:', error)
      toast.error('Quest created but failed to update suggestion status')
    }
  }

  const getStatusBadge = (status) => {
    const statusStyles = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800'
    }
    return statusStyles[status] || 'bg-gray-100 text-gray-800'
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const filteredQuestIdeas = questIdeas.filter(idea => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      idea.title?.toLowerCase().includes(search) ||
      idea.description?.toLowerCase().includes(search) ||
      idea.users?.first_name?.toLowerCase().includes(search) ||
      idea.users?.last_name?.toLowerCase().includes(search) ||
      idea.users?.username?.toLowerCase().includes(search)
    )
  })

  if (!isOpen) return null

  return (
    <>
      {/* Main Modal */}
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
          {/* Header */}
          <div className="px-6 py-4 border-b flex justify-between items-center bg-gradient-to-r from-optio-purple to-optio-pink">
            <h3 className="text-xl font-bold text-white" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Quest Suggestions
            </h3>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-full transition-colors text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Filters and Search */}
          <div className="px-6 py-4 border-b bg-gray-50">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
              {/* Status Filter */}
              <div className="flex gap-2 flex-wrap">
                {['pending', 'approved', 'rejected', 'all'].map((status) => (
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
                    {status}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="flex-1 relative min-w-[250px]">
                <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by title, description, or student..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  style={{ fontFamily: 'Poppins, sans-serif' }}
                />
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
              </div>
            ) : filteredQuestIdeas.length === 0 ? (
              <div className="text-center py-16 bg-gray-50 rounded-xl border border-gray-200">
                <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  No quest suggestions found
                </h3>
                <p className="text-gray-600" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  {searchTerm
                    ? 'No suggestions match your search'
                    : statusFilter === 'pending'
                    ? 'No pending quest suggestions to review'
                    : `No ${statusFilter} quest suggestions found`
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredQuestIdeas.map((idea) => (
                  <div key={idea.id} className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {idea.title}
                          </h4>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusBadge(idea.status)}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {idea.status}
                          </span>
                        </div>
                        <p className="text-gray-600 mb-3 text-sm" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          {idea.description}
                        </p>
                        <div className="text-sm text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          <p className="mb-1">
                            <span className="font-medium text-gray-700">Submitted by:</span>{' '}
                            {idea.users?.first_name} {idea.users?.last_name} (@{idea.users?.username})
                          </p>
                          <p>
                            <span className="font-medium text-gray-700">Date:</span> {formatDate(idea.created_at)}
                          </p>
                          {idea.reviewed_at && (
                            <p>
                              <span className="font-medium text-gray-700">Reviewed:</span> {formatDate(idea.reviewed_at)}
                            </p>
                          )}
                          {idea.admin_feedback && (
                            <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                              <p className="text-xs font-semibold text-gray-700 mb-1">Admin Feedback:</p>
                              <p className="text-sm text-gray-600">{idea.admin_feedback}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {idea.status === 'pending' && (
                        <div className="flex flex-col gap-2 ml-4">
                          <button
                            onClick={() => handleCreateQuestFromIdea(idea)}
                            className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 font-semibold text-sm whitespace-nowrap"
                            style={{ fontFamily: 'Poppins, sans-serif' }}
                          >
                            Create Quest
                          </button>
                          <button
                            onClick={() => handleReject(idea.id)}
                            className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-semibold text-sm"
                            style={{ fontFamily: 'Poppins, sans-serif' }}
                            disabled={processing}
                          >
                            Reject
                          </button>
                        </div>
                      )}

                      {idea.status === 'approved' && (
                        <div className="ml-4">
                          <span className="px-4 py-2 bg-green-50 text-green-600 rounded-lg font-semibold text-sm" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            ✅ Approved
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer with Pagination */}
          <div className="px-6 py-4 border-t bg-gray-50">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {filteredQuestIdeas.length} suggestion{filteredQuestIdeas.length !== 1 ? 's' : ''} found
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

      {/* Unified Quest Form (overlays on top of modal) */}
      {showQuestForm && selectedIdeaForQuest && (
        <UnifiedQuestForm
          mode="create"
          quest={{
            title: selectedIdeaForQuest.title,
            big_idea: selectedIdeaForQuest.description,
            source: 'custom',
            quest_tasks: [{
              title: `Complete ${selectedIdeaForQuest.title}`,
              description: selectedIdeaForQuest.description,
              pillar: 'wellness',
              xp_amount: 100,
              order_index: 0,
              is_required: true,
              subject_xp_distribution: {}
            }]
          }}
          onClose={handleQuestFormClose}
          onSuccess={handleQuestFormSuccess}
        />
      )}
    </>
  )
}

export default QuestSuggestionsModal

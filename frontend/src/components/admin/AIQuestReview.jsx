import React, { useState, useEffect } from 'react'
import { Sparkles, TrendingUp, CheckCircle, XCircle, Clock, RefreshCw, Filter } from 'lucide-react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import AIQuestReviewCard from './AIQuestReviewCard'
import AIQuestEditorModal from './AIQuestEditorModal'

const AIQuestReview = () => {
  const [activeTab, setActiveTab] = useState('pending')
  const [reviewItems, setReviewItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [processingIds, setProcessingIds] = useState(new Set())

  // Editor modal state
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingReview, setEditingReview] = useState(null)

  // Filters
  const [sourceFilter, setSourceFilter] = useState('all')

  useEffect(() => {
    fetchReviewItems()
    fetchStats()
  }, [activeTab, sourceFilter])

  const fetchReviewItems = async () => {
    try {
      setLoading(true)

      const params = new URLSearchParams()

      // Status filter based on active tab
      // Map frontend tab names to database status values
      const statusMap = {
        'pending': 'pending_review',
        'approved': 'approved',
        'rejected': 'rejected'
      }

      if (activeTab !== 'all') {
        const dbStatus = statusMap[activeTab] || activeTab
        params.append('status', dbStatus)
      }

      // Source filter
      if (sourceFilter !== 'all') {
        params.append('generation_source', sourceFilter)
      }

      params.append('limit', '50')

      const response = await api.get(`/api/admin/ai-quest-review/items?${params.toString()}`)

      if (response.data.success) {
        setReviewItems(response.data.items)
      } else {
        toast.error('Failed to load review items')
      }
    } catch (error) {
      console.error('Error fetching review items:', error)
      toast.error('Failed to load review items')
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await api.get('/api/admin/ai-quest-review/stats')
      if (response.data.success) {
        setStats(response.data.stats)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const handleApprove = async (reviewId, notes) => {
    try {
      setProcessingIds(prev => new Set([...prev, reviewId]))

      const response = await api.post(`/api/admin/ai-quest-review/${reviewId}/approve`, {
        notes,
        create_quest: true
      })

      if (response.data.success) {
        toast.success('Quest approved and created successfully!')
        fetchReviewItems()
        fetchStats()
      } else {
        toast.error(response.data.error || 'Failed to approve quest')
      }
    } catch (error) {
      console.error('Error approving quest:', error)
      toast.error('Failed to approve quest')
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(reviewId)
        return newSet
      })
    }
  }

  const handleReject = async (reviewId, reason) => {
    try {
      setProcessingIds(prev => new Set([...prev, reviewId]))

      const response = await api.post(`/api/admin/ai-quest-review/${reviewId}/reject`, {
        reason
      })

      if (response.data.success) {
        toast.success('Quest rejected')
        fetchReviewItems()
        fetchStats()
      } else {
        toast.error(response.data.error || 'Failed to reject quest')
      }
    } catch (error) {
      console.error('Error rejecting quest:', error)
      toast.error('Failed to reject quest')
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(reviewId)
        return newSet
      })
    }
  }

  const handleEdit = (reviewItem) => {
    setEditingReview(reviewItem)
    setEditorOpen(true)
  }

  const handleSaveEdit = async (reviewId, updatedQuestData) => {
    try {
      setProcessingIds(prev => new Set([...prev, reviewId]))

      const response = await api.put(`/api/admin/ai-quest-review/${reviewId}/edit`, {
        quest_data: updatedQuestData
      })

      if (response.data.success) {
        toast.success('Quest updated successfully!')
        setEditorOpen(false)
        setEditingReview(null)
        fetchReviewItems()
      } else {
        toast.error(response.data.error || 'Failed to update quest')
      }
    } catch (error) {
      console.error('Error updating quest:', error)
      toast.error('Failed to update quest')
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(reviewId)
        return newSet
      })
    }
  }

  const tabs = [
    { id: 'pending', name: 'Pending Review', icon: Clock, count: stats?.pending_count || 0 },
    { id: 'approved', name: 'Approved', icon: CheckCircle, count: stats?.approved_count || 0 },
    { id: 'rejected', name: 'Rejected', icon: XCircle, count: stats?.rejected_count || 0 },
    { id: 'all', name: 'All', icon: Filter, count: stats?.total_submissions || 0 }
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-primary-reverse rounded-lg">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AI Quest Review</h1>
              <p className="text-sm text-gray-600">Review and approve AI-generated quests before publication</p>
            </div>
          </div>

          <button
            onClick={() => {
              fetchReviewItems()
              fetchStats()
            }}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-700">Pending</p>
                  <p className="text-2xl font-bold text-blue-900">{stats.pending_count || 0}</p>
                </div>
                <Clock className="h-8 w-8 text-blue-600" />
              </div>
            </div>

            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-700">Approved</p>
                  <p className="text-2xl font-bold text-green-900">{stats.approved_count || 0}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </div>

            <div className="bg-red-50 rounded-lg p-4 border border-red-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-red-700">Rejected</p>
                  <p className="text-2xl font-bold text-red-900">{stats.rejected_count || 0}</p>
                </div>
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-2">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'bg-gradient-primary-reverse text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  activeTab === tab.id
                    ? 'bg-white/20 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filters:</span>
          </div>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="all">All Sources</option>
            <option value="manual">Manual Generation</option>
            <option value="batch">Batch Generation</option>
            <option value="student_idea">Student Ideas</option>
            <option value="badge_aligned">Badge-Aligned</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 text-purple-600 animate-spin" />
          </div>
        ) : reviewItems.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <Sparkles className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No quests to review</h3>
            <p className="text-gray-600">
              {activeTab === 'pending'
                ? 'All caught up! No pending quests at the moment.'
                : `No ${activeTab} quests found with current filters.`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {reviewItems.map(item => (
              <AIQuestReviewCard
                key={item.id}
                reviewItem={item}
                onApprove={handleApprove}
                onReject={handleReject}
                onEdit={handleEdit}
                isProcessing={processingIds.has(item.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Editor Modal */}
      <AIQuestEditorModal
        reviewItem={editingReview}
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false)
          setEditingReview(null)
        }}
        onSave={handleSaveEdit}
        isProcessing={editingReview && processingIds.has(editingReview.id)}
      />
    </div>
  )
}

export default AIQuestReview

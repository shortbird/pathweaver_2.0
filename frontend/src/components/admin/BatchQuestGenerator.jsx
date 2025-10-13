import React, { useState, useEffect } from 'react'
import { Sparkles, Loader2, Zap, Image as ImageIcon, Upload, RefreshCw, CheckCircle, XCircle, Edit3 } from 'lucide-react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import AIQuestReviewCard from './AIQuestReviewCard'
import AIQuestEditorModal from './AIQuestEditorModal'

const BatchQuestGenerator = () => {
  const [batchConfig, setBatchConfig] = useState({
    count: 5,
    target_pillar: '',
    target_badge_id: '',
    difficulty_level: ''
  })
  const [generationInProgress, setGenerationInProgress] = useState(false)
  const [generationResult, setGenerationResult] = useState(null)
  const [badges, setBadges] = useState([])

  // Review queue state
  const [reviewItems, setReviewItems] = useState([])
  const [loadingReviews, setLoadingReviews] = useState(false)
  const [processingIds, setProcessingIds] = useState(new Set())

  // API usage tracking
  const [apiUsage, setApiUsage] = useState({ used: 0, limit: 200, remaining: 200, resets_at: '' })

  // Editor modal state
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingReview, setEditingReview] = useState(null)

  useEffect(() => {
    loadBadges()
    fetchApiUsage()
  }, [])

  const loadBadges = async () => {
    try {
      const response = await api.get('/api/badges')
      setBadges(response.data.badges || [])
    } catch (error) {
      console.error('Error loading badges:', error)
    }
  }

  const fetchApiUsage = async () => {
    try {
      const response = await api.get('/api/v3/admin/pexels/usage')
      if (response.data.success) {
        setApiUsage({
          used: response.data.used,
          limit: response.data.limit,
          remaining: response.data.remaining,
          resets_at: response.data.resets_at
        })
      }
    } catch (error) {
      console.error('Failed to fetch API usage')
    }
  }

  const fetchReviewItems = async () => {
    try {
      setLoadingReviews(true)
      const response = await api.get('/api/v3/admin/ai-quest-review/items', {
        params: {
          status: 'pending_review',
          generation_source: 'batch',
          limit: 20
        }
      })

      if (response.data.success) {
        setReviewItems(response.data.items || [])
      }
    } catch (error) {
      console.error('Error fetching review items:', error)
    } finally {
      setLoadingReviews(false)
    }
  }

  const handleGenerate = async () => {
    if (batchConfig.count < 1 || batchConfig.count > 20) {
      toast.error('Batch size must be between 1 and 20')
      return
    }

    setGenerationInProgress(true)
    setGenerationResult(null)

    try {
      const response = await api.post('/api/v3/admin/batch-generation/start', batchConfig)

      if (response.data.success) {
        setGenerationResult(response.data)
        toast.success(`Generated ${response.data.submitted_to_review} quests successfully!`)

        // Fetch the newly generated quests
        await fetchReviewItems()
      } else {
        toast.error(response.data.error || 'Failed to generate quests')
      }
    } catch (error) {
      console.error('Error generating quests:', error)
      toast.error('Failed to generate quests')
    } finally {
      setGenerationInProgress(false)
    }
  }

  const handleApprove = async (reviewId, notes) => {
    try {
      setProcessingIds(prev => new Set([...prev, reviewId]))

      const response = await api.post(`/api/v3/admin/ai-quest-review/${reviewId}/approve`, {
        notes,
        create_quest: true
      })

      if (response.data.success) {
        toast.success('Quest approved and created successfully!')
        await fetchReviewItems()
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

      const response = await api.post(`/api/v3/admin/ai-quest-review/${reviewId}/reject`, {
        reason
      })

      if (response.data.success) {
        toast.success('Quest rejected')
        await fetchReviewItems()
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

      const response = await api.put(`/api/v3/admin/ai-quest-review/${reviewId}/edit`, {
        quest_data: updatedQuestData
      })

      if (response.data.success) {
        toast.success('Quest updated successfully!')
        setEditorOpen(false)
        setEditingReview(null)
        await fetchReviewItems()
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

  const handleRefreshImage = async (reviewId) => {
    if (apiUsage.remaining < 1) {
      toast.error('No Pexels API calls remaining')
      return
    }

    const loadingToast = toast.loading('Generating image...')

    try {
      setProcessingIds(prev => new Set([...prev, reviewId]))

      const response = await api.post(`/api/v3/admin/ai-quest-review/${reviewId}/refresh-image`, {})

      toast.dismiss(loadingToast)

      if (response.data.success) {
        toast.success('Image generated successfully!')
        await fetchReviewItems()
        await fetchApiUsage()
      } else {
        toast.error(response.data.error || 'Failed to generate image')
      }
    } catch (error) {
      toast.dismiss(loadingToast)
      console.error('Error generating image:', error)
      toast.error('Failed to generate image')
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(reviewId)
        return newSet
      })
    }
  }

  const handleUploadImage = (reviewId) => {
    // Create file input element
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'image/jpeg,image/jpg,image/png,image/gif,image/webp'

    fileInput.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return

      // Validate file size (5MB max)
      const maxSize = 5 * 1024 * 1024
      if (file.size > maxSize) {
        toast.error('Image size must be less than 5MB')
        return
      }

      // Create FormData for file upload
      const formData = new FormData()
      formData.append('file', file)

      try {
        const loadingToast = toast.loading('Uploading image...')
        setProcessingIds(prev => new Set([...prev, reviewId]))

        const response = await api.post(
          `/api/v3/admin/ai-quest-review/${reviewId}/upload-image`,
          formData
        )

        toast.dismiss(loadingToast)

        if (response.data.success) {
          toast.success('Image uploaded successfully!')
          await fetchReviewItems()
        } else {
          toast.error(response.data.error || 'Failed to upload image')
        }
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to upload image')
      } finally {
        setProcessingIds(prev => {
          const newSet = new Set(prev)
          newSet.delete(reviewId)
          return newSet
        })
      }
    }

    // Trigger file selection dialog
    fileInput.click()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">Batch Quest Generator</h2>
            <p className="text-white/90">Generate multiple quests at once and review them here</p>
          </div>
          <Zap className="h-12 w-12 opacity-50" />
        </div>
      </div>

      {/* Pexels API Usage Indicator */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Pexels API Usage</h3>
            <p className="text-sm text-gray-600 mt-1">
              {apiUsage.used} / {apiUsage.limit} calls used • {apiUsage.remaining} remaining
            </p>
            <p className="text-xs text-gray-500 mt-1">Resets at {apiUsage.resets_at}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">{apiUsage.remaining}</div>
            <div className="text-xs text-gray-500">calls left</div>
          </div>
        </div>
        <div className="mt-3 bg-gray-200 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all"
            style={{ width: `${(apiUsage.used / apiUsage.limit) * 100}%` }}
          />
        </div>
      </div>

      {/* Configuration Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Generation Configuration</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Batch Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Number of Quests (1-20)
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={batchConfig.count}
              onChange={(e) => setBatchConfig({...batchConfig, count: parseInt(e.target.value) || 1})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          {/* Target Pillar */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target Pillar (Optional)
            </label>
            <select
              value={batchConfig.target_pillar}
              onChange={(e) => setBatchConfig({...batchConfig, target_pillar: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">Any Pillar</option>
              <option value="life_wellness">Life & Wellness</option>
              <option value="language_communication">Language & Communication</option>
              <option value="stem_logic">STEM & Logic</option>
              <option value="society_culture">Society & Culture</option>
              <option value="arts_creativity">Arts & Creativity</option>
            </select>
          </div>

          {/* Difficulty Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Difficulty Level (Optional)
            </label>
            <select
              value={batchConfig.difficulty_level}
              onChange={(e) => setBatchConfig({...batchConfig, difficulty_level: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">Any Difficulty</option>
              <option value="beginner">Beginner (100-200 XP)</option>
              <option value="intermediate">Intermediate (201-400 XP)</option>
              <option value="advanced">Advanced (401+ XP)</option>
            </select>
          </div>

          {/* Target Badge */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target Badge (Optional)
            </label>
            <select
              value={batchConfig.target_badge_id}
              onChange={(e) => setBatchConfig({...batchConfig, target_badge_id: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">No Badge Targeting</option>
              {badges.map((badge) => (
                <option key={badge.id} value={badge.id}>{badge.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={generationInProgress}
          className="w-full mt-6 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white py-3 px-6 rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {generationInProgress ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5" />
              <span>Generate {batchConfig.count} Quest{batchConfig.count !== 1 ? 's' : ''}</span>
            </>
          )}
        </button>
      </div>

      {/* Generation Results Summary */}
      {generationResult && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Generation Results</h3>
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
              {generationResult.submitted_to_review} / {generationResult.total_requested} Successful
            </span>
          </div>

          {/* Generated Quests Summary */}
          {generationResult.generated && generationResult.generated.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-gray-700 mb-3">Generated Quests</h4>
              <div className="space-y-2">
                {generationResult.generated.map((quest, index) => (
                  <div key={index} className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">{quest.quest_title}</span>
                      <span className="text-sm text-green-600">Quality: {quest.quality_score}/10</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Failed Quests */}
          {generationResult.failed && generationResult.failed.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-700 mb-3">Failed</h4>
              <div className="space-y-2">
                {generationResult.failed.map((failure, index) => (
                  <div key={index} className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-700">{failure.error}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Review Queue Section */}
      {reviewItems.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Generated Quests - Ready for Review</h3>
              <p className="text-sm text-gray-600 mt-1">Review, add images, and approve quests below</p>
            </div>
            <button
              onClick={fetchReviewItems}
              disabled={loadingReviews}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${loadingReviews ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {loadingReviews ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 text-purple-600 animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {reviewItems.map(item => (
                <div key={item.id} className="relative">
                  {/* Enhanced Review Card with Image Actions */}
                  <AIQuestReviewCard
                    reviewItem={item}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onEdit={handleEdit}
                    isProcessing={processingIds.has(item.id)}
                  />

                  {/* Image Management Actions */}
                  <div className="mt-3 flex items-center justify-end space-x-2 px-4 pb-3">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleRefreshImage(item.id)}
                        disabled={processingIds.has(item.id) || apiUsage.remaining < 1}
                        className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                        title={apiUsage.remaining < 1 ? 'No API calls remaining' : 'Generate image from Pexels'}
                      >
                        <ImageIcon className="h-4 w-4" />
                        <span>Generate Image</span>
                      </button>

                      <button
                        onClick={() => handleUploadImage(item.id)}
                        disabled={processingIds.has(item.id)}
                        className="flex items-center space-x-1 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        <Upload className="h-4 w-4" />
                        <span>Upload Image</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

export default BatchQuestGenerator

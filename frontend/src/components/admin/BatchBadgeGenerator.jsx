import React, { useState } from 'react'
import { Sparkles, Loader2, Award } from 'lucide-react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import BadgeReviewCard from './BadgeReviewCard'
import BadgeEditorModal from './BadgeEditorModal'

const BatchBadgeGenerator = ({ apiUsage, fetchApiUsage }) => {
  const [batchConfig, setBatchConfig] = useState({
    count: 3,
    target_pillar: '',
    complexity_level: '',
    trending_topic: ''
  })
  const [generationInProgress, setGenerationInProgress] = useState(false)
  const [generationResult, setGenerationResult] = useState(null)
  const [reviewBadges, setReviewBadges] = useState([])
  const [processingIds, setProcessingIds] = useState(new Set())

  // Editor modal state
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingBadge, setEditingBadge] = useState(null)

  const handleGenerate = async () => {
    if (batchConfig.count < 1 || batchConfig.count > 10) {
      toast.error('Batch size must be between 1 and 10')
      return
    }

    setGenerationInProgress(true)
    setGenerationResult(null)

    try {
      const response = await api.post('/api/admin/batch-badge-generation/start', batchConfig)

      if (response.data.success) {
        setGenerationResult(response.data)
        setReviewBadges(response.data.generated || [])
        toast.success(`Generated ${response.data.submitted_to_review} badges successfully!`)
      } else {
        toast.error(response.data.error || 'Failed to generate badges')
      }
    } catch (error) {
      console.error('Error generating badges:', error)
      toast.error(error.response?.data?.error || 'Failed to generate badges')
    } finally {
      setGenerationInProgress(false)
    }
  }

  const handleApprove = async (badge, options) => {
    const { generateQuests, generateImage } = options

    try {
      setProcessingIds(prev => new Set([...prev, badge.temp_id]))

      const response = await api.post('/api/admin/batch-badge-generation/approve', {
        badge_data: badge,
        generate_image: generateImage,
        generate_quests: generateQuests,
        quest_count: 10
      })

      if (response.data.success) {
        let message = 'Badge created successfully!'
        if (generateImage) message += ' Image generated.'
        if (generateQuests) message += ` ${response.data.quests_generated} quests generated.`

        toast.success(message)

        // Remove from review queue
        setReviewBadges(prev => prev.filter(b => b.temp_id !== badge.temp_id))

        // Refresh API usage if image was generated
        if (generateImage && fetchApiUsage) {
          fetchApiUsage()
        }
      } else {
        toast.error(response.data.error || 'Failed to create badge')
      }
    } catch (error) {
      console.error('Error approving badge:', error)
      toast.error(error.response?.data?.error || 'Failed to approve badge')
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(badge.temp_id)
        return newSet
      })
    }
  }

  const handleReject = async (badge) => {
    const reason = window.prompt('Reason for rejection (optional):')

    try {
      setProcessingIds(prev => new Set([...prev, badge.temp_id]))

      await api.post('/api/admin/batch-badge-generation/reject', {
        temp_id: badge.temp_id,
        reason: reason || 'No reason provided'
      })

      toast.success('Badge rejected')

      // Remove from review queue
      setReviewBadges(prev => prev.filter(b => b.temp_id !== badge.temp_id))

    } catch (error) {
      console.error('Error rejecting badge:', error)
      toast.error('Failed to reject badge')
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(badge.temp_id)
        return newSet
      })
    }
  }

  const handleEdit = (badge) => {
    setEditingBadge(badge)
    setEditorOpen(true)
  }

  const handleSaveEdit = async (updatedBadge) => {
    try {
      setProcessingIds(prev => new Set([...prev, updatedBadge.temp_id]))

      // Update in the review list
      setReviewBadges(prev => prev.map(b =>
        b.temp_id === updatedBadge.temp_id ? updatedBadge : b
      ))

      toast.success('Badge updated successfully!')
      setEditorOpen(false)
      setEditingBadge(null)

    } catch (error) {
      console.error('Error updating badge:', error)
      toast.error('Failed to update badge')
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(updatedBadge.temp_id)
        return newSet
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r bg-gradient-primary-reverse rounded-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">Batch Badge Generator</h2>
            <p className="text-white/90">Generate multiple identity-based badges at once</p>
          </div>
          <Award className="h-12 w-12 opacity-50" />
        </div>
      </div>

      {/* Configuration Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Generation Configuration</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Batch Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Number of Badges (1-10)
            </label>
            <input
              type="number"
              min="1"
              max="10"
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

          {/* Complexity Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Complexity Level (Optional)
            </label>
            <select
              value={batchConfig.complexity_level}
              onChange={(e) => setBatchConfig({...batchConfig, complexity_level: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">Any Complexity</option>
              <option value="beginner">Beginner (5+ quests, 1000+ XP)</option>
              <option value="intermediate">Intermediate (7+ quests, 2000+ XP)</option>
              <option value="advanced">Advanced (10+ quests, 3000+ XP)</option>
            </select>
          </div>

          {/* Trending Topic */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Trending Topic (Optional)
            </label>
            <input
              type="text"
              value={batchConfig.trending_topic}
              onChange={(e) => setBatchConfig({...batchConfig, trending_topic: e.target.value})}
              placeholder="e.g., Game Design, Environmental Science"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={generationInProgress}
          className="w-full mt-6 bg-gradient-to-r bg-gradient-primary-reverse text-white py-3 px-6 rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {generationInProgress ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5" />
              <span>Generate {batchConfig.count} Badge{batchConfig.count !== 1 ? 's' : ''}</span>
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

          {/* Failed Badges */}
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

      {/* Review Queue */}
      {reviewBadges.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Generated Badges - Ready for Review</h3>
              <p className="text-sm text-gray-600 mt-1">Review and approve badges below</p>
            </div>
            <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
              {reviewBadges.length} pending
            </span>
          </div>

          <div className="space-y-6">
            {reviewBadges.map(badge => (
              <BadgeReviewCard
                key={badge.temp_id}
                badge={badge}
                onApprove={handleApprove}
                onReject={handleReject}
                onEdit={handleEdit}
                isProcessing={processingIds.has(badge.temp_id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Editor Modal */}
      <BadgeEditorModal
        badge={editingBadge}
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false)
          setEditingBadge(null)
        }}
        onSave={handleSaveEdit}
        isProcessing={editingBadge && processingIds.has(editingBadge.temp_id)}
      />
    </div>
  )
}

export default BatchBadgeGenerator

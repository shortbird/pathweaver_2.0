import React, { useState, useEffect } from 'react'
import { Sparkles, Loader2, Zap } from 'lucide-react'
import api from '../../services/api'
import toast from 'react-hot-toast'

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

  useEffect(() => {
    loadBadges()
  }, [])

  const loadBadges = async () => {
    try {
      const response = await api.get('/api/badges')
      setBadges(response.data.badges || [])
    } catch (error) {
      console.error('Error loading badges:', error)
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">Batch Quest Generator</h2>
            <p className="text-white/90">Generate multiple quests at once</p>
          </div>
          <Zap className="h-12 w-12 opacity-50" />
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

      {/* Generation Results */}
      {generationResult && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Generation Results</h3>
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
              {generationResult.submitted_to_review} / {generationResult.total_requested} Successful
            </span>
          </div>

          {/* Generated Quests */}
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

          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-700">
              All generated quests have been submitted to the AI Quest Review queue for admin approval.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default BatchQuestGenerator

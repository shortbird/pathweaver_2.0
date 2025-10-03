import React, { useState, useEffect } from 'react'
import { Sparkles, TrendingUp, Target, AlertCircle, CheckCircle, Loader2, BarChart3, Zap } from 'lucide-react'
import api from '../../services/api'
import toast from 'react-hot-toast'

const BatchQuestGenerator = () => {
  const [loading, setLoading] = useState(false)
  const [gapAnalysis, setGapAnalysis] = useState(null)
  const [batchConfig, setBatchConfig] = useState({
    count: 5,
    target_pillar: '',
    target_badge_id: '',
    difficulty_level: ''
  })
  const [generationInProgress, setGenerationInProgress] = useState(false)
  const [generationResult, setGenerationResult] = useState(null)
  const [badges, setBadges] = useState([])
  const [activeTab, setActiveTab] = useState('gaps') // 'gaps' | 'generate'

  useEffect(() => {
    loadGapAnalysis()
    loadBadges()
  }, [])

  const loadGapAnalysis = async () => {
    setLoading(true)
    try {
      const response = await api.get('/api/v3/admin/batch-generation/content-gaps')
      if (response.data.success) {
        setGapAnalysis(response.data)
      } else {
        toast.error('Failed to load content gap analysis')
      }
    } catch (error) {
      console.error('Error loading gap analysis:', error)
      toast.error('Failed to load gap analysis')
    } finally {
      setLoading(false)
    }
  }

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

        // Reload gap analysis to show updated state
        setTimeout(() => loadGapAnalysis(), 2000)
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

  const handleQuickFill = (recommendation) => {
    setBatchConfig({
      count: recommendation.suggested_count || 5,
      target_pillar: recommendation.pillar || '',
      target_badge_id: recommendation.badge_id || '',
      difficulty_level: recommendation.level === 'beginner' ? 'beginner' : ''
    })
    setActiveTab('generate')
    toast.success('Configuration loaded from recommendation')
  }

  const getPillarColor = (pillar) => {
    const colors = {
      'life_wellness': 'bg-green-100 text-green-800',
      'language_communication': 'bg-blue-100 text-blue-800',
      'stem_logic': 'bg-purple-100 text-purple-800',
      'society_culture': 'bg-orange-100 text-orange-800',
      'arts_creativity': 'bg-pink-100 text-pink-800'
    }
    return colors[pillar] || 'bg-gray-100 text-gray-800'
  }

  const getPillarName = (pillar) => {
    const names = {
      'life_wellness': 'Life & Wellness',
      'language_communication': 'Language & Communication',
      'stem_logic': 'STEM & Logic',
      'society_culture': 'Society & Culture',
      'arts_creativity': 'Arts & Creativity'
    }
    return names[pillar] || pillar
  }

  const getPriorityBadge = (priority) => {
    const badges = {
      'high': 'bg-red-100 text-red-800',
      'medium': 'bg-yellow-100 text-yellow-800',
      'low': 'bg-gray-100 text-gray-800'
    }
    return badges[priority] || badges.low
  }

  if (loading && !gapAnalysis) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">Batch Quest Generator</h2>
            <p className="text-white/90">Generate multiple quests at once and fill content gaps</p>
          </div>
          <Zap className="h-12 w-12 opacity-50" />
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('gaps')}
          className={`pb-3 px-4 font-medium transition-colors ${
            activeTab === 'gaps'
              ? 'border-b-2 border-purple-600 text-purple-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <BarChart3 className="h-4 w-4 inline mr-2" />
          Content Gap Analysis
        </button>
        <button
          onClick={() => setActiveTab('generate')}
          className={`pb-3 px-4 font-medium transition-colors ${
            activeTab === 'generate'
              ? 'border-b-2 border-purple-600 text-purple-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Sparkles className="h-4 w-4 inline mr-2" />
          Generate Quests
        </button>
      </div>

      {/* Content Gap Analysis Tab */}
      {activeTab === 'gaps' && gapAnalysis && (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Total Quests</span>
                <span className="text-2xl font-bold text-gray-900">{gapAnalysis.total_quests}</span>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Beginner Quests</span>
                <span className="text-2xl font-bold text-green-600">{gapAnalysis.xp_level_distribution?.beginner || 0}</span>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Advanced Quests</span>
                <span className="text-2xl font-bold text-purple-600">{gapAnalysis.xp_level_distribution?.advanced || 0}</span>
              </div>
            </div>
          </div>

          {/* Pillar Distribution */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Pillar Distribution</h3>
            <div className="space-y-4">
              {Object.entries(gapAnalysis.pillar_distribution || {}).map(([pillar, data]) => (
                <div key={pillar}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getPillarColor(pillar)}`}>
                      {getPillarName(pillar)}
                    </span>
                    <div className="flex items-center space-x-3">
                      <span className="text-sm text-gray-600">{data.count} quests</span>
                      <span className="text-sm font-medium text-gray-900">{data.percentage.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        data.percentage >= 15 ? 'bg-green-500' :
                        data.percentage >= 10 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(data.percentage, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          {gapAnalysis.recommendations && gapAnalysis.recommendations.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recommendations</h3>
              <div className="space-y-3">
                {gapAnalysis.recommendations.map((rec, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityBadge(rec.priority)}`}>
                            {rec.priority}
                          </span>
                          <span className="text-xs text-gray-500 uppercase">{rec.type}</span>
                        </div>
                        <h4 className="font-medium text-gray-900 mb-1">{rec.recommendation}</h4>
                        <p className="text-sm text-gray-600">{rec.reason}</p>
                      </div>
                      <button
                        onClick={() => handleQuickFill(rec)}
                        className="ml-4 px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200 transition-colors"
                      >
                        Quick Fill
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Badge Coverage */}
          {gapAnalysis.badge_coverage && gapAnalysis.badge_coverage.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Badge Coverage</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {gapAnalysis.badge_coverage.map((badge) => (
                  <div
                    key={badge.badge_id}
                    className={`rounded-lg p-4 border ${
                      badge.needs_more ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900">{badge.badge_name}</h4>
                      {badge.needs_more && (
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{badge.linked_quests} quests</span>
                      {badge.needs_more && (
                        <span className="text-red-600 font-medium">Need {10 - badge.linked_quests} more</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Generate Quests Tab */}
      {activeTab === 'generate' && (
        <div className="space-y-6">
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
      )}
    </div>
  )
}

export default BatchQuestGenerator

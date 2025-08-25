import React, { useState, useEffect } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

const AIQuestBulkGenerator = ({ onClose, onQuestsGenerated }) => {
  const [activeTab, setActiveTab] = useState('generate')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationJobs, setGenerationJobs] = useState([])
  const [reviewQueue, setReviewQueue] = useState([])
  const [selectedQuest, setSelectedQuest] = useState(null)
  const [isReviewing, setIsReviewing] = useState(false)
  
  // Generation parameters
  const [questCount, setQuestCount] = useState(10)
  const [categoryDistribution, setCategoryDistribution] = useState('even')
  const [difficultyDistribution, setDifficultyDistribution] = useState({
    beginner: 0.4,
    intermediate: 0.4,
    advanced: 0.2
  })
  const [themes, setThemes] = useState([])
  const [currentTheme, setCurrentTheme] = useState('')

  useEffect(() => {
    if (activeTab === 'review') {
      fetchReviewQueue()
    } else if (activeTab === 'history') {
      fetchGenerationJobs()
    }
  }, [activeTab])

  const fetchGenerationJobs = async () => {
    try {
      const response = await api.get('/ai-quests/generation-jobs')
      setGenerationJobs(response.data.jobs || [])
    } catch (error) {
      console.error('Error fetching generation jobs:', error)
    }
  }

  const fetchReviewQueue = async () => {
    try {
      const response = await api.get('/ai-quests/review-queue')
      setReviewQueue(response.data.quests || [])
    } catch (error) {
      console.error('Error fetching review queue:', error)
    }
  }

  const handleGenerateBatch = async () => {
    setIsGenerating(true)
    
    try {
      const response = await api.post('/ai-quests/generate-batch', {
        count: questCount,
        distribution: {
          categories: categoryDistribution,
          difficulties: difficultyDistribution,
          themes: themes
        }
      })

      if (response.data) {
        toast.success(`Successfully generated ${response.data.generated_count} quests! ${response.data.approved_count} were auto-approved.`)
        fetchGenerationJobs()
        setActiveTab('review')
        fetchReviewQueue()
      }
    } catch (error) {
      console.error('Error generating batch:', error)
      toast.error('Failed to generate quests. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleReviewAction = async (questId, action, modifications) => {
    setIsReviewing(true)
    
    try {
      const response = await api.post(`/ai-quests/review/${questId}`, {
        action,
        modifications,
        notes: ''
      })

      if (response.data) {
        // Update local state
        setReviewQueue(prev => prev.filter(q => q.id !== questId))
        setSelectedQuest(null)
        
        // Show success message
        const actionText = action === 'approve' ? 'approved and published' : action === 'reject' ? 'rejected' : 'modified'
        toast.success(`Quest ${actionText} successfully!`)
        
        if (action === 'approve' && onQuestsGenerated) {
          onQuestsGenerated()
        }
      }
    } catch (error) {
      console.error('Error reviewing quest:', error)
      toast.error('Failed to review quest. Please try again.')
    } finally {
      setIsReviewing(false)
    }
  }

  const handleAutoPublish = async () => {
    if (!confirm('This will automatically publish all high-quality quests (score >= 80). Continue?')) {
      return
    }

    try {
      const response = await api.post('/ai-quests/auto-publish')
      
      if (response.data) {
        toast.success(`Successfully published ${response.data.published_count} high-quality quests!`)
        fetchReviewQueue()
        if (onQuestsGenerated) {
          onQuestsGenerated()
        }
      }
    } catch (error) {
      console.error('Error auto-publishing:', error)
      toast.error('Failed to auto-publish quests. Please try again.')
    }
  }

  const QualityScoreBadge = ({ score }) => {
    const getColor = () => {
      if (score >= 80) return 'bg-green-100 text-green-800'
      if (score >= 60) return 'bg-yellow-100 text-yellow-800'
      return 'bg-red-100 text-red-800'
    }

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getColor()}`}>
        {score.toFixed(0)}%
      </span>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <span className="text-purple-600">✨</span>
              AI Bulk Quest Generator
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>
          
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setActiveTab('generate')}
              className={`px-4 py-2 rounded-lg ${
                activeTab === 'generate' 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Generate
            </button>
            <button
              onClick={() => setActiveTab('review')}
              className={`px-4 py-2 rounded-lg relative ${
                activeTab === 'review' 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Review Queue
              {reviewQueue.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {reviewQueue.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-lg ${
                activeTab === 'history' 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              History
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 180px)' }}>
          {/* Generation Tab */}
          {activeTab === 'generate' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Number of Quests
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={questCount}
                    onChange={(e) => setQuestCount(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category Distribution
                  </label>
                  <select
                    value={categoryDistribution}
                    onChange={(e) => setCategoryDistribution(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="even">Even Distribution</option>
                    <option value="reading_writing">Focus on Reading & Writing</option>
                    <option value="thinking_skills">Focus on Thinking Skills</option>
                    <option value="personal_growth">Focus on Personal Growth</option>
                    <option value="life_skills">Focus on Life Skills</option>
                    <option value="making_creating">Focus on Making & Creating</option>
                    <option value="world_understanding">Focus on World Understanding</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Difficulty Distribution
                </label>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-gray-600">Beginner ({(difficultyDistribution.beginner * 100).toFixed(0)}%)</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={difficultyDistribution.beginner * 100}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) / 100
                        const remaining = 1 - value
                        setDifficultyDistribution({
                          beginner: value,
                          intermediate: remaining * 0.6,
                          advanced: remaining * 0.4
                        })
                      }}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Intermediate ({(difficultyDistribution.intermediate * 100).toFixed(0)}%)</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={difficultyDistribution.intermediate * 100}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) / 100
                        const remaining = 1 - value
                        setDifficultyDistribution({
                          beginner: remaining * 0.5,
                          intermediate: value,
                          advanced: remaining * 0.5
                        })
                      }}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Advanced ({(difficultyDistribution.advanced * 100).toFixed(0)}%)</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={difficultyDistribution.advanced * 100}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) / 100
                        const remaining = 1 - value
                        setDifficultyDistribution({
                          beginner: remaining * 0.5,
                          intermediate: remaining * 0.5,
                          advanced: value
                        })
                      }}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Themes (Optional)
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={currentTheme}
                    onChange={(e) => setCurrentTheme(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && currentTheme.trim()) {
                        setThemes([...themes, currentTheme.trim()])
                        setCurrentTheme('')
                      }
                    }}
                    placeholder="Enter theme and press Enter"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {themes.map((theme, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm flex items-center gap-1"
                    >
                      {theme}
                      <button
                        onClick={() => setThemes(themes.filter((_, i) => i !== index))}
                        className="ml-1 text-purple-600 hover:text-purple-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <h3 className="font-semibold text-purple-900 mb-2">Generation Summary</h3>
                <ul className="text-sm text-purple-700 space-y-1">
                  <li>• Will generate {questCount} quests</li>
                  <li>• Distribution: {categoryDistribution === 'even' ? 'Even across all categories' : `Focus on ${categoryDistribution.replace('_', ' ')}`}</li>
                  <li>• Difficulty: {(difficultyDistribution.beginner * 100).toFixed(0)}% Beginner, {(difficultyDistribution.intermediate * 100).toFixed(0)}% Intermediate, {(difficultyDistribution.advanced * 100).toFixed(0)}% Advanced</li>
                  {themes.length > 0 && <li>• Themes: {themes.join(', ')}</li>}
                  <li>• Estimated cost: ${(questCount * 0.0005).toFixed(2)} (using Gemini 1.5 Flash)</li>
                </ul>
              </div>

              <button
                onClick={handleGenerateBatch}
                disabled={isGenerating}
                className="w-full py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Generating Quests...
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    Generate {questCount} Quests
                  </>
                )}
              </button>
            </div>
          )}

          {/* Review Tab */}
          {activeTab === 'review' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <p className="text-gray-600">
                  {reviewQueue.length} quest{reviewQueue.length !== 1 ? 's' : ''} pending review
                </p>
                <button
                  onClick={handleAutoPublish}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                >
                  <span>✓</span>
                  Auto-Publish High Quality
                </button>
              </div>

              {reviewQueue.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-xl mb-2">📋</p>
                  <p>No quests pending review</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {reviewQueue.map((quest) => (
                    <div
                      key={quest.id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-lg">
                          {quest.quest_data.title}
                        </h3>
                        <QualityScoreBadge score={quest.quality_score} />
                      </div>
                      <p className="text-gray-600 text-sm mb-3">
                        {quest.quest_data.description}
                      </p>
                      <div className="flex gap-4 text-sm text-gray-500">
                        <span>Category: {quest.quest_data.skill_category}</span>
                        <span>Difficulty: {quest.quest_data.difficulty_level}</span>
                        <span>Hours: {quest.quest_data.estimated_hours}</span>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => handleReviewAction(quest.id, 'approve')}
                          disabled={isReviewing}
                          className="px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 flex items-center gap-1"
                        >
                          <span>✓</span>
                          Approve
                        </button>
                        <button
                          onClick={() => handleReviewAction(quest.id, 'reject')}
                          disabled={isReviewing}
                          className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 flex items-center gap-1"
                        >
                          <span>✗</span>
                          Reject
                        </button>
                        <button
                          onClick={() => setSelectedQuest(quest)}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 flex items-center gap-1"
                        >
                          <span>👁</span>
                          View Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div>
              <div className="space-y-4">
                {generationJobs.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p className="text-xl mb-2">📊</p>
                    <p>No generation history yet</p>
                  </div>
                ) : (
                  generationJobs.map((job) => (
                    <div key={job.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                            job.status === 'completed' ? 'bg-green-100 text-green-800' :
                            job.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                            job.status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {job.status}
                          </span>
                          <p className="text-sm text-gray-600 mt-1">
                            {new Date(job.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">
                            {job.generated_count} generated
                          </p>
                          <p className="text-xs text-gray-600">
                            {job.approved_count} approved, {job.rejected_count} rejected
                          </p>
                        </div>
                      </div>
                      {job.error_message && (
                        <p className="text-sm text-red-600 mt-2">
                          Error: {job.error_message}
                        </p>
                      )}
                      <div className="mt-3 text-xs text-gray-500">
                        Parameters: {job.parameters.count} quests, {job.parameters.distribution.categories} distribution
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Quest Detail Modal */}
        {selectedQuest && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold">{selectedQuest.quest_data.title}</h2>
                <button
                  onClick={() => setSelectedQuest(null)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <QualityScoreBadge score={selectedQuest.quality_score} />
                  <span className="text-sm text-gray-600">
                    Quality Score: {selectedQuest.quality_score.toFixed(1)}%
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-semibold text-gray-700">Description</h3>
                    <p className="text-gray-600">{selectedQuest.quest_data.description}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-700">Details</h3>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>Category: {selectedQuest.quest_data.skill_category}</li>
                      <li>Difficulty: {selectedQuest.quest_data.difficulty_level}</li>
                      <li>Effort: {selectedQuest.quest_data.effort_level}</li>
                      <li>Hours: {selectedQuest.quest_data.estimated_hours}</li>
                    </ul>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-700">Evidence Requirements</h3>
                  <p className="text-gray-600">{selectedQuest.quest_data.evidence_requirements}</p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-700">Core Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedQuest.quest_data.core_skills?.map((skill) => (
                      <span key={skill} className="px-2 py-1 bg-gray-100 rounded text-sm">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-700">XP Awards</h3>
                  <div className="space-y-1">
                    {selectedQuest.quest_data.skill_xp_awards?.map((award, index) => (
                      <div key={index} className="text-sm">
                        {award.skill_category}: {award.xp_amount} XP
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <button
                    onClick={() => {
                      handleReviewAction(selectedQuest.id, 'approve')
                      setSelectedQuest(null)
                    }}
                    disabled={isReviewing}
                    className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    Approve & Publish
                  </button>
                  <button
                    onClick={() => {
                      handleReviewAction(selectedQuest.id, 'reject')
                      setSelectedQuest(null)
                    }}
                    disabled={isReviewing}
                    className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => setSelectedQuest(null)}
                    className="flex-1 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AIQuestBulkGenerator
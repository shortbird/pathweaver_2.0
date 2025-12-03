import React, { useState, useEffect } from 'react'
import { Sparkles, Lightbulb, TrendingUp, AlertCircle, CheckCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import api from '../../services/api'
import { toast } from 'react-hot-toast'

const QuestIdeaSuggestions = ({ title, description, onApplySuggestion }) => {
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState(null)
  const [similarQuests, setSimilarQuests] = useState(null)
  const [validation, setValidation] = useState(null)
  const [taskRecommendations, setTaskRecommendations] = useState(null)
  const [expandedSections, setExpandedSections] = useState({
    improvements: true,
    pillars: true,
    validation: false,
    similar: false,
    tasks: false
  })

  const getSuggestions = async () => {
    if (!title?.trim() || !description?.trim()) {
      return
    }

    setLoading(true)
    try {
      const response = await api.post('/api/student-ai/suggest-improvements', {
        title,
        description
      })

      if (response.data.success) {
        setSuggestions(response.data.suggestions)
      } else {
        toast.error('Failed to get AI suggestions')
      }
    } catch (error) {
      console.error('Error getting suggestions:', error)
      toast.error('Failed to get AI suggestions')
    } finally {
      setLoading(false)
    }
  }

  const getSimilarQuests = async () => {
    if (!title?.trim() || !description?.trim()) {
      return
    }

    try {
      const response = await api.post('/api/student-ai/similar-quests', {
        title,
        description,
        limit: 3
      })

      if (response.data.success) {
        setSimilarQuests(response.data.recommendations)
      }
    } catch (error) {
      console.error('Error getting similar quests:', error)
    }
  }

  const validateIdea = async () => {
    if (!title?.trim() || !description?.trim()) {
      return
    }

    try {
      const response = await api.post('/api/student-ai/validate-idea', {
        title,
        description
      })

      if (response.data.success) {
        setValidation(response.data.validation)
      }
    } catch (error) {
      console.error('Error validating idea:', error)
    }
  }

  const getTaskRecommendations = async () => {
    if (!title?.trim() || !description?.trim()) {
      return
    }

    try {
      const response = await api.post('/api/student-ai/recommend-tasks', {
        title,
        description,
        num_tasks: 3
      })

      if (response.data.success) {
        setTaskRecommendations(response.data.task_recommendations)
      }
    } catch (error) {
      console.error('Error getting task recommendations:', error)
    }
  }

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600 bg-green-50'
    if (score >= 60) return 'text-yellow-600 bg-yellow-50'
    return 'text-red-600 bg-red-50'
  }

  const getScoreBadgeColor = (score) => {
    if (score >= 80) return 'bg-green-100 text-green-800'
    if (score >= 60) return 'bg-yellow-100 text-yellow-800'
    return 'bg-red-100 text-red-800'
  }

  if (!title?.trim() || !description?.trim()) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
        <Lightbulb className="h-8 w-8 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-600 text-sm">
          Fill in the title and description to get AI-powered suggestions
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Get Suggestions Button */}
      {!suggestions && (
        <button
          onClick={getSuggestions}
          disabled={loading}
          className="w-full bg-gradient-primary text-white py-3 px-4 rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center space-x-2"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Getting AI Suggestions...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5" />
              <span>Get AI Suggestions</span>
            </>
          )}
        </button>
      )}

      {/* Loading State */}
      {loading && suggestions === null && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <Loader2 className="h-5 w-5 text-optio-purple animate-spin" />
            <span className="text-purple-800 font-medium">Analyzing your quest idea...</span>
          </div>
        </div>
      )}

      {/* Overall Assessment */}
      {suggestions && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Lightbulb className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-blue-900 mb-1">AI Assessment</h4>
              <p className="text-sm text-blue-700">{suggestions.overall_assessment}</p>
            </div>
          </div>
        </div>
      )}

      {/* Strengths */}
      {suggestions?.strengths && suggestions.strengths.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-medium text-green-900 mb-2">What's Great</h4>
              <ul className="space-y-1">
                {suggestions.strengths.map((strength, index) => (
                  <li key={index} className="text-sm text-green-700 flex items-start">
                    <span className="mr-2">•</span>
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Improvements Section */}
      {suggestions?.improvements && (suggestions.improvements.title || suggestions.improvements.description) && (
        <div className="bg-white border border-gray-200 rounded-lg">
          <button
            onClick={() => toggleSection('improvements')}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-optio-purple" />
              <h4 className="font-medium text-gray-900">Suggested Improvements</h4>
            </div>
            {expandedSections.improvements ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </button>

          {expandedSections.improvements && (
            <div className="p-4 pt-0 space-y-4">
              {suggestions.improvements.title && (
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Better Title</h5>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <p className="text-sm text-purple-900">{suggestions.improvements.title}</p>
                  </div>
                  {onApplySuggestion && (
                    <button
                      onClick={() => onApplySuggestion('title', suggestions.improvements.title)}
                      className="mt-2 text-xs text-optio-purple hover:text-purple-700 font-medium"
                    >
                      Apply this suggestion
                    </button>
                  )}
                </div>
              )}

              {suggestions.improvements.description && (
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Better Description</h5>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <p className="text-sm text-purple-900">{suggestions.improvements.description}</p>
                  </div>
                  {onApplySuggestion && (
                    <button
                      onClick={() => onApplySuggestion('description', suggestions.improvements.description)}
                      className="mt-2 text-xs text-optio-purple hover:text-purple-700 font-medium"
                    >
                      Apply this suggestion
                    </button>
                  )}
                </div>
              )}

              {suggestions.improvements.reasoning && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600">{suggestions.improvements.reasoning}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pillar Recommendations */}
      {suggestions?.pillar_recommendations && suggestions.pillar_recommendations.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg">
          <button
            onClick={() => toggleSection('pillars')}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center space-x-2">
              <Sparkles className="h-5 w-5 text-optio-purple" />
              <h4 className="font-medium text-gray-900">Learning Pillar Recommendations</h4>
            </div>
            {expandedSections.pillars ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </button>

          {expandedSections.pillars && (
            <div className="p-4 pt-0 space-y-3">
              {suggestions.pillar_recommendations
                .sort((a, b) => b.relevance_score - a.relevance_score)
                .map((pillar, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900">{pillar.pillar}</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getScoreBadgeColor(pillar.relevance_score)}`}>
                        {pillar.relevance_score}% match
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{pillar.reasoning}</p>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* XP Recommendation */}
      {suggestions?.xp_recommendation && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-blue-900">Recommended XP</h4>
            <span className="text-xl font-bold text-blue-600">{suggestions.xp_recommendation.estimated_xp} XP</span>
          </div>
          <div className="space-y-1 text-sm text-blue-700">
            <p>Complexity: <span className="font-medium capitalize">{suggestions.xp_recommendation.complexity_level}</span></p>
            <p>Estimated Time: <span className="font-medium">{suggestions.xp_recommendation.time_estimate}</span></p>
            <p className="text-xs mt-2">{suggestions.xp_recommendation.reasoning}</p>
          </div>
        </div>
      )}

      {/* Philosophy Alignment */}
      {suggestions?.philosophy_alignment && (
        <div className={`rounded-lg p-4 border ${getScoreColor(suggestions.philosophy_alignment.score)}`}>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium">Philosophy Alignment</h4>
            <span className="text-lg font-bold">{suggestions.philosophy_alignment.score}%</span>
          </div>
          <p className="text-sm mb-2">{suggestions.philosophy_alignment.feedback}</p>
          {suggestions.philosophy_alignment.suggestions && (
            <p className="text-xs mt-2 opacity-80">{suggestions.philosophy_alignment.suggestions}</p>
          )}
        </div>
      )}

      {/* Quick Actions */}
      {suggestions && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              validateIdea()
              toggleSection('validation')
            }}
            className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Validate Readiness
          </button>
          <button
            onClick={() => {
              getSimilarQuests()
              toggleSection('similar')
            }}
            className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Find Similar Quests
          </button>
          <button
            onClick={() => {
              getTaskRecommendations()
              toggleSection('tasks')
            }}
            className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors col-span-2"
          >
            Get Task Suggestions
          </button>
        </div>
      )}

      {/* Validation Results */}
      {validation && expandedSections.validation && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-900">Validation Results</h4>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              validation.is_ready ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
            }`}>
              {validation.is_ready ? 'Ready to Submit' : 'Needs Improvement'}
            </span>
          </div>
          <div className="space-y-2">
            {Object.entries(validation.validation_results || {}).map(([key, result]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${getScoreBadgeColor(result.score)}`}>
                  {result.score}%
                </span>
              </div>
            ))}
          </div>
          {validation.encouragement && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-3">
              <p className="text-sm text-green-700">{validation.encouragement}</p>
            </div>
          )}
        </div>
      )}

      {/* Similar Quests */}
      {similarQuests && expandedSections.similar && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Similar Quests for Inspiration</h4>
          <div className="space-y-3">
            {similarQuests.similar_quests?.map((quest, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-start justify-between mb-2">
                  <h5 className="font-medium text-gray-900 flex-1">{quest.title}</h5>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getScoreBadgeColor(quest.similarity_score)}`}>
                    {quest.similarity_score}% similar
                  </span>
                </div>
                <p className="text-xs text-gray-600 mb-2">{quest.why_similar}</p>
                <p className="text-xs text-optio-purple">{quest.inspiration_points}</p>
              </div>
            ))}
          </div>
          {similarQuests.unique_aspects && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
              <h5 className="font-medium text-blue-900 text-sm mb-1">What Makes Yours Unique</h5>
              <p className="text-xs text-blue-700">{similarQuests.unique_aspects}</p>
            </div>
          )}
        </div>
      )}

      {/* Task Recommendations */}
      {taskRecommendations && expandedSections.tasks && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Suggested Tasks</h4>
          <div className="space-y-3">
            {taskRecommendations.tasks?.map((task, index) => (
              <div key={index} className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <div className="flex items-start justify-between mb-2">
                  <h5 className="font-medium text-purple-900">{task.title}</h5>
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-200 text-purple-800">
                    {task.estimated_xp} XP
                  </span>
                </div>
                <p className="text-sm text-purple-700 mb-2">{task.description}</p>
                <div className="flex items-center justify-between text-xs text-optio-purple">
                  <span>Pillar: {task.pillar}</span>
                  <span>Time: {task.estimated_time}</span>
                </div>
                {task.evidence_suggestion && (
                  <p className="text-xs text-optio-purple mt-2">
                    <strong>Evidence:</strong> {task.evidence_suggestion}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default QuestIdeaSuggestions

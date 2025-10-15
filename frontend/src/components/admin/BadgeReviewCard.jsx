import React from 'react'
import { CheckCircle, XCircle, Edit3, Star, Award } from 'lucide-react'

const BadgeReviewCard = ({ badge, onApprove, onReject, onEdit, isProcessing }) => {
  const {
    name,
    identity_statement,
    description,
    pillar_primary,
    pillar_weights,
    min_quests,
    min_xp,
    quality_score,
    quality_feedback
  } = badge

  const getQualityColor = (score) => {
    if (score >= 0.85) return 'text-green-600 bg-green-50'
    if (score >= 0.7) return 'text-yellow-600 bg-yellow-50'
    return 'text-red-600 bg-red-50'
  }

  const getPillarColor = (pillar) => {
    const colors = {
      'STEM & Logic': 'bg-blue-100 text-blue-800',
      'Life & Wellness': 'bg-green-100 text-green-800',
      'Language & Communication': 'bg-purple-100 text-purple-800',
      'Society & Culture': 'bg-orange-100 text-orange-800',
      'Arts & Creativity': 'bg-pink-100 text-pink-800'
    }
    return colors[pillar] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-xl font-bold text-gray-900">{name}</h3>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPillarColor(pillar_primary)}`}>
              {pillar_primary}
            </span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getQualityColor(quality_score)}`}>
              <Star className="inline h-3 w-3 mr-1" />
              {(quality_score * 10).toFixed(1)}/10
            </span>
          </div>
          <p className="text-sm italic text-gray-600 mb-2">"{identity_statement}"</p>
        </div>
      </div>

      {/* Description */}
      <div className="mb-4">
        <p className="text-gray-700 text-sm">{description}</p>
      </div>

      {/* Requirements */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-500 font-medium mb-1">Minimum Quests</div>
          <div className="text-lg font-bold text-gray-900">{min_quests}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-500 font-medium mb-1">Minimum XP</div>
          <div className="text-lg font-bold text-gray-900">{min_xp}</div>
        </div>
      </div>

      {/* Pillar Weights */}
      {pillar_weights && (
        <div className="mb-4">
          <div className="text-xs font-medium text-gray-500 mb-2">Pillar Distribution</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(pillar_weights).map(([pillar, weight]) => (
              <span key={pillar} className="text-xs px-2 py-1 bg-gray-100 rounded-full">
                {pillar}: {weight}%
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Quality Feedback */}
      {quality_feedback && (
        <div className="mb-4 border-t pt-4">
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
              Quality Assessment Details
            </summary>
            <div className="mt-2 space-y-2">
              {quality_feedback.strengths && quality_feedback.strengths.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-green-700 mb-1">Strengths:</div>
                  <ul className="text-xs text-gray-600 list-disc list-inside">
                    {quality_feedback.strengths.map((strength, idx) => (
                      <li key={idx}>{strength}</li>
                    ))}
                  </ul>
                </div>
              )}
              {quality_feedback.weaknesses && quality_feedback.weaknesses.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-yellow-700 mb-1">Areas for Improvement:</div>
                  <ul className="text-xs text-gray-600 list-disc list-inside">
                    {quality_feedback.weaknesses.map((weakness, idx) => (
                      <li key={idx}>{weakness}</li>
                    ))}
                  </ul>
                </div>
              )}
              {quality_feedback.recommendation && (
                <div className="text-xs">
                  <span className="font-medium">Recommendation: </span>
                  <span className={`font-semibold ${
                    quality_feedback.recommendation === 'publish' ? 'text-green-600' :
                    quality_feedback.recommendation === 'review' ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {quality_feedback.recommendation.toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </details>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 border-t pt-4">
        <button
          onClick={() => onApprove(badge, { generateQuests: false, generateImage: false })}
          disabled={isProcessing}
          className="flex-1 flex items-center justify-center space-x-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          <CheckCircle className="h-4 w-4" />
          <span>Approve</span>
        </button>

        <button
          onClick={() => onApprove(badge, { generateQuests: false, generateImage: true })}
          disabled={isProcessing}
          className="flex-1 flex items-center justify-center space-x-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          <Award className="h-4 w-4" />
          <span>+ Image</span>
        </button>

        <button
          onClick={() => onApprove(badge, { generateQuests: true, generateImage: true })}
          disabled={isProcessing}
          className="flex-1 flex items-center justify-center space-x-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          <Award className="h-4 w-4" />
          <span>+ Quests</span>
        </button>

        <button
          onClick={() => onEdit(badge)}
          disabled={isProcessing}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          <Edit3 className="h-4 w-4" />
        </button>

        <button
          onClick={() => onReject(badge)}
          disabled={isProcessing}
          className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          <XCircle className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export default BadgeReviewCard

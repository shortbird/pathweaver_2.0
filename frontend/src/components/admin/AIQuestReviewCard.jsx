import React, { useState } from 'react'
import { CheckCircle, XCircle, Edit3, ChevronDown, ChevronUp, AlertCircle, Clock } from 'lucide-react'
import { format } from 'date-fns'

const AIQuestReviewCard = ({ reviewItem, onApprove, onReject, onEdit, isProcessing }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [approveNotes, setApproveNotes] = useState('')
  const [showApproveForm, setShowApproveForm] = useState(false)

  const questData = reviewItem.quest_data
  const aiFeedback = reviewItem.ai_feedback || {}

  // Get status badge
  const getStatusBadge = (status) => {
    const badges = {
      pending_review: 'bg-blue-100 text-blue-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      edited: 'bg-purple-100 text-purple-800'
    }
    return badges[status] || badges.pending_review
  }

  // Calculate total XP from tasks
  const totalXP = questData.tasks?.reduce((sum, task) => sum + (task.xp_value || task.xp_amount || 0), 0) || 0

  // Get pillar distribution
  const pillarCounts = {}
  questData.tasks?.forEach(task => {
    const pillar = task.pillar || 'Unknown'
    pillarCounts[pillar] = (pillarCounts[pillar] || 0) + 1
  })

  const handleApprove = () => {
    if (onApprove) {
      onApprove(reviewItem.id, approveNotes)
      setShowApproveForm(false)
      setApproveNotes('')
    }
  }

  const handleReject = () => {
    if (rejectReason.trim() && onReject) {
      onReject(reviewItem.id, rejectReason)
      setShowRejectForm(false)
      setRejectReason('')
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      {/* Card Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <h3 className="text-lg font-bold text-gray-900">{questData.title}</h3>
              {reviewItem.was_edited && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                  <Edit3 className="h-3 w-3 mr-1" />
                  Edited
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 line-clamp-2">{questData.big_idea}</p>
          </div>
        </div>

        {/* Metadata Row */}
        <div className="flex items-center space-x-4 mt-3 text-xs text-gray-500">
          <span className={`inline-flex items-center px-2 py-1 rounded-full font-medium ${getStatusBadge(reviewItem.status)}`}>
            {reviewItem.status.replace('_', ' ').toUpperCase()}
          </span>
          <span className="flex items-center">
            <Clock className="h-3 w-3 mr-1" />
            {format(new Date(reviewItem.submitted_at), 'MMM d, yyyy h:mm a')}
          </span>
          <span>{questData.tasks?.length || 0} tasks</span>
          <span>{totalXP} XP total</span>
          {reviewItem.generation_source && (
            <span className="capitalize">{reviewItem.generation_source}</span>
          )}
        </div>
      </div>

      {/* Quick Summary (Always Visible) */}
      <div className="p-4 bg-gray-50">
        <div className="grid grid-cols-2 gap-4">
          {/* Pillar Distribution */}
          <div>
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Pillar Distribution</h4>
            <div className="space-y-1">
              {Object.entries(pillarCounts).map(([pillar, count]) => (
                <div key={pillar} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">{pillar}</span>
                  <span className="font-medium text-gray-900">{count} tasks</span>
                </div>
              ))}
            </div>
          </div>

          {/* AI Feedback Summary */}
          <div>
            <h4 className="text-xs font-semibold text-gray-700 mb-2">AI Assessment</h4>
            {aiFeedback.strengths && aiFeedback.strengths.length > 0 && (
              <div className="mb-2">
                <p className="text-xs text-green-700 font-medium mb-1">Strengths:</p>
                <ul className="text-xs text-gray-600 space-y-0.5">
                  {aiFeedback.strengths.slice(0, 2).map((strength, idx) => (
                    <li key={idx} className="line-clamp-1">• {strength}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expandable Details */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-100">
          {/* Tasks Preview */}
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">Tasks ({questData.tasks?.length || 0})</h4>
            <div className="space-y-2">
              {questData.tasks?.map((task, idx) => (
                <div key={idx} className="bg-gray-50 rounded p-3 border border-gray-200">
                  <div className="flex items-start justify-between mb-1">
                    <h5 className="text-sm font-medium text-gray-900">{task.title}</h5>
                    <div className="flex items-center space-x-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                        {task.pillar}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        {task.xp_value || task.xp_amount || 0} XP
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600">{task.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* AI Feedback Details */}
          {aiFeedback && (
            <div className="grid grid-cols-2 gap-4">
              {aiFeedback.strengths && aiFeedback.strengths.length > 0 && (
                <div>
                  <h5 className="text-sm font-semibold text-green-700 mb-2 flex items-center">
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Strengths
                  </h5>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {aiFeedback.strengths.map((strength, idx) => (
                      <li key={idx}>• {strength}</li>
                    ))}
                  </ul>
                </div>
              )}

              {aiFeedback.improvements && aiFeedback.improvements.length > 0 && (
                <div>
                  <h5 className="text-sm font-semibold text-orange-700 mb-2 flex items-center">
                    <AlertCircle className="h-4 w-4 mr-1" />
                    Suggested Improvements
                  </h5>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {aiFeedback.improvements.map((improvement, idx) => (
                      <li key={idx}>• {improvement}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        {/* Expand/Collapse Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-900"
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span>{isExpanded ? 'Show Less' : 'Show Details'}</span>
        </button>

        {/* Action Buttons (Only for pending reviews) */}
        {reviewItem.status === 'pending_review' && (
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowApproveForm(true)}
              disabled={isProcessing}
              className="flex items-center space-x-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <CheckCircle className="h-4 w-4" />
              <span>Approve</span>
            </button>

            {onEdit && (
              <button
                onClick={() => onEdit(reviewItem)}
                disabled={isProcessing}
                className="flex items-center space-x-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Edit3 className="h-4 w-4" />
                <span>Edit</span>
              </button>
            )}

            <button
              onClick={() => setShowRejectForm(true)}
              disabled={isProcessing}
              className="flex items-center space-x-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <XCircle className="h-4 w-4" />
              <span>Reject</span>
            </button>
          </div>
        )}
      </div>

      {/* Approve Form Modal */}
      {showApproveForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Approve Quest</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will create the quest in the database and make it available to students.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Review Notes (Optional)
              </label>
              <textarea
                value={approveNotes}
                onChange={(e) => setApproveNotes(e.target.value)}
                rows={3}
                placeholder="Any notes about this quest..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
              />
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleApprove}
                disabled={isProcessing}
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                Confirm Approval
              </button>
              <button
                onClick={() => setShowApproveForm(false)}
                disabled={isProcessing}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Form Modal */}
      {showRejectForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Reject Quest</h3>
            <p className="text-sm text-gray-600 mb-4">
              Please provide a reason for rejecting this quest. This will help improve future AI generations.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rejection Reason *
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                placeholder="Why is this quest being rejected?"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
              />
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleReject}
                disabled={isProcessing || !rejectReason.trim()}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Confirm Rejection
              </button>
              <button
                onClick={() => {
                  setShowRejectForm(false)
                  setRejectReason('')
                }}
                disabled={isProcessing}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AIQuestReviewCard

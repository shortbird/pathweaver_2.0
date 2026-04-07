import React, { useState, useEffect } from 'react'
import api from '../../services/api'
import StatusTimeline from './StatusTimeline'
import { toast } from 'react-hot-toast'

// Evidence block content can be a string or an object like {text: "..."}
const getBlockText = (content) => {
  if (typeof content === 'string') return content
  if (content && typeof content === 'object') return content.text || content.url || JSON.stringify(content)
  return String(content ?? '')
}

// Normalize items from evidence blocks (handles both single-item and multi-item formats)
const getBlockItems = (content, type) => {
  if (!content || typeof content !== 'object') return []
  if (Array.isArray(content.items)) return content.items
  // Legacy single-item format
  if (content.url) return [content]
  return []
}

const ALL_SUBJECTS = [
  'language_arts', 'math', 'science', 'social_studies',
  'financial_literacy', 'health', 'pe', 'fine_arts',
  'cte', 'digital_literacy', 'electives'
]

const formatSubject = (s) => {
  if (s === 'pe') return 'PE'
  if (s === 'cte') return 'CTE'
  return s.replace(/_/g, ' ')
}

const ItemDetail = ({ item, detail, loading, effectiveRole, onRefresh, onAdvance, onGrowThis, onFeedbackChange, feedbackTextareaRef }) => {
  const [feedback, setFeedback] = useState('')
  const [flagReason, setFlagReason] = useState('')
  const [overrideJustification, setOverrideJustification] = useState('')
  const [overrideXp, setOverrideXp] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [showOverrideForm, setShowOverrideForm] = useState(false)
  const [editedSubjects, setEditedSubjects] = useState({})

  // Sync editedSubjects when detail changes
  useEffect(() => {
    setEditedSubjects(detail?.suggested_subjects || {})
  }, [detail])

  if (!item) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm">Select an item to view details</p>
          <p className="text-xs mt-1 text-gray-300">Use j/k to navigate, Enter to select</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
      </div>
    )
  }

  const completion = detail?.completion || {}
  const task = detail?.task || {}
  const quest = detail?.quest || {}
  const student = detail?.student || {}
  const evidenceBlocks = detail?.evidence_blocks || []
  const reviewRounds = detail?.review_rounds || []
  const accreditorReviews = detail?.accreditor_reviews || []
  const suggestedSubjects = detail?.suggested_subjects || {}

  const isOrgAdmin = effectiveRole === 'org_admin'
  const isAdvisor = effectiveRole === 'advisor' || effectiveRole === 'superadmin'
  const isAccreditor = effectiveRole === 'accreditor' || effectiveRole === 'superadmin'
  const isOrgStudent = detail?.is_org_student || item?.is_org_student || false
  const canOrgAdminAct = isOrgAdmin && completion.diploma_status === 'pending_org_approval'
  const canAdvisorAct = isAdvisor && ['pending_review', 'pending_optio_approval'].includes(completion.diploma_status)
  const canAccreditorAct = isAccreditor && completion.diploma_status === 'approved'
  const canEditSubjects = canAdvisorAct || canOrgAdminAct

  const handleOrgApprove = async () => {
    const completionId = item.completion_id
    const savedFeedback = feedback
    const savedSubjects = { ...editedSubjects }
    for (const [k, v] of Object.entries(savedSubjects)) {
      if (!v || v <= 0) delete savedSubjects[k]
    }
    setFeedback('')
    if (onAdvance) onAdvance(completionId)
    try {
      await api.post(`/api/credit-dashboard/items/${completionId}/org-approve`, {
        feedback: savedFeedback || undefined,
        subjects: Object.keys(savedSubjects).length > 0 ? savedSubjects : undefined
      })
      toast.success('Approved for Optio review')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve')
      onRefresh()
    }
  }

  const handleOrgGrowThis = async () => {
    if (!feedback.trim()) {
      toast.error('Feedback is required for Grow This')
      return
    }
    const completionId = item.completion_id
    const savedFeedback = feedback
    setFeedback('')
    if (onAdvance) onAdvance(completionId)
    try {
      await api.post(`/api/credit-dashboard/items/${completionId}/org-grow-this`, {
        feedback: savedFeedback
      })
      toast.success('Returned to student')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to return')
      onRefresh()
    }
  }

  const handleApprove = async () => {
    const completionId = item.completion_id
    const savedFeedback = feedback
    const savedSubjects = { ...editedSubjects }
    // Remove zero-XP subjects
    for (const [k, v] of Object.entries(savedSubjects)) {
      if (!v || v <= 0) delete savedSubjects[k]
    }
    setFeedback('')
    if (onAdvance) onAdvance(completionId)
    try {
      await api.post(`/api/advisor/credit-queue/${completionId}/approve`, {
        feedback: savedFeedback || undefined,
        subjects: Object.keys(savedSubjects).length > 0 ? savedSubjects : undefined
      })
      toast.success('Credit approved')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve')
      onRefresh()
    }
  }

  const handleGrowThis = async () => {
    if (!feedback.trim()) {
      toast.error('Feedback is required for Grow This')
      return
    }
    const completionId = item.completion_id
    const savedFeedback = feedback
    setFeedback('')
    if (onGrowThis) {
      onGrowThis(completionId, savedFeedback)
    } else if (onAdvance) {
      onAdvance(completionId)
    }
  }

  const handleConfirm = async () => {
    const completionId = item.completion_id
    if (onAdvance) onAdvance(completionId)
    try {
      await api.post(`/api/credit-dashboard/items/${completionId}/confirm`, {})
      toast.success('Credit confirmed')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to confirm')
      onRefresh()
    }
  }

  const handleReturnToAdvisor = async () => {
    if (!feedback.trim()) {
      toast.error('Feedback is required when returning to advisor')
      return
    }
    const completionId = item.completion_id
    const savedFeedback = feedback
    setFeedback('')
    if (onAdvance) onAdvance(completionId)
    try {
      await api.post(`/api/credit-dashboard/items/${completionId}/return-to-advisor`, {
        feedback: savedFeedback
      })
      toast.success('Returned to advisor')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to return')
      onRefresh()
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-lg font-semibold text-gray-900">{task.title || 'Unknown Task'}</h2>
          <span className="text-sm text-gray-500">{item.xp_value} XP</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>{`${student.first_name || ''} ${student.last_name || ''}`.trim() || student.display_name || 'Student'}</span>
          <span>in</span>
          <span className="font-medium">{quest.title || 'Unknown Quest'}</span>
        </div>
        {task.description && (
          <p className="mt-2 text-sm text-gray-600">{task.description}</p>
        )}
      </div>

      {/* Status Timeline */}
      <StatusTimeline
        diplomaStatus={completion.diploma_status}
        accreditorStatus={completion.accreditor_status}
        isOrgStudent={isOrgStudent}
      />

      {/* Accreditor decision banner (for accreditor view) */}
      {isAccreditor && completion.diploma_status === 'approved' && completion.credit_reviewer_id && (
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm font-medium text-blue-800">Advisor Decision</p>
          <p className="text-xs text-blue-600 mt-1">
            Approved by advisor. Review evidence and subject distribution below.
          </p>
        </div>
      )}

      {/* Subject Distribution */}
      {(Object.keys(editedSubjects).length > 0 || canEditSubjects) && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">Subject XP Distribution</h3>
            {canEditSubjects && (
              <span className="text-xs text-gray-400">
                Total: {Object.values(editedSubjects).reduce((s, v) => s + (parseInt(v, 10) || 0), 0)} XP
              </span>
            )}
          </div>
          {canEditSubjects ? (
            <div className="space-y-2 max-w-sm">
              {Object.entries(editedSubjects).map(([subject, xp]) => (
                <div key={subject} className="flex items-center gap-2">
                  <select
                    value={subject}
                    onChange={(e) => {
                      const newKey = e.target.value
                      if (newKey === subject) return
                      if (editedSubjects[newKey] !== undefined) {
                        // Merge into existing subject
                        setEditedSubjects(prev => {
                          const next = { ...prev }
                          next[newKey] = (parseInt(next[newKey], 10) || 0) + (parseInt(next[subject], 10) || 0)
                          delete next[subject]
                          return next
                        })
                      } else {
                        setEditedSubjects(prev => {
                          const next = {}
                          for (const [k, v] of Object.entries(prev)) {
                            next[k === subject ? newKey : k] = v
                          }
                          return next
                        })
                      }
                    }}
                    className="flex-1 text-sm rounded border-gray-300 focus:ring-optio-purple focus:border-optio-purple capitalize py-1"
                  >
                    {ALL_SUBJECTS.map(s => (
                      <option key={s} value={s} className="capitalize">{formatSubject(s)}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={xp}
                    onChange={(e) => setEditedSubjects(prev => ({ ...prev, [subject]: parseInt(e.target.value, 10) || 0 }))}
                    className="w-24 text-sm text-right rounded border-gray-300 focus:ring-optio-purple focus:border-optio-purple py-1"
                  />
                  <span className="text-xs text-gray-400 w-6">XP</span>
                  <button
                    onClick={() => setEditedSubjects(prev => {
                      const next = { ...prev }
                      delete next[subject]
                      return next
                    })}
                    className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                    title="Remove subject"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {/* Add subject button */}
              {Object.keys(editedSubjects).length < ALL_SUBJECTS.length && (
                <button
                  onClick={() => {
                    const unused = ALL_SUBJECTS.find(s => editedSubjects[s] === undefined)
                    if (unused) setEditedSubjects(prev => ({ ...prev, [unused]: 0 }))
                  }}
                  className="flex items-center gap-1 text-xs text-optio-purple hover:text-optio-pink mt-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add subject
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(editedSubjects).map(([subject, xp]) => (
                <div key={subject} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded text-sm">
                  <span className="text-gray-700 capitalize">{formatSubject(subject)}</span>
                  <span className="font-medium text-gray-900">{xp} XP</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Evidence Blocks */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          Evidence ({evidenceBlocks.length} blocks)
        </h3>
        {evidenceBlocks.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No evidence blocks</p>
        ) : (
          <div className="space-y-3">
            {evidenceBlocks.map((block, i) => (
              <div key={block.id || i} className="border border-gray-200 rounded-lg p-3">
                {block.block_type === 'text' && (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{getBlockText(block.content)}</p>
                )}
                {block.block_type === 'image' && (
                  <div className="space-y-2">
                    {getBlockItems(block.content, 'image').map((item, j) => (
                      <div key={j}>
                        <img
                          src={item.url}
                          alt={item.alt || 'Evidence'}
                          className="max-w-full rounded border"
                          loading="lazy"
                        />
                        {item.caption && (
                          <p className="text-xs text-gray-500 mt-1">{item.caption}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {block.block_type === 'link' && (
                  <div className="space-y-2">
                    {getBlockItems(block.content, 'link').map((item, j) => (
                      <a
                        key={j}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-optio-purple hover:underline flex items-center gap-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        {item.title || item.url}
                      </a>
                    ))}
                  </div>
                )}
                {block.block_type === 'video' && (
                  <div className="space-y-2">
                    {getBlockItems(block.content, 'video').map((item, j) => (
                      <a key={j} href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm text-optio-purple hover:underline">
                        Video: {item.title || item.url}
                      </a>
                    ))}
                  </div>
                )}
                {(block.block_type === 'file' || block.block_type === 'document') && (
                  <div className="space-y-2">
                    {getBlockItems(block.content, block.block_type).map((item, j) => (
                      <div key={j} className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm text-optio-purple hover:underline">
                          {item.title || item.filename || 'Download file'}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review History */}
      {(reviewRounds.length > 0 || accreditorReviews.length > 0) && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Review History</h3>
          <div className="space-y-2">
            {reviewRounds.map((round, i) => (
              <div key={round.id || i} className="text-xs p-2 bg-gray-50 rounded">
                <div className="flex justify-between">
                  <span className="font-medium">Round {round.round_number} - {round.reviewer_action || 'pending'}</span>
                  <span className="text-gray-400">{round.reviewed_at ? new Date(round.reviewed_at).toLocaleDateString() : ''}</span>
                </div>
                {round.reviewer_feedback && (
                  <p className="text-gray-600 mt-1">{round.reviewer_feedback}</p>
                )}
              </div>
            ))}
            {accreditorReviews.map((review, i) => (
              <div key={review.id || i} className={`text-xs p-2 rounded ${
                review.status === 'confirmed' ? 'bg-emerald-50' :
                review.status === 'flagged' ? 'bg-orange-50' : 'bg-red-50'
              }`}>
                <div className="flex justify-between">
                  <span className="font-medium capitalize">Accreditor: {review.status}</span>
                  <span className="text-gray-400">{review.reviewed_at ? new Date(review.reviewed_at).toLocaleDateString() : ''}</span>
                </div>
                {review.flag_reason && <p className="text-gray-600 mt-1">{review.flag_reason}</p>}
                {review.notes && <p className="text-gray-600 mt-1">{review.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons - Org Admin */}
      {canOrgAdminAct && (
        <div className="border-t border-gray-200 pt-4 space-y-3">
          <textarea
            ref={feedbackTextareaRef}
            value={feedback}
            onChange={e => {
              setFeedback(e.target.value)
              if (onFeedbackChange) onFeedbackChange(e.target.value)
            }}
            placeholder="Feedback for student (required for Grow This, press g)..."
            rows={3}
            className="w-full text-sm rounded-lg border border-gray-300 focus:ring-optio-purple focus:border-optio-purple px-4 py-3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleOrgApprove}
              disabled={actionLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {actionLoading ? 'Processing...' : 'Approve for Optio Review (a)'}
            </button>
            <button
              onClick={handleOrgGrowThis}
              disabled={actionLoading || !feedback.trim()}
              className="px-4 py-2 text-sm font-medium text-orange-700 bg-orange-100 rounded-lg hover:bg-orange-200 disabled:opacity-50"
            >
              Grow This (g)
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons - Advisor */}
      {canAdvisorAct && (
        <div className="border-t border-gray-200 pt-4 space-y-3">
          <textarea
            ref={feedbackTextareaRef}
            value={feedback}
            onChange={e => {
              setFeedback(e.target.value)
              if (onFeedbackChange) onFeedbackChange(e.target.value)
            }}
            placeholder="Feedback for student (required for Grow This, press g)..."
            rows={3}
            className="w-full text-sm rounded-lg border border-gray-300 focus:ring-optio-purple focus:border-optio-purple px-4 py-3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleApprove}
              disabled={actionLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {actionLoading ? 'Processing...' : 'Approve (a)'}
            </button>
            <button
              onClick={handleGrowThis}
              disabled={actionLoading || !feedback.trim()}
              className="px-4 py-2 text-sm font-medium text-orange-700 bg-orange-100 rounded-lg hover:bg-orange-200 disabled:opacity-50"
            >
              Grow This (g)
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons - Accreditor */}
      {canAccreditorAct && (
        <div className="border-t border-gray-200 pt-4 space-y-3">
          <textarea
            value={feedback}
            onChange={e => {
              setFeedback(e.target.value)
              if (onFeedbackChange) onFeedbackChange(e.target.value)
            }}
            placeholder="Feedback for advisor (required for return)..."
            rows={3}
            className="w-full text-sm rounded-lg border border-gray-300 focus:ring-optio-purple focus:border-optio-purple px-4 py-3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={actionLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              Approve (a)
            </button>
            <button
              onClick={handleReturnToAdvisor}
              disabled={actionLoading || !feedback.trim()}
              className="px-4 py-2 text-sm font-medium text-orange-700 bg-orange-100 rounded-lg hover:bg-orange-200 disabled:opacity-50"
            >
              Return to Advisor (g)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ItemDetail

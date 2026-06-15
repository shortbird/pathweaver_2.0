import React, { useState, useEffect } from 'react'
import api from '../../services/api'
import StatusTimeline from './StatusTimeline'
import CreditFeedbackThread from '../credit/CreditFeedbackThread'
import { toast } from 'react-hot-toast'
import {
  computeEvidenceDiff,
  summarizeDiff,
  DIFF_NEW,
  DIFF_MODIFIED,
  DIFF_REMOVED,
} from './evidenceDiff'

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

// Renders just the inner content of a block (text, image, link, etc).
// Used for both the live block and the "previous version" peek for modified
// blocks. Stays a plain function so callers can drop it inside any wrapper.
const renderBlockBody = (block) => {
  if (!block) return null
  switch (block.block_type) {
    case 'text':
      return (
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{getBlockText(block.content)}</p>
      )
    case 'image':
      return (
        <div className="space-y-2">
          {getBlockItems(block.content, 'image').map((item, j) => (
            <div key={j}>
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src={item.url}
                  alt={item.alt || 'Evidence'}
                  className="max-w-full max-h-72 md:max-h-none object-contain rounded border"
                  loading="lazy"
                />
              </a>
              {item.caption && (
                <p className="text-xs text-gray-500 mt-1">{item.caption}</p>
              )}
            </div>
          ))}
        </div>
      )
    case 'link':
      return (
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
      )
    case 'video':
      return (
        <div className="space-y-2">
          {getBlockItems(block.content, 'video').map((item, j) => (
            <a key={j} href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm text-optio-purple hover:underline">
              Video: {item.title || item.url}
            </a>
          ))}
        </div>
      )
    case 'file':
    case 'document':
      return (
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
      )
    default:
      return null
  }
}

const DIFF_BORDER = {
  [DIFF_NEW]: 'border-emerald-300 bg-emerald-50/40',
  [DIFF_MODIFIED]: 'border-sky-300 bg-sky-50/40',
  [DIFF_REMOVED]: 'border-gray-300 bg-gray-50 opacity-75',
}

const EvidenceBlockCard = ({ block, diffType, previousBlock }) => {
  const [showPrev, setShowPrev] = useState(false)
  const borderClass = DIFF_BORDER[diffType] || 'border-gray-200'
  return (
    <div className={`border-2 rounded-lg p-3 ${borderClass}`}>
      {diffType === DIFF_NEW && (
        <div className="mb-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New since last review
          </span>
        </div>
      )}
      {diffType === DIFF_MODIFIED && (
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-sky-100 text-sky-800">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Modified since last review
          </span>
          {previousBlock && (
            <button
              type="button"
              onClick={() => setShowPrev(v => !v)}
              className="text-xs text-optio-purple hover:text-optio-pink underline"
            >
              {showPrev ? 'Hide previous version' : 'View previous version'}
            </button>
          )}
        </div>
      )}
      {diffType === DIFF_REMOVED && (
        <div className="mb-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-200 text-gray-700">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
            Removed since last review
          </span>
        </div>
      )}
      {renderBlockBody(block)}
      {diffType === DIFF_MODIFIED && showPrev && previousBlock && (
        <div className="mt-3 pt-3 border-t border-dashed border-gray-300">
          <p className="text-xs text-gray-500 italic mb-2">Previous version:</p>
          {renderBlockBody(previousBlock)}
        </div>
      )}
    </div>
  )
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
  const [actionLoading, setActionLoading] = useState(false)
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false)
  const [editedSubjects, setEditedSubjects] = useState({})

  const handleAiSuggest = async () => {
    if (!item) return
    if (feedback.trim() && !window.confirm('Replace your current feedback with an AI draft?')) {
      return
    }
    setAiSuggestLoading(true)
    try {
      const res = await api.post(
        `/api/credit-dashboard/items/${item.completion_id}/suggest-feedback`,
        {}
      )
      const draft = res.data?.data?.suggested_feedback || res.data?.suggested_feedback
      if (draft) {
        setFeedback(draft)
        if (onFeedbackChange) onFeedbackChange(draft)
      } else {
        toast.error('No suggestion returned')
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'AI suggestion failed')
    } finally {
      setAiSuggestLoading(false)
    }
  }

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
  const { diffStatus, removedBlocks, previousById, hasBaseline, baselineRoundNumber } =
    computeEvidenceDiff(evidenceBlocks, reviewRounds)
  const diffCounts = summarizeDiff(diffStatus, removedBlocks)

  const isSuperadmin = effectiveRole === 'superadmin'
  // Superadmins are simultaneously the org approver AND the Optio approver,
  // so we let them act at the pending_org_approval stage. The /org-approve
  // endpoint collapses both stages into a single finalize for superadmins
  // (see backend/routes/credit_dashboard/org_admin_actions.py).
  const isOrgAdmin = effectiveRole === 'org_admin' || isSuperadmin
  const isAdvisor = effectiveRole === 'advisor' || isSuperadmin
  const isOrgStudent = detail?.is_org_student || item?.is_org_student || false
  const canOrgAdminAct = isOrgAdmin && completion.diploma_status === 'pending_org_approval'
  const canAdvisorAct = isAdvisor && completion.diploma_status === 'pending_review'
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
      await api.post(`/api/credit-dashboard/items/${completionId}/approve`, {
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

  return (
    // Leave room at the bottom on mobile for the sticky action bar so the
    // last bit of content (review history, evidence) isn't covered.
    <div className="p-3 md:p-6 space-y-6 pb-32 md:pb-6">
      {/* Header */}
      <div>
        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3 mb-2">
          <h2 className="text-base md:text-lg font-semibold text-gray-900 leading-snug break-words">
            {task.title || 'Unknown Task'}
          </h2>
          <span className="text-sm text-gray-500 shrink-0">{item.xp_value} XP</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
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
        isOrgStudent={isOrgStudent}
        orgReviewerId={completion.org_reviewer_id}
      />

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
            <div className="space-y-2 md:max-w-sm">
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
                    // 16px on mobile to avoid iOS auto-zoom on focus.
                    className="flex-1 min-w-0 text-base md:text-sm rounded border-gray-300 focus:ring-optio-purple focus:border-optio-purple capitalize py-2 md:py-1"
                  >
                    {ALL_SUBJECTS.map(s => (
                      <option key={s} value={s} className="capitalize">{formatSubject(s)}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    inputMode="numeric"
                    value={xp}
                    onChange={(e) => setEditedSubjects(prev => ({ ...prev, [subject]: parseInt(e.target.value, 10) || 0 }))}
                    className="w-20 md:w-24 text-base md:text-sm text-right rounded border-gray-300 focus:ring-optio-purple focus:border-optio-purple py-2 md:py-1"
                  />
                  <span className="text-xs text-gray-400 w-6 shrink-0">XP</span>
                  <button
                    onClick={() => setEditedSubjects(prev => {
                      const next = { ...prev }
                      delete next[subject]
                      return next
                    })}
                    className="p-2 md:p-1 -mr-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded touch-manipulation"
                    title="Remove subject"
                    aria-label={`Remove ${subject}`}
                  >
                    <svg className="w-5 h-5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  className="flex items-center gap-1 text-sm md:text-xs text-optio-purple hover:text-optio-pink mt-2 md:mt-1 min-h-[36px] md:min-h-0 touch-manipulation"
                >
                  <svg className="w-4 h-4 md:w-3.5 md:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="text-sm font-medium text-gray-700">
            Evidence ({evidenceBlocks.length} block{evidenceBlocks.length === 1 ? '' : 's'})
          </h3>
          {hasBaseline && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-500">
                vs. Round {baselineRoundNumber}:
              </span>
              {diffCounts.added > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                  +{diffCounts.added} new
                </span>
              )}
              {diffCounts.modified > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-medium">
                  {diffCounts.modified} modified
                </span>
              )}
              {diffCounts.removed > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 font-medium">
                  −{diffCounts.removed} removed
                </span>
              )}
              {diffCounts.added === 0 && diffCounts.modified === 0 && diffCounts.removed === 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                  No changes
                </span>
              )}
            </div>
          )}
        </div>
        {evidenceBlocks.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No evidence blocks</p>
        ) : (
          <div className="space-y-3">
            {evidenceBlocks.map((block, i) => (
              <EvidenceBlockCard
                key={block.id || i}
                block={block}
                diffType={diffStatus[block.id]}
                previousBlock={previousById[block.id]}
              />
            ))}
          </div>
        )}
        {removedBlocks.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-500 mb-2">
              Removed since Round {baselineRoundNumber} ({removedBlocks.length})
            </p>
            <div className="space-y-3">
              {removedBlocks.map((block, i) => (
                <EvidenceBlockCard
                  key={block.id || `removed-${i}`}
                  block={block}
                  diffType={DIFF_REMOVED}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Review History */}
      {reviewRounds.length > 0 && (
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
          </div>
        </div>
      )}

      {/* Two-way feedback thread with the student */}
      {item?.completion_id && <CreditFeedbackThread completionId={item.completion_id} />}

      {/* Action panel. On mobile this sticks to the bottom of the scrolling
          detail panel so the reviewer can always reach Approve / Grow This
          without scrolling back up past the evidence. Negative margins +
          padding break out of the parent's p-3 so the white background spans
          the full panel width on mobile. */}
      {canOrgAdminAct && (
        <div className="md:static sticky bottom-0 z-10 bg-white border-t border-gray-200 pt-3 pb-3 md:pb-0 space-y-3 -mx-3 px-3 md:mx-0 md:px-0">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-600">
              Feedback for student
            </label>
            <button
              type="button"
              onClick={handleAiSuggest}
              disabled={aiSuggestLoading || actionLoading}
              className="text-sm md:text-xs text-optio-purple hover:text-optio-pink disabled:opacity-50 disabled:cursor-not-allowed py-1 px-1 touch-manipulation"
              title="Draft Grow This feedback with AI based on the student's submission"
            >
              {aiSuggestLoading ? 'Drafting…' : 'Suggest with AI'}
            </button>
          </div>
          <textarea
            ref={feedbackTextareaRef}
            value={feedback}
            onChange={e => {
              setFeedback(e.target.value)
              if (onFeedbackChange) onFeedbackChange(e.target.value)
            }}
            placeholder="Feedback for student (required for Grow This)..."
            rows={3}
            className="w-full text-base md:text-sm rounded-lg border border-gray-300 focus:ring-optio-purple focus:border-optio-purple px-4 py-3"
          />
          <div className="flex flex-col md:flex-row gap-2">
            <button
              onClick={handleOrgApprove}
              disabled={actionLoading}
              className="w-full md:w-auto px-4 py-3 md:py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 min-h-[44px] touch-manipulation"
            >
              {actionLoading
                ? 'Processing...'
                : isSuperadmin
                  ? 'Approve'
                  : 'Approve for Optio Review'}
            </button>
            <button
              onClick={handleOrgGrowThis}
              disabled={actionLoading || !feedback.trim()}
              className="w-full md:w-auto px-4 py-3 md:py-2 text-sm font-medium text-orange-700 bg-orange-100 rounded-lg hover:bg-orange-200 disabled:opacity-50 min-h-[44px] touch-manipulation"
            >
              Grow This
            </button>
          </div>
        </div>
      )}

      {canAdvisorAct && (
        <div className="md:static sticky bottom-0 z-10 bg-white border-t border-gray-200 pt-3 pb-3 md:pb-0 space-y-3 -mx-3 px-3 md:mx-0 md:px-0">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-600">
              Feedback for student
            </label>
            <button
              type="button"
              onClick={handleAiSuggest}
              disabled={aiSuggestLoading || actionLoading}
              className="text-sm md:text-xs text-optio-purple hover:text-optio-pink disabled:opacity-50 disabled:cursor-not-allowed py-1 px-1 touch-manipulation"
              title="Draft Grow This feedback with AI based on the student's submission"
            >
              {aiSuggestLoading ? 'Drafting…' : 'Suggest with AI'}
            </button>
          </div>
          <textarea
            ref={feedbackTextareaRef}
            value={feedback}
            onChange={e => {
              setFeedback(e.target.value)
              if (onFeedbackChange) onFeedbackChange(e.target.value)
            }}
            placeholder="Feedback for student (required for Grow This)..."
            rows={3}
            className="w-full text-base md:text-sm rounded-lg border border-gray-300 focus:ring-optio-purple focus:border-optio-purple px-4 py-3"
          />
          <div className="flex flex-col md:flex-row gap-2">
            <button
              onClick={handleApprove}
              disabled={actionLoading}
              className="w-full md:w-auto px-4 py-3 md:py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 min-h-[44px] touch-manipulation"
            >
              {actionLoading ? 'Processing...' : 'Approve'}
            </button>
            <button
              onClick={handleGrowThis}
              disabled={actionLoading || !feedback.trim()}
              className="w-full md:w-auto px-4 py-3 md:py-2 text-sm font-medium text-orange-700 bg-orange-100 rounded-lg hover:bg-orange-200 disabled:opacity-50 min-h-[44px] touch-manipulation"
            >
              Grow This
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

export default ItemDetail

import React, { useState } from 'react'
import { useReviewBounty } from '../../hooks/api/useBounties'

// Renders a single evidence item (text, image, video, link, document)
const EvidenceItem = ({ item }) => (
  <div className="bg-white rounded-lg p-2.5 border border-gray-100">
    {item.type === 'text' && (
      <p className="text-sm text-gray-700 whitespace-pre-line">{item.content?.text}</p>
    )}
    {(item.type === 'image' || item.type === 'camera') && (item.content?.items || []).map((ci, j) => (
      <a key={j} href={ci.url} target="_blank" rel="noopener noreferrer">
        <img src={ci.url} alt="" className="rounded max-h-56 w-auto" />
      </a>
    ))}
    {item.type === 'video' && (item.content?.items || []).map((ci, j) => (
      <video key={j} src={ci.url} controls className="rounded max-h-56 w-full" />
    ))}
    {item.type === 'link' && (item.content?.items || []).map((ci, j) => (
      <a key={j} href={ci.url} target="_blank" rel="noopener noreferrer" className="text-sm text-optio-purple underline break-all">
        {ci.title || ci.url}
      </a>
    ))}
    {item.type === 'document' && (item.content?.items || []).map((ci, j) => (
      <a key={j} href={ci.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-optio-purple">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        {ci.title || ci.filename || 'Document'}
      </a>
    ))}
  </div>
)

// One submitted claim in the review queue: student, bounty, evidence per
// deliverable, feedback box, and approve / revise / reject actions.
const SubmissionReviewCard = ({ bounty, claim }) => {
  const reviewMutation = useReviewBounty()
  const [feedback, setFeedback] = useState('')
  const [expanded, setExpanded] = useState(true)

  const deliverables = bounty.deliverables || []
  const claimEvidence = claim.evidence?.deliverable_evidence || {}
  const studentName = claim.student?.display_name || 'Student'
  const submittedDate = claim.submitted_at
    ? new Date(claim.submitted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null

  const handleReview = (decision) => {
    reviewMutation.mutate({
      bountyId: bounty.id,
      claimId: claim.id,
      decision,
      feedback: feedback.trim() || undefined,
    })
  }

  return (
    <div className="bg-white rounded-xl border border-yellow-200 overflow-hidden">
      {/* Header: student + bounty + submitted date */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="min-w-0">
          <p className="text-base font-bold text-gray-900 truncate">{studentName}</p>
          <p className="text-sm text-gray-500 truncate">{bounty.title}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {submittedDate && (
            <span className="text-xs text-gray-400">Submitted {submittedDate}</span>
          )}
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-100">
          {/* Deliverables with evidence */}
          <div className="space-y-3 mt-4 mb-4">
            {deliverables.map(d => {
              const evidence = claimEvidence[d.id] || []
              return (
                <div key={d.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm font-medium text-gray-900">{d.text}</span>
                  </div>
                  {evidence.length > 0 ? (
                    <div className="ml-6 space-y-2">
                      {evidence.map((item, idx) => <EvidenceItem key={idx} item={item} />)}
                    </div>
                  ) : (
                    <p className="ml-6 text-xs text-gray-400">No evidence</p>
                  )}
                </div>
              )
            })}
          </div>

          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Feedback for the student (optional, shown if requesting revision)"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple resize-none text-sm mb-3"
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleReview('approved')}
              disabled={reviewMutation.isPending}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 min-h-[44px] disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={() => handleReview('revision_requested')}
              disabled={reviewMutation.isPending}
              className="px-4 py-2 bg-yellow-500 text-white rounded-lg font-medium hover:bg-yellow-600 min-h-[44px] disabled:opacity-50"
            >
              Request Revision
            </button>
            <button
              onClick={() => handleReview('rejected')}
              disabled={reviewMutation.isPending}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 min-h-[44px] disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default SubmissionReviewCard

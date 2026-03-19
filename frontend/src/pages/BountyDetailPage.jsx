import React, { useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  useBountyDetail,
  useMyClaims,
  useClaimBounty,
  useToggleDeliverable,
  useReviewBounty,
  useDeleteEvidence,
  useTurnInBounty,
} from '../hooks/api/useBounties'
import AddEvidenceModal from '../components/evidence/AddEvidenceModal'
import EvidenceViewerModal from '../components/bounty/EvidenceViewerModal'
import api from '../services/api'

const PILLAR_LABELS = {
  stem: 'STEM', art: 'Art', communication: 'Communication', civics: 'Civics', wellness: 'Wellness',
}

const PILLAR_COLORS = {
  stem: 'text-pillar-stem bg-pillar-stem/10',
  art: 'text-pillar-art bg-pillar-art/10',
  communication: 'text-pillar-communication bg-pillar-communication/10',
  civics: 'text-pillar-civics bg-pillar-civics/10',
  wellness: 'text-pillar-wellness bg-pillar-wellness/10',
}

const BountyDetailPage = () => {
  const { bountyId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: bounty, isLoading } = useBountyDetail(bountyId)
  const { data: myClaims = [] } = useMyClaims()
  const claimMutation = useClaimBounty()
  const toggleMutation = useToggleDeliverable()
  const reviewMutation = useReviewBounty()
  const deleteEvidenceMutation = useDeleteEvidence()
  const turnInMutation = useTurnInBounty()

  const [reviewFeedback, setReviewFeedback] = useState('')
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false)
  const [evidenceDeliverableId, setEvidenceDeliverableId] = useState(null)
  const [viewingEvidence, setViewingEvidence] = useState(null)

  const isStudent = user?.role === 'student' || user?.org_role === 'student' || user?.role === 'superadmin'
  const myClaim = useMemo(() => myClaims.find(c => c.bounty_id === bountyId), [myClaims, bountyId])
  const isActive = bounty?.status === 'active'
  const isPoster = bounty?.poster_id === user?.id
  const pillarStyle = bounty ? (PILLAR_COLORS[bounty.pillar] || 'text-gray-600 bg-gray-100') : ''
  const deliverables = bounty?.deliverables || []
  const completedIds = myClaim?.evidence?.completed_deliverables || []
  const deliverableEvidence = myClaim?.evidence?.deliverable_evidence || {}
  const isClaimEditable = myClaim && (myClaim.status === 'claimed' || myClaim.status === 'revision_requested')

  const handleClaim = () => claimMutation.mutate(bountyId)

  const handleUploadEvidence = (deliverableId) => {
    setEvidenceDeliverableId(deliverableId)
    setEvidenceModalOpen(true)
  }

  const handleSaveEvidence = useCallback(async (items) => {
    if (!myClaim || !evidenceDeliverableId || !items?.length) return
    setEvidenceModalOpen(false)

    // Upload files
    const processedItems = []
    for (const item of items) {
      const processed = { type: item.type, content: { ...item.content } }
      if (item.content?.items) {
        const processedContentItems = []
        for (const ci of item.content.items) {
          if (ci.file) {
            const formData = new FormData()
            formData.append('files', ci.file)
            try {
              const res = await api.post('/api/uploads/evidence', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
              })
              const uploaded = res.data?.files?.[0]
              if (uploaded) {
                processedContentItems.push({ ...ci, url: uploaded.url, file: undefined })
              }
            } catch (e) {
              console.error('File upload failed:', e)
            }
          } else {
            processedContentItems.push(ci)
          }
        }
        processed.content.items = processedContentItems
      }
      processedItems.push(processed)
    }

    toggleMutation.mutate({
      bountyId,
      claimId: myClaim.id,
      deliverableId: evidenceDeliverableId,
      completed: true,
      evidence: processedItems,
    })
    setEvidenceDeliverableId(null)
  }, [myClaim, evidenceDeliverableId, bountyId, toggleMutation])

  const handleReview = (claimId, decision) => {
    reviewMutation.mutate({
      bountyId,
      claimId,
      decision,
      feedback: reviewFeedback.trim() || undefined,
    }, { onSuccess: () => setReviewFeedback('') })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    )
  }

  if (!bounty) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <p className="text-gray-500 text-lg">Bounty not found</p>
        <button onClick={() => navigate('/bounties')} className="mt-4 text-optio-purple font-medium">
          Back to Bounty Board
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button
        onClick={() => navigate('/bounties')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 min-h-[44px]"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Bounty Board
      </button>

      {/* Bounty Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>
          {bounty.title}
        </h1>
        <p className="text-gray-700 whitespace-pre-line mb-4">{bounty.description}</p>

        {/* Rewards + Posted by */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Rewards</p>
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {(bounty.rewards || []).map((r, i) => (
                r.type === 'xp' ? (
                  <span key={i} className="text-sm font-bold text-optio-purple">
                    +{r.value} XP
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ml-1 ${PILLAR_COLORS[r.pillar] || ''}`}>
                      {PILLAR_LABELS[r.pillar] || r.pillar}
                    </span>
                  </span>
                ) : (
                  <span key={i} className="text-sm font-semibold px-3 py-1 rounded-full bg-amber-50 text-amber-700">{r.text}</span>
                )
              ))}
              {(!bounty.rewards || bounty.rewards.length === 0) && bounty.xp_reward > 0 && (
                <span className="text-sm font-bold text-optio-purple">+{bounty.xp_reward} XP</span>
              )}
            </div>
            {bounty.sponsored_reward?.name && (
              <div className="flex items-center gap-2 text-sm text-gray-500 flex-shrink-0">
                {bounty.sponsored_reward.logo_url ? (
                  <img src={bounty.sponsored_reward.logo_url} alt="" className="w-5 h-5 rounded-sm" />
                ) : (
                  <div className="w-5 h-5 rounded-sm bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500">
                    {bounty.sponsored_reward.name.charAt(0)}
                  </div>
                )}
                <span>Posted by <span className="font-medium text-gray-700">{bounty.sponsored_reward.name}</span></span>
              </div>
            )}
          </div>
        </div>

        {/* Deliverables */}
        <div className="border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Deliverables ({deliverables.length})
          </h3>
          <div className="space-y-2">
            {deliverables.map((d, i) => {
              const isCompleted = completedIds.includes(d.id)
              const evidence = deliverableEvidence[d.id] || []

              return (
                <div
                  key={d.id}
                  className={`flex items-start gap-3 p-2.5 rounded-lg ${isCompleted ? 'bg-green-50/50' : myClaim ? 'bg-gray-50' : ''}`}
                >
                  {/* Status icon */}
                  <div className="mt-0.5 flex-shrink-0">
                    {isCompleted ? (
                      <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : myClaim ? (
                      <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                    ) : (
                      <span className="w-5 h-5 flex items-center justify-center text-xs text-gray-400 font-medium">
                        {i + 1}.
                      </span>
                    )}
                  </div>
                  {/* Text and evidence info */}
                  <div
                    className={`flex-1 min-w-0 ${isCompleted && evidence.length > 0 ? 'cursor-pointer' : ''}`}
                    onClick={isCompleted && evidence.length > 0 ? () => setViewingEvidence({ items: evidence, title: d.text, bountyId, claimId: myClaim.id, deliverableId: d.id }) : undefined}
                  >
                    <span className={`text-sm ${isCompleted ? 'text-green-700' : 'text-gray-700'}`}>
                      {d.text}
                    </span>
                    {isCompleted && evidence.length > 0 && (
                      <p className="text-xs text-optio-purple mt-0.5 hover:underline">{evidence.length} evidence item{evidence.length !== 1 ? 's' : ''} -- click to view</p>
                    )}
                  </div>
                  {/* Upload button - always visible when editable */}
                  {myClaim && isClaimEditable && (
                    <button
                      onClick={() => handleUploadEvidence(d.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-optio-purple bg-optio-purple/10 rounded-lg hover:bg-optio-purple/20 transition-colors min-h-[32px] flex-shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Upload
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Claim button - student hasn't claimed yet */}
      {isStudent && isActive && !myClaim && (!isPoster || user?.role === 'superadmin') && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Ready to take this on?</h3>
          <p className="text-gray-600 text-sm mb-4">
            Claim this bounty and complete the deliverables to earn +{bounty.xp_reward} XP.
          </p>
          <button
            onClick={handleClaim}
            disabled={claimMutation.isPending}
            className="px-8 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-bold hover:shadow-lg transition-all min-h-[44px] disabled:opacity-50"
          >
            {claimMutation.isPending ? 'Claiming...' : 'Claim Bounty'}
          </button>
        </div>
      )}

      {/* Turn in button */}
      {myClaim && isClaimEditable && deliverables.length > 0 && completedIds.length === deliverables.length && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center mb-6">
          <h3 className="text-lg font-bold text-gray-900 mb-2">All deliverables complete!</h3>
          <p className="text-gray-600 text-sm mb-4">Ready to submit your work for review?</p>
          <button
            onClick={() => turnInMutation.mutate({ bountyId, claimId: myClaim.id })}
            disabled={turnInMutation.isPending}
            className="px-8 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-bold hover:shadow-lg transition-all min-h-[44px] disabled:opacity-50"
          >
            {turnInMutation.isPending ? 'Turning in...' : 'Turn in Bounty'}
          </button>
        </div>
      )}

      {/* Status messages */}
      {myClaim?.status === 'submitted' && (
        <div className="bg-yellow-50 rounded-xl p-5 border border-yellow-200 text-center">
          <h3 className="font-bold text-yellow-900 mb-1">All deliverables submitted</h3>
          <p className="text-yellow-700 text-sm">Waiting for the poster to review your work.</p>
        </div>
      )}
      {myClaim?.status === 'approved' && (
        <div className="bg-green-50 rounded-xl p-5 border border-green-200 text-center">
          <h3 className="font-bold text-green-900 mb-1">Bounty completed!</h3>
          <p className="text-green-700">You earned +{bounty.xp_reward} XP.</p>
        </div>
      )}
      {myClaim?.status === 'rejected' && (
        <div className="bg-red-50 rounded-xl p-5 border border-red-200 text-center">
          <h3 className="font-bold text-red-900">Submission not accepted</h3>
        </div>
      )}
      {myClaim?.status === 'revision_requested' && (
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-200 mb-4">
          <p className="text-orange-700 text-sm font-medium">
            The poster requested revisions. Update your deliverables and they will be resubmitted automatically.
          </p>
        </div>
      )}

      {/* Poster: Review submitted claims */}
      {isPoster && bounty.claims && bounty.claims.filter(c => c.status === 'submitted').length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-yellow-200 p-6 mt-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            Submissions for Review ({bounty.claims.filter(c => c.status === 'submitted').length})
          </h3>
          <div className="space-y-6">
            {bounty.claims.filter(c => c.status === 'submitted').map(claim => {
              const claimEvidence = claim.evidence?.deliverable_evidence || {}
              return (
                <div key={claim.id} className="p-4 border border-gray-200 rounded-lg">
                  <p className="text-sm text-gray-500 mb-4">Student: {claim.student_id.slice(0, 8)}...</p>

                  {/* Deliverables with evidence */}
                  <div className="space-y-4 mb-4">
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
                              {evidence.map((item, idx) => (
                                <div key={idx} className="bg-white rounded p-2 border border-gray-100">
                                  {item.type === 'text' && (
                                    <p className="text-sm text-gray-700 whitespace-pre-line">{item.content?.text}</p>
                                  )}
                                  {(item.type === 'image' || item.type === 'camera') && (item.content?.items || []).map((ci, j) => (
                                    <img key={j} src={ci.url} alt="" className="rounded max-h-48 w-auto" />
                                  ))}
                                  {item.type === 'video' && (item.content?.items || []).map((ci, j) => (
                                    <video key={j} src={ci.url} controls className="rounded max-h-48 w-full" />
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
                                  <span className="text-[10px] text-gray-400 capitalize">{item.type}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="ml-6 text-xs text-gray-400">No evidence</p>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <textarea
                    value={reviewFeedback}
                    onChange={(e) => setReviewFeedback(e.target.value)}
                    placeholder="Feedback for the student (optional, shown if requesting revision)"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple resize-none text-sm mb-3"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReview(claim.id, 'approved')}
                      disabled={reviewMutation.isPending}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 min-h-[44px] disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReview(claim.id, 'revision_requested')}
                      disabled={reviewMutation.isPending}
                      className="px-4 py-2 bg-yellow-500 text-white rounded-lg font-medium hover:bg-yellow-600 min-h-[44px] disabled:opacity-50"
                    >
                      Request Revision
                    </button>
                    <button
                      onClick={() => handleReview(claim.id, 'rejected')}
                      disabled={reviewMutation.isPending}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 min-h-[44px] disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Evidence upload modal */}
      <AddEvidenceModal
        isOpen={evidenceModalOpen}
        onClose={() => { setEvidenceModalOpen(false); setEvidenceDeliverableId(null) }}
        onSave={handleSaveEvidence}
      />

      {/* Evidence viewer modal */}
      {viewingEvidence && (
        <EvidenceViewerModal
          evidence={viewingEvidence}
          title={viewingEvidence.title}
          onClose={() => setViewingEvidence(null)}
          onDelete={(idx) => {
            if (!window.confirm('Delete this evidence?')) return
            deleteEvidenceMutation.mutate({
              bountyId: viewingEvidence.bountyId,
              claimId: viewingEvidence.claimId,
              deliverableId: viewingEvidence.deliverableId,
              evidenceIndex: idx,
            }, {
              onSuccess: () => {
                setViewingEvidence(prev => {
                  if (!prev) return null
                  const updated = [...prev.items]
                  updated.splice(idx, 1)
                  if (updated.length === 0) return null
                  return { ...prev, items: updated }
                })
              }
            })
          }}
          deleting={deleteEvidenceMutation.isPending}
        />
      )}
    </div>
  )
}

export default BountyDetailPage

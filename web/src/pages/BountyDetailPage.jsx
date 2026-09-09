import React, { useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  useBountyDetail,
  useMyClaims,
  useClaimBounty,
  useToggleDeliverable,
  useDeleteEvidence,
  useTurnInBounty,
} from '../hooks/api/useBounties'
import AddEvidenceModal from '../components/evidence/AddEvidenceModal'
import EvidenceViewerModal from '../components/bounty/EvidenceViewerModal'
import SubmissionReviewCard from '../components/bounty/SubmissionReviewCard'
import api from '../services/api'
import toast from 'react-hot-toast'
import { PageLoader } from '../components/ui/Spinner'
import { useConfirm } from '../contexts/ConfirmContext'

import useHidePillars from '../hooks/useHidePillars'

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
  const hidePillars = useHidePillars()
  const confirm = useConfirm()
  const { bountyId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  // The bounty board passes its own URL as state.from -- it may be embedded in
  // the org management page, so "back" should return there, not always /bounties.
  const backTo = location.state?.from || '/bounties'
  const { user } = useAuth()

  // org_roles (array) is canonical for org-managed users; org_role is the
  // legacy scalar. Checking only the scalar hid the Claim button from
  // org-managed students carried on the array alone.
  const isStudent = user?.role === 'student'
    || user?.org_role === 'student'
    || (user?.org_roles || []).includes('student')
    || user?.role === 'superadmin'

  const { data: bounty, isLoading, isError, refetch } = useBountyDetail(bountyId)
  // Parents/observers aren't allowed on my-claims — calling it unconditionally
  // fired a guaranteed 403 (retried 3x) on every detail view.
  const { data: myClaims = [] } = useMyClaims({ enabled: isStudent })
  const claimMutation = useClaimBounty()
  const toggleMutation = useToggleDeliverable()
  const deleteEvidenceMutation = useDeleteEvidence()
  const turnInMutation = useTurnInBounty()

  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false)
  const [evidenceDeliverableId, setEvidenceDeliverableId] = useState(null)
  const [viewingEvidence, setViewingEvidence] = useState(null)
  const myClaim = useMemo(() => myClaims.find(c => c.bounty_id === bountyId), [myClaims, bountyId])
  const isActive = bounty?.status === 'active'
  const isPoster = bounty?.poster_id === user?.id
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

    // Upload files. Failures are surfaced, not swallowed — a lost upload used
    // to still mark the deliverable complete with the item missing.
    let failedUploads = 0
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
              } else {
                failedUploads += 1
              }
            } catch (e) {
              console.error('File upload failed:', e)
              failedUploads += 1
            }
          } else {
            processedContentItems.push(ci)
          }
        }
        processed.content.items = processedContentItems
        if (processedContentItems.length === 0) continue
      }
      processedItems.push(processed)
    }

    if (processedItems.length === 0) {
      toast.error('Upload failed — that evidence was not saved. Please try again.')
      setEvidenceDeliverableId(null)
      return
    }
    if (failedUploads > 0) {
      toast.error(`${failedUploads} file${failedUploads === 1 ? '' : 's'} failed to upload — the rest were saved.`)
    } else {
      toast.success('Evidence saved')
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

  if (isLoading) {
    return (
      <PageLoader className="min-h-[60vh]" />
    )
  }

  // A fetch failure is not "this bounty was deleted" — say what happened and
  // offer a retry instead of a dead end.
  if (isError) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <p className="text-gray-600">Couldn't load this bounty. Check your connection and try again.</p>
        <div className="mt-4 flex items-center justify-center gap-4">
          <button onClick={() => refetch()} className="btn-primary min-h-[44px]">Retry</button>
          <button onClick={() => navigate(backTo)} className="text-optio-purple font-medium min-h-[44px]">
            Back to Bounty Board
          </button>
        </div>
      </div>
    )
  }

  if (!bounty) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <p className="text-gray-500 text-lg">Bounty not found</p>
        <button onClick={() => navigate(backTo)} className="mt-4 text-optio-purple font-medium">
          Back to Bounty Board
        </button>
      </div>
    )
  }

  const rewardParts = (bounty.rewards || [])
    .map(r => r.type === 'xp' ? `+${r.value} XP` : r.text)
    .filter(Boolean)
  if (rewardParts.length === 0 && bounty.xp_reward > 0) rewardParts.push(`+${bounty.xp_reward} XP`)
  const rewardText = rewardParts.join(' · ')

  const deadlineDate = bounty.deadline ? new Date(bounty.deadline) : null
  const deadlinePassed = deadlineDate && deadlineDate < new Date()
  const showDeadline = deadlineDate
    && (deadlineDate - Date.now()) < 90 * 24 * 60 * 60 * 1000 // only when it's actually near

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button
        onClick={() => navigate(backTo)}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 min-h-[44px]"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Bounty Board
      </button>

      {/* Bounty Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          {bounty.title}
        </h1>
        {showDeadline && (
          <p className={`text-xs font-medium mb-2 ${deadlinePassed ? 'text-red-600' : 'text-gray-500'}`}>
            {deadlinePassed
              ? 'The deadline for this bounty has passed'
              : `Ends ${deadlineDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
          </p>
        )}
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
                    {!hidePillars && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ml-1 ${PILLAR_COLORS[r.pillar] || ''}`}>
                        {PILLAR_LABELS[r.pillar] || r.pillar}
                      </span>
                    )}
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
      {isStudent && isActive && !deadlinePassed && !myClaim && (!isPoster || user?.role === 'superadmin') && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Ready to take this on?</h3>
          <p className="text-gray-600 text-sm mb-4">
            {rewardText
              ? `Claim this bounty and complete the deliverables to earn ${rewardText}.`
              : 'Claim this bounty and complete the deliverables.'}
          </p>
          <button
            onClick={handleClaim}
            disabled={claimMutation.isPending}
            className="btn-primary min-h-[44px]"
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
            className="btn-primary min-h-[44px]"
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
          {rewardText && <p className="text-green-700">You earned {rewardText}.</p>}
        </div>
      )}
      {myClaim?.status === 'rejected' && (
        <div className="bg-red-50 rounded-xl p-5 border border-red-200 text-center">
          <h3 className="font-bold text-red-900 mb-1">Submission not accepted</h3>
          {myClaim.latest_review?.feedback && (
            <p className="text-red-700 text-sm mb-3">{myClaim.latest_review.feedback}</p>
          )}
          {isActive && !deadlinePassed && (
            <button
              onClick={handleClaim}
              disabled={claimMutation.isPending}
              className="text-sm font-medium text-optio-purple hover:underline min-h-[32px]"
            >
              {claimMutation.isPending ? 'Reopening...' : 'Try this bounty again'}
            </button>
          )}
        </div>
      )}
      {myClaim?.status === 'revision_requested' && (
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-200 mb-4">
          <p className="text-orange-700 text-sm font-medium">
            The poster requested revisions. Update your deliverables, then turn the bounty in again.
          </p>
          {myClaim.latest_review?.feedback && (
            <p className="text-orange-800 text-sm mt-2">
              <span className="font-semibold">Their feedback:</span> {myClaim.latest_review.feedback}
            </p>
          )}
        </div>
      )}

      {/* Poster: Review submitted claims. Uses the same SubmissionReviewCard as
          the board's review queue — the previous inline copy shared ONE
          feedback string across every student's textarea. */}
      {isPoster && (bounty.claims || []).some(c => c.status === 'submitted') && (
        <div className="mt-6 space-y-4">
          <h3 className="text-lg font-bold text-gray-900">
            Submissions for Review ({(bounty.claims || []).filter(c => c.status === 'submitted').length})
          </h3>
          {(bounty.claims || []).filter(c => c.status === 'submitted').map(claim => (
            <SubmissionReviewCard key={claim.id} bounty={bounty} claim={claim} />
          ))}
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
          onDelete={async (idx) => {
            if (!(await confirm('Delete this evidence?'))) return
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

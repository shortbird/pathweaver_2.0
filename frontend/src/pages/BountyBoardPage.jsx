import React, { useState, useCallback, useMemo, memo, useEffect } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useBounties, useMyClaims, useMyPostedBounties, useToggleDeliverable, useDeleteBounty, useDeleteEvidence, useTurnInBounty, useAbandonClaim, useClaimBounty } from '../hooks/api/useBounties'
import toast from 'react-hot-toast'
import AddEvidenceModal from '../components/evidence/AddEvidenceModal'
import EvidenceViewerModal from '../components/bounty/EvidenceViewerModal'
import SubmissionReviewCard from '../components/bounty/SubmissionReviewCard'
import api from '../services/api'
import GlassTabBar from '../components/ui/GlassTabBar'
import EmptyState from '../components/ui/EmptyState'
import { PageLoader } from '../components/ui/Spinner'
import { useConfirm } from '../contexts/ConfirmContext'

const PILLARS = [
  { key: null, label: 'All' },
  { key: 'stem', label: 'STEM' },
  { key: 'art', label: 'Art' },
  { key: 'communication', label: 'Comm' },
  { key: 'civics', label: 'Civics' },
  { key: 'wellness', label: 'Wellness' },
]

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

const STATUS_STYLES = {
  claimed: 'bg-optio-purple/10 text-optio-purple',
  submitted: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  revision_requested: 'bg-orange-100 text-orange-700',
}

// Browse card - shows bounty info for discovery
const CLAIM_BADGE = {
  claimed: { label: 'Claimed', style: 'bg-optio-purple/10 text-optio-purple' },
  submitted: { label: 'Submitted', style: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Completed', style: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', style: 'bg-red-100 text-red-700' },
  revision_requested: { label: 'Revision Needed', style: 'bg-orange-100 text-orange-700' },
}

const BountyCard = memo(({ bounty, onClick, claimStatus }) => {
  const pillarStyle = PILLAR_COLORS[bounty.pillar] || 'text-gray-600 bg-gray-100'
  const badge = claimStatus ? CLAIM_BADGE[claimStatus] : null

  return (
    <div
      onClick={() => onClick(bounty.id)}
      className={`bg-white rounded-xl border transition-all hover:shadow-xl hover:-translate-y-1 cursor-pointer overflow-hidden ${claimStatus ? (claimStatus === 'approved' ? 'border-green-300' : 'border-optio-purple/30') : 'border-gray-100'}`}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-lg font-bold text-gray-900 line-clamp-2">{bounty.title}</h3>
          {badge && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${badge.style}`}>
              {badge.label}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600 line-clamp-2 mb-3">{bounty.description}</p>

        {/* Rewards + Posted by */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Rewards</p>
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {(bounty.rewards || []).map((r, i) => (
                r.type === 'xp' ? (
                  <span key={i} className="text-sm font-bold text-optio-purple">+{r.value} XP <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ml-0.5 ${PILLAR_COLORS[r.pillar] || ''}`}>{PILLAR_LABELS[r.pillar] || r.pillar}</span></span>
                ) : (
                  <span key={i} className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{r.text}</span>
                )
              ))}
              {(!bounty.rewards || bounty.rewards.length === 0) && bounty.xp_reward > 0 && (
                <span className="text-sm font-bold text-optio-purple">+{bounty.xp_reward} XP</span>
              )}
            </div>
            {bounty.sponsored_reward?.name && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500 flex-shrink-0">
                {bounty.sponsored_reward.logo_url && (
                  <img src={bounty.sponsored_reward.logo_url} alt="" className="w-4 h-4 rounded-sm" />
                )}
                <span>Posted by <span className="font-medium text-gray-700">{bounty.sponsored_reward.name}</span></span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

// What the student actually earned/earns, custom rewards included — a
// custom-reward-only bounty used to celebrate with "+0 XP earned".
const rewardSummary = (bounty) => {
  const parts = (bounty.rewards || [])
    .map(r => r.type === 'xp' ? `+${r.value} XP` : r.text)
    .filter(Boolean)
  if (parts.length === 0 && bounty.xp_reward > 0) parts.push(`+${bounty.xp_reward} XP`)
  return parts.join(' · ')
}

// Active claim card - shows deliverables with evidence upload
const ActiveClaimCard = ({ claim, onUploadEvidence, onViewEvidence, onTurnIn, turnInPending, onToggleIncomplete, onDrop, onRetry }) => {
  const bounty = claim.bounty
  if (!bounty) return null

  const pillarStyle = PILLAR_COLORS[bounty.pillar] || 'text-gray-600 bg-gray-100'
  const deliverables = bounty.deliverables || []
  const completedIds = claim.evidence?.completed_deliverables || []
  const deliverableEvidence = claim.evidence?.deliverable_evidence || {}
  const completedCount = completedIds.length
  const totalCount = deliverables.length
  const isEditable = claim.status === 'claimed' || claim.status === 'revision_requested'

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-bold text-gray-900">{bounty.title}</h3>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ml-2 ${STATUS_STYLES[claim.status] || 'bg-gray-100 text-gray-600'}`}>
          {claim.status === 'revision_requested' ? 'Revision Needed' : claim.status === 'claimed' ? 'Claimed' : claim.status.charAt(0).toUpperCase() + claim.status.slice(1)}
        </span>
      </div>

      {bounty.description && (
        <p className="text-sm text-gray-600 line-clamp-2 mb-2">{bounty.description}</p>
      )}

      {/* Rewards */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {(bounty.rewards || []).map((r, i) => (
          r.type === 'xp' ? (
            <span key={i} className="text-xs font-bold text-optio-purple">+{r.value} XP <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${PILLAR_COLORS[r.pillar] || ''}`}>{PILLAR_LABELS[r.pillar] || r.pillar}</span></span>
          ) : (
            <span key={i} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{r.text}</span>
          )
        ))}
        {(!bounty.rewards || bounty.rewards.length === 0) && bounty.xp_reward > 0 && (
          <span className="text-xs font-bold text-optio-purple">+{bounty.xp_reward} XP</span>
        )}
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300 bg-optio-purple"
            style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap">{completedCount}/{totalCount}</span>
      </div>

      {/* Deliverables with evidence */}
      <div className="space-y-2">
        {deliverables.map((d) => {
          const isCompleted = completedIds.includes(d.id)
          const evidence = deliverableEvidence[d.id] || []
          const evidenceCount = evidence.length

          return (
            <div key={d.id} className={`flex items-start gap-3 p-2.5 rounded-lg ${isCompleted ? 'bg-green-50/50' : 'bg-gray-50'}`}>
              {/* Status icon */}
              <div className="mt-0.5 flex-shrink-0">
                {isCompleted ? (
                  <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                )}
              </div>
              {/* Text and action */}
              <div
                className={`flex-1 min-w-0 ${isCompleted && evidenceCount > 0 ? 'cursor-pointer' : ''}`}
                onClick={isCompleted && evidenceCount > 0 ? () => onViewEvidence(evidence, d.text, bounty.id, claim.id, d.id) : undefined}
              >
                <span className={`text-sm ${isCompleted ? 'text-green-700' : 'text-gray-700'}`}>
                  {d.text}
                </span>
                {isCompleted && evidenceCount > 0 && (
                  <p className="text-xs text-optio-purple mt-0.5 hover:underline">{evidenceCount} evidence item{evidenceCount !== 1 ? 's' : ''} -- click to view</p>
                )}
              </div>
              {/* Upload button - always visible when editable */}
              {isEditable && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => onUploadEvidence(bounty.id, claim.id, d.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-optio-purple bg-optio-purple/10 rounded-lg hover:bg-optio-purple/20 transition-colors min-h-[32px]"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Upload
                  </button>
                  {isCompleted && (
                    <button
                      onClick={() => onToggleIncomplete(bounty.id, claim.id, d.id)}
                      className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 min-h-[32px]"
                      title="Mark incomplete"
                      aria-label={`Mark "${d.text}" incomplete`}
                    >
                      Undo
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Reviewer feedback — stored in bounty_reviews but previously never
          shown anywhere in the product */}
      {claim.latest_review?.feedback && ['revision_requested', 'rejected'].includes(claim.status) && (
        <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <p className="text-xs font-semibold text-orange-700 mb-0.5">Feedback from the poster</p>
          <p className="text-sm text-orange-800">{claim.latest_review.feedback}</p>
        </div>
      )}

      {/* Turn in button - shows when all deliverables complete but not yet submitted */}
      {isEditable && completedCount === totalCount && totalCount > 0 && (
        <div className="mt-4 text-center">
          <button
            onClick={() => onTurnIn(bounty.id, claim.id)}
            disabled={turnInPending}
            className="btn-primary min-h-[44px]"
          >
            {turnInPending ? 'Turning in...' : 'Turn in Bounty'}
          </button>
        </div>
      )}

      {/* Drop — the backend has always allowed abandoning an unsubmitted claim;
          the web UI just never offered it */}
      {isEditable && (
        <div className="mt-2 text-center">
          <button
            onClick={() => onDrop(bounty.id, claim.id, bounty.title)}
            className="text-xs text-gray-400 hover:text-red-500 min-h-[32px]"
          >
            Drop this bounty
          </button>
        </div>
      )}

      {claim.status === 'approved' && (
        <div className="mt-3 p-2 bg-green-50 rounded-lg text-center">
          <span className="text-sm font-semibold text-green-700">
            Completed!{rewardSummary(bounty) ? ` ${rewardSummary(bounty)} earned` : ''}
          </span>
        </div>
      )}
      {claim.status === 'submitted' && (
        <p className="mt-3 text-xs text-yellow-600 text-center">Waiting for review from the poster.</p>
      )}
      {claim.status === 'rejected' && (
        <div className="mt-3 text-center">
          <button
            onClick={() => onRetry(bounty.id)}
            className="text-sm font-medium text-optio-purple hover:underline min-h-[32px]"
          >
            Try this bounty again
          </button>
        </div>
      )}
    </div>
  )
}

// Posted bounty card - matches browse card layout with edit/delete + claim stats
const PostedBountyCard = ({ bounty, onEdit, onReview, onDelete, deleting }) => {
  const submittedClaims = (bounty.claims || []).filter(c => c.status === 'submitted')
  const approvedClaims = (bounty.claims || []).filter(c => c.status === 'approved')
  const totalClaims = (bounty.claims || []).length
  const hasSubmissions = submittedClaims.length > 0

  return (
    <div
      className={`bg-white rounded-xl border transition-all hover:shadow-xl hover:-translate-y-1 cursor-pointer overflow-hidden ${hasSubmissions ? 'border-yellow-300' : 'border-gray-100'}`}
      onClick={() => hasSubmissions ? onReview(bounty.id) : onEdit(bounty.id)}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-lg font-bold text-gray-900 line-clamp-2">{bounty.title}</h3>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(bounty.id) }}
              className="text-gray-400 hover:text-optio-purple p-1 min-h-[32px]"
              title="Edit"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(bounty.id, bounty.title) }}
              disabled={deleting}
              className="text-gray-400 hover:text-red-500 p-1 min-h-[32px] disabled:opacity-50"
              title="Delete"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-600 line-clamp-2 mb-3">{bounty.description}</p>

        {/* Rewards + Posted by */}
        <div className="mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Rewards</p>
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {(bounty.rewards || []).map((r, i) => (
                r.type === 'xp' ? (
                  <span key={i} className="text-sm font-bold text-optio-purple">+{r.value} XP <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ml-0.5 ${PILLAR_COLORS[r.pillar] || ''}`}>{PILLAR_LABELS[r.pillar] || r.pillar}</span></span>
                ) : (
                  <span key={i} className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{r.text}</span>
                )
              ))}
              {(!bounty.rewards || bounty.rewards.length === 0) && bounty.xp_reward > 0 && (
                <span className="text-sm font-bold text-optio-purple">+{bounty.xp_reward} XP</span>
              )}
            </div>
            {bounty.sponsored_reward?.name && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500 flex-shrink-0">
                {bounty.sponsored_reward.logo_url && (
                  <img src={bounty.sponsored_reward.logo_url} alt="" className="w-4 h-4 rounded-sm" />
                )}
                <span>Posted by <span className="font-medium text-gray-700">{bounty.sponsored_reward.name}</span></span>
              </div>
            )}
          </div>
        </div>

        {/* Claim stats + submission alert */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>{totalClaims} claimed</span>
            <span>{approvedClaims.length} approved</span>
          </div>
          {hasSubmissions && (
            <span className="text-xs font-semibold text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
              {submittedClaims.length} awaiting review
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

const BountyBoardPage = () => {
  const confirm = useConfirm()
  const navigate = useNavigate()
  const location = useLocation()
  // Where "back" from create/detail/edit should land. The board is also
  // embedded in the org management page (/admin/organizations/:id?tab=bounties),
  // so pass the actual current URL along rather than assuming /bounties.
  const from = location.pathname + location.search
  const [searchParams] = useSearchParams()
  const { user, effectiveRole } = useAuth()
  const [filterPillar, setFilterPillar] = useState(null)
  // Parents are posters, not claimers: land them on their own bounties (posts +
  // review queue) rather than the student-style browse-to-claim board. Students,
  // advisors, and superadmin keep the Browse default.
  // Only honor a ?tab= param that names one of this page's own tabs -- when
  // embedded in /organization the URL carries ?tab=bounties (the org page's
  // tab), which would otherwise leave this board on an unknown tab and blank.
  const [tab, setTab] = useState(() => {
    const urlTab = searchParams.get('tab')
    if (['browse', 'active', 'my-bounties', 'review'].includes(urlTab)) return urlTab
    return effectiveRole === 'parent' ? 'my-bounties' : 'browse'
  })

  // The initial tab is read once on mount. When a notification deep-link changes
  // ?tab= while this page is already mounted (e.g. poster taps "needs review"
  // from the bounty board), sync the active tab so it actually switches. Only
  // reacts to real URL changes, so manual tab clicks (which don't touch the URL)
  // are left alone.
  const urlTab = searchParams.get('tab')
  useEffect(() => {
    if (['browse', 'active', 'my-bounties', 'review'].includes(urlTab)) {
      setTab(urlTab)
    }
  }, [urlTab])

  // org_roles (array) is the canonical role store for org-managed users;
  // org_role is the legacy scalar. Checking only the scalar misclassified
  // org-managed students carried on the array alone.
  const isStudent = user?.role === 'student'
    || user?.org_role === 'student'
    || (user?.org_roles || []).includes('student')
  const canPost = !isStudent || user?.role === 'superadmin'
  const canClaim = isStudent || user?.role === 'superadmin'

  const { data: bounties = [], isLoading: loadingBounties, isError: bountiesError, refetch: refetchBounties } = useBounties(
    filterPillar ? { pillar: filterPillar } : {},
    { enabled: tab === 'browse' }
  )
  // Gated by role: parents/observers aren't allowed on my-claims, so calling it
  // unconditionally fired a guaranteed 403 (retried 3x) on every board visit.
  const { data: myClaims = [], isLoading: loadingClaims, isError: claimsError, refetch: refetchClaims } = useMyClaims({ enabled: canClaim })
  // Loaded whenever the user can post (not just on the my-bounties tab) so the
  // Review tab badge count is visible from any tab.
  const { data: myPosted = [], isLoading: loadingPosted, isError: postedError, refetch: refetchPosted } = useMyPostedBounties({ enabled: canPost, staleTime: 0 })

  // The specific submission to focus, set when the poster arrives from a
  // "student submitted, needs review" notification (link carries ?claim=<id>).
  const highlightClaimId = searchParams.get('claim')

  // Set when the poster clicks a specific bounty's "awaiting review" — the
  // queue then shows just that bounty's submissions instead of everything.
  const [reviewBountyId, setReviewBountyId] = useState(null)

  // Flat queue of every submitted claim across all posted bounties, oldest first.
  // The highlighted submission floats to the top so the tapped notification lands
  // the poster directly on that student's review card.
  const pendingSubmissions = useMemo(() => {
    const items = []
    for (const b of myPosted) {
      if (reviewBountyId && b.id !== reviewBountyId) continue
      for (const c of b.claims || []) {
        if (c.status === 'submitted') items.push({ bounty: b, claim: c })
      }
    }
    items.sort((a, z) => new Date(a.claim.submitted_at || 0) - new Date(z.claim.submitted_at || 0))
    if (highlightClaimId) {
      const idx = items.findIndex(i => i.claim.id === highlightClaimId)
      if (idx > 0) items.unshift(items.splice(idx, 1)[0])
    }
    return items
  }, [myPosted, highlightClaimId, reviewBountyId])

  const reviewFilterTitle = reviewBountyId
    ? myPosted.find(b => b.id === reviewBountyId)?.title
    : null

  // Badge shows the whole queue even while the list is filtered to one bounty.
  const totalPendingCount = useMemo(() => (
    myPosted.reduce((n, b) => n + (b.claims || []).filter(c => c.status === 'submitted').length, 0)
  ), [myPosted])

  const claimStatusMap = useMemo(() => {
    const map = {}
    for (const c of myClaims) map[c.bounty_id] = c.status
    return map
  }, [myClaims])

  const toggleMutation = useToggleDeliverable()
  const deleteMutation = useDeleteBounty()
  const deleteEvidenceMutation = useDeleteEvidence()
  const turnInMutation = useTurnInBounty()
  const abandonMutation = useAbandonClaim()

  // A failed fetch is not an empty board. Render it as what it is, with a way
  // to try again.
  const ErrorPanel = ({ onRetry }) => (
    <div className="py-16 text-center">
      <p className="text-sm text-gray-600 mb-3">Couldn't load bounties. Check your connection and try again.</p>
      <button onClick={onRetry} className="btn-primary min-h-[44px]">Retry</button>
    </div>
  )

  // Evidence modal state
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false)
  const [evidenceTarget, setEvidenceTarget] = useState(null) // {bountyId, claimId, deliverableId}
  const [viewingEvidence, setViewingEvidence] = useState(null) // {items, title, bountyId, claimId, deliverableId}

  const handleDelete = async (bountyId, title) => {
    if (!(await confirm(`Delete "${title}"? This cannot be undone.`))) return
    deleteMutation.mutate(bountyId)
  }

  const handleUploadEvidence = useCallback((bountyId, claimId, deliverableId) => {
    setEvidenceTarget({ bountyId, claimId, deliverableId })
    setEvidenceModalOpen(true)
  }, [])

  const handleSaveEvidence = useCallback(async (items) => {
    if (!evidenceTarget || !items || items.length === 0) return
    setEvidenceModalOpen(false)

    // Upload any files first. Failures are surfaced, not swallowed — a lost
    // upload used to still mark the deliverable complete with the item missing.
    let failedUploads = 0
    const processedItems = []
    for (const item of items) {
      const processed = { type: item.type, content: { ...item.content } }
      if (item.content?.items) {
        const processedContentItems = []
        for (const ci of item.content.items) {
          if (ci.file) {
            // Upload file
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
        if (processedContentItems.length === 0) continue // nothing survived
      }
      processedItems.push(processed)
    }

    if (processedItems.length === 0) {
      toast.error('Upload failed — that evidence was not saved. Please try again.')
      setEvidenceTarget(null)
      return
    }
    if (failedUploads > 0) {
      toast.error(`${failedUploads} file${failedUploads === 1 ? '' : 's'} failed to upload — the rest were saved.`)
    } else {
      toast.success('Evidence saved')
    }

    toggleMutation.mutate({
      bountyId: evidenceTarget.bountyId,
      claimId: evidenceTarget.claimId,
      deliverableId: evidenceTarget.deliverableId,
      completed: true,
      evidence: processedItems,
    })
    setEvidenceTarget(null)
  }, [evidenceTarget, toggleMutation])

  const handleViewEvidence = useCallback((items, title, bountyId, claimId, deliverableId) => {
    setViewingEvidence({ items, title, bountyId, claimId, deliverableId })
  }, [])

  const handleDeleteEvidence = useCallback(async (evidenceIndex) => {
    if (!viewingEvidence || !(await confirm('Delete this evidence?'))) return
    deleteEvidenceMutation.mutate({
      bountyId: viewingEvidence.bountyId,
      claimId: viewingEvidence.claimId,
      deliverableId: viewingEvidence.deliverableId,
      evidenceIndex,
    }, {
      onSuccess: () => {
        // Update local state to reflect deletion
        setViewingEvidence(prev => {
          if (!prev) return null
          const updated = [...prev.items]
          updated.splice(evidenceIndex, 1)
          if (updated.length === 0) return null
          return { ...prev, items: updated }
        })
      }
    })
  }, [viewingEvidence, deleteEvidenceMutation])

  const handleToggle = (bountyId, claimId, deliverableId, completed) => {
    toggleMutation.mutate({ bountyId, claimId, deliverableId, completed })
  }

  const claimMutation = useClaimBounty()

  const handleDrop = async (bountyId, claimId, title) => {
    if (!(await confirm(`Drop "${title}"? Your progress on it will be removed.`))) return
    abandonMutation.mutate({ bountyId, claimId })
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Bounty Board
        </h1>
        {canPost && (
          <button
            onClick={() => navigate('/bounties/create', { state: { from } })}
            className="btn-primary min-h-[44px]"
          >
            Post Bounty
          </button>
        )}
      </div>

      {/* Tabs */}
      <GlassTabBar
        size="md"
        className="mb-6"
        aria-label="Bounty board sections"
        tabs={[
          { id: 'browse', label: 'Browse' },
          ...((isStudent || user?.role === 'superadmin') ? [{ id: 'active', label: 'Active' }] : []),
          ...(canPost ? [
            { id: 'my-bounties', label: 'My Bounties' },
            { id: 'review', label: 'Review', badge: totalPendingCount },
          ] : []),
        ]}
        active={tab}
        onSelect={setTab}
      />

      {/* Browse Tab */}
      {tab === 'browse' && (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            {PILLARS.map(p => (
              <button
                key={p.key || 'all'}
                onClick={() => setFilterPillar(p.key)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all min-h-[36px] ${
                  filterPillar === p.key
                    ? 'bg-optio-purple text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {loadingBounties ? (
            <PageLoader className="py-16" />
          ) : bountiesError ? (
            <ErrorPanel onRetry={refetchBounties} />
          ) : bounties.length === 0 ? (
            <EmptyState plain className="py-16" title="No bounties available" hint="Check back later for new challenges!" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {bounties.map(b => (
                <BountyCard key={b.id} bounty={b} onClick={(id) => navigate(`/bounties/${id}`, { state: { from } })} claimStatus={claimStatusMap[b.id]} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Active Claims Tab */}
      {tab === 'active' && (
        loadingClaims ? (
          <PageLoader className="py-16" />
        ) : claimsError ? (
          <ErrorPanel onRetry={refetchClaims} />
        ) : myClaims.length === 0 ? (
          <EmptyState plain className="py-16" title="No active bounties" hint="Browse the board and claim a bounty to get started!" />
        ) : (
          <div className="space-y-4 max-w-2xl">
            {myClaims.map(claim => (
              <ActiveClaimCard
                key={claim.id}
                claim={claim}
                onUploadEvidence={handleUploadEvidence}
                onViewEvidence={handleViewEvidence}
                onTurnIn={(bountyId, claimId) => turnInMutation.mutate({ bountyId, claimId })}
                turnInPending={turnInMutation.isPending}
                onToggleIncomplete={(bountyId, claimId, deliverableId) => handleToggle(bountyId, claimId, deliverableId, false)}
                onDrop={handleDrop}
                onRetry={(bountyId) => claimMutation.mutate(bountyId)}
              />
            ))}
          </div>
        )
      )}

      {/* My Bounties Tab */}
      {tab === 'my-bounties' && (
        loadingPosted ? (
          <PageLoader className="py-16" />
        ) : postedError ? (
          <ErrorPanel onRetry={refetchPosted} />
        ) : myPosted.length === 0 ? (
          <EmptyState
            plain
            className="py-16"
            title="No bounties posted yet"
            action={(
              <button
                onClick={() => navigate('/bounties/create', { state: { from } })}
                className="btn-primary min-h-[44px]"
              >
                Post Your First Bounty
              </button>
            )}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {myPosted.map(b => (
              <PostedBountyCard
                key={b.id}
                bounty={b}
                onEdit={(id) => navigate(`/bounties/${id}/edit`, { state: { from } })}
                onReview={(id) => { setReviewBountyId(id); setTab('review') }}
                onDelete={handleDelete}
                deleting={deleteMutation.isPending}
              />
            ))}
          </div>
        )
      )}

      {/* Review Queue Tab - all submitted claims across posted bounties */}
      {tab === 'review' && (
        loadingPosted ? (
          <PageLoader className="py-16" />
        ) : postedError ? (
          <ErrorPanel onRetry={refetchPosted} />
        ) : (
          <div className="space-y-4 max-w-3xl">
            {reviewFilterTitle && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-optio-purple bg-optio-purple/10 px-3 py-1.5 rounded-full">
                  Showing submissions for "{reviewFilterTitle}"
                </span>
                <button
                  onClick={() => setReviewBountyId(null)}
                  className="text-xs text-gray-500 hover:underline min-h-[32px]"
                >
                  Show all
                </button>
              </div>
            )}
            {pendingSubmissions.length === 0 ? (
              <EmptyState plain className="py-16" title="No submissions to review" hint="When students turn in your bounties, they will show up here." />
            ) : (
              pendingSubmissions.map(({ bounty, claim }) => (
                <SubmissionReviewCard
                  key={claim.id}
                  bounty={bounty}
                  claim={claim}
                  highlight={claim.id === highlightClaimId}
                />
              ))
            )}
          </div>
        )
      )}

      {/* Evidence upload modal */}
      <AddEvidenceModal
        isOpen={evidenceModalOpen}
        onClose={() => { setEvidenceModalOpen(false); setEvidenceTarget(null) }}
        onSave={handleSaveEvidence}
      />

      {/* Evidence viewer modal */}
      {viewingEvidence && (
        <EvidenceViewerModal
          evidence={viewingEvidence}
          title={viewingEvidence.title}
          onClose={() => setViewingEvidence(null)}
          onDelete={handleDeleteEvidence}
          deleting={deleteEvidenceMutation.isPending}
        />
      )}
    </div>
  )
}

export default BountyBoardPage

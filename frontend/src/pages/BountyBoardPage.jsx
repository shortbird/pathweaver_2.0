import React, { useState, useCallback, useMemo, memo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useBounties, useMyClaims, useMyPostedBounties, useToggleDeliverable, useDeleteBounty, useDeleteEvidence, useTurnInBounty } from '../hooks/api/useBounties'
import AddEvidenceModal from '../components/evidence/AddEvidenceModal'
import EvidenceViewerModal from '../components/bounty/EvidenceViewerModal'
import api from '../services/api'

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

// Active claim card - shows deliverables with evidence upload
const ActiveClaimCard = ({ claim, onUploadEvidence, onViewEvidence, onTurnIn, turnInPending }) => {
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
                <button
                  onClick={() => onUploadEvidence(bounty.id, claim.id, d.id)}
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

      {/* Turn in button - shows when all deliverables complete but not yet submitted */}
      {isEditable && completedCount === totalCount && totalCount > 0 && (
        <div className="mt-4 text-center">
          <button
            onClick={() => onTurnIn(bounty.id, claim.id)}
            disabled={turnInPending}
            className="px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-bold hover:shadow-lg transition-all min-h-[44px] disabled:opacity-50"
          >
            {turnInPending ? 'Turning in...' : 'Turn in Bounty'}
          </button>
        </div>
      )}

      {claim.status === 'approved' && (
        <div className="mt-3 p-2 bg-green-50 rounded-lg text-center">
          <span className="text-sm font-semibold text-green-700">Completed! +{bounty.xp_reward} XP earned</span>
        </div>
      )}
      {claim.status === 'submitted' && (
        <p className="mt-3 text-xs text-yellow-600 text-center">Waiting for review from the poster.</p>
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
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const [filterPillar, setFilterPillar] = useState(null)
  const [tab, setTab] = useState(() => searchParams.get('tab') || 'browse')

  const isStudent = user?.role === 'student' || user?.org_role === 'student'
  const canPost = !isStudent || user?.role === 'superadmin'

  const { data: bounties = [], isLoading: loadingBounties } = useBounties(
    filterPillar ? { pillar: filterPillar } : {},
    { enabled: tab === 'browse' }
  )
  const { data: myClaims = [], isLoading: loadingClaims } = useMyClaims()
  const { data: myPosted = [], isLoading: loadingPosted } = useMyPostedBounties({ enabled: tab === 'my-bounties', staleTime: 0 })

  const claimStatusMap = useMemo(() => {
    const map = {}
    for (const c of myClaims) map[c.bounty_id] = c.status
    return map
  }, [myClaims])

  const toggleMutation = useToggleDeliverable()
  const deleteMutation = useDeleteBounty()
  const deleteEvidenceMutation = useDeleteEvidence()
  const turnInMutation = useTurnInBounty()

  // Evidence modal state
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false)
  const [evidenceTarget, setEvidenceTarget] = useState(null) // {bountyId, claimId, deliverableId}
  const [viewingEvidence, setViewingEvidence] = useState(null) // {items, title, bountyId, claimId, deliverableId}

  const handleDelete = (bountyId, title) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return
    deleteMutation.mutate(bountyId)
  }

  const handleUploadEvidence = useCallback((bountyId, claimId, deliverableId) => {
    setEvidenceTarget({ bountyId, claimId, deliverableId })
    setEvidenceModalOpen(true)
  }, [])

  const handleSaveEvidence = useCallback(async (items) => {
    if (!evidenceTarget || !items || items.length === 0) return
    setEvidenceModalOpen(false)

    // Upload any files first
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

  const handleDeleteEvidence = useCallback((evidenceIndex) => {
    if (!viewingEvidence || !window.confirm('Delete this evidence?')) return
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Bounty Board
        </h1>
        {canPost && (
          <button
            onClick={() => navigate('/bounties/create')}
            className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-bold hover:shadow-lg transition-all min-h-[44px]"
          >
            Post Bounty
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
        <button
          onClick={() => setTab('browse')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all min-h-[44px] ${
            tab === 'browse' ? 'bg-white shadow-sm text-optio-purple' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Browse
        </button>
        {(isStudent || user?.role === 'superadmin') && (
          <button
            onClick={() => setTab('active')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all min-h-[44px] ${
              tab === 'active' ? 'bg-white shadow-sm text-optio-purple' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Active
          </button>
        )}
        {canPost && (
          <button
            onClick={() => setTab('my-bounties')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all min-h-[44px] ${
              tab === 'my-bounties' ? 'bg-white shadow-sm text-optio-purple' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            My Bounties
          </button>
        )}
      </div>

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
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
            </div>
          ) : bounties.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-500 text-lg">No bounties available</p>
              <p className="text-gray-400 text-sm mt-1">Check back later for new challenges!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {bounties.map(b => (
                <BountyCard key={b.id} bounty={b} onClick={(id) => navigate(`/bounties/${id}`)} claimStatus={claimStatusMap[b.id]} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Active Claims Tab */}
      {tab === 'active' && (
        loadingClaims ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
          </div>
        ) : myClaims.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 text-lg">No active bounties</p>
            <p className="text-gray-400 text-sm mt-1">Browse the board and claim a bounty to get started!</p>
          </div>
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
              />
            ))}
          </div>
        )
      )}

      {/* My Bounties Tab */}
      {tab === 'my-bounties' && (
        loadingPosted ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
          </div>
        ) : myPosted.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 text-lg">No bounties posted yet</p>
            <button
              onClick={() => navigate('/bounties/create')}
              className="mt-4 px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-bold hover:shadow-lg transition-all min-h-[44px]"
            >
              Post Your First Bounty
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {myPosted.map(b => (
              <PostedBountyCard
                key={b.id}
                bounty={b}
                onEdit={(id) => navigate(`/bounties/${id}/edit`)}
                onReview={(id) => navigate(`/bounties/${id}`)}
                onDelete={handleDelete}
                deleting={deleteMutation.isPending}
              />
            ))}
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

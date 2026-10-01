import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import SubmissionReviewCard from '../../components/bounty/SubmissionReviewCard'
import { useSchoolBounties } from '../../hooks/api/useBounties'
import { useSisOrg, withOrg } from './useSisOrg'

/**
 * Bounties — the school's bounties in the console (the Bounty Management
 * block; Apogee Cache Valley's chores and perks, 2026-10-01). Every bounty
 * posted to the school and every claim on it, so any coach can approve a chore
 * another coach posted. Creating and editing open the same bounty form the
 * student side uses (/bounties/create, /bounties/:id/edit), which this console
 * serves too.
 */

const TABS = [
  { key: 'review', label: 'To review' },
  { key: 'all', label: 'All bounties' },
]

const OPEN_CLAIM = ['claimed', 'revision_requested']

const rewardSummary = (bounty) => {
  const parts = (bounty.rewards || []).map((r) => (r.type === 'xp' ? `${r.value} XP` : r.text)).filter(Boolean)
  return parts.join(', ')
}

const SisBountiesPage = () => {
  const navigate = useNavigate()
  const { orgId } = useSisOrg()
  const [tab, setTab] = useState('review')
  const { data: bounties, isLoading, isError } = useSchoolBounties(orgId, withOrg('/api/sis/bounties', orgId))
  const from = '/bounties'

  const toReview = useMemo(() => (bounties || []).flatMap((b) =>
    (b.claims || []).filter((c) => c.status === 'submitted').map((claim) => ({ bounty: b, claim }))), [bounties])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Bounties</h1>
        <Button onClick={() => navigate('/bounties/create', { state: { from } })}>New bounty</Button>
      </div>

      <div className="flex gap-2 mb-4" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium ${tab === t.key ? 'bg-optio-purple text-white' : 'bg-white border border-gray-200 text-neutral-700 hover:bg-gray-50'}`}
          >
            {t.label}{t.key === 'review' && toReview.length > 0 ? ` (${toReview.length})` : ''}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-neutral-500">Loading…</p>}
      {isError && <p className="text-red-600">Could not load bounties.</p>}

      {bounties && tab === 'review' && (
        toReview.length === 0 ? (
          <p className="text-neutral-500">Nothing to review. Turned-in bounties show up here.</p>
        ) : (
          <div className="space-y-4">
            {toReview.map(({ bounty, claim }) => (
              <div key={claim.id}>
                <button
                  className="text-sm font-semibold text-neutral-900 hover:underline mb-1"
                  onClick={() => navigate(`/bounties/${bounty.id}`, { state: { from } })}
                >
                  {bounty.title}
                </button>
                <SubmissionReviewCard bounty={bounty} claim={claim} />
              </div>
            ))}
          </div>
        )
      )}

      {bounties && tab === 'all' && (
        bounties.length === 0 ? (
          <p className="text-neutral-500">No bounties yet. Click New bounty to post one, for example a daily chore with a perk as the reward.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {bounties.map((b) => {
              const claims = b.claims || []
              const open = claims.filter((c) => OPEN_CLAIM.includes(c.status)).length
              const waiting = claims.filter((c) => c.status === 'submitted').length
              const done = claims.filter((c) => c.status === 'approved').length
              return (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <button
                    className="min-w-0 text-left"
                    onClick={() => navigate(`/bounties/${b.id}`, { state: { from } })}
                  >
                    <span className="block text-sm font-medium text-neutral-900 truncate">
                      {b.title}{b.repeatable ? ' · Repeatable' : ''}{b.requires_evidence === false ? ' · No proof needed' : ''}
                    </span>
                    <span className="block text-xs text-neutral-500 truncate">
                      {rewardSummary(b) || 'No reward set'} · {open} working · {waiting} to review · {done} approved
                    </span>
                  </button>
                  <Button variant="secondary" size="sm" onClick={() => navigate(`/bounties/${b.id}/edit`, { state: { from } })}>
                    Edit
                  </Button>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}

export default SisBountiesPage

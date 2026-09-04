import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import { withOrg } from '../../../pages/sis/useSisOrg'
import {
  ReviewStrip, AssignmentCard, awaitingReviewOf,
} from '../../../pages/sis/OnboardingPage'
import PaperworkTemplatesManager from './PaperworkTemplatesManager'
import { SignatureBatchCard } from './SignatureBatches'

/**
 * Assigned — everything the office has asked of people, in ONE list.
 *
 * A one-off task, a checklist and a document sent for signature are all the
 * same sentence — "we asked someone to do something and we're waiting" — and
 * they already live in the same table (sis_onboarding_assignments). Only the
 * UI pretended they were two systems, tracked on two tabs. Here every send is
 * a card: who or what, progress, expand for the people and the actions
 * (approve, remind, release, unassign).
 *
 * Outstanding is the default view for the same reason the requests queue
 * defaults to open work: finished business buries the three things that still
 * need chasing.
 *
 * Authoring (checklist templates) sits collapsed at the bottom — a rare act
 * that must not sit on top of the daily list.
 */

const TypeBadge = ({ children }) => (
  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-neutral-600">{children}</span>
)

export default function AssignedWork({ orgId, sigEndpoint, reloadKey = 0, onCount = null }) {
  const [assignments, setAssignments] = useState([])
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('outstanding')

  const load = useCallback(() => {
    if (!orgId) return
    setLoading(true)
    Promise.all([
      api.get(withOrg('/api/sis/staff-admin/onboarding/assignments', orgId))
        .then((r) => r.data?.assignments || []),
      api.get(withOrg(sigEndpoint, orgId)).then((r) => r.data?.batches || []),
    ]).then(([a, b]) => {
      setAssignments(a)
      setBatches(b)
    }).catch(() => toast.error('Failed to load assigned work'))
      .finally(() => setLoading(false))
  }, [orgId, sigEndpoint])

  useEffect(() => { load() }, [load, reloadKey])

  // The tab's count is what needs the OFFICE — finished items waiting on an
  // approval — not what's waiting on other people.
  const awaiting = awaitingReviewOf(assignments).length
  useEffect(() => { onCount?.(awaiting) }, [awaiting, onCount])

  // One list. An assignment row is one person's task or checklist; a batch is
  // one document out for signature across many people. Newest first, so what
  // was just sent is where the sender looks for it.
  const entries = useMemo(() => {
    const rows = [
      ...assignments.map((a) => ({
        key: `a:${a.id}`,
        outstanding: a.status !== 'complete',
        when: a.created_at || '',
        node: (
          <AssignmentCard key={`a:${a.id}`} orgId={orgId} assignment={a} onChanged={load}
            badge={<TypeBadge>{a.template_id ? 'Checklist' : 'Task'}</TypeBadge>} />
        ),
      })),
      ...batches.map((b) => ({
        key: `b:${b.batch_id}`,
        outstanding: b.signed_count < b.total_count,
        when: b.sent_at || '',
        node: (
          <SignatureBatchCard key={`b:${b.batch_id}`} orgId={orgId} endpoint={sigEndpoint}
            batch={b} onChanged={load} badge={<TypeBadge>Signature</TypeBadge>} />
        ),
      })),
    ]
    rows.sort((x, y) => (y.when || '').localeCompare(x.when || ''))
    return rows
  }, [assignments, batches, orgId, sigEndpoint, load])

  const outstanding = entries.filter((e) => e.outstanding)
  const shown = view === 'outstanding' ? outstanding : entries

  return (
    <div className="space-y-6">
      <ReviewStrip orgId={orgId} assignments={assignments} onChanged={load} />

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Filter assigned work">
          {[['outstanding', `Outstanding (${outstanding.length})`], ['', `All (${entries.length})`]].map(([value, label]) => (
            <button key={value || 'all'} onClick={() => setView(value)} aria-pressed={view === value}
              className={`px-3 py-1.5 rounded-lg text-sm ${view === value
                ? 'bg-optio-purple/10 text-optio-purple font-semibold'
                : 'text-neutral-600 hover:bg-gray-100'}`}>
              {label}
            </button>
          ))}
        </div>

        {loading && <p className="text-sm text-neutral-500">Loading…</p>}
        {!loading && !entries.length && (
          <p className="text-sm text-neutral-500">
            Nothing assigned yet. Use the Assign button to ask somebody to do something.
          </p>
        )}
        {!loading && entries.length > 0 && !shown.length && (
          <p className="text-sm text-neutral-500">Everything assigned is done.</p>
        )}
        <div className="space-y-2">
          {shown.map((e) => e.node)}
        </div>
      </div>

      <PaperworkTemplatesManager orgId={orgId} onChanged={load} defaultTab="checklists" />
    </div>
  )
}

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import { withOrg } from '../../../pages/sis/useSisOrg'
import {
  ReviewStrip, AssignmentCard, ChecklistTemplatesManager, awaitingReviewOf,
} from '../../../pages/sis/OnboardingPage'
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

// The three kinds of send, as the office names them. Checklists lost their own
// tab in the 2026-08-31 reorg and the word went with them, so the admin who had
// been using them went looking on the Documents tab and asked "what happened to
// the checklists?" (iCreate, 2026-09-01). One list is still right — they are one
// table and one sentence — but the nouns have to stay visible in it.
const TYPES = [['task', 'Tasks'], ['checklist', 'Checklists'], ['signature', 'Signatures']]

// How to order the list. Newest-first is the default because what was just sent
// is where the sender looks for it, but the office reads this list the other way
// round too — down a person's name, chasing one teacher's paperwork ("can you
// make the task center pages sortable so it is easier to find what one is
// looking for", iCreate 2026-09-05).
const SORTS = [
  ['newest', 'Newest first'],
  ['oldest', 'Oldest first'],
  ['person', 'Person A–Z'],
]

const compareBy = (sort) => (x, y) => {
  if (sort === 'person') {
    const byName = (x.person || '~').localeCompare(y.person || '~', undefined, { sensitivity: 'base' })
    // A person's own sends stay newest-first underneath their name, so the
    // secondary order is never arbitrary.
    return byName || (y.when || '').localeCompare(x.when || '')
  }
  const newest = (y.when || '').localeCompare(x.when || '')
  return sort === 'oldest' ? -newest : newest
}

export default function AssignedWork({ orgId, sigEndpoint, reloadKey = 0, onCount = null }) {
  const [assignments, setAssignments] = useState([])
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('outstanding')
  // Which kind to show. Also the answer to "this lists some by the form and
  // some by person, can we sort it?" (iCreate, 2026-09-01) — the two shapes in
  // that list are a signature batch and a checklist, and they separate here.
  const [type, setType] = useState('')
  const [sort, setSort] = useState('newest')
  // Narrowing by name, for the list that has grown past scanning: 200-odd
  // assignments across 60 staff, and the office is looking for one of them.
  const [q, setQ] = useState('')

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
        type: a.template_id ? 'checklist' : 'task',
        outstanding: a.status !== 'complete',
        when: a.created_at || '',
        person: a.user_name || '',
        label: `${a.user_name || ''} ${a.template_name || ''}`,
        node: (
          <AssignmentCard key={`a:${a.id}`} orgId={orgId} assignment={a} onChanged={load}
            badge={<TypeBadge>{a.template_id ? 'Checklist' : 'Task'}</TypeBadge>} />
        ),
      })),
      ...batches.map((b) => ({
        key: `b:${b.batch_id}`,
        type: 'signature',
        // A batch is one document across many people, so it has no one person
        // to sort under; its title is what the office knows it by.
        outstanding: b.signed_count < b.total_count,
        when: b.sent_at || '',
        person: '',
        label: b.title || '',
        node: (
          <SignatureBatchCard key={`b:${b.batch_id}`} orgId={orgId} endpoint={sigEndpoint}
            batch={b} onChanged={load} badge={<TypeBadge>Signature</TypeBadge>} />
        ),
      })),
    ]
    rows.sort(compareBy(sort))
    return rows
  }, [assignments, batches, orgId, sigEndpoint, load, sort])

  const outstanding = entries.filter((e) => e.outstanding)
  const byStatus = view === 'outstanding' ? outstanding : entries
  const byType = type ? byStatus.filter((e) => e.type === type) : byStatus
  const needle = q.trim().toLowerCase()
  const shown = needle
    ? byType.filter((e) => (e.label || '').toLowerCase().includes(needle))
    : byType
  const countOf = (t) => entries.filter((e) => e.type === t).length

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
          <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden="true" />
          {[['', 'Every kind'], ...TYPES].map(([value, label]) => (
            <button key={value || 'any'} onClick={() => setType(value)} aria-pressed={type === value}
              className={`px-3 py-1.5 rounded-lg text-sm ${type === value
                ? 'bg-optio-purple/10 text-optio-purple font-semibold'
                : 'text-neutral-600 hover:bg-gray-100'}`}>
              {value ? `${label} (${countOf(value)})` : label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Find a person or a form…" aria-label="Search assigned work"
            className="flex-1 min-w-[12rem] px-3 py-1.5 rounded-lg border border-gray-300 text-sm" />
          <label className="text-sm text-neutral-600 flex items-center gap-1.5">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value)}
              aria-label="Sort assigned work"
              className="px-2 py-1.5 rounded-lg border border-gray-300 text-sm">
              {SORTS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        {loading && <p className="text-sm text-neutral-500">Loading…</p>}
        {!loading && !entries.length && (
          <p className="text-sm text-neutral-500">
            Nothing assigned yet. Use the Assign button to ask somebody to do something.
          </p>
        )}
        {!loading && entries.length > 0 && !shown.length && (
          <p className="text-sm text-neutral-500">
            {needle && byType.length
              ? `Nothing here matches "${q.trim()}".`
              : type && byStatus.length
                ? `No ${(TYPES.find(([v]) => v === type) || [, 'items'])[1].toLowerCase()} here.`
                : 'Everything assigned is done.'}
          </p>
        )}
        <div className="space-y-2">
          {shown.map((e) => e.node)}
        </div>
      </div>

      <ChecklistTemplatesManager orgId={orgId} onChanged={load} />
    </div>
  )
}

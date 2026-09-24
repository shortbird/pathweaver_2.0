import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import { withOrg } from '../../../pages/sis/useSisOrg'
import { ReviewStrip, AssignmentCard, awaitingReviewOf } from './ChecklistReview'
import { matchAssignment } from '../../../pages/sis/checklistSearch'
import { SignatureBatchCard } from './SignatureBatches'
import StatusPill from '../ui/StatusPill'
import { officeTaskApi, useAssignedTasks, useTaskSchedules } from '../../../hooks/api/useTasks'
import { useConfirm } from '../../../contexts/ConfirmContext'

/**
 * Assigned -- everything the office has asked of people.
 *
 * One card per send (iCreate meeting 2026-09-23: "a clear per-task completion
 * view"). A task assigned to 30 people is one card reading "12 of 30 done";
 * open it for each person's status, when they finished, and each of their
 * steps -- with the office's actions on a step (approve, reject, attach a
 * filed document, clear a signature, unassign). Documents sent for signature
 * are cards the same way, counted in signatures.
 *
 * Repeating tasks are not cards (a daily duty for 40 staff would add 40 a
 * day). Each schedule is a row with its days and its pause / end buttons, and
 * opens onto a date x person grid.
 *
 * Outstanding is the default because finished business buries what still
 * needs chasing.
 */

const TypeBadge = ({ children }) => (
  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-neutral-600">{children}</span>
)

const TYPES = [['task', 'Tasks'], ['signature', 'Signatures'], ['repeating', 'Repeating']]
const AUDIENCE_LABEL = { staff: 'Staff', family: 'Families', student: 'Students' }

const SORTS = [
  ['newest', 'Newest first'],
  ['oldest', 'Oldest first'],
  ['title', 'Title A-Z'],
]

const fmtDay = (ymd) => {
  if (!ymd) return ''
  try {
    return new Date(`${String(ymd).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch { return String(ymd) }
}
const fmtWhen = (iso) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return '' }
}

// A person's row, in the shape AssignmentCard (the office's per-step view)
// reads: it was written for the onboarding roll-up's rows.
const asAssignment = (p) => ({ ...p, template_name: p.title, status: p.native_status })

/** One send: title, done/total, and its people. */
export function BatchCard({ orgId, batch: b, onChanged, openOn = {} }) {
  const [saving, setSaving] = useState(false)
  const named = Object.keys(openOn).length > 0
  const saveTemplate = async () => {
    const first = b.people[0]
    if (!first) return
    setSaving(true)
    try {
      await officeTaskApi.saveAsTemplate(orgId, first.id)
      toast.success('Saved as a template')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the template')
    } finally {
      setSaving(false)
    }
  }
  return (
    <details className="border border-gray-200 rounded-lg" open={named ? true : undefined}>
      <summary className="px-3 py-2.5 cursor-pointer flex items-center gap-2 text-sm flex-wrap">
        <span className="font-medium text-neutral-900">{b.title}</span>
        {(b.audiences || []).map((a) => <TypeBadge key={a}>{AUDIENCE_LABEL[a] || a}</TypeBadge>)}
        {b.action === 'reply' && <TypeBadge>Reply</TypeBadge>}
        {['high', 'urgent'].includes(b.priority) && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 capitalize">{b.priority}</span>
        )}
        {b.due_date && <span className="text-xs text-neutral-400">Due {fmtDay(b.due_date)}</span>}
        {b.awaiting_review > 0 && (
          <span className="text-xs text-blue-700">{b.awaiting_review} to review</span>
        )}
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
          b.done === b.total ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>
          {b.done} of {b.total} done
        </span>
      </summary>
      <div className="px-3 pb-3 space-y-2">
        <div className="flex items-center gap-3 text-xs text-neutral-500 flex-wrap">
          {b.assigned_by_name && <span>Assigned by {b.assigned_by_name}</span>}
          {b.created_at && <span>{fmtWhen(b.created_at)}</span>}
          {b.thread_link && (
            <Link to={b.thread_link} className="text-optio-purple hover:underline">Open the thread</Link>
          )}
          <button type="button" onClick={saveTemplate} disabled={saving}
            className="ml-auto text-optio-purple hover:underline disabled:opacity-50">
            Save as template
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-500">
              <th className="py-1 font-medium">Person</th>
              <th className="py-1 font-medium">Status</th>
              <th className="py-1 font-medium">Steps</th>
              <th className="py-1 font-medium">Finished</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {b.people.map((p) => (
              <tr key={p.id}>
                <td className="py-1.5 text-neutral-800">{p.user_name || 'Unknown'}</td>
                <td className="py-1.5"><StatusPill domain="task" status={p.status} fallback="todo" /></td>
                <td className="py-1.5 text-neutral-600">{p.done_count} of {p.total_count}</td>
                <td className="py-1.5 text-neutral-500">{p.finished_at ? fmtWhen(p.finished_at) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-1.5">
          {b.people.map((p) => (
            <AssignmentCard key={p.id} orgId={orgId} assignment={asAssignment(p)}
              onChanged={onChanged} openOn={openOn[p.id] || []} />
          ))}
        </div>
      </div>
    </details>
  )
}

/** Dates x people for one repeating task. */
export function ScheduleGrid({ orgId, scheduleId }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    officeTaskApi.grid(orgId, scheduleId)
      .then((r) => setData(r.data || null))
      .catch(() => setData({ error: true }))
  }, [orgId, scheduleId])
  if (!data) return <p className="text-sm text-neutral-400 px-3 pb-3">Loading…</p>
  if (data.error) return <p className="text-sm text-red-600 px-3 pb-3">Could not load the grid.</p>
  if (!data.dates?.length) {
    return <p className="text-sm text-neutral-400 px-3 pb-3">No days have come up yet.</p>
  }
  const cell = (person, day) => data.cells?.[`${person.id}:${day}`]
  const mark = (c) => {
    if (!c) return <span className="text-neutral-300" title="Not created">-</span>
    if (c.status === 'done') return <span className="text-green-700" title={c.finished_at ? `Done ${fmtWhen(c.finished_at)}` : 'Done'}>Done</span>
    if (c.status === 'expired') return <span className="text-red-600" title="Not done that day">Missed</span>
    return <span className="text-amber-700">Open</span>
  }
  return (
    <div className="px-3 pb-3 overflow-x-auto">
      <table className="text-xs">
        <thead>
          <tr>
            <th className="text-left font-medium text-neutral-500 pr-3 py-1">Person</th>
            {data.dates.map((d) => (
              <th key={d} className="font-medium text-neutral-500 px-2 py-1 whitespace-nowrap">{fmtDay(d)}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.people.map((p) => (
            <tr key={p.id}>
              <td className="pr-3 py-1 text-neutral-800 whitespace-nowrap">{p.name}</td>
              {data.dates.map((d) => (
                <td key={d} className="px-2 py-1 text-center">{mark(cell(p, d))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ScheduleRow({ orgId, schedule: s, onChanged }) {
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const change = async (fields, message) => {
    if (fields.end && !(await confirm(`Stop "${s.title}"? Nothing new is created after today. What already happened stays in the grid.`))) return
    setBusy(true)
    try {
      await officeTaskApi.updateSchedule(orgId, s.id, fields)
      toast.success(message)
      onChanged()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not change it')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="border border-gray-200 rounded-lg">
      <div className="px-3 py-2.5 flex items-center gap-2 text-sm flex-wrap">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          className="font-medium text-neutral-900 hover:underline text-left">
          {s.title}
        </button>
        <TypeBadge>{s.days_label}</TypeBadge>
        <span className="text-xs text-neutral-500">
          {s.recipient_count} {s.recipient_count === 1 ? 'person' : 'people'}
          {' '}from {fmtDay(s.start_date)}{s.end_date ? ` to ${fmtDay(s.end_date)}` : ''}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${s.state === 'active'
          ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-neutral-600'}`}>
          {s.state === 'active' ? 'Active' : s.state === 'paused' ? 'Paused' : 'Ended'}
        </span>
        <span className="ml-auto flex items-center gap-3">
          {s.state === 'active' && (
            <button type="button" disabled={busy} onClick={() => change({ active: false }, 'Paused')}
              className="text-xs text-optio-purple hover:underline">Pause</button>
          )}
          {s.state === 'paused' && (
            <button type="button" disabled={busy} onClick={() => change({ active: true }, 'Resumed')}
              className="text-xs text-optio-purple hover:underline">Resume</button>
          )}
          {s.state !== 'ended' && (
            <button type="button" disabled={busy} onClick={() => change({ end: true }, 'Ended')}
              className="text-xs text-red-600 hover:underline">End</button>
          )}
        </span>
      </div>
      {open && <ScheduleGrid orgId={orgId} scheduleId={s.id} />}
    </div>
  )
}

const compareBy = (sort) => (x, y) => {
  if (sort === 'title') return (x.title || '').localeCompare(y.title || '', undefined, { sensitivity: 'base' })
  const newest = (y.when || '').localeCompare(x.when || '')
  return sort === 'oldest' ? -newest : newest
}

export default function AssignedWork({ orgId, sigEndpoint, reloadKey = 0, onCount = null }) {
  const tasksQuery = useAssignedTasks(orgId)
  const schedulesQuery = useTaskSchedules(orgId)
  const [sigBatches, setSigBatches] = useState([])
  const [view, setView] = useState('outstanding')
  const [type, setType] = useState('')
  const [sort, setSort] = useState('newest')
  const [q, setQ] = useState('')

  const loadSignatures = useCallback(() => {
    if (!orgId) return
    api.get(withOrg(sigEndpoint, orgId))
      .then((r) => setSigBatches(r.data?.batches || []))
      .catch(() => toast.error('Failed to load documents sent for signature'))
  }, [orgId, sigEndpoint])

  const { refetch: refetchTasks } = tasksQuery
  const { refetch: refetchSchedules } = schedulesQuery
  const reload = useCallback(() => {
    refetchTasks()
    refetchSchedules()
    loadSignatures()
  }, [refetchTasks, refetchSchedules, loadSignatures])

  useEffect(() => { loadSignatures() }, [loadSignatures, reloadKey])
  useEffect(() => { if (reloadKey) { refetchTasks(); refetchSchedules() } }, [reloadKey, refetchTasks, refetchSchedules])

  const batches = useMemo(() => tasksQuery.data || [], [tasksQuery.data])
  const schedules = schedulesQuery.data || []

  // Everything finished and waiting on the office's approval, across sends.
  const people = useMemo(() => batches.flatMap((b) => b.people.map(asAssignment)), [batches])
  const awaiting = awaitingReviewOf(people).length
  useEffect(() => { onCount?.(awaiting) }, [awaiting, onCount])

  const needle = q.trim()
  const entries = useMemo(() => {
    const rows = [
      ...batches.map((b) => {
        // A word of the search may name a person, the task or a step; the
        // card opens on the people and steps it named.
        let openOn = {}
        let hit = true
        if (needle) {
          const byPerson = b.people.map((p) => [p.id, matchAssignment(asAssignment(p), needle)])
            .filter(([, m]) => m)
          hit = byPerson.length > 0
          openOn = Object.fromEntries(byPerson.map(([id, m]) => [id, m.items]))
        }
        return {
          key: b.key, type: 'task', title: b.title, when: b.created_at || '',
          outstanding: b.outstanding, hit,
          node: <BatchCard key={b.key} orgId={orgId} batch={b} onChanged={reload} openOn={openOn} />,
        }
      }),
      ...sigBatches.map((b) => ({
        key: `sig:${b.batch_id}`, type: 'signature', title: b.title, when: b.sent_at || '',
        outstanding: b.signed_count < b.total_count,
        hit: !needle || (b.title || '').toLowerCase().includes(needle.toLowerCase()),
        node: <SignatureBatchCard key={b.batch_id} orgId={orgId} endpoint={sigEndpoint}
          batch={b} onChanged={reload} badge={<TypeBadge>To sign</TypeBadge>} />,
      })),
      ...schedules.map((s) => ({
        key: `schedule:${s.id}`, type: 'repeating', title: s.title, when: s.created_at || '',
        outstanding: s.state !== 'ended',
        hit: !needle || (s.title || '').toLowerCase().includes(needle.toLowerCase()),
        node: <ScheduleRow key={s.id} orgId={orgId} schedule={s} onChanged={reload} />,
      })),
    ]
    rows.sort(compareBy(sort))
    return rows
  }, [batches, sigBatches, schedules, orgId, sigEndpoint, reload, sort, needle])

  const outstanding = entries.filter((e) => e.outstanding)
  const byStatus = view === 'outstanding' ? outstanding : entries
  const byType = type ? byStatus.filter((e) => e.type === type) : byStatus
  const shown = byType.filter((e) => e.hit)
  const countOf = (t) => entries.filter((e) => e.type === t).length
  const loading = tasksQuery.isLoading

  return (
    <div className="space-y-6">
      <ReviewStrip orgId={orgId} assignments={people} onChanged={reload} />

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Filter assigned tasks">
          {[['outstanding', `Outstanding (${outstanding.length})`], ['', `All (${entries.length})`]].map(([value, label]) => (
            <button key={value || 'all'} type="button" onClick={() => setView(value)} aria-pressed={view === value}
              className={`px-3 py-1.5 rounded-lg text-sm ${view === value
                ? 'bg-optio-purple/10 text-optio-purple font-semibold'
                : 'text-neutral-600 hover:bg-gray-100'}`}>
              {label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden="true" />
          {[['', 'Every kind'], ...TYPES].map(([value, label]) => (
            <button key={value || 'any'} type="button" onClick={() => setType(value)} aria-pressed={type === value}
              className={`px-3 py-1.5 rounded-lg text-sm ${type === value
                ? 'bg-optio-purple/10 text-optio-purple font-semibold'
                : 'text-neutral-600 hover:bg-gray-100'}`}>
              {value ? `${label} (${countOf(value)})` : label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Find a person or a task, e.g. Lisa W-4" aria-label="Search assigned tasks"
            className="flex-1 min-w-[12rem] px-3 py-1.5 rounded-lg border border-gray-300 text-sm" />
          <label className="text-sm text-neutral-600 flex items-center gap-1.5">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value)}
              aria-label="Sort assigned tasks"
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
            Nothing assigned yet. Use Assign a task to ask somebody to do something.
          </p>
        )}
        {!loading && entries.length > 0 && !shown.length && (
          <p className="text-sm text-neutral-500">
            {needle
              ? `Nothing here matches "${needle}".`
              : type
                // A kind filter that matches nothing says so; "everything is
                // done" would hide the outstanding work of the other kinds.
                ? `No ${(TYPES.find(([v]) => v === type) || [null, 'items'])[1].toLowerCase()} here.`
                : 'Everything assigned is done.'}
          </p>
        )}
        <div className="space-y-2">
          {shown.map((e) => e.node)}
        </div>
      </div>
    </div>
  )
}

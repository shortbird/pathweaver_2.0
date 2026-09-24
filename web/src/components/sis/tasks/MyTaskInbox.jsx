import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import { withOrg } from '../../../pages/sis/useSisOrg'
import StatusPill from '../ui/StatusPill'
import TaskCard from './TaskCard'
import { taskApi } from '../../../hooks/api/useTasks'

/**
 * My tasks -- everything the school is asking this staff member to do.
 *
 * One card per task (iCreate meeting 2026-09-23): a one-step "do this", a
 * multi-step list, a document to sign, today's daily duty, a message the
 * office turned into a task for them. Every step is done in place on the
 * card, and each card has its own comment thread. Policies to acknowledge
 * are the one other kind of thing on the list, and they stay one-line rows:
 * reading and ticking IS the whole task.
 *
 * Until 2026-09-24 this was an inbox of items with a second "By checklist"
 * view, because a request, a checklist item and a signature were three
 * records. They are one record now, so the card is the checklist view and the
 * list is the inbox at the same time.
 *
 * The list is always the CALLER's own (routes/sis/tasks.py takes no
 * ?teacher_id=), so under a teacher preview it says whose it is showing.
 */

function AckRow({ task, orgId, onChanged }) {
  const [busy, setBusy] = useState(false)
  const acknowledge = async () => {
    setBusy(true)
    try {
      await api.post('/api/sis/my-tasks/acknowledge', {
        organization_id: orgId, resource_id: task.resource_id,
      })
      toast.success('Thanks, recorded')
      onChanged()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not record that')
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 flex-wrap">
      <span className="text-sm font-medium text-neutral-900 flex-1 min-w-0">{task.title}</span>
      <StatusPill domain="task" status={task.status} fallback="todo" />
      {task.status !== 'done' && (
        <>
          <Link to={task.link} className="text-sm text-optio-purple hover:underline">Read it</Link>
          <button type="button" onClick={acknowledge} disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
            {busy ? 'Saving…' : 'I have read this'}
          </button>
        </>
      )}
    </li>
  )
}

export default function MyTaskInbox({ orgId, preview = null, openTaskId = null }) {
  const [data, setData] = useState({ tasks: [], counts: {} })
  const [showDone, setShowDone] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!orgId) return
    setLoading(true)
    api.get(withOrg(`/api/sis/my-tasks${showDone ? '?include_done=1' : ''}`, orgId))
      .then((r) => setData({
        tasks: r.data?.tasks || [],
        counts: r.data?.counts || {},
        signature_statement: r.data?.signature_statement,
      }))
      .catch(() => toast.error('Failed to load your tasks'))
      .finally(() => setLoading(false))
  }, [orgId, showDone])

  useEffect(() => { load() }, [load])

  const { open, finished } = useMemo(() => ({
    open: data.tasks.filter((t) => !['done', 'expired'].includes(t.status)),
    finished: data.tasks.filter((t) => ['done', 'expired'].includes(t.status)),
  }), [data.tasks])

  const counts = data.counts || {}
  const card = (t) => (t.type === 'ack'
    ? <AckRow key={t.id} task={t} orgId={orgId} onChanged={load} />
    : (
      <li key={t.id}>
        <TaskCard task={t} api={taskApi} statement={data.signature_statement}
          onChanged={load} highlighted={openTaskId === t.id} showThreadLink />
      </li>
    ))

  return (
    <div className="space-y-4">
      {preview && (
        <p className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
          These are your own tasks, not {preview.name}&apos;s. The teacher preview does not cover
          anybody else&apos;s task list.
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-neutral-600">
          <span className="font-semibold text-neutral-900">{counts.open ?? 0}</span> open
        </span>
        {counts.overdue > 0 && (
          <span className="text-sm text-red-600 font-medium">{counts.overdue} overdue</span>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm text-neutral-600 cursor-pointer">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)}
            className="h-4 w-4 accent-purple-700" />
          Show finished
        </label>
      </div>

      {loading && !data.tasks.length && <p className="text-sm text-neutral-500">Loading…</p>}
      {!loading && !open.length && (
        <p className="text-sm text-neutral-500">
          {finished.length ? 'You are all caught up.' : 'Nothing is waiting on you right now.'}
        </p>
      )}
      <ul className="space-y-3">{open.map(card)}</ul>

      {showDone && finished.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-neutral-900">Finished</h2>
          <ul className="space-y-3">{finished.map(card)}</ul>
        </div>
      )}
    </div>
  )
}

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import BackToDashboard from '../../components/sis/BackToDashboard'
import ChecklistSignature from '../../components/sis/ChecklistSignature'

/**
 * My Tasks — everything the school is currently asking this person to do.
 *
 * Before this page there were four: a request assigned to you lived in Forms, a
 * checklist item in Onboarding, a document sent for your signature nowhere in
 * particular, and a policy to acknowledge in Resources. Nobody checks four
 * places, so things sat.
 *
 * Tasks are completed HERE wherever the whole interaction fits — signing,
 * ticking an item, uploading a document, acknowledging a policy. A request
 * (which is a conversation, with a status and a comment thread) keeps its own
 * page and this list links into it. The rule is: if finishing it takes one
 * interaction, finish it here.
 */

const TYPE_LABEL = {
  request: 'Request',
  signature: 'Signature',
  document_upload: 'Upload',
  checklist_item: 'Checklist',
  ack: 'Acknowledge',
}

const STATUS_LABEL = {
  todo: 'To do',
  in_progress: 'In progress',
  waiting_on_admin: 'With the office',
  done: 'Done',
}

const STATUS_STYLES = {
  todo: 'bg-optio-purple/10 text-optio-purple',
  in_progress: 'bg-amber-100 text-amber-700',
  waiting_on_admin: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
}

const PRIORITY_STYLES = {
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

// "onb:<assignment_id>:<item_key>" — the inbox's id for a checklist item is the
// pair the onboarding API needs to update it, so completing in place needs no
// second lookup.
const parseOnboardingId = (id) => {
  const parts = String(id || '').split(':')
  return parts[0] === 'onb' ? { assignmentId: parts[1], itemKey: parts.slice(2).join(':') } : null
}

const StatusPill = ({ status }) => (
  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[status] || STATUS_STYLES.todo}`}>
    {STATUS_LABEL[status] || status}
  </span>
)

const TaskRow = ({ task, orgId, busy, onChanged, setBusy }) => {
  const onb = parseOnboardingId(task.id)

  const patchItem = async (fields) => {
    if (!onb) return
    setBusy(task.id)
    try {
      await api.patch(`/api/sis/teacher/onboarding/${onb.assignmentId}/items/${onb.itemKey}`, {
        organization_id: orgId, ...fields,
      })
      onChanged()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update the task')
    } finally {
      setBusy(null)
    }
  }

  const uploadDoc = async (file) => {
    if (!onb) return
    setBusy(task.id)
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await api.post(withOrg('/api/sis/teacher/onboarding/upload', orgId), form)
      await api.patch(`/api/sis/teacher/onboarding/${onb.assignmentId}/items/${onb.itemKey}`, {
        organization_id: orgId, document_url: r.data?.path, status: 'complete',
      })
      toast.success('Document sent')
      onChanged()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Upload failed')
    } finally {
      setBusy(null)
    }
  }

  const acknowledge = async () => {
    setBusy(task.id)
    try {
      await api.post('/api/sis/my-tasks/acknowledge', {
        organization_id: orgId, resource_id: task.resource_id,
      })
      toast.success('Thanks — recorded')
      onChanged()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not record that')
    } finally {
      setBusy(null)
    }
  }

  // The document the office shared to sign — same signed-URL door My Documents uses.
  const openSignDoc = async (doc) => {
    try {
      const r = await api.get(withOrg(`/api/sis/teacher/my-documents/${doc.id}/url`, orgId))
      if (r.data?.url) window.open(r.data.url, '_blank', 'noopener')
    } catch {
      toast.error('Could not open the document')
    }
  }

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        {/* A signature or an upload is completed by doing it, not by ticking a
            box — the backend refuses a bare tick on both, so no checkbox. */}
        {task.type === 'checklist_item' ? (
          <input type="checkbox" checked={task.status === 'done'} disabled={busy}
            onChange={(e) => patchItem({ status: e.target.checked ? 'complete' : 'pending' })}
            className="mt-1 h-4 w-4 accent-purple-700" />
        ) : (
          <span className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-neutral-900">{task.title}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-neutral-600">
              {TYPE_LABEL[task.type] || 'Task'}
            </span>
            <StatusPill status={task.status} />
            {PRIORITY_STYLES[task.priority] && (
              <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${PRIORITY_STYLES[task.priority]}`}>
                {task.priority}
              </span>
            )}
            {task.due_date && (
              <span className={`text-xs ${task.overdue ? 'text-red-600 font-medium' : 'text-neutral-400'}`}>
                {task.overdue ? 'Overdue — due' : 'Due'} {task.due_date}
              </span>
            )}
          </div>
          {task.context && <p className="text-xs text-neutral-400 mt-0.5">{task.context}</p>}
          {task.admin_notes && <p className="text-sm text-amber-700 mt-0.5">Note: {task.admin_notes}</p>}

          {task.type === 'signature' && (
            <ChecklistSignature
              item={{ sign_docs: task.sign_docs, signature: null }}
              statement={task.signature_statement}
              busy={busy}
              onSign={(fields) => patchItem(fields)}
              onOpenDoc={openSignDoc}
            />
          )}

          {task.type === 'document_upload' && (
            <label className="mt-1.5 inline-block text-sm text-optio-purple hover:underline cursor-pointer">
              Upload document
              <input type="file" className="hidden" disabled={busy}
                onChange={(e) => e.target.files?.[0] && uploadDoc(e.target.files[0])} />
            </label>
          )}

          {task.type === 'ack' && (
            <div className="mt-1.5 flex items-center gap-3">
              <Link to={task.link} className="text-sm text-optio-purple hover:underline">Read it</Link>
              <button onClick={acknowledge} disabled={busy}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
                {busy ? 'Saving…' : 'I have read this'}
              </button>
            </div>
          )}

          {task.type === 'request' && (
            <Link to={task.link} className="mt-1.5 inline-block text-sm text-optio-purple hover:underline">
              Open request
            </Link>
          )}
        </div>
      </div>
    </li>
  )
}

const MyTasksPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [data, setData] = useState({ tasks: [], counts: {} })
  const [showDone, setShowDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

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

  const { open, done } = useMemo(() => ({
    open: data.tasks.filter((t) => t.status !== 'done'),
    done: data.tasks.filter((t) => t.status === 'done'),
  }), [data.tasks])

  const counts = data.counts || {}

  return (
    <div className="space-y-6">
      <div>
        <BackToDashboard className="mb-1" />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-neutral-900">My Tasks</h1>
          <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
        </div>
        <p className="text-sm text-neutral-500 mt-1">
          Everything waiting on you — documents to sign, checklists, requests and policies to read.
        </p>
      </div>

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
          Show completed
        </label>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        {loading && <p className="text-sm text-neutral-500">Loading…</p>}
        {!loading && !open.length && !done.length && (
          <p className="text-sm text-neutral-500">Nothing is waiting on you right now.</p>
        )}
        {!loading && !open.length && done.length > 0 && (
          <p className="text-sm text-neutral-500">You are all caught up.</p>
        )}
        <ul className="divide-y divide-gray-100">
          {open.map((t) => (
            <TaskRow key={t.id} task={{ ...t, signature_statement: data.signature_statement }}
              orgId={orgId} busy={busyId === t.id} setBusy={setBusyId} onChanged={load} />
          ))}
        </ul>
      </div>

      {showDone && done.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold text-neutral-900 mb-2">Completed</h2>
          <ul className="divide-y divide-gray-100">
            {done.map((t) => (
              <li key={t.id} className="py-2.5 flex items-center gap-2">
                <span className="text-sm text-neutral-400 line-through truncate">{t.title}</span>
                <span className="ml-auto"><StatusPill status="done" /></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default MyTasksPage

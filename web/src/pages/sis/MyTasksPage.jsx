import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import BackToDashboard from '../../components/sis/BackToDashboard'
import ChecklistSignature from '../../components/sis/ChecklistSignature'
import { getPreviewTeacher } from './teacherPreview'
import { MyDocumentsPanel } from './MyDocumentsPage'
import MyChecklists from '../../components/sis/tasks/MyChecklists'
import { isPathHidden } from './sisModules'
import { useConfirm } from '../../contexts/ConfirmContext'
import AnnouncementBody from '../../components/announcements/AnnouncementBody'
import StatusPill from '../../components/sis/ui/StatusPill'
import GlassTabBar from '../../components/ui/GlassTabBar'

/**
 * My Tasks — everything the school is currently asking this person to do,
 * and the documents behind it.
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
 *
 * The Documents tab is the same person-scoped view /my-documents serves (that
 * page stays mounted for deep links): what the school shared with you, what
 * you sent in. Half of what lands here is "sign this" or "upload that", so the
 * files those tasks produce live one tab over instead of one nav entry away.
 *
 * The Checklist tab is the whole onboarding checklist, ticks and all -- the
 * one list people go looking for on purpose ("which of my documents are in,
 * which are still owed", iCreate 2026-09-10), which an inbox of outstanding
 * work cannot answer. It was its own page, /onboarding, until M9; that path
 * redirects here and the sidebar's Onboarding entry opens this tab.
 *
 * Under a teacher preview the tasks tab cannot answer for the teacher — the
 * inbox is always the CALLER's own (routes/sis/tasks.py takes no ?teacher_id=)
 * — so a preview lands on Documents, which does support it, and the tasks tab
 * says whose list it would be showing. The Checklist tab supports the
 * preview too.
 */

const TYPE_LABEL = {
  request: 'Request',
  signature: 'Signature',
  document_upload: 'Upload',
  checklist_item: 'Checklist',
  ack: 'Acknowledge',
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

const TaskStatus = ({ status }) => <StatusPill domain="task" status={status} fallback="todo" />

const TaskRow = ({ task, orgId, busy, onChanged, setBusy }) => {
  const confirm = useConfirm()
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
        organization_id: orgId,
        add_document: { path: r.data?.path, filename: file.name },
        status: 'complete',
      })
      toast.success('Document sent')
      onChanged()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Upload failed')
    } finally {
      setBusy(null)
    }
  }

  const removeDoc = async (doc) => {
    if (!onb) return
    if (!(await confirm(`Remove ${doc.filename || 'this document'}?`))) return
    setBusy(task.id)
    try {
      await api.patch(`/api/sis/teacher/onboarding/${onb.assignmentId}/items/${onb.itemKey}`, {
        organization_id: orgId, remove_document: doc.path,
      })
      toast.success('Document removed')
      onChanged()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove document')
    } finally {
      setBusy(null)
    }
  }

  const openDoc = async (path) => {
    try {
      const r = await api.get(withOrg(`/api/sis/teacher/onboarding/doc-url?path=${encodeURIComponent(path)}`, orgId))
      if (r.data?.url) window.open(r.data.url, '_blank', 'noopener')
    } catch {
      toast.error('Could not open the document')
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
            <TaskStatus status={task.status} />
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
          {/* The office writes "the form is at https://..." into a task note,
              and a URL that is not a link is a URL somebody retypes by hand
              (iCreate e92b18ca). AnnouncementBody already turns every http(s)
              URL in a plain body into a labeled button; this is the same text
              in a different queue. */}
          {task.admin_notes && (
            <div className="text-sm text-amber-700 mt-0.5">
              Note: <AnnouncementBody text={task.admin_notes} className="inline text-amber-700" />
            </div>
          )}

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
            <div className="mt-1.5 space-y-1">
              {(task.documents || []).map((doc) => (
                <div key={doc.path} className="flex items-center gap-3">
                  <button onClick={() => openDoc(doc.path)} className="text-sm text-optio-purple hover:underline">
                    {doc.filename || 'View document'}
                  </button>
                  <button onClick={() => removeDoc(doc)}
                    className="text-xs text-red-600 hover:underline">Remove</button>
                </div>
              ))}
              <label className="inline-block text-sm text-optio-purple hover:underline cursor-pointer">
                {(task.documents || []).length ? 'Add another document' : 'Upload document'}
                <input type="file" className="hidden" disabled={busy}
                  onChange={(e) => e.target.files?.[0] && uploadDoc(e.target.files[0])} />
              </label>
            </div>
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

const TABS = ['tasks', 'checklist', 'documents']

const MyTasksPage = () => {
  const { orgId, activeOrg } = useSisOrg()
  const [preview] = useState(() => getPreviewTeacher())
  const [searchParams, setSearchParams] = useSearchParams()
  // An org that hid the onboarding module before the tab existed keeps it
  // hidden: the config is a promise already made (sisModules).
  const checklistHidden = isPathHidden('/onboarding', activeOrg)
  // A preview lands on Documents: the tasks tab can only answer for the caller.
  const wanted = searchParams.get('tab')
  const tab = TABS.includes(wanted) && !(wanted === 'checklist' && checklistHidden)
    ? wanted : (preview ? 'documents' : 'tasks')
  const openItemKey = searchParams.get('item')
  const [data, setData] = useState({ tasks: [], counts: {} })
  const [showDone, setShowDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  const setTab = (next) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'tasks' && !preview) params.delete('tab')
    else params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

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
          <h1 className="text-2xl font-bold text-neutral-900">
            {preview && tab === 'documents' ? `${preview.name}'s documents` : 'My Tasks'}
          </h1>
        </div>
        <p className="text-sm text-neutral-500 mt-1">
          Everything waiting on you — documents to sign, checklists, requests and policies to
          read — and your documents: what the school shared with you, and what you send back.
        </p>
        {preview && tab === 'tasks' && (
          <p className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
            These are your own tasks, not {preview.name}&apos;s — the teacher preview does not cover
            the task inbox. Their checklist and their documents are on the other two tabs here.
          </p>
        )}
      </div>

      <GlassTabBar
        align="start" size="md" aria-label="My Tasks sections"
        tabs={[
          { id: 'tasks', label: 'My tasks' },
          ...(checklistHidden ? [] : [{ id: 'checklist', label: 'My checklist' }]),
          { id: 'documents', label: 'My documents' },
        ]}
        active={tab} onSelect={setTab}
      />

      {tab === 'documents' && <MyDocumentsPanel orgId={orgId} preview={preview} />}

      {tab === 'checklist' && <MyChecklists orgId={orgId} preview={preview} openItemKey={openItemKey} />}

      {tab === 'tasks' && (
        <>
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
            {/* This list drops finished work, which is right for an inbox and
                wrong for the question people actually bring to it: "which of my
                documents are in, and which do I still owe?". Answering that
                needs the whole checklist, ticks and all, so say where it is
                rather than leaving an empty page to imply there was never
                anything here (iCreate, 2026-09-10). */}
            {!loading && !preview && !checklistHidden && (
              <p className="text-sm text-neutral-500 mt-3 pt-3 border-t border-gray-100">
                <button type="button" onClick={() => setTab('checklist')}
                  className="text-optio-purple hover:underline">
                  See your full checklist
                </button>
                {' '}— every item, including the ones you have already finished.
              </p>
            )}
          </div>

          {showDone && done.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-neutral-900 mb-2">Completed</h2>
              <ul className="divide-y divide-gray-100">
                {done.map((t) => (
                  <li key={t.id} className="py-2.5 flex items-center gap-2">
                    <span className="text-sm text-neutral-400 line-through truncate">{t.title}</span>
                    <span className="ml-auto"><TaskStatus status="done" /></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default MyTasksPage

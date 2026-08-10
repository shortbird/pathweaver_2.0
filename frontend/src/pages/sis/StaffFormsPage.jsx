import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import { useAuth } from '../../contexts/AuthContext'
import { isSisAdmin } from './sisRole'
import { getPreviewTeacher, withPreview } from './teacherPreview'
import BackToDashboard from '../../components/sis/BackToDashboard'

/**
 * StaffFormsPage — staff forms and the internal task system (iCreate Phase 2).
 * Teachers: submit a form + track their own submissions.
 * Admins: additionally run the org-wide queue — assign a submission to a staff
 * member, set priority and due date, move it through the working statuses, and
 * discuss it in comments. An admin can also file a task pre-assigned.
 */

const STATUS_STYLES = {
  submitted: 'bg-gray-100 text-neutral-600',
  under_review: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  waiting: 'bg-purple-100 text-purple-700',
  resolved: 'bg-green-100 text-green-700',
}

const STATUSES = [
  ['submitted', 'New'],
  ['under_review', 'Under review'],
  ['in_progress', 'In progress'],
  ['waiting', 'Waiting'],
  ['resolved', 'Completed'],
]

const PRIORITIES = ['low', 'normal', 'high', 'urgent']
const PRIORITY_STYLES = {
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent'

const StatusPill = ({ status }) => (
  <span className={`text-xs px-2 py-0.5 rounded-full capitalize shrink-0 ${STATUS_STYLES[status] || STATUS_STYLES.submitted}`}>
    {String(status || '').replace('_', ' ')}
  </span>
)

const SubmitForm = ({ orgId, formTypes, onSubmitted, disabled = false, admin = false, staff = [] }) => {
  const [formType, setFormType] = useState('incident')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [location, setLocation] = useState('')
  const [assignTo, setAssignTo] = useState('')
  const [priority, setPriority] = useState('normal')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!body.trim()) { toast.error('Please describe the issue or request'); return }
    setBusy(true)
    try {
      const payload = {
        organization_id: orgId, form_type: formType,
        title: title.trim() || undefined, body: body.trim(),
        location: location.trim() || undefined,
      }
      if (admin) {
        // The staff-admin create door may assign; a teacher's cannot.
        await api.post('/api/sis/staff-admin/forms', {
          ...payload,
          assigned_to: assignTo || undefined,
          priority: priority !== 'normal' ? priority : undefined,
          due_date: dueDate || undefined,
        })
      } else {
        await api.post('/api/sis/teacher/forms', payload)
      }
      toast.success(admin && assignTo
        ? 'Task created and assigned'
        : 'Submitted — your administrator has been notified')
      setTitle(''); setBody(''); setLocation(''); setAssignTo(''); setPriority('normal'); setDueDate('')
      onSubmitted()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not submit the form')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h2 className="font-semibold text-neutral-900">{admin ? 'Submit a form or task' : 'Submit a form'}</h2>
      {/* Teachers see this page too, so the description is written to them.
          Admins get the third-person version, which is what they're here for. */}
      <p className="text-sm text-neutral-500">
        {admin
          ? 'File a request or create a task — optionally assigned straight to a staff member.'
          : 'Submit your supply requests, incident reports, and more.'}
        {disabled && ' Submitting is turned off while previewing.'}
      </p>
      <fieldset disabled={disabled} className={disabled ? 'opacity-60 space-y-3' : 'space-y-3'}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <select value={formType} onChange={(e) => setFormType(e.target.value)} className={inputClass}>
          {Object.entries(formTypes).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short title (optional)" className={inputClass} />
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4}
        placeholder="What happened / what do you need?" className={`${inputClass} resize-none`} />
      {admin && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-xs text-neutral-500">
            Assign to
            <select aria-label="Assign to" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}
              className={`${inputClass} mt-1`}>
              <option value="">Nobody yet</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-neutral-500">
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={`${inputClass} mt-1 capitalize`}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-xs text-neutral-500">
            Due date
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
        </div>
      )}
      <div className="flex items-center gap-3">
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" className={inputClass} />
        <button type="submit" disabled={busy || disabled}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50 shrink-0">
          {busy ? 'Submitting…' : 'Submit'}
        </button>
      </div>
      </fieldset>
    </form>
  )
}

const CommentThread = ({ orgId, submissionId }) => {
  const [comments, setComments] = useState(null)
  const [draft, setDraft] = useState('')

  const load = useCallback(() => {
    api.get(withOrg(`/api/sis/staff-admin/forms/${submissionId}/comments`, orgId))
      .then((r) => setComments(r.data?.comments || []))
      .catch(() => toast.error('Failed to load comments'))
  }, [orgId, submissionId])

  useEffect(() => { load() }, [load])

  const post = async () => {
    if (!draft.trim()) return
    try {
      await api.post(`/api/sis/staff-admin/forms/${submissionId}/comments`, {
        organization_id: orgId, body: draft.trim(),
      })
      setDraft('')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not post the comment')
    }
  }

  if (comments === null) return <p className="text-xs text-neutral-400 mt-2">Loading comments…</p>
  return (
    <div className="mt-2 rounded-lg bg-gray-50 border border-gray-100 p-2 space-y-2">
      {!comments.length && <p className="text-xs text-neutral-400">No comments yet.</p>}
      {comments.map((c) => (
        <p key={c.id} className="text-sm text-neutral-700">
          <span className="font-medium">{c.author_name || 'Someone'}</span>
          <span className="text-xs text-neutral-400 ml-2">{new Date(c.created_at).toLocaleString()}</span>
          <span className="block whitespace-pre-wrap">{c.body}</span>
        </p>
      ))}
      <div className="flex items-center gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment…"
          className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
        <button onClick={post} className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-sm">Post</button>
      </div>
    </div>
  )
}

const AdminQueue = ({ orgId, staff }) => {
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('')
  const [notes, setNotes] = useState({})
  const [commentsOpen, setCommentsOpen] = useState({})

  const load = useCallback(() => {
    api.get(withOrg(`/api/sis/staff-admin/forms${filter ? `?status=${filter}` : ''}`, orgId))
      .then((r) => setRows(r.data?.submissions || []))
      .catch(() => toast.error('Failed to load submissions'))
  }, [orgId, filter])

  useEffect(() => { if (orgId) load() }, [load, orgId])

  const update = async (id, fields) => {
    try {
      await api.patch(`/api/sis/staff-admin/forms/${id}`, {
        organization_id: orgId, ...fields,
      })
      toast.success('Updated')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update')
    }
  }

  const controlClass = 'px-2 py-1.5 border border-gray-300 rounded-lg text-sm'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-neutral-900">Requests and tasks</h2>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className={controlClass}>
          <option value="">All statuses</option>
          {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {!rows.length && <p className="text-sm text-neutral-500">No submissions.</p>}
      <ul className="divide-y divide-gray-100">
        {rows.map((f) => (
          <li key={f.id} className="py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-neutral-600">{f.form_type_label}</span>
              {f.submitter_role === 'parent' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-optio-purple/10 text-optio-purple font-medium">Parent</span>
              )}
              <span className="font-medium text-neutral-900">{f.title}</span>
              <StatusPill status={f.status} />
              {PRIORITY_STYLES[f.priority] && (
                <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${PRIORITY_STYLES[f.priority]}`}>{f.priority}</span>
              )}
              {f.due_date && (
                <span className="text-xs text-neutral-500">Due {f.due_date}</span>
              )}
              <span className="text-xs text-neutral-400 ml-auto">
                {f.submitted_by_name} · {new Date(f.created_at).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm text-neutral-600 mt-1 whitespace-pre-wrap">{f.payload?.body}</p>
            {f.payload?.location && <p className="text-xs text-neutral-400">Location: {f.payload.location}</p>}
            {f.resolution_notes && (
              <p className="text-sm text-green-700 mt-1">Resolution: {f.resolution_notes}</p>
            )}

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <label className="text-xs text-neutral-500 flex items-center gap-1">
                Status
                <select aria-label="Status" value={f.status}
                  onChange={(e) => update(f.id, { status: e.target.value, resolution_notes: notes[f.id] || undefined })}
                  className={controlClass}>
                  {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-xs text-neutral-500 flex items-center gap-1">
                Assigned to
                <select aria-label="Assigned to" value={f.assigned_to || ''}
                  onChange={(e) => update(f.id, { assigned_to: e.target.value || null })}
                  className={controlClass}>
                  <option value="">Nobody</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-neutral-500 flex items-center gap-1">
                Priority
                <select aria-label="Priority" value={f.priority || 'normal'}
                  onChange={(e) => update(f.id, { priority: e.target.value })}
                  className={`${controlClass} capitalize`}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="text-xs text-neutral-500 flex items-center gap-1">
                Due
                <input type="date" aria-label="Due date" value={f.due_date || ''}
                  onChange={(e) => update(f.id, { due_date: e.target.value || null })}
                  className={controlClass} />
              </label>
              <button onClick={() => setCommentsOpen((p) => ({ ...p, [f.id]: !p[f.id] }))}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50">
                Comments
              </button>
            </div>

            {f.status !== 'resolved' && (
              <div className="flex items-center gap-2 mt-2">
                <input value={notes[f.id] || ''} onChange={(e) => setNotes((p) => ({ ...p, [f.id]: e.target.value }))}
                  placeholder="Resolution notes (optional)"
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
                <button onClick={() => update(f.id, { status: 'resolved', resolution_notes: notes[f.id] || undefined })}
                  className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-sm">
                  Resolve
                </button>
              </div>
            )}

            {commentsOpen[f.id] && <CommentThread orgId={orgId} submissionId={f.id} />}
          </li>
        ))}
      </ul>
    </div>
  )
}

const StaffFormsPage = () => {
  const { user } = useAuth()
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const admin = isSisAdmin(user)
  const [preview] = useState(() => (isSisAdmin(user) ? getPreviewTeacher() : null))
  const [mine, setMine] = useState([])
  const [formTypes, setFormTypes] = useState({})
  const [staff, setStaff] = useState([])

  const loadMine = useCallback(() => {
    if (!orgId) return
    api.get(withPreview(withOrg('/api/sis/teacher/forms', orgId), preview))
      .then((r) => { setMine(r.data?.submissions || []); setFormTypes(r.data?.form_types || {}) })
      .catch(() => toast.error('Failed to load your submissions'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, preview?.id])

  useEffect(() => { loadMine() }, [loadMine])

  // The assignee picker's roster (admins only — the endpoint is admin-gated).
  useEffect(() => {
    if (!orgId || !admin || preview) return
    api.get(withOrg('/api/sis/staff', orgId))
      .then((r) => setStaff(r.data?.staff || []))
      .catch(() => setStaff([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, admin, preview?.id])

  return (
    <div className="space-y-6">
      <div>
        <BackToDashboard className="mb-1" />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-neutral-900">Forms</h1>
          <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
        </div>
      </div>

      {Object.keys(formTypes).length > 0 && (
        <SubmitForm orgId={orgId} formTypes={formTypes} onSubmitted={loadMine}
          disabled={Boolean(preview)} admin={admin && !preview} staff={staff} />
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-neutral-900 mb-3">
          {preview ? `${preview.name}'s submissions` : 'My submissions'}
        </h2>
        {!mine.length && <p className="text-sm text-neutral-500">Nothing submitted yet.</p>}
        <ul className="divide-y divide-gray-100">
          {mine.map((f) => (
            <li key={f.id} className="py-2.5 flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-neutral-600 shrink-0">{f.form_type_label}</span>
              <span className="text-sm text-neutral-800 truncate">{f.title}</span>
              <span className="text-xs text-neutral-400 ml-auto shrink-0">{new Date(f.created_at).toLocaleDateString()}</span>
              <StatusPill status={f.status} />
            </li>
          ))}
        </ul>
      </div>

      {admin && !preview && <AdminQueue orgId={orgId} staff={staff} />}
    </div>
  )
}

export default StaffFormsPage

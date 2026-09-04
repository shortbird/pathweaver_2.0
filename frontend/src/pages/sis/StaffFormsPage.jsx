import React, { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import { useAuth } from '../../contexts/AuthContext'
import { isSisAdmin } from './sisRole'
import { getPreviewTeacher, withPreview } from './teacherPreview'
import BackToDashboard from '../../components/sis/BackToDashboard'
import SearchSelect from '../../components/ui/SearchSelect'
import PaperworkTemplatesManager from '../../components/sis/tasks/PaperworkTemplatesManager'
import { useConfirm } from '../../contexts/ConfirmContext'

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

// Exported: the Task Center opens this in a dialog from its "Assign or send"
// menu, so filing a task no longer means leaving the page you track tasks on.
/**
 * One question on an org-defined form. The server validates what comes back —
 * this is the affordance, not the gate.
 */
// The classic three fields, and everything an org-defined form asked for.
// Reading the answers off the template would break the moment a form is edited,
// so a submission is rendered from what it actually stored.
const BUILTIN_PAYLOAD_KEYS = ['body', 'location', 'occurred_at']

export const AnswerList = ({ payload, fields }) => {
  const answered = Object.entries(payload || {})
    .filter(([k]) => !BUILTIN_PAYLOAD_KEYS.includes(k))
  if (!answered.length) return null
  const labels = Object.fromEntries((fields || []).map((f) => [f.key, f.label]))
  const show = (v) => (v === true ? 'Yes' : v === false ? 'No' : String(v))
  return (
    <dl className="text-sm space-y-1.5">
      {answered.map(([key, value]) => (
        <div key={key}>
          <dt className="text-xs font-medium text-neutral-500">
            {labels[key] || key.replace(/_/g, ' ')}
          </dt>
          <dd className="text-neutral-700 whitespace-pre-wrap">
            {value == null || value === '' ? <span className="text-neutral-400">Not answered</span> : show(value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export const FormField = ({ field, value, onChange, students = [], classes = [], staff = [] }) => {
  const label = (
    <span className="block text-xs font-medium text-neutral-600 mb-1">
      {field.label}{field.required ? <span className="text-red-500"> *</span> : null}
    </span>
  )
  const hint = field.help
    ? <span className="block text-[11px] text-neutral-500 mt-0.5">{field.help}</span>
    : null

  const pick = (options, getLabel, placeholder) => (
    <SearchSelect value={value || ''} onChange={onChange} options={options}
      getId={(o) => o.id} getLabel={getLabel} placeholder={placeholder}
      emptyLabel={field.required ? '' : 'Leave blank'} />
  )

  if (field.type === 'checkbox') {
    return (
      <label className="flex items-start gap-2 text-sm text-neutral-700">
        <input type="checkbox" checked={!!value} className="mt-0.5 accent-optio-purple"
          onChange={(e) => onChange(e.target.checked)} />
        <span>{field.label}{field.required ? <span className="text-red-500"> *</span> : null}{hint}</span>
      </label>
    )
  }

  return (
    <label className="block">
      {label}
      {field.type === 'long_text' && (
        <textarea rows={4} value={value || ''} onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} resize-none`} />
      )}
      {field.type === 'short_text' && (
        <input value={value || ''} onChange={(e) => onChange(e.target.value)} className={inputClass} />
      )}
      {field.type === 'date' && (
        <input type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} className={inputClass} />
      )}
      {field.type === 'number' && (
        <input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputClass} />
      )}
      {field.type === 'select' && (
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">Choose…</option>
          {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {field.type === 'student' && pick(students, (s) => s.name, 'Find a student…')}
      {field.type === 'class' && pick(classes, (c) => c.name, 'Find a class…')}
      {field.type === 'staff' && pick(staff, (s) => s.name || s.display_name || s.email, 'Find a staff member…')}
      {hint}
    </label>
  )
}

export const SubmitForm = ({ orgId, formTypes, forms = [], onSubmitted, disabled = false, admin = false, staff = [], students = [], classes = [], embedded = false }) => {
  // `forms` carries the school's own forms alongside the built-ins, each with
  // the questions it asks. A built-in has no fields, which is what says "render
  // the classic body/location form".
  const options = forms.length
    ? forms
    : Object.entries(formTypes || {}).map(([key, name]) => ({ key, name, fields: [] }))
  const [formType, setFormType] = useState(options[0]?.key || 'incident')
  const active = options.find((f) => f.key === formType) || options[0]
  const custom = (active?.fields || []).length > 0

  const [answers, setAnswers] = useState({})
  const setAnswer = (key, value) => setAnswers((a) => ({ ...a, [key]: value }))
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [location, setLocation] = useState('')
  const [assignTo, setAssignTo] = useState('')
  const [priority, setPriority] = useState('normal')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!custom && !body.trim()) { toast.error('Please describe the issue or request'); return }
    setBusy(true)
    try {
      // The server validates either way; this only decides what to send.
      const payload = custom
        ? { organization_id: orgId, form_type: formType,
            title: title.trim() || undefined, answers }
        : { organization_id: orgId, form_type: formType,
            title: title.trim() || undefined, body: body.trim(),
            location: location.trim() || undefined }
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
      setTitle(''); setBody(''); setLocation(''); setAnswers({})
      setAssignTo(''); setPriority('normal'); setDueDate('')
      onSubmitted()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not submit the form')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}
      className={embedded ? 'space-y-3' : 'bg-white rounded-xl border border-gray-200 p-4 space-y-3'}>
      {/* In a dialog the heading is the dialog's, not the form's. */}
      {!embedded && (
        <h2 className="font-semibold text-neutral-900">{admin ? 'Submit a form or task' : 'Submit a form'}</h2>
      )}
      {/* Teachers see this page too, so the description is written to them.
          Admins get the third-person version, which is what they're here for. */}
      <p className="text-sm text-neutral-500">
        {admin
          ? 'File a request or create a task — optionally assigned straight to a staff member.'
          : 'Submit your supply requests, incident reports, and more.'}
        {disabled && ' Submitting is turned off while previewing, but the list of forms is still browsable.'}
      </p>
      {/* The type picker stays outside the disabled fieldset. An admin in
          preview is here precisely to find out what teachers can file, and a
          disabled <select> cannot be opened at all — so the whole list
          collapsed to whichever option happened to be first (iCreate,
          2026-08-20: "In the preview mode I can't really see what forms are
          available"). Choosing a type writes nothing; Submit is the write, and
          Submit is what preview turns off. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <select aria-label="Form type" value={formType}
          onChange={(e) => { setFormType(e.target.value); setAnswers({}) }} className={inputClass}>
          {options.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short title (optional)"
          disabled={disabled} className={`${inputClass}${disabled ? ' opacity-60' : ''}`} />
      </div>
      <fieldset disabled={disabled} className={disabled ? 'opacity-60 space-y-3' : 'space-y-3'}>
      {active?.description && (
        <p className="text-sm text-neutral-600 whitespace-pre-line">{active.description}</p>
      )}
      {custom ? (
        active.fields.map((f) => (
          <FormField key={f.key} field={f} value={answers[f.key]}
            onChange={(v) => setAnswer(f.key, v)} students={students} classes={classes} staff={staff} />
        ))
      ) : (
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4}
          placeholder="What happened / what do you need?" className={`${inputClass} resize-none`} />
      )}
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
        {!custom && (
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" className={inputClass} />
        )}
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

// The queue's three views. "Open" is everything not yet resolved — the office's
// actual working set, and the default, because loading every status meant
// resolved history was interleaved with live work forever and the queue could
// only grow. Completed is somewhere you go, not something you scroll past.
const QUEUE_VIEWS = [
  ['open', 'Open'],
  ['resolved', 'Completed'],
  ['', 'All'],
]

// Exported: the Task Center's Requests tab is this queue, unchanged. It stays
// here rather than moving to its own file so the page and the tab can never
// drift into two versions of the same queue.
//
// One row is one line until you open it. Rendering every submission's four
// controls, resolution box and comment toggle at once turned a queue of twenty
// into twenty open mini-forms — around 120 live controls on a page whose job is
// to answer "what needs attention?". Scanning and editing are different
// activities, so they are now different states of the row.
export const AdminQueue = ({ orgId, staff, openSubmissionId = null, onCount = null }) => {
  const confirm = useConfirm()
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})
  const [view, setView] = useState('open')
  const [notes, setNotes] = useState({})
  // What is typed in a due-date box before it is a whole date. A native date
  // input reports '' until the year is finished, so saving on every keystroke
  // saved a null halfway through and reloaded the row on top of the typing —
  // which is why the year could not be typed at all (iCreate, 2026-08-20).
  const [dueDrafts, setDueDrafts] = useState({})
  // Who the row belongs to. Reassigning has always worked — it is a control on
  // the open row — but "who has this?" could only be answered by opening rows
  // one at a time, which is what made it look like it could not be done
  // (iCreate, 2026-08-21: "can we reassign tasks from teachers or parents once
  // they come in?").
  const [assignee, setAssignee] = useState('')   // '' any | 'me' | 'none' | user id
  // A request opened from the task inbox arrives with its id in the URL: expand
  // that row, so the person lands on the row they clicked rather than at the
  // top of a queue and a hunt.
  const [openRow, setOpenRow] = useState(() => openSubmissionId || null)
  const [commentsOpen, setCommentsOpen] = useState(
    () => (openSubmissionId ? { [openSubmissionId]: true } : {}))
  // form_type -> its questions, so a submission's stored answers can be shown
  // under the labels they were asked under. Best-effort: a submission renders
  // its answers with or without this.
  const [formFieldsByType, setFormFieldsByType] = useState({})

  useEffect(() => {
    if (!orgId) return
    api.get(withOrg('/api/sis/staff-admin/form-templates', orgId))
      .then((r) => setFormFieldsByType(Object.fromEntries(
        (r.data?.templates || []).map((t) => [t.key, t.fields || []]))))
      .catch(() => setFormFieldsByType({}))
  }, [orgId])

  const load = useCallback(() => {
    api.get(withOrg(`/api/sis/staff-admin/forms${view ? `?status=${view}` : ''}`, orgId))
      .then((r) => {
        setRows(r.data?.submissions || [])
        setCounts(r.data?.counts || {})
      })
      .catch(() => toast.error('Failed to load submissions'))
  }, [orgId, view])

  useEffect(() => { if (orgId) load() }, [load, orgId])
  useEffect(() => { if (counts.open !== undefined) onCount?.(counts.open) }, [counts.open, onCount])

  // A deep-linked request may be resolved, in which case the default Open view
  // would not contain it. Widen once rather than showing an empty queue.
  useEffect(() => {
    if (openSubmissionId && rows.length && !rows.some((r) => r.id === openSubmissionId)) {
      setView('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSubmissionId, rows])

  // Every control on a row saves the moment it changes; there is no Save
  // button and never has been. That was invisible, so an admin who reassigned a
  // task went looking for one and pressed the only button on the row --
  // Resolve, which closed the task they had just handed on (iCreate,
  // 2026-08-26). Saying what was saved is half the fix; the other half is the
  // confirm on Resolve below.
  const SAVED_LABEL = {
    assigned_to: 'Reassigned',
    status: 'Status updated',
    priority: 'Priority updated',
    due_date: 'Due date updated',
  }

  const resolveTask = async (f) => {
    const who = f.assigned_to
      ? (staff.find((s) => s.id === f.assigned_to)?.name || 'someone')
      : null
    const ok = await confirm(
      who
        ? `Close this out? It is assigned to ${who}, and resolving it ends the task rather than handing it on.`
        : 'Close this out? Resolving ends the task.')
    if (!ok) return
    update(f.id, { status: 'resolved', resolution_notes: notes[f.id] || undefined })
  }

  const update = async (id, fields) => {
    try {
      await api.patch(`/api/sis/staff-admin/forms/${id}`, {
        organization_id: orgId, ...fields,
      })
      const key = Object.keys(fields).find((k) => SAVED_LABEL[k])
      toast.success(key ? SAVED_LABEL[key] : 'Saved')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update')
    }
  }

  // A complete date saves as soon as it is complete (so the calendar picker
  // still feels immediate); an emptied box saves only once you leave it.
  const editDue = (id, value) => {
    setDueDrafts((p) => ({ ...p, [id]: value }))
    if (value) update(id, { due_date: value })
  }
  const commitDue = (id, saved) => {
    const draft = dueDrafts[id]
    setDueDrafts((p) => {
      const next = { ...p }
      delete next[id]
      return next
    })
    if (draft === '' && saved) update(id, { due_date: null })
  }

  const visibleRows = rows.filter((r) => {
    if (!assignee) return true
    if (assignee === 'none') return !r.assigned_to
    if (assignee === 'me') return r.assigned_to === user?.id
    return r.assigned_to === assignee
  })

  const controlClass = 'px-2 py-1.5 border border-gray-300 rounded-lg text-sm'
  const viewCount = (value) => (
    value === 'open' ? counts.open : value === 'resolved' ? counts.resolved : undefined
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        {/* One word. "Forms, requests and tasks" listed every noun this record
            has ever been called, and reading three nouns to find one queue is
            the confusion the 2026-08-31 redesign exists to end. */}
        <h2 className="font-semibold text-neutral-900">Requests</h2>
        <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs text-neutral-500 flex items-center gap-1">
          Assigned to
          <select aria-label="Filter by assignee" value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm">
            <option value="">Anyone</option>
            <option value="me">Me</option>
            <option value="none">Nobody yet</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1" role="group" aria-label="Filter requests">
          {QUEUE_VIEWS.map(([value, label]) => {
            const n = viewCount(value)
            return (
              <button key={value || 'all'} onClick={() => setView(value)}
                aria-pressed={view === value}
                className={`px-3 py-1.5 rounded-lg text-sm ${view === value
                  ? 'bg-optio-purple/10 text-optio-purple font-semibold'
                  : 'text-neutral-600 hover:bg-gray-100'}`}>
                {label}{n !== undefined ? ` (${n})` : ''}
              </button>
            )
          })}
        </div>
        </div>
      </div>
      {!visibleRows.length && (
        <p className="text-sm text-neutral-500">
          {assignee
            ? 'Nothing here for them.'
            : view === 'open' ? 'Nothing open — the queue is clear.' : 'No submissions.'}
        </p>
      )}
      <ul className="divide-y divide-gray-100">
        {visibleRows.map((f) => {
          const expanded = openRow === f.id
          return (
            <li key={f.id}
              className={f.id === openSubmissionId ? 'ring-2 ring-optio-purple rounded-lg px-2 -mx-2' : ''}>
              {/* The scan line. Everything needed to triage, nothing needed to edit. */}
              <button type="button" aria-expanded={expanded}
                onClick={() => setOpenRow(expanded ? null : f.id)}
                className="w-full text-left py-3 flex items-center gap-2 flex-wrap hover:bg-gray-50 rounded-lg px-2 -mx-2">
                <span className={`text-neutral-400 text-xs shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
                  aria-hidden="true">▶</span>
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
                <span className="text-xs text-neutral-400 ml-auto text-right">
                  {f.assigned_to_name ? `${f.assigned_to_name} · ` : ''}
                  {f.submitted_by_name} · {new Date(f.created_at).toLocaleDateString()}
                </span>
              </button>

              {expanded && (
                <div className="pb-3 px-2">
                  {f.payload?.body && (
                    <p className="text-sm text-neutral-600 whitespace-pre-wrap">{f.payload.body}</p>
                  )}
                  {f.payload?.location && <p className="text-xs text-neutral-400 mt-0.5">Location: {f.payload.location}</p>}
                  <AnswerList payload={f.payload} fields={formFieldsByType?.[f.form_type]} />
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
                      <input type="date" aria-label="Due date"
                        value={dueDrafts[f.id] !== undefined ? dueDrafts[f.id] : (f.due_date || '')}
                        onChange={(e) => editDue(f.id, e.target.value)}
                        onBlur={() => commitDue(f.id, f.due_date)}
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
                      <button onClick={() => resolveTask(f)}
                        className="px-3 py-1.5 rounded-lg border border-neutral-900 text-neutral-900 text-sm hover:bg-neutral-900 hover:text-white transition-colors">
                        Mark resolved
                      </button>
                    </div>
                  )}

                  {commentsOpen[f.id] && <CommentThread orgId={orgId} submissionId={f.id} />}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const StaffFormsPage = () => {
  const { user } = useAuth()
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [searchParams] = useSearchParams()
  const openSubmissionId = searchParams.get('submission')
  const admin = isSisAdmin(user)
  const [preview] = useState(() => (isSisAdmin(user) ? getPreviewTeacher() : null))
  const [mine, setMine] = useState([])
  const [formTypes, setFormTypes] = useState({})
  // Built-ins and the school's own forms, each with the questions it asks.
  const [forms, setForms] = useState([])
  const [staff, setStaff] = useState([])
  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])

  const loadMine = useCallback(() => {
    if (!orgId) return
    api.get(withPreview(withOrg('/api/sis/teacher/forms', orgId), preview))
      .then((r) => {
        setMine(r.data?.submissions || [])
        setFormTypes(r.data?.form_types || {})
        setForms(r.data?.forms || [])
      })
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

  // Rosters for the student / class questions an org-defined form can ask.
  // Best-effort: a form that does not ask for one never notices these missing.
  // The student roster is admin-gated server-side (ADMIN_ROLES), so asking for
  // it as a teacher only ever produced a 403 and an empty list — every advisor
  // opening Forms reported one to Sentry (OPTIO-WEB-3). Classes stay ungated:
  // /api/sis/classes is STAFF_ROLES and answers for teachers.
  useEffect(() => {
    if (!orgId) return
    if (admin) {
      api.get(withOrg('/api/sis/roster', orgId))
        .then((r) => setStudents((r.data?.roster || []).filter((p) => p.is_student)))
        .catch(() => setStudents([]))
    }
    api.get(withOrg('/api/sis/classes', orgId))
      .then((r) => setClasses(r.data?.classes || []))
      .catch(() => setClasses([]))
  }, [orgId, admin])

  return (
    <div className="space-y-6">
      <div>
        <BackToDashboard className="mb-1" />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-neutral-900">Forms</h1>
          <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
        </div>
      </div>

      {(forms.length > 0 || Object.keys(formTypes).length > 0) && (
        <SubmitForm orgId={orgId} formTypes={formTypes} forms={forms} onSubmitted={loadMine}
          disabled={Boolean(preview)} admin={admin && !preview}
          staff={staff} students={students} classes={classes} />
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

      {admin && !preview && (
        <>
          <AdminQueue orgId={orgId} staff={staff} openSubmissionId={openSubmissionId} />
          <PaperworkTemplatesManager orgId={orgId} staff={staff} defaultTab="forms" />
        </>
      )}
    </div>
  )
}

export default StaffFormsPage

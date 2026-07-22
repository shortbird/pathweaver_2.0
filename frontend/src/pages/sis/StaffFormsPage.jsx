import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import { useAuth } from '../../contexts/AuthContext'
import { isSisAdmin } from './sisRole'
import { getPreviewTeacher, withPreview } from './teacherPreview'

/**
 * StaffFormsPage — staff forms (incident, supply, maintenance, ...).
 * Teachers: submit a form + track their own submissions.
 * Admins: additionally review the org-wide queue (status, resolution notes).
 */

const STATUS_STYLES = {
  submitted: 'bg-gray-100 text-neutral-600',
  under_review: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
}

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent'

const StatusPill = ({ status }) => (
  <span className={`text-xs px-2 py-0.5 rounded-full capitalize shrink-0 ${STATUS_STYLES[status] || STATUS_STYLES.submitted}`}>
    {String(status || '').replace('_', ' ')}
  </span>
)

const SubmitForm = ({ orgId, formTypes, onSubmitted, disabled = false }) => {
  const [formType, setFormType] = useState('incident')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [location, setLocation] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!body.trim()) { toast.error('Please describe the issue or request'); return }
    setBusy(true)
    try {
      await api.post('/api/sis/teacher/forms', {
        organization_id: orgId, form_type: formType,
        title: title.trim() || undefined, body: body.trim(),
        location: location.trim() || undefined,
      })
      toast.success('Submitted — your administrator has been notified')
      setTitle(''); setBody(''); setLocation('')
      onSubmitted()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not submit the form')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h2 className="font-semibold text-neutral-900">Submit a form</h2>
      {disabled && (
        <p className="text-sm text-neutral-500">
          This is what teachers use to file incident reports, supply requests, and more.
          Submitting is turned off while previewing.
        </p>
      )}
      <fieldset disabled={disabled} className={disabled ? 'opacity-60 space-y-3' : 'space-y-3'}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <select value={formType} onChange={(e) => setFormType(e.target.value)} className={inputClass}>
          {Object.entries(formTypes).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short title (optional)" className={inputClass} />
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4}
        placeholder="What happened / what do you need?" className={`${inputClass} resize-none`} />
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

const AdminQueue = ({ orgId }) => {
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('')
  const [notes, setNotes] = useState({})

  const load = useCallback(() => {
    api.get(withOrg(`/api/sis/staff-admin/forms${filter ? `?status=${filter}` : ''}`, orgId))
      .then((r) => setRows(r.data?.submissions || []))
      .catch(() => toast.error('Failed to load submissions'))
  }, [orgId, filter])

  useEffect(() => { if (orgId) load() }, [load, orgId])

  const setStatus = async (id, status) => {
    try {
      await api.patch(`/api/sis/staff-admin/forms/${id}`, {
        organization_id: orgId, status,
        resolution_notes: notes[id] || undefined,
      })
      toast.success('Updated')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-neutral-900">Review queue</h2>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm">
          <option value="">All statuses</option>
          <option value="submitted">Submitted</option>
          <option value="under_review">Under review</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>
      {!rows.length && <p className="text-sm text-neutral-500">No submissions.</p>}
      <ul className="divide-y divide-gray-100">
        {rows.map((f) => (
          <li key={f.id} className="py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-neutral-600">{f.form_type_label}</span>
              <span className="font-medium text-neutral-900">{f.title}</span>
              <StatusPill status={f.status} />
              <span className="text-xs text-neutral-400 ml-auto">
                {f.submitted_by_name} · {new Date(f.created_at).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm text-neutral-600 mt-1 whitespace-pre-wrap">{f.payload?.body}</p>
            {f.payload?.location && <p className="text-xs text-neutral-400">Location: {f.payload.location}</p>}
            {f.resolution_notes && (
              <p className="text-sm text-green-700 mt-1">Resolution: {f.resolution_notes}</p>
            )}
            {f.status !== 'resolved' && (
              <div className="flex items-center gap-2 mt-2">
                <input value={notes[f.id] || ''} onChange={(e) => setNotes((p) => ({ ...p, [f.id]: e.target.value }))}
                  placeholder="Resolution notes (optional)"
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
                {f.status === 'submitted' && (
                  <button onClick={() => setStatus(f.id, 'under_review')}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50">
                    Start review
                  </button>
                )}
                <button onClick={() => setStatus(f.id, 'resolved')}
                  className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-sm">
                  Resolve
                </button>
              </div>
            )}
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

  const loadMine = useCallback(() => {
    if (!orgId) return
    api.get(withPreview(withOrg('/api/sis/teacher/forms', orgId), preview))
      .then((r) => { setMine(r.data?.submissions || []); setFormTypes(r.data?.form_types || {}) })
      .catch(() => toast.error('Failed to load your submissions'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, preview?.id])

  useEffect(() => { loadMine() }, [loadMine])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Forms</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      {Object.keys(formTypes).length > 0 && (
        <SubmitForm orgId={orgId} formTypes={formTypes} onSubmitted={loadMine} disabled={Boolean(preview)} />
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

      {admin && !preview && <AdminQueue orgId={orgId} />}
    </div>
  )
}

export default StaffFormsPage

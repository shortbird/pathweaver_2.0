import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import BackToSchool from '../components/navigation/BackToSchool'

/**
 * Family forms (Learning app).
 *
 * A guardian submits a request to the school — an at-home learning day, a records
 * request, a meeting request, or a general request. Each lands in the same staff
 * forms queue teachers/admins already triage (tagged as coming from a parent), so
 * the school can assign and resolve it. Backed by /api/sis/parent/forms
 * (authorized by family relationship).
 */

const STATUS_STYLES = {
  submitted: 'bg-gray-100 text-neutral-600',
  under_review: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
}

const StatusPill = ({ status }) => (
  <span className={`text-xs px-2 py-0.5 rounded-full capitalize shrink-0 ${STATUS_STYLES[status] || STATUS_STYLES.submitted}`}>
    {String(status || '').replace('_', ' ')}
  </span>
)

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const FamilyFormsPage = () => {
  const [loading, setLoading] = useState(true)
  const [orgs, setOrgs] = useState([])
  const [orgId, setOrgId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [formTypes, setFormTypes] = useState({})
  const [submissions, setSubmissions] = useState([])
  const [form, setForm] = useState({ form_type: '', title: '', body: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const org = useMemo(() => orgs.find((o) => o.organization_id === orgId), [orgs, orgId])
  const students = org?.students || []

  useEffect(() => {
    api.get('/api/sis/parent/context')
      .then((r) => {
        const list = r.data?.orgs || []
        setOrgs(list)
        if (list.length) setOrgId(list[0].organization_id)
      })
      .catch(() => { setError(true); toast.error('Could not load your family') })
      .finally(() => setLoading(false))
  }, [])

  // Keep the selected child valid when the org changes (blank = whole family).
  useEffect(() => {
    if (studentId && !students.some((s) => s.student_id === studentId)) setStudentId('')
  }, [students, studentId])

  const load = useCallback(() => {
    if (!orgId) { setSubmissions([]); setFormTypes({}); return }
    api.get(`/api/sis/parent/forms?organization_id=${orgId}`)
      .then((r) => {
        setSubmissions(r.data?.submissions || [])
        const types = r.data?.form_types || {}
        setFormTypes(types)
        setForm((f) => ({ ...f, form_type: f.form_type || Object.keys(types)[0] || '' }))
      })
      .catch(() => toast.error('Could not load your requests'))
  }, [orgId])

  useEffect(() => { load() }, [load])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.form_type) { toast.error('Pick a request type'); return }
    if (!form.body.trim()) { toast.error('Please describe your request'); return }
    setBusy(true)
    try {
      await api.post('/api/sis/parent/forms', {
        organization_id: orgId,
        form_type: form.form_type,
        title: form.title.trim() || undefined,
        body: form.body.trim(),
        student_user_id: studentId || undefined,
      })
      toast.success('Submitted — the school has been notified')
      setForm({ form_type: Object.keys(formTypes)[0] || '', title: '', body: '' })
      setStudentId('')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not submit your request')
    } finally {
      setBusy(false)
    }
  }

  const studentNameById = useMemo(
    () => Object.fromEntries(students.map((s) => [s.student_id, s.name])),
    [students],
  )

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 py-10 text-neutral-500">Loading…</div>
  }

  if (error || !orgs.length) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-neutral-900 mb-2">Submit a request</h1>
        <p className="text-neutral-500">
          Family requests aren’t available for your family yet. If your school uses Optio,
          ask them to add your family.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <BackToSchool className="mb-3" />
      <h1 className="text-2xl font-bold text-neutral-900 mb-1">Submit a request</h1>
      <p className="text-neutral-500 mb-6">
        Send a request to {org?.organization_name || 'your school'} — they’ll see it come in and follow up.
      </p>

      {/* Org / child pickers */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap items-end gap-3">
        {orgs.length > 1 && (
          <label className="text-sm">
            <span className="block text-neutral-500 mb-1">School</span>
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className={inputClass}>
              {orgs.map((o) => (
                <option key={o.organization_id} value={o.organization_id}>{o.organization_name || 'School'}</option>
              ))}
            </select>
          </label>
        )}
        {students.length > 0 && (
          <label className="text-sm">
            <span className="block text-neutral-500 mb-1">About a child (optional)</span>
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className={inputClass}>
              <option value="">Not about a specific child</option>
              {students.map((s) => <option key={s.student_id} value={s.student_id}>{s.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* New request */}
      <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-4 mb-8 space-y-3">
        <h2 className="font-semibold text-neutral-900">New request</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="block text-neutral-500 mb-1">Type</span>
            <select value={form.form_type} onChange={(e) => setForm({ ...form, form_type: e.target.value })} className={inputClass}>
              {Object.entries(formTypes).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-neutral-500 mb-1">Short title (optional)</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              maxLength={120} placeholder="e.g. Records for transfer" className={inputClass} />
          </label>
        </div>
        <label className="text-sm block">
          <span className="block text-neutral-500 mb-1">Details</span>
          <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={4} placeholder="Tell the school what you need."
            className={`${inputClass} resize-none`} />
        </label>
        <div className="flex justify-end">
          <button type="submit" disabled={busy}
            className="rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </form>

      {/* Past submissions */}
      <h2 className="font-semibold text-neutral-900 mb-3">Your requests</h2>
      {!submissions.length && <p className="text-sm text-neutral-400">You haven’t submitted any requests yet.</p>}
      <ul className="space-y-2">
        {submissions.map((f) => (
          <li key={f.id} className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-neutral-600">{f.form_type_label}</span>
              <span className="font-medium text-neutral-900">{f.title}</span>
              <StatusPill status={f.status} />
              <span className="text-xs text-neutral-400 ml-auto">{new Date(f.created_at).toLocaleDateString()}</span>
            </div>
            {f.student_user_id && (
              <p className="text-xs text-neutral-400 mt-1">
                About {f.student_name || studentNameById[f.student_user_id] || 'a child'}
              </p>
            )}
            {f.payload?.body && <p className="text-sm text-neutral-600 mt-1 whitespace-pre-wrap">{f.payload.body}</p>}
            {f.resolution_notes && <p className="text-sm text-green-700 mt-1">Response: {f.resolution_notes}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default FamilyFormsPage

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../services/api'

/**
 * Parent/guardian self-service class registration (Learning app).
 *
 * A guardian browses their microschool's open classes, builds a registration for one
 * of their children, sees a live price quote (with sibling/multi-class discounts), and
 * submits it. Submitting hands off to staff: the school invoices the family, and the
 * student is enrolled automatically once the invoice is paid in full. Backed by
 * /api/sis/parent/* (authorized by family relationship, not staff role).
 */

const money = (cents) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`)

const STATUS_STYLES = {
  draft: 'bg-neutral-100 text-neutral-500',
  in_progress: 'bg-blue-100 text-blue-700',
  submitted: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
}
const STATUS_LABEL = {
  draft: 'Draft', in_progress: 'In progress', submitted: 'Submitted — awaiting invoice',
  completed: 'Enrolled', cancelled: 'Cancelled',
}

const scheduleText = (meetings = []) => {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  if (!meetings.length) return null
  return meetings
    .map((m) => `${m.day_of_week != null ? DAYS[m.day_of_week] : m.specific_date} ${m.start_time}–${m.end_time}`)
    .join(', ')
}

const ClassRegistrationPage = () => {
  const [loading, setLoading] = useState(true)
  const [orgs, setOrgs] = useState([])
  const [orgId, setOrgId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [classes, setClasses] = useState([])
  const [registrations, setRegistrations] = useState([])
  const [active, setActive] = useState(null) // registration detail
  const [quote, setQuote] = useState(null)
  const [busy, setBusy] = useState(false)

  const org = useMemo(() => orgs.find((o) => o.organization_id === orgId), [orgs, orgId])
  const students = org?.students || []

  // Initial context: which orgs + children can this guardian register?
  useEffect(() => {
    api.get('/api/sis/parent/context')
      .then((r) => {
        const list = r.data?.orgs || []
        setOrgs(list)
        if (list.length) {
          setOrgId(list[0].organization_id)
          if (list[0].students?.length) setStudentId(list[0].students[0].student_id)
        }
      })
      .catch(() => toast.error('Could not load class registration'))
      .finally(() => setLoading(false))
  }, [])

  const loadOrgData = useCallback(() => {
    if (!orgId) return
    Promise.all([
      api.get(`/api/sis/parent/classes?organization_id=${orgId}`),
      api.get('/api/sis/parent/registrations'),
    ])
      .then(([c, r]) => {
        setClasses(c.data?.classes || [])
        setRegistrations(r.data?.registrations || [])
      })
      .catch(() => toast.error('Could not load classes'))
  }, [orgId])

  useEffect(() => { loadOrgData() }, [loadOrgData])

  // Keep the selected child valid when the org changes.
  useEffect(() => {
    if (students.length && !students.some((s) => s.student_id === studentId)) {
      setStudentId(students[0].student_id)
    }
  }, [students, studentId])

  const openRegistration = useCallback(async (id) => {
    try {
      const [d, q] = await Promise.all([
        api.get(`/api/sis/parent/registrations/${id}?organization_id=${orgId}`),
        api.get(`/api/sis/parent/registrations/${id}/quote?organization_id=${orgId}`),
      ])
      setActive(d.data?.registration || null)
      setQuote(q.data?.quote || null)
    } catch {
      toast.error('Could not open registration')
    }
  }, [orgId])

  const startRegistration = async () => {
    if (!studentId) { toast.error('Choose a child first'); return }
    setBusy(true)
    try {
      const r = await api.post('/api/sis/parent/registrations', {
        organization_id: orgId, student_user_id: studentId,
      })
      const id = r.data?.registration?.id
      toast.success('Registration started — add classes below')
      await loadOrgData()
      if (id) openRegistration(id)
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not start registration')
    } finally {
      setBusy(false)
    }
  }

  const addClass = async (classId) => {
    if (!active) return
    setBusy(true)
    try {
      const r = await api.post(`/api/sis/parent/registrations/${active.id}/items`, {
        organization_id: orgId, class_id: classId,
      })
      const warnings = r.data?.evaluation?.warnings || []
      warnings.forEach((w) => toast(w, { icon: '⚠️' }))
      await openRegistration(active.id)
      loadOrgData()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not add class')
    } finally {
      setBusy(false)
    }
  }

  const removeItem = async (itemId) => {
    setBusy(true)
    try {
      await api.delete(`/api/sis/parent/registrations/${active.id}/items/${itemId}?organization_id=${orgId}`)
      await openRegistration(active.id)
      loadOrgData()
    } catch {
      toast.error('Could not remove class')
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    setBusy(true)
    try {
      await api.post(`/api/sis/parent/registrations/${active.id}/submit`, { organization_id: orgId })
      toast.success('Submitted! The school will send an invoice; your child is enrolled once it is paid.')
      setActive(null)
      setQuote(null)
      loadOrgData()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not submit')
    } finally {
      setBusy(false)
    }
  }

  const selectedClassIds = new Set((active?.items || []).map((it) => it.class_id))
  const editable = active && !['submitted', 'completed', 'cancelled'].includes(active.status)

  if (loading) {
    return <div className="max-w-5xl mx-auto px-4 py-10 text-neutral-500">Loading…</div>
  }

  if (!orgs.length) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-neutral-900 mb-2">Class registration</h1>
        <p className="text-neutral-500">
          Class registration isn’t available for your family yet. If your school uses Optio to
          manage class sign-ups, ask them to add your family — then you’ll be able to enroll your
          children here.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900 mb-1">Class registration</h1>
      <p className="text-neutral-500 mb-6">Sign your children up for classes at your school.</p>

      {/* Child / org pickers */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap items-end gap-3">
        {orgs.length > 1 && (
          <label className="text-sm">
            <span className="block text-neutral-500 mb-1">School</span>
            <select value={orgId} onChange={(e) => { setOrgId(e.target.value); setActive(null); setQuote(null) }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple">
              {orgs.map((o) => <option key={o.organization_id} value={o.organization_id}>{o.organization_name || 'School'}</option>)}
            </select>
          </label>
        )}
        <label className="text-sm">
          <span className="block text-neutral-500 mb-1">Child</span>
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple">
            {students.map((s) => <option key={s.student_id} value={s.student_id}>{s.name}</option>)}
          </select>
        </label>
        {!active && (
          <button onClick={startRegistration} disabled={busy || !studentId}
            className="rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            Start a registration
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Open classes */}
        <div className="lg:col-span-2">
          <h2 className="font-semibold text-neutral-900 mb-3">Open classes</h2>
          {!classes.length && <p className="text-neutral-500">No classes are open for registration right now.</p>}
          <div className="space-y-3">
            {classes.map((c) => {
              const added = selectedClassIds.has(c.id)
              const sched = scheduleText(c.meetings)
              return (
                <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-neutral-900">{c.name}</div>
                    {c.program_name && <div className="text-xs text-neutral-400">{c.program_name}</div>}
                    <div className="text-sm text-neutral-500 mt-1">
                      {money(c.price_cents)}
                      {c.capacity != null && <span className="ml-2">· {c.spots_left} spot{c.spots_left === 1 ? '' : 's'} left</span>}
                      {c.is_full && <span className="ml-2 text-red-500">full</span>}
                    </div>
                    {sched && <div className="text-xs text-neutral-400 mt-1">{sched}</div>}
                  </div>
                  <button
                    onClick={() => addClass(c.id)}
                    disabled={!editable || busy || added || c.is_full}
                    className="shrink-0 rounded-lg border border-optio-purple px-3 py-1.5 text-sm font-medium text-optio-purple disabled:opacity-40 disabled:border-gray-300 disabled:text-gray-400"
                    title={!active ? 'Start a registration first' : undefined}
                  >
                    {added ? 'Added' : c.is_full ? 'Full' : 'Add'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Cart / quote + your registrations */}
        <div className="space-y-6">
          {active && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-neutral-900">{active.student_name}</h3>
                <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_STYLES[active.status] || ''}`}>
                  {STATUS_LABEL[active.status] || active.status}
                </span>
              </div>
              <div className="space-y-1.5 mb-3">
                {(active.items || []).map((it) => (
                  <div key={it.id} className="flex items-center justify-between text-sm">
                    <span className="text-neutral-800">{it.class_name || 'Class'}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-neutral-500">{money(it.price_snapshot_cents)}</span>
                      {editable && <button onClick={() => removeItem(it.id)} className="text-red-500 hover:underline">Remove</button>}
                    </span>
                  </div>
                ))}
                {!(active.items || []).length && <p className="text-sm text-neutral-400">No classes added yet.</p>}
              </div>

              {quote && (active.items || []).length > 0 && (
                <div className="border-t border-gray-100 pt-2 text-sm space-y-1">
                  <div className="flex justify-between text-neutral-500"><span>Subtotal</span><span>{money(quote.subtotal_cents)}</span></div>
                  {quote.discount_cents > 0 && (
                    <div className="flex justify-between text-green-700"><span>Discounts</span><span>-{money(quote.discount_cents)}</span></div>
                  )}
                  <div className="flex justify-between font-semibold text-neutral-900"><span>Total</span><span>{money(quote.total_cents)}</span></div>
                </div>
              )}

              {editable && (
                <button onClick={submit} disabled={busy || !(active.items || []).length}
                  className="mt-4 w-full rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  Submit registration
                </button>
              )}
              {editable && (
                <p className="text-xs text-neutral-400 mt-2">
                  After you submit, the school sends an invoice. Your child is enrolled once it’s paid in full.
                </p>
              )}
              <button onClick={() => { setActive(null); setQuote(null) }} className="mt-2 w-full text-xs text-neutral-400 hover:underline">
                Close
              </button>
            </div>
          )}

          {/* Existing registrations */}
          <div>
            <h2 className="font-semibold text-neutral-900 mb-3">Your registrations</h2>
            {!registrations.length && <p className="text-sm text-neutral-400">None yet.</p>}
            <div className="space-y-2">
              {registrations.map((r) => (
                <button key={r.id} onClick={() => openRegistration(r.id)}
                  className={`w-full text-left bg-white rounded-xl border p-3 text-sm ${active?.id === r.id ? 'border-optio-purple' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-neutral-900">{r.student_name}</span>
                    <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_STYLES[r.status] || ''}`}>{STATUS_LABEL[r.status] || r.status}</span>
                  </div>
                  <div className="text-xs text-neutral-400 mt-0.5">
                    {r.item_count} class{r.item_count === 1 ? '' : 'es'}{r.organization_name ? ` · ${r.organization_name}` : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ClassRegistrationPage

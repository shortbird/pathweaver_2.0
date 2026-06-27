import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

const STATUS_STYLES = {
  draft: 'bg-neutral-100 text-neutral-500',
  in_progress: 'bg-blue-100 text-blue-700',
  submitted: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
}
const field = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'
const money = (cents) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`)

const RegistrationsPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [registrations, setRegistrations] = useState([])
  const [members, setMembers] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [newStudent, setNewStudent] = useState('')
  const [selected, setSelected] = useState(null)
  const [addClassId, setAddClassId] = useState('')

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      api.get(withOrg('/api/sis/registrations', orgId)),
      api.get(withOrg('/api/sis/members', orgId)),
      api.get(withOrg('/api/sis/classes', orgId)),
    ])
      .then(([r, m, c]) => {
        setRegistrations(r.data?.registrations || [])
        setMembers((m.data?.members || []).filter((x) => x.is_student))
        setClasses(c.data?.classes || [])
      })
      .catch(() => toast.error('Failed to load registrations'))
      .finally(() => setLoading(false))
  }, [orgId])

  useEffect(() => { load() }, [load])

  const openDetail = async (id) => {
    try {
      const r = await api.get(`/api/sis/registrations/${id}?organization_id=${orgId}`)
      setSelected(r.data?.registration || null)
    } catch { toast.error('Could not open registration') }
  }

  const createRegistration = async () => {
    if (!newStudent) { toast.error('Pick a student'); return }
    try {
      const r = await api.post('/api/sis/registrations', { student_user_id: newStudent, organization_id: orgId })
      setNewStudent('')
      toast.success('Registration started')
      load()
      if (r.data?.registration?.id) openDetail(r.data.registration.id)
    } catch { toast.error('Could not start registration') }
  }

  const addClass = async () => {
    if (!addClassId || !selected) return
    try {
      const r = await api.post(`/api/sis/registrations/${selected.id}/items`, { class_id: addClassId, organization_id: orgId })
      const warnings = r.data?.evaluation?.warnings || []
      if (warnings.length) warnings.forEach((w) => toast(w, { icon: '⚠️' }))
      else toast.success('Class added')
      setAddClassId('')
      openDetail(selected.id)
      load()
    } catch { toast.error('Could not add class') }
  }

  const removeItem = async (itemId) => {
    try {
      await api.delete(`/api/sis/registrations/${selected.id}/items/${itemId}?organization_id=${orgId}`)
      openDetail(selected.id)
    } catch { toast.error('Could not remove class') }
  }

  const generateInvoice = async () => {
    try {
      await api.post(`/api/sis/registrations/${selected.id}/invoice`, { organization_id: orgId })
      toast.success('Invoice generated — see Billing')
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not generate invoice')
    }
  }

  const act = async (verb) => {
    try {
      await api.post(`/api/sis/registrations/${selected.id}/${verb}`, { organization_id: orgId })
      toast.success(verb === 'complete' ? 'Registration completed' : 'Registration submitted')
      openDetail(selected.id)
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || `Could not ${verb}`)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Registrations</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex gap-3">
        <select value={newStudent} onChange={(e) => setNewStudent(e.target.value)} className={`${field} flex-1`}>
          <option value="">Select a student to register…</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <Button size="sm" onClick={createRegistration}>Start registration</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          {loading && <p className="text-neutral-500">Loading…</p>}
          {!loading && !registrations.length && <p className="text-neutral-500">No registrations yet.</p>}
          <div className="space-y-2">
            {registrations.map((r) => (
              <button
                key={r.id}
                onClick={() => openDetail(r.id)}
                className={`w-full text-left bg-white rounded-xl border p-4 transition-colors ${selected?.id === r.id ? 'border-optio-purple' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-900">{r.student_name}</span>
                  <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_STYLES[r.status] || ''}`}>{r.status}</span>
                </div>
                <div className="text-sm text-neutral-400 mt-0.5">{r.item_count} class{r.item_count === 1 ? '' : 'es'}</div>
              </button>
            ))}
          </div>
        </div>

        {selected && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 h-fit">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-neutral-900">{selected.student_name}</h3>
              <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_STYLES[selected.status] || ''}`}>{selected.status}</span>
            </div>

            <div className="space-y-1.5 mb-4">
              {(selected.items || []).map((it) => (
                <div key={it.id} className="flex items-center justify-between text-sm">
                  <span>
                    <span className="font-medium text-neutral-800">{it.class_name || it.class_id}</span>
                    <span className="text-neutral-400"> · {it.status} · {money(it.price_snapshot_cents)}</span>
                  </span>
                  {selected.status !== 'completed' && (
                    <button onClick={() => removeItem(it.id)} className="text-red-500 hover:underline">Remove</button>
                  )}
                </div>
              ))}
              {!(selected.items || []).length && <p className="text-sm text-neutral-400">No classes selected yet.</p>}
            </div>

            {selected.status !== 'completed' && (
              <div className="flex gap-2 border-t border-gray-100 pt-3 mb-3">
                <select value={addClassId} onChange={(e) => setAddClassId(e.target.value)} className={`${field} flex-1`}>
                  <option value="">Add a class…</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_full ? ' (full)' : ''}</option>)}
                </select>
                <Button size="sm" onClick={addClass}>Add</Button>
              </div>
            )}

            {selected.status !== 'completed' && (
              <div className="flex gap-2">
                {selected.status !== 'submitted' && (
                  <Button size="sm" variant="secondary" onClick={() => act('submit')}>Submit</Button>
                )}
                <Button size="sm" onClick={() => act('complete')}>Complete &amp; enroll</Button>
              </div>
            )}
            {(selected.status === 'submitted' || selected.status === 'completed') && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <Button size="sm" variant="secondary" onClick={generateInvoice}>Generate invoice</Button>
                {selected.status === 'submitted' && (
                  <p className="text-xs text-neutral-400 mt-2">
                    Tip: invoice now and the student is enrolled automatically once the invoice is paid in full — or use “Complete &amp; enroll” to enroll right away.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default RegistrationsPage

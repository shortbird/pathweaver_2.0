import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

const PROGRAM_TYPES = [
  ['full_day', 'Full-Day'], ['half_day', 'Half-Day'], ['individual_class', 'Individual Class'],
  ['workshop', 'Workshop'], ['camp', 'Camp'], ['event', 'Event'], ['online', 'Online'],
]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const field = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const money = (cents) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`)

const ClassesPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [programs, setPrograms] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [newProgram, setNewProgram] = useState({ name: '', program_type: 'individual_class' })
  const [newClass, setNewClass] = useState({ name: '', program_id: '', capacity: '', price_cents: '' })
  const [expanded, setExpanded] = useState(null)

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      api.get(withOrg('/api/sis/programs', orgId)),
      api.get(withOrg('/api/sis/classes', orgId)),
    ])
      .then(([p, c]) => {
        setPrograms(p.data?.programs || [])
        setClasses(c.data?.classes || [])
      })
      .catch(() => toast.error('Failed to load classes'))
      .finally(() => setLoading(false))
  }, [orgId])

  useEffect(() => { load() }, [load])

  const createProgram = async () => {
    if (!newProgram.name.trim()) return
    try {
      await api.post('/api/sis/programs', { ...newProgram, name: newProgram.name.trim(), organization_id: orgId })
      setNewProgram({ name: '', program_type: 'individual_class' })
      toast.success('Program created')
      load()
    } catch { toast.error('Could not create program') }
  }

  const createClass = async () => {
    if (!newClass.name.trim()) return
    const payload = { name: newClass.name.trim(), organization_id: orgId }
    if (newClass.program_id) payload.program_id = newClass.program_id
    if (newClass.capacity !== '') payload.capacity = parseInt(newClass.capacity, 10)
    if (newClass.price_cents !== '') payload.price_cents = Math.round(parseFloat(newClass.price_cents) * 100)
    try {
      await api.post('/api/sis/classes', payload)
      setNewClass({ name: '', program_id: '', capacity: '', price_cents: '' })
      toast.success('Class created')
      load()
    } catch { toast.error('Could not create class') }
  }

  const toggleRegistration = async (cls) => {
    const next = cls.registration_status === 'open' ? 'closed' : 'open'
    try {
      await api.patch(`/api/sis/classes/${cls.id}`, { registration_status: next, organization_id: orgId })
      load()
    } catch { toast.error('Could not update registration') }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Classes</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      {/* Programs */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <h2 className="font-semibold text-neutral-900 mb-3">Programs</h2>
        <div className="flex gap-3 mb-3">
          <input
            value={newProgram.name}
            onChange={(e) => setNewProgram({ ...newProgram, name: e.target.value })}
            className={`${field} flex-1`}
            placeholder="New program name (e.g. Full-Day Microschool)"
          />
          <select
            value={newProgram.program_type}
            onChange={(e) => setNewProgram({ ...newProgram, program_type: e.target.value })}
            className={field}
          >
            {PROGRAM_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <Button size="sm" onClick={createProgram}>Add program</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {programs.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-[#F3EFF4] px-3 py-1 text-sm text-neutral-700">
              {p.name}<span className="text-neutral-400">· {p.class_count} class{p.class_count === 1 ? '' : 'es'}</span>
            </span>
          ))}
          {!programs.length && <span className="text-sm text-neutral-400">No programs yet.</span>}
        </div>
      </div>

      {/* New class */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 grid grid-cols-1 md:grid-cols-5 gap-3">
        <input
          value={newClass.name}
          onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
          className={`${field} md:col-span-2`}
          placeholder="New class name"
        />
        <select value={newClass.program_id} onChange={(e) => setNewClass({ ...newClass, program_id: e.target.value })} className={field}>
          <option value="">No program</option>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input
          type="number" min="0" value={newClass.capacity}
          onChange={(e) => setNewClass({ ...newClass, capacity: e.target.value })}
          className={field} placeholder="Capacity"
        />
        <div className="flex gap-2">
          <input
            type="number" min="0" step="0.01" value={newClass.price_cents}
            onChange={(e) => setNewClass({ ...newClass, price_cents: e.target.value })}
            className={`${field} flex-1`} placeholder="Price $"
          />
          <Button size="sm" onClick={createClass}>Add</Button>
        </div>
      </div>

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !classes.length && (
        <p className="text-neutral-500">No classes yet. Create one above to start registering students.</p>
      )}

      <div className="space-y-3">
        {classes.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-neutral-900">{c.name}</span>
                {c.program_name && <span className="text-neutral-400 text-sm"> · {c.program_name}</span>}
                <div className="text-sm text-neutral-500 mt-0.5">
                  {c.enrolled_count}{c.capacity != null ? ` / ${c.capacity}` : ''} enrolled
                  {c.is_full && <span className="ml-2 text-red-500">full</span>}
                  <span className="mx-2 text-neutral-300">|</span>{money(c.price_cents)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleRegistration(c)}
                  className={`text-xs font-medium rounded-full px-3 py-1 ${c.registration_status === 'open' ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'}`}
                >
                  {c.registration_status === 'open' ? 'Registration open' : 'Registration closed'}
                </button>
                <button onClick={() => setExpanded(expanded === c.id ? null : c.id)} className="text-sm text-optio-purple font-medium hover:underline">
                  {expanded === c.id ? 'Hide schedule' : 'Schedule'}
                </button>
              </div>
            </div>
            {expanded === c.id && <ClassSchedule classId={c.id} orgId={orgId} initial={c.meetings || []} />}
          </div>
        ))}
      </div>
    </div>
  )
}

const ClassSchedule = ({ classId, orgId, initial }) => {
  const [meetings, setMeetings] = useState(initial)
  const [form, setForm] = useState({ day_of_week: '1', start_time: '09:00', end_time: '10:00' })

  const reload = () => api.get(`/api/sis/classes/${classId}/meetings?organization_id=${orgId}`)
    .then((r) => setMeetings(r.data?.meetings || [])).catch(() => {})

  const add = async () => {
    try {
      await api.post(`/api/sis/classes/${classId}/meetings`, {
        day_of_week: parseInt(form.day_of_week, 10),
        start_time: form.start_time, end_time: form.end_time, organization_id: orgId,
      })
      reload()
    } catch { toast.error('Could not add meeting') }
  }
  const remove = async (id) => {
    try {
      await api.delete(`/api/sis/classes/${classId}/meetings/${id}?organization_id=${orgId}`)
      reload()
    } catch { toast.error('Could not remove meeting') }
  }

  return (
    <div className="border-t border-gray-100 mt-3 pt-3">
      <div className="space-y-1 mb-2">
        {meetings.map((m) => (
          <div key={m.id} className="flex items-center justify-between text-sm">
            <span className="text-neutral-700">
              {m.day_of_week != null ? DAYS[m.day_of_week] : m.specific_date} · {m.start_time}–{m.end_time}
            </span>
            <button onClick={() => remove(m.id)} className="text-red-500 hover:underline">Remove</button>
          </div>
        ))}
        {!meetings.length && <p className="text-sm text-neutral-400">No meetings scheduled.</p>}
      </div>
      <div className="flex gap-2">
        <select value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: e.target.value })} className={field}>
          {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
        </select>
        <input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className={field} />
        <input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className={field} />
        <Button size="sm" onClick={add}>Add meeting</Button>
      </div>
    </div>
  )
}

export default ClassesPage

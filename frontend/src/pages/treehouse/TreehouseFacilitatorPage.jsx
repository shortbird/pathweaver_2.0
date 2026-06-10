/**
 * The Treehouse facilitator dashboard (/treehouse/facilitator).
 *
 * Tabbed: Signals (help/proud queue), Pins (ready-to-create + mark created),
 * Showcase (create events + view roster), Kiosk (provision a shared-device token).
 * All endpoints require facilitator role, enforced server-side.
 */
import React, { useEffect, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { treehouseAPI } from '../../services/api'

const TABS = ['Signals', 'Pins', 'Showcase', 'Balances', 'Kiosk']

// Facilitator = org_admin/advisor (or superadmin). Students who land here (e.g. a
// stale link) are bounced back to their home instead of hitting 403s.
const isFacilitator = (role, user) => {
  const roles = new Set([role, user?.org_role, ...(user?.org_roles || [])])
  return user?.role === 'superadmin' || roles.has('org_admin') || roles.has('advisor') || roles.has('superadmin')
}

function SignalsTab() {
  const [signals, setSignals] = useState([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(() => {
    treehouseAPI.signals()
      .then(({ data }) => setSignals(data.signals || []))
      .catch(() => toast.error('Could not load signals'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const resolve = async (id) => {
    try { await treehouseAPI.resolveSignal(id); setSignals(s => s.filter(x => x.id !== id)) }
    catch { toast.error('Could not resolve') }
  }

  if (loading) return <p className="text-neutral-400">Loading…</p>
  if (signals.length === 0) return <p className="text-neutral-400">No open signals. All caught up! 🎉</p>
  return (
    <ul className="space-y-3">
      {signals.map((s) => (
        <li key={s.id} className={`rounded-xl p-4 flex items-center justify-between ${s.signal_type === 'help' ? 'bg-sky-50' : 'bg-yellow-50'}`}>
          <div>
            <p className="font-semibold text-neutral-900">
              {s.signal_type === 'help' ? '🙋' : '🎉'} {s.student_name || 'Student'}
              <span className="text-neutral-500 font-normal"> — {s.signal_type === 'help' ? 'needs help' : 'is proud'}</span>
            </p>
            {s.note && <p className="text-sm text-neutral-600 mt-1">{s.note}</p>}
            <p className="text-xs text-neutral-400 mt-1">{new Date(s.created_at).toLocaleString()}</p>
          </div>
          <button onClick={() => resolve(s.id)} className="text-sm font-semibold text-optio-purple px-3 py-1.5 rounded-lg border border-optio-purple/30">
            Done
          </button>
        </li>
      ))}
    </ul>
  )
}

function PinsTab() {
  const [data, setData] = useState({ ready: [], marked: [] })
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState({})
  const load = useCallback(() => {
    treehouseAPI.pins()
      .then(({ data }) => setData(data))
      .catch(() => toast.error('Could not load pins'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const toggle = (key) => setSelected(s => ({ ...s, [key]: !s[key] }))
  const markCreated = async () => {
    const items = data.ready
      .filter(r => selected[`${r.student_id}:${r.quest_id}`])
      .map(r => ({ student_id: r.student_id, quest_id: r.quest_id }))
    if (items.length === 0) return toast('Select pins first')
    try { await treehouseAPI.markPins(items, 'created'); setSelected({}); load(); toast.success('Marked created') }
    catch { toast.error('Could not mark') }
  }

  if (loading) return <p className="text-neutral-400">Loading…</p>
  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-neutral-800">Ready to create ({data.ready.length})</h3>
        <button onClick={markCreated} className="text-sm font-semibold text-white bg-optio-purple px-3 py-1.5 rounded-lg">Mark created</button>
      </div>
      {data.ready.length === 0 ? <p className="text-neutral-400 mt-2">No pins waiting.</p> : (
        <ul className="mt-3 space-y-2">
          {data.ready.map((r) => {
            const key = `${r.student_id}:${r.quest_id}`
            return (
              <li key={key} className="flex items-center gap-3 rounded-lg bg-white border border-neutral-100 p-3">
                <input type="checkbox" checked={!!selected[key]} onChange={() => toggle(key)} className="w-5 h-5 accent-purple-600" />
                <span className="font-medium text-neutral-900">{r.student_name}</span>
                <span className="text-neutral-500">— {r.quest_title}</span>
              </li>
            )
          })}
        </ul>
      )}
      {data.marked.length > 0 && (
        <>
          <h3 className="font-bold text-neutral-800 mt-6">Already made ({data.marked.length})</h3>
          <ul className="mt-2 space-y-1 text-sm text-neutral-500">
            {data.marked.map((r) => <li key={`${r.student_id}:${r.quest_id}`}>✓ {r.student_name} — {r.quest_title} ({r.status})</li>)}
          </ul>
        </>
      )}
    </div>
  )
}

function EventRoster({ eventId }) {
  const [roster, setRoster] = useState(null)
  const [students, setStudents] = useState([])
  const [pick, setPick] = useState('')
  const [projectTitle, setProjectTitle] = useState('')
  const [adding, setAdding] = useState(false)

  const loadRoster = useCallback(() => {
    treehouseAPI.showcaseRoster(eventId)
      .then(({ data }) => setRoster(data))
      .catch(() => setRoster({ participants: [], by_category: {} }))
  }, [eventId])

  useEffect(() => {
    loadRoster()
    treehouseAPI.students().then(({ data }) => setStudents(data.students || [])).catch(() => setStudents([]))
  }, [loadRoster])

  const onRoster = new Set((roster?.participants || []).map(p => p.student_id))
  const available = students.filter(s => !onRoster.has(s.id))
  const label = (s) => s.display_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Student'

  const add = async () => {
    if (!pick) return
    setAdding(true)
    try {
      await treehouseAPI.joinShowcase(eventId, { student_id: pick, project_title: projectTitle.trim() || null })
      setPick(''); setProjectTitle('')
      loadRoster()
      toast.success('Added to the showcase')
    } catch {
      toast.error('Could not add student')
    } finally {
      setAdding(false)
    }
  }

  if (!roster) return <p className="text-sm text-neutral-400 mt-2">Loading roster…</p>
  return (
    <div className="mt-3 border-t border-neutral-100 pt-3">
      <p className="text-sm font-semibold text-neutral-700">{roster.count} presenter(s)</p>
      <ul className="mt-2 space-y-1 text-sm text-neutral-600">
        {(roster.participants || []).map((p) => (
          <li key={p.id}>• {p.student_name || 'Student'}{p.project_title ? ` — ${p.project_title}` : ''}</li>
        ))}
        {(roster.participants || []).length === 0 && <li className="text-neutral-400">No presenters yet.</li>}
      </ul>

      {/* Facilitator: add a student to the roster */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value={pick} onChange={e => setPick(e.target.value)}
          className="rounded-lg border border-neutral-200 px-2 py-1.5 text-sm">
          <option value="">Add a student…</option>
          {available.map(s => <option key={s.id} value={s.id}>{label(s)}</option>)}
        </select>
        <input value={projectTitle} onChange={e => setProjectTitle(e.target.value)} placeholder="Project title (optional)"
          className="flex-1 min-w-[10rem] rounded-lg border border-neutral-200 px-2 py-1.5 text-sm" />
        <button onClick={add} disabled={!pick || adding}
          className="text-sm font-semibold text-white bg-optio-purple px-3 py-1.5 rounded-lg disabled:opacity-50">
          Add
        </button>
      </div>
    </div>
  )
}

function ShowcaseTab() {
  const [events, setEvents] = useState([])
  const [form, setForm] = useState({ title: '', theme: '', showcase_date: '', ideas: '' })
  const [loading, setLoading] = useState(true)
  const [openRoster, setOpenRoster] = useState(null)
  const load = useCallback(() => {
    treehouseAPI.showcaseEvents()
      .then(({ data }) => setEvents(data.events || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const create = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast('Add a title')
    // One project idea per line → array of prompts students see for inspiration.
    const prompts = form.ideas.split('\n').map(s => s.trim()).filter(Boolean)
    try {
      await treehouseAPI.createShowcase({
        title: form.title, theme: form.theme, showcase_date: form.showcase_date, prompts,
      })
      setForm({ title: '', theme: '', showcase_date: '', ideas: '' }); load(); toast.success('Showcase created')
    } catch { toast.error('Could not create') }
  }

  return (
    <div>
      <form onSubmit={create} className="rounded-xl bg-white border border-neutral-100 p-4 space-y-3">
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Showcase title"
          className="w-full rounded-lg border border-neutral-200 px-3 py-2" />
        <input value={form.theme} onChange={e => setForm({ ...form, theme: e.target.value })} placeholder="Theme (optional)"
          className="w-full rounded-lg border border-neutral-200 px-3 py-2" />
        <input type="date" value={form.showcase_date} onChange={e => setForm({ ...form, showcase_date: e.target.value })}
          className="w-full rounded-lg border border-neutral-200 px-3 py-2" />
        <textarea value={form.ideas} onChange={e => setForm({ ...form, ideas: e.target.value })}
          placeholder="Suggested project ideas (one per line) — students see these for inspiration"
          rows={3} className="w-full rounded-lg border border-neutral-200 px-3 py-2" />
        <button className="text-sm font-semibold text-white bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2 rounded-lg">Create showcase</button>
      </form>
      {loading ? <p className="text-neutral-400 mt-4">Loading…</p> : (
        <ul className="mt-4 space-y-2">
          {events.map((ev) => (
            <li key={ev.id} className="rounded-lg bg-white border border-neutral-100 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-neutral-900">{ev.title}</p>
                  <p className="text-sm text-neutral-500">
                    {ev.theme ? `${ev.theme} · ` : ''}{ev.showcase_date || 'No date'} · {ev.participant_count} presenter(s)
                  </p>
                </div>
                <button onClick={() => setOpenRoster(openRoster === ev.id ? null : ev.id)}
                  className="text-sm font-semibold text-optio-purple px-3 py-1.5 rounded-lg border border-optio-purple/30">
                  {openRoster === ev.id ? 'Hide roster' : 'View roster'}
                </button>
              </div>
              {openRoster === ev.id && <EventRoster eventId={ev.id} />}
            </li>
          ))}
          {events.length === 0 && <p className="text-neutral-400">No showcases yet.</p>}
        </ul>
      )}
    </div>
  )
}

function BalancesTab() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState({})

  const load = useCallback(async () => {
    try {
      const { data } = await treehouseAPI.students()
      const students = data.students || []
      const withBalances = await Promise.all(students.map(async (s) => {
        try {
          const { data: b } = await treehouseAPI.balance(s.id)
          return { ...s, spendable_xp: b.spendable_xp }
        } catch {
          return { ...s, spendable_xp: null }
        }
      }))
      setRows(withBalances)
    } catch {
      toast.error('Could not load balances')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const adjust = async (studentId, amount) => {
    if (!amount) return
    try {
      const { data } = await treehouseAPI.adjustBalance(studentId, amount)
      setRows(rs => rs.map(r => r.id === studentId ? { ...r, spendable_xp: data.spendable_xp } : r))
      setDrafts(d => ({ ...d, [studentId]: '' }))
      toast.success('Balance updated')
    } catch {
      toast.error('Could not update balance')
    }
  }

  const label = (s) => s.display_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Student'

  if (loading) return <p className="text-neutral-400">Loading…</p>
  if (rows.length === 0) return <p className="text-neutral-400">No students yet.</p>
  return (
    <ul className="space-y-2">
      {rows.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg bg-white border border-neutral-100 p-3">
          <div className="min-w-0">
            <p className="font-medium text-neutral-900 truncate">{label(s)}</p>
            <p className="text-sm text-amber-700 font-semibold">🪙 {s.spendable_xp ?? '—'}</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={drafts[s.id] || ''}
              onChange={(e) => setDrafts(d => ({ ...d, [s.id]: e.target.value }))}
              placeholder="+/-"
              className="w-20 rounded-lg border border-neutral-200 px-2 py-1.5 text-right"
            />
            <button
              onClick={() => adjust(s.id, parseInt(drafts[s.id], 10))}
              className="text-sm font-semibold text-white bg-optio-purple px-3 py-1.5 rounded-lg"
            >
              Apply
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

function KioskTab() {
  const [token, setToken] = useState(null)
  const [label, setLabel] = useState('Classroom iPad')
  const create = async () => {
    try {
      const { data } = await treehouseAPI.createKioskDevice(label)
      setToken(data.device_token)
    } catch { toast.error('Could not create device') }
  }
  return (
    <div className="max-w-lg">
      <p className="text-neutral-600">Provision a shared device for passwordless student login. The token is shown once — save it and open
        <span className="font-mono"> /treehouse-kiosk </span> on the device.</p>
      <div className="mt-3 flex gap-2">
        <input value={label} onChange={e => setLabel(e.target.value)} className="flex-1 rounded-lg border border-neutral-200 px-3 py-2" />
        <button onClick={create} className="text-sm font-semibold text-white bg-optio-purple px-4 py-2 rounded-lg">Create device</button>
      </div>
      {token && (
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-4">
          <p className="text-sm text-amber-800 font-semibold">Device token (copy now — shown once):</p>
          <code className="block mt-1 break-all text-sm">{token}</code>
        </div>
      )}
    </div>
  )
}

export default function TreehouseFacilitatorPage() {
  const { user, effectiveRole } = useAuth()
  const [tab, setTab] = useState('Signals')
  if (!isFacilitator(effectiveRole, user)) return <Navigate to="/treehouse" replace />
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 font-poppins">
      <h1 className="text-3xl font-bold text-neutral-900">Facilitator Dashboard</h1>
      <div className="flex gap-2 mt-4 border-b border-neutral-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 font-semibold -mb-px border-b-2 ${tab === t ? 'border-optio-purple text-optio-purple' : 'border-transparent text-neutral-500'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === 'Signals' && <SignalsTab />}
        {tab === 'Pins' && <PinsTab />}
        {tab === 'Showcase' && <ShowcaseTab />}
        {tab === 'Balances' && <BalancesTab />}
        {tab === 'Kiosk' && <KioskTab />}
      </div>
    </div>
  )
}

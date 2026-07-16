/**
 * The Treehouse facilitator dashboard (/treehouse/facilitator).
 *
 * Tabs: Signals (help/proud queue), Pins (ready-to-create + mark created),
 * Showcase (create/edit events + roster), Balances (coins), Capture (phone
 * photo → tag students), Cohorts (admin: assign facilitators + enroll), Kiosk.
 * All endpoints require facilitator role, enforced server-side. Signals/Pins/
 * Balances/Capture are cohort-scoped: advisors see only their cohorts' students.
 */
import React, { useEffect, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import api, { treehouseAPI } from '../../services/api'
import CreateUsernameStudentModal from '../../components/organization/CreateUsernameStudentModal'

// Facilitator = org_admin/advisor (or superadmin). Students who land here (e.g. a
// stale link) are bounced back to their home instead of hitting 403s.
const isFacilitator = (role, user) => {
  const roles = new Set([role, user?.org_role, ...(user?.org_roles || [])])
  return user?.role === 'superadmin' || roles.has('org_admin') || roles.has('advisor') || roles.has('superadmin')
}
const isAdmin = (role, user) => {
  const roles = new Set([role, user?.org_role, ...(user?.org_roles || [])])
  return user?.role === 'superadmin' || roles.has('org_admin') || roles.has('superadmin')
}

const studentLabel = (s) => s.display_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Student'

function SignalsTab({ cohortId }) {
  const [signals, setSignals] = useState([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(() => {
    setLoading(true)
    treehouseAPI.signals(cohortId)
      .then(({ data }) => setSignals(data.signals || []))
      .catch(() => toast.error('Could not load signals'))
      .finally(() => setLoading(false))
  }, [cohortId])
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

function PinsTab({ cohortId }) {
  const [data, setData] = useState({ ready: [], marked: [] })
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState({})
  const load = useCallback(() => {
    setLoading(true)
    treehouseAPI.pins(cohortId)
      .then(({ data }) => setData(data))
      .catch(() => toast.error('Could not load pins'))
      .finally(() => setLoading(false))
  }, [cohortId])
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
          {available.map(s => <option key={s.id} value={s.id}>{studentLabel(s)}</option>)}
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

const emptyShowcaseForm = { title: '', theme: '', showcase_date: '', ideas: '' }

function ShowcaseTab() {
  const [events, setEvents] = useState([])
  const [form, setForm] = useState(emptyShowcaseForm)
  const [editingId, setEditingId] = useState(null)   // J1: id being edited, or null for create
  const [scope, setScope] = useState('upcoming')      // J2: upcoming | past
  const [loading, setLoading] = useState(true)
  const [openRoster, setOpenRoster] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    treehouseAPI.showcaseEvents(scope)
      .then(({ data }) => setEvents(data.events || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [scope])
  useEffect(() => { load() }, [load])

  const resetForm = () => { setForm(emptyShowcaseForm); setEditingId(null) }

  const startEdit = (ev) => {
    setEditingId(ev.id)
    setForm({
      title: ev.title || '', theme: ev.theme || '', showcase_date: ev.showcase_date || '',
      ideas: (ev.prompts || []).join('\n'),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast('Add a title')
    // One project idea per line → array of prompts students see for inspiration.
    const prompts = form.ideas.split('\n').map(s => s.trim()).filter(Boolean)
    const body = { title: form.title, theme: form.theme, showcase_date: form.showcase_date, prompts }
    try {
      if (editingId) {
        await treehouseAPI.updateShowcase(editingId, body)
        toast.success('Showcase updated')
      } else {
        await treehouseAPI.createShowcase(body)
        toast.success('Showcase created')
      }
      resetForm(); load()
    } catch { toast.error('Could not save') }
  }

  return (
    <div>
      <form onSubmit={submit} className="rounded-xl bg-white border border-neutral-100 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-neutral-800">{editingId ? 'Edit showcase' : 'New showcase'}</h3>
          {editingId && <button type="button" onClick={resetForm} className="text-sm text-neutral-500">Cancel edit</button>}
        </div>
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Showcase title"
          className="w-full rounded-lg border border-neutral-200 px-3 py-2" />
        <input value={form.theme} onChange={e => setForm({ ...form, theme: e.target.value })} placeholder="Theme (optional)"
          className="w-full rounded-lg border border-neutral-200 px-3 py-2" />
        <input type="date" value={form.showcase_date} onChange={e => setForm({ ...form, showcase_date: e.target.value })}
          className="w-full rounded-lg border border-neutral-200 px-3 py-2" />
        <textarea value={form.ideas} onChange={e => setForm({ ...form, ideas: e.target.value })}
          placeholder="Suggested project ideas (one per line) — students see these for inspiration"
          rows={3} className="w-full rounded-lg border border-neutral-200 px-3 py-2" />
        <button className="text-sm font-semibold text-white bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2 rounded-lg">
          {editingId ? 'Save changes' : 'Create showcase'}
        </button>
      </form>

      <div className="flex gap-2 mt-4">
        {['upcoming', 'past'].map(s => (
          <button key={s} onClick={() => setScope(s)}
            className={`text-sm font-semibold px-3 py-1.5 rounded-lg ${scope === s ? 'bg-optio-purple text-white' : 'bg-neutral-100 text-neutral-600'}`}>
            {s === 'upcoming' ? 'Upcoming' : 'Past'}
          </button>
        ))}
      </div>

      {loading ? <p className="text-neutral-400 mt-4">Loading…</p> : (
        <ul className="mt-4 space-y-2">
          {events.map((ev) => (
            <li key={ev.id} className="rounded-lg bg-white border border-neutral-100 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-neutral-900">{ev.title} {ev.is_past && <span className="text-xs text-neutral-400">(past)</span>}</p>
                  <p className="text-sm text-neutral-500">
                    {ev.theme ? `${ev.theme} · ` : ''}{ev.showcase_date || 'No date'} · {ev.participant_count} presenter(s)
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => startEdit(ev)}
                    className="text-sm font-semibold text-neutral-600 px-3 py-1.5 rounded-lg border border-neutral-200">Edit</button>
                  <button onClick={() => setOpenRoster(openRoster === ev.id ? null : ev.id)}
                    className="text-sm font-semibold text-optio-purple px-3 py-1.5 rounded-lg border border-optio-purple/30">
                    {openRoster === ev.id ? 'Hide roster' : 'View roster'}
                  </button>
                </div>
              </div>
              {openRoster === ev.id && <EventRoster eventId={ev.id} />}
            </li>
          ))}
          {events.length === 0 && <p className="text-neutral-400">No {scope} showcases.</p>}
        </ul>
      )}
    </div>
  )
}

function BalancesTab({ cohortId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await treehouseAPI.students(cohortId)
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
  }, [cohortId])
  useEffect(() => { load() }, [load])

  const adjust = async (studentId, amount) => {
    if (!amount) return
    try {
      await treehouseAPI.adjustBalance(studentId, amount)
      // K1: re-fetch the authoritative balance from the server so the row reflects
      // what actually persisted (not just the optimistic response).
      const { data: b } = await treehouseAPI.balance(studentId)
      setRows(rs => rs.map(r => r.id === studentId ? { ...r, spendable_xp: b.spendable_xp } : r))
      setDrafts(d => ({ ...d, [studentId]: '' }))
      toast.success('Balance updated')
    } catch {
      toast.error('Could not update balance')
    }
  }

  if (loading) return <p className="text-neutral-400">Loading…</p>
  if (rows.length === 0) return <p className="text-neutral-400">No students yet.</p>
  return (
    <ul className="space-y-2">
      {rows.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg bg-white border border-neutral-100 p-3">
          <div className="min-w-0">
            <p className="font-medium text-neutral-900 truncate">{studentLabel(s)}</p>
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

// G1: facilitator phone capture — one photo (+caption) tagged to one or many students.
function CaptureTab({ cohortId }) {
  const [students, setStudents] = useState([])
  const [tagged, setTagged] = useState({})
  const [caption, setCaption] = useState('')
  const [files, setFiles] = useState([])       // File objects
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    treehouseAPI.students(cohortId).then(({ data }) => setStudents(data.students || [])).catch(() => setStudents([]))
  }, [cohortId])

  const toggle = (id) => setTagged(t => ({ ...t, [id]: !t[id] }))
  const taggedIds = Object.keys(tagged).filter(id => tagged[id])

  const onFiles = (e) => setFiles(Array.from(e.target.files || []))

  const submit = async () => {
    if (taggedIds.length === 0) return toast('Tag at least one student')
    if (files.length === 0 && !caption.trim()) return toast('Add a photo or a caption')
    setBusy(true)
    try {
      let media = []
      if (files.length > 0) {
        const fd = new FormData()
        files.forEach(f => fd.append('files', f))
        const { data } = await api.post('/api/evidence', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        media = (data.files || []).map(f => ({
          type: (f.content_type || '').startsWith('video') ? 'video' : 'image',
          file_url: f.url, file_name: f.original_name || f.stored_name, file_size: f.size,
        }))
      }
      const { data } = await treehouseAPI.capture({
        student_ids: taggedIds, description: caption.trim() || null, media,
      })
      toast.success(`Saved to ${data.count} student${data.count === 1 ? '' : 's'}`)
      setCaption(''); setFiles([]); setTagged({})
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save capture')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-neutral-600 text-sm">Snap a photo, tag the students it belongs to, and it lands in each
        student's journal. Tip: capture throughout the day, then tag and save.</p>

      <label className="block">
        <span className="text-sm font-semibold text-neutral-700">Photo(s)</span>
        {/* capture="environment" opens the device camera directly on phones/tablets */}
        <input type="file" accept="image/*,video/*" capture="environment" multiple onChange={onFiles}
          className="mt-1 block w-full text-sm" />
      </label>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={i} className="text-xs bg-neutral-100 rounded px-2 py-1">{f.name}</span>
          ))}
        </div>
      )}

      <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={2}
        placeholder="Add a note (optional)" className="w-full rounded-lg border border-neutral-200 px-3 py-2" />

      <div>
        <p className="text-sm font-semibold text-neutral-700 mb-1">Tag students ({taggedIds.length})</p>
        <div className="max-h-56 overflow-y-auto rounded-lg border border-neutral-100 divide-y divide-neutral-50">
          {students.map(s => (
            <label key={s.id} className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-neutral-50">
              <input type="checkbox" checked={!!tagged[s.id]} onChange={() => toggle(s.id)} className="w-5 h-5 accent-purple-600" />
              <span className="text-neutral-900">{studentLabel(s)}</span>
            </label>
          ))}
          {students.length === 0 && <p className="text-neutral-400 p-3 text-sm">No students in this cohort.</p>}
        </div>
      </div>

      <button onClick={submit} disabled={busy}
        className="w-full text-sm font-semibold text-white bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2.5 rounded-lg disabled:opacity-50">
        {busy ? 'Saving…' : 'Save to journals'}
      </button>
    </div>
  )
}

// D1 in-dashboard: batch-assign one or more quests to one or more students.
function AssignTab({ cohortId }) {
  const [quests, setQuests] = useState([])
  const [students, setStudents] = useState([])
  const [cohorts, setCohorts] = useState([])
  const [questGroups, setQuestGroups] = useState([])
  const [pickedQuests, setPickedQuests] = useState({})
  const [pickedStudents, setPickedStudents] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    treehouseAPI.students(cohortId).then(({ data }) => setStudents(data.students || [])).catch(() => setStudents([]))
  }, [cohortId])
  useEffect(() => {
    treehouseAPI.quests()
      .then(({ data }) => {
        const flat = [...(data.categories || []).flatMap(c => c.quests || []), ...(data.uncategorized || [])]
        // De-dupe (a quest can appear under one category only, but be safe).
        const seen = new Set()
        setQuests(flat.filter(q => !seen.has(q.id) && seen.add(q.id)))
      })
      .catch(() => setQuests([]))
      .finally(() => setLoading(false))
    // Cohorts (with student_ids) for one-tap whole-cohort selection.
    treehouseAPI.cohorts().then(({ data }) => setCohorts(data.cohorts || [])).catch(() => setCohorts([]))
    // Quest groups (org quest board subcategories) for one-tap batch selection.
    treehouseAPI.me()
      .then(({ data }) => data.organization_id
        ? api.get(`/api/organizations/${data.organization_id}/quest-groups`)
        : { data: { groups: [] } })
      .then(({ data }) => setQuestGroups(data.groups || []))
      .catch(() => setQuestGroups([]))
  }, [])

  const toggle = (setter) => (id) => setter(s => ({ ...s, [id]: !s[id] }))
  const questIds = Object.keys(pickedQuests).filter(id => pickedQuests[id])
  const studentIds = Object.keys(pickedStudents).filter(id => pickedStudents[id])

  // Chip select-all helpers: if the whole set is already selected, tapping the
  // chip deselects it; otherwise it selects the whole set.
  const toggleSet = (setter, current) => (ids) => {
    const allOn = ids.length > 0 && ids.every(id => current[id])
    setter(s => {
      const next = { ...s }
      ids.forEach(id => { next[id] = !allOn })
      return next
    })
  }
  const visibleStudentIds = new Set(students.map(s => s.id))
  const visibleQuestIds = new Set(quests.map(q => q.id))

  const assign = async () => {
    if (questIds.length === 0) return toast('Pick at least one quest')
    if (studentIds.length === 0) return toast('Pick at least one student')
    setBusy(true)
    try {
      const { data } = await api.post('/api/advisor/invite-to-quest', { quest_ids: questIds, user_ids: studentIds })
      toast.success(`Assigned ${data.enrolled} enrollment(s) across ${data.quest_count} quest(s)`)
      setPickedQuests({}); setPickedStudents({})
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not assign')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-neutral-400">Loading…</p>
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div>
        <p className="text-sm font-semibold text-neutral-700 mb-1">Quests ({questIds.length})</p>
        {questGroups.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {questGroups.map(g => {
              const ids = (g.quest_ids || []).filter(id => visibleQuestIds.has(id))
              if (ids.length === 0) return null
              const allOn = ids.every(id => pickedQuests[id])
              return (
                <button key={g.id} onClick={() => toggleSet(setPickedQuests, pickedQuests)(ids)}
                  className={`text-xs px-2.5 py-1 rounded-full border font-medium ${allOn ? 'bg-optio-purple text-white border-optio-purple' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
                  {g.name} ({ids.length})
                </button>
              )
            })}
          </div>
        )}
        <div className="max-h-72 overflow-y-auto rounded-lg border border-neutral-100 divide-y divide-neutral-50">
          {quests.map(q => (
            <label key={q.id} className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-neutral-50">
              <input type="checkbox" checked={!!pickedQuests[q.id]} onChange={() => toggle(setPickedQuests)(q.id)} className="w-5 h-5 accent-purple-600" />
              <span className="text-neutral-900 text-sm">{q.title}</span>
            </label>
          ))}
          {quests.length === 0 && <p className="text-neutral-400 p-3 text-sm">No quests yet.</p>}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-neutral-700 mb-1">Students ({studentIds.length})</p>
        {cohorts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {cohorts.map(c => {
              const ids = (c.student_ids || []).filter(id => visibleStudentIds.has(id))
              if (ids.length === 0) return null
              const allOn = ids.every(id => pickedStudents[id])
              return (
                <button key={c.id} onClick={() => toggleSet(setPickedStudents, pickedStudents)(ids)}
                  className={`text-xs px-2.5 py-1 rounded-full border font-medium ${allOn ? 'bg-optio-purple text-white border-optio-purple' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
                  {c.name} ({ids.length})
                </button>
              )
            })}
          </div>
        )}
        <div className="max-h-72 overflow-y-auto rounded-lg border border-neutral-100 divide-y divide-neutral-50">
          {students.map(s => (
            <label key={s.id} className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-neutral-50">
              <input type="checkbox" checked={!!pickedStudents[s.id]} onChange={() => toggle(setPickedStudents)(s.id)} className="w-5 h-5 accent-purple-600" />
              <span className="text-neutral-900 text-sm">{studentLabel(s)}</span>
            </label>
          ))}
          {students.length === 0 && <p className="text-neutral-400 p-3 text-sm">No students in this cohort.</p>}
        </div>
      </div>
      <div className="sm:col-span-2">
        <button onClick={assign} disabled={busy}
          className="w-full text-sm font-semibold text-white bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2.5 rounded-lg disabled:opacity-50">
          {busy ? 'Assigning…' : `Assign ${questIds.length || ''} quest(s) to ${studentIds.length || ''} student(s)`}
        </button>
      </div>
    </div>
  )
}

// A1 management: cohorts, facilitator assignment, enrollment, simplified UI toggle.
function CohortsTab() {
  const [cohorts, setCohorts] = useState([])
  const [facilitators, setFacilitators] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: c }, { data: f }, { data: s }] = await Promise.all([
        treehouseAPI.cohorts(), treehouseAPI.facilitators(), treehouseAPI.students(),
      ])
      setCohorts(c.cohorts || [])
      setFacilitators(f.facilitators || [])
      setStudents(s.students || [])
    } catch {
      toast.error('Could not load cohorts')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const createCohort = async () => {
    if (!newName.trim()) return
    try { await treehouseAPI.createCohort({ name: newName.trim() }); setNewName(''); load(); toast.success('Cohort created') }
    catch { toast.error('Could not create cohort') }
  }
  const assignAdvisor = async (classId, advisorId) => {
    if (!advisorId) return
    try { await treehouseAPI.assignCohortAdvisor(classId, advisorId); load(); toast.success('Facilitator assigned') }
    catch { toast.error('Could not assign') }
  }
  const removeAdvisor = async (classId, advisorId) => {
    try { await treehouseAPI.removeCohortAdvisor(classId, advisorId); load() }
    catch { toast.error('Could not remove') }
  }
  const enrollStudent = async (classId, studentId) => {
    if (!studentId) return
    try { await treehouseAPI.enrollCohortStudents(classId, [studentId]); load(); toast.success('Student enrolled') }
    catch { toast.error('Could not enroll') }
  }
  const withdrawStudent = async (classId, studentId) => {
    try { await treehouseAPI.withdrawCohortStudent(classId, studentId); load() }
    catch { toast.error('Could not remove') }
  }
  const toggleSimple = async (c) => {
    try { await treehouseAPI.updateCohort(c.id, { ui_mode: c.ui_mode === 'simple' ? null : 'simple' }); load() }
    catch { toast.error('Could not update') }
  }
  const saveRename = async (c) => {
    const name = editName.trim()
    setEditingId(null)
    if (!name || name === c.name) return
    try { await treehouseAPI.updateCohort(c.id, { name }); load(); toast.success('Cohort renamed') }
    catch { toast.error('Could not rename') }
  }
  const duplicateCohort = async (c) => {
    try { await treehouseAPI.duplicateCohort(c.id); load(); toast.success('Cohort duplicated') }
    catch { toast.error('Could not duplicate') }
  }
  const deleteCohort = async (c) => {
    if (!window.confirm(`Delete the "${c.name}" cohort? Students and their work are kept — this only removes the cohort grouping.`)) return
    try { await treehouseAPI.deleteCohort(c.id); load(); toast.success('Cohort deleted') }
    catch { toast.error('Could not delete') }
  }

  if (loading) return <p className="text-neutral-400">Loading…</p>
  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New cohort name"
          className="flex-1 rounded-lg border border-neutral-200 px-3 py-2" />
        <button onClick={createCohort} className="text-sm font-semibold text-white bg-optio-purple px-4 py-2 rounded-lg">Add cohort</button>
      </div>

      {cohorts.map((c) => {
        const advisorIds = new Set((c.advisors || []).map(a => a.id))
        const enrolledIds = new Set(c.student_ids || [])
        return (
          <div key={c.id} className="rounded-xl bg-white border border-neutral-100 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {editingId === c.id ? (
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') saveRename(c); if (e.key === 'Escape') setEditingId(null) }}
                    className="flex-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-bold" />
                  <button onClick={() => saveRename(c)} className="text-sm font-semibold text-white bg-optio-purple px-3 py-1.5 rounded-lg">Save</button>
                  <button onClick={() => setEditingId(null)} className="text-sm text-neutral-500">Cancel</button>
                </div>
              ) : (
                <p className="font-bold text-neutral-900">{c.name}</p>
              )}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-neutral-600">
                  <input type="checkbox" checked={c.ui_mode === 'simple'} onChange={() => toggleSimple(c)} className="w-4 h-4 accent-purple-600" />
                  Simple (young-learner) UI
                </label>
                {editingId !== c.id && (
                  <>
                    <button onClick={() => { setEditingId(c.id); setEditName(c.name || '') }}
                      className="text-sm text-neutral-500 hover:text-optio-purple">Rename</button>
                    <button onClick={() => duplicateCohort(c)}
                      className="text-sm text-neutral-500 hover:text-optio-purple">Duplicate</button>
                    <button onClick={() => deleteCohort(c)}
                      className="text-sm text-neutral-500 hover:text-red-600">Delete</button>
                  </>
                )}
              </div>
            </div>

            {/* Facilitators */}
            <div className="mt-3">
              <p className="text-sm font-semibold text-neutral-700">Facilitators</p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {(c.advisors || []).map(a => (
                  <span key={a.id} className="text-sm bg-neutral-100 rounded-full px-3 py-1 flex items-center gap-2">
                    {a.first_name || a.display_name || 'Facilitator'}
                    <button onClick={() => removeAdvisor(c.id, a.id)} className="text-neutral-400 hover:text-red-500">×</button>
                  </span>
                ))}
                <select defaultValue="" onChange={e => { assignAdvisor(c.id, e.target.value); e.target.value = '' }}
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-sm">
                  <option value="">+ Assign facilitator…</option>
                  {facilitators.filter(f => !advisorIds.has(f.id)).map(f => (
                    <option key={f.id} value={f.id}>{f.first_name || f.display_name || f.id}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Students */}
            <div className="mt-3">
              <p className="text-sm font-semibold text-neutral-700">Students ({c.student_count})</p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {students.filter(s => enrolledIds.has(s.id)).map(s => (
                  <span key={s.id} className="text-sm bg-neutral-100 rounded-full px-3 py-1 flex items-center gap-2">
                    {studentLabel(s)}
                    <button onClick={() => withdrawStudent(c.id, s.id)} className="text-neutral-400 hover:text-red-500">×</button>
                  </span>
                ))}
                <select defaultValue="" onChange={e => { enrollStudent(c.id, e.target.value); e.target.value = '' }}
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-sm">
                  <option value="">+ Enroll student…</option>
                  {students.filter(s => !enrolledIds.has(s.id)).map(s => (
                    <option key={s.id} value={s.id}>{studentLabel(s)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )
      })}
      {cohorts.length === 0 && <p className="text-neutral-400">No cohorts yet. Add one above.</p>}
    </div>
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
  const admin = isAdmin(effectiveRole, user)
  // Cohorts + Kiosk are admin-only; everyone else still sees the day-to-day tools.
  const TABS = ['Signals', 'Pins', 'Assign', 'Showcase', 'Balances', 'Capture', ...(admin ? ['Cohorts', 'Kiosk'] : [])]
  const [tab, setTab] = useState('Signals')
  const [cohorts, setCohorts] = useState([])
  const [cohortId, setCohortId] = useState('')   // '' = all my students
  const [showAddStudent, setShowAddStudent] = useState(false)

  useEffect(() => {
    treehouseAPI.cohorts().then(({ data }) => setCohorts(data.cohorts || [])).catch(() => setCohorts([]))
  }, [])

  if (!isFacilitator(effectiveRole, user)) return <Navigate to="/treehouse" replace />

  // The cohort filter applies to the per-student tabs only.
  const showCohortFilter = ['Signals', 'Pins', 'Assign', 'Balances', 'Capture'].includes(tab)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 font-poppins">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-bold text-neutral-900">Facilitator Dashboard</h1>
        {admin && (
          <button onClick={() => setShowAddStudent(true)}
            className="text-sm font-semibold text-white bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2 rounded-lg">
            + Add student
          </button>
        )}
      </div>

      <div className="flex gap-2 mt-4 border-b border-neutral-200 flex-wrap">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 font-semibold -mb-px border-b-2 ${tab === t ? 'border-optio-purple text-optio-purple' : 'border-transparent text-neutral-500'}`}>
            {t}
          </button>
        ))}
      </div>

      {showCohortFilter && cohorts.length > 0 && (
        <div className="mt-4 flex items-center gap-2">
          <label className="text-sm text-neutral-500">Cohort:</label>
          <select value={cohortId} onChange={e => setCohortId(e.target.value)}
            className="rounded-lg border border-neutral-200 px-2 py-1.5 text-sm">
            <option value="">{admin ? 'All students' : 'My students'}</option>
            {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      <div className="mt-6">
        {tab === 'Signals' && <SignalsTab cohortId={cohortId} />}
        {tab === 'Pins' && <PinsTab cohortId={cohortId} />}
        {tab === 'Assign' && <AssignTab cohortId={cohortId} />}
        {tab === 'Showcase' && <ShowcaseTab />}
        {tab === 'Balances' && <BalancesTab cohortId={cohortId} />}
        {tab === 'Capture' && <CaptureTab cohortId={cohortId} />}
        {tab === 'Cohorts' && admin && <CohortsTab />}
        {tab === 'Kiosk' && admin && <KioskTab />}
      </div>

      {showAddStudent && (
        <CreateUsernameStudentModal
          orgId={user?.organization_id}
          orgSlug="treehouse"
          onClose={() => setShowAddStudent(false)}
          onSuccess={() => { setShowAddStudent(false); toast.success('Student added') }}
        />
      )}
    </div>
  )
}

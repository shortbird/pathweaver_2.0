import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import SearchSelect from '../../components/ui/SearchSelect'
import { INLINE_INPUT_CLASS } from '../../components/ui/Input'
import { useSisOrg, withOrg } from './useSisOrg'

/**
 * Bloomy — the school's Bloomy key, which Bloomy student is which Optio
 * student, and a Sync now (Apogee Cache Valley, 2026-10-05). Each night the
 * server turns every linked student's mastered Bloomy skills into one quest
 * task per subject per day; the rules are in
 * backend/services/bloomy_sync_service.py. A suggested match is a name match
 * and stays a suggestion until somebody presses Link: Bloomy sends no id
 * Optio knows, and a wrong guess would put one child's work on another.
 */

const field = INLINE_INPUT_CLASS

const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString(undefined, {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}) : null)

const KeyForm = ({ orgId, connected, onSaved }) => {
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async (value) => {
    setSaving(true)
    try {
      const r = await api.put(withOrg('/api/sis/bloomy/key', orgId), { api_key: value })
      toast.success(value ? `Connected. Bloomy has ${r.data.bloomy_students} students.` : 'Bloomy disconnected')
      setKey('')
      onSaved()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save the key')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <h2 className="text-sm font-semibold text-neutral-900">Bloomy key</h2>
      <p className="text-xs text-neutral-500 mt-1">
        In Bloomy, open your school, then the Data API tab, and create a key with student names on. Paste it here. Optio checks it with Bloomy before saving, and never shows it again.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 mt-3">
        <input
          type="password"
          autoComplete="off"
          className={`${field} flex-1`}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={connected ? 'Paste a new key to replace the saved one' : 'blmy_live_…'}
          aria-label="Bloomy API key"
        />
        <Button onClick={() => save(key.trim())} loading={saving} disabled={saving || !key.trim()}>
          {connected ? 'Replace key' : 'Connect'}
        </Button>
        {connected && (
          <Button variant="secondary" onClick={() => save('')} disabled={saving}>Disconnect</Button>
        )}
      </div>
    </div>
  )
}

const SUBJECT_LABEL = { math: 'Math', reading: 'Reading' }

const fmtDay = (iso) => {
  if (!iso) return null
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** "number_base_ten" -> "Number base ten". Bloomy sends domain keys, not labels. */
export const domainLabel = (key) => {
  const words = String(key || '').replace(/_/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : ''
}

const gradeText = (g) => (g == null ? '—' : g === 0 ? 'K' : String(g))

/** The 7-day line for a row: what the student did in Bloomy lately. */
export const recentLine = (recent) => {
  if (!recent || !recent.worked) return 'No Bloomy work in the last 7 days'
  const m = recent.mastered || {}
  const mastered = (m.math || 0) + (m.reading || 0)
  return `Last 7 days: ${mastered} skill${mastered === 1 ? '' : 's'} mastered (Math ${m.math || 0}, Reading ${m.reading || 0}) · ${recent.days} day${recent.days === 1 ? '' : 's'} active · last on ${fmtDay(recent.last_active)}`
}

const SubjectSummary = ({ subject, data }) => (
  <div className="text-xs text-neutral-600">
    <span className="font-medium text-neutral-800">{SUBJECT_LABEL[subject] || subject}:</span>{' '}
    {data.mastered} mastered · {data.in_progress} in progress · {data.placed} placed
  </div>
)

const Details = ({ student, orgId }) => {
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    api.get(withOrg(`/api/sis/bloomy/student?bloomy_student_id=${encodeURIComponent(student.bloomy_student_id)}`, orgId))
      .then((r) => setDetail(r.data))
      .catch((e) => setDetail({ error: e?.response?.data?.error || 'Could not load from Bloomy' }))
  }, [student.bloomy_student_id, orgId])

  return (
    <div className="bg-gray-50 border-t border-gray-100 px-4 py-4 space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(student.subjects || {}).map(([subject, data]) => (
          <div key={subject}>
            <h4 className="text-xs font-semibold text-neutral-900 mb-1">{SUBJECT_LABEL[subject] || subject} by area</h4>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-neutral-500 text-left">
                  <th className="font-medium py-1">Area</th>
                  <th className="font-medium py-1 text-right">Level</th>
                  <th className="font-medium py-1 text-right">Mastered</th>
                  <th className="font-medium py-1 text-right">Working</th>
                </tr>
              </thead>
              <tbody>
                {data.domains.map((d) => (
                  <tr key={d.domain} className="border-t border-gray-200">
                    <td className="py-1 text-neutral-800">{domainLabel(d.domain)}</td>
                    <td className="py-1 text-right">Grade {gradeText(d.grade_level)}</td>
                    <td className="py-1 text-right">{d.mastered}</td>
                    <td className="py-1 text-right">{d.in_progress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <p className="text-xs text-neutral-500">
        Level is Bloomy&apos;s estimate of the grade the student works at in that area. Placed skills came from Bloomy&apos;s placement test; mastered skills were earned in Bloomy.
      </p>

      {detail === null && <p className="text-xs text-neutral-500">Loading skills and tests from Bloomy…</p>}
      {detail?.error && <p className="text-xs text-amber-700">{detail.error}</p>}
      {detail && !detail.error && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="text-xs font-semibold text-neutral-900 mb-1">
              Recently mastered ({detail.counts.earned} total)
            </h4>
            {detail.recent_mastered.length === 0 && <p className="text-xs text-neutral-500">None yet.</p>}
            <ul className="space-y-1">
              {detail.recent_mastered.map((k) => (
                <li key={k.task_id} className="text-xs">
                  <span className="text-neutral-800">{k.task_title}</span>
                  <span className="text-neutral-500">
                    {' '}· {SUBJECT_LABEL[k.subject] || k.subject} grade {gradeText(k.grade)}
                    {k.mastery_tier ? ` · ${k.mastery_tier}` : ''}
                    {k.best_passing_summit_score_pct != null ? ` · ${k.best_passing_summit_score_pct}%` : ''}
                    {' '}· {fmtDay(k.mastered_at)}
                  </span>
                </li>
              ))}
            </ul>
            {detail.in_progress.length > 0 && (
              <>
                <h4 className="text-xs font-semibold text-neutral-900 mt-3 mb-1">Working on now</h4>
                <ul className="space-y-1">
                  {detail.in_progress.map((k) => (
                    <li key={k.task_id} className="text-xs text-neutral-800">
                      {k.task_title}
                      <span className="text-neutral-500"> · {SUBJECT_LABEL[k.subject] || k.subject}{k.status === 'paused' ? ' · paused' : ''}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div>
            <h4 className="text-xs font-semibold text-neutral-900 mb-1">
              Recent tests ({detail.counts.attempts_passed} of {detail.counts.attempts} passed)
            </h4>
            {detail.attempts.length === 0 && <p className="text-xs text-neutral-500">No tests yet.</p>}
            <ul className="space-y-1">
              {detail.attempts.map((a, i) => (
                <li key={`${a.task_id}-${a.started_at}-${i}`} className="text-xs">
                  <span className={a.passed === true ? 'text-green-700' : a.passed === false ? 'text-amber-700' : 'text-neutral-500'}>
                    {a.passed === true ? 'Passed' : a.passed === false ? 'Not passed' : a.status === 'in_progress' ? 'Started' : 'No result'}
                    {a.score_pct != null ? ` ${a.score_pct}%` : ''}
                  </span>
                  <span className="text-neutral-800"> {a.task_title}</span>
                  <span className="text-neutral-500"> · {a.stage === 'summit' ? 'Summit' : 'Climb'} · {fmtDay(a.completed_at || a.last_activity_at || a.started_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

const StudentRow = ({ student, optioStudents, orgId, onChanged }) => {
  const [choice, setChoice] = useState(student.user_id || student.suggested_user_id || '')
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const linkedName = optioStudents.find((o) => o.id === student.user_id)?.name

  const save = async (userId) => {
    setSaving(true)
    try {
      await api.put(withOrg('/api/sis/bloomy/links', orgId), {
        bloomy_student_id: student.bloomy_student_id,
        user_id: userId || null,
      })
      toast.success(userId ? 'Linked' : 'Unlinked')
      onChanged()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save the link')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium text-neutral-900">{student.name || 'Name hidden by Bloomy'}</span>
            <span className="text-xs text-neutral-500">
              Grade {gradeText(student.grade)}
              {student.estimated_grade != null && student.estimated_grade !== student.grade
                ? ` · Bloomy estimate grade ${gradeText(student.estimated_grade)}` : ''}
              {' '}· {Number(student.learning_hours || 0).toFixed(1)} hours in Bloomy
            </span>
          </div>
          <div className="mt-1 space-y-0.5">
            {Object.entries(student.subjects || {}).map(([subject, data]) => (
              <SubjectSummary key={subject} subject={subject} data={data} />
            ))}
            <div className={`text-xs ${student.recent?.worked ? 'text-blue-800' : 'text-neutral-500'}`}>
              {recentLine(student.recent)}
            </div>
          </div>
          <button type="button" onClick={() => setOpen((v) => !v)}
            className="mt-1 text-xs font-medium text-optio-purple hover:underline">
            {open ? 'Hide details' : 'Show details'}
          </button>
        </div>
        {student.user_id ? (
          <div className="flex items-center gap-3 lg:w-80 lg:justify-end">
            <span className="text-sm text-green-700">Linked to {linkedName || 'a student'}</span>
            <Button variant="secondary" size="sm" onClick={() => save(null)} loading={saving} disabled={saving}>Unlink</Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:w-80">
            <SearchSelect
              className="flex-1"
              value={choice}
              onChange={setChoice}
              options={optioStudents}
              getId={(o) => o.id}
              getLabel={(o) => o.name}
              placeholder={optioStudents.length ? 'Find the Optio student' : 'No Optio students yet'}
            />
            {student.suggested_user_id && choice === student.suggested_user_id && (
              <span className="text-xs text-neutral-500">Same name</span>
            )}
            <Button size="sm" onClick={() => save(choice)} loading={saving} disabled={saving || !choice}>Link</Button>
          </div>
        )}
      </div>
      {open && <Details student={student} orgId={orgId} />}
    </div>
  )
}

const BloomyPage = () => {
  const { orgId } = useSisOrg()
  const [data, setData] = useState(null)
  const [syncing, setSyncing] = useState(false)

  const load = (refresh = false) => {
    if (!orgId) return
    api.get(withOrg(`/api/sis/bloomy${refresh === true ? '?refresh=1' : ''}`, orgId))
      .then((r) => setData(r.data))
      .catch(() => { toast.error('Could not load Bloomy'); setData({ connected: false, students: [], optio_students: [] }) })
  }

  useEffect(() => { load() }, [orgId])

  const syncNow = async () => {
    setSyncing(true)
    try {
      const r = await api.post(withOrg('/api/sis/bloomy/sync', orgId), {})
      if (r.data.error) toast.error(r.data.error)
      else toast.success(r.data.tasks ? `Added ${r.data.tasks} task${r.data.tasks === 1 ? '' : 's'}` : 'Up to date. Nothing new to add.')
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not sync')
    } finally {
      setSyncing(false)
    }
  }

  const linkedCount = (data?.students || []).filter((s) => s.user_id).length
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const summary = useMemo(() => {
    const all = data?.students || []
    const active = all.filter((s) => s.recent?.worked)
    const mastered = all.reduce((n, s) => n + (s.recent?.mastered?.math || 0) + (s.recent?.mastered?.reading || 0), 0)
    const hours = all.reduce((n, s) => n + Number(s.learning_hours || 0), 0)
    return { total: all.length, active: active.length, mastered, hours }
  }, [data])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data?.students || []).filter((s) => {
      if (q && !(s.name || '').toLowerCase().includes(q)) return false
      if (filter === 'unlinked') return !s.user_id
      if (filter === 'linked') return Boolean(s.user_id)
      if (filter === 'inactive') return !s.recent?.worked
      return true
    })
  }, [data, filter, search])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className="text-2xl font-bold text-neutral-900">Bloomy</h1>
        {data?.connected && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setData(null); load(true) }}>
              Refresh from Bloomy
            </Button>
            <Button variant="secondary" size="sm" onClick={syncNow} loading={syncing} disabled={syncing || !linkedCount}>
              Sync now
            </Button>
          </div>
        )}
      </div>
      <p className="text-sm text-neutral-600 mb-6">
        Each night, Optio adds a task to a linked student&apos;s Bloomy Math or Bloomy Reading quest for each day they mastered a skill in Bloomy. The task lists the skills and earns 25 XP a skill, up to 100 XP a day.
        {data?.last_sync_at ? ` Last sync: ${fmtWhen(data.last_sync_at)}.` : ''}
      </p>

      {data === null && <p className="text-neutral-500">Loading from Bloomy. This takes about ten seconds…</p>}
      {data && <KeyForm orgId={orgId} connected={data.connected} onSaved={load} />}
      {data?.error && <p className="text-sm text-amber-700 mb-4">{data.error}</p>}

      {data?.connected && data.students.length > 0 && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="text-neutral-700">{summary.total} students in Bloomy</span>
            <span className="text-neutral-700">{linkedCount} linked to Optio</span>
            <span className="text-blue-800">{summary.active} active in the last 7 days</span>
            <span className="text-blue-800">{summary.mastered} skills mastered in the last 7 days</span>
            <span className="text-neutral-700">{summary.hours.toFixed(1)} hours in Bloomy in all</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {[['all', 'All'], ['unlinked', 'Not linked'], ['linked', 'Linked'], ['inactive', 'No work this week']].map(([key, label]) => (
              <Button key={key} size="sm" variant={filter === key ? 'primary' : 'secondary'} onClick={() => setFilter(key)}>{label}</Button>
            ))}
            <input
              className={`${field} ml-auto w-full sm:w-56`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search students"
              aria-label="Search students"
            />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {shown.length === 0 && <p className="px-4 py-3 text-sm text-neutral-500">No students match.</p>}
            {shown.map((s) => (
              <StudentRow
                key={`${s.bloomy_student_id}-${s.user_id || ''}`}
                student={s}
                optioStudents={data.optio_students}
                orgId={orgId}
                onChanged={load}
              />
            ))}
          </div>
        </>
      )}
      {data?.connected && !data.error && data.students.length === 0 && (
        <p className="text-neutral-500">Bloomy has no students in this school&apos;s Reading or Math classes yet.</p>
      )}
    </div>
  )
}

export default BloomyPage

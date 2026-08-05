import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import { withPreview, getPreviewTeacher } from './teacherPreview'
import BackToDashboard from '../../components/sis/BackToDashboard'

/**
 * MySchedulePage — the teacher's weekly view: recurring class meetings and
 * assigned duties grouped by weekday, plus one-off dated items under "Upcoming".
 * Reads GET /api/sis/teacher/schedule ({ meetings, assignments }); both use the
 * class_meetings weekday convention (0=Sun … 6=Sat) and optional specific_date.
 */

// class_meetings / assignments convention: 0=Sun … 6=Sat. Rendered Mon-first
// (microschools run weekdays), with Sun/Sat last.
const DAYS = [
  { dow: 1, label: 'Monday' },
  { dow: 2, label: 'Tuesday' },
  { dow: 3, label: 'Wednesday' },
  { dow: 4, label: 'Thursday' },
  { dow: 5, label: 'Friday' },
  { dow: 6, label: 'Saturday' },
  { dow: 0, label: 'Sunday' },
]

const KIND_LABEL = { class: 'Class', duty: 'Duty', event: 'Event', meeting: 'Meeting', substitute: 'Substitute', other: 'Shift' }
const KIND_STYLE = {
  class: 'bg-optio-purple/10 text-optio-purple',
  duty: 'bg-amber-100 text-amber-700',
  event: 'bg-blue-100 text-blue-700',
  meeting: 'bg-gray-100 text-neutral-600',
  substitute: 'bg-pink-100 text-pink-700',
  other: 'bg-gray-100 text-neutral-600',
}

const fmtTime = (hhmm) => {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${ampm}`
}

// Normalize a meeting or assignment into one schedule-item shape.
const fromMeeting = (m) => ({
  kind: 'class',
  title: m.class_name || 'Class',
  class_id: m.class_id,
  day_of_week: m.day_of_week,
  specific_date: m.specific_date || null,
  start_time: m.start_time,
  end_time: m.end_time,
  location: m.location,
})
const fromAssignment = (a) => ({
  kind: a.assignment_type || 'duty',
  title: a.title,
  class_id: null,
  day_of_week: a.day_of_week,
  specific_date: a.specific_date || null,
  start_time: a.start_time,
  end_time: a.end_time,
  location: a.location,
  notes: a.notes,
})

const byTime = (a, b) =>
  (a.start_time == null) - (b.start_time == null) || String(a.start_time || '').localeCompare(String(b.start_time || ''))

const ItemRow = ({ item }) => (
  <li className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
    <span className="text-sm font-semibold text-neutral-500 w-24 shrink-0">
      {item.start_time ? `${fmtTime(item.start_time)}–${fmtTime(item.end_time)}` : 'All day'}
    </span>
    <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${KIND_STYLE[item.kind] || KIND_STYLE.other}`}>
      {KIND_LABEL[item.kind] || item.kind}
    </span>
    {item.class_id ? (
      <Link to={`/my-classes/${item.class_id}`} className="text-sm font-medium text-neutral-900 hover:text-optio-purple truncate">
        {item.title}
      </Link>
    ) : (
      <span className="text-sm text-neutral-800 truncate">{item.title}</span>
    )}
    {item.location && <span className="ml-auto text-xs text-neutral-400 shrink-0">{item.location}</span>}
  </li>
)

const MySchedulePage = () => {
  const { orgId } = useSisOrg()
  const [meetings, setMeetings] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const preview = getPreviewTeacher()

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withPreview(withOrg('/api/sis/teacher/schedule', orgId), preview))
      .then((r) => {
        setMeetings(r.data?.meetings || [])
        setAssignments(r.data?.assignments || [])
      })
      .catch((e) => toast.error(e?.response?.data?.error || 'Failed to load your schedule'))
      .finally(() => setLoading(false))
    // preview?.id keeps a re-created object from looping the effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, preview?.id])

  const { weekly, upcoming } = useMemo(() => {
    const items = [...meetings.map(fromMeeting), ...assignments.map(fromAssignment)]
    const recurring = items.filter((i) => !i.specific_date && i.day_of_week != null)
    const dated = items
      .filter((i) => i.specific_date)
      .sort((a, b) => String(a.specific_date).localeCompare(String(b.specific_date)) || byTime(a, b))
    const weekly = DAYS.map((d) => ({
      ...d,
      items: recurring.filter((i) => i.day_of_week === d.dow).sort(byTime),
    })).filter((d) => d.items.length)
    return { weekly, upcoming: dated }
  }, [meetings, assignments])

  if (loading) return <p className="text-neutral-500">Loading…</p>

  const empty = !weekly.length && !upcoming.length

  return (
    <div className="space-y-6">
      <div>
        <BackToDashboard className="mb-1" />
        <h1 className="text-2xl font-bold text-neutral-900">My schedule</h1>
        <p className="text-neutral-500 mt-1">Your weekly classes and duties. Tap a class to take attendance or message it.</p>
      </div>

      {empty && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-neutral-500">
            No classes or duties on your schedule yet — talk to your administrator if that looks wrong.
          </p>
        </div>
      )}

      {weekly.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {weekly.map((d) => {
            const isToday = d.dow === new Date().getDay()
            return (
              <div key={d.dow}
                className={`rounded-xl border p-5 ${isToday
                  ? 'bg-optio-purple/5 border-optio-purple'
                  : 'bg-white border-gray-200'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="font-semibold text-neutral-900">{d.label}</h2>
                  {isToday && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-optio-purple text-white font-medium">Today</span>
                  )}
                </div>
                <ul className="space-y-2">
                  {d.items.map((item, i) => <ItemRow key={i} item={item} />)}
                </ul>
              </div>
            )
          })}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-neutral-900 mb-3">Upcoming one-off items</h2>
          <ul className="space-y-2">
            {upcoming.map((item, i) => (
              <li key={i} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
                <span className="text-sm font-semibold text-neutral-500 w-28 shrink-0">
                  {new Date(`${item.specific_date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${KIND_STYLE[item.kind] || KIND_STYLE.other}`}>
                  {KIND_LABEL[item.kind] || item.kind}
                </span>
                {item.class_id ? (
                  <Link to={`/my-classes/${item.class_id}`} className="text-sm font-medium text-neutral-900 hover:text-optio-purple truncate">
                    {item.title}
                  </Link>
                ) : (
                  <span className="text-sm text-neutral-800 truncate">{item.title}</span>
                )}
                {item.start_time && <span className="ml-auto text-xs text-neutral-400 shrink-0">{fmtTime(item.start_time)}–{fmtTime(item.end_time)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default MySchedulePage

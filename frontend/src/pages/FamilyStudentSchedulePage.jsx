import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../services/api'
import WeeklySchedule, { formatTime } from '../components/schedule/WeeklySchedule'

/**
 * A printable copy of one student's class schedule.
 *
 * Families kept asking the office for a paper schedule: the dashboard shows the
 * week, but nothing on the family side could put it on a fridge. The school
 * calendar feed doesn't help either — it carries school events, never class
 * meetings.
 *
 * Two views of the same week, because a printed color grid is not always
 * readable: the weekly picture, then a plain list with teacher and room. The
 * list also catches weekend meetings, which the Mon-Fri grid cannot show.
 */

const DAY_NAMES = {
  0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday',
  4: 'Thursday', 5: 'Friday', 6: 'Saturday',
}
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] // Monday-first, the way a school week reads

/** "Mon 9:30am-10:30am; Wed 1pm-2pm", Monday-first. */
const meetingsText = (meetings) => {
  const sorted = [...(meetings || [])].sort((a, b) => {
    const da = DAY_ORDER.indexOf(a.day_of_week)
    const db = DAY_ORDER.indexOf(b.day_of_week)
    if (da !== db) return da - db
    return String(a.start_time || '').localeCompare(String(b.start_time || ''))
  })
  return sorted.map((m) => {
    const day = (DAY_NAMES[m.day_of_week] || '').slice(0, 3)
    const time = [formatTime(m.start_time), formatTime(m.end_time)].filter(Boolean).join('-')
    return [day, time].filter(Boolean).join(' ')
  }).filter(Boolean).join('; ')
}

const Card = ({ title, children }) => (
  <section className="bg-white rounded-xl border border-gray-200 p-5 mb-5 break-inside-avoid">
    <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">{title}</h2>
    {children}
  </section>
)

const FamilyStudentSchedulePage = () => {
  const { studentId } = useParams()
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    api.get('/api/sis/parent/context')
      .then(async (r) => {
        const orgs = r.data?.orgs || []
        const org = orgs.find((o) => (o.students || []).some((s) => s.student_id === studentId))
        if (!org) {
          if (alive) setError('This student is not enrolled at a school that uses schedules.')
          return
        }
        const student = (org.students || []).find((s) => s.student_id === studentId)
        const sched = await api.get(
          `/api/sis/parent/students/${studentId}/schedule?organization_id=${org.organization_id}`)
        if (alive) {
          setState({
            schedule: sched.data || {},
            studentName: student?.name || 'Student',
            orgName: org.organization_name || '',
          })
        }
      })
      .catch((e) => {
        if (alive) setError(e?.response?.data?.error || 'Could not load the schedule')
      })
    return () => { alive = false }
  }, [studentId])

  if (error) return <div className="max-w-3xl mx-auto px-4 py-8 text-gray-500">{error}</div>
  if (!state) return <div className="max-w-3xl mx-auto px-4 py-8 text-gray-500">Loading…</div>

  const { schedule, studentName, orgName } = state
  const classes = schedule.classes || []
  const waitlist = schedule.waitlist || []
  const homeCourses = schedule.courses || []
  const printedOn = new Date().toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div id="schedule-print-root" className="max-w-3xl mx-auto px-4 py-8">
      {/*
        The app chrome (top nav, sidebar) has no print rules of its own, so
        printing any page in this Layout drags the navigation onto the paper.
        Hiding everything and re-showing this subtree is the one recipe that
        does not depend on the chrome's markup — the same one the staff-side
        ClassRosterExportModal prints with. Hidden elements still take up
        space, hence pinning this root to the top of the sheet.

        print-color-adjust keeps the class blocks their colors: without it most
        browsers drop background fills and the grid prints white-on-white.
      */}
      <style>{`
        @media print {
          @page { margin: 0.5in; }
          body { background: #fff; }
          body * { visibility: hidden !important; }
          #schedule-print-root, #schedule-print-root * { visibility: visible !important; }
          #schedule-print-root {
            position: absolute; left: 0; top: 0; width: 100%;
            max-width: none; margin: 0; padding: 0;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
        }
      `}</style>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{studentName}</h1>
          <p className="text-sm text-gray-500">
            {['Class schedule', orgName].filter(Boolean).join(' · ')}
          </p>
          {/* On screen this is noise; on paper it says how old the copy is. */}
          <p className="hidden print:block text-xs text-gray-400 mt-1">Printed {printedOn}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 print:hidden">
          <Link to={`/family/students/${studentId}`}
            className="text-sm text-optio-purple font-medium hover:underline">
            Student record
          </Link>
          <button onClick={() => window.print()} className="btn-primary">Print</button>
        </div>
      </div>

      {classes.length === 0 ? (
        <Card title="Classes">
          <p className="text-sm text-gray-400">
            No classes yet{orgName ? ` at ${orgName}` : ''}.
          </p>
        </Card>
      ) : (
        <>
          <Card title="The week">
            <WeeklySchedule classes={classes} timeBlocks={schedule.time_blocks || []} />
          </Card>

          <Card title="Classes">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="py-2 pr-3 font-medium">Class</th>
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Teacher</th>
                  <th className="py-2 font-medium">Where</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {classes.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-3 text-gray-800">{c.name}</td>
                    <td className="py-2 pr-3 text-gray-500">{meetingsText(c.meetings) || 'Not scheduled'}</td>
                    <td className="py-2 pr-3 text-gray-500">{c.primary_instructor?.name || ''}</td>
                    <td className="py-2 text-gray-500">{c.location || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {waitlist.length > 0 && (
        <Card title="Waitlist">
          <ul className="text-sm text-gray-800 space-y-1">
            {waitlist.map((w) => (
              <li key={w.entry_id}>
                {w.class_name}
                {w.position ? <span className="text-gray-500"> · #{w.position} in line</span> : null}
                {w.status === 'offered' ? <span className="text-gray-500"> · seat offered</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {homeCourses.length > 0 && (
        <Card title="At-home learning">
          <ul className="text-sm text-gray-800 space-y-1">
            {homeCourses.map((c) => <li key={c.id}>{c.title}</li>)}
          </ul>
        </Card>
      )}
    </div>
  )
}

export default FamilyStudentSchedulePage

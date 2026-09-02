import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import WeeklySchedule from '../components/schedule/WeeklySchedule'
import ScheduleByDay from '../components/schedule/ScheduleByDay'

/**
 * A printable copy of one student's class schedule.
 *
 * Families kept asking the office for a paper schedule: the dashboard shows the
 * week, but nothing on the family side could put it on a fridge. The school
 * calendar feed doesn't help either — it carries school events, never class
 * meetings.
 *
 * Two views of the same week, because a printed color grid is not always
 * readable: the weekly picture, then the same meetings day by day in time order
 * with teacher and room. The day list also catches weekend and one-off dated
 * meetings, which the Mon-Fri grid cannot show.
 */

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
  const [claiming, setClaiming] = useState(null)   // class_id mid-claim
  const [reloadKey, setReloadKey] = useState(0)

  // A family reading this page is looking at the same waitlist the Schedule
  // Builder shows, so an offered seat has to be claimable here too — "seat
  // offered" with no button read as a dead end (iCreate, 2026-09-02).
  const claimSpot = async (w, orgId) => {
    setClaiming(w.class_id)
    try {
      await api.post(`/api/sis/parent/students/${studentId}/classes/${w.class_id}/claim`,
        { organization_id: orgId })
      toast.success(`Enrolled in ${w.class_name}`)
      setReloadKey((k) => k + 1)
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not claim the spot')
      setReloadKey((k) => k + 1)
    } finally { setClaiming(null) }
  }

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
            orgId: org.organization_id,
          })
        }
      })
      .catch((e) => {
        if (alive) setError(e?.response?.data?.error || 'Could not load the schedule')
      })
    return () => { alive = false }
  }, [studentId, reloadKey])

  if (error) return <div className="max-w-3xl mx-auto px-4 py-8 text-gray-500">{error}</div>
  if (!state) return <div className="max-w-3xl mx-auto px-4 py-8 text-gray-500">Loading…</div>

  const { schedule, studentName, orgName, orgId } = state
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

          {/* Day by day, in time order — the way a family reads the week.
              The class-per-row table this replaced made anyone asking "where is
              she at 10:30 on Tuesday?" scan every row and re-sort mentally. */}
          <Card title="Day by day">
            <ScheduleByDay classes={classes} />
          </Card>
        </>
      )}

      {waitlist.length > 0 && (
        <Card title="Waitlist">
          <ul className="text-sm text-gray-800 space-y-1.5">
            {waitlist.map((w) => (
              <li key={w.entry_id} className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  {w.class_name}
                  {w.position ? <span className="text-gray-500"> · #{w.position} in line</span> : null}
                  {w.status === 'offered'
                    ? <span className="text-green-700 font-medium"> · a spot is being held</span>
                    : null}
                </span>
                {w.status === 'offered' && (
                  <button type="button" onClick={() => claimSpot(w, orgId)}
                    disabled={claiming === w.class_id}
                    className="shrink-0 print:hidden text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg px-3 py-1.5 disabled:opacity-50">
                    {claiming === w.class_id ? 'Claiming…' : 'Claim spot'}
                  </button>
                )}
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

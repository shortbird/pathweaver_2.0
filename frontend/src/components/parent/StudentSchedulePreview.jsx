import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import WeeklySchedule from '../schedule/WeeklySchedule'
import ScheduleByDay from '../schedule/ScheduleByDay'

/**
 * The student's weekly class schedule on the family-dashboard overview, shown
 * immediately under the hero. Renders nothing for students who aren't in a
 * SIS-enabled school. Before the first day of school it links to the Schedule
 * Builder; after that it notes that changes are handled by the school.
 *
 * Two reads of the same week: the grid for its shape, then the same meetings
 * day by day in time order (ScheduleByDay) with teacher and room.
 */
const StudentSchedulePreview = ({ studentId }) => {
  const [state, setState] = useState(null) // { schedule, orgName } | 'none'

  useEffect(() => {
    let alive = true
    api.get('/api/sis/parent/context')
      .then(async (r) => {
        const orgs = r.data?.orgs || []
        const org = orgs.find((o) => (o.students || []).some((s) => s.student_id === studentId))
        if (!org) { if (alive) setState('none'); return }
        const sched = await api.get(`/api/sis/parent/students/${studentId}/schedule?organization_id=${org.organization_id}`)
        if (alive) setState({ schedule: sched.data, orgName: org.organization_name })
      })
      .catch(() => { if (alive) setState('none') })
    return () => { alive = false }
  }, [studentId])

  if (!state || state === 'none') return null

  const { schedule, orgName } = state
  const classes = schedule?.classes || []
  const waitlist = schedule?.waitlist || []
  const homeCourses = schedule?.courses || []
  const locked = !!schedule?.changes_locked
  // A seat the school has offered off the waitlist. Claiming one is NOT a
  // self-service schedule change — it stays open after the first day of school
  // — but the locked dashboard hid the only link to the page that can claim it
  // (iCreate, 2026-09-02: "there's no button that allows her to claim").
  const offeredSeats = waitlist.filter((w) => w.status === 'offered')

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Class schedule</h2>
          <p className="text-sm text-neutral-500">
            {classes.length
              ? `${classes.length} class${classes.length === 1 ? '' : 'es'} at ${orgName}`
              : `No classes yet at ${orgName}`}
            {waitlist.length > 0 && ` · ${waitlist.length} waitlisted`}
            {homeCourses.length > 0 && ` · ${homeCourses.length} at-home course${homeCourses.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* A paper copy for the fridge. Only worth offering once there is a
              week to print. */}
          {classes.length > 0 && (
            <Link to={`/family/students/${studentId}/schedule`}
              className="text-sm text-optio-purple font-medium hover:underline">
              Print
            </Link>
          )}
          {locked ? (
            <span className="text-sm text-neutral-400">Schedule changes are handled by {orgName || 'the school'}.</span>
          ) : (
            <Link to="/schedule-builder"
              className="btn-primary">
              {classes.length ? 'Make changes' : 'Build the schedule'}
            </Link>
          )}
        </div>
      </div>

      {offeredSeats.length > 0 && (
        <div className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3">
          <div className="text-sm font-semibold text-green-900">
            {offeredSeats.length === 1
              ? `A spot is being held in ${offeredSeats[0].class_name}`
              : `${offeredSeats.length} spots are being held`}
          </div>
          <p className="text-sm text-green-800 mt-0.5 mb-2.5">
            {orgName || 'The school'} offered {offeredSeats.length === 1 ? 'this seat' : 'these seats'} off
            the waitlist. Claim {offeredSeats.length === 1 ? 'it' : 'them'} before the offer expires.
          </p>
          <Link to={`/schedule-builder?student=${studentId}`}
            className="inline-flex text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg px-3 py-1.5">
            {offeredSeats.length === 1 ? 'Claim the spot' : 'Claim the spots'}
          </Link>
        </div>
      )}

      {classes.length > 0 ? (
        <>
          <WeeklySchedule classes={classes} compact />
          {/* The grid shows the shape of the week; this answers the question
              families actually arrive with — "where is she at 10:30 on
              Tuesday?" — in day order, then time order. The grid alone left a
              parent counting rows and squinting at block positions (iCreate
              parent, 2026-08-25). */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <ScheduleByDay classes={classes} />
          </div>
        </>
      ) : !locked ? (
        <p className="text-sm text-neutral-400">
          Open the Schedule Builder to add classes — they'll show up here on the weekly calendar.
        </p>
      ) : null}

      {homeCourses.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1.5">At-home learning</div>
          <div className="flex flex-wrap gap-1.5">
            {homeCourses.map((c) => (
              <span key={c.id} className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-optio-purple/10 text-optio-purple">
                {c.title}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

StudentSchedulePreview.propTypes = {
  studentId: PropTypes.string.isRequired,
}

export default StudentSchedulePreview

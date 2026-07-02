import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import WeeklySchedule from '../schedule/WeeklySchedule'

/**
 * The student's weekly class schedule on the family-dashboard overview, shown
 * immediately under the hero. Renders nothing for students who aren't in a
 * SIS-enabled school. Before the first day of school it links to the Schedule
 * Builder; after that it notes that changes are handled by the school.
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
        {locked ? (
          <span className="text-sm text-neutral-400">Schedule changes are handled by {orgName || 'the school'}.</span>
        ) : (
          <Link to="/schedule-builder"
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:opacity-90">
            {classes.length ? 'Make changes' : 'Build the schedule'}
          </Link>
        )}
      </div>

      {classes.length > 0 ? (
        <WeeklySchedule classes={classes} compact />
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

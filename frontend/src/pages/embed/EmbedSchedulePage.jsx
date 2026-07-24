import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { range12h } from '../../utils/timeFormat'
import { fetchEmbed, agesLabel } from './embedShared'

/**
 * Public, iframe-able weekly schedule widget: GET /api/embed/:slug/schedule.
 *
 * Standalone page (no app Layout/auth chrome). Renders a weekly grid: one column
 * per weekday that has classes, each column stacking that day's sessions in
 * start-time order. Wide on desktop; the grid scrolls horizontally on mobile
 * inside its own container so the page body never scrolls sideways.
 */

const SeatDot = ({ cls }) => {
  const { open_seats, waitlist_count } = cls
  let color = 'bg-green-500'
  let label = 'Open'
  if (open_seats != null) {
    if (open_seats > 0) {
      label = `${open_seats} left`
    } else {
      color = 'bg-optio-pink'
      label = waitlist_count > 0 ? `Waitlist: ${waitlist_count}` : 'Full'
    }
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
      <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
      {label}
    </span>
  )
}

const SessionCard = ({ cls }) => {
  const time = range12h(cls.start_time, cls.end_time)
  const ages = agesLabel(cls.min_age, cls.max_age)
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      {time && (
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-optio-purple">
          {time}
        </div>
      )}
      <div className="text-sm font-bold leading-snug text-gray-900">{cls.name}</div>
      {cls.teacher_name && (
        <div className="mt-0.5 text-xs text-gray-500">{cls.teacher_name}</div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <SeatDot cls={cls} />
        {ages && <span className="text-xs text-gray-400">{ages}</span>}
      </div>
      {cls.location && (
        <div className="mt-1 text-xs text-gray-400">{cls.location}</div>
      )}
    </div>
  )
}

const EmbedSchedulePage = () => {
  const { slug } = useParams()
  const [state, setState] = useState({ status: 'loading', days: [] })

  useEffect(() => {
    let active = true
    setState({ status: 'loading', days: [] })
    fetchEmbed(`/api/embed/${slug}/schedule`)
      .then((data) => {
        if (active) setState({ status: 'ready', days: data.days || [] })
      })
      .catch((err) => {
        if (active) setState({ status: err.status === 404 ? 'notfound' : 'error', days: [] })
      })
    return () => {
      active = false
    }
  }, [slug])

  return (
    <div className="min-h-screen w-full bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <h1 className="bg-gradient-to-r from-optio-purple to-optio-pink bg-clip-text text-2xl font-extrabold text-transparent sm:text-3xl">
            Weekly Schedule
          </h1>
          <p className="mt-1 text-sm text-gray-500">Classes by day, with live availability.</p>
        </header>

        {state.status === 'loading' && (
          <div className="h-64 animate-pulse rounded-2xl border border-gray-200 bg-white" />
        )}

        {state.status === 'error' && (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-600">
            We couldn't load the schedule right now. Please refresh to try again.
          </div>
        )}

        {state.status === 'notfound' && (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-600">
            This schedule is not available.
          </div>
        )}

        {state.status === 'ready' && state.days.length === 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-600">
            No scheduled classes to show right now. Please check back soon.
          </div>
        )}

        {state.status === 'ready' && state.days.length > 0 && (
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-full gap-4">
              {state.days.map((day) => (
                <div key={day.day_of_week} className="flex w-64 flex-shrink-0 flex-col">
                  <div className="mb-3 rounded-xl bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2 text-center text-sm font-bold text-white">
                    {day.day_name}
                  </div>
                  <div className="flex flex-col gap-3">
                    {day.sessions.map((cls) => (
                      <SessionCard key={`${day.day_of_week}-${cls.id}`} cls={cls} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default EmbedSchedulePage

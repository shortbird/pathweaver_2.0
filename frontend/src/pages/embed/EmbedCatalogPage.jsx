import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { range12h } from '../../utils/timeFormat'
import { fetchEmbed, daysLabel, agesLabel, money } from './embedShared'

/**
 * Public, iframe-able class catalog widget: GET /api/embed/:slug/catalog.
 *
 * Standalone page — rendered OUTSIDE the app Layout/auth chrome so it can be
 * dropped into an <iframe> on an external marketing site. Read-only, no PII.
 */

const SeatBadge = ({ cls }) => {
  const { open_seats, waitlist_count } = cls
  // Unlimited capacity (open_seats null) — enrollment is simply open.
  if (open_seats == null) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-200">
        Open enrollment
      </span>
    )
  }
  if (open_seats > 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-200">
        {open_seats} {open_seats === 1 ? 'seat' : 'seats'} left
      </span>
    )
  }
  // Full — surface the waitlist if there's demand.
  return (
    <span className="inline-flex items-center rounded-full bg-optio-pink/10 px-3 py-1 text-xs font-semibold text-optio-pink-dark ring-1 ring-optio-pink/30">
      {waitlist_count > 0 ? `Full · Waitlist: ${waitlist_count}` : 'Class full'}
    </span>
  )
}

const ClassCard = ({ cls }) => {
  const time = range12h(cls.start_time, cls.end_time)
  const days = daysLabel(cls.days)
  const ages = agesLabel(cls.min_age, cls.max_age)
  const schedule = [days, time].filter(Boolean).join(' · ')

  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-lg font-bold leading-snug text-gray-900">{cls.name}</h3>
        <SeatBadge cls={cls} />
      </div>

      <dl className="mb-3 space-y-1 text-sm text-gray-600">
        {cls.teacher_name && (
          <div className="flex gap-2">
            <dt className="font-medium text-gray-500">Teacher</dt>
            <dd>{cls.teacher_name}</dd>
          </div>
        )}
        {schedule && (
          <div className="flex gap-2">
            <dt className="font-medium text-gray-500">When</dt>
            <dd>{schedule}</dd>
          </div>
        )}
        {ages && (
          <div className="flex gap-2">
            <dt className="font-medium text-gray-500">Ages</dt>
            <dd>{ages}</dd>
          </div>
        )}
        {cls.location && (
          <div className="flex gap-2">
            <dt className="font-medium text-gray-500">Where</dt>
            <dd>{cls.location}</dd>
          </div>
        )}
      </dl>

      {cls.description && (
        <p className="mb-4 line-clamp-4 text-sm leading-relaxed text-gray-600">
          {cls.description}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-gray-100 pt-3">
        {cls.tuition != null ? (
          <span className="text-base font-bold text-optio-purple">{money(cls.tuition)}</span>
        ) : (
          <span className="text-sm font-medium text-gray-400">Tuition varies</span>
        )}
        {cls.supply_fee != null && cls.supply_fee > 0 && (
          <span className="text-xs text-gray-500">+ {money(cls.supply_fee)} supplies</span>
        )}
      </div>
    </div>
  )
}

const EmbedCatalogPage = () => {
  const { slug } = useParams()
  const [state, setState] = useState({ status: 'loading', classes: [] })

  useEffect(() => {
    let active = true
    setState({ status: 'loading', classes: [] })
    fetchEmbed(`/api/embed/${slug}/catalog`)
      .then((data) => {
        if (active) setState({ status: 'ready', classes: data.classes || [] })
      })
      .catch((err) => {
        if (active) setState({ status: err.status === 404 ? 'notfound' : 'error', classes: [] })
      })
    return () => {
      active = false
    }
  }, [slug])

  return (
    <div className="min-h-screen w-full bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="bg-gradient-to-r from-optio-purple to-optio-pink bg-clip-text text-2xl font-extrabold text-transparent sm:text-3xl">
            Class Catalog
          </h1>
          <p className="mt-1 text-sm text-gray-500">Current classes and live availability.</p>
        </header>

        {state.status === 'loading' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-56 animate-pulse rounded-2xl border border-gray-200 bg-white" />
            ))}
          </div>
        )}

        {state.status === 'error' && (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-600">
            We couldn't load the catalog right now. Please refresh to try again.
          </div>
        )}

        {state.status === 'notfound' && (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-600">
            This catalog is not available.
          </div>
        )}

        {state.status === 'ready' && state.classes.length === 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-600">
            No classes are open for enrollment right now. Please check back soon.
          </div>
        )}

        {state.status === 'ready' && state.classes.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {state.classes.map((cls) => (
              <ClassCard key={cls.id} cls={cls} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default EmbedCatalogPage

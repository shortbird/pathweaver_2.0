import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'

// Public, embeddable weekly class schedule (iCreate feedback 2026-07-21):
// a read-only grid of the org's open classes for the school's own website,
// served at /schedule-embed/:previewCode (the org's standing registration
// invitation code) and backed by the same public schedule-preview endpoint
// as the funnel preview. Display-only by design — no links into registration.

const DAYS = [1, 2, 3, 4, 5]
const DAY_LABELS = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday' }

const toMin = (t) => {
  if (!t) return null
  const [h, m] = String(t).split(':').map(Number)
  return Number.isNaN(h) ? null : h * 60 + (m || 0)
}

const fmtTime = (t) => {
  const min = toMin(t)
  if (min == null) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${ampm}`
}

const ageText = (c) => (c.min_age != null && c.max_age != null
  ? `ages ${c.min_age}–${c.max_age}`
  : c.min_age != null ? `ages ${c.min_age}+`
    : c.max_age != null ? `up to age ${c.max_age}` : null)

const ScheduleEmbedPage = () => {
  const { previewCode } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    api.get(`/api/icreate/schedule-preview/${previewCode}`)
      .then((r) => setData(r.data))
      .catch(() => setError(true))
  }, [previewCode])

  // Every (day, class-meeting) pairing sorted by start time — a class meeting
  // Tue & Thu appears in both columns.
  const byDay = useMemo(() => {
    const out = {}
    for (const c of data?.classes || []) {
      const seen = new Set()
      for (const m of c.meetings || []) {
        const d = m.day_of_week
        if (!DAYS.includes(d) || seen.has(d)) continue
        seen.add(d)
        ;(out[d] = out[d] || []).push({ cls: c, m })
      }
    }
    for (const d of Object.keys(out)) {
      out[d].sort((a, b) => (toMin(a.m.start_time) || 0) - (toMin(b.m.start_time) || 0))
    }
    return out
  }, [data])

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-8">
        <p className="text-neutral-400 text-sm">This schedule is not available — check the embed link.</p>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
      </div>
    )
  }

  const days = DAYS.filter((d) => (byDay[d] || []).length > 0)

  return (
    <div className="min-h-screen bg-white p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
          <h1 className="text-xl font-bold text-neutral-900">
            {data.organization_name ? `${data.organization_name} — ` : ''}Weekly Class Schedule
          </h1>
          <span className="text-xs text-neutral-400">Live schedule — updates automatically</span>
        </div>
        {days.length === 0 ? (
          <p className="text-neutral-400 text-sm py-8 text-center">No classes are currently open for registration.</p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((d) => (
              <div key={d} className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2 text-center">
                  {DAY_LABELS[d]}
                </div>
                <div className="space-y-2">
                  {(byDay[d] || []).map(({ cls, m }, i) => (
                    <div key={`${cls.id}-${i}`}
                      className="rounded-lg border border-gray-200 bg-gradient-to-br from-[#F3EFF4] to-white p-2.5">
                      <div className="text-sm font-semibold text-neutral-900 leading-tight">{cls.name}</div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        {fmtTime(m.start_time)}–{fmtTime(m.end_time)}
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-0.5">
                        {[ageText(cls),
                          cls.is_full ? 'Full' : cls.spots_left != null ? `${cls.spots_left} spot${cls.spots_left === 1 ? '' : 's'} left` : null,
                        ].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-neutral-300 mt-6 text-center">Powered by Optio</p>
      </div>
    </div>
  )
}

export default ScheduleEmbedPage

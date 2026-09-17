import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'
import { weekGrid, fmtTime } from '../utils/schedule'
import ClassSummaryLine from '../components/sis/ClassSummaryLine'

// Public, embeddable weekly class schedule (iCreate feedback 2026-07-21):
// a read-only grid of the org's open classes for the school's own website,
// served at /schedule-embed/:previewCode (the org's standing registration
// invitation code) and backed by the same public schedule-preview endpoint
// as the funnel preview. Display-only by design — no links into registration.

const DAYS = [1, 2, 3, 4, 5]
const DAY_LABELS = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday' }

const ScheduleEmbedPage = () => {
  const { previewCode } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    api.get(`/api/registration/schedule-preview/${previewCode}`)
      .then((r) => setData(r.data))
      .catch(() => setError(true))
  }, [previewCode])

  // One row per start time across the week (utils/schedule.weekGrid, the
  // model every schedule grid shares), weekdays only: a class meeting Tue &
  // Thu sits on the same row in both columns.
  const week = useMemo(() => weekGrid(data?.classes || [], { recurringOnly: true }), [data])

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

  const days = DAYS.filter((d) => week.days.includes(d))

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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs border-collapse">
              <thead>
                <tr>
                  <th className="p-1.5 w-20"></th>
                  {days.map((d) => (
                    <th key={d} className="p-1.5 text-center font-semibold uppercase tracking-wide text-neutral-400">
                      {DAY_LABELS[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {week.slots.map((slot) => {
                  const ends = [...(week.endsBySlot[slot] || [])]
                  const uniformEnd = ends.length === 1 ? ends[0] : null
                  return (
                    <tr key={slot} className="border-t border-gray-100">
                      <td className="p-1.5 text-neutral-400 whitespace-nowrap align-top">
                        {uniformEnd ? `${fmtTime(slot)}–${fmtTime(uniformEnd)}` : fmtTime(slot)}
                      </td>
                      {days.map((d) => (
                        <td key={d} className="p-1 align-top">
                          {(week.cell[`${d}|${slot}`] || []).map(({ cls, m }, i) => (
                            <div key={`${cls.id}-${i}`}
                              className="rounded-lg border border-gray-200 bg-gradient-to-br from-[#F3EFF4] to-white p-2.5 mb-1">
                              <div className="text-sm font-semibold text-neutral-900 leading-tight">{cls.name}</div>
                              {!uniformEnd && m.end_time && (
                                <div className="text-xs text-neutral-500 mt-0.5">until {fmtTime(m.end_time)}</div>
                              )}
                              <ClassSummaryLine cls={cls} short hideOpen className="block text-[11px] text-neutral-400 mt-0.5" />
                            </div>
                          ))}
                          {!(week.cell[`${d}|${slot}`] || []).length && week.covering(d, slot).map((cls, i) => (
                            <div key={`cont-${i}`} className="rounded-lg border border-dashed border-gray-200 text-neutral-400 px-2 py-1 mb-1 text-[11px]">
                              {cls.name} (continues)
                            </div>
                          ))}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-neutral-300 mt-6 text-center">Powered by Optio</p>
      </div>
    </div>
  )
}

export default ScheduleEmbedPage

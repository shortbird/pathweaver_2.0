import React from 'react'
import { signed } from './sis/PointsPage'
import { useMyPoints } from '../hooks/api/useSisPoints'

/**
 * School points, as a student or their parent sees them: the balance now and
 * what earned or spent it. Read-only -- staff give and take points in the SIS
 * console (pages/sis/PointsPage). A student sees their own; a parent sees
 * each child's.
 */

const fmtDay = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

const FamilyPointsPage = () => {
  const mine = useMyPoints()
  const students = mine.isError ? [] : (mine.data ?? null)

  if (students === null) return <p className="text-neutral-500 p-4">Loading…</p>
  if (students.length === 0) {
    return <p className="text-neutral-500 p-4">No points yet. Staff give points for school jobs.</p>
  }

  return (
    <div className="space-y-8">
      {students.map((s) => (
        <section key={s.student_id}>
          {students.length > 1 && <h2 className="text-lg font-bold text-neutral-900 mb-3">{s.name}</h2>}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span className="text-3xl font-bold text-neutral-900 tabular-nums">{s.balance}</span>
            <span className="text-sm text-neutral-700">points now</span>
            <span className="text-sm text-neutral-500">{s.earned} earned · {s.spent} spent</span>
          </div>
          {s.entries.length === 0 ? (
            <p className="text-sm text-neutral-500">No points yet.</p>
          ) : (
            <ul className="bg-white rounded-xl border border-gray-200 px-4 divide-y divide-gray-100">
              {s.entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-sm text-neutral-900 truncate">{e.reason}</span>
                    <span className="block text-xs text-neutral-500">{fmtDay(e.created_at)}</span>
                  </span>
                  <span className={`text-sm font-semibold ${e.amount > 0 ? 'text-green-700' : 'text-amber-700'}`}>
                    {signed(e.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}

export default FamilyPointsPage

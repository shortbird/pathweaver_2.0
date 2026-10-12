import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import Button from '../components/ui/Button'
import { INLINE_INPUT_CLASS } from '../components/ui/Input'
import { signed } from './sis/PointsPage'
import { useAddMyPoints, useMyPoints } from '../hooks/api/useSisPoints'

/**
 * School points, as a student or their parent sees them: the balance now and
 * what earned or spent it. A student can add points for themselves (ticket
 * 910668d8): they count at once, up to a daily cap, and a coach can take them
 * away in the SIS console (pages/sis/PointsPage). A parent reads each child's
 * points and cannot add.
 */

const AddMyPoints = ({ student }) => {
  const addMine = useAddMyPoints()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const left = Math.max((student.daily_cap ?? 0) - (student.added_today ?? 0), 0)
  const n = parseInt(amount, 10) || 0
  const ready = n > 0 && n <= left && reason.trim()

  const submit = async (e) => {
    e.preventDefault()
    if (!ready) return
    try {
      await addMine.mutateAsync({ amount: n, reason: reason.trim() })
      toast.success(`${signed(n)} points added`)
      setAmount('')
      setReason('')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not add the points')
    }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-4 mb-3 space-y-2">
      <div className="text-sm font-semibold text-neutral-900">Add points</div>
      <p className="text-xs text-neutral-500">
        You can add up to {student.daily_cap} points a day ({left} left today). A coach can take them away.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${INLINE_INPUT_CLASS} w-24`} type="number" min={1} max={left || undefined}
          value={amount} placeholder="5" aria-label="Points to add" onChange={(e) => setAmount(e.target.value)} />
        <input className={`${INLINE_INPUT_CLASS} flex-1 min-w-[12rem]`} value={reason} maxLength={200}
          placeholder="What for, like Daily job" aria-label="What for" onChange={(e) => setReason(e.target.value)} />
        <Button size="sm" type="submit" loading={addMine.isPending} disabled={!ready || addMine.isPending}>
          Add
        </Button>
      </div>
    </form>
  )
}

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
          {s.can_add && <AddMyPoints student={s} />}
          {s.entries.length === 0 ? (
            <p className="text-sm text-neutral-500">No points yet.</p>
          ) : (
            <ul className="bg-white rounded-xl border border-gray-200 px-4 divide-y divide-gray-100">
              {s.entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-sm text-neutral-900 truncate">{e.reason}</span>
                    <span className="block text-xs text-neutral-500">
                      {fmtDay(e.created_at)}{e.added_by_student ? (s.can_add ? ' · added by you' : ' · added by the student') : ''}
                    </span>
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

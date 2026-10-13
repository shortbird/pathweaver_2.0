import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import Button from '../ui/Button'
import { INLINE_INPUT_CLASS } from '../ui/Input'
import PeoplePicker from '../sis/ui/PeoplePicker'
import { useHelperGivePoints, useHelperPoints } from '../../hooks/api/useSisPoints'

/**
 * "Give points" for a points helper (ticket 0f401a62, Apogee Cache Valley:
 * "we do have a studio leader each session that tracks points"). A student
 * the school's admins named on the staff Points page ticks other students,
 * taps one of the school's give buttons ("Daily job +5"), and is done; a
 * custom amount needs a reason and stays under the server's per-entry limit.
 *
 * Shown on the student's Points page and on the classroom tablet. The server
 * decides who is a helper and refuses everyone else; a helper only gives
 * (no take, no undo, never to themselves), and a coach sees every entry as
 * "Given by <helper>" and can undo it.
 */

const signed = (n) => (n > 0 ? `+${n}` : `${n}`)

const fmtWhen = (iso) => new Date(iso).toLocaleString(undefined, {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
})

export default function GivePointsPanel() {
  const board = useHelperPoints()
  const give = useHelperGivePoints()
  const [selected, setSelected] = useState(() => new Set())
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(null)

  if (board.isError) {
    return <p className="text-sm text-neutral-500">Could not load the students. Try again in a moment.</p>
  }
  const data = board.data
  if (!data) return <p className="text-sm text-neutral-500">Loading…</p>

  const students = data.students || []
  const max = data.max_amount || 10
  const allSelected = students.length > 0 && students.every((s) => selected.has(s.student_id))

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const apply = async (key, value, why) => {
    if (selected.size === 0) return
    setBusy(key)
    try {
      await give.mutateAsync({ student_ids: [...selected], amount: value, reason: why })
      const who = selected.size === 1 ? '1 student' : `${selected.size} students`
      toast.success(`${signed(value)} points to ${who}`)
      setSelected(new Set())
      if (key === 'custom') { setAmount(''); setReason('') }
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not give the points')
    } finally {
      setBusy(null)
    }
  }

  const n = parseInt(amount, 10) || 0
  const customReady = selected.size > 0 && n > 0 && n <= max && reason.trim()

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="text-sm text-neutral-700">
          {selected.size === 0 ? 'Tick students, then tap what they did.' : `${selected.size} selected`}
        </div>
        <div className="flex flex-wrap gap-2">
          {(data.buttons || []).map((b) => (
            <Button key={b.id || b.label} size="sm" onClick={() => apply(`btn-${b.label}`, b.amount, b.label)}
              loading={busy === `btn-${b.label}`} disabled={selected.size === 0 || Boolean(busy)}>
              {b.label} {signed(b.amount)}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${INLINE_INPUT_CLASS} w-20`} type="number" min={1} max={max} value={amount}
            placeholder="5" aria-label="Points to give" onChange={(e) => setAmount(e.target.value)} />
          <input className={`${INLINE_INPUT_CLASS} flex-1 min-w-[10rem]`} value={reason} maxLength={200}
            placeholder="What for" aria-label="What for" onChange={(e) => setReason(e.target.value)} />
          <Button size="sm" onClick={() => apply('custom', n, reason.trim())} loading={busy === 'custom'}
            disabled={!customReady || Boolean(busy)}>
            Give
          </Button>
        </div>
        <p className="text-xs text-neutral-500">
          Up to {max} points at a time. You cannot give points to yourself. A coach can undo a mistake.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <PeoplePicker
          people={students}
          selected={selected}
          onToggle={toggle}
          getId={(s) => s.student_id}
          searchLabel="Search students"
          placeholder="Search students"
          emptyLabel="No other students yet."
          maxHeight="max-h-96"
          renderTrailing={(s) => (
            <span className="text-sm font-semibold text-neutral-700 tabular-nums" aria-label={`${s.name} balance`}>
              {s.balance}
            </span>
          )}
          actions={students.length > 0 && (
            <Button size="sm" variant="secondary"
              onClick={() => setSelected(allSelected ? new Set() : new Set(students.map((s) => s.student_id)))}>
              {allSelected ? 'Clear' : 'Select all'}
            </Button>
          )}
        />
      </div>

      {(data.recent || []).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 mb-2">What you gave lately</h3>
          <ul className="bg-white rounded-xl border border-gray-200 px-4 divide-y divide-gray-100">
            {data.recent.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block text-sm text-neutral-900 truncate">
                    <span className="font-medium">{e.student_name}: </span>{e.reason}
                  </span>
                  <span className="block text-xs text-neutral-500">{fmtWhen(e.created_at)}</span>
                </span>
                <span className="text-sm font-semibold text-green-700">{signed(e.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

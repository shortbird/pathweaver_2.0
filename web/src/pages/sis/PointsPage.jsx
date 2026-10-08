import React, { useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import Button from '../../components/ui/Button'
import ModalOverlay from '../../components/ui/ModalOverlay'
import { INLINE_INPUT_CLASS } from '../../components/ui/Input'
import { useSisOrg } from './useSisOrg'
import {
  useAddPoints, useSavePointButtons, useSisPoints, useSisPointsHistory, useUndoPoints,
} from '../../hooks/api/useSisPoints'

/**
 * Points — staff give points for jobs and take them for perks, and each
 * student carries a balance (Apogee Cache Valley's ClassDojo, 2026-10-08).
 * Tick students, then click a quick button ("Daily job +5") or enter an
 * amount and a reason. The server keeps the ledger and refuses a take that
 * would leave anyone below zero; nothing here computes a balance.
 */

const field = INLINE_INPUT_CLASS

export const signed = (n) => (n > 0 ? `+${n}` : `${n}`)

const fmtWhen = (iso) => new Date(iso).toLocaleString(undefined, {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
})

const EntryRow = ({ entry, showName, onUndo, undoing }) => (
  <li className="flex items-center justify-between gap-3 py-2">
    <span className="min-w-0">
      <span className="block text-sm text-neutral-900 truncate">
        {showName && <span className="font-medium">{entry.student_name}: </span>}
        {entry.reason}
      </span>
      <span className="block text-xs text-neutral-500">
        {fmtWhen(entry.created_at)}
        {entry.source === 'bounty' ? ' · from a bounty' : entry.created_by_name ? ` · ${entry.created_by_name}` : ''}
      </span>
    </span>
    <span className="flex items-center gap-3 shrink-0">
      <span className={`text-sm font-semibold ${entry.amount > 0 ? 'text-green-700' : 'text-amber-700'}`}>
        {signed(entry.amount)}
      </span>
      {onUndo && (
        <Button variant="secondary" size="sm" onClick={() => onUndo(entry)} loading={undoing === entry.id}
          disabled={Boolean(undoing)}>
          Undo
        </Button>
      )}
    </span>
  </li>
)

const HistoryModal = ({ student, orgId, onClose, onUndo, undoing }) => {
  const history = useSisPointsHistory(orgId, student.student_id)
  const data = history.isError ? { entries: [] } : (history.data || null)

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">{student.name}</h2>
            <div className="text-sm text-neutral-500">
              {student.balance} points now · {student.earned} earned · {student.spent} spent
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
        </div>
        {data === null && <p className="text-neutral-500">Loading…</p>}
        {data && data.entries.length === 0 && <p className="text-neutral-500">No points yet.</p>}
        {data && data.entries.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {data.entries.map((e) => <EntryRow key={e.id} entry={e} onUndo={onUndo} undoing={undoing} />)}
          </ul>
        )}
      </div>
    </ModalOverlay>
  )
}

const ButtonsModal = ({ buttons, orgId, onClose }) => {
  const [rows, setRows] = useState(() => buttons.map((b) => ({ label: b.label, amount: String(b.amount) })))
  const saveButtons = useSavePointButtons(orgId)

  const set = (i, patch) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const save = async () => {
    try {
      await saveButtons.mutateAsync(
        rows.filter((r) => r.label.trim()).map((r) => ({ label: r.label.trim(), amount: Number(r.amount) })),
      )
      toast.success('Buttons saved')
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save the buttons')
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg p-6">
        <h2 className="text-xl font-bold text-neutral-900 mb-1">Quick buttons</h2>
        <p className="text-sm text-neutral-500 mb-4">
          A positive amount gives points, like a daily job. A negative amount takes them, like a park trip.
        </p>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={`${field} flex-1`} value={r.label} placeholder="Daily job" aria-label="Button label"
                onChange={(e) => set(i, { label: e.target.value })} />
              <input className={`${field} w-24`} type="number" value={r.amount} aria-label="Button amount"
                onChange={(e) => set(i, { amount: e.target.value })} />
              <Button variant="secondary" size="sm" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                aria-label={`Remove ${r.label || 'button'}`}>
                Remove
              </Button>
            </div>
          ))}
        </div>
        <Button variant="secondary" size="sm" className="mt-3"
          onClick={() => setRows((rs) => [...rs, { label: '', amount: '5' }])} disabled={rows.length >= 12}>
          Add a button
        </Button>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saveButtons.isPending}>Save buttons</Button>
        </div>
      </div>
    </ModalOverlay>
  )
}

const PointsPage = () => {
  const { orgId } = useSisOrg()
  const board = useSisPoints(orgId)
  const addPoints = useAddPoints(orgId)
  const undoPoints = useUndoPoints(orgId)
  const [selected, setSelected] = useState(() => new Set())
  const [search, setSearch] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(null)
  const [undoing, setUndoing] = useState(null)
  const [historyId, setHistoryId] = useState(null)
  const [editingButtons, setEditingButtons] = useState(false)

  const data = board.isError ? { students: [], buttons: [], recent: [] } : (board.data || null)

  const students = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data?.students || []).filter((s) => !q || (s.name || '').toLowerCase().includes(q))
  }, [data, search])

  const allShownSelected = students.length > 0 && students.every((s) => selected.has(s.student_id))

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const toggleAll = () => setSelected((prev) => {
    const next = new Set(prev)
    students.forEach((s) => (allShownSelected ? next.delete(s.student_id) : next.add(s.student_id)))
    return next
  })

  const apply = async (key, value, why) => {
    if (selected.size === 0) return
    setBusy(key)
    try {
      await addPoints.mutateAsync({ student_ids: [...selected], amount: value, reason: why })
      const who = selected.size === 1 ? '1 student' : `${selected.size} students`
      toast.success(value > 0 ? `${signed(value)} points to ${who}` : `${-value} points taken from ${who}`)
      if (key === 'give' || key === 'take') { setAmount(''); setReason('') }
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save the points')
    } finally {
      setBusy(null)
    }
  }

  const undo = async (entry) => {
    setUndoing(entry.id)
    try {
      await undoPoints.mutateAsync(entry.id)
      toast.success('Undone')
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not undo')
    } finally {
      setUndoing(null)
    }
  }

  const custom = Math.abs(parseInt(amount, 10) || 0)
  const customReady = selected.size > 0 && custom > 0 && reason.trim()
  const historyStudent = data?.students?.find((s) => s.student_id === historyId)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Points</h1>
        {data && (
          <Button variant="secondary" size="sm" onClick={() => setEditingButtons(true)}>Edit quick buttons</Button>
        )}
      </div>

      {data && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 space-y-3">
          <div className="text-sm text-neutral-700">
            {selected.size === 0 ? 'Tick students below, then pick what to give or take.' : `${selected.size} selected`}
          </div>
          <div className="flex flex-wrap gap-2">
            {data.buttons.map((b) => (
              <Button key={b.id || b.label} size="sm" variant={b.amount > 0 ? 'primary' : 'secondary'}
                onClick={() => apply(`btn-${b.label}`, b.amount, b.label)}
                loading={busy === `btn-${b.label}`} disabled={selected.size === 0 || Boolean(busy)}>
                {b.label} {signed(b.amount)}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${field} w-24`} type="number" min={1} value={amount} placeholder="10"
              aria-label="Points" onChange={(e) => setAmount(e.target.value)} />
            <input className={`${field} flex-1 min-w-[12rem]`} value={reason} placeholder="Reason, like Crochet kit"
              aria-label="Reason" onChange={(e) => setReason(e.target.value)} maxLength={200} />
            <Button size="sm" onClick={() => apply('give', custom, reason.trim())}
              loading={busy === 'give'} disabled={!customReady || Boolean(busy)}>
              Give
            </Button>
            <Button size="sm" variant="secondary" onClick={() => apply('take', -custom, reason.trim())}
              loading={busy === 'take'} disabled={!customReady || Boolean(busy)}>
              Take
            </Button>
          </div>
        </div>
      )}

      {data === null && <p className="text-neutral-500">Loading…</p>}
      {data && data.students.length === 0 && (
        <p className="text-neutral-500">No students yet. Students appear here once they join the school.</p>
      )}

      {data && data.students.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={allShownSelected} onChange={toggleAll} />
              Select all
            </label>
            <input className={`${field} ml-auto w-full sm:w-56`} value={search}
              onChange={(e) => setSearch(e.target.value)} placeholder="Search students" aria-label="Search students" />
          </div>
          <ul className="divide-y divide-gray-100">
            {students.map((s) => (
              <li key={s.student_id} className="flex items-center gap-3 px-4 py-3">
                <input type="checkbox" checked={selected.has(s.student_id)} onChange={() => toggle(s.student_id)}
                  aria-label={`Select ${s.name}`} />
                <button type="button" onClick={() => setHistoryId(s.student_id)}
                  className="min-w-0 flex-1 text-left hover:underline">
                  <span className="block text-sm font-medium text-neutral-900 truncate">{s.name}</span>
                </button>
                <span className="text-lg font-bold text-neutral-900 tabular-nums" aria-label={`${s.name} balance`}>
                  {s.balance}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data && data.recent.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-2">Recent</h2>
          <ul className="bg-white rounded-xl border border-gray-200 px-4 divide-y divide-gray-100">
            {data.recent.map((e) => <EntryRow key={e.id} entry={e} showName onUndo={undo} undoing={undoing} />)}
          </ul>
        </div>
      )}

      {historyStudent && (
        <HistoryModal student={historyStudent} orgId={orgId}
          onClose={() => setHistoryId(null)} onUndo={undo} undoing={undoing} />
      )}
      {editingButtons && (
        <ButtonsModal buttons={data.buttons} orgId={orgId} onClose={() => setEditingButtons(false)} />
      )}
    </div>
  )
}

export default PointsPage

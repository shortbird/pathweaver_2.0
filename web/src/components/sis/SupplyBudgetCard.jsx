import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { formatDollars as money } from '../../utils/money'
import { INLINE_INPUT_CLASS } from '../ui/Input'
import { useConfirm } from '../../contexts/ConfirmContext'

/**
 * A class's supply budget: the ceiling, what has been spent, what is left, and
 * the expense log behind the spent figure.
 *
 * Ticket e7a50b4b (iCreate, advisor on /my-classes/<id>): "I would like to see
 * what I have spent on each class supply budget already/how much I have left."
 * The card used to show only on the Roster tab, and its spend came only from
 * supply requests, which were retired on 2026-09-24 -- so it could never
 * answer the question. Now it sits above every tab, and a teacher writes down
 * what they bought here.
 *
 * The office opens this same page from the Classes table, so it sees the same
 * card, with every entry editable. A teacher edits only the lines they added
 * (`can_edit` comes from the server, which enforces the same rule).
 *
 * The ceiling wording stays "up to": the school asked for it so teachers do not
 * read the number as money they are expected to spend.
 */

const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const ExpenseForm = ({ initial, onSubmit, onCancel, busy, submitLabel = 'Add expense' }) => {
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '')
  const [description, setDescription] = useState(initial?.description || '')
  const [spentOn, setSpentOn] = useState(initial?.spent_on || localToday())
  const submit = (e) => {
    e.preventDefault()
    onSubmit({ amount, description: description.trim(), spent_on: spentOn })
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 mt-2" data-expense-form>
      <label className="text-xs text-neutral-600">
        <span className="block mb-0.5">Amount</span>
        <input type="number" min="0.01" step="0.01" inputMode="decimal" required
          aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)}
          className={`${INLINE_INPUT_CLASS} w-24`} placeholder="12.50" />
      </label>
      <label className="text-xs text-neutral-600 flex-1 min-w-[160px]">
        <span className="block mb-0.5">What</span>
        <input type="text" maxLength={200} required aria-label="What you bought"
          value={description} onChange={(e) => setDescription(e.target.value)}
          className={`${INLINE_INPUT_CLASS} w-full`} placeholder="Clay, glaze, paper..." />
      </label>
      <label className="text-xs text-neutral-600">
        <span className="block mb-0.5">Date</span>
        <input type="date" required aria-label="Date spent" value={spentOn}
          onChange={(e) => setSpentOn(e.target.value)} className={INLINE_INPUT_CLASS} />
      </label>
      <button type="submit" disabled={busy}
        className="px-3 py-1.5 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
        {busy ? 'Saving…' : submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="text-sm text-neutral-500 hover:underline">
          Cancel
        </button>
      )}
    </form>
  )
}

const SupplyBudgetCard = ({ classId, orgId, budget, onChanged, readOnly = false }) => {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const confirm = useConfirm()

  if (!budget) return null
  const expenses = budget.expenses || []
  const legacy = budget.transactions || []
  // Nothing to show for a class with no budget and no spend.
  if (!(budget.total > 0) && !expenses.length && !legacy.length) return null

  const base = `/api/sis/teacher/classes/${classId}/supply-expenses`
  const run = async (fn, okText) => {
    setBusy(true)
    try {
      await fn()
      toast.success(okText)
      setAdding(false); setEditing(null)
      onChanged && onChanged()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save that')
    } finally { setBusy(false) }
  }
  const add = (body) => run(() => api.post(withOrg(base, orgId), body), 'Expense added')
  const save = (id, body) => run(() => api.patch(withOrg(`${base}/${id}`, orgId), body), 'Expense saved')
  const remove = async (id) => {
    if (!(await confirm('Delete this expense?'))) return
    run(() => api.delete(withOrg(`${base}/${id}`, orgId)), 'Expense deleted')
  }

  const over = budget.remaining < 0
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 mb-6" data-supply-budget>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="text-sm text-neutral-600">
          Supply budget: <span className="font-semibold text-neutral-900">up to {money(budget.total)}</span> this year
        </p>
        <p className="text-sm text-neutral-600">
          Spent <span className="font-semibold text-neutral-900" data-spent>{money(budget.spent)}</span>
        </p>
        <p className="text-sm text-neutral-600">
          <span className={`font-semibold ${over ? 'text-red-600' : 'text-neutral-900'}`} data-left>
            {money(Math.abs(budget.remaining))}
          </span>
          {over ? ' over' : ' left'}
        </p>
        {budget.committed > budget.spent && (
          <p className="text-xs text-neutral-500">
            {money(budget.committed - budget.spent)} in older requests not settled yet
          </p>
        )}
      </div>
      <p className="text-xs text-neutral-400 mt-1">
        {budget.students} student{budget.students === 1 ? '' : 's'}
        {budget.supply_fee_per_student > 0 && ` · $${budget.supply_fee_per_student} supply fee each`}
        {budget.allowance_per_student > 0 && ` · $${budget.allowance_per_student} each from tuition`}
        {budget.frozen
          ? ` · fixed at the roster on ${budget.as_of}`
          : ' · updates as students enroll until the first day of school'}
      </p>

      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="mt-2 text-xs font-medium text-optio-purple hover:underline">
        {open ? 'Hide expenses' : `Expenses (${expenses.length + legacy.length})`}
      </button>

      {open && (
        <div className="mt-2">
          {!expenses.length && !legacy.length && (
            <p className="text-xs text-neutral-500">Nothing spent yet.</p>
          )}
          {expenses.length > 0 && (
            <ul className="divide-y divide-gray-100" data-expense-list>
              {expenses.map((e) => (
                <li key={e.id} className="py-1.5">
                  {editing === e.id ? (
                    <ExpenseForm initial={e} busy={busy} submitLabel="Save"
                      onSubmit={(body) => save(e.id, body)} onCancel={() => setEditing(null)} />
                  ) : (
                    <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
                      <span className="text-neutral-400 text-xs w-20 shrink-0">{e.spent_on}</span>
                      <span className="text-neutral-800 flex-1 min-w-0">{e.description}</span>
                      <span className="font-medium text-neutral-900">{money(e.amount)}</span>
                      {e.can_edit && !readOnly && (
                        <span className="flex gap-2">
                          <button type="button" onClick={() => setEditing(e.id)}
                            className="text-xs text-optio-purple hover:underline">Edit</button>
                          <button type="button" onClick={() => remove(e.id)} disabled={busy}
                            className="text-xs text-red-600 hover:underline disabled:opacity-50">Delete</button>
                        </span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {legacy.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-neutral-500">Older supply requests</p>
              <ul className="mt-1 space-y-1">
                {legacy.map((t) => (
                  <li key={t.id} className="text-xs flex items-baseline gap-2">
                    <span className="text-neutral-700">{t.title}</span>
                    <span className="text-neutral-500">
                      {t.amount != null ? money(t.amount) : 'no amount'}
                    </span>
                    <span className="text-neutral-400">{t.status === 'resolved' ? 'settled' : 'pending'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!readOnly && (adding ? (
            <ExpenseForm busy={busy} onSubmit={add} onCancel={() => setAdding(false)} />
          ) : (
            <button type="button" onClick={() => setAdding(true)}
              className="mt-2 text-sm font-medium text-optio-purple hover:underline">
              + Add expense
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default SupplyBudgetCard

import React, { useState } from 'react'
import { PRICE_TEXT } from '@shared/generated/pricing'
import { useAddStudentCredits, useStudentCreditBank } from '../../hooks/api/useCreditBank'

// A student's credit bank (services/credit_bank_service.py): credits banked
// (OpenEd's year, paid tuition months, accelerated purchases), credits credit
// review has used since they enrolled, and what is left. Shared by the SIS
// student record and the family group dashboard; each passes its own `onAdd`,
// which posts to its own endpoint.
//
// The purchase types name their price, from the price list: OpenEd's manager
// enters orders bought at OpenEd's prices (Tanner, 2026-10-13). This page is
// hers, not a family's; OpenEd families still never see a price.

const KIND_LABELS = {
  included: 'Included with enrollment',
  monthly: 'Tuition month',
  accelerated: 'Accelerated credits',
  prior_learning: 'Prior learning',
  adjustment: 'Correction',
}

/** OpenEd's manager: the two things OpenEd sells, at OpenEd's prices. */
export const OPENED_CREDIT_TYPES = [
  { kind: 'accelerated', label: `Accelerated (${PRICE_TEXT.acceleratedHalfCredit} per 0.5 credits)` },
  { kind: 'prior_learning', label: `Prior learning (${PRICE_TEXT.licensedHalfCredit} per 0.5 credits)` },
]

/** Optio staff: the same purchases, plus a correction for mistakes. A family's
 *  prior learning price depends on their school, so it is not named here. */
export const STAFF_CREDIT_TYPES = [
  { kind: 'accelerated', label: `Accelerated (${PRICE_TEXT.acceleratedHalfCredit} per 0.5 credits)` },
  { kind: 'prior_learning', label: 'Prior learning' },
  { kind: 'adjustment', label: 'Correction' },
]

export const formatCredits = (value) => {
  const n = Number(value || 0)
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '')
}

const formatDate = (value) => {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function CreditBalance({ credits }) {
  if (!credits) return <span className="text-gray-400">-</span>
  const owed = credits.balance < 0
  return (
    <span className={owed ? 'text-red-600 font-medium' : 'text-gray-900'}>
      {owed ? `${formatCredits(-credits.balance)} owed` : `${formatCredits(credits.balance)} left`}
    </span>
  )
}

export default function CreditBankPanel({ credits, onAdd, orderLabel = 'Order number', types = STAFF_CREDIT_TYPES }) {
  const [kind, setKind] = useState(types[0].kind)
  const [amount, setAmount] = useState('1')
  const [order, setOrder] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  if (!credits) return <p className="text-sm text-gray-500">Loading credits...</p>

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const signed = kind === 'adjustment' ? amount : String(Math.abs(Number(amount)))
      await onAdd({ kind, credits: signed, order_reference: order, note })
      setOrder('')
      setNote('')
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not add the credits')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Banked', formatCredits(credits.banked)],
          ['Used', formatCredits(credits.used)],
          [credits.balance < 0 ? 'Owed' : 'Left', formatCredits(Math.abs(credits.balance))],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-gray-200 px-4 py-3">
            <div className={`text-2xl font-semibold ${label === 'Owed' ? 'text-red-600' : 'text-gray-900'}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label} credits</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        A credit is used when credit review approves it
        {credits.since ? `, counting from ${formatDate(credits.since)}` : ''}.
      </p>

      <form onSubmit={submit} className="rounded-lg bg-gray-50 border border-gray-200 p-4 space-y-3">
        <div className="text-sm font-medium text-gray-900">Add credits</div>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            <span className="block text-xs text-gray-500 mb-1">Type</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white">
              {types.map(t => <option key={t.kind} value={t.kind}>{t.label}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-xs text-gray-500 mb-1">Credits</span>
            <input type="number" step="0.5" min={kind === 'adjustment' ? undefined : '0.5'} value={amount}
              onChange={(e) => setAmount(e.target.value)} aria-label="Credits"
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-24" />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-gray-500 mb-1">{orderLabel}</span>
            <input value={order} onChange={(e) => setOrder(e.target.value)} aria-label={orderLabel}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-40" />
          </label>
          <label className="text-sm flex-1 min-w-[12rem]">
            <span className="block text-xs text-gray-500 mb-1">
              Note{kind === 'adjustment' ? ' (say why)' : ''}
            </span>
            <input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note"
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-full" />
          </label>
        </div>
        {kind === 'adjustment' && (
          <p className="text-xs text-gray-500">Use a negative number to take credits away.</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={saving} className="btn-primary text-sm disabled:opacity-50">
          {saving ? 'Adding...' : 'Add credits'}
        </button>
      </form>

      <div>
        <div className="text-sm font-medium text-gray-900 mb-2">History</div>
        {credits.entries.length === 0 ? (
          <p className="text-sm text-gray-500">No credits banked yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {credits.entries.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                <div>
                  <div className="text-gray-900">{KIND_LABELS[e.kind] || e.kind}</div>
                  <div className="text-xs text-gray-500">{[formatDate(e.created_at), e.note].filter(Boolean).join(' · ')}</div>
                </div>
                <div className={`font-medium whitespace-nowrap ${e.credits < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {e.credits > 0 ? '+' : ''}{formatCredits(e.credits)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** The Credits tab on the SIS student record. */
export function SisStudentCredits({ studentId }) {
  const { data: credits, isError } = useStudentCreditBank(studentId)
  const add = useAddStudentCredits(studentId)
  if (isError) return <p className="text-sm text-red-600">Could not load credits</p>
  return <CreditBankPanel credits={credits} onAdd={(body) => add.mutateAsync(body)} />
}

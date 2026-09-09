/**
 * Extracted from sis/BillingPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import Button from '../../../components/ui/Button'
import api from '../../../services/api'
import { toast } from 'react-hot-toast'
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import field from './field'
import money from './money'
import today from './today'
import PAYMENT_METHODS from './PAYMENT_METHODS'
import Modal from './Modal'

const RecordPaymentModal = ({ orgId, row, onClose, onSaved }) => {
  const balance = row.balance_cents ?? ((row.total_cents || 0) - (row.amount_paid_cents || 0))
  const [amount, setAmount] = useState((balance / 100).toFixed(2))
  const [method, setMethod] = useState('zelle')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const amount_cents = Math.round(parseFloat(amount) * 100)
    if (!amount_cents || amount_cents <= 0) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    try {
      await api.post(`/api/sis/invoices/${row.invoice_id}/payments`, {
        organization_id: orgId,
        amount_cents,
        method,
        note: note.trim() || (date ? `Paid ${date}` : null),
      })
      toast.success('Payment recorded')
      onSaved()
    } catch { toast.error('Could not record payment') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Record payment" onClose={onClose}>
      <p className="text-sm text-neutral-500 mb-3">
        {row.family_name || 'Family'}{row.student_name ? ` · ${row.student_name}` : ''} — {row.description || 'Charge'}
      </p>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Amount ($)</label>
            <input className={field} type="number" min="0" step="0.01"
              value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Method</label>
            <select className={field} value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Date</label>
          <input className={field} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {/* Read-only: a card fee is part of the bill, not part of recording a
            payment against it. Editing it lives on the invoice. */}
        {(row.processing_fee_cents || 0) > 0 && (
          <p className="text-xs text-neutral-500">
            This invoice carries a {money(row.processing_fee_cents)} card processing fee, included
            in the {money(balance)} balance.
          </p>
        )}
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Note (optional)</label>
          <input className={field} placeholder="Reference #, scholarship name…"
            value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Record payment'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Record refund ────────────────────────────────────────────────────────────
// iCreate, 2026-08-20: "If I gave someone a tuition refund, how would I notate
// that?" A refund is a reversing entry — a negative payment record — so the
// ledger, the receipt and the balance all move together and the original
// payment row keeps matching the receipt the family already has.

export default RecordPaymentModal

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
import PAYMENT_METHODS from './PAYMENT_METHODS'
import Modal from './Modal'

const RecordRefundModal = ({ orgId, row, onClose, onSaved }) => {
  const paid = row.amount_paid_cents || 0
  const [amount, setAmount] = useState((paid / 100).toFixed(2))
  const [method, setMethod] = useState('zelle')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const amount_cents = Math.round(parseFloat(amount) * 100)
    if (!amount_cents || amount_cents <= 0) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    try {
      await api.post(`/api/sis/invoices/${row.invoice_id}/refunds`, {
        organization_id: orgId,
        amount_cents,
        method,
        note: note.trim() || null,
      })
      toast.success('Refund recorded')
      onSaved()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not record the refund') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Record refund" onClose={onClose}>
      <p className="text-sm text-neutral-500 mb-3">
        {row.family_name || 'Family'}{row.student_name ? ` · ${row.student_name}` : ''} — {row.description || 'Charge'}
        {' · '}{money(paid)} paid
      </p>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Amount returned ($)</label>
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
          <label className="block text-xs font-medium text-neutral-500 mb-1">Note (optional)</label>
          <input className={field} placeholder="Why the money went back…"
            value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <p className="text-xs text-neutral-500">
          The refunded amount reopens on the invoice balance. If the family no longer owes it,
          also edit or void the invoice so it doesn't show as outstanding.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Record refund'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── The invoice the family was sent ──────────────────────────────────────────
//
// Chasing a payment starts with "what did we actually send them?", and until
// 2026-08-06 there was no way to answer it from this page — the outstanding row
// gave a family, an amount and nothing else. This renders the same branded
// document the family sees in their portal, off the same endpoint, so the office
// and the parent are looking at one artifact rather than two summaries.
//
// It also edits and voids, because until 2026-08-19 an invoice sent for the
// wrong amount could only be answered with a SECOND invoice — leaving the
// family holding two bills for one term.

export default RecordRefundModal

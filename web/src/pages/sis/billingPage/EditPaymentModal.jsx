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

/**
 * iCreate, 2026-08-14: "I accidentally chose the wrong form of payment for
 * Simon Hamberger and can see no way to edit that."
 *
 * Method, reference and note only — deliberately not the amount. Those three
 * describe the payment; nothing recomputes from them, so fixing one cannot move
 * a balance or flip an invoice's status. A wrong amount needs a reversing entry
 * rather than a rewrite, and does not exist yet.
 */
const EditPaymentModal = ({ orgId, payment, onClose, onSaved }) => {
  const [method, setMethod] = useState(payment.method || 'zelle')
  const [ref, setRef] = useState(payment.external_ref || '')
  const [note, setNote] = useState(payment.note || '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      await api.patch(`/api/sis/payments/${payment.id}`, {
        organization_id: orgId, method, external_ref: ref, note,
      })
      toast.success('Payment updated')
      onSaved()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not update the payment') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Correct payment" onClose={onClose}>
      <p className="text-sm text-neutral-500 mb-3">
        {payment.family_name || 'Family'}{payment.student_name ? ` · ${payment.student_name}` : ''}
        {' — '}{money(payment.amount_cents)} recorded
        {payment.recorded_at ? ` ${String(payment.recorded_at).slice(0, 10)}` : ''}
      </p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Method</label>
          <select className={field} aria-label="Method"
            value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Reference (optional)</label>
          <input className={field} aria-label="Reference" placeholder="Check #, transfer ID…"
            value={ref} onChange={(e) => setRef(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Note (optional)</label>
          <input className={field} aria-label="Note" placeholder="Scholarship name, what it covers…"
            value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <p className="text-xs text-neutral-500">
          The amount can't be changed here — recording a correcting payment is the way to fix one,
          so the ledger keeps matching the receipt the family already has.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </Modal>
  )
}


// ── Record payment ───────────────────────────────────────────────────────────

export default EditPaymentModal

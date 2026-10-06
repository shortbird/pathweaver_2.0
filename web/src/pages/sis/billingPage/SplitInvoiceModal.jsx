/**
 * Split one unpaid invoice into two (ticket eacb3356, iCreate: "invoice for
 * half now and half in January ... ability to have multiple invoices").
 *
 * A family reimbursed per bill (a scholarship program, an ESA) has to hand in
 * one invoice per payment period. This invoice keeps its number and the first
 * amount; a new invoice carries the rest. Each line is shared in proportion and
 * labelled "(1 of 2)" / "(2 of 2)" by the server, so both bills still say what
 * they are for.
 *
 * The server refuses a void or paid invoice, one with any payment on it, one
 * with a payment plan or autopay, and one with a card fee. Its message is shown
 * as it is.
 */

import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import Button from '../../../components/ui/Button'
import api from '../../../services/api'
import { Modal } from '../../../components/ui'
import INPUT_CLASS from './field'
import money from './money'

const toCents = (str) => {
  const n = parseFloat(str)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

const SplitInvoiceModal = ({ invoiceId, orgId, doc, onCancel, onSaved }) => {
  const balance = doc.amount_due_cents ?? ((doc.total_cents || 0) - (doc.amount_paid_cents || 0))
  const [firstStr, setFirstStr] = useState(((Math.ceil(balance / 2)) / 100).toFixed(2))
  const [firstDue, setFirstDue] = useState(doc.due_date ? String(doc.due_date).slice(0, 10) : '')
  const [secondDue, setSecondDue] = useState('')
  const [saving, setSaving] = useState(false)

  const first = toCents(firstStr)
  const second = balance - first
  const amountOk = first > 0 && first < balance

  const save = async () => {
    if (!amountOk) { toast.error(`The first amount must be more than $0 and less than ${money(balance)}`); return }
    if (!secondDue) { toast.error('Pick a due date for the second invoice'); return }
    setSaving(true)
    try {
      const r = await api.post(`/api/sis/invoices/${invoiceId}/split`, {
        organization_id: orgId,
        first_amount_cents: first,
        first_due_date: firstDue || null,
        second_due_date: secondDue,
      })
      const number = r.data?.second_invoice?.invoice_number
      toast.success(number ? `Invoice split. The rest is on ${number}.` : 'Invoice split')
      onSaved()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not split the invoice')
    } finally { setSaving(false) }
  }

  return (
    <Modal isOpen size="sm" title={`Split ${doc.invoice_number || 'invoice'}`} onClose={onCancel}>
      <p className="text-xs text-neutral-500 mb-3">
        This invoice keeps its number and the first amount. A new invoice for the rest goes
        to the same family. Each class is shared between the two, marked (1 of 2) and (2 of 2).
      </p>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="text-neutral-700">First amount (this invoice)</span>
          <input className={INPUT_CLASS} type="number" min="0" step="0.01"
            value={firstStr} onChange={(e) => setFirstStr(e.target.value)}
            aria-label="First amount" />
        </label>
        <label className="block">
          <span className="text-neutral-700">First due date</span>
          <input className={INPUT_CLASS} type="date" value={firstDue}
            onChange={(e) => setFirstDue(e.target.value)} aria-label="First due date" />
        </label>
        <label className="block">
          <span className="text-neutral-700">Second due date (new invoice)</span>
          <input className={INPUT_CLASS} type="date" value={secondDue}
            onChange={(e) => setSecondDue(e.target.value)} aria-label="Second due date" />
        </label>
        <div className="border-t border-gray-100 pt-2 space-y-1 text-neutral-700">
          <div className="flex justify-between"><span>Balance now</span><span>{money(balance)}</span></div>
          <div className="flex justify-between"><span>This invoice</span><span>{amountOk ? money(first) : '—'}</span></div>
          <div className="flex justify-between"><span>New invoice</span><span>{amountOk ? money(second) : '—'}</span></div>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving || !amountOk || !secondDue}>
          {saving ? 'Splitting…' : 'Split invoice'}
        </Button>
      </div>
    </Modal>
  )
}

export default SplitInvoiceModal

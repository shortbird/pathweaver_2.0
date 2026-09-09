/**
 * Extracted from sis/BillingPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import Button from '../../../components/ui/Button'
import api from '../../../services/api'
import { toast } from 'react-hot-toast'
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import money from './money'
import Modal from './Modal'

const EditInvoiceModal = ({ invoiceId, orgId, doc, onCancel, onSaved }) => {
  const [lines, setLines] = useState(() => (doc.line_items || []).map((li) => ({
    description: li.description || '',
    amountStr: ((li.amount_cents || 0) / 100).toFixed(2),
    class_id: li.class_id || null,
    kind: li.kind || null,
  })))
  const [discountStr, setDiscountStr] = useState(((doc.discount_cents || 0) / 100).toFixed(2))
  const [dueDate, setDueDate] = useState(doc.due_date ? String(doc.due_date).slice(0, 10) : '')
  const [saving, setSaving] = useState(false)

  const toCents = (str) => {
    const n = parseFloat(str)
    return Number.isFinite(n) ? Math.round(n * 100) : 0
  }
  const subtotal = lines.reduce((s, l) => s + toCents(l.amountStr), 0)
  const discount = Math.max(0, Math.min(toCents(discountStr), subtotal))
  // The card processing fee is one of the lines above — waiving it is deleting
  // that line, not typing into a separate box that the total forgot to include.
  const total = subtotal - discount

  const setLine = (i, patch) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))

  const save = async () => {
    const kept = lines.filter((l) => l.description.trim() || toCents(l.amountStr))
    if (!kept.length) { toast.error('An invoice needs at least one line'); return }
    // Same rule as the tuition approver: a line carrying money is never dropped
    // quietly just because it has no label.
    const unlabelled = kept.find((l) => !l.description.trim())
    if (unlabelled) { toast.error(`Name the ${money(toCents(unlabelled.amountStr))} line first`); return }
    setSaving(true)
    try {
      await api.patch(`/api/sis/invoices/${invoiceId}`, {
        organization_id: orgId,
        line_items: kept.map((l) => ({
          description: l.description.trim(),
          amount_cents: toCents(l.amountStr),
          class_id: l.class_id,
          kind: l.kind,
        })),
        discount_cents: discount,
        due_date: dueDate || null,
      })
      toast.success('Invoice updated')
      onSaved()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not update the invoice')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={`Edit ${doc.invoice_number || 'invoice'}`} onClose={onCancel}>
      <p className="text-xs text-neutral-500 mb-3">
        The invoice number stays the same, so the family&rsquo;s copy and yours still match.
      </p>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
              placeholder="Class or fee" value={l.description}
              onChange={(e) => setLine(i, { description: e.target.value })}
              aria-label={`Line ${i + 1} description`}
            />
            <input
              className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-optio-purple"
              type="number" min="0" step="0.01" value={l.amountStr}
              onChange={(e) => setLine(i, { amountStr: e.target.value })}
              aria-label={`Line ${i + 1} amount`}
            />
            <button className="w-6 text-neutral-400 hover:text-red-500 text-lg"
              onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
              aria-label={`Remove line ${i + 1}`}>×</button>
          </div>
        ))}
        <button className="text-sm text-optio-purple font-medium hover:underline"
          onClick={() => setLines((ls) => [...ls, { description: '', amountStr: '0.00', class_id: null, kind: 'fee' }])}>
          + Add line
        </button>
      </div>

      <div className="mt-4 space-y-2 border-t border-gray-100 pt-3 text-sm">
        <div className="flex justify-between text-neutral-600">
          <span>Subtotal</span><span>{money(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-neutral-600">
          <span>Discount ($)</span>
          <input className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-optio-purple"
            type="number" min="0" step="0.01" value={discountStr}
            onChange={(e) => setDiscountStr(e.target.value)} aria-label="Discount" />
        </div>
        <div className="flex items-center justify-between gap-3 text-neutral-600">
          <span>Due date</span>
          <input className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
            type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Due date" />
        </div>
        <div className="flex justify-between font-semibold text-neutral-900 pt-1">
          <span>Total</span><span>{money(total)}</span>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save invoice'}</Button>
      </div>
    </Modal>
  )
}

// ── Receipt (printable) ──────────────────────────────────────────────────────

export default EditInvoiceModal

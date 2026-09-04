/**
 * Extracted from sis/BillingPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import Button from '../../../components/ui/Button'
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import api from '../../../services/api'
import { toast } from 'react-hot-toast'
import { useSisOrg, withOrg } from '../useSisOrg'
import EditPaymentModal from './EditPaymentModal'
import EditInvoiceModal from './EditInvoiceModal'
import money from './money'
import METHOD_LABEL from './METHOD_LABEL'
import payLabel from './payLabel'
import payAmountCls from './payAmountCls'
import Modal from './Modal'

const InvoiceModal = ({ invoiceId, orgId, onClose, onPrint, onChanged }) => {
  const [doc, setDoc] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  // A paid invoice has no Edit button -- settled money is not an edit. But the
  // METHOD a payment was recorded under is a label, not money, and getting it
  // wrong is the one thing about a settled invoice that does need fixing.
  const [correcting, setCorrecting] = useState(null)

  const load = useCallback(() => {
    api.get(withOrg(`/api/sis/invoices/${invoiceId}/document`, orgId))
      .then((r) => setDoc(r.data?.document || null))
      .catch((e) => setError(e?.response?.data?.error || 'Could not load the invoice'))
  }, [invoiceId, orgId])

  useEffect(() => { load() }, [load])

  const org = doc?.organization || {}
  // A paid invoice is settled and a void one is cancelled; changing either is a
  // refund or a new charge, not an edit.
  const editable = doc && !['paid', 'void'].includes(doc.status)
  const voidable = editable && !doc.amount_paid_cents

  const voidInvoice = async () => {
    try {
      await api.post(`/api/sis/invoices/${invoiceId}/void`, { organization_id: orgId })
      toast.success('Invoice voided')
      onChanged?.()
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not void the invoice')
    }
  }

  if (correcting) {
    return (
      <EditPaymentModal
        orgId={orgId} payment={correcting}
        onClose={() => setCorrecting(null)}
        onSaved={() => { setCorrecting(null); setDoc(null); load(); onChanged?.() }}
      />
    )
  }

  if (editing && doc) {
    return (
      <EditInvoiceModal
        invoiceId={invoiceId} orgId={orgId} doc={doc}
        onCancel={() => setEditing(false)}
        onSaved={() => { setEditing(false); setDoc(null); load(); onChanged?.() }}
      />
    )
  }

  return (
    <Modal title={doc?.invoice_number ? `Invoice ${doc.invoice_number}` : 'Invoice'} onClose={onClose}>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!doc && !error && <p className="text-sm text-neutral-500">Loading…</p>}
      {doc && (
        <div className="print-area">
          <div className="border border-gray-200 rounded-lg p-4 text-sm space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                {org.logo_url && <img src={org.logo_url} alt="" className="h-8 w-auto mb-1" />}
                <div className="font-semibold text-neutral-900">{org.name || 'School'}</div>
                <div className="text-xs text-neutral-500">Tuition invoice</div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-neutral-900">{doc.student_name || '—'}</div>
                {/* .name, not the object: the API returns {name, address} here
                    and rendering the object itself throws in React. */}
                <div className="text-xs text-neutral-500">{doc.family?.name || '—'}</div>
              </div>
            </div>

            <div className="flex justify-between text-xs text-neutral-500 border-t border-gray-100 pt-2">
              <span>{doc.invoice_number || '—'}</span>
              <span className="capitalize">{doc.status || '—'}</span>
              {doc.due_date && <span>Due {String(doc.due_date).slice(0, 10)}</span>}
            </div>

            <div className="space-y-1">
              {(doc.line_items || []).map((li, i) => (
                <div key={i} className="flex justify-between gap-3">
                  <span className="text-neutral-700 min-w-0">{li.description || 'Charge'}</span>
                  <span className="shrink-0">{money(li.amount_cents)}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-2 space-y-1">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal</span><span>{money(doc.subtotal_cents)}</span>
              </div>
              {!!doc.discount_cents && (
                <div className="flex justify-between text-neutral-600">
                  <span>Discount</span><span>−{money(doc.discount_cents)}</span>
                </div>
              )}
              {/* No fee row: the card fee is a line item above, already in the
                  subtotal. Showing it here too reads as a second charge. */}
              <div className="flex justify-between font-semibold text-neutral-900">
                <span>Total</span><span>{money(doc.total_cents)}</span>
              </div>
              {!!doc.amount_paid_cents && (
                <div className="flex justify-between text-green-700">
                  <span>Paid</span><span>−{money(doc.amount_paid_cents)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-neutral-900">
                <span>Amount due</span><span>{money(doc.amount_due_cents)}</span>
              </div>
            </div>

            {!!doc.payments?.length && (
              <div className="border-t border-gray-100 pt-2 space-y-1">
                <div className="text-xs uppercase tracking-wide text-neutral-400">Payments received</div>
                {doc.payments.map((pmt, i) => (
                  <div key={pmt.id || i} className="flex justify-between gap-3">
                    <span className="text-neutral-600 min-w-0">
                      {payLabel(pmt)}
                      {pmt.recorded_at ? ` · ${String(pmt.recorded_at).slice(0, 10)}` : ''}
                      {pmt.external_ref ? ` · ${pmt.external_ref}` : ''}
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className={payAmountCls(pmt)}>{money(pmt.amount_cents)}</span>
                      {pmt.id && (
                        <button className="text-xs text-optio-purple hover:underline no-print"
                          aria-label={`Correct ${METHOD_LABEL[pmt.method] || pmt.method || 'payment'} of ${money(pmt.amount_cents)}`}
                          onClick={() => setCorrecting({
                            ...pmt,
                            family_name: doc.family?.name,
                            student_name: doc.student_name,
                          })}>
                          Correct
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* A UFA family pays through UFA, not by card. Saying so here stops
                somebody chasing a card payment that is never coming. */}
            {doc.funding_label && (
              <p className="text-xs text-neutral-500 border-t border-gray-100 pt-2">
                Funding: {doc.funding_label}
              </p>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2 pt-4 no-print">
        {voidable && (
          <Button size="sm" variant="secondary" onClick={voidInvoice}>Void</Button>
        )}
        {editable && (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
        )}
        <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>
        <Button size="sm" onClick={onPrint} disabled={!doc}>Print</Button>
      </div>
    </Modal>
  )
}

// ── Correct an invoice that was already sent ─────────────────────────────────
//
// Same invoice number, corrected amount. The alternative the office had was to
// send a second invoice, which is what the tuition screen warns about — two
// bills for one term, and no way to tell which one a payment settled.

export default InvoiceModal

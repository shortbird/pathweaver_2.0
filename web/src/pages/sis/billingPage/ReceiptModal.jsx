/**
 * Extracted from sis/BillingPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import Button from '../../../components/ui/Button'
import money from './money'
import METHOD_LABEL from './METHOD_LABEL'
import payLabel from './payLabel'
import Modal from './Modal'

/**
 * The receipt the office prints for a settled invoice.
 *
 * iCreate, 2026-08-20: "Still not seeing where I can alter the receipt/invoice
 * if I marked the wrong payment method?" The correction dialog existed, but only
 * behind the Charge detail tab -- not on the receipt, which is where a wrong
 * method is actually noticed. Every payment on the invoice is listed here now,
 * each with its own Correct link.
 *
 * Listing them all also fixes what the receipt said: it printed the LATEST
 * payment's method as though it were the only one, so an invoice settled by a
 * scholarship and a check receipted as "Check".
 */
const ReceiptModal = ({ row, onClose, onPrint, onCorrect }) => {
  // Older ledger rows (and any caller without the payments list) still have the
  // latest method flattened onto the row -- fall back to it rather than
  // printing a receipt with no method at all.
  const payments = row.payments?.length
    ? row.payments
    : (row.method || row.paid_at
      ? [{ method: row.method, recorded_at: row.paid_at,
           amount_cents: row.amount_paid_cents ?? row.total_cents }]
      : [])

  return (
    <Modal title="Receipt" onClose={onClose}>
      <div className="print-area">
        <div className="border border-gray-200 rounded-lg p-4 text-sm space-y-2">
          <div className="text-lg font-semibold text-neutral-900">Payment receipt</div>
          <div className="flex justify-between"><span className="text-neutral-500">Family</span><span>{row.family_name || '—'}</span></div>
          {row.student_name && (
            <div className="flex justify-between"><span className="text-neutral-500">Student</span><span>{row.student_name}</span></div>
          )}
          <div className="flex justify-between"><span className="text-neutral-500">Charge</span><span>{row.description || '—'}</span></div>

          {payments.length === 0 && (
            <div className="flex justify-between"><span className="text-neutral-500">Method</span><span>—</span></div>
          )}
          {payments.map((pmt, i) => (
            <div key={pmt.id || i} className="flex justify-between gap-3 border-t border-gray-100 pt-2">
              <span className="text-neutral-500">
                {payLabel(pmt)}
                {pmt.recorded_at ? ` · ${String(pmt.recorded_at).slice(0, 10)}` : ''}
                {pmt.external_ref ? ` · ${pmt.external_ref}` : ''}
              </span>
              <span className="flex items-center gap-3 shrink-0">
                <span>{money(pmt.amount_cents)}</span>
                {pmt.id && onCorrect && (
                  <button className="text-xs text-optio-purple hover:underline no-print"
                    aria-label={`Correct ${METHOD_LABEL[pmt.method] || pmt.method || 'payment'} of ${money(pmt.amount_cents)}`}
                    onClick={() => onCorrect({ ...pmt, family_name: row.family_name, student_name: row.student_name })}>
                    Correct
                  </button>
                )}
              </span>
            </div>
          ))}

          <div className="flex justify-between border-t border-gray-100 pt-2 font-medium">
            <span>Amount paid</span><span>{money(row.amount_paid_cents || row.total_cents)}</span>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4 no-print">
        <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>
        <Button size="sm" onClick={onPrint}>Print</Button>
      </div>
    </Modal>
  )
}

export default ReceiptModal

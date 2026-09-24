import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import Button from '../components/ui/Button'
import { ChevronDownIcon, CreditCardIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import { formatCents as money } from '../utils/money'
import { methodLabel } from './sis/billingPage/payLabel'

/**
 * Billing — a family's account balance with their school: invoices (line items
 * + installment schedules), payments recorded by the school, printable receipts
 * (for scholarship reimbursement) and a printable statement. Optio never
 * processes payments; the school records money collected by Zelle/scholarship.
 */
// Due dates and installment dates arrive as plain YYYY-MM-DD. `new Date` reads
// those as UTC midnight, which in every US timezone is the evening before — a
// September 1 due date printed as August 31. Build them from their parts.
const shortDate = (iso) => {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
const FUNDING_LABELS = {
  ufa: 'UFA', ufa_private: 'UFA – Private School',
  private_pay: 'Private Pay', other: 'Other',
}
const STATUS_STYLES = {
  sent: 'bg-blue-100 text-blue-700', partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700',
  void: 'bg-neutral-100 text-gray-400',
}
const STATUS_LABELS = {
  sent: 'Open', partial: 'Partially paid', paid: 'Paid', overdue: 'Overdue', void: 'Void',
  scheduled: 'Scheduled', due: 'Due', late: 'Late', processing: 'Processing', failed: 'Failed',
}
const statusLabel = (status) => STATUS_LABELS[status] || status
const StatusPill = ({ status }) => (
  <span className={`text-xs rounded-full px-2 py-0.5 whitespace-nowrap ${STATUS_STYLES[status] || 'bg-neutral-100 text-gray-500'}`}>
    {statusLabel(status)}
  </span>
)

/** How the family pays, in their own words.
 *
 *  Shows what they answered to the school's "Form of Payment" registration
 *  question, and lets them change it from the same options. The save lands on
 *  their registration (what the office reads) and on the field the
 *  card-payment gate reads, so picking Utah Fits All hides card checkout and
 *  picking Self-Pay shows it. When the school has no such question configured
 *  the value is read-only. */
const fundingText = (household) => {
  const stated = (household.stated_payment_methods || []).filter(Boolean)
  if (stated.length) return stated.join(', ') + (household.stated_ufa_private ? ' (private school)' : '')
  return household.funding_label || 'Not on file'
}

const FundingSourceCard = ({ household, saving, onSave }) => {
  const question = household.funding_question
  const [editing, setEditing] = useState(false)
  const [chosen, setChosen] = useState([])
  const [ufaPrivate, setUfaPrivate] = useState('')
  const isUfa = (m) => /utah fits all/i.test(m) || m.toLowerCase() === 'ufa'
  const askUfa = chosen.some(isUfa)

  const begin = () => {
    setChosen((household.stated_payment_methods || []).filter((m) => question.options.includes(m)))
    setUfaPrivate(household.stated_ufa_private == null ? '' : (household.stated_ufa_private ? 'Yes' : 'No'))
    setEditing(true)
  }
  const toggle = (option) => setChosen((prev) => {
    if (!question.multi) return [option]
    return prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]
  })
  const save = async () => {
    const ok = await onSave(household.household_id, chosen, askUfa && ufaPrivate ? ufaPrivate === 'Yes' : null)
    if (ok) setEditing(false)
  }

  return (
    <div className="mb-2 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-gray-400">Funding source</div>
          {!editing && (
            <div className="text-lg font-semibold text-gray-900 mt-0.5" data-testid="funding-source">
              {fundingText(household)}
            </div>
          )}
        </div>
        {question && !editing && (
          <button type="button" onClick={begin} className="btn-quiet flex-shrink-0" aria-label="Edit funding source">
            <PencilSquareIcon className="w-4 h-4" />
            Edit
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-2">
          {question.help && <p className="text-xs text-gray-500 mb-2">{question.help}</p>}
          <div className="space-y-1.5">
            {question.options.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm text-gray-800">
                <input
                  type={question.multi ? 'checkbox' : 'radio'}
                  name={`funding-${household.household_id}`}
                  checked={chosen.includes(option)}
                  onChange={() => toggle(option)}
                  className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                />
                {option}
              </label>
            ))}
          </div>
          {askUfa && (
            <div className="mt-3">
              <label htmlFor={`ufa-private-${household.household_id}`} className="block text-sm font-medium text-gray-800 mb-1">
                Are you enrolling as a UFA (Utah Fits All) Private School?
              </label>
              <select
                id={`ufa-private-${household.household_id}`}
                value={ufaPrivate}
                onChange={(e) => setUfaPrivate(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-optio-purple"
              >
                <option value="">-- Please select --</option>
                <option value="No">No, standard Utah Fits All</option>
                <option value="Yes">Yes, UFA Private School</option>
              </select>
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={save} loading={saving} disabled={!chosen.length}>Save</Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}

const PRINT_STYLES = `
  .billing-print-area { display: none; }
  @media print {
    body * { visibility: hidden; }
    .billing-print-area { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
    .billing-print-area, .billing-print-area * { visibility: visible; }
  }
`

const safePrint = () => { try { window.print() } catch { /* jsdom / blocked */ } }

const ReceiptPrintView = ({ receipt }) => (
  <div style={{ fontFamily: 'Georgia, serif', color: '#111', padding: '40px', maxWidth: '640px', margin: '0 auto' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #111', paddingBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {receipt.organization?.logo_url && (
          <img src={receipt.organization.logo_url} alt="" style={{ height: '48px', maxWidth: '120px', objectFit: 'contain' }} />
        )}
        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{receipt.organization?.name}</div>
      </div>
      <div style={{ fontSize: '24px', letterSpacing: '4px' }}>RECEIPT</div>
    </div>
    <table style={{ width: '100%', marginTop: '24px', fontSize: '14px', borderCollapse: 'collapse' }}>
      <tbody>
        <tr><td style={{ padding: '4px 0', color: '#555' }}>Receipt no.</td><td style={{ textAlign: 'right' }}>{(receipt.payment?.id || '').slice(0, 8).toUpperCase()}</td></tr>
        {receipt.confirmation_number && (
          <tr><td style={{ padding: '4px 0', color: '#555' }}>Confirmation no.</td><td style={{ textAlign: 'right' }}>{receipt.confirmation_number}</td></tr>
        )}
        {receipt.invoice?.invoice_number && (
          <tr><td style={{ padding: '4px 0', color: '#555' }}>Invoice no.</td><td style={{ textAlign: 'right' }}>{receipt.invoice.invoice_number}</td></tr>
        )}
        <tr><td style={{ padding: '4px 0', color: '#555' }}>Payment date</td><td style={{ textAlign: 'right' }}>{shortDate(receipt.payment?.recorded_at)}</td></tr>
        <tr><td style={{ padding: '4px 0', color: '#555' }}>Amount paid</td><td style={{ textAlign: 'right', fontWeight: 'bold' }}>{money(receipt.payment?.amount_cents)}</td></tr>
        <tr><td style={{ padding: '4px 0', color: '#555' }}>Method</td><td style={{ textAlign: 'right' }}>{receipt.payment?.method ? methodLabel(receipt.payment) : '—'}</td></tr>
        {receipt.funding_source && (
          <tr><td style={{ padding: '4px 0', color: '#555' }}>Funding source</td><td style={{ textAlign: 'right' }}>{FUNDING_LABELS[receipt.funding_source] || receipt.funding_source}</td></tr>
        )}
        {receipt.payment?.external_ref && (
          <tr><td style={{ padding: '4px 0', color: '#555' }}>Reference</td><td style={{ textAlign: 'right' }}>{receipt.payment.external_ref}</td></tr>
        )}
        <tr><td style={{ padding: '4px 0', color: '#555' }}>Paid by</td><td style={{ textAlign: 'right' }}>{receipt.payer?.guardian_name} ({receipt.payer?.household_name})</td></tr>
        {!!(receipt.students || []).length && (
          <tr><td style={{ padding: '4px 0', color: '#555' }}>Student(s)</td><td style={{ textAlign: 'right' }}>{receipt.students.join(', ')}</td></tr>
        )}
        {receipt.installment && (
          <tr><td style={{ padding: '4px 0', color: '#555' }}>Applied to installment due</td><td style={{ textAlign: 'right' }}>{receipt.installment.due_date}</td></tr>
        )}
      </tbody>
    </table>
    <div style={{ marginTop: '24px', fontSize: '13px' }}>
      <div style={{ fontWeight: 'bold', borderBottom: '1px solid #999', paddingBottom: '4px', marginBottom: '6px' }}>Invoice detail</div>
      {(receipt.invoice?.line_items || []).map((li) => (
        <div key={li.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
          <span>{li.description}{li.quantity > 1 ? ` x${li.quantity}` : ''}</span><span>{money(li.amount_cents)}</span>
        </div>
      ))}
      {(receipt.invoice?.discount_cents || 0) > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#555' }}>
          <span>Discount</span><span>-{money(receipt.invoice.discount_cents)}</span>
        </div>
      )}
      {/* No fee row: the card fee is one of the line items above. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #999', marginTop: '4px', paddingTop: '4px' }}>
        <span>Invoice total</span><span>{money(receipt.invoice?.total_cents)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
        <span>Paid to date</span><span>{money(receipt.invoice?.amount_paid_cents)}</span>
      </div>
    </div>
    <div style={{ marginTop: '40px', fontSize: '12px', color: '#555', textAlign: 'center' }}>
      Payment recorded by {receipt.organization?.name} via Optio.
    </div>
  </div>
)

const StatementPrintView = ({ household }) => {
  // Chronological ledger: invoices post charges, payments post credits.
  const entries = [
    ...(household.invoices || []).filter((i) => i.status !== 'void').map((i) => ({
      date: i.issued_at || i.created_at, label: `Invoice${i.student_name ? ` — ${i.student_name}` : ''}`,
      charge: i.total_cents || 0, credit: 0, key: `inv-${i.id}`,
    })),
    ...(household.payments || []).map((p) => ({
      date: p.recorded_at, label: `Payment${p.method ? ` (${methodLabel(p)})` : ''}${p.external_ref ? ` ref ${p.external_ref}` : ''}`,
      charge: 0, credit: p.amount_cents || 0, key: `pay-${p.id}`,
    })),
  ].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  let running = 0
  return (
    <div style={{ fontFamily: 'Georgia, serif', color: '#111', padding: '40px', maxWidth: '720px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #111', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {household.organization?.logo_url && (
            <img src={household.organization.logo_url} alt="" style={{ height: '48px', maxWidth: '120px', objectFit: 'contain' }} />
          )}
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{household.organization?.name}</div>
        </div>
        <div style={{ fontSize: '22px', letterSpacing: '3px' }}>STATEMENT</div>
      </div>
      <div style={{ marginTop: '12px', fontSize: '13px', color: '#555' }}>
        {household.household_name} · Prepared {new Date().toLocaleDateString()}
      </div>
      <table style={{ width: '100%', marginTop: '20px', fontSize: '13px', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #999', textAlign: 'left' }}>
            <th style={{ padding: '4px 0' }}>Date</th><th>Description</th>
            <th style={{ textAlign: 'right' }}>Charge</th><th style={{ textAlign: 'right' }}>Payment</th>
            <th style={{ textAlign: 'right' }}>Balance</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            running += e.charge - e.credit
            return (
              <tr key={e.key} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '4px 0' }}>{shortDate(e.date)}</td>
                <td>{e.label}</td>
                <td style={{ textAlign: 'right' }}>{e.charge ? money(e.charge) : ''}</td>
                <td style={{ textAlign: 'right' }}>{e.credit ? money(e.credit) : ''}</td>
                <td style={{ textAlign: 'right' }}>{money(running)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', fontSize: '14px', fontWeight: 'bold' }}>
        Balance due: {money(household.totals?.balance_cents)}
      </div>
      <div style={{ marginTop: '40px', fontSize: '12px', color: '#555', textAlign: 'center' }}>
        Recorded by {household.organization?.name} via Optio.
      </div>
    </div>
  )
}

const InvoiceCard = ({ invoice, expanded, onToggle, onPay, paying, canPayOnline, onSetupPlan, planning }) => {
  // total_cents already carries the card fee as a line item. Adding the column
  // on top charged it twice; leaving it out of a total showed it as a credit.
  const amountDue = (invoice.total_cents || 0) - (invoice.amount_paid_cents || 0)
  const payable = canPayOnline && amountDue > 0 && !['paid', 'void', 'draft'].includes(invoice.status)
  const hasPlan = !!(invoice.installments || []).length
  const title = invoice.student_name || 'Invoice'
  const meta = [
    invoice.invoice_number,
    `Issued ${shortDate(invoice.issued_at)}`,
    invoice.due_date ? `Due ${shortDate(invoice.due_date)}` : null,
  ].filter(Boolean).join(' · ')
  return (
  <div className="bg-white rounded-xl border border-gray-200">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={`${title} invoice, ${money(invoice.total_cents)}`}
      className="w-full text-left p-4 flex items-start gap-3"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-900">{title}</span>
          <StatusPill status={invoice.status} />
        </div>
        <div className="text-xs text-gray-500 mt-0.5">{meta}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-xs uppercase tracking-wide text-gray-400">{amountDue > 0 ? 'Amount due' : 'Total'}</div>
        <div className={`text-lg font-semibold tabular-nums ${amountDue > 0 ? 'text-gray-900' : 'text-green-700'}`}>
          {money(amountDue > 0 ? amountDue : invoice.total_cents)}
        </div>
        {amountDue > 0 && (invoice.amount_paid_cents || 0) > 0 && (
          <div className="text-xs text-gray-500 tabular-nums">of {money(invoice.total_cents)}</div>
        )}
      </div>
      <ChevronDownIcon className={`w-5 h-5 text-gray-400 flex-shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`} />
    </button>
    {payable && (
      <div className="px-4 pb-3 -mt-1 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => onPay(invoice)} loading={paying}>
          Pay {money(amountDue)} online
        </Button>
        {!hasPlan && (
          <Button size="sm" variant="secondary" onClick={() => onSetupPlan(invoice)} loading={planning}>
            Set up 10-payment plan
          </Button>
        )}
        <span className="text-xs text-gray-400">A card processing fee is added at checkout.</span>
      </div>
    )}
    {expanded && (
      <div className="px-4 pb-4 text-sm border-t border-gray-100">
        <table className="w-full mt-3">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-gray-400">
              <th scope="col" className="text-left font-medium pb-1">Item</th>
              <th scope="col" className="text-right font-medium pb-1 w-16">Qty</th>
              <th scope="col" className="text-right font-medium pb-1 w-28">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(invoice.line_items || []).map((li) => (
              <tr key={li.id}>
                <td className="py-1.5 pr-2 text-gray-800">{li.description}</td>
                <td className="py-1.5 text-right text-gray-500 tabular-nums">{li.quantity > 1 ? li.quantity : ''}</td>
                <td className="py-1.5 text-right text-gray-800 tabular-nums">{money(li.amount_cents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-gray-200">
            {(invoice.discount_cents || 0) > 0 && (
              <tr className="text-gray-500">
                <td colSpan={2} className="pt-1.5 text-right">Discount</td>
                <td className="pt-1.5 text-right tabular-nums">-{money(invoice.discount_cents)}</td>
              </tr>
            )}
            <tr className="text-gray-800">
              <td colSpan={2} className="pt-1.5 text-right">Total</td>
              <td className="pt-1.5 text-right tabular-nums">{money(invoice.total_cents)}</td>
            </tr>
            <tr className="text-green-700">
              <td colSpan={2} className="pt-1 text-right">Paid</td>
              <td className="pt-1 text-right tabular-nums">-{money(invoice.amount_paid_cents || 0)}</td>
            </tr>
            <tr className="font-semibold text-gray-900">
              <td colSpan={2} className="pt-1.5 text-right">Amount due</td>
              <td className="pt-1.5 text-right tabular-nums">{money(Math.max(amountDue, 0))}</td>
            </tr>
          </tfoot>
        </table>
        {hasPlan && (
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Payment schedule</div>
            <table className="w-full">
              <tbody className="divide-y divide-gray-100">
                {invoice.installments.map((i) => (
                  <tr key={i.id}>
                    <td className="py-1.5 text-gray-800">{shortDate(i.due_date)}</td>
                    <td className="py-1.5 text-right text-gray-800 tabular-nums">{money(i.amount_cents)}</td>
                    <td className="py-1.5 pl-3 text-right w-32"><StatusPill status={i.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )}
  </div>
  )
}

const FamilyBillingPage = () => {
  const [households, setHouseholds] = useState(null)
  const [expanded, setExpanded] = useState({})
  const [receipt, setReceipt] = useState(null)
  const [statementFor, setStatementFor] = useState(null)
  const [printMode, setPrintMode] = useState(null) // 'receipt' | 'statement'
  const [paying, setPaying] = useState(null) // invoice id mid-checkout
  const [payingFamily, setPayingFamily] = useState(null) // household id mid-checkout
  const [planning, setPlanning] = useState(null) // invoice id mid-plan-setup
  const [updatingPlan, setUpdatingPlan] = useState(null) // household id mid-pref-update
  const [updatingFunding, setUpdatingFunding] = useState(null) // household id mid-funding-update

  const updateFundingSource = async (householdId, paymentMethods, ufaPrivate) => {
    setUpdatingFunding(householdId)
    try {
      const r = await api.post('/api/sis/parent/billing/funding-source', {
        household_id: householdId,
        payment_methods: paymentMethods,
        ufa_private: ufaPrivate,
      })
      // The response carries the family's saved words and the gate's new
      // answer; apply both so the card buttons and the UFA note switch
      // without a reload.
      const next = r.data || {}
      setHouseholds((prev) => (prev || []).map((h) => (
        h.household_id === householdId
          ? { ...h,
              stated_payment_methods: next.stated_payment_methods || paymentMethods,
              stated_ufa_private: next.stated_ufa_private ?? null,
              funding_source: next.funding_source ?? null,
              funding_label: next.funding_label ?? null,
              pay_through_ufa: !!next.pay_through_ufa }
          : h
      )))
      toast.success('Funding source updated')
      return true
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not update your funding source')
      return false
    } finally {
      setUpdatingFunding(null)
    }
  }

  const updatePaymentPlanPreference = async (householdId, preference) => {
    setUpdatingPlan(householdId)
    try {
      await api.post('/api/sis/parent/billing/payment-plan-preference', {
        household_id: householdId,
        payment_plan_preference: preference,
      })
      setHouseholds((prev) => (prev || []).map((h) => (
        h.household_id === householdId ? { ...h, payment_plan_preference: preference } : h
      )))
      const label = preference === 'monthly' ? 'Monthly payments' : 'Pay in full'
      toast.success(`Updated payment plan preference to ${label}`)
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not update payment plan preference')
    } finally {
      setUpdatingPlan(null)
    }
  }

  const loadBilling = () => api.get('/api/sis/parent/billing')
    .then((r) => setHouseholds(r.data?.households || []))
    .catch(() => { toast.error('Could not load your billing'); setHouseholds([]) })

  useEffect(() => { loadBilling() }, [])

  // Returning from Stripe. Three flows share this handler:
  //   ?payment=return&pay_invoice=<id>   single invoice paid in full
  //   ?payment=return&pay_family=<hhId>  whole family paid at once
  //   ?autopay=return&setup_invoice=<id> card saved -> start the payment plan
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const invoiceId = params.get('pay_invoice')
    const familyId = params.get('pay_family')
    const setupInvoiceId = params.get('setup_invoice')
    const outcome = params.get('payment')
    const autopay = params.get('autopay')
    if (!invoiceId && !familyId && !setupInvoiceId) return
    // Clean the URL so a refresh doesn't re-trigger.
    window.history.replaceState({}, '', window.location.pathname)
    if (outcome === 'canceled' || autopay === 'canceled') { toast('Payment canceled'); return }

    if (invoiceId && outcome === 'return') {
      api.post(`/api/sis/parent/billing/invoices/${invoiceId}/confirm-payment`, {})
        .then((r) => {
          if (r.data?.paid) toast.success('Payment received — thank you!')
          else toast('We could not confirm the payment yet. It may take a moment.')
          loadBilling()
        })
        .catch(() => toast.error('Could not confirm the payment'))
    } else if (familyId && outcome === 'return') {
      api.post('/api/sis/parent/billing/family-confirm', { household_id: familyId })
        .then((r) => {
          if (r.data?.paid) toast.success('Payment received — thank you!')
          else toast('We could not confirm the payment yet. It may take a moment.')
          loadBilling()
        })
        .catch(() => toast.error('Could not confirm the payment'))
    } else if (setupInvoiceId && autopay === 'return') {
      api.post(`/api/sis/parent/billing/invoices/${setupInvoiceId}/autopay-confirm`, { installment_count: 10 })
        .then((r) => {
          if (r.data?.ready) toast.success('Payment plan started — your card is saved and the first payment was made.')
          else toast('We could not finish setting up the plan yet. It may take a moment.')
          loadBilling()
        })
        .catch((e) => toast.error(e?.response?.data?.error || 'Could not set up the payment plan'))
    }
  }, [])

  // Returning from a link in the invoice EMAIL rather than from this page.
  //
  // Those routes are unauthenticated and do the work server-side before
  // redirecting here, so there is nothing left to confirm — only to say what
  // happened. They carry no pay_invoice/setup_invoice id, which is exactly what
  // separates them from the handler above, and is why they used to land here
  // silently: a parent paid their tuition from the email and the page they were
  // dropped on said nothing at all.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('pay_invoice') || params.get('pay_family') || params.get('setup_invoice')) return
    const payment = params.get('payment')
    const autopay = params.get('autopay')
    if (!payment && !autopay) return
    window.history.replaceState({}, '', window.location.pathname)

    const notices = {
      payment: {
        paid: ['success', 'Payment received — thank you!'],
        pending: ['info', 'We could not confirm the payment yet. It may take a moment.'],
        already_paid: ['info', 'That invoice is already paid.'],
        invalid_link: ['error', 'That payment link is not valid. Ask the school for a new one.'],
        unavailable: ['error', 'This invoice cannot be paid online right now. Please contact the school.'],
      },
      autopay: {
        active: ['success', 'Monthly payments are set up — your card is saved and the first payment was made.'],
        already: ['info', 'Monthly payments are already set up for that invoice.'],
        pending: ['info', 'We could not finish setting up the plan yet. It may take a moment.'],
        canceled: ['info', 'Setup canceled'],
        already_paid: ['info', 'That invoice is already paid.'],
        no_guardian: ['error', 'Only a parent or guardian can set up automatic payments.'],
        invalid_link: ['error', 'That link is not valid. Ask the school for a new one.'],
        unavailable: ['error', 'Automatic payments are not available for this invoice right now.'],
        // Open-ended monthly tuition: the card saved, but say plainly whether
        // the first payment went through. "Your card is saved" on its own reads
        // as done, and the family would not know they still owe this month.
        card_saved: ['success', 'Your card is saved for monthly tuition.'],
        card_saved_unpaid: ['info', 'Your card is saved, but the first payment did not go through. The school will be in touch.'],
      },
    }
    const [kind, message] = notices[payment ? 'payment' : 'autopay']?.[payment || autopay] || []
    if (!message) return
    if (kind === 'success') toast.success(message)
    else if (kind === 'error') toast.error(message)
    else toast(message)
    if (kind === 'success') loadBilling()
  }, [])

  const payInvoice = async (invoice) => {
    setPaying(invoice.id)
    try {
      const returnUrl = `${window.location.origin}${window.location.pathname}?pay_invoice=${invoice.id}`
      const r = await api.post(`/api/sis/parent/billing/invoices/${invoice.id}/checkout`, { return_url: returnUrl })
      if (r.data?.checkout_url) window.location.href = r.data.checkout_url
      else toast.error('Could not start the payment')
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not start the payment')
    } finally { setPaying(null) }
  }

  const payFamily = async (hh) => {
    setPayingFamily(hh.household_id)
    try {
      const returnUrl = `${window.location.origin}${window.location.pathname}?pay_family=${hh.household_id}`
      const r = await api.post('/api/sis/parent/billing/family-checkout', { household_id: hh.household_id, return_url: returnUrl })
      if (r.data?.checkout_url) window.location.href = r.data.checkout_url
      else toast.error('Could not start the payment')
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not start the payment')
    } finally { setPayingFamily(null) }
  }

  const setupPlan = async (invoice) => {
    setPlanning(invoice.id)
    try {
      const returnUrl = `${window.location.origin}${window.location.pathname}?setup_invoice=${invoice.id}`
      const r = await api.post(`/api/sis/parent/billing/invoices/${invoice.id}/autopay-setup`, { return_url: returnUrl, installment_count: 10 })
      if (r.data?.checkout_url) window.location.href = r.data.checkout_url
      else toast.error('Could not start the payment plan setup')
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not start the payment plan')
    } finally { setPlanning(null) }
  }

  useEffect(() => {
    if (!printMode) return undefined
    const t = setTimeout(() => { safePrint(); setPrintMode(null) }, 150)
    return () => clearTimeout(t)
  }, [printMode])

  const printReceipt = async (paymentId) => {
    try {
      const r = await api.get(`/api/sis/parent/billing/receipts/${paymentId}`)
      setReceipt(r.data?.receipt || null)
      setPrintMode('receipt')
    } catch { toast.error('Could not load the receipt') }
  }

  const printStatement = (household) => {
    setStatementFor(household)
    setPrintMode('statement')
  }

  // A tab of the school page (pages/school/SchoolShell): the shell carries
  // the letterhead and the rail, this is the panel.
  return (
    <div className="max-w-3xl mx-auto">
      <style>{PRINT_STYLES}</style>
      <p className="text-sm text-gray-500 mb-6">
        Your family's balance, invoices, and payments. Print any payment as a receipt for scholarship reimbursement.
      </p>

      {households === null && <p className="text-gray-500">Loading…</p>}
      {households?.length === 0 && (
        <p className="text-gray-500">No billing history yet. Invoices from your school will appear here.</p>
      )}

      {(households || []).map((hh) => (
        <div key={hh.household_id} className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">
              {hh.organization?.name || 'Your school'}{hh.household_name ? ` · ${hh.household_name}` : ''}
            </h2>
            <Button size="sm" variant="secondary" onClick={() => printStatement(hh)}>Print statement</Button>
          </div>

          {/* The balance-due notice. It was a "Needs your attention" card on
              the family home until 2026-09-16; the home is for the children,
              and a parent who opens Billing came to see this. It carries the
              whole-family pay button when the school takes cards, so the
              notice is the action and not a pointer to one further down. */}
          {(hh.totals?.balance_cents || 0) > 0 && (
            <div role="status" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-wrap items-center gap-3">
              <span className="w-9 h-9 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
                <CreditCardIcon className="w-5 h-5 text-amber-600" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-900">{money(hh.totals?.balance_cents)} balance due</div>
                <div className="text-xs text-gray-600">
                  {hh.pay_through_ufa
                    ? 'Paid through UFA. The school records it here once it is received.'
                    : hh.organization?.online_pay_enabled
                      ? 'Pays every open invoice at once. A card processing fee is added at checkout.'
                      : 'Pay by Zelle or through your scholarship program; the school records it here.'}
                </div>
              </div>
              {!hh.pay_through_ufa && hh.organization?.online_pay_enabled && (
                <Button size="sm" onClick={() => payFamily(hh)} loading={payingFamily === hh.household_id}>
                  Pay whole family · {money(hh.totals?.balance_cents)}
                </Button>
              )}
            </div>
          )}

          {/* Balance summary */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 mb-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-400">Invoiced</div>
              <div className="text-lg font-semibold text-gray-900">{money(hh.totals?.invoiced_cents)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-400">Paid</div>
              <div className="text-lg font-semibold text-green-700">{money(hh.totals?.paid_cents)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-400">Balance</div>
              <div className={`text-lg font-semibold ${(hh.totals?.balance_cents || 0) > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                {money(hh.totals?.balance_cents)}
              </div>
            </div>
          </div>
          <FundingSourceCard household={hh} saving={updatingFunding === hh.household_id} onSave={updateFundingSource} />
          {hh.pay_through_ufa ? (
            <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              Your family's tuition is funded through UFA{hh.funding_label ? ` (${hh.funding_label})` : ''}.
              Please make your payment through UFA — the school records it here once it's received.
            </div>
          ) : (
            <p className="text-xs text-gray-500 mb-5">
              Pay online, by Zelle, or through your scholarship program; the school records each payment here.
            </p>
          )}

          {/* Tuition payment plan preference */}
          {!hh.pay_through_ufa && (
            <div className="mb-6 rounded-xl bg-gray-50 border border-gray-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">Tuition payment plan preference</div>
                  <div className="text-xs text-gray-500">
                    Let the school know whether you plan to pay tuition in full or in monthly payments before invoices are generated.
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant={hh.payment_plan_preference === 'in_full' ? 'primary' : 'secondary'}
                    disabled={updatingPlan === hh.household_id}
                    onClick={() => updatePaymentPlanPreference(hh.household_id, 'in_full')}
                  >
                    Pay in full
                  </Button>
                  <Button
                    size="sm"
                    variant={hh.payment_plan_preference === 'monthly' ? 'primary' : 'secondary'}
                    disabled={updatingPlan === hh.household_id}
                    onClick={() => updatePaymentPlanPreference(hh.household_id, 'monthly')}
                  >
                    Monthly payments
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Invoices */}
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Invoices</h3>
          {!(hh.invoices || []).length && <p className="text-sm text-gray-500 mb-4">No invoices yet.</p>}
          <div className="space-y-2 mb-6">
            {(hh.invoices || []).map((inv) => (
              <InvoiceCard
                key={inv.id} invoice={inv} expanded={!!expanded[inv.id]}
                onToggle={() => setExpanded((e) => ({ ...e, [inv.id]: !e[inv.id] }))}
                onPay={payInvoice} paying={paying === inv.id}
                onSetupPlan={setupPlan} planning={planning === inv.id}
                canPayOnline={!hh.pay_through_ufa && !!hh.organization?.online_pay_enabled}
              />
            ))}
          </div>

          {/* Payments */}
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Payments</h3>
          {!(hh.payments || []).length && <p className="text-sm text-gray-500">No payments recorded yet.</p>}
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {(hh.payments || []).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 text-sm">
                  <span className="font-medium text-gray-900">{money(p.amount_cents)}</span>
                  <span className="text-gray-500"> · {shortDate(p.recorded_at)}{p.method ? ` · ${methodLabel(p)}` : ''}{p.external_ref ? ` · ref ${p.external_ref}` : ''}</span>
                </div>
                <Button size="sm" variant="secondary" onClick={() => printReceipt(p.id)}>Print receipt</Button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Print-only surface: exactly one of receipt/statement renders for window.print */}
      <div className="billing-print-area" data-testid="billing-print-area">
        {printMode === 'receipt' && receipt && <ReceiptPrintView receipt={receipt} />}
        {printMode === 'statement' && statementFor && <StatementPrintView household={statementFor} />}
      </div>
    </div>
  )
}

export default FamilyBillingPage

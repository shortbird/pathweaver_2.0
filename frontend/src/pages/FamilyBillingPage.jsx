import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import Button from '../components/ui/Button'

/**
 * Billing — a family's account balance with their school: invoices (line items
 * + installment schedules), payments recorded by the school, printable receipts
 * (for scholarship reimbursement) and a printable statement. Optio never
 * processes payments; the school records money collected by Zelle/scholarship.
 */
const money = (cents) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`)
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : '—')
const STATUS_STYLES = {
  sent: 'bg-blue-100 text-blue-700', partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700',
  void: 'bg-neutral-100 text-neutral-400',
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
        <tr><td style={{ padding: '4px 0', color: '#555' }}>Payment date</td><td style={{ textAlign: 'right' }}>{shortDate(receipt.payment?.recorded_at)}</td></tr>
        <tr><td style={{ padding: '4px 0', color: '#555' }}>Amount paid</td><td style={{ textAlign: 'right', fontWeight: 'bold' }}>{money(receipt.payment?.amount_cents)}</td></tr>
        <tr><td style={{ padding: '4px 0', color: '#555' }}>Method</td><td style={{ textAlign: 'right' }}>{receipt.payment?.method || '—'}</td></tr>
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
      date: p.recorded_at, label: `Payment${p.method ? ` (${p.method})` : ''}${p.external_ref ? ` ref ${p.external_ref}` : ''}`,
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

const InvoiceCard = ({ invoice, expanded, onToggle }) => (
  <div className="bg-white rounded-xl border border-gray-200">
    <button onClick={onToggle} className="w-full text-left p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium text-neutral-900">
          {money(invoice.total_cents)}{invoice.student_name ? ` · ${invoice.student_name}` : ''}
        </span>
        <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_STYLES[invoice.status] || 'bg-neutral-100 text-neutral-500'}`}>
          {invoice.status}
        </span>
      </div>
      <div className="text-sm text-neutral-400 mt-0.5">
        Issued {shortDate(invoice.issued_at)}{invoice.due_date ? ` · due ${invoice.due_date}` : ''} · paid {money(invoice.amount_paid_cents)}
      </div>
    </button>
    {expanded && (
      <div className="px-4 pb-4 text-sm">
        <div className="space-y-1 border-t border-gray-100 pt-2">
          {(invoice.line_items || []).map((li) => (
            <div key={li.id} className="flex justify-between">
              <span>{li.description}{li.quantity > 1 ? ` x${li.quantity}` : ''}</span>
              <span>{money(li.amount_cents)}</span>
            </div>
          ))}
          {(invoice.discount_cents || 0) > 0 && (
            <div className="flex justify-between text-neutral-500"><span>Discount</span><span>-{money(invoice.discount_cents)}</span></div>
          )}
          <div className="flex justify-between font-medium border-t border-gray-100 pt-1"><span>Total</span><span>{money(invoice.total_cents)}</span></div>
        </div>
        {!!(invoice.installments || []).length && (
          <div className="border-t border-gray-100 pt-2 mt-2">
            <div className="text-xs text-neutral-500 mb-1">Payment schedule</div>
            {invoice.installments.map((i) => (
              <div key={i.id} className="flex justify-between">
                <span className="text-neutral-600">{i.due_date}</span>
                <span>{money(i.amount_cents)} · {i.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )}
  </div>
)

const FamilyBillingPage = () => {
  const [households, setHouseholds] = useState(null)
  const [expanded, setExpanded] = useState({})
  const [receipt, setReceipt] = useState(null)
  const [statementFor, setStatementFor] = useState(null)
  const [printMode, setPrintMode] = useState(null) // 'receipt' | 'statement'

  useEffect(() => {
    api.get('/api/sis/parent/billing')
      .then((r) => setHouseholds(r.data?.households || []))
      .catch(() => { toast.error('Could not load your billing'); setHouseholds([]) })
  }, [])

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

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <style>{PRINT_STYLES}</style>
      <h1 className="text-2xl font-bold text-neutral-900 mb-1">Billing</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Your family's balance, invoices, and payments. Print any payment as a receipt for scholarship reimbursement.
      </p>

      {households === null && <p className="text-neutral-500">Loading…</p>}
      {households?.length === 0 && (
        <p className="text-neutral-500">No billing history yet. Invoices from your school will appear here.</p>
      )}

      {(households || []).map((hh) => (
        <div key={hh.household_id} className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-neutral-900">
              {hh.organization?.name || 'Your school'}{hh.household_name ? ` · ${hh.household_name}` : ''}
            </h2>
            <Button size="sm" variant="secondary" onClick={() => printStatement(hh)}>Print statement</Button>
          </div>

          {/* Balance summary */}
          <div className="rounded-xl border border-gray-200 bg-gradient-to-r from-optio-purple to-optio-pink p-[1px] mb-2">
            <div className="rounded-xl bg-white p-4 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-400">Invoiced</div>
                <div className="text-lg font-semibold text-neutral-900">{money(hh.totals?.invoiced_cents)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-400">Paid</div>
                <div className="text-lg font-semibold text-green-700">{money(hh.totals?.paid_cents)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-400">Balance</div>
                <div className={`text-lg font-semibold ${(hh.totals?.balance_cents || 0) > 0 ? 'text-red-700' : 'text-neutral-900'}`}>
                  {money(hh.totals?.balance_cents)}
                </div>
              </div>
            </div>
          </div>
          <p className="text-xs text-neutral-500 mb-5">
            Pay by Zelle or through your scholarship program; the school records each payment here.
          </p>

          {/* Invoices */}
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Invoices</h3>
          {!(hh.invoices || []).length && <p className="text-sm text-neutral-500 mb-4">No invoices yet.</p>}
          <div className="space-y-2 mb-6">
            {(hh.invoices || []).map((inv) => (
              <InvoiceCard
                key={inv.id} invoice={inv} expanded={!!expanded[inv.id]}
                onToggle={() => setExpanded((e) => ({ ...e, [inv.id]: !e[inv.id] }))}
              />
            ))}
          </div>

          {/* Payments */}
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Payments</h3>
          {!(hh.payments || []).length && <p className="text-sm text-neutral-500">No payments recorded yet.</p>}
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {(hh.payments || []).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 text-sm">
                  <span className="font-medium text-neutral-900">{money(p.amount_cents)}</span>
                  <span className="text-neutral-500"> · {shortDate(p.recorded_at)}{p.method ? ` · ${p.method}` : ''}{p.external_ref ? ` · ref ${p.external_ref}` : ''}</span>
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

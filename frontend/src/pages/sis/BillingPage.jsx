import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import SearchSelect from '../../components/ui/SearchSelect'
import ModalOverlay from '../../components/ui/ModalOverlay'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'
const money = (cents) => (cents == null ? '—' : `${cents < 0 ? '−' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`)
const today = () => new Date().toISOString().slice(0, 10)

const PAYMENT_METHODS = [
  ['zelle', 'Zelle'], ['scholarship', 'Scholarship'], ['cash', 'Cash'],
  ['check', 'Check'], ['other', 'Other'],
]
const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS)

// A negative payment record is a refund — label it as one wherever payments list.
const payLabel = (pmt) => `${(pmt.amount_cents || 0) < 0 ? 'Refund — ' : ''}${METHOD_LABEL[pmt.method] || pmt.method || 'Payment'}`
const payAmountCls = (pmt) => ((pmt.amount_cents || 0) < 0 ? 'text-red-700' : 'text-green-700')

// What a charge is for. 'unclassified' covers every line written before the
// kind column existed, plus manual charges — labelled honestly rather than
// guessed at from the description text.
const KIND_LABEL = {
  tuition: 'Tuition', supply: 'Supplies', registration: 'Registration',
  fee: 'Fee', other: 'Other', unclassified: 'Unclassified',
}
const KIND_PILL = {
  tuition: 'bg-indigo-100 text-indigo-700',
  supply: 'bg-teal-100 text-teal-700',
  registration: 'bg-amber-100 text-amber-700',
  fee: 'bg-neutral-100 text-neutral-600',
  other: 'bg-neutral-100 text-neutral-600',
  unclassified: 'bg-neutral-100 text-neutral-500',
}

// Build the last 12 months (YYYY-MM) plus an "All open" option.
const monthOptions = () => {
  const opts = [['all', 'All open']]
  const d = new Date()
  for (let i = 0; i < 12; i += 1) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1)
    const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`
    const label = m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    opts.push([key, label])
  }
  return opts
}

// Derive a display pill from a ledger row.
const rowPill = (row) => {
  const balance = row.balance_cents ?? ((row.total_cents || 0) - (row.amount_paid_cents || 0))
  if (balance <= 0 && (row.total_cents || 0) > 0) {
    const m = row.method ? ` · ${METHOD_LABEL[row.method] || row.method}` : ''
    return { text: `Paid${m}`, cls: 'bg-green-100 text-green-700' }
  }
  if ((row.amount_paid_cents || 0) > 0) {
    return { text: 'Partial', cls: 'bg-amber-100 text-amber-700' }
  }
  const overdue = row.due_date && String(row.due_date).slice(0, 10) < today()
  if (overdue) return { text: 'Overdue', cls: 'bg-red-100 text-red-700' }
  return { text: 'Outstanding', cls: 'bg-blue-100 text-blue-700' }
}

const Modal = ({ title, onClose, children }) => (
  <ModalOverlay onClose={onClose}>
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-neutral-900">{title}</h3>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-lg" aria-label="Close">×</button>
      </div>
      {children}
    </div>
  </ModalOverlay>
)

// Sort preference per view. localStorage so the office's choice survives a
// page load — the dropdown existed before this and still reset every visit,
// which read as the sort not working at all.
const SORT_KEY = 'sis.billing.sort'
const SORT_DEFAULTS = { charges: 'default', outstanding: 'family', detail: 'default' }

const readSortPrefs = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(SORT_KEY) || '{}')
    // Only keep values this page still understands; a stale key must not wedge
    // the table into an order with no matching option in the dropdown.
    return Object.fromEntries(Object.entries(raw)
      .filter(([k, v]) => k in SORT_DEFAULTS && (v === 'default' || v === 'family')))
  } catch { return {} }
}

const writeSortPrefs = (prefs) => {
  try { localStorage.setItem(SORT_KEY, JSON.stringify(prefs)) } catch { /* private mode */ }
}

const BillingPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [view, setView] = useState('charges') // 'charges' | 'outstanding' | 'detail'
  const [month, setMonth] = useState('all')
  // "I need to be able to sort the billing page by family as well to make it
  // easier to record payments" (d406dd7a). Recording a stack of cheques means
  // working family by family; the server order is by what is owed and when.
  //
  // Two views, two habits, so the choice is per view and it is remembered.
  // Outstanding opens alphabetically: it is read as a list of families to chase
  // and the office looks people up by name — asked for twice now, the second
  // time after the dropdown already existed but reset to "most overdue" on
  // every visit (iCreate, 2026-08-25).
  const [sortByView, setSortByView] = useState(readSortPrefs)
  const sortBy = sortByView[view] ?? SORT_DEFAULTS[view] ?? 'default'
  const setSortBy = (next) => setSortByView((prev) => {
    const merged = { ...prev, [view]: next }
    writeSortPrefs(merged)
    return merged
  })
  const [ledger, setLedger] = useState(null)
  const [households, setHouseholds] = useState([])

  const [outstanding, setOutstanding] = useState(null)
  const [sendingReminders, setSendingReminders] = useState(false)

  const [detail, setDetail] = useState(null)
  const [detailHousehold, setDetailHousehold] = useState('')
  const [detailKind, setDetailKind] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [payFor, setPayFor] = useState(null)      // ledger row being paid
  const [refundFor, setRefundFor] = useState(null) // ledger row being refunded
  const [editPayment, setEditPayment] = useState(null) // recorded payment being corrected
  const [receiptFor, setReceiptFor] = useState(null) // ledger row for receipt print
  const [receiptReopen, setReceiptReopen] = useState(null) // invoice id to re-show after a correction
  const [invoiceFor, setInvoiceFor] = useState(null) // invoice id whose document is open

  const months = useMemo(monthOptions, [])

  // Sorting is client-side: every row already carries family_name, and the
  // server order (outstanding first, then soonest due) is the one to fall back
  // to rather than re-implement.
  const byFamily = (rows) => (!rows || sortBy !== 'family')
    ? rows
    : [...rows].sort((a, b) =>
        (a.family_name || '').localeCompare(b.family_name || '')
        || (a.student_name || '').localeCompare(b.student_name || ''))

  // ── Charges ledger ──────────────────────────────────────────────────────
  // Resolves to the rows it loaded: correcting a payment from a receipt reopens
  // that receipt, and it has to reopen on the reloaded row or it would show the
  // method that was just fixed.
  const loadLedger = useCallback(() => {
    if (!orgId) { setLedger([]); return Promise.resolve([]) }
    setLedger(null)
    let path = withOrg('/api/sis/billing/ledger', orgId)
    if (month !== 'all') path += `&month=${month}`
    return api.get(path)
      .then((r) => { const rows = r.data?.ledger || []; setLedger(rows); return rows })
      .catch(() => { toast.error('Failed to load charges'); setLedger([]); return [] })
  }, [orgId, month])

  const loadHouseholds = useCallback(() => {
    if (!orgId) { setHouseholds([]); return }
    api.get(withOrg('/api/sis/households', orgId))
      .then((r) => setHouseholds(r.data?.households || []))
      .catch(() => setHouseholds([]))
  }, [orgId])

  useEffect(() => { if (view === 'charges') loadLedger() }, [view, loadLedger])
  useEffect(() => { loadHouseholds() }, [loadHouseholds])

  // ── Outstanding ─────────────────────────────────────────────────────────
  const loadOutstanding = useCallback(() => {
    if (!orgId) { setOutstanding([]); return }
    setOutstanding(null)
    api.get(withOrg('/api/sis/billing/outstanding', orgId))
      .then((r) => setOutstanding(r.data?.outstanding || []))
      .catch(() => { toast.error('Failed to load outstanding balances'); setOutstanding([]) })
  }, [orgId])

  useEffect(() => { if (view === 'outstanding') loadOutstanding() }, [view, loadOutstanding])

  // ── Charge detail (reconciliation) ──────────────────────────────────────
  // UFA remits an amount and no statement of what it covers, so matching a $50
  // deposit meant opening invoices one at a time. This lists every charge line.
  const detailPath = useCallback(() => {
    let path = '/api/sis/billing/detail'
    const params = []
    if (detailHousehold) params.push(`household_id=${detailHousehold}`)
    if (detailKind) params.push(`kind=${detailKind}`)
    return params.length ? `${path}?${params.join('&')}` : path
  }, [detailHousehold, detailKind])

  const loadDetail = useCallback(() => {
    if (!orgId) { setDetail(null); return }
    setDetail(null)
    api.get(withOrg(detailPath(), orgId))
      .then((r) => setDetail(r.data?.report || null))
      .catch(() => { toast.error('Failed to load charge detail'); setDetail({ rows: [], payments: [], totals: {} }) })
  }, [orgId, detailPath])

  useEffect(() => { if (view === 'detail') loadDetail() }, [view, loadDetail])

  const downloadDetailCsv = useCallback(async () => {
    try {
      const path = detailPath()
      const res = await api.get(withOrg(`${path}${path.includes('?') ? '&' : '?'}format=csv`, orgId),
        { responseType: 'blob' })
      const url = window.URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'billing-detail.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch { toast.error('Failed to download CSV') }
  }, [orgId, detailPath])

  const sendReminders = async () => {
    setSendingReminders(true)
    try {
      const r = await api.post('/api/sis/billing/reminders/run', { organization_id: orgId })
      const d = r.data || {}
      toast.success(`Reminders sent: ${d.reminded ?? 0} (checked ${d.checked ?? 0}, skipped ${d.skipped ?? 0})`)
    } catch { toast.error('Could not send reminders') }
    finally { setSendingReminders(false) }
  }

  const printArea = () => { try { window.print() } catch { /* jsdom */ } }

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-neutral-900">Billing</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      <p className="text-sm text-neutral-500 mb-6 max-w-2xl">
        Payments are recorded here — families pay by Zelle or scholarship and the school logs
        it. Optio never processes money; this page is a record of who has paid and who still owes.
      </p>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 no-print">
        {[['charges', 'Charges'], ['outstanding', 'Outstanding'], ['detail', 'Charge detail']].map(([v, label]) => (
          <button
            key={v} onClick={() => setView(v)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${view === v
              ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
              : 'bg-white border border-gray-200 text-neutral-600 hover:border-gray-300'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Charges ─────────────────────────────────────────────────────── */}
      {view === 'charges' && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-4 no-print">
            <select
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
              value={month} onChange={(e) => setMonth(e.target.value)}
            >
              {months.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
              value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort"
            >
              <option value="default">Owed first</option>
              <option value="family">Family (A–Z)</option>
            </select>
            <div className="flex-1" />
            <Button size="sm" onClick={() => setShowAdd(true)}>+ Add charge</Button>
          </div>

          {ledger === null && <p className="text-neutral-500">Loading…</p>}
          {ledger?.length === 0 && (
            <p className="text-neutral-500">No charges here yet. Add a charge to get started.</p>
          )}
          {!!ledger?.length && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-neutral-400 border-b border-gray-200">
                    <th className="px-4 py-2">Family</th>
                    <th className="px-4 py-2">Student</th>
                    <th className="px-4 py-2">Charge</th>
                    <th className="px-4 py-2">Due</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-right no-print">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {byFamily(ledger).map((row) => {
                    const pill = rowPill(row)
                    const balance = row.balance_cents ?? ((row.total_cents || 0) - (row.amount_paid_cents || 0))
                    return (
                      <tr key={row.invoice_id}
                        onClick={() => setInvoiceFor(row.invoice_id)}
                        className="cursor-pointer hover:bg-neutral-50"
                        title="View the invoice this family was sent">
                        <td className="px-4 py-2 font-medium text-neutral-900">{row.family_name || '—'}</td>
                        <td className="px-4 py-2">{row.student_name || '—'}</td>
                        <td className="px-4 py-2 text-neutral-600">{row.description || '—'}</td>
                        <td className="px-4 py-2 text-neutral-600">{row.due_date ? String(row.due_date).slice(0, 10) : '—'}</td>
                        <td className="px-4 py-2 text-right font-medium">{money(row.total_cents)}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs rounded-full px-2 py-0.5 ${pill.cls}`}>{pill.text}</span>
                        </td>
                        {/* stopPropagation: the row opens the invoice, so a
                            click on Record payment must not do both. */}
                        <td className="px-4 py-2 text-right whitespace-nowrap no-print"
                          onClick={(e) => e.stopPropagation()}>
                          {balance > 0 ? (
                            <button className="text-optio-purple font-medium hover:underline"
                              onClick={() => setPayFor(row)}>Record payment</button>
                          ) : (
                            <button className="text-neutral-500 hover:underline"
                              onClick={() => setReceiptFor(row)}>Receipt</button>
                          )}
                          {(row.amount_paid_cents || 0) > 0 && (
                            <button className="ml-3 text-neutral-500 hover:underline"
                              onClick={() => setRefundFor(row)}>Refund</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Outstanding ─────────────────────────────────────────────────── */}
      {view === 'outstanding' && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-4 no-print">
            <Button size="sm" onClick={sendReminders} disabled={sendingReminders}>
              {sendingReminders ? 'Sending…' : 'Send payment reminders'}
            </Button>
            <Button size="sm" variant="secondary" onClick={printArea}>Print</Button>
            <div className="flex-1" />
            <select
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
              value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort"
            >
              <option value="default">Most overdue first</option>
              <option value="family">Family (A–Z)</option>
            </select>
          </div>
          {outstanding === null && <p className="text-neutral-500">Loading…</p>}
          {outstanding?.length === 0 && <p className="text-neutral-500">No outstanding balances. Every charge is paid up.</p>}
          {!!outstanding?.length && (
            <div className="print-area bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-neutral-400 border-b border-gray-200">
                    <th className="px-4 py-2">Family</th>
                    <th className="px-4 py-2">Student</th>
                    {/* The number the family sees on their own invoice and
                        receipt. Without it, chasing a payment means the office
                        and the parent naming the same invoice two ways. */}
                    <th className="px-4 py-2">Invoice</th>
                    <th className="px-4 py-2 text-right">Amount due</th>
                    <th className="px-4 py-2 text-right">Days overdue</th>
                    <th className="px-4 py-2">Due date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {byFamily(outstanding).map((row) => (
                    // The row opens what was actually sent. Chasing a payment
                    // starts with "what did we send them?", and reading it off a
                    // summary line is how the office and the family end up
                    // describing different documents.
                    <tr key={row.invoice_id}
                      onClick={() => setInvoiceFor(row.invoice_id)}
                      className="cursor-pointer hover:bg-neutral-50"
                      title="View the invoice this family was sent">
                      <td className="px-4 py-2 font-medium text-neutral-900">{row.family_name || '—'}</td>
                      <td className="px-4 py-2">{row.student_name || '—'}</td>
                      <td className="px-4 py-2 text-neutral-500 whitespace-nowrap">{row.invoice_number || '—'}</td>
                      <td className="px-4 py-2 text-right font-medium">{money(row.amount_due_cents)}</td>
                      <td className={`px-4 py-2 text-right ${row.days_overdue > 0 ? 'text-red-700 font-medium' : 'text-neutral-500'}`}>
                        {row.days_overdue > 0 ? row.days_overdue : '—'}
                      </td>
                      <td className="px-4 py-2 text-neutral-600">{row.due_date ? String(row.due_date).slice(0, 10) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Charge detail ───────────────────────────────────────────────── */}
      {view === 'detail' && (
        <div>
          <p className="text-sm text-neutral-500 mb-4 max-w-2xl">
            Every charge, line by line, next to the payments recorded against it. A payment that
            arrives from UFA says only how much — this is where you look up what that amount was for.
          </p>
          <div className="flex flex-wrap items-center gap-2 mb-4 no-print">
            <select
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
              value={detailHousehold} onChange={(e) => setDetailHousehold(e.target.value)}
              aria-label="Family"
            >
              <option value="">All families</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>{h.display_name || h.name || 'Unnamed family'}</option>
              ))}
            </select>
            <select
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
              value={detailKind} onChange={(e) => setDetailKind(e.target.value)}
              aria-label="Charge type"
            >
              <option value="">All charges</option>
              <option value="tuition">Tuition</option>
              <option value="supply">Supply fees</option>
              <option value="registration">Registration</option>
              <option value="fee">Other fees</option>
              <option value="unclassified">Unclassified</option>
            </select>
            <div className="flex-1" />
            <Button size="sm" variant="secondary" onClick={downloadDetailCsv} disabled={!detail?.rows?.length}>
              Download CSV
            </Button>
            <Button size="sm" variant="secondary" onClick={printArea}>Print</Button>
          </div>

          {detail === null && <p className="text-neutral-500">Loading…</p>}
          {detail?.rows?.length === 0 && (
            <p className="text-neutral-500">No charges match this filter.</p>
          )}
          {!!detail?.rows?.length && (
            <div className="print-area space-y-6">
              <div className="flex flex-wrap gap-4 text-sm no-print">
                <span className="text-neutral-500">
                  Charged <span className="font-semibold text-neutral-900">{money(detail.totals?.charged_cents)}</span>
                </span>
                <span className="text-neutral-500">
                  Paid <span className="font-semibold text-green-700">{money(detail.totals?.paid_cents)}</span>
                </span>
                <span className="text-neutral-500">
                  Balance <span className="font-semibold text-neutral-900">{money(detail.totals?.balance_cents)}</span>
                </span>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-neutral-400 border-b border-gray-200">
                      <th className="px-4 py-2">Family</th>
                      <th className="px-4 py-2">Student</th>
                      <th className="px-4 py-2">Invoice</th>
                      <th className="px-4 py-2">Charge</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                      <th className="px-4 py-2 text-right">Invoice balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {detail.rows.map((r, i) => (
                      <tr key={`${r.invoice_id}-${i}`}
                        onClick={() => setInvoiceFor(r.invoice_id)}
                        className="cursor-pointer hover:bg-neutral-50"
                        title="View the invoice this charge is on">
                        <td className="px-4 py-2 font-medium text-neutral-900">{r.family_name || '—'}</td>
                        <td className="px-4 py-2">{r.student_name || '—'}</td>
                        <td className="px-4 py-2 text-neutral-500 whitespace-nowrap">{r.invoice_number || '—'}</td>
                        <td className="px-4 py-2 text-neutral-600">{r.description || '—'}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs rounded-full px-2 py-0.5 ${KIND_PILL[r.kind] || KIND_PILL.unclassified}`}>
                            {KIND_LABEL[r.kind] || r.kind}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-medium">{money(r.amount_cents)}</td>
                        <td className="px-4 py-2 text-right text-neutral-500">{money(r.invoice_balance_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!!detail.payments?.length && (
                <div>
                  <h2 className="font-semibold text-neutral-900 mb-2">Payments recorded</h2>
                  <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-neutral-400 border-b border-gray-200">
                          <th className="px-4 py-2">Family</th>
                          <th className="px-4 py-2">Student</th>
                          <th className="px-4 py-2">Invoice</th>
                          <th className="px-4 py-2">Method</th>
                          <th className="px-4 py-2">Reference / note</th>
                          <th className="px-4 py-2">Recorded</th>
                          <th className="px-4 py-2 text-right">Amount</th>
                          <th className="px-4 py-2 sr-only">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {detail.payments.map((pmt, i) => (
                          <tr key={pmt.id || `${pmt.invoice_id}-pay-${i}`}>
                            <td className="px-4 py-2 font-medium text-neutral-900">{pmt.family_name || '—'}</td>
                            <td className="px-4 py-2">{pmt.student_name || '—'}</td>
                            <td className="px-4 py-2 text-neutral-500 whitespace-nowrap">{pmt.invoice_number || '—'}</td>
                            <td className="px-4 py-2">{payLabel(pmt)}</td>
                            <td className="px-4 py-2 text-neutral-600">{pmt.note || pmt.external_ref || '—'}</td>
                            <td className="px-4 py-2 text-neutral-600">
                              {pmt.recorded_at ? String(pmt.recorded_at).slice(0, 10) : '—'}
                            </td>
                            <td className={`px-4 py-2 text-right font-medium ${payAmountCls(pmt)}`}>{money(pmt.amount_cents)}</td>
                            <td className="px-4 py-2 text-right">
                              {pmt.id && (
                                <button className="text-xs text-optio-purple hover:underline"
                                  aria-label={`Correct payment for ${pmt.family_name || 'family'}`}
                                  onClick={() => setEditPayment(pmt)}>Correct</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <AddChargeModal
          orgId={orgId} households={households}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); loadLedger() }}
        />
      )}
      {payFor && (
        <RecordPaymentModal
          orgId={orgId} row={payFor}
          onClose={() => setPayFor(null)}
          onSaved={() => { setPayFor(null); loadLedger() }}
        />
      )}
      {refundFor && (
        <RecordRefundModal
          orgId={orgId} row={refundFor}
          onClose={() => setRefundFor(null)}
          onSaved={() => { setRefundFor(null); loadLedger() }}
        />
      )}
      {editPayment && (
        <EditPaymentModal
          orgId={orgId} payment={editPayment}
          onClose={() => { setEditPayment(null); setReceiptReopen(null) }}
          onSaved={() => {
            const reopen = receiptReopen
            setEditPayment(null)
            setReceiptReopen(null)
            if (view === 'detail') loadDetail()
            else if (view === 'outstanding') loadOutstanding()
            else loadLedger().then((rows) => {
              if (reopen) setReceiptFor(rows.find((r) => r.invoice_id === reopen) || null)
            })
          }}
        />
      )}
      {invoiceFor && (
        <InvoiceModal invoiceId={invoiceFor} orgId={orgId}
          onClose={() => setInvoiceFor(null)} onPrint={printArea}
          onChanged={() => { loadLedger(); if (view === 'outstanding') loadOutstanding() }} />
      )}
      {receiptFor && (
        <ReceiptModal row={receiptFor} onClose={() => setReceiptFor(null)} onPrint={printArea}
          onCorrect={(pmt) => {
            setReceiptReopen(receiptFor.invoice_id)
            setReceiptFor(null)
            setEditPayment(pmt)
          }} />
      )}
    </div>
  )
}

// ── Add charge ───────────────────────────────────────────────────────────────
const AddChargeModal = ({ orgId, households, onClose, onSaved }) => {
  const [householdId, setHouseholdId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [description, setDescription] = useState('')
  // Defaults to a plain fee. Naming it here is what lets the charge-detail
  // report answer "was that $50 a supply fee or a registration fee?" later.
  const [kind, setKind] = useState('fee')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  const students = useMemo(() => {
    const hh = households.find((h) => h.id === householdId)
    return (hh?.members || []).filter((m) => m.relationship === 'student')
  }, [households, householdId])

  const submit = async () => {
    if (!householdId) { toast.error('Pick a family'); return }
    if (!description.trim()) { toast.error('Description required'); return }
    const amount_cents = Math.round(parseFloat(amount) * 100)
    if (!amount_cents || amount_cents <= 0) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    try {
      await api.post('/api/sis/billing/charges', {
        organization_id: orgId,
        household_id: householdId,
        student_user_id: studentId || null,
        description: description.trim(),
        kind,
        amount_cents,
        due_date: dueDate || null,
      })
      toast.success('Charge added')
      onSaved()
    } catch { toast.error('Could not add charge') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Add charge" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Family</label>
          <SearchSelect
            value={householdId}
            onChange={(id) => { setHouseholdId(id); setStudentId('') }}
            options={households} getId={(h) => h.id} getLabel={(h) => h.display_name || h.name || 'Unnamed family'}
            placeholder="Search families…"
          />
        </div>
        {students.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Student (optional)</label>
            <SearchSelect
              value={studentId} onChange={setStudentId}
              options={students} getId={(s) => s.user_id} getLabel={(s) => s.name || 'Student'}
              placeholder="Whole family…"
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Description</label>
          <input className={field} placeholder="e.g. Fall tuition" value={description}
            onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Type</label>
          <select className={field} value={kind} onChange={(e) => setKind(e.target.value)}
            aria-label="Charge type">
            <option value="tuition">Tuition</option>
            <option value="supply">Supply fee</option>
            <option value="registration">Registration fee</option>
            <option value="fee">Other fee</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Amount ($)</label>
            <input className={field} type="number" min="0" step="0.01" placeholder="0.00"
              value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Due date (optional)</label>
            <input className={field} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? 'Adding…' : 'Add charge'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Correct a recorded payment ───────────────────────────────────────────────
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
              {!!doc.processing_fee_cents && (
                <div className="flex justify-between text-neutral-600">
                  <span>Processing fee</span><span>{money(doc.processing_fee_cents)}</span>
                </div>
              )}
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
const EditInvoiceModal = ({ invoiceId, orgId, doc, onCancel, onSaved }) => {
  const [lines, setLines] = useState(() => (doc.line_items || []).map((li) => ({
    description: li.description || '',
    amountStr: ((li.amount_cents || 0) / 100).toFixed(2),
    class_id: li.class_id || null,
    kind: li.kind || null,
  })))
  const [discountStr, setDiscountStr] = useState(((doc.discount_cents || 0) / 100).toFixed(2))
  const [feeStr, setFeeStr] = useState(((doc.processing_fee_cents || 0) / 100).toFixed(2))
  const [dueDate, setDueDate] = useState(doc.due_date ? String(doc.due_date).slice(0, 10) : '')
  const [saving, setSaving] = useState(false)

  const toCents = (str) => {
    const n = parseFloat(str)
    return Number.isFinite(n) ? Math.round(n * 100) : 0
  }
  const subtotal = lines.reduce((s, l) => s + toCents(l.amountStr), 0)
  const discount = Math.max(0, Math.min(toCents(discountStr), subtotal))
  const fee = Math.max(0, toCents(feeStr))
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
        processing_fee_cents: fee,
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
          <span>Card processing fee ($)</span>
          <input className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-optio-purple"
            type="number" min="0" step="0.01" value={feeStr}
            onChange={(e) => setFeeStr(e.target.value)} aria-label="Processing fee" />
        </div>
        <div className="flex items-center justify-between gap-3 text-neutral-600">
          <span>Due date</span>
          <input className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
            type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Due date" />
        </div>
        <div className="flex justify-between font-semibold text-neutral-900 pt-1">
          <span>Total</span><span>{money(total + fee)}</span>
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

export default BillingPage

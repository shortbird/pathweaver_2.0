import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import RecurringTuitionList, { useRecurringTuition } from './RecurringTuitionList'


import AddChargeModal from './billingPage/AddChargeModal'
import EditPaymentModal from './billingPage/EditPaymentModal'
import RecordPaymentModal from './billingPage/RecordPaymentModal'
import RecordRefundModal from './billingPage/RecordRefundModal'
import InvoiceModal from './billingPage/InvoiceModal'
import ReceiptModal from './billingPage/ReceiptModal'
import field from './billingPage/field'
import money from './billingPage/money'
import today from './billingPage/today'
import METHOD_LABEL from './billingPage/METHOD_LABEL'
import payLabel from './billingPage/payLabel'
import payAmountCls from './billingPage/payAmountCls'
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

// ── Search ──────────────────────────────────────────────────────────────────
// One box per table, matching every column that table shows. The office looks
// a row up by whatever it has to hand — a family name, an invoice number, the
// amount on a cheque stub — so the haystack is the row as it READS on screen:
// an amount is "$120.00" here and 12000 in the record, and nobody types cents.
// Every word has to match, so "bowman tuition" narrows instead of widening.
const matches = (query, fields) => {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const hay = fields.filter((v) => v != null && v !== '').join(' ').toLowerCase()
  return terms.every((t) => hay.includes(t))
}

const day = (v) => (v ? String(v).slice(0, 10) : '')

const ledgerText = (row) => [
  row.family_name, row.student_name, row.description, day(row.due_date),
  money(row.total_cents), rowPill(row).text, row.invoice_number,
]

const outstandingText = (row) => [
  row.family_name, row.student_name, row.invoice_number,
  money(row.amount_due_cents),
  row.days_overdue > 0 ? String(row.days_overdue) : '',
  day(row.due_date),
]

const detailRowText = (r) => [
  r.family_name, r.student_name, r.invoice_number, r.description,
  KIND_LABEL[r.kind] || r.kind, money(r.amount_cents), money(r.invoice_balance_cents),
]

const paymentText = (p) => [
  p.family_name, p.student_name, p.invoice_number, payLabel(p),
  p.note, p.external_ref, day(p.recorded_at), money(p.amount_cents),
]

const SearchBox = ({ value, onChange, label }) => (
  <input
    type="search"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder="Search…"
    aria-label={label}
    className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-optio-purple"
  />
)

// iCreate, 2026-09-02: a long invoice could not be scrolled back to the top.
// The card had no height cap, so a twenty-line invoice grew taller than the
// screen -- and the overlay centres its child, which pushes the overflow above
// the scroll origin where no scrollbar reaches it. Cap the card at the viewport
// and scroll its body instead: the title stays pinned, and every line item and
// the buttons under it stay reachable while viewing and while editing.
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
  const [view, setView] = useState('charges') // 'charges' | 'outstanding' | 'monthly' | 'detail'
  // A school billing a monthly rate has no invoice until the first month is
  // charged, so Charges and Outstanding are both empty while real money is
  // scheduled. Without this tab the Billing page said the school bills nothing.
  const { schedules: recurring, load: loadRecurring } = useRecurringTuition(orgId)
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
  // One query, kept across tabs: looking a family up on Charges and then
  // flipping to Outstanding is the same question asked twice.
  const [search, setSearch] = useState('')
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

  const visibleLedger = useMemo(
    () => (ledger || []).filter((r) => matches(search, ledgerText(r))), [ledger, search])
  const visibleOutstanding = useMemo(
    () => (outstanding || []).filter((r) => matches(search, outstandingText(r))), [outstanding, search])
  const visibleDetailRows = useMemo(
    () => (detail?.rows || []).filter((r) => matches(search, detailRowText(r))), [detail, search])
  const visibleDetailPayments = useMemo(
    () => (detail?.payments || []).filter((p) => matches(search, paymentText(p))), [detail, search])

  // Totals follow the search. Left describing every row, they would be read as
  // the total of what is on screen. Counted the way the server counts them:
  // charges line by line, invoice-level money once per invoice however many of
  // its lines matched.
  const detailTotals = useMemo(() => {
    if (!detail) return {}
    if (!search.trim()) return detail.totals || {}
    const once = (field) => {
      const seen = new Map()
      visibleDetailRows.forEach((r) => {
        if (!seen.has(r.invoice_id)) seen.set(r.invoice_id, r[field] || 0)
      })
      return [...seen.values()].reduce((n, v) => n + v, 0)
    }
    return {
      charged_cents: visibleDetailRows.reduce((n, r) => n + (r.amount_cents || 0), 0),
      paid_cents: once('invoice_paid_cents'),
      balance_cents: once('invoice_balance_cents'),
    }
  }, [detail, search, visibleDetailRows])

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
      // The download is of what the office is looking at, search included —
      // a CSV of rows the screen filtered out is the wrong reconciliation.
      const q = search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ''
      const res = await api.get(withOrg(`${path}${path.includes('?') ? '&' : '?'}format=csv${q}`, orgId),
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
  }, [orgId, detailPath, search])

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
          /* Print the whole invoice, not the slice that happens to be
             scrolled into view. */
          .modal-scroll { overflow: visible !important; max-height: none !important; }
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
        {[['charges', 'Charges'], ['outstanding', 'Outstanding'],
          ['monthly', `Monthly tuition${recurring?.length ? ` (${recurring.length})` : ''}`],
          ['detail', 'Charge detail']].map(([v, label]) => (
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

      {/* ── Monthly tuition ─────────────────────────────────────────────── */}
      {view === 'monthly' && (
        <div>
          <p className="text-sm text-neutral-500 mb-4 max-w-2xl">
            Students on a set monthly rate, charged automatically until the school stops it.
            A schedule only starts billing once the family saves a card, so anything below
            still marked as waiting has not been charged yet. Add and edit these on the{' '}
            <a href="/tuition" className="text-optio-purple hover:underline">Tuition</a> page.
          </p>
          <RecurringTuitionList
            orgId={orgId}
            schedules={recurring}
            onChanged={loadRecurring}
            emptyHint="No student is on a monthly rate. Set one up from the Tuition page."
          />
          {!!recurring?.length && (
            <p className="mt-4 text-sm text-neutral-500">
              Billing{' '}
              <strong className="text-neutral-800">
                {money(recurring.filter((s) => s.status === 'active')
                  .reduce((sum, s) => sum + (s.monthly_cents || 0), 0))}
              </strong>{' '}
              a month across this school.
            </p>
          )}
        </div>
      )}

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
            <SearchBox value={search} onChange={setSearch} label="Search charges" />
            <div className="flex-1" />
            <Button size="sm" onClick={() => setShowAdd(true)}>+ Add charge</Button>
          </div>

          {ledger === null && <p className="text-neutral-500">Loading…</p>}
          {ledger?.length === 0 && (
            <p className="text-neutral-500">No charges here yet. Add a charge to get started.</p>
          )}
          {!!ledger?.length && !visibleLedger.length && (
            <p className="text-neutral-500">No charges match “{search}”.</p>
          )}
          {!!visibleLedger.length && (
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
                  {byFamily(visibleLedger).map((row) => {
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
            <SearchBox value={search} onChange={setSearch} label="Search outstanding balances" />
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
          {!!outstanding?.length && !visibleOutstanding.length && (
            <p className="text-neutral-500">No balances match “{search}”.</p>
          )}
          {!!visibleOutstanding.length && (
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
                  {byFamily(visibleOutstanding).map((row) => (
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
            <SearchBox value={search} onChange={setSearch} label="Search charge detail" />
            <div className="flex-1" />
            <Button size="sm" variant="secondary" onClick={downloadDetailCsv} disabled={!visibleDetailRows.length}>
              Download CSV
            </Button>
            <Button size="sm" variant="secondary" onClick={printArea}>Print</Button>
          </div>

          {detail === null && <p className="text-neutral-500">Loading…</p>}
          {detail?.rows?.length === 0 && (
            <p className="text-neutral-500">No charges match this filter.</p>
          )}
          {!!detail?.rows?.length && !visibleDetailRows.length && (
            <p className="text-neutral-500">No charges match “{search}”.</p>
          )}
          {!!visibleDetailRows.length && (
            <div className="print-area space-y-6">
              <div className="flex flex-wrap gap-4 text-sm no-print">
                <span className="text-neutral-500">
                  Charged <span className="font-semibold text-neutral-900">{money(detailTotals.charged_cents)}</span>
                </span>
                <span className="text-neutral-500">
                  Paid <span className="font-semibold text-green-700">{money(detailTotals.paid_cents)}</span>
                </span>
                <span className="text-neutral-500">
                  Balance <span className="font-semibold text-neutral-900">{money(detailTotals.balance_cents)}</span>
                </span>
                {!!search.trim() && <span className="text-neutral-400">matching “{search}”</span>}
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
                    {visibleDetailRows.map((r, i) => (
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

              {!!visibleDetailPayments.length && (
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
                        {visibleDetailPayments.map((pmt, i) => (
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
export default BillingPage

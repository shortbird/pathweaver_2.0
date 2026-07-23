import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import SearchSelect from '../../components/ui/SearchSelect'
import ModalOverlay from '../../components/ui/ModalOverlay'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'
const money = (cents) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`)
const today = () => new Date().toISOString().slice(0, 10)

const PAYMENT_METHODS = [
  ['zelle', 'Zelle'], ['scholarship', 'Scholarship'], ['cash', 'Cash'],
  ['check', 'Check'], ['other', 'Other'],
]
const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS)

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

const BillingPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [view, setView] = useState('charges') // 'charges' | 'outstanding'
  const [month, setMonth] = useState('all')
  const [ledger, setLedger] = useState(null)
  const [households, setHouseholds] = useState([])

  const [outstanding, setOutstanding] = useState(null)
  const [sendingReminders, setSendingReminders] = useState(false)

  const [showAdd, setShowAdd] = useState(false)
  const [payFor, setPayFor] = useState(null)      // ledger row being paid
  const [receiptFor, setReceiptFor] = useState(null) // ledger row for receipt print

  const months = useMemo(monthOptions, [])

  // ── Charges ledger ──────────────────────────────────────────────────────
  const loadLedger = useCallback(() => {
    if (!orgId) { setLedger([]); return }
    setLedger(null)
    let path = withOrg('/api/sis/billing/ledger', orgId)
    if (month !== 'all') path += `&month=${month}`
    api.get(path)
      .then((r) => setLedger(r.data?.ledger || []))
      .catch(() => { toast.error('Failed to load charges'); setLedger([]) })
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
        {[['charges', 'Charges'], ['outstanding', 'Outstanding']].map(([v, label]) => (
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
                  {ledger.map((row) => {
                    const pill = rowPill(row)
                    const balance = row.balance_cents ?? ((row.total_cents || 0) - (row.amount_paid_cents || 0))
                    return (
                      <tr key={row.invoice_id}>
                        <td className="px-4 py-2 font-medium text-neutral-900">{row.family_name || '—'}</td>
                        <td className="px-4 py-2">{row.student_name || '—'}</td>
                        <td className="px-4 py-2 text-neutral-600">{row.description || '—'}</td>
                        <td className="px-4 py-2 text-neutral-600">{row.due_date ? String(row.due_date).slice(0, 10) : '—'}</td>
                        <td className="px-4 py-2 text-right font-medium">{money(row.total_cents)}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs rounded-full px-2 py-0.5 ${pill.cls}`}>{pill.text}</span>
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap no-print">
                          {balance > 0 ? (
                            <button className="text-optio-purple font-medium hover:underline"
                              onClick={() => setPayFor(row)}>Record payment</button>
                          ) : (
                            <button className="text-neutral-500 hover:underline"
                              onClick={() => setReceiptFor(row)}>Receipt</button>
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
                    <th className="px-4 py-2 text-right">Amount due</th>
                    <th className="px-4 py-2 text-right">Days overdue</th>
                    <th className="px-4 py-2">Due date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {outstanding.map((row) => (
                    <tr key={row.invoice_id}>
                      <td className="px-4 py-2 font-medium text-neutral-900">{row.family_name || '—'}</td>
                      <td className="px-4 py-2">{row.student_name || '—'}</td>
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
      {receiptFor && (
        <ReceiptModal row={receiptFor} onClose={() => setReceiptFor(null)} onPrint={printArea} />
      )}
    </div>
  )
}

// ── Add charge ───────────────────────────────────────────────────────────────
const AddChargeModal = ({ orgId, households, onClose, onSaved }) => {
  const [householdId, setHouseholdId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [description, setDescription] = useState('')
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
            options={households} getId={(h) => h.id} getLabel={(h) => h.name || 'Unnamed family'}
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

// ── Receipt (printable) ──────────────────────────────────────────────────────
const ReceiptModal = ({ row, onClose, onPrint }) => (
  <Modal title="Receipt" onClose={onClose}>
    <div className="print-area">
      <div className="border border-gray-200 rounded-lg p-4 text-sm space-y-2">
        <div className="text-lg font-semibold text-neutral-900">Payment receipt</div>
        <div className="flex justify-between"><span className="text-neutral-500">Family</span><span>{row.family_name || '—'}</span></div>
        {row.student_name && (
          <div className="flex justify-between"><span className="text-neutral-500">Student</span><span>{row.student_name}</span></div>
        )}
        <div className="flex justify-between"><span className="text-neutral-500">Charge</span><span>{row.description || '—'}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Method</span><span>{METHOD_LABEL[row.method] || row.method || '—'}</span></div>
        {row.paid_at && (
          <div className="flex justify-between"><span className="text-neutral-500">Paid on</span><span>{String(row.paid_at).slice(0, 10)}</span></div>
        )}
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

export default BillingPage

import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

const field = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'
const money = (cents) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`)
const STATUS_STYLES = {
  draft: 'bg-neutral-100 text-neutral-500', sent: 'bg-blue-100 text-blue-700',
  partial: 'bg-amber-100 text-amber-700', paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700', void: 'bg-neutral-100 text-neutral-400',
}
const RULE_TYPES = [['sibling', 'Sibling'], ['multi_class', 'Multi-class'], ['promo', 'Promo code'], ['manual', 'Manual']]

const BillingPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [invoices, setInvoices] = useState([])
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [newRule, setNewRule] = useState({ name: '', rule_type: 'sibling', percent: '', amount: '', code: '', threshold: '2' })
  const [view, setView] = useState('invoices') // 'invoices' | 'outstanding'
  const [outstanding, setOutstanding] = useState(null)
  const [sendingReminders, setSendingReminders] = useState(false)

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      api.get(withOrg('/api/sis/invoices', orgId)),
      api.get(withOrg('/api/sis/discount-rules', orgId)),
    ])
      .then(([i, r]) => { setInvoices(i.data?.invoices || []); setRules(r.data?.rules || []) })
      .catch(() => toast.error('Failed to load billing'))
      .finally(() => setLoading(false))
  }, [orgId])

  useEffect(() => { load() }, [load])

  const openInvoice = async (id) => {
    try {
      const r = await api.get(`/api/sis/invoices/${id}?organization_id=${orgId}`)
      setSelected(r.data?.invoice || null)
    } catch { toast.error('Could not open invoice') }
  }

  const createRule = async () => {
    if (!newRule.name.trim()) { toast.error('Name required'); return }
    const criteria = {}
    if (newRule.percent) criteria.percent = parseFloat(newRule.percent)
    if (newRule.amount) criteria.amount_cents = Math.round(parseFloat(newRule.amount) * 100)
    if (newRule.rule_type === 'sibling') criteria.min_students = parseInt(newRule.threshold, 10) || 2
    if (newRule.rule_type === 'multi_class') criteria.min_classes = parseInt(newRule.threshold, 10) || 2
    if (newRule.rule_type === 'promo') criteria.code = newRule.code
    try {
      await api.post('/api/sis/discount-rules', { name: newRule.name.trim(), rule_type: newRule.rule_type, criteria, organization_id: orgId })
      setNewRule({ name: '', rule_type: 'sibling', percent: '', amount: '', code: '', threshold: '2' })
      toast.success('Discount rule added')
      load()
    } catch { toast.error('Could not add rule') }
  }

  const recordPayment = async (invoice) => {
    const dollars = window.prompt('Payment amount ($):')
    if (!dollars) return
    const amount_cents = Math.round(parseFloat(dollars) * 100)
    if (!amount_cents || amount_cents <= 0) { toast.error('Invalid amount'); return }
    try {
      await api.post(`/api/sis/invoices/${invoice.id}/payments`, { amount_cents, method: 'sbs', organization_id: orgId })
      toast.success('Payment recorded')
      openInvoice(invoice.id); load()
    } catch { toast.error('Could not record payment') }
  }

  const loadOutstanding = useCallback(() => {
    if (!orgId) return
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

  const printOutstanding = () => { try { window.print() } catch { /* jsdom */ } }

  const createPlan = async (invoice, cadence) => {
    const count = cadence === 'monthly' ? parseInt(window.prompt('How many monthly installments?', '3') || '0', 10) : (cadence === 'semester' ? 2 : 1)
    if (cadence === 'monthly' && (!count || count < 1)) return
    try {
      await api.post(`/api/sis/invoices/${invoice.id}/payment-plan`, {
        cadence, installment_count: count, start_date: new Date().toISOString().slice(0, 10), organization_id: orgId,
      })
      toast.success('Payment plan created')
      openInvoice(invoice.id)
    } catch { toast.error('Could not create plan') }
  }

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .outstanding-print-area, .outstanding-print-area * { visibility: visible; }
          .outstanding-print-area { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Billing</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[['invoices', 'Invoices'], ['outstanding', 'Outstanding']].map(([v, label]) => (
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

      {view === 'outstanding' && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Button size="sm" onClick={sendReminders} disabled={sendingReminders}>
              {sendingReminders ? 'Sending…' : 'Send payment reminders'}
            </Button>
            <Button size="sm" variant="secondary" onClick={printOutstanding}>Print</Button>
          </div>
          {outstanding === null && <p className="text-neutral-500">Loading…</p>}
          {outstanding?.length === 0 && <p className="text-neutral-500">No outstanding balances. Every invoice is paid up.</p>}
          {!!outstanding?.length && (
            <div className="outstanding-print-area bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-neutral-400 border-b border-gray-200">
                    <th className="px-4 py-2">Family</th>
                    <th className="px-4 py-2">Student</th>
                    <th className="px-4 py-2 text-right">Amount due</th>
                    <th className="px-4 py-2 text-right">Days overdue</th>
                    <th className="px-4 py-2">Unpaid installments</th>
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
                      <td className="px-4 py-2 text-neutral-600">
                        {(row.unpaid_installments || []).map((i) => `${i.due_date} ${money(i.amount_cents)}`).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === 'invoices' && (<>
      {/* Discount rules */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <h2 className="font-semibold text-neutral-900 mb-3">Discount rules</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {rules.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-[#F3EFF4] px-3 py-1 text-sm text-neutral-700">
              {r.name}<span className="text-neutral-400">· {r.rule_type}{r.active ? '' : ' (off)'}</span>
            </span>
          ))}
          {!rules.length && <span className="text-sm text-neutral-400">No discount rules yet.</span>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <input className={`${field} col-span-2`} placeholder="Rule name" value={newRule.name} onChange={(e) => setNewRule({ ...newRule, name: e.target.value })} />
          <select className={field} value={newRule.rule_type} onChange={(e) => setNewRule({ ...newRule, rule_type: e.target.value })}>
            {RULE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input className={field} placeholder="% off" value={newRule.percent} onChange={(e) => setNewRule({ ...newRule, percent: e.target.value })} />
          <input className={field} placeholder="$ off" value={newRule.amount} onChange={(e) => setNewRule({ ...newRule, amount: e.target.value })} />
          <Button size="sm" onClick={createRule}>Add rule</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="font-semibold text-neutral-900 mb-3">Invoices</h2>
          {loading && <p className="text-neutral-500">Loading…</p>}
          {!loading && !invoices.length && <p className="text-neutral-500">No invoices yet. Generate one from a completed registration.</p>}
          <div className="space-y-2">
            {invoices.map((inv) => (
              <button key={inv.id} onClick={() => openInvoice(inv.id)}
                className={`w-full text-left bg-white rounded-xl border p-4 ${selected?.id === inv.id ? 'border-optio-purple' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-900">{money(inv.total_cents)}</span>
                  <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_STYLES[inv.status] || ''}`}>{inv.status}</span>
                </div>
                <div className="text-sm text-neutral-400 mt-0.5">Paid {money(inv.amount_paid_cents)} · disc {money(inv.discount_cents)}</div>
              </button>
            ))}
          </div>
        </div>

        {selected && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 h-fit">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-neutral-900">Invoice · {money(selected.total_cents)}</h3>
              <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_STYLES[selected.status] || ''}`}>{selected.status}</span>
            </div>
            <div className="space-y-1 text-sm mb-3">
              {(selected.line_items || []).map((li) => (
                <div key={li.id} className="flex justify-between"><span>{li.description}</span><span>{money(li.amount_cents)}</span></div>
              ))}
              <div className="flex justify-between text-neutral-500 border-t border-gray-100 pt-1"><span>Discount</span><span>-{money(selected.discount_cents)}</span></div>
              <div className="flex justify-between font-medium"><span>Total</span><span>{money(selected.total_cents)}</span></div>
              <div className="flex justify-between text-green-700"><span>Paid</span><span>{money(selected.amount_paid_cents)}</span></div>
            </div>

            {(selected.payment_plans || []).map((plan) => (
              <div key={plan.id} className="border-t border-gray-100 pt-2 mb-2">
                <div className="text-xs text-neutral-500 mb-1">{plan.cadence} plan · {plan.installment_count} installments</div>
                {(plan.installments || []).map((i) => (
                  <div key={i.id} className="flex justify-between text-sm">
                    <span className="text-neutral-600">{i.due_date}</span>
                    <span>{money(i.amount_cents)} · {i.status}</span>
                  </div>
                ))}
              </div>
            ))}

            <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
              <Button size="sm" onClick={() => recordPayment(selected)}>Record payment</Button>
              {!(selected.payment_plans || []).length && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => createPlan(selected, 'monthly')}>Monthly plan</Button>
                  <Button size="sm" variant="secondary" onClick={() => createPlan(selected, 'full')}>Pay in full</Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      </>)}
    </div>
  )
}

export default BillingPage

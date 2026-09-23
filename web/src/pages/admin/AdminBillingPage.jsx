import React, { useMemo, useState } from 'react'
import { useAdminInvoiceAction, useAdminInvoices } from '../../hooks/api/useAdminBilling'
import { useSisOrg } from '../sis/useSisOrg'
import { ConfirmDialog } from '../../components/ui'
import { formatCents } from '../../utils/money'

/**
 * /admin/billing: Optio's own invoices, on Optio's Stripe account.
 *
 * Send an invoice to anyone, and link it to an organization when it is for
 * one. Stripe emails it, and the recipient pays by bank transfer (ACH) at no
 * cost. There is no card option by decision; a card payer emails Optio, and
 * that payment is recorded here with Mark paid. The daily sweep sends
 * reminders (3 days before the due date, on it, then weekly). The whole /admin
 * tree is superadmin only.
 */

const STATUS_STYLES = {
  open: 'bg-blue-50 text-blue-700',
  overdue: 'bg-red-50 text-red-700',
  processing: 'bg-amber-50 text-amber-700',
  paid: 'bg-green-50 text-green-700',
  void: 'bg-gray-100 text-gray-500',
  uncollectible: 'bg-gray-100 text-gray-500',
  draft: 'bg-gray-100 text-gray-500',
}
const STATUS_LABELS = { processing: 'Bank transfer in progress' }
const PAID_VIA = { bank: 'bank transfer', outside: 'outside Stripe' }

const blankLine = () => ({ description: '', amount: '', quantity: '1' })
const blankForm = () => ({ email: '', name: '', orgId: '', memo: '', days: null, lines: [blankLine()] })

const toCents = (amount) => {
  const n = Number(String(amount).replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}

const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm'

export default function AdminBillingPage() {
  const { orgs } = useSisOrg()
  const [filterOrg, setFilterOrg] = useState('')
  const { data, error: loadError } = useAdminInvoices(filterOrg)
  // Unfiltered, for past recipients and the per-org email fill. Shares the
  // cache with the list above whenever no filter is set.
  const { data: everything } = useAdminInvoices('')
  const action = useAdminInvoiceAction()
  const [form, setForm] = useState(blankForm)
  const [error, setError] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const orgName = useMemo(() => Object.fromEntries((orgs || []).map(o => [o.id, o.name])), [orgs])
  const sortedOrgs = useMemo(() => [...(orgs || [])].sort((a, b) => a.name.localeCompare(b.name)), [orgs])
  const pastRecipients = useMemo(() => {
    const seen = new Map()
    for (const inv of everything?.invoices || []) {
      if (inv.recipient_email && !seen.has(inv.recipient_email)) seen.set(inv.recipient_email, inv)
    }
    return [...seen.values()]
  }, [everything])

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }))

  // Picking an org fills the recipient from the newest invoice sent for it,
  // unless an email is already typed.
  const pickOrg = (orgId) => {
    setForm(f => {
      if (f.email || !orgId) return { ...f, orgId }
      const last = (everything?.invoices || []).find(i => i.organization_id === orgId)
      return { ...f, orgId, email: last?.recipient_email || '', name: last?.recipient_name || f.name }
    })
  }
  // Picking a past recipient fills the name they were billed under.
  const pickEmail = (email) => {
    setForm(f => {
      const past = pastRecipients.find(p => p.recipient_email === email.trim().toLowerCase())
      return { ...f, email, name: f.name || past?.recipient_name || '' }
    })
  }
  const updateLine = (i, key, value) =>
    setForm(f => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, [key]: value } : l)) }))

  const cleanLines = form.lines
    .filter(l => l.description.trim() || l.amount)
    .map(l => ({
      description: l.description.trim(),
      amount_cents: toCents(l.amount),
      quantity: parseInt(l.quantity, 10) || 1,
    }))
  const total = cleanLines.reduce((sum, l) => sum + (l.amount_cents || 0) * l.quantity, 0)
  const canSend = form.email.includes('@') && cleanLines.length > 0 &&
    cleanLines.every(l => l.description && l.amount_cents > 0)
  const daysValue = form.days ?? String(data?.default_days_until_due || 30)

  const run = async (op, failure) => {
    setError(null)
    try {
      return await action.mutateAsync(op)
    } catch (err) {
      setError(err.response?.data?.error || failure)
      throw err
    }
  }

  const send = async () => {
    await run({
      kind: 'send',
      body: {
        recipient_email: form.email.trim(),
        recipient_name: form.name.trim(),
        organization_id: form.orgId || null,
        lines: cleanLines,
        memo: form.memo,
        days_until_due: parseInt(daysValue, 10),
      },
    }, 'Could not send the invoice')
    setForm(blankForm())
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {(error || loadError) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex justify-between">
          <span>{error || loadError.response?.data?.error || 'Could not load invoices'}</span>
          {error && <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">Dismiss</button>}
        </div>
      )}

      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-lg font-semibold mb-1">New invoice</h2>
        <p className="text-sm text-gray-500 mb-4">
          Stripe emails it. The recipient pays by bank transfer (ACH) at no cost.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">Recipient email</span>
            <input
              type="email" list="billing-recipients" value={form.email}
              onChange={e => pickEmail(e.target.value)}
              className={inputClass} placeholder="billing@school.org"
            />
          </label>
          <datalist id="billing-recipients">
            {pastRecipients.map(p => (
              <option key={p.recipient_email} value={p.recipient_email}>{p.recipient_name || ''}</option>
            ))}
          </datalist>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">Bill to (name on invoice)</span>
            <input value={form.name} onChange={e => set('name', e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">Organization (optional)</span>
            <select value={form.orgId} onChange={e => pickOrg(e.target.value)} className={inputClass}>
              <option value="">None</option>
              {sortedOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        </div>

        <div className="space-y-2 mt-5">
          {form.lines.map((l, i) => (
            <div key={i} className="grid gap-2 grid-cols-[1fr_7rem_4.5rem_auto] items-center">
              <input
                aria-label="Description" value={l.description}
                onChange={e => updateLine(i, 'description', e.target.value)}
                className={inputClass} placeholder="Description"
              />
              <input
                aria-label="Amount" inputMode="decimal" value={l.amount}
                onChange={e => updateLine(i, 'amount', e.target.value)}
                className={inputClass} placeholder="$0.00"
              />
              <input
                aria-label="Quantity" inputMode="numeric" value={l.quantity}
                onChange={e => updateLine(i, 'quantity', e.target.value)}
                className={inputClass} placeholder="Qty"
              />
              <button
                onClick={() => setForm(f => ({
                  ...f, lines: f.lines.length > 1 ? f.lines.filter((_, j) => j !== i) : [blankLine()],
                }))}
                className="text-sm text-gray-400 hover:text-red-600 px-2"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            onClick={() => setForm(f => ({ ...f, lines: [...f.lines, blankLine()] }))}
            className="text-sm text-optio-purple hover:underline"
          >
            Add line
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_10rem] mt-4">
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">Memo (optional, shown on the invoice)</span>
            <input value={form.memo} onChange={e => set('memo', e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">Days until due</span>
            <input inputMode="numeric" value={daysValue} onChange={e => set('days', e.target.value)} className={inputClass} />
          </label>
        </div>

        <div className="flex items-center justify-between mt-5">
          <span className="text-sm text-gray-600">Total <strong className="text-gray-900">{formatCents(total)}</strong></span>
          <button
            disabled={!canSend}
            onClick={() => setConfirm({ kind: 'send' })}
            className="btn-primary px-4 py-2 rounded-lg disabled:opacity-40"
          >
            Send invoice
          </button>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
          <h2 className="text-lg font-semibold">Invoices</h2>
          <select
            aria-label="Filter by organization" value={filterOrg}
            onChange={e => setFilterOrg(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">All invoices</option>
            {sortedOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        {!data ? (
          <p className="text-sm text-gray-500">{loadError ? '' : 'Loading invoices...'}</p>
        ) : !data.invoices.length ? (
          <p className="text-sm text-gray-500">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Invoice</th>
                  <th className="px-4 py-2 font-medium">Recipient</th>
                  <th className="px-4 py-2 font-medium">Sent</th>
                  <th className="px-4 py-2 font-medium">Due</th>
                  <th className="px-4 py-2 font-medium text-right">Amount</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.invoices.map(inv => {
                  const actionable = ['open', 'overdue'].includes(inv.status)
                  return (
                    <tr key={inv.id} className="border-t align-top">
                      <td className="px-4 py-3">
                        <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer" className="text-optio-purple hover:underline">
                          {inv.number || inv.id}
                        </a>
                        {inv.memo && <div className="text-xs text-gray-500">{inv.memo}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div>{inv.recipient_name || inv.recipient_email}</div>
                        {inv.recipient_name && <div className="text-xs text-gray-500">{inv.recipient_email}</div>}
                        {inv.organization_id && (
                          <div className="text-xs text-gray-500">{orgName[inv.organization_id] || 'Linked org'}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{inv.created}</td>
                      <td className="px-4 py-3 text-gray-600">{inv.due_date || '—'}</td>
                      <td className="px-4 py-3 text-right">{formatCents(inv.total_cents)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[inv.status] || 'bg-gray-100'}`}>
                          {STATUS_LABELS[inv.status] || inv.status}
                        </span>
                        {inv.paid_via && <div className="text-xs text-gray-500 mt-1">by {PAID_VIA[inv.paid_via]}</div>}
                        {actionable && inv.last_reminder_on && (
                          <div className="text-xs text-gray-500 mt-1">reminded {inv.last_reminder_on}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right space-x-3">
                        {inv.invoice_pdf && <a href={inv.invoice_pdf} className="text-gray-500 hover:text-gray-800">PDF</a>}
                        {actionable && (
                          <>
                            <button onClick={() => setConfirm({ kind: 'remind', inv })} className="text-gray-500 hover:text-gray-800">Remind</button>
                            <button onClick={() => setConfirm({ kind: 'mark-paid', inv })} className="text-gray-500 hover:text-gray-800">Mark paid</button>
                            <button onClick={() => setConfirm({ kind: 'void', inv })} className="text-red-500 hover:text-red-700">Void</button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        isOpen={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        destructive={confirm?.kind === 'void'}
        title={{
          send: `Send ${formatCents(total)} invoice?`,
          remind: `Email ${confirm?.inv?.number} again?`,
          'mark-paid': `Mark ${confirm?.inv?.number} paid?`,
          void: `Void ${confirm?.inv?.number}?`,
        }[confirm?.kind]}
        confirmLabel={{ send: 'Send', remind: 'Send reminder', 'mark-paid': 'Mark paid', void: 'Void invoice' }[confirm?.kind]}
        onConfirm={() => (confirm.kind === 'send'
          ? send()
          : run({ kind: confirm.kind, invoiceId: confirm.inv.id }, 'That did not work'))}
      >
        {{
          send: `Stripe emails it to ${form.email.trim()} now.${form.orgId ? ` Linked to ${orgName[form.orgId]}.` : ''}`,
          remind: `Stripe emails the invoice to ${confirm?.inv?.recipient_email} again.`,
          'mark-paid': 'Use this for a check, a wire or a card payment taken outside this invoice. The invoice stops taking payments.',
          void: 'The recipient can no longer pay it. This cannot be undone.',
        }[confirm?.kind]}
      </ConfirmDialog>
    </div>
  )
}

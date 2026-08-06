import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

/**
 * Tuition Approver — the step after a CLP meeting.
 *
 * The left pane lists every student whose CLP is marked done but who hasn't been
 * invoiced yet. Selecting one loads the invoice that WILL be sent — seeded from
 * their finalized schedule (per-class tuition, or a single flat line for a UFA
 * academy student) — which the approver verifies and can adjust line by line
 * before sending. Sending creates one invoice for the student and emails the
 * family a link to pay on the /family/billing portal. UFA-funded families are
 * flagged: they pay through UFA, so the invoice is a record rather than a card
 * charge.
 */

const money = (cents) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`)
const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const toCents = (str) => {
  const n = parseFloat(str)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

const TuitionApprovalPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [queue, setQueue] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [preview, setPreview] = useState(null)
  const [lines, setLines] = useState([]) // [{ description, amountStr, class_id }]
  const [discountStr, setDiscountStr] = useState('0')
  const [note, setNote] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [sending, setSending] = useState(false)

  const loadQueue = useCallback(() => {
    if (!orgId) { setQueue([]); return }
    setQueue(null)
    api.get(withOrg('/api/sis/tuition/queue', orgId))
      .then((r) => setQueue(r.data?.students || []))
      .catch(() => { toast.error('Failed to load the tuition queue'); setQueue([]) })
  }, [orgId])

  useEffect(() => { loadQueue() }, [loadQueue])
  // Org switch clears any in-progress selection.
  useEffect(() => { setSelectedId(null); setPreview(null) }, [orgId])

  const selectStudent = useCallback((sid) => {
    setSelectedId(sid); setPreview(null); setLines([])
    api.get(withOrg(`/api/sis/tuition/students/${sid}/preview`, orgId))
      .then((r) => {
        const p = r.data || {}
        setPreview(p)
        setLines((p.line_items || []).map((li) => ({
          description: li.description || '',
          amountStr: ((li.amount_cents || 0) / 100).toFixed(2),
          class_id: li.class_id || null,
        })))
        setDiscountStr('0'); setNote(''); setDueDate('')
      })
      .catch(() => { toast.error('Failed to load the invoice preview'); setSelectedId(null) })
  }, [orgId])

  const subtotal = useMemo(() => lines.reduce((s, l) => s + toCents(l.amountStr), 0), [lines])
  const discountCents = Math.max(0, Math.min(toCents(discountStr), subtotal))
  const total = subtotal - discountCents

  const updateLine = (i, patch) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const removeLine = (i) => setLines((ls) => ls.filter((_, idx) => idx !== i))
  const addLine = () => setLines((ls) => [...ls, { description: '', amountStr: '0.00', class_id: null }])

  const send = async () => {
    const lineItems = lines
      .filter((l) => l.description.trim())
      .map((l) => ({ description: l.description.trim(), amount_cents: toCents(l.amountStr), class_id: l.class_id }))
    if (!lineItems.length) { toast.error('Add at least one line item'); return }
    if (lineItems.some((l) => l.amount_cents < 0)) { toast.error('Amounts must be zero or more'); return }
    setSending(true)
    try {
      const r = await api.post(`/api/sis/tuition/students/${selectedId}/invoice`, {
        organization_id: orgId,
        line_items: lineItems,
        discount_cents: discountCents,
        note: note.trim() || null,
        due_date: dueDate || null,
      })
      const emailed = r.data?.emailed ?? 0
      toast.success(`Invoice sent${emailed ? ` · emailed ${emailed} guardian${emailed > 1 ? 's' : ''}` : ''}`)
      setSelectedId(null); setPreview(null); loadQueue()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not send the invoice')
    } finally { setSending(false) }
  }

  const org = preview?.organization || {}

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-neutral-900">Tuition</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>
      <p className="text-sm text-neutral-500 mb-6 max-w-2xl">
        Students whose CLP is done, waiting on a tuition invoice. Open one to verify the tuition
        against their schedule, adjust it if needed, and send the invoice to the family.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_1fr] gap-6">
        {/* ── Queue ─────────────────────────────────────────────────────── */}
        <div>
          {queue === null && <p className="text-neutral-500">Loading…</p>}
          {queue?.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-neutral-500">
              No students are waiting for a tuition invoice. Mark a CLP done and the student appears here.
            </div>
          )}
          {!!queue?.length && (
            <div className="space-y-2">
              {queue.map((s) => {
                const active = s.student_id === selectedId
                return (
                  <button
                    key={s.student_id}
                    onClick={() => selectStudent(s.student_id)}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${active
                      ? 'border-optio-purple bg-[#F7F2FB]'
                      : 'border-gray-200 bg-white hover:border-gray-300'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-neutral-900">{s.name}</span>
                      <span className="text-sm font-semibold text-neutral-700">{money(s.estimated_total_cents)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                      <span>{s.household_name || 'No family'}</span>
                      <span>·</span>
                      <span>{s.class_count} {s.class_count === 1 ? 'class' : 'classes'}</span>
                      {s.pay_through_ufa && (
                        <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">UFA</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Invoice preview + editor ──────────────────────────────────── */}
        <div>
          {!selectedId && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-neutral-500">
              Select a student to preview their tuition invoice.
            </div>
          )}
          {selectedId && preview === null && <p className="text-neutral-500">Loading invoice…</p>}
          {selectedId && preview && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              {/* Invoice header */}
              <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4 mb-4">
                <div className="flex items-center gap-3">
                  {org.logo_url && <img src={org.logo_url} alt="" className="h-9 w-auto" />}
                  <div>
                    <div className="font-semibold text-neutral-900">{org.name || 'Tuition invoice'}</div>
                    <div className="text-xs text-neutral-400">Tuition invoice</div>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-medium text-neutral-900">{preview.student?.name}</div>
                  <div className="text-neutral-500">{preview.household_name || 'No family'}</div>
                  {preview.funding_label && (
                    <span className="mt-1 inline-block rounded-full bg-neutral-100 text-neutral-600 px-2 py-0.5 text-xs">
                      {preview.funding_label}
                    </span>
                  )}
                </div>
              </div>

              {preview.pay_through_ufa && (
                <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                  This family pays through UFA. The invoice is sent for their records — the family
                  is asked to pay through UFA, and no card payment is collected in Optio.
                </div>
              )}
              {preview.already_invoiced && preview.existing_invoice && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  This student was already invoiced ({preview.existing_invoice.invoice_number || 'invoice'} ·{' '}
                  {preview.existing_invoice.status}). Sending again creates a second invoice.
                </div>
              )}

              {/* Line items (editable) */}
              <div className="space-y-2">
                <div className="flex text-xs uppercase tracking-wide text-neutral-400 px-1">
                  <span className="flex-1">Description</span>
                  <span className="w-32 text-right">Amount ($)</span>
                  <span className="w-8" />
                </div>
                {lines.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className={`${field} flex-1`}
                      placeholder="Class or fee"
                      value={l.description}
                      onChange={(e) => updateLine(i, { description: e.target.value })}
                    />
                    <input
                      className={`${field} w-32 text-right`}
                      type="number" min="0" step="0.01"
                      value={l.amountStr}
                      onChange={(e) => updateLine(i, { amountStr: e.target.value })}
                    />
                    <button
                      className="w-8 text-neutral-400 hover:text-red-500 text-lg"
                      onClick={() => removeLine(i)} aria-label="Remove line"
                    >×</button>
                  </div>
                ))}
                <button className="text-sm text-optio-purple font-medium hover:underline" onClick={addLine}>
                  + Add line
                </button>
              </div>

              {/* Totals */}
              <div className="mt-5 border-t border-gray-100 pt-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-neutral-600">
                  <span>Subtotal</span><span>{money(subtotal)}</span>
                </div>
                <div className="flex justify-between items-center text-neutral-600">
                  <span>Discount ($)</span>
                  <input
                    className={`${field} w-32 text-right`}
                    type="number" min="0" step="0.01"
                    value={discountStr}
                    onChange={(e) => setDiscountStr(e.target.value)}
                  />
                </div>
                <div className="flex justify-between font-semibold text-neutral-900 text-base pt-1">
                  <span>Total</span><span>{money(total)}</span>
                </div>
              </div>

              {/* Meta + send */}
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">Due date (optional)</label>
                  <input className={field} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">Internal note (optional)</label>
                  <input className={field} placeholder="Not shown to the family" value={note}
                    onChange={(e) => setNote(e.target.value)} />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => { setSelectedId(null); setPreview(null) }}>
                  Cancel
                </Button>
                <Button size="sm" onClick={send} disabled={sending || total < 0}>
                  {sending ? 'Sending…' : `Send invoice · ${money(total)}`}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TuitionApprovalPage

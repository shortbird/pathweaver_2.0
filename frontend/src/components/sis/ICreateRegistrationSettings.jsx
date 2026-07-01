import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

// Slugify a label into a stable paperwork key (used when adding new items).
const slugKey = (label) => (label || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `item_${Date.now()}`

const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

/**
 * Admin config for the iCreate parent registration funnel, stored in
 * organizations.feature_flags.icreate_registration. Rendered on the SIS Settings
 * page only for orgs that have this flag (i.e. iCreate). Lets staff set the
 * registration fee, the external payment + scheduling URLs, and the paperwork
 * items parents acknowledge during registration.
 */
const ICreateRegistrationSettings = ({ orgId, orgData, onUpdate }) => {
  const flags = orgData?.organization?.feature_flags || {}
  const cfg = flags.icreate_registration

  const [feeMode, setFeeMode] = useState(cfg?.fee_mode || 'flat')
  const [fee, setFee] = useState(((cfg?.registration_fee_cents || 0) / 100).toString())
  const [perStudentFee, setPerStudentFee] = useState(((cfg?.per_student_fee_cents || 0) / 100).toString())
  const [paymentUrl, setPaymentUrl] = useState(cfg?.payment_url || '')
  const [schedulingUrl, setSchedulingUrl] = useState(cfg?.scheduling_url || '')
  const [paperwork, setPaperwork] = useState(cfg?.paperwork || [])
  const [saving, setSaving] = useState(false)

  // Not an iCreate-registration org — render nothing.
  if (!cfg) return null

  const setItem = (i, patch) => setPaperwork((p) => p.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const addItem = () => setPaperwork((p) => [...p, { key: '', label: '', doc_url: '' }])
  const removeItem = (i) => setPaperwork((p) => p.filter((_, j) => j !== i))

  const save = async () => {
    const feeCents = Math.round(parseFloat(fee || '0') * 100)
    const perStudentCents = Math.round(parseFloat(perStudentFee || '0') * 100)
    if (Number.isNaN(feeCents) || feeCents < 0) return toast.error('Enter a valid per-family fee')
    if (Number.isNaN(perStudentCents) || perStudentCents < 0) return toast.error('Enter a valid per-student fee')
    const items = paperwork
      .filter((it) => (it.label || '').trim())
      .map((it) => ({ key: it.key || slugKey(it.label), label: it.label.trim(), doc_url: (it.doc_url || '').trim() }))

    setSaving(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: {
          ...flags,
          icreate_registration: {
            ...cfg,
            enabled: true,
            fee_mode: feeMode,
            registration_fee_cents: feeCents,
            per_student_fee_cents: perStudentCents,
            payment_url: paymentUrl.trim(),
            scheduling_url: schedulingUrl.trim(),
            paperwork: items,
          },
        },
      })
      toast.success('Registration settings saved')
      onUpdate && onUpdate()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold mb-1">Parent registration</h2>
      <p className="text-gray-600 mb-5 text-sm">
        Controls the branded registration link parents use to sign up (fee, payment, paperwork, and scheduling).
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Fee model</label>
          <select className={field} value={feeMode} onChange={(e) => setFeeMode(e.target.value)}>
            <option value="flat">Flat per family</option>
            <option value="per_student">Per student</option>
            <option value="lesser">Per student, capped per family</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">
            {feeMode === 'per_student' ? 'Per-family (unused)' : feeMode === 'lesser' ? 'Per-family cap (USD)' : 'Per-family fee (USD)'}
          </label>
          <input className={field} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)}
            placeholder="0.00" disabled={feeMode === 'per_student'} />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Per-student fee (USD)</label>
          <input className={field} inputMode="decimal" value={perStudentFee} onChange={(e) => setPerStudentFee(e.target.value)}
            placeholder="0.00" disabled={feeMode === 'flat'} />
        </div>
        <div className="sm:col-span-3">
          <p className="text-xs text-neutral-400">
            {feeMode === 'lesser'
              ? 'Families pay the lesser of (per-student × kids) and the per-family cap.'
              : feeMode === 'per_student'
                ? 'Families pay per-student × number of kids, with no cap.'
                : 'Every family pays the flat fee regardless of how many kids register.'}
          </p>
        </div>
        <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Payment link (external)</label>
            <input className={field} value={paymentUrl} onChange={(e) => setPaymentUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Scheduling link (emailed after payment)</label>
            <input className={field} value={schedulingUrl} onChange={(e) => setSchedulingUrl(e.target.value)} placeholder="https://…" />
          </div>
        </div>
      </div>

      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-neutral-500">Paperwork items (parent acknowledges/e-signs each)</label>
          <button onClick={addItem} className="text-sm font-medium text-optio-purple hover:underline">+ Add item</button>
        </div>
        <div className="space-y-2">
          {paperwork.length === 0 && <p className="text-sm text-neutral-400">No paperwork items.</p>}
          {paperwork.map((it, i) => (
            <div key={i} className="flex flex-col sm:flex-row gap-2">
              <input className={`${field} sm:w-1/2`} placeholder="Label (e.g. Enrollment Agreement)"
                value={it.label} onChange={(e) => setItem(i, { label: e.target.value })} />
              <input className={`${field} sm:flex-1`} placeholder="Document link (optional)"
                value={it.doc_url} onChange={(e) => setItem(i, { doc_url: e.target.value })} />
              <button onClick={() => removeItem(i)} className="text-red-500 text-sm px-2 hover:underline">Remove</button>
            </div>
          ))}
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="px-5 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium hover:opacity-90 disabled:opacity-50">
        {saving ? 'Saving…' : 'Save registration settings'}
      </button>
    </div>
  )
}

export default ICreateRegistrationSettings

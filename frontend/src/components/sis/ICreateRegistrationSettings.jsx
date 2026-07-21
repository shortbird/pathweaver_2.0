import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { CheckIcon, ClipboardIcon } from '@heroicons/react/24/solid'
import api from '../../services/api'
import { getLearningOrigin } from '../../utils/appSurface'

// Slugify a label into a stable paperwork key (used when adding new items).
const slugKey = (label) => (label || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `item_${Date.now()}`

const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

// URLs saved without a scheme (e.g. "buy.stripe.com/xyz") would render as
// relative links and resolve against the Optio origin — normalize on save.
const absUrl = (v) => {
  const s = (v || '').trim()
  if (!s) return ''
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

// Stripe secret keys are sk_… (or restricted rk_…) and much longer than 20
// chars; anything else breaks the funnel at "Pay securely", so reject it at
// save time. Kept loose enough for legacy keys without the live/test segment.
const STRIPE_KEY_RE = /^(sk|rk)_[A-Za-z0-9_]{20,}$/

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
  const [stripeKey, setStripeKey] = useState(cfg?.stripe_secret_key || '')
  const [paperwork, setPaperwork] = useState(cfg?.paperwork || [])
  const [questions, setQuestions] = useState(cfg?.questions || [])
  const [saving, setSaving] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(null) // paperwork index mid-upload

  // Family registration link — the org's standing parent invitation link, which
  // routes families into this registration flow. Moved here from the Users page.
  const [regLink, setRegLink] = useState(null)
  const [regLinkLoading, setRegLinkLoading] = useState(true)
  const [regLinkBusy, setRegLinkBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [embedCopied, setEmbedCopied] = useState(false)

  const findParentLink = (invitations = []) => invitations.find((inv) =>
    inv.role === 'parent' &&
    inv.email?.startsWith('link-invite-') &&
    inv.email?.endsWith('@pending.optio.local'))

  const fetchParentLink = async () => {
    const r = await api.get(`/api/admin/organizations/${orgId}/invitations?status=pending`)
    return findParentLink(r.data?.invitations)
  }

  useEffect(() => {
    if (!orgId || !cfg) { setRegLinkLoading(false); return }
    let active = true
    ;(async () => {
      try {
        let link = await fetchParentLink()
        if (!link) {
          // Auto-provision the standing link so the field is never empty.
          await api.post(`/api/admin/organizations/${orgId}/invitations/link`, { role: 'parent' })
          link = await fetchParentLink()
        }
        if (active) setRegLink(link || null)
      } catch {
        if (active) setRegLink(null)
      } finally {
        if (active) setRegLinkLoading(false)
      }
    })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  // Not an iCreate-registration org — render nothing.
  if (!cfg) return null

  // Always the www (learning) origin — a link copied from the SIS console must
  // never point families at sis.optioeducation.com.
  const regLinkUrl = regLink ? `${getLearningOrigin()}/invitation/${regLink.invitation_code}` : ''

  const copyRegLink = async () => {
    await navigator.clipboard.writeText(regLinkUrl)
    setCopied(true)
    toast.success('Link copied to clipboard!')
    setTimeout(() => setCopied(false), 2000)
  }

  const resetRegLink = async () => {
    if (!window.confirm('Reset the family registration link? Anyone who has the current link will no longer be able to use it.')) return
    setRegLinkBusy(true)
    try {
      if (regLink) {
        await api.delete(`/api/admin/organizations/${orgId}/invitations/${regLink.id}`).catch(() => {})
      }
      await api.post(`/api/admin/organizations/${orgId}/invitations/link`, { role: 'parent' })
      setRegLink(await fetchParentLink() || null)
      toast.success('New link created')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to reset the link')
    } finally {
      setRegLinkBusy(false)
    }
  }

  const setItem = (i, patch) => setPaperwork((p) => p.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const addItem = () => setPaperwork((p) => [...p, { key: '', label: '', doc_url: '' }])
  const removeItem = (i) => setPaperwork((p) => p.filter((_, j) => j !== i))

  // ── Question editing ────────────────────────────────────────────────────────
  // Options are edited as one row per option (the saved shape is a plain array
  // of strings; legacy pipe-separated strings are normalized on first edit).
  const setQ = (i, patch) => setQuestions((qs) => qs.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const asOptions = (q) => (Array.isArray(q.options)
    ? q.options
    : String(q.options || '').split('|').map((s) => s.trim()).filter(Boolean))
  const patchOptions = (qi, fn) => setQuestions((qs) => qs.map((x, j) => (j === qi ? { ...x, options: fn(asOptions(x)) } : x)))

  // Focus the option input created by "+ Add option" / Enter once it mounts.
  const optFocus = useRef(null)
  const addOption = (qi) => patchOptions(qi, (opts) => {
    optFocus.current = `${qi}:${opts.length}`
    return [...opts, '']
  })

  const uploadDoc = async (i, file) => {
    if (!file) return
    setUploadingDoc(i)
    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post(`/api/sis/registration/paperwork-doc?organization_id=${orgId}`, form)
      setItem(i, { doc_url: data.url })
      toast.success('Document uploaded — save settings to apply')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not upload the document')
    } finally {
      setUploadingDoc(null)
    }
  }

  const save = async () => {
    const feeCents = Math.round(parseFloat(fee || '0') * 100)
    const perStudentCents = Math.round(parseFloat(perStudentFee || '0') * 100)
    if (Number.isNaN(feeCents) || feeCents < 0) return toast.error('Enter a valid per-family fee')
    if (Number.isNaN(perStudentCents) || perStudentCents < 0) return toast.error('Enter a valid per-student fee')
    if (stripeKey.trim() && !STRIPE_KEY_RE.test(stripeKey.trim())) {
      return toast.error("That doesn't look like a Stripe secret key — copy the full key (sk_live_… or rk_live_…) from Stripe Dashboard → Developers → API keys.")
    }
    const items = paperwork
      .filter((it) => (it.label || '').trim())
      .map((it) => ({
        key: it.key || slugKey(it.label), label: it.label.trim(),
        doc_url: absUrl(it.doc_url),
      }))
    const qs = questions
      .filter((q) => (q.label || '').trim())
      .map((q) => ({
        key: q.key || slugKey(q.label), label: q.label.trim(), help: (q.help || '').trim(),
        type: ['multi', 'text'].includes(q.type) ? q.type : 'select',
        options: q.type === 'text' ? []
          : (Array.isArray(q.options) ? q.options : String(q.options || '').split('|'))
            .map((o) => String(o).trim()).filter(Boolean),
        required: q.required !== false,
      }))

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
            payment_url: absUrl(paymentUrl),
            scheduling_url: absUrl(schedulingUrl),
            stripe_secret_key: stripeKey.trim(),
            paperwork: items,
            questions: qs,
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
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-neutral-900 mb-1">Registration</h2>
      <p className="text-sm text-neutral-500 mb-5">
        Controls the branded registration link parents use to sign up (fee, payment, paperwork, and scheduling).
      </p>

      {/* The standing link families use to enter the registration flow below */}
      <div className="mb-5">
        <label className="block text-xs font-medium text-neutral-500 mb-1">Family registration link</label>
        {regLinkLoading ? (
          <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-neutral-400">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-optio-purple" />
            Preparing link…
          </div>
        ) : regLink ? (
          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={regLinkUrl}
              onFocus={(e) => e.target.select()}
              onClick={(e) => e.target.select()}
              className="flex-1 min-w-0 rounded-lg border border-gray-300 bg-neutral-50 px-3 py-2.5 text-sm font-mono text-neutral-700 focus:outline-none focus:ring-2 focus:ring-optio-purple"
            />
            <button
              onClick={copyRegLink}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                copied
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:opacity-90'
              }`}
            >
              {copied ? <CheckIcon className="w-4 h-4" /> : <ClipboardIcon className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={resetRegLink}
              disabled={regLinkBusy}
              title="Reset link (invalidates the current one)"
              className="inline-flex items-center justify-center px-3 py-2.5 rounded-lg border border-gray-300 text-neutral-500 hover:text-optio-purple hover:border-optio-purple transition-colors disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-4 h-4 ${regLinkBusy ? 'animate-spin' : ''}`} />
            </button>
          </div>
        ) : (
          <p className="text-sm text-neutral-400">Could not load the link — refresh the page to try again.</p>
        )}
        <p className="text-xs text-neutral-400 mt-1">
          Share this standing link with families — it opens the registration flow configured below.
          {regLink && (
            <>
              {' '}
              <a href={`${getLearningOrigin()}/register/icreate/${regLink.invitation_code}?preview=1`}
                target="_blank" rel="noreferrer" className="text-optio-purple font-medium hover:underline">
                Preview the form
              </a>
              {' '}— step through every page with sample data; nothing is saved and no card is charged.
            </>
          )}
        </p>
      </div>

      {/* Embeddable live schedule — read-only weekly grid for the school's own
          website (display-only; no registration links). Backed by the same
          public schedule-preview endpoint as the funnel preview. */}
      {regLink && (
        <div className="mb-5">
          <label className="block text-xs font-medium text-neutral-500 mb-1">Embed your live schedule</label>
          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={`<iframe src="${getLearningOrigin()}/schedule-embed/${regLink.invitation_code}" style="width:100%;min-height:900px;border:0;" title="Class schedule"></iframe>`}
              onFocus={(e) => e.target.select()}
              onClick={(e) => e.target.select()}
              className="flex-1 min-w-0 rounded-lg border border-gray-300 bg-neutral-50 px-3 py-2.5 text-xs font-mono text-neutral-700 focus:outline-none focus:ring-2 focus:ring-optio-purple"
            />
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(
                  `<iframe src="${getLearningOrigin()}/schedule-embed/${regLink.invitation_code}" style="width:100%;min-height:900px;border:0;" title="Class schedule"></iframe>`)
                setEmbedCopied(true)
                toast.success('Embed code copied!')
                setTimeout(() => setEmbedCopied(false), 2000)
              }}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                embedCopied
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:opacity-90'
              }`}
            >
              {embedCopied ? <CheckIcon className="w-4 h-4" /> : <ClipboardIcon className="w-4 h-4" />}
              {embedCopied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Paste this into your website to show the live weekly class schedule (view-only — it
            updates automatically as classes change).
            {' '}
            <a href={`${getLearningOrigin()}/schedule-embed/${regLink.invitation_code}`}
              target="_blank" rel="noreferrer" className="text-optio-purple font-medium hover:underline">
              Preview it
            </a>.
            {' '}Resetting the registration link above also changes this embed URL.
          </p>
        </div>
      )}

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
        <div className="sm:col-span-3">
          <label className="block text-xs font-medium text-neutral-500 mb-1">Stripe secret key (school's own Stripe account)</label>
          <input type="password" className={field} value={stripeKey} onChange={(e) => setStripeKey(e.target.value)}
            placeholder="rk_live_… (restricted key recommended)" autoComplete="off" />
          {stripeKey.trim() && !STRIPE_KEY_RE.test(stripeKey.trim()) && (
            <p className="text-xs text-red-600 mt-1" role="alert">
              This doesn't look like a Stripe secret key — it should start with sk_ or rk_ (e.g. sk_live_…)
              and be much longer. Copy the full key from Stripe Dashboard → Developers → API keys.
            </p>
          )}
          <p className="text-xs text-neutral-400 mt-1">
            With a key set, parents pay by card at checkout and the platform verifies the payment with Stripe
            before completing registration. Funds go directly to the school's Stripe account. Create a
            restricted key (Checkout Sessions: write) in the Stripe dashboard. Leave blank to fall back to the
            external payment link below.
          </p>
        </div>
        <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Payment link (external, fallback)</label>
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
          <label className="text-xs font-medium text-neutral-500">Paperwork items (parent reads the document, then acknowledges/e-signs)</label>
          <button onClick={addItem} className="text-sm font-medium text-optio-purple hover:underline">+ Add item</button>
        </div>
        <div className="space-y-3">
          {paperwork.length === 0 && <p className="text-sm text-neutral-400">No paperwork items.</p>}
          {paperwork.map((it, i) => (
            <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <input className={`${field} sm:flex-1`} placeholder="Label (e.g. Enrollment Agreement)"
                  value={it.label} onChange={(e) => setItem(i, { label: e.target.value })} />
                <label className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium whitespace-nowrap cursor-pointer transition-colors ${
                  uploadingDoc === i
                    ? 'border-gray-200 text-neutral-400'
                    : 'border-gray-300 text-neutral-600 hover:border-optio-purple hover:text-optio-purple'
                }`}>
                  {uploadingDoc === i ? 'Uploading…' : it.doc_url ? 'Replace document' : 'Upload document'}
                  <input type="file" className="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                    disabled={uploadingDoc != null}
                    onChange={(e) => { uploadDoc(i, e.target.files?.[0]); e.target.value = '' }} />
                </label>
                <button onClick={() => removeItem(i)} className="text-red-500 text-sm px-2 hover:underline">Remove</button>
              </div>
              {it.doc_url ? (
                <p className="text-xs text-neutral-500">
                  <a href={absUrl(it.doc_url)} target="_blank" rel="noreferrer" className="text-optio-purple font-medium hover:underline">View document</a>
                  <button onClick={() => setItem(i, { doc_url: '' })} className="ml-3 text-red-500 hover:underline">Remove document</button>
                </p>
              ) : (
                <p className="text-xs text-neutral-400">No document yet — upload the waiver/acknowledgment PDF parents will read and sign.</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-neutral-500">Registration questions (asked before paperwork)</label>
          <button onClick={() => setQuestions((q) => [...q, { key: '', label: '', help: '', type: 'select', options: ['', ''], required: true }])}
            className="text-sm font-medium text-optio-purple hover:underline">+ Add question</button>
        </div>
        <div className="space-y-3">
          {questions.length === 0 && <p className="text-sm text-neutral-400">No questions.</p>}
          {questions.map((q, i) => {
            const opts = asOptions(q)
            return (
              <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input className={`${field} sm:flex-1`} placeholder="Question label"
                    value={q.label} onChange={(e) => setQ(i, { label: e.target.value })} />
                  <select className={`${field} sm:w-44`} value={q.type || 'select'}
                    onChange={(e) => setQ(i, { type: e.target.value })}>
                    <option value="select">Pick one</option>
                    <option value="multi">Pick multiple</option>
                    <option value="text">Text answer</option>
                  </select>
                  <button onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
                    className="text-red-500 text-sm px-2 hover:underline">Remove</button>
                </div>
                <textarea rows={2} className={field} placeholder="Help text shown under the question (optional)"
                  value={q.help || ''} onChange={(e) => setQ(i, { help: e.target.value })} />

                {q.type === 'text' ? (
                  <p className="pl-1 text-xs text-neutral-400">Parents type their answer in a free-text box.</p>
                ) : (
                <div className="pl-1">
                  <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-1.5">Answer options</p>
                  <div className="space-y-1.5">
                    {opts.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        {/* mirrors how the option renders to parents: circle = pick one, square = pick multiple */}
                        <span className={`w-3.5 h-3.5 shrink-0 border-2 border-gray-300 ${q.type === 'multi' ? 'rounded' : 'rounded-full'}`} />
                        <input
                          ref={(el) => { if (el && optFocus.current === `${i}:${oi}`) { el.focus(); optFocus.current = null } }}
                          className={`${field} flex-1`}
                          placeholder={`Option ${oi + 1}`}
                          value={opt}
                          onChange={(e) => patchOptions(i, (os) => os.map((o, j) => (j === oi ? e.target.value : o)))}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(i) } }}
                        />
                        <button onClick={() => patchOptions(i, (os) => os.filter((_, j) => j !== oi))}
                          aria-label={`Remove option ${oi + 1}`}
                          className="text-neutral-400 hover:text-red-500 text-lg leading-none px-1">×</button>
                      </div>
                    ))}
                    {opts.length === 0 && <p className="text-xs text-neutral-400">No options yet.</p>}
                  </div>
                  <button onClick={() => addOption(i)} className="mt-1.5 text-sm font-medium text-optio-purple hover:underline">
                    + Add option
                  </button>
                </div>
                )}

                <label className="flex items-center gap-2 text-xs text-neutral-500 select-none pl-1">
                  <input type="checkbox" checked={q.required !== false}
                    onChange={(e) => setQ(i, { required: e.target.checked })}
                    className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                  Required — parents must answer before continuing
                </label>
              </div>
            )
          })}
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

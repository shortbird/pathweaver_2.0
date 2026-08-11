import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ArrowPathIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import { CheckIcon, ClipboardIcon } from '@heroicons/react/24/solid'
import api from '../../services/api'
import { getLearningOrigin } from '../../utils/appSurface'
import FirstDayOfSchoolCard from './FirstDayOfSchoolCard'
import EnrollmentAgeGatesCard from './EnrollmentAgeGatesCard'
import {
  STEPS, STEP_LABELS, field, money, absUrl, gateBandText,
  QuestionField, VerticalStepper, Section, PasswordInput, PrimaryButton,
} from '../registration/funnelUi'

/**
 * The Registration setup tab: the family registration funnel rendered exactly
 * as families see it (same shared components as pages/ICreateRegisterPage.jsx),
 * with the configurable parts editable in place. Staff click through the steps
 * in the left stepper; anything an org can change carries an Edit control.
 *
 * Config lives at organizations.feature_flags.registration (org-neutral; the
 * legacy icreate_registration key is mirrored on save until the rename is live
 * in prod). Saving PUTs the whole feature_flags blob back, so edited items
 * spread the original object — fields this editor doesn't know about survive
 * the round-trip (the old settings form dropped paperwork `body` and question
 * `per_student` on save; this one must not).
 */

const slugKey = (label) => (label || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `item_${Date.now()}`

// Stripe secret keys are sk_… (or restricted rk_…) and much longer than 20
// chars; anything else breaks the funnel at "Pay securely".
const STRIPE_KEY_RE = /^(sk|rk)_[A-Za-z0-9_]{20,}$/

// ── Editor chrome ────────────────────────────────────────────────────────────

// Wraps a family-visible region the org can configure. The region renders
// exactly as families see it; the pill toggles an inline editor beneath it.
const Editable = ({ label = 'Edit', open, onToggle, editor, children }) => (
  <div className={`relative rounded-xl transition-shadow ${open ? 'ring-2 ring-optio-purple/50' : 'ring-1 ring-transparent hover:ring-optio-purple/30'}`}>
    <button
      type="button"
      onClick={onToggle}
      className={`absolute -top-2.5 right-3 z-10 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shadow-sm ${
        open ? 'bg-optio-purple text-white border-optio-purple' : 'bg-white text-optio-purple border-optio-purple/40 hover:border-optio-purple'
      }`}
    >
      <PencilSquareIcon className="w-3 h-3" />
      {open ? 'Done' : label}
    </button>
    {children}
    {open && (
      <div className="mt-1 rounded-lg border border-dashed border-optio-purple/40 bg-optio-purple/[0.04] p-4">
        {editor}
      </div>
    )}
  </div>
)

// A step region families see but orgs cannot change.
const FixedNote = ({ children }) => (
  <p className="text-xs text-neutral-400 italic mt-2">{children}</p>
)

// Mocked family inputs: rendered exactly like the funnel's, but inert.
const mockInput = `${field} bg-neutral-50 pointer-events-none`

const RegistrationSetupTab = ({ orgId, orgData, onUpdate }) => {
  const org = orgData?.organization || {}
  const flags = org.feature_flags || {}
  // Org-neutral key first; legacy key until the prod rename ships.
  const cfg = flags.registration || flags.icreate_registration
  const sisSettings = flags.sis_settings || {}
  const logo = org.branding_config?.logo_url || org.logo_url

  const [step, setStep] = useState('account')
  const [saving, setSaving] = useState(false)
  const [enabling, setEnabling] = useState(false)
  const [openZones, setOpenZones] = useState(() => new Set())
  const [uploadingDoc, setUploadingDoc] = useState(null)
  const [linkedKeys, setLinkedKeys] = useState(() => new Set())

  // Draft config (family-visible parts, edited in place).
  const [feeMode, setFeeMode] = useState(cfg?.fee_mode || 'flat')
  const [fee, setFee] = useState(((cfg?.registration_fee_cents || 0) / 100).toString())
  const [perStudentFee, setPerStudentFee] = useState(((cfg?.per_student_fee_cents || 0) / 100).toString())
  const [paymentUrl, setPaymentUrl] = useState(cfg?.payment_url || '')
  const [schedulingUrl, setSchedulingUrl] = useState(cfg?.scheduling_url || '')
  const [paperwork, setPaperwork] = useState(cfg?.paperwork || [])
  const [questions, setQuestions] = useState(cfg?.questions || [])
  const [askContacts, setAskContacts] = useState(cfg ? cfg.emergency_contacts !== false : true)
  const [askHealth, setAskHealth] = useState(cfg ? cfg.health_fields !== false : true)
  const [flow, setFlow] = useState(sisSettings.post_registration_flow || 'schedule')
  // Stripe: '' = leave the stored key alone. Only a typed key (set) or the
  // explicit clear checkbox changes it — the old form cleared the org's key on
  // every save because it always sent the (never-echoed) field back empty.
  const [stripeKey, setStripeKey] = useState('')
  const [stripeClear, setStripeClear] = useState(false)
  const [stripeEnabled, setStripeEnabled] = useState(false)

  // The standing family registration link (auto-provisioned so it always exists).
  const [regLink, setRegLink] = useState(null)
  const [regLinkLoading, setRegLinkLoading] = useState(true)
  const [regLinkBusy, setRegLinkBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [embedCopied, setEmbedCopied] = useState(false)

  const toggleZone = (key) => setOpenZones((z) => {
    const next = new Set(z)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const findParentLink = (invitations = []) => invitations.find((inv) =>
    inv.role === 'parent' &&
    inv.email?.startsWith('link-invite-') &&
    inv.email?.endsWith('@pending.optio.local'))

  const fetchParentLink = async () => {
    const r = await api.get(`/api/admin/organizations/${orgId}/invitations?status=pending`)
    return findParentLink(r.data?.invitations)
  }

  const loadLinkedKeys = async () => {
    try {
      const r = await api.get(`/api/sis/resources?organization_id=${orgId}`)
      const keys = (r.data?.resources || []).map((x) => x.paperwork_key).filter(Boolean)
      setLinkedKeys(new Set(keys))
    } catch { /* non-fatal: the hint just won't show */ }
  }

  useEffect(() => {
    if (!orgId || !cfg) { setRegLinkLoading(false); return }
    let active = true
    loadLinkedKeys()
    ;(async () => {
      try {
        let link = await fetchParentLink()
        if (!link) {
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

  // Whether card payment is live (the key itself is never echoed back).
  useEffect(() => {
    if (!regLink?.invitation_code) return
    let active = true
    api.get(`/api/icreate/config/${regLink.invitation_code}`)
      .then((r) => { if (active) setStripeEnabled(!!r.data?.stripe_enabled) })
      .catch(() => {})
    return () => { active = false }
  }, [regLink?.invitation_code, saving])

  // ── Enable (orgs without the funnel yet) ───────────────────────────────────

  const enableFunnel = async () => {
    setEnabling(true)
    try {
      const seeded = {
        enabled: true, fee_mode: 'flat',
        registration_fee_cents: 0, per_student_fee_cents: 0,
        payment_url: '', scheduling_url: '', paperwork: [], questions: [],
      }
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: { ...flags, registration: seeded, icreate_registration: seeded },
      })
      toast.success('Family registration is on — configure the steps below')
      onUpdate && onUpdate()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not enable registration')
    } finally {
      setEnabling(false)
    }
  }

  if (!cfg) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <h2 className="text-lg font-semibold text-neutral-900 mb-2">Family registration is not set up</h2>
        <p className="text-sm text-neutral-500 max-w-lg mx-auto mb-5">
          Turn on the branded registration funnel to get a standing link families use to
          create their account, add their kids, answer your intake questions, e-sign
          paperwork, and pay a registration fee — all configured right here.
        </p>
        <button onClick={enableFunnel} disabled={enabling}
          className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold hover:opacity-90 disabled:opacity-50">
          {enabling ? 'Setting up…' : 'Set up family registration'}
        </button>
      </div>
    )
  }

  const regLinkUrl = regLink ? `${getLearningOrigin()}/enroll/${regLink.invitation_code}` : ''
  const embedSnippet = regLink
    ? `<iframe src="${getLearningOrigin()}/schedule-embed/${regLink.invitation_code}" style="width:100%;min-height:900px;border:0;" title="Class schedule"></iframe>`
    : ''

  const copyText = async (text, done) => {
    await navigator.clipboard.writeText(text)
    done(true)
    toast.success('Copied to clipboard')
    setTimeout(() => done(false), 2000)
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

  // ── Draft helpers ──────────────────────────────────────────────────────────

  const setItem = (i, patch) => setPaperwork((p) => p.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const setQ = (i, patch) => setQuestions((qs) => qs.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const asOptions = (q) => (Array.isArray(q.options)
    ? q.options
    : String(q.options || '').split('|').map((s) => s.trim()).filter(Boolean))
  const patchOptions = (qi, fn) => setQuestions((qs) => qs.map((x, j) => (j === qi ? { ...x, options: fn(asOptions(x)) } : x)))

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
      toast.success('Document uploaded — save to apply')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not upload the document')
    } finally {
      setUploadingDoc(null)
    }
  }

  // The fee a family with `n` kids would owe under the current draft.
  const draftFeeCents = (n = 1) => {
    const familyC = Math.round(parseFloat(fee || '0') * 100) || 0
    const perC = Math.round(parseFloat(perStudentFee || '0') * 100) || 0
    if (feeMode === 'per_student') return perC * n
    if (feeMode === 'lesser') {
      const options = [familyC, perC * n].filter((v) => v > 0)
      return options.length ? Math.min(...options) : 0
    }
    return familyC
  }

  // ── Save ───────────────────────────────────────────────────────────────────

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
        ...it,
        key: it.key || slugKey(it.label), label: it.label.trim(),
        doc_url: absUrl(it.doc_url), body: (it.body || '').trim(),
      }))
    const qs = questions
      .filter((q) => (q.label || '').trim())
      .map((q) => ({
        ...q,
        key: q.key || slugKey(q.label), label: q.label.trim(), help: (q.help || '').trim(),
        type: ['multi', 'text'].includes(q.type) ? q.type : 'select',
        options: q.type === 'text' ? []
          : asOptions(q).map((o) => String(o).trim()).filter(Boolean),
        required: q.required !== false,
        per_student: !!q.per_student,
      }))

    const newCfg = {
      ...cfg,
      enabled: true,
      emergency_contacts: askContacts,
      health_fields: askHealth,
      fee_mode: feeMode,
      registration_fee_cents: feeCents,
      per_student_fee_cents: perStudentCents,
      payment_url: absUrl(paymentUrl),
      scheduling_url: absUrl(schedulingUrl),
      paperwork: items,
      questions: qs,
    }
    // Only touch the stored Stripe key when the admin acted on it.
    if (stripeClear) newCfg.stripe_secret_key = ''
    else if (stripeKey.trim()) newCfg.stripe_secret_key = stripeKey.trim()
    else delete newCfg.stripe_secret_key

    setSaving(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: {
          ...flags,
          registration: newCfg,
          icreate_registration: newCfg, // legacy mirror until the rename ships
          sis_settings: { ...sisSettings, post_registration_flow: flow },
        },
      })
      // Reconcile uploaded paperwork docs into the Resources library (single
      // source of truth). Non-fatal — the settings still saved if this hiccups.
      try {
        await api.post(`/api/sis/resources/reconcile-paperwork?organization_id=${orgId}`, {})
      } catch { /* best effort */ }
      await loadLinkedKeys()
      setStripeKey('')
      setStripeClear(false)
      toast.success('Registration settings saved')
      onUpdate && onUpdate()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // Age gates currently in waitlist mode (drives the family-step notice).
  const waitlistGates = (sisSettings.enrollment_age_gates || []).filter((g) => g?.mode === 'waitlist')
  const feeApplies = draftFeeCents(1) > 0 || draftFeeCents(2) > 0

  // Mirror the funnel exactly: the fee step only exists when the org can
  // actually charge (a fee amount, an external payment link, or card payment).
  // Zero-fee orgs never see it — so neither does this editor's stepper.
  const feeStepVisible = feeApplies || Boolean(absUrl(paymentUrl)) || (stripeEnabled && !stripeClear)
  const editorSteps = feeStepVisible ? STEPS : STEPS.filter((s) => s !== 'fee')
  const editorLabels = askContacts ? STEP_LABELS : { ...STEP_LABELS, details: 'A few questions' }

  // ── Step bodies (the funnel, verbatim, with Edit affordances) ──────────────

  const accountStep = (
    <div className="space-y-6">
      <Section title="Your account" subtitle="Registration starts with your parent account.">
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-neutral-50 mb-5">
          <span className="text-sm px-4 py-1.5 rounded-md font-medium bg-optio-purple text-white">Create account</span>
          <span className="text-sm px-4 py-1.5 rounded-md font-medium text-neutral-600">I have an Optio account</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="block text-xs font-medium text-neutral-500 mb-1">First name</label>
            <input className={mockInput} readOnly value="" /></div>
          <div><label className="block text-xs font-medium text-neutral-500 mb-1">Last name</label>
            <input className={mockInput} readOnly value="" /></div>
          <div className="sm:col-span-2"><label className="block text-xs font-medium text-neutral-500 mb-1">Email</label>
            <input className={mockInput} readOnly value="" /></div>
          <div><label className="block text-xs font-medium text-neutral-500 mb-1">Password</label>
            <div className="pointer-events-none"><PasswordInput value="" onChange={() => {}} /></div></div>
          <div><label className="block text-xs font-medium text-neutral-500 mb-1">Confirm password</label>
            <div className="pointer-events-none"><PasswordInput value="" onChange={() => {}} /></div></div>
        </div>
        <FixedNote>
          Standard step — same for every organization. Parents create an Optio account (with an
          emailed 6-digit confirmation code) or sign in with an existing one, and it is attached
          to {org.name || 'your school'} automatically.
        </FixedNote>
      </Section>
      <div className="pointer-events-none"><PrimaryButton>Create account</PrimaryButton></div>
    </div>
  )

  const familyStep = (
    <div className="space-y-6">
      <Section title="Contact & address">
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
          <div className="sm:col-span-2"><label className="block text-xs font-medium text-neutral-500 mb-1">Phone</label>
            <input className={mockInput} readOnly placeholder="XXX-XXX-XXXX" value="" /></div>
          <div className="sm:col-span-4"><label className="block text-xs font-medium text-neutral-500 mb-1">Street address</label>
            <input className={mockInput} readOnly value="" /></div>
          <div className="sm:col-span-2"><label className="block text-xs font-medium text-neutral-500 mb-1">Apt / unit (optional)</label>
            <input className={mockInput} readOnly value="" /></div>
          <div className="sm:col-span-2"><label className="block text-xs font-medium text-neutral-500 mb-1">City</label>
            <input className={mockInput} readOnly value="" /></div>
          <div className="sm:col-span-1"><label className="block text-xs font-medium text-neutral-500 mb-1">State</label>
            <input className={mockInput} readOnly placeholder="UT" value="" /></div>
          <div className="sm:col-span-1"><label className="block text-xs font-medium text-neutral-500 mb-1">ZIP</label>
            <input className={mockInput} readOnly value="" /></div>
        </div>
        <FixedNote>
          Standard step — parents add their contact details, a family photo, and each child
          (name, date of birth, photo, allergies, medications). Teens can get their own login.
        </FixedNote>
      </Section>

      <Editable
        label="Edit"
        open={openZones.has('gates')}
        onToggle={() => toggleZone('gates')}
        editor={(
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm text-neutral-700 select-none">
              <input type="checkbox" checked={askHealth}
                onChange={(e) => setAskHealth(e.target.checked)}
                className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
              Ask for each child's allergies and required medications
            </label>
            <p className="text-xs text-neutral-500">
              The waitlist settings below drive the notice families see when they enter a child's
              date of birth (ages are judged as of the first day of school). They save on their own,
              separate from the main Save button.
            </p>
            <FirstDayOfSchoolCard orgId={orgId} org={org} onUpdate={onUpdate} />
            <EnrollmentAgeGatesCard orgId={orgId} org={org} onUpdate={onUpdate} />
          </div>
        )}
      >
        <Section title="Children">
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-neutral-700">Child 1</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className={mockInput} readOnly placeholder="First name" value="" />
              <input className={mockInput} readOnly placeholder="Last name" value="" />
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-neutral-500 mb-1">Date of birth</label>
                <input className={mockInput} readOnly placeholder="MM/DD/YYYY" value="" />
                {waitlistGates.map((g, i) => (
                  <p key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                    Students {gateBandText(g)} are currently joining a waitlist. You can
                    finish registering this child — {org.name || 'the school'} will
                    email you as soon as they can choose classes.
                  </p>
                ))}
                {waitlistGates.length > 0 && (
                  <p className="text-[11px] text-neutral-400 mt-1">
                    ↑ Families see this notice when the child's birth date falls in a waitlisted age group.
                  </p>
                )}
              </div>
              {askHealth && (
                <>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-neutral-500 mb-1">Allergies</label>
                    <textarea rows={2} className={mockInput} readOnly value="" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-neutral-500 mb-1">Required medications</label>
                    <textarea rows={2} className={mockInput} readOnly value="" />
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="mt-4">
            <span className="text-sm font-medium text-optio-purple">+ Add another child</span>
          </div>
        </Section>
      </Editable>

      {feeApplies && (
        <p className="text-center text-sm text-neutral-500">
          Registration fee: <span className="font-semibold text-neutral-800">{money(draftFeeCents(1))}</span>
        </p>
      )}
      <div className="pointer-events-none"><PrimaryButton>Continue</PrimaryButton></div>
    </div>
  )

  const questionEditor = (q, i) => {
    const opts = asOptions(q)
    return (
      <div className="space-y-2">
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
        {q.type !== 'text' && (
          <div className="pl-1">
            <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-1.5">Answer options</p>
            <div className="space-y-1.5">
              {opts.map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
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
        <div className="flex flex-wrap gap-x-5 gap-y-1 pl-1">
          <label className="flex items-center gap-2 text-xs text-neutral-500 select-none">
            <input type="checkbox" checked={q.required !== false}
              onChange={(e) => setQ(i, { required: e.target.checked })}
              className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
            Required
          </label>
          <label className="flex items-center gap-2 text-xs text-neutral-500 select-none">
            <input type="checkbox" checked={!!q.per_student}
              onChange={(e) => setQ(i, { per_student: e.target.checked })}
              className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
            Asked once per child (instead of once per family)
          </label>
        </div>
      </div>
    )
  }

  const familyQs = questions.filter((q) => !q.per_student)
  const studentQs = questions.filter((q) => q.per_student)

  const contactsEditor = (
    <label className="flex items-center gap-2 text-sm text-neutral-700 select-none">
      <input type="checkbox" checked={askContacts}
        onChange={(e) => setAskContacts(e.target.checked)}
        className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
      Ask families for emergency contacts (at least one required)
    </label>
  )

  const detailsStep = (
    <div className="space-y-6">
      <Editable label="Edit" open={openZones.has('contacts')} onToggle={() => toggleZone('contacts')} editor={contactsEditor}>
        {askContacts ? (
          <Section title="Emergency contacts" subtitle="Add at least one emergency contact for your family.">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-neutral-700">Contact 1</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input className={mockInput} readOnly placeholder="Full name" value="" />
                <select className={mockInput} disabled><option>Relationship</option></select>
                <input className={mockInput} readOnly placeholder="Phone" value="" />
                <input className={mockInput} readOnly placeholder="Email (optional)" value="" />
              </div>
            </div>
          </Section>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 px-4 py-3 text-sm text-neutral-400">
            Emergency contacts are turned off — families skip straight to your questions.
          </div>
        )}
      </Editable>

      <Section title="A few questions">
        <div className="space-y-5">
          {questions.length === 0 && (
            <p className="text-sm text-neutral-400">
              No intake questions yet — add one below and it appears here exactly as families will see it.
            </p>
          )}
          {familyQs.map((q) => {
            const i = questions.indexOf(q)
            return (
              <Editable key={q.key || `q-${i}`} open={openZones.has(`q-${i}`)} onToggle={() => toggleZone(`q-${i}`)}
                editor={questionEditor(q, i)}>
                <div className="p-1">
                  <div className="pointer-events-none">
                    <QuestionField q={q} value={q.type === 'multi' ? [] : ''} onChange={() => {}} />
                  </div>
                </div>
              </Editable>
            )
          })}
          {studentQs.length > 0 && (
            <div className={familyQs.length ? 'pt-4 border-t border-gray-100' : ''}>
              <h3 className="text-sm font-semibold text-neutral-900 mb-1">Your child</h3>
              <p className="text-[11px] text-neutral-400 mb-3">↓ These repeat for each child on the registration.</p>
              <div className="space-y-5">
                {studentQs.map((q) => {
                  const i = questions.indexOf(q)
                  return (
                    <Editable key={q.key || `q-${i}`} open={openZones.has(`q-${i}`)} onToggle={() => toggleZone(`q-${i}`)}
                      editor={questionEditor(q, i)}>
                      <div className="p-1">
                        <div className="pointer-events-none">
                          <QuestionField q={q} value={q.type === 'multi' ? [] : ''} onChange={() => {}} />
                        </div>
                      </div>
                    </Editable>
                  )
                })}
              </div>
            </div>
          )}
          <button
            onClick={() => {
              setQuestions((qs) => [...qs, { key: '', label: '', help: '', type: 'select', options: ['', ''], required: true, per_student: false }])
              toggleZone(`q-${questions.length}`)
            }}
            className="text-sm font-medium text-optio-purple hover:underline">
            + Add question
          </button>
        </div>
      </Section>
      <div className="pointer-events-none"><PrimaryButton>Continue</PrimaryButton></div>
    </div>
  )

  const paperworkEditor = (it, i) => {
    const linked = it.key && linkedKeys.has(it.key)
    return (
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input className={`${field} sm:flex-1`} placeholder="Label (e.g. Enrollment Agreement)"
            value={it.label} onChange={(e) => setItem(i, { label: e.target.value })} />
          {!linked && (
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
          )}
          <button onClick={() => setPaperwork((p) => p.filter((_, j) => j !== i))}
            className="text-red-500 text-sm px-2 hover:underline">Remove</button>
        </div>
        <textarea rows={3} className={field}
          placeholder="Text families read and agree to (optional if a document is attached)"
          value={it.body || ''} onChange={(e) => setItem(i, { body: e.target.value })} />
        {linked ? (
          <p className="text-xs text-neutral-500">
            {it.doc_url && (
              <a href={absUrl(it.doc_url)} target="_blank" rel="noreferrer" className="text-optio-purple font-medium hover:underline">View document</a>
            )}
            <span className={it.doc_url ? 'ml-3 text-neutral-400' : 'text-neutral-400'}>
              In your Resources library — replace or remove this document in the Resources tab, and the form updates too.
            </span>
          </p>
        ) : it.doc_url ? (
          <p className="text-xs text-neutral-500">
            <a href={absUrl(it.doc_url)} target="_blank" rel="noreferrer" className="text-optio-purple font-medium hover:underline">View document</a>
            <button onClick={() => setItem(i, { doc_url: '' })} className="ml-3 text-red-500 hover:underline">Remove document</button>
            <span className="ml-2 text-neutral-400">Saving adds this to your Resources library as the source of truth.</span>
          </p>
        ) : (
          <p className="text-xs text-neutral-400">No document yet — upload the waiver/agreement PDF, paste a link, or rely on the text above.</p>
        )}
        <input className={field} placeholder="Or paste a link to the document (https://…)"
          value={it.doc_url || ''} onChange={(e) => setItem(i, { doc_url: e.target.value })} />
      </div>
    )
  }

  const sampleFee = draftFeeCents(1)
  const feeEditor = (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div>
        <label className="block text-xs font-medium text-neutral-500 mb-1">Fee structure</label>
        <select className={field} value={feeMode} onChange={(e) => setFeeMode(e.target.value)}>
          <option value="flat">Flat per family</option>
          <option value="per_student">Per student</option>
          <option value="lesser">Per student, capped per family</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-500 mb-1">Per-family fee ($)</label>
        <input className={field} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-500 mb-1">Per-student fee ($)</label>
        <input className={field} inputMode="decimal" value={perStudentFee} onChange={(e) => setPerStudentFee(e.target.value)} />
      </div>
      <div className="sm:col-span-3">
        <label className="block text-xs font-medium text-neutral-500 mb-1">Stripe secret key (school's own Stripe account)</label>
        {stripeEnabled && !stripeClear && (
          <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-2">
            Card payment is on — a Stripe key is configured. Enter a new key to replace it, or clear it below.
          </p>
        )}
        <input type="password" className={field} value={stripeKey} onChange={(e) => { setStripeKey(e.target.value); if (e.target.value) setStripeClear(false) }}
          placeholder={stripeEnabled ? 'Enter a new key to replace the current one' : 'rk_live_… (restricted key recommended)'} autoComplete="off" />
        {stripeKey.trim() && !STRIPE_KEY_RE.test(stripeKey.trim()) && (
          <p className="text-xs text-red-600 mt-1" role="alert">
            This doesn't look like a Stripe secret key — it should start with sk_ or rk_ (e.g. sk_live_…)
            and be much longer. Copy the full key from Stripe Dashboard → Developers → API keys.
          </p>
        )}
        {stripeEnabled && (
          <label className="flex items-center gap-2 text-xs text-neutral-500 mt-2 select-none">
            <input type="checkbox" checked={stripeClear}
              onChange={(e) => { setStripeClear(e.target.checked); if (e.target.checked) setStripeKey('') }}
              className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
            Remove the stored key on save (turns card payment off)
          </label>
        )}
        <p className="text-xs text-neutral-400 mt-1">
          With a key set, parents pay by card at checkout and the platform verifies the payment
          with Stripe automatically. Without one, the funnel falls back to the external payment
          link below (or records the fee for you to collect separately).
        </p>
      </div>
      <div className="sm:col-span-3">
        <label className="block text-xs font-medium text-neutral-500 mb-1">Payment link (external, fallback)</label>
        <input className={field} value={paymentUrl} onChange={(e) => setPaymentUrl(e.target.value)} placeholder="https://…" />
      </div>
    </div>
  )

  const paperworkStep = (
    <div className="space-y-6">
      <Section title="Paperwork" subtitle="Review each item, confirm you agree, and type your full name to sign.">
        <div className="space-y-5">
          {paperwork.length === 0 && (
            <p className="text-sm text-neutral-400">
              No paperwork yet — add the agreements families read and e-sign during registration.
            </p>
          )}
          {paperwork.map((it, i) => (
            <Editable key={it.key || `p-${i}`} open={openZones.has(`p-${i}`)} onToggle={() => toggleZone(`p-${i}`)}
              editor={paperworkEditor(it, i)}>
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="font-semibold text-neutral-900">{it.label || 'Untitled item'}</span>
                  {it.doc_url && <a href={absUrl(it.doc_url)} target="_blank" rel="noreferrer" className="text-sm text-optio-purple hover:underline whitespace-nowrap">Open in new tab</a>}
                </div>
                {it.doc_url && /\.pdf($|\?)/i.test(it.doc_url) && (
                  <iframe src={absUrl(it.doc_url)} title={it.label}
                    className="w-full h-80 rounded-lg border border-gray-200 mb-3 bg-white" />
                )}
                {it.body && (
                  <div className="text-sm text-neutral-600 whitespace-pre-wrap bg-neutral-50 rounded-lg p-3 mb-3 max-h-56 overflow-y-auto">
                    {it.body}
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm text-neutral-700 mb-2 pointer-events-none">
                  <input type="checkbox" readOnly checked={false}
                    className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                  I confirm I have read and agree to the above terms
                </label>
                <input className={mockInput} readOnly placeholder="Type your full name to sign" value="" />
                <p className="text-xs text-neutral-400 mt-1.5">
                  By typing your name above, you agree this electronic signature has the same legal force and effect as a manual written signature.
                </p>
              </div>
            </Editable>
          ))}
          <button
            onClick={() => {
              setPaperwork((p) => [...p, { key: '', label: '', doc_url: '', body: '' }])
              toggleZone(`p-${paperwork.length}`)
            }}
            className="text-sm font-medium text-optio-purple hover:underline">
            + Add paperwork item
          </button>
        </div>
      </Section>
      {!feeStepVisible && (
        <Editable label="Add a fee" open={openZones.has('fee')} onToggle={() => toggleZone('fee')} editor={feeEditor}>
          <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 px-4 py-3 text-sm text-neutral-400">
            No registration fee — after signing, families go straight to the finish step.
            Setting a fee, payment link, or Stripe key adds the fee step back.
          </div>
        </Editable>
      )}
      <div className="pointer-events-none"><PrimaryButton>Continue</PrimaryButton></div>
    </div>
  )

  const feeStep = (
    <div className="space-y-6">
      <Editable label="Edit fees & payment" open={openZones.has('fee')} onToggle={() => toggleZone('fee')} editor={feeEditor}>
        <Section title={sampleFee > 0 ? 'Registration fee' : 'Finish your registration'}>
          <div className="text-center">
            {sampleFee > 0
              ? <p className="text-3xl font-bold text-optio-purple my-3">{money(sampleFee)}</p>
              : <p className="text-sm text-neutral-500 my-3">No payment is due — complete your registration below.</p>}
            {feeMode !== 'flat' && (
              <p className="text-[11px] text-neutral-400 -mt-1 mb-2">
                ↑ Shown for one student — {feeMode === 'per_student' ? 'multiplied by the number of children registered' : 'per student, capped at the per-family amount'}.
              </p>
            )}
            {sampleFee > 0 && (stripeEnabled && !stripeClear ? (
              <p className="text-xs text-neutral-400">
                You'll be taken to a secure Stripe checkout. Your registration completes automatically once the payment is verified.
              </p>
            ) : absUrl(paymentUrl) ? (
              <>
                <span className="inline-block px-5 py-2.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold">
                  Pay {money(sampleFee)}
                </span>
                <p className="text-xs text-neutral-400 mt-3">Payment opens in a new tab. Return here and continue once you've paid.</p>
              </>
            ) : (
              <p className="text-sm text-neutral-400">Your school will collect the fee separately.</p>
            ))}
          </div>
        </Section>
      </Editable>
      {waitlistGates.length > 0 && sampleFee > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold mb-1">One of your children is in a waitlisted age group.</p>
          <p className="mb-3">
            Paying now <strong>holds their place in line</strong> — it does not
            guarantee a spot. If they aren't accepted, that portion of your
            registration fee is <strong>fully refunded</strong> to your card. Your
            other children are enrolled as usual.
          </p>
          <label className="flex items-start gap-2 pointer-events-none">
            <input type="checkbox" readOnly checked={false}
              className="mt-0.5 h-4 w-4 rounded border-amber-400 text-optio-purple" />
            <span>I understand this fee holds my child's place and is fully
              refunded if they aren't accepted.</span>
          </label>
          <p className="text-[11px] text-amber-700/70 mt-2">
            ↑ Only shown when a registering child falls in a waitlisted age group.
          </p>
        </div>
      )}
      <div className="pointer-events-none">
        <PrimaryButton>
          {sampleFee > 0 && stripeEnabled && !stripeClear ? `Pay ${money(sampleFee)} securely`
            : sampleFee > 0 && absUrl(paymentUrl) ? "I've paid — finish registration"
              : 'Finish registration'}
        </PrimaryButton>
      </div>
    </div>
  )

  const doneEditor = (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-neutral-500 mb-1">After registration, families are sent to…</label>
        <select className={field} value={flow} onChange={(e) => setFlow(e.target.value)}>
          <option value="schedule">Schedule Builder + booking an appointment (iCreate style)</option>
          <option value="goals">The family goals page — set direction and goals together</option>
        </select>
        <p className="text-xs text-neutral-400 mt-1">
          This also switches the org between schedule mode and goals mode in the SIS
          (the Goals tab shows for goals-mode orgs).
        </p>
      </div>
      {flow !== 'goals' && (
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Scheduling link (emailed after payment)</label>
          <input className={field} value={schedulingUrl} onChange={(e) => setSchedulingUrl(e.target.value)} placeholder="https://…" />
        </div>
      )}
    </div>
  )

  const doneStep = (
    <div className="space-y-6">
      <Editable label="Edit next steps" open={openZones.has('done')} onToggle={() => toggleZone('done')} editor={doneEditor}>
        {flow === 'goals' ? (
          <div className="space-y-6 text-center">
            <div className="bg-white rounded-xl border border-gray-200 p-8">
              <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
              <h2 className="text-xl font-bold text-neutral-900 mb-2">Your account is ready</h2>
              <p className="text-neutral-500 mb-5">
                Next, sit down with each of your kids and set a direction and goals for the
                year together.
              </p>
              <span className="inline-block px-5 py-2.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold">
                Set your student's goals
              </span>
              <p className="text-sm text-neutral-500 mt-5">
                You'll review these together at your meeting with {org.name || 'the school'}.
              </p>
            </div>
            <p className="text-sm text-neutral-400">
              Registration is complete. You can sign in at any time with your email and password.
            </p>
          </div>
        ) : (
          <div className="space-y-6 text-center">
            <div className="bg-white rounded-xl border border-gray-200 p-8">
              <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
              <h2 className="text-xl font-bold text-neutral-900 mb-2">Your account is ready</h2>
              <p className="text-neutral-500 mb-5">
                Your account has been created. Next, use the Schedule Builder to create your
                family's schedule for the coming school year.
              </p>
              <span className="inline-block px-5 py-2.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold">
                Open the Schedule Builder
              </span>
              <div className="border-t border-gray-100 mt-7 pt-6">
                <p className="text-neutral-500 mb-5">
                  Then book an appointment with {org.name || 'the school'} staff to build your Customized Learning
                  Plan — our team will review your schedule with you at the meeting.
                </p>
                {absUrl(schedulingUrl) ? (
                  <span className="inline-block px-5 py-2.5 rounded-lg border border-optio-purple text-optio-purple font-semibold">
                    Book appointment
                  </span>
                ) : (
                  <p className="text-sm text-neutral-400">The school will reach out to schedule your appointment.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Editable>
    </div>
  )

  // If the viewed step just disappeared (e.g. the fee was cleared while on the
  // fee step), fall to the finish step rather than a blank pane.
  const activeStep = editorSteps.includes(step) ? step : 'done'
  const stepBody = {
    account: accountStep, family: familyStep, details: detailsStep,
    paperwork: paperworkStep, fee: feeStep, done: doneStep,
  }[activeStep]

  return (
    <div className="space-y-6">
      {/* The standing link families use to enter the funnel below */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
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
              onClick={() => copyText(regLinkUrl, setCopied)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                copied ? 'bg-green-100 text-green-700' : 'bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:opacity-90'
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
          <p className="text-xs text-neutral-400">
            Share this standing link with families — it opens the registration flow shown below.
          </p>
          {regLink && (
            <>
              <a href={`${getLearningOrigin()}/enroll/${regLink.invitation_code}?preview=1`}
                target="_blank" rel="noreferrer" className="text-xs text-optio-purple font-medium hover:underline">
                Open live preview
              </a>
              <button onClick={() => copyText(embedSnippet, setEmbedCopied)}
                className="text-xs text-optio-purple font-medium hover:underline">
                {embedCopied ? 'Embed code copied' : 'Copy schedule embed code'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* The funnel, exactly as families see it, with Edit controls */}
      <div className="bg-neutral-50 rounded-xl border border-gray-200 overflow-hidden">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-2xl mx-auto px-6 py-6 flex items-center gap-6">
            {logo ? (
              <div className="flex flex-col items-center shrink-0">
                <img src={logo} alt={org.name} className="h-24 w-auto max-w-full object-contain" />
                {org.branding_config?.logo_subtitle && (
                  <p className="mt-1 text-sm font-semibold uppercase tracking-[0.45em] text-optio-purple">
                    {org.branding_config.logo_subtitle}
                  </p>
                )}
              </div>
            ) : (
              <span className="text-3xl font-bold text-optio-purple">{org.name}</span>
            )}
            <h1 className="text-lg font-semibold text-neutral-500 tracking-wide">Family Registration</h1>
          </div>
        </header>
        <main className="px-6 py-8 flex gap-10">
          <VerticalStepper step={activeStep} steps={editorSteps} labels={editorLabels} onNavigate={setStep} freeNav />
          <div className="flex-1 min-w-0 max-w-2xl">
            <div className="mb-6 rounded-lg bg-optio-purple/5 border border-optio-purple/20 px-4 py-3 text-sm text-neutral-700">
              <span className="font-semibold text-optio-purple">This is what families see.</span>{' '}
              Click a step on the left to view it; anything your school can change has an{' '}
              <span className="font-semibold">Edit</span> control. Changes apply when you save below.
            </div>
            {stepBody}
          </div>
        </main>
      </div>

      {/* Save bar */}
      <div className="sticky bottom-4 z-20">
        <div className="bg-white rounded-xl border border-gray-200 shadow-lg px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-neutral-500">
            {editorLabels[activeStep]} step — changes to questions, paperwork, fees, and next steps
            save together. Waitlist ages and first day of school save on their own.
          </p>
          <button onClick={save} disabled={saving}
            className="shrink-0 px-5 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium hover:opacity-90 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save registration settings'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default RegistrationSetupTab

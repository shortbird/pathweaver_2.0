import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { CheckIcon, ClipboardIcon } from '@heroicons/react/24/solid'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { canSeeFinance } from '../../pages/sis/sisRole'
import { getLearningOrigin } from '../../utils/appSurface'
import { STEPS, STEP_LABELS, absUrl, VerticalStepper } from '../registration/funnelUi'
import { useConfirm } from '../../contexts/ConfirmContext'

/**
 * The Registration setup tab: the family registration funnel rendered exactly
 * as families see it (same shared components as pages/RegisterFunnelPage.jsx),
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
// QF-02: one component per funnel step. Editable/FixedNote/mockInput and the
// Stripe key shape moved to ./registrationSetup/setupChrome with them.
import { STRIPE_KEY_RE } from './registrationSetup/setupChrome'
import AccountStepPreview from './registrationSetup/AccountStepPreview'
import FamilyStepPreview from './registrationSetup/FamilyStepPreview'
import { DetailsStepPreview, RecordsStepPreview } from './registrationSetup/DetailsRecordsSteps'
import { PaperworkStepPreview, FeeStepPreview } from './registrationSetup/PaperworkFeeSteps'
import DoneStepPreview from './registrationSetup/DoneStepPreview'

const RegistrationSetupTab = ({ orgId, orgData, onUpdate }) => {
  const confirm = useConfirm()
  const { user } = useAuth()
  // Fees and the school's Stripe key are FINANCE_ROLES. A campus coordinator
  // runs the rest of the funnel — paperwork, questions, scheduling link — and
  // the backend redacts the amounts out of what they read, so there is nothing
  // here to render even if this check were wrong.
  const seesFinance = canSeeFinance(user)
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
  // Credit partner switches. Both default OFF: an ordinary microschool
  // registration has no transcript to route and no Academy enrollment to make.
  const [askRecords, setAskRecords] = useState(!!cfg?.records_destination)
  const [academyEnroll, setAcademyEnroll] = useState(!!cfg?.academy_enrollment)
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
    api.get(`/api/registration/config/${regLink.invitation_code}`)
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
    if (!(await confirm('Reset the family registration link? Anyone who has the current link will no longer be able to use it.'))) return
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
    if (seesFinance && (Number.isNaN(feeCents) || feeCents < 0)) return toast.error('Enter a valid per-family fee')
    if (seesFinance && (Number.isNaN(perStudentCents) || perStudentCents < 0)) return toast.error('Enter a valid per-student fee')
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
      records_destination: askRecords,
      academy_enrollment: academyEnroll,
      scheduling_url: absUrl(schedulingUrl),
      paperwork: items,
      questions: qs,
    }
    // The money is submitted only by someone who may set it. A coordinator's
    // save leaves these keys out entirely, and the backend merges rather than
    // replaces, so the stored fees survive a form that never saw them.
    if (seesFinance) {
      newCfg.fee_mode = feeMode
      newCfg.registration_fee_cents = feeCents
      newCfg.per_student_fee_cents = perStudentCents
      newCfg.payment_url = absUrl(paymentUrl)
      // Only touch the stored Stripe key when the admin acted on it.
      if (stripeClear) newCfg.stripe_secret_key = ''
      else if (stripeKey.trim()) newCfg.stripe_secret_key = stripeKey.trim()
      else delete newCfg.stripe_secret_key
    } else {
      delete newCfg.stripe_secret_key
    }

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
  // A coordinator cannot see the amounts, so "no fee configured" is not a
  // conclusion they are entitled to draw — the step stays, stated as unknown.
  const feeStepVisible = !seesFinance
    || feeApplies || Boolean(absUrl(paymentUrl)) || (stripeEnabled && !stripeClear)
  const editorSteps = STEPS.filter((st) => (st !== 'fee' || feeStepVisible) && (st !== 'records' || askRecords))
  const editorLabels = askContacts ? STEP_LABELS : { ...STEP_LABELS, details: 'A few questions' }

  // ── Step bodies ────────────────────────────────────────────────────────────
  // One component per funnel step, in ./registrationSetup/. They render the
  // family-facing markup; this component keeps the draft state and the save,
  // which is why the props go one way and every setter comes from here.
  const sampleFee = draftFeeCents(1)
  const feeEditorProps = {
    fee, setFee, feeMode, setFeeMode, paymentUrl, setPaymentUrl,
    perStudentFee, setPerStudentFee, stripeClear, setStripeClear,
    stripeEnabled, stripeKey, setStripeKey,
  }

  // If the viewed step just disappeared (e.g. the fee was cleared while on the
  // fee step), fall to the finish step rather than a blank pane.
  const activeStep = editorSteps.includes(step) ? step : 'done'
  const stepBody = {
    account: <AccountStepPreview org={org} />,
    family: (
      <FamilyStepPreview
        askHealth={askHealth} setAskHealth={setAskHealth}
        draftFeeCents={draftFeeCents} feeApplies={feeApplies} onUpdate={onUpdate}
        openZones={openZones} toggleZone={toggleZone}
        org={org} orgId={orgId} waitlistGates={waitlistGates}
      />
    ),
    details: (
      <DetailsStepPreview
        academyEnroll={academyEnroll} setAcademyEnroll={setAcademyEnroll}
        addOption={addOption} asOptions={asOptions}
        askContacts={askContacts} setAskContacts={setAskContacts}
        askRecords={askRecords} setAskRecords={setAskRecords}
        openZones={openZones} toggleZone={toggleZone}
        optFocus={optFocus} patchOptions={patchOptions}
        questions={questions} setQ={setQ} setQuestions={setQuestions}
      />
    ),
    records: (
      <RecordsStepPreview
        academyEnroll={academyEnroll} setAcademyEnroll={setAcademyEnroll}
        askRecords={askRecords} setAskRecords={setAskRecords}
        openZones={openZones} toggleZone={toggleZone}
      />
    ),
    paperwork: (
      <PaperworkStepPreview
        draftFeeCents={draftFeeCents} linkedKeys={linkedKeys}
        setItem={setItem} setPaperwork={setPaperwork}
        uploadDoc={uploadDoc} uploadingDoc={uploadingDoc}
        paperwork={paperwork} openZones={openZones} toggleZone={toggleZone}
        feeStepVisible={feeStepVisible} seesFinance={seesFinance}
        feeEditorProps={feeEditorProps}
      />
    ),
    fee: (
      <FeeStepPreview
        feeMode={feeMode} paymentUrl={paymentUrl} sampleFee={sampleFee}
        seesFinance={seesFinance} stripeClear={stripeClear} stripeEnabled={stripeEnabled}
        waitlistGates={waitlistGates} openZones={openZones} toggleZone={toggleZone}
        feeEditorProps={feeEditorProps}
      />
    ),
    done: (
      <DoneStepPreview
        flow={flow} setFlow={setFlow}
        schedulingUrl={schedulingUrl} setSchedulingUrl={setSchedulingUrl}
        org={org} openZones={openZones} toggleZone={toggleZone}
      />
    ),
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

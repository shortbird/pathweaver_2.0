import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import { compressImage } from '../utils/compressImage'
import { clearRegistrationGate } from '../hooks/useRegistrationGate'
// Presentational funnel pieces are shared with the SIS Registration setup
// editor, which renders these exact components with the config editable. The
// page itself now only needs the steppers and absUrl; each step component
// imports the fields and buttons it actually uses.
// (POST_FEE_STEPS was imported here and never referenced -- dropped.)
import {
  STEPS, STEP_LABELS, absUrl, enrollmentGateFor,
  VerticalStepper, MobileStepper,
} from '../components/registration/funnelUi'

// Branded multi-step parent registration for the iCreate microschool.
// Reached only for iCreate parent registration links (AcceptInvitationPage
// redirects here); every other org keeps the standard invitation flow.
//
// Steps (ported from the OSH registration wizard — see
// docs/icreate/osh-registration-inventory.md):
//   account     create an Optio account (name/email/password + emailed 6-digit
//               code) OR sign into an existing one (auto-attached to iCreate)
//   family      phone/address + kids (photo, DOB, allergies, medications)
//   details     emergency contacts + org questions
//   paperwork   acknowledge/e-sign each configured item (rich body text)
//   fee         Stripe card / external payment link / record-only
//   done        "Your account is ready" — final page listing the next steps:
//               book the Customized Learning Plan appointment + build the
//               schedule beforehand. Both stay reachable after leaving (the
//               booking link is emailed; the Schedule Builder has a
//               "Book appointment" button), so this page never has to be found again.
import {
  EMAIL_RE, isoToMdy, emptyKid, emptyContact, mergeAutofilledFields,
  FAMILY_INPUT_NAMES, firstQuestionError, firstDestinationError, PHOTO_TIPS,
} from './registerFunnel/funnelFields'
// One component per step. The page owns the state -- a wizard's state genuinely
// crosses its steps, and `kids` alone is read by four of them -- and each step
// owns its own markup, which is the half that was 650 lines of one render.
import AccountStep from './registerFunnel/AccountStep'
import VerifyStep from './registerFunnel/VerifyStep'
import FamilyStep from './registerFunnel/FamilyStep'
import DetailsStep from './registerFunnel/DetailsStep'
import RecordsStep from './registerFunnel/RecordsStep'
import PaperworkStep from './registerFunnel/PaperworkStep'
import FeeStep from './registerFunnel/FeeStep'
import DoneStep from './registerFunnel/DoneStep'

// (PhotoPicker, steppers, Section, PasswordInput, PrimaryButton, QuestionField
// all live in components/registration/funnelUi.jsx, shared with the SIS setup
// editor.)

const RegisterFunnelPage = () => {
  const { code } = useParams()
  // ?preview=1 — staff walkthrough: step through the whole funnel with sample
  // data and NO writes (no accounts, no emails, no charges). Safe on a public
  // page because every mutating call is short-circuited to a local step change.
  const previewMode = !!code && new URLSearchParams(window.location.search).has('preview')
  const [loading, setLoading] = useState(true)
  const [fatal, setFatal] = useState(null)
  const [config, setConfig] = useState(null)
  // A fee step only exists when the org can actually charge a registration fee
  // (a flat/per-student fee, an external payment link, or card payment). Zero-fee
  // orgs (e.g. Gryffin) never see it — not in the flow, the stepper, or preview.
  const feeApplies = Boolean(
    Number(config?.registration_fee_cents) > 0
    || Number(config?.per_student_fee_cents) > 0
    || config?.payment_url
    || config?.stripe_enabled,
  )
  // Only credit partner funnels ask where a transcript should be sent.
  const recordsApply = Boolean(config?.records_destination)
  const steps = STEPS.filter((s) => (s !== 'fee' || feeApplies) && (s !== 'records' || recordsApply))
  // When the org doesn't collect emergency contacts, the details step is only
  // the questions — label it that way in the steppers.
  const stepLabels = config?.emergency_contacts === false
    ? { ...STEP_LABELS, details: 'A few questions' }
    : STEP_LABELS
  const [step, setStep] = useState('account')
  const [submitting, setSubmitting] = useState(false)

  // account step
  const [mode, setMode] = useState('create')            // create | signin
  const [account, setAccount] = useState({ first_name: '', last_name: '', email: '', password: '', confirm: '' })
  const [pendingVerify, setPendingVerify] = useState(null) // { registration_id, email }
  const [otp, setOtp] = useState('')
  // Standing note above the account step: either "your account signs in with
  // Apple, use the button" (from /login's oauth_account refusal) or a guardrail
  // refusal handed back by /auth/callback after a failed attach. Sticky rather
  // than a toast — both need to stay readable while the parent acts on them.
  const [accountNotice, setAccountNotice] = useState(
    () => new URLSearchParams(window.location.search).get('attach_error') || '',
  )

  // family step
  const [family, setFamily] = useState({ phone: '', address_line1: '', address_line2: '', city: '', state: '', postal_code: '' })
  const addressBoxRef = useRef(null)  // autofill reconciliation (mergeAutofilledFields)
  const [kids, setKids] = useState([emptyKid()])
  const [parentPhoto, setParentPhoto] = useState({ file: null, preview: '', avatar_url: '', uploading: false, error: '' })

  // records step — one destination per registered student, keyed by user_id.
  // Siblings routinely attend different schools, so this is never one answer
  // for the family.
  const [destinations, setDestinations] = useState({})

  // details step
  const [contacts, setContacts] = useState([emptyContact()])
  const [answers, setAnswers] = useState({})
  // Kids as the SERVER knows them (user_id + name) — set at family submit and
  // on resume. Per-student questions key their answers by kid user_id.
  const [serverKids, setServerKids] = useState([])

  // funnel state (issued only after email verification / sign-in)
  const [reg, setReg] = useState(null) // { registration_id, access_token }
  const [feeCents, setFeeCents] = useState(0)
  // Legacy: fully-waitlisted families whose fee was deferred to first release.
  // New registrations pay up front (fee holds the place, refunded if not
  // accepted), so this is false for them.
  const [feeDeferred, setFeeDeferred] = useState(false)
  // Consent to the hold-your-place / fully-refundable terms, required before
  // paying when the family includes a waitlisted child.
  const [waitlistAck, setWaitlistAck] = useState(false)
  const [signatures, setSignatures] = useState({})
  const [agreed, setAgreed] = useState({})
  const [scheduling, setScheduling] = useState({ url: '', emailed: false })

  useEffect(() => {
    let alive = true
    if (code) {
      // Fresh visit from the registration link.
      api.get(`/api/registration/config/${code}`)
        .then((r) => { if (alive) setConfig(r.data) })
        .catch((e) => { if (alive) setFatal(e.response?.data?.error || 'This registration link is not valid.') })
        .finally(() => { if (alive) setLoading(false) })
    } else {
      // /enroll/resume — logged-in continuation of an unfinished
      // registration (PrivateRoute forces iCreate parents here).
      api.get('/api/registration/my-registration')
        .then((r) => {
          if (!alive) return
          const regData = r.data?.registration
          if (!regData) { window.location.replace('/'); return }
          setConfig(r.data)
          setReg({ registration_id: regData.registration_id, access_token: regData.access_token })
          setFeeCents(regData.fee_cents || 0)
          setFeeDeferred(!!regData.fee_deferred)
          // Prefill everything already submitted so completed steps are editable.
          if (regData.household) {
            const h = regData.household
            setFamily({
              phone: h.phone || '', address_line1: h.address_line1 || '', address_line2: h.address_line2 || '',
              city: h.city || '', state: h.state || '', postal_code: h.postal_code || '',
            })
          }
          setServerKids((regData.kids || []).filter((k) => k.user_id))
          if ((regData.kids || []).length) {
            setKids(regData.kids.map((k) => ({
              ...emptyKid(),
              user_id: k.user_id || '',
              first_name: k.first_name || (k.name || '').split(' ')[0] || '',
              last_name: k.last_name || (k.name || '').split(' ').slice(1).join(' ') || '',
              preferred_name: k.preferred_name || '', gender: k.gender || '',
              date_of_birth: k.dob || '', dob_text: isoToMdy(k.dob),
              email: k.email || '',
              allergies: k.allergies || '', medications: k.medications || '',
              avatar_url: k.avatar_url || '',
            })))
          }
          setParentPhoto({ file: null, preview: '', avatar_url: regData.parent_avatar_url || '', uploading: false, error: '' })
          setScheduling({ url: absUrl(regData.scheduling_url), emailed: !!regData.scheduling_emailed })
          if ((regData.emergency_contacts || []).length) {
            setContacts(regData.emergency_contacts.map((c) => ({
              name: c.name || '', relationship: c.relationship || '', phone: c.phone || '', email: c.email || '',
            })))
          }
          if (Object.keys(regData.answers || {}).length) setAnswers(regData.answers)
          if (Object.keys(regData.records_destinations || {}).length) {
            setDestinations(Object.fromEntries(
              Object.entries(regData.records_destinations).map(([id, d]) => [id, {
                destination_type: d.destination_type || '',
                school_name: d.school_name || '', school_city: d.school_city || '',
                school_state: d.school_state || '', school_district: d.school_district || '',
                registrar_name: d.registrar_name || '', registrar_email: d.registrar_email || '',
                registrar_phone: d.registrar_phone || '',
                student_id_at_school: d.student_id_at_school || '',
                auto_send_consent: !!d.auto_send_consent,
              }]),
            ))
          }
          if ((regData.paperwork || []).length) {
            setSignatures(Object.fromEntries(regData.paperwork.map((p) => [p.key, p.signed_name || ''])))
            setAgreed(Object.fromEntries(regData.paperwork.map((p) => [p.key, true])))
          }
          // Legacy statuses from when schedule/appointment were funnel steps
          // all land on the final next-steps page.
          setStep(['schedule', 'appointment', 'completed'].includes(regData.status) ? 'done' : regData.status)
          // Local draft (typed but never submitted) beats the server prefill
          // for steps the server hasn't received.
          applyDraft(regData.registration_id, regData.status)
        })
        .catch(() => { if (alive) setFatal('Could not load your registration. Please log in and try again.') })
        .finally(() => { if (alive) setLoading(false) })
    }
    return () => { alive = false }
  }, [code])

  // Always start each step at the top of the page.
  useEffect(() => { window.scrollTo(0, 0) }, [step])

  // The refusal handed back by /auth/callback has been read into state; drop it
  // from the URL so a reload doesn't resurrect a stale error (and so it can't
  // ride along into the ?preview / ?payment params the funnel also reads).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.has('attach_error')) return
    params.delete('attach_error')
    const q = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${q ? `?${q}` : ''}`)
  }, [])

  // Preview mode: prefill every step with sample data so the form reads like a
  // real registration without typing anything.
  useEffect(() => {
    if (!previewMode || !config) return
    setAccount({ first_name: 'Pat', last_name: 'Sample', email: 'pat.sample@example.com', password: 'preview-only', confirm: 'preview-only' })
    setFamily({ phone: '(555) 555-0100', address_line1: '123 Sample St', address_line2: '', city: 'Lehi', state: 'UT', postal_code: '84043' })
    setKids([{ ...emptyKid(), first_name: 'Casey', last_name: 'Sample', gender: 'female', date_of_birth: '2018-03-14', dob_text: '03/14/2018' }])
    setContacts([{ name: 'Alex Sample', relationship: 'Grandparent', phone: '(555) 555-0101', email: '' }])
    setReg({ registration_id: 'preview', access_token: 'preview' })
    // Fee estimate for one sample kid, mirroring the backend fee model.
    const family_ = config.registration_fee_cents || 0
    const per = config.per_student_fee_cents || 0
    const opts = [family_, per].filter((v) => v > 0)
    setFeeCents(config.fee_mode === 'per_student' ? per
      : config.fee_mode === 'lesser' ? (opts.length ? Math.min(...opts) : 0)
      : family_)
    // Coming back from the preview Stripe page (full reload): land on the
    // right step instead of restarting at the account step.
    const payment = new URLSearchParams(window.location.search).get('payment')
    if (payment) {
      window.history.replaceState({}, '', `${window.location.pathname}?preview=1`)
      if (payment === 'preview-return') {
        setScheduling({ url: absUrl(config.scheduling_url), emailed: true })
        setStep('done')
      } else {
        setStep('fee')
        toast('Preview payment canceled — you can try again.')
      }
    }
  }, [previewMode, config])

  // Preview mode: the payment/fee actions land here instead of hitting the API.
  const previewFinish = () => {
    setScheduling({ url: absUrl(config?.scheduling_url), emailed: true })
    setStep('done')
  }

  // Mirror the backend fee model so parents see a live estimate as they add kids.
  const estimateFeeCents = () => {
    if (!config) return 0
    const n = kids.filter((k) => k.first_name.trim() && k.date_of_birth).length
    const family_ = config.registration_fee_cents || 0
    const per = config.per_student_fee_cents || 0
    const mode_ = config.fee_mode || 'flat'
    if (mode_ === 'per_student') return per * n
    if (mode_ === 'lesser') { const o = [family_, per * n].filter((v) => v > 0); return o.length ? Math.min(...o) : 0 }
    return family_
  }

  const setKid = (i, patch) => setKids((ks) => ks.map((k, j) => (j === i ? { ...k, ...patch } : k)))
  const setKidByKey = (key, patch) => setKids((ks) => ks.map((k) => (k._key === key ? { ...k, ...patch } : k)))
  const setContact = (i, patch) => setContacts((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  // ── Draft persistence ───────────────────────────────────────────────────────
  // Mobile Safari discards the tab when parents switch apps mid-form (e.g. to
  // check a birthday or take a photo), wiping everything they typed. Unsaved
  // form state is mirrored to localStorage per registration and restored on
  // resume. Only sections the server hasn't received yet are restored, so a
  // stale phone draft can never override a family submitted from a computer.

  const DRAFT_VERSION = 1
  const draftKey = (regId) => `icreate_draft_${regId}`

  const applyDraft = (regId, status) => {
    if (previewMode) return
    let d = null
    try { d = JSON.parse(localStorage.getItem(draftKey(regId)) || 'null') } catch { /* corrupt draft */ }
    if (!d || d.v !== DRAFT_VERSION) return
    if (status === 'family') {
      if (d.family && Object.values(d.family).some((v) => String(v || '').trim())) setFamily(d.family)
      const draftKids = (d.kids || []).filter((k) =>
        (k.first_name || '').trim() || (k.last_name || '').trim() || k.date_of_birth || k.staged_url)
      if (draftKids.length) setKids(draftKids.map((k) => ({ ...emptyKid(), ...k })))
      if (d.parent_avatar_url) {
        setParentPhoto((p) => (p.avatar_url ? p : { ...p, avatar_url: d.parent_avatar_url }))
      }
    }
    if (status === 'family' || status === 'details') {
      const draftContacts = (d.contacts || []).filter((c) => (c.name || '').trim() || (c.phone || '').trim())
      if (draftContacts.length) setContacts(draftContacts)
      if (d.answers && Object.keys(d.answers).length) setAnswers(d.answers)
    }
  }

  useEffect(() => {
    if (!reg || previewMode) return
    if (step === 'done') {
      try { localStorage.removeItem(draftKey(reg.registration_id)) } catch { /* best-effort */ }
      return
    }
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey(reg.registration_id), JSON.stringify({
          v: DRAFT_VERSION,
          family,
          // File objects and blob previews can't survive a reload — persist the
          // uploaded URLs instead (photos upload the moment they're picked).
          kids: kids.map(({ photo_file, photo_preview, photo_uploading, photo_error, ...rest }) => rest),
          parent_avatar_url: parentPhoto.avatar_url || '',
          contacts, answers,
        }))
      } catch { /* storage full or blocked — drafts are best-effort */ }
    }, 400)
    return () => clearTimeout(t)
  }, [reg, previewMode, step, family, kids, parentPhoto.avatar_url, contacts, answers])

  // ── Photo uploads (immediate) ───────────────────────────────────────────────
  // Photos upload the moment they're picked, so a failure surfaces right away
  // (with recovery tips) instead of silently dying at the end of the form, and
  // an uploaded photo survives tab reloads. If the immediate upload fails the
  // file stays in state and the post-submit fallback retries it.

  const uploadPhoto = (targetUserId, file) => {
    const form = new FormData()
    form.append('file', file)
    form.append('access_token', reg.access_token)
    form.append('target_user_id', targetUserId)
    return api.post(`/api/registration/registrations/${reg.registration_id}/photo`, form)
  }

  const pickParentPhoto = async (f) => {
    if (!f.size) return setParentPhoto((p) => ({ ...p, error: PHOTO_TIPS }))
    // Shrink big phone photos to JPEG before upload so they clear the 5MB limit.
    // Falls back to the original file if the browser can't decode/encode it.
    const file = await compressImage(f).catch(() => f)
    const preview = URL.createObjectURL(file)
    const canUpload = !previewMode && !!reg
    setParentPhoto({ file, preview, avatar_url: '', uploading: canUpload, error: '' })
    if (!canUpload) return
    try {
      const { data } = await uploadPhoto('parent', file)
      setParentPhoto({ file: null, preview, avatar_url: data.avatar_url, uploading: false, error: '' })
    } catch (e) {
      setParentPhoto((p) => ({ ...p, uploading: false, error: e.response?.data?.error || PHOTO_TIPS }))
    }
  }

  const pickKidPhoto = async (kidRef, f) => {
    const key = kidRef._key
    if (!f.size) return setKidByKey(key, { photo_error: PHOTO_TIPS })
    // Shrink big phone photos to JPEG before upload so they clear the 5MB limit.
    // Falls back to the original file if the browser can't decode/encode it.
    const file = await compressImage(f).catch(() => f)
    const preview = URL.createObjectURL(file)
    const canUpload = !previewMode && !!reg
    setKidByKey(key, {
      photo_file: file, photo_preview: preview, avatar_url: '', staged_url: '',
      photo_uploading: canUpload, photo_error: '',
    })
    if (!canUpload) return
    try {
      // Kids restored on back-edit already have accounts — upload straight to
      // them. New kids have no account until the family submits, so the file
      // is staged under the registration and attached at submit (photo_url).
      const { data } = await uploadPhoto(kidRef.user_id || 'staged', file)
      setKidByKey(key, kidRef.user_id
        ? { photo_file: null, avatar_url: data.avatar_url, photo_uploading: false, photo_error: '' }
        : { photo_file: null, staged_url: data.photo_url, photo_uploading: false, photo_error: '' })
    } catch (e) {
      setKidByKey(key, { photo_uploading: false, photo_error: e.response?.data?.error || PHOTO_TIPS })
    }
  }

  // ── Account step ────────────────────────────────────────────────────────────

  const submitCreate = async () => {
    if (previewMode) return setStep('family')
    if (!account.first_name.trim() || !account.last_name.trim()) return toast.error('Enter your first and last name')
    if (!EMAIL_RE.test(account.email)) return toast.error('Enter a valid email')
    if (account.password.length < 8) return toast.error('Password must be at least 8 characters')
    if (account.password !== account.confirm) return toast.error('Passwords do not match')
    setSubmitting(true)
    try {
      const { data } = await api.post('/api/registration/start', {
        code,
        first_name: account.first_name.trim(), last_name: account.last_name.trim(),
        email: account.email.trim(), password: account.password,
      })
      setPendingVerify({ registration_id: data.registration_id, email: data.email })
      if (data.otp_sent === false) {
        toast.error('We could not send the confirmation email — click "Resend code" in a moment.')
      } else if (data.message) {
        toast.success(data.message)
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not create your account')
    } finally {
      setSubmitting(false)
    }
  }

  // Quietly establish a real app session (httpOnly cookies) so the later
  // "build your schedule" step can open the Schedule Builder without another
  // sign-in. The wizard itself keeps working off the funnel access_token, so a
  // failure here is invisible.
  // Log the parent into the app proper alongside the funnel, so leaving mid-way
  // lands them signed in. Password-only by design: accounts that arrive through
  // the Google/Apple buttons already hold a session from /auth/callback, and
  // there is no password to replay for them.
  const establishSession = async (email, password) => {
    if (!password) return
    try { await api.post('/api/auth/login', { email, password }) } catch { /* wizard works without it */ }
  }

  const submitVerify = async () => {
    if (!/^\d{6}$/.test(otp.trim())) return toast.error('Enter the 6-digit code from your email')
    setSubmitting(true)
    try {
      const { data } = await api.post('/api/registration/verify', {
        registration_id: pendingVerify.registration_id, code: otp.trim(),
      })
      setReg({ registration_id: pendingVerify.registration_id, access_token: data.access_token })
      await establishSession(account.email.trim(), account.password)
      setStep('family')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not verify the code')
    } finally {
      setSubmitting(false)
    }
  }

  const resendCode = async () => {
    try {
      const { data } = await api.post('/api/registration/resend-code', { registration_id: pendingVerify.registration_id })
      if (data.sent === false) toast.error('We could not send the code — please try again in a moment.')
      else toast.success('We emailed you a new code')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not resend the code')
    }
  }

  const submitSignin = async () => {
    if (previewMode) return setStep('family')
    if (!EMAIL_RE.test(account.email)) return toast.error('Enter a valid email')
    if (!account.password) return toast.error('Enter your password')
    setSubmitting(true)
    setAccountNotice('')
    try {
      const { data } = await api.post('/api/registration/login', {
        code, email: account.email.trim(), password: account.password,
      })
      setReg({ registration_id: data.registration_id, access_token: data.access_token })
      await establishSession(account.email.trim(), account.password)
      toast.success(`Welcome back${data.first_name ? `, ${data.first_name}` : ''}!`)
      // Already-registered parents go straight to the app — never back through the
      // family step (re-running it used to duplicate their children). Only truly
      // in-flight registrations resume at their current funnel step.
      if (['completed', 'schedule', 'appointment'].includes(data.status)) {
        window.location.replace('/')
        return
      }
      setStep(data.status || 'family')
      applyDraft(data.registration_id, data.status || 'family')
    } catch (e) {
      const err = e.response?.data
      // oauth_account: there is no password on this account to get wrong. A
      // toast would scroll away; keep the instruction pinned next to the button
      // it is telling them to press.
      if (err?.code === 'oauth_account') setAccountNotice(err.error)
      else toast.error(err?.error || 'Could not sign in')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Family step ─────────────────────────────────────────────────────────────

  // Fallback for photos whose upload-on-select failed (they still hold a File):
  // retried AFTER the family submit, when the kid accounts exist. Kids in the
  // response are matched back to the form by name + DOB. Best-effort: the
  // registration stands even if an upload hiccups (the parent can re-upload by
  // back-editing this step).
  const uploadFamilyPhotos = async (createdKids) => {
    let failed = 0
    if (parentPhoto.file) {
      try {
        const { data } = await uploadPhoto('parent', parentPhoto.file)
        setParentPhoto((p) => ({ ...p, file: null, avatar_url: data.avatar_url, error: '' }))
      } catch {
        failed += 1
        setParentPhoto((p) => ({ ...p, error: PHOTO_TIPS }))
      }
    }
    for (const k of kids) {
      if (!k.photo_file) continue
      const match = (createdKids || []).find((ck) => (
        ck.first_name === k.first_name.trim() && ck.last_name === k.last_name.trim() && ck.dob === k.date_of_birth
      ))
      if (!match?.user_id) { failed += 1; setKidByKey(k._key, { photo_error: PHOTO_TIPS }); continue }
      try {
        const { data } = await uploadPhoto(match.user_id, k.photo_file)
        setKidByKey(k._key, { photo_file: null, photo_preview: '', avatar_url: data.avatar_url, photo_error: '' })
      } catch {
        failed += 1
        setKidByKey(k._key, { photo_error: PHOTO_TIPS })
      }
    }
    if (failed) toast.error(`${failed} photo${failed === 1 ? '' : 's'} did not upload — see the tips by the photo, or retry from this step later.`)
  }

  const submitFamily = async () => {
    if (previewMode) return setStep('details')
    // Reconcile autofilled-but-unsynced inputs before validating (see
    // mergeAutofilledFields) — otherwise a parent whose browser autofilled the
    // address is told to "add an address" they can plainly see.
    const fam = mergeAutofilledFields(family, addressBoxRef.current, FAMILY_INPUT_NAMES)
    if (fam !== family) setFamily(fam)
    if (!fam.phone.trim()) return toast.error('Enter your phone number')
    if (!fam.address_line1.trim() || !fam.city.trim() || !fam.state.trim() || !fam.postal_code.trim()) {
      return toast.error('Enter your street address, city, state, and ZIP')
    }
    if (!parentPhoto.file && !parentPhoto.avatar_url) {
      return toast.error('Add a photo of yourself — photos are required for every family member')
    }
    for (const [i, k] of kids.entries()) {
      if (!k.first_name.trim() || !k.last_name.trim()) return toast.error(`Child #${i + 1} needs a first and last name`)
      if (!k.date_of_birth) return toast.error(`Child #${i + 1} needs a valid date of birth (MM/DD/YYYY)`)
      if (!k.gender) return toast.error(`Select a gender for ${k.first_name || `child #${i + 1}`}`)
      if (k.email.trim() && !EMAIL_RE.test(k.email)) {
        return toast.error(`The email for ${k.first_name || `child #${i + 1}`} doesn't look right`)
      }
      if (!k.photo_file && !k.avatar_url && !k.staged_url) {
        return toast.error(`Add a photo of ${k.first_name || `child #${i + 1}`} — photos are required for every family member`)
      }
    }
    setSubmitting(true)
    try {
      const { data } = await api.post(`/api/registration/registrations/${reg.registration_id}/family`, {
        access_token: reg.access_token,
        phone: fam.phone.trim(),
        address_line1: fam.address_line1.trim(), address_line2: fam.address_line2.trim(),
        city: fam.city.trim(), state: fam.state.trim(), postal_code: fam.postal_code.trim(),
        kids: kids.map((k) => ({
          first_name: k.first_name.trim(), last_name: k.last_name.trim(),
          preferred_name: k.preferred_name.trim(), gender: k.gender,
          date_of_birth: k.date_of_birth, email: k.email.trim(),
          // Email is optional: a 13+ kid without one is managed under the
          // parent's account instead of getting their own login.
          as_dependent: !k.email.trim(),
          allergies: k.allergies.trim(), medications: k.medications.trim(),
          // Photo uploaded on select, before this kid's account existed.
          photo_url: k.staged_url || undefined,
        })),
      })
      setFeeCents(data.fee_cents || 0)
      setFeeDeferred(!!data.fee_deferred)
      setServerKids((data.kids || []).filter((k) => k.user_id))
      await uploadFamilyPhotos(data.kids)
      setStep('details')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not save your family')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Details / paperwork / fee (unchanged mechanics) ─────────────────────────

  const submitDetails = async () => {
    if (previewMode) return setStep(recordsApply ? 'records'
      : (config.paperwork || []).length ? 'paperwork' : (feeApplies ? 'fee' : 'done'))
    // Orgs can opt out of emergency contacts (config.emergency_contacts === false).
    const asksContacts = config.emergency_contacts !== false
    const validContacts = asksContacts ? contacts.filter((c) => c.name.trim() || c.phone.trim()) : []
    if (asksContacts && !validContacts.length) return toast.error('Add at least one emergency contact')
    for (const [i, c] of validContacts.entries()) {
      if (!c.name.trim() || !c.phone.trim()) return toast.error(`Emergency contact #${i + 1} needs a name and phone`)
    }
    const qErr = firstQuestionError(config.questions, answers, serverKids)
    if (qErr) return toast.error(qErr)
    setSubmitting(true)
    try {
      await api.post(`/api/registration/registrations/${reg.registration_id}/details`, {
        access_token: reg.access_token,
        emergency_contacts: validContacts.map((c) => ({
          name: c.name.trim(), relationship: c.relationship, phone: c.phone.trim(),
          email: c.email.trim(),
        })),
        answers,
      })
      if (recordsApply) setStep('records')
      else if ((config.paperwork || []).length) setStep('paperwork')
      else if ((feeCents || 0) > 0 || config.payment_url) setStep('fee')
      else await finishFee()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not save your details')
    } finally {
      setSubmitting(false)
    }
  }

  const setDestination = (userId, patch) => setDestinations((d) => ({
    ...d, [userId]: { ...(d[userId] || {}), ...patch },
  }))

  const submitRecords = async () => {
    if (previewMode) return setStep((config.paperwork || []).length ? 'paperwork' : (feeApplies ? 'fee' : 'done'))
    const dErr = firstDestinationError(serverKids, destinations)
    if (dErr) return toast.error(dErr)
    setSubmitting(true)
    try {
      await api.post(`/api/registration/registrations/${reg.registration_id}/records`, {
        access_token: reg.access_token,
        destinations: Object.fromEntries(serverKids.map((k) => [k.user_id, destinations[k.user_id] || {}])),
      })
      if ((config.paperwork || []).length) setStep('paperwork')
      else if ((feeCents || 0) > 0 || config.payment_url) setStep('fee')
      else await finishFee()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not save your school information')
    } finally {
      setSubmitting(false)
    }
  }

  const submitPaperwork = async () => {
    if (previewMode) return setStep(feeApplies ? 'fee' : 'done')
    const items = config.paperwork || []
    for (const it of items) {
      if (!agreed[it.key]) return toast.error(`Please confirm you agree to: ${it.label}`)
      if (!(signatures[it.key] || '').trim()) return toast.error(`Please sign: ${it.label}`)
    }
    setSubmitting(true)
    try {
      const { data } = await api.post(`/api/registration/registrations/${reg.registration_id}/paperwork`, {
        access_token: reg.access_token,
        acknowledgements: items.map((it) => ({ key: it.key, signed_name: signatures[it.key].trim() })),
      })
      setFeeCents(data.fee_cents || 0)
      if ((data.fee_cents || 0) > 0 || data.payment_url) setStep('fee')
      else await finishFee()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not save your paperwork')
    } finally {
      setSubmitting(false)
    }
  }

  const finishFee = useCallback(async () => {
    if (previewMode) return previewFinish()
    setSubmitting(true)
    try {
      const { data } = await api.post(`/api/registration/registrations/${reg.registration_id}/fee`, {
        access_token: reg.access_token,
      })
      setScheduling({ url: absUrl(data.scheduling_url), emailed: !!data.scheduling_emailed })
      clearRegistrationGate()  // fee settled — the app no longer redirects here
      sessionStorage.removeItem('icreate_funnel')
      setStep('done')
    } catch (e) {
      // A card payment is actually due (local feeCents went stale — e.g. the fee
      // was recomputed after this tab loaded a $0 "finish" view). Self-correct to
      // the pay-by-card UI instead of dead-ending on the toast.
      const d = e.response?.data
      if (e.response?.status === 402 && Number(d?.fee_cents) > 0) {
        setFeeCents(Number(d.fee_cents))
        setFeeDeferred(false)
        toast.error('A registration fee is due — please complete the payment below.')
      } else {
        toast.error(d?.error || 'Could not finish registration')
      }
    } finally {
      setSubmitting(false)
    }
  }, [reg])

  // The fee step renders pay-vs-finish from the server's authoritative fee, not
  // the feeCents this tab cached earlier in the funnel. On landing here we re-sync
  // so a fee recomputed mid-flight (prepaid credit removed, family back-edited,
  // etc.) can never strand a parent on a stale "$0, finish" view that /fee then
  // refuses (erin4collins, 2026-07-28). finishFee's 402 self-heal is the fallback
  // if this sync can't reach the server.
  useEffect(() => {
    if (step !== 'fee' || !reg || previewMode) return
    let alive = true
    api.post(`/api/registration/registrations/${reg.registration_id}/fee-status`, {
      access_token: reg.access_token,
    })
      .then(({ data }) => {
        if (!alive) return
        setFeeCents(Number(data.fee_cents) || 0)
        setFeeDeferred(!!data.fee_deferred)
      })
      .catch(() => { /* keep cached feeCents; finishFee still self-heals on 402 */ })
    return () => { alive = false }
  }, [step, reg, previewMode])

  // ── Stripe card payment (verified server-side) ─────────────────────────────

  const startCheckout = async () => {
    if (previewMode) {
      // Real Stripe Checkout page (labeled preview, 50-cent line item — $0
      // isn't allowed) so staff sees exactly what families navigate.
      setSubmitting(true)
      try {
        const { data } = await api.post('/api/registration/preview-checkout', {
          code, return_url: `${window.location.origin}${window.location.pathname}?preview=1`,
        })
        window.location.href = data.checkout_url
      } catch (e) {
        toast.error(e.response?.data?.error || 'Could not start the preview payment')
        setSubmitting(false)
      }
      return
    }
    setSubmitting(true)
    try {
      // Persist the funnel identity across the redirect to Stripe and back.
      // Key deliberately keeps its old name through the 2026-08-25 rename (as
      // does the icreate_draft_* one below): these hold live browser state, and
      // renaming them would strand whoever is at the Stripe page right now.
      sessionStorage.setItem('icreate_funnel', JSON.stringify({
        registration_id: reg.registration_id, access_token: reg.access_token, fee_cents: feeCents,
      }))
      const { data } = await api.post(`/api/registration/registrations/${reg.registration_id}/checkout`, {
        access_token: reg.access_token,
        return_url: window.location.origin + window.location.pathname,
        waitlist_ack: waitlistAck,
      })
      window.location.href = data.checkout_url
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not start the payment')
      setSubmitting(false)
    }
  }

  // The passback: ask OUR server to verify the payment with Stripe. Never
  // trusts the browser's word that payment happened.
  const confirmPayment = useCallback(async (rOverride) => {
    if (previewMode) return previewFinish()
    const r = rOverride || reg
    if (!r) return
    setSubmitting(true)
    try {
      const { data } = await api.post(`/api/registration/registrations/${r.registration_id}/confirm-payment`, {
        access_token: r.access_token,
      })
      if (['schedule', 'appointment', 'completed'].includes(data.status)) {
        setScheduling({ url: absUrl(data.scheduling_url), emailed: !!data.scheduling_emailed })
        clearRegistrationGate()
        sessionStorage.removeItem('icreate_funnel')
        setStep('done')
      }
    } catch (e) {
      toast.error(e.response?.data?.error || "We couldn't confirm your payment yet — try again in a moment.")
    } finally {
      setSubmitting(false)
    }
  }, [reg])

  // Returning from Stripe (code-mode reload loses React state): restore the
  // funnel from sessionStorage and verify the payment server-side.
  useEffect(() => {
    if (loading || fatal || !config) return
    const params = new URLSearchParams(window.location.search)
    const payment = params.get('payment')
    if (!payment || reg) return
    const saved = sessionStorage.getItem('icreate_funnel')
    if (!saved) return
    try {
      const s = JSON.parse(saved)
      const restored = { registration_id: s.registration_id, access_token: s.access_token }
      setReg(restored)
      setFeeCents(s.fee_cents || 0)
      setStep('fee')
      window.history.replaceState({}, '', window.location.pathname)
      if (payment === 'return') confirmPayment(restored)
      else toast('Payment canceled — you can try again when you are ready.')
    } catch { /* corrupt storage — parent can resume by logging in */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, fatal, config])

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-optio-purple" />
      </div>
    )
  }
  if (fatal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold text-neutral-900 mb-2">Registration unavailable</h1>
          <p className="text-neutral-500">{fatal}</p>
        </div>
      </div>
    )
  }

  const org = config.organization || {}
  const logo = org.branding_config?.logo_url
  // Optional word under the mark (e.g. the Optio wordmark with "academy").
  // Wordmark lockups are wide, so they render at a moderate height; orgs
  // without a subtitle keep the original large square-logo treatment.
  const logoSubtitle = org.branding_config?.logo_subtitle
  const paymentUrl = absUrl(config.payment_url)

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-6 py-6 flex items-center gap-6">
          {logo ? (
            <div className="flex flex-col items-center shrink-0">
              <img src={logo} alt={org.name}
                className={logoSubtitle ? 'h-24 sm:h-28 w-auto max-w-full object-contain' : 'h-48 sm:h-56 w-auto'} />
              {logoSubtitle && (
                <p className="mt-1 text-base font-semibold uppercase tracking-[0.45em] text-optio-purple">
                  {logoSubtitle}
                </p>
              )}
            </div>
          ) : (
            <span className="text-3xl font-bold text-optio-purple">{org.name}</span>
          )}
          <h1 className="text-lg font-semibold text-neutral-500 tracking-wide">Family Registration</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 flex gap-10">
        <VerticalStepper step={step} steps={steps} labels={stepLabels} onNavigate={setStep} freeNav={previewMode} />
        <div className="flex-1 min-w-0 max-w-2xl">
        <MobileStepper step={step} steps={steps} labels={stepLabels} onNavigate={setStep} freeNav={previewMode} />

        {previewMode && (
          <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            <span className="font-semibold">Preview mode</span> — nothing is saved. Buttons advance
            without creating accounts, sending emails, or charging cards, and you can jump to any
            step from the stepper.
          </div>
        )}

        {step === 'account' && !pendingVerify && (
          <AccountStep
            account={account} setAccount={setAccount}
            accountNotice={accountNotice} setAccountNotice={setAccountNotice}
            code={code} mode={mode} setMode={setMode} org={org}
            previewMode={previewMode} submitting={submitting}
            submitCreate={submitCreate} submitSignin={submitSignin}
          />
        )}

        {step === 'account' && pendingVerify && (
          <VerifyStep
            otp={otp} setOtp={setOtp}
            pendingVerify={pendingVerify} setPendingVerify={setPendingVerify}
            resendCode={resendCode} submitVerify={submitVerify} submitting={submitting}
          />
        )}

        {step === 'family' && (
          <FamilyStep
            addressBoxRef={addressBoxRef} config={config} org={org}
            family={family} setFamily={setFamily}
            kids={kids} setKids={setKids} setKid={setKid}
            parentPhoto={parentPhoto} pickParentPhoto={pickParentPhoto}
            pickKidPhoto={pickKidPhoto} estimateFeeCents={estimateFeeCents}
            submitFamily={submitFamily} submitting={submitting}
          />
        )}

        {step === 'details' && (
          <DetailsStep
            config={config} contacts={contacts} setContacts={setContacts}
            setContact={setContact} answers={answers} setAnswers={setAnswers}
            kids={kids} serverKids={serverKids} previewMode={previewMode}
            submitDetails={submitDetails} submitting={submitting}
          />
        )}

        {step === 'records' && (
          <RecordsStep
            destinations={destinations} setDestination={setDestination}
            kids={kids} serverKids={serverKids} previewMode={previewMode}
            submitRecords={submitRecords} submitting={submitting}
          />
        )}

        {step === 'paperwork' && (
          <PaperworkStep
            config={config} agreed={agreed} setAgreed={setAgreed}
            signatures={signatures} setSignatures={setSignatures}
            submitPaperwork={submitPaperwork} submitting={submitting}
          />
        )}

        {step === 'fee' && (
          <FeeStep
            config={config} kids={kids} feeCents={feeCents}
            feeDeferred={feeDeferred} paymentUrl={paymentUrl}
            waitlistAck={waitlistAck} setWaitlistAck={setWaitlistAck}
            startCheckout={startCheckout} confirmPayment={confirmPayment}
            finishFee={finishFee} submitting={submitting}
          />
        )}

        {step === 'done' && (
          <DoneStep
            code={code} config={config} org={org}
            previewMode={previewMode} scheduling={scheduling}
          />
        )}
        </div>
      </main>
    </div>
  )
}

export default RegisterFunnelPage

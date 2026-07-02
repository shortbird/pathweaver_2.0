import React, { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { EyeIcon, EyeSlashIcon, LockClosedIcon, CheckIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import { clearICreateRegistrationGate } from '../hooks/useICreateRegistrationGate'

// Branded multi-step parent registration for the iCreate microschool.
// Reached only for iCreate parent registration links (AcceptInvitationPage
// redirects here); every other org keeps the standard invitation flow.
//
// Steps (ported from the OSH registration wizard — see
// docs/icreate/osh-registration-inventory.md):
//   account   create an Optio account (name/email/password + emailed 6-digit
//             code) OR sign into an existing one (auto-attached to iCreate)
//   family    phone/address + kids (DOB, allergies, medications)
//   details   emergency contacts + org questions
//   paperwork acknowledge/e-sign each configured item (rich body text)
//   fee       external payment link, record-only
//   done      scheduling handoff

const STEPS = ['account', 'family', 'details', 'paperwork', 'fee', 'done']
const STEP_LABELS = {
  account: 'Account', family: 'Your family', details: 'Contacts & questions',
  paperwork: 'Paperwork', fee: 'Registration fee', done: 'Done',
}

const CONTACT_RELATIONSHIPS = ['Grandparent', 'Guardian', 'Parent', 'Family friend', 'Neighbor', 'Other']

const ageFromDob = (dob) => {
  if (!dob) return null
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  const t = new Date()
  let a = t.getFullYear() - d.getFullYear()
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a -= 1
  return a
}

const money = (cents) => `$${((cents || 0) / 100).toFixed(2)}`
// Config URLs saved without a scheme would resolve relative to the Optio origin.
const absUrl = (v) => {
  const s = (v || '').trim()
  if (!s) return ''
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}
const field = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const emptyKid = () => ({
  first_name: '', last_name: '', preferred_name: '', gender: '', date_of_birth: '',
  email: '', as_dependent: false, allergies: '', medications: '',
})
const emptyContact = () => ({ name: '', relationship: '', phone: '', email: '' })

// Vertical stepper (desktop, left rail). Steps are sequential and all required:
// completed steps get a check and can be clicked to go back and edit, the
// current step is highlighted, and future steps are greyed out with a lock —
// they unlock only by finishing the one before them.
const BACK_EDITABLE = new Set(['family', 'details', 'paperwork'])

const VerticalStepper = ({ step, onNavigate }) => {
  const idx = STEPS.indexOf(step)
  return (
    <aside className="hidden md:block w-56 shrink-0">
      <nav className="sticky top-8">
        <ol>
          {STEPS.map((s, i) => {
            const done = i < idx
            const current = i === idx
            const clickable = done && BACK_EDITABLE.has(s) && step !== 'done'
            return (
              <li key={s} className="relative pb-7 last:pb-0">
                {i < STEPS.length - 1 && (
                  <span className={`absolute left-[15px] top-10 bottom-1 w-px ${done ? 'bg-optio-purple' : 'bg-neutral-200'}`} />
                )}
                <button
                  type="button"
                  onClick={() => clickable && onNavigate(s)}
                  disabled={!clickable}
                  className={`flex items-center gap-3 text-left w-full rounded-lg -m-1 p-1 ${clickable ? 'hover:bg-optio-purple/5 cursor-pointer' : 'cursor-default'}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                    done ? 'bg-optio-purple text-white'
                      : current ? 'bg-white text-optio-purple ring-2 ring-optio-purple'
                        : 'bg-neutral-100 text-neutral-400'
                  }`}>
                    {done ? <CheckIcon className="w-4 h-4" />
                      : current ? i + 1
                        : <LockClosedIcon className="w-3.5 h-3.5" />}
                  </div>
                  <div>
                    <div className={`text-sm font-medium ${current ? 'text-optio-purple' : done ? 'text-neutral-700' : 'text-neutral-400'}`}>
                      {STEP_LABELS[s]}
                    </div>
                    <div className="text-[11px] text-neutral-400">
                      {done ? (clickable ? 'Completed — click to edit' : 'Completed') : current ? 'In progress' : 'Locked'}
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ol>
        <p className="mt-6 text-xs text-neutral-400 leading-relaxed">
          Steps must be completed in order. All steps are required to finish registration.
        </p>
      </nav>
    </aside>
  )
}

// Compact horizontal stepper for small screens. Completed steps are tappable
// to go back and edit.
const MobileStepper = ({ step, onNavigate }) => {
  const idx = STEPS.indexOf(step)
  return (
    <div className="md:hidden mb-6">
      <div className="flex items-center gap-1.5 justify-center">
        {STEPS.map((s, i) => {
          const clickable = i < idx && BACK_EDITABLE.has(s) && step !== 'done'
          return (
            <React.Fragment key={s}>
              <button type="button" disabled={!clickable} onClick={() => clickable && onNavigate(s)}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                  i < idx ? 'bg-optio-purple text-white'
                    : i === idx ? 'bg-white text-optio-purple ring-2 ring-optio-purple'
                      : 'bg-neutral-100 text-neutral-400'
                } ${clickable ? '' : 'cursor-default'}`}>
                {i < idx ? <CheckIcon className="w-3.5 h-3.5" /> : i + 1}
              </button>
              {i < STEPS.length - 1 && <div className={`h-px w-3 ${i < idx ? 'bg-optio-purple' : 'bg-neutral-200'}`} />}
            </React.Fragment>
          )
        })}
      </div>
      <p className="text-center text-xs text-neutral-400 mt-2">
        Step {idx + 1} of {STEPS.length}: {STEP_LABELS[step]} — all steps are required, in order. Tap a completed step to edit it.
      </p>
    </div>
  )
}

const Section = ({ title, subtitle, children }) => (
  <section className="bg-white rounded-xl border border-gray-200 p-6">
    <h2 className="text-lg font-semibold text-neutral-900 mb-1">{title}</h2>
    {subtitle && <p className="text-sm text-neutral-500 mb-4">{subtitle}</p>}
    {!subtitle && <div className="mb-3" />}
    {children}
  </section>
)

const PasswordInput = ({ value, onChange, onKeyDown }) => {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} className={`${field} pr-10`}
        value={value} onChange={onChange} onKeyDown={onKeyDown} />
      <button type="button" onClick={() => setShow(!show)} tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 px-3 flex items-center text-neutral-400 hover:text-neutral-600">
        {show ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
      </button>
    </div>
  )
}

const PrimaryButton = ({ onClick, disabled, children }) => (
  <button onClick={onClick} disabled={disabled}
    className="w-full py-3 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold hover:opacity-90 disabled:opacity-50">
    {children}
  </button>
)

const ICreateRegisterPage = () => {
  const { code } = useParams()
  const [loading, setLoading] = useState(true)
  const [fatal, setFatal] = useState(null)
  const [config, setConfig] = useState(null)
  const [step, setStep] = useState('account')
  const [submitting, setSubmitting] = useState(false)

  // account step
  const [mode, setMode] = useState('create')            // create | signin
  const [account, setAccount] = useState({ first_name: '', last_name: '', email: '', password: '', confirm: '' })
  const [pendingVerify, setPendingVerify] = useState(null) // { registration_id, email }
  const [otp, setOtp] = useState('')

  // family step
  const [family, setFamily] = useState({ phone: '', address_line1: '', address_line2: '', city: '', state: '', postal_code: '' })
  const [kids, setKids] = useState([emptyKid()])

  // details step
  const [contacts, setContacts] = useState([emptyContact()])
  const [answers, setAnswers] = useState({})

  // funnel state (issued only after email verification / sign-in)
  const [reg, setReg] = useState(null) // { registration_id, access_token }
  const [feeCents, setFeeCents] = useState(0)
  const [signatures, setSignatures] = useState({})
  const [agreed, setAgreed] = useState({})
  const [scheduling, setScheduling] = useState({ url: '', emailed: false })

  useEffect(() => {
    let alive = true
    if (code) {
      // Fresh visit from the registration link.
      api.get(`/api/icreate/config/${code}`)
        .then((r) => { if (alive) setConfig(r.data) })
        .catch((e) => { if (alive) setFatal(e.response?.data?.error || 'This registration link is not valid.') })
        .finally(() => { if (alive) setLoading(false) })
    } else {
      // /register/icreate/resume — logged-in continuation of an unfinished
      // registration (PrivateRoute forces iCreate parents here).
      api.get('/api/icreate/my-registration')
        .then((r) => {
          if (!alive) return
          const regData = r.data?.registration
          if (!regData) { window.location.replace('/'); return }
          setConfig(r.data)
          setReg({ registration_id: regData.registration_id, access_token: regData.access_token })
          setFeeCents(regData.fee_cents || 0)
          // Prefill everything already submitted so completed steps are editable.
          if (regData.household) {
            const h = regData.household
            setFamily({
              phone: h.phone || '', address_line1: h.address_line1 || '', address_line2: h.address_line2 || '',
              city: h.city || '', state: h.state || '', postal_code: h.postal_code || '',
            })
          }
          if ((regData.kids || []).length) {
            setKids(regData.kids.map((k) => ({
              first_name: k.first_name || (k.name || '').split(' ')[0] || '',
              last_name: k.last_name || (k.name || '').split(' ').slice(1).join(' ') || '',
              preferred_name: k.preferred_name || '', gender: k.gender || '',
              date_of_birth: k.dob || '', email: k.email || '',
              as_dependent: k.type === 'dependent' && k.dob && ageFromDob(k.dob) >= 13,
              allergies: k.allergies || '', medications: k.medications || '',
            })))
          }
          if ((regData.emergency_contacts || []).length) {
            setContacts(regData.emergency_contacts.map((c) => ({
              name: c.name || '', relationship: c.relationship || '', phone: c.phone || '', email: c.email || '',
            })))
          }
          if (Object.keys(regData.answers || {}).length) setAnswers(regData.answers)
          if ((regData.paperwork || []).length) {
            setSignatures(Object.fromEntries(regData.paperwork.map((p) => [p.key, p.signed_name || ''])))
            setAgreed(Object.fromEntries(regData.paperwork.map((p) => [p.key, true])))
          }
          setStep(regData.status)
        })
        .catch(() => { if (alive) setFatal('Could not load your registration. Please log in and try again.') })
        .finally(() => { if (alive) setLoading(false) })
    }
    return () => { alive = false }
  }, [code])

  // Always start each step at the top of the page.
  useEffect(() => { window.scrollTo(0, 0) }, [step])

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
  const setContact = (i, patch) => setContacts((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  // ── Account step ────────────────────────────────────────────────────────────

  const submitCreate = async () => {
    if (!account.first_name.trim() || !account.last_name.trim()) return toast.error('Enter your first and last name')
    if (!EMAIL_RE.test(account.email)) return toast.error('Enter a valid email')
    if (account.password.length < 8) return toast.error('Password must be at least 8 characters')
    if (account.password !== account.confirm) return toast.error('Passwords do not match')
    setSubmitting(true)
    try {
      const { data } = await api.post('/api/icreate/start', {
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

  const submitVerify = async () => {
    if (!/^\d{6}$/.test(otp.trim())) return toast.error('Enter the 6-digit code from your email')
    setSubmitting(true)
    try {
      const { data } = await api.post('/api/icreate/verify', {
        registration_id: pendingVerify.registration_id, code: otp.trim(),
      })
      setReg({ registration_id: pendingVerify.registration_id, access_token: data.access_token })
      setStep('family')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not verify the code')
    } finally {
      setSubmitting(false)
    }
  }

  const resendCode = async () => {
    try {
      const { data } = await api.post('/api/icreate/resend-code', { registration_id: pendingVerify.registration_id })
      if (data.sent === false) toast.error('We could not send the code — please try again in a moment.')
      else toast.success('We emailed you a new code')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not resend the code')
    }
  }

  const submitSignin = async () => {
    if (!EMAIL_RE.test(account.email)) return toast.error('Enter a valid email')
    if (!account.password) return toast.error('Enter your password')
    setSubmitting(true)
    try {
      const { data } = await api.post('/api/icreate/login', {
        code, email: account.email.trim(), password: account.password,
      })
      setReg({ registration_id: data.registration_id, access_token: data.access_token })
      toast.success(`Welcome back${data.first_name ? `, ${data.first_name}` : ''}!`)
      setStep('family')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not sign in')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Family step ─────────────────────────────────────────────────────────────

  const submitFamily = async () => {
    if (!family.phone.trim()) return toast.error('Enter your phone number')
    if (!family.address_line1.trim() || !family.city.trim() || !family.state.trim() || !family.postal_code.trim()) {
      return toast.error('Enter your street address, city, state, and ZIP')
    }
    for (const [i, k] of kids.entries()) {
      if (!k.first_name.trim() || !k.last_name.trim()) return toast.error(`Child #${i + 1} needs a first and last name`)
      if (!k.date_of_birth) return toast.error(`Child #${i + 1} needs a date of birth`)
      if (!k.gender) return toast.error(`Select a gender for ${k.first_name || `child #${i + 1}`}`)
      const age = ageFromDob(k.date_of_birth)
      if (age >= 13 && !k.as_dependent && !EMAIL_RE.test(k.email)) {
        return toast.error(`${k.first_name} is 13+, so add their email or mark them as managed by you`)
      }
    }
    setSubmitting(true)
    try {
      const { data } = await api.post(`/api/icreate/registrations/${reg.registration_id}/family`, {
        access_token: reg.access_token,
        phone: family.phone.trim(),
        address_line1: family.address_line1.trim(), address_line2: family.address_line2.trim(),
        city: family.city.trim(), state: family.state.trim(), postal_code: family.postal_code.trim(),
        kids: kids.map((k) => ({
          first_name: k.first_name.trim(), last_name: k.last_name.trim(),
          preferred_name: k.preferred_name.trim(), gender: k.gender,
          date_of_birth: k.date_of_birth, email: k.email.trim(), as_dependent: k.as_dependent,
          allergies: k.allergies.trim(), medications: k.medications.trim(),
        })),
      })
      setFeeCents(data.fee_cents || 0)
      setStep('details')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not save your family')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Details / paperwork / fee (unchanged mechanics) ─────────────────────────

  const submitDetails = async () => {
    const validContacts = contacts.filter((c) => c.name.trim() || c.phone.trim())
    if (!validContacts.length) return toast.error('Add at least one emergency contact')
    for (const [i, c] of validContacts.entries()) {
      if (!c.name.trim() || !c.phone.trim()) return toast.error(`Emergency contact #${i + 1} needs a name and phone`)
    }
    for (const q of config.questions || []) {
      const v = answers[q.key]
      if (q.required && (q.type === 'multi' ? !(v || []).length : !(v || '').trim())) {
        return toast.error(`Please answer: ${q.label}`)
      }
    }
    setSubmitting(true)
    try {
      await api.post(`/api/icreate/registrations/${reg.registration_id}/details`, {
        access_token: reg.access_token,
        emergency_contacts: validContacts.map((c) => ({
          name: c.name.trim(), relationship: c.relationship, phone: c.phone.trim(),
          email: c.email.trim(),
        })),
        answers,
      })
      if ((config.paperwork || []).length) setStep('paperwork')
      else if ((feeCents || 0) > 0 || config.payment_url) setStep('fee')
      else await finishFee()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not save your details')
    } finally {
      setSubmitting(false)
    }
  }

  const submitPaperwork = async () => {
    const items = config.paperwork || []
    for (const it of items) {
      if (!agreed[it.key]) return toast.error(`Please confirm you agree to: ${it.label}`)
      if (!(signatures[it.key] || '').trim()) return toast.error(`Please sign: ${it.label}`)
    }
    setSubmitting(true)
    try {
      const { data } = await api.post(`/api/icreate/registrations/${reg.registration_id}/paperwork`, {
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
    setSubmitting(true)
    try {
      const { data } = await api.post(`/api/icreate/registrations/${reg.registration_id}/fee`, {
        access_token: reg.access_token,
      })
      setScheduling({ url: absUrl(data.scheduling_url), emailed: !!data.scheduling_emailed })
      clearICreateRegistrationGate()  // funnel complete — stop redirecting this session
      sessionStorage.removeItem('icreate_funnel')
      setStep('done')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not finish registration')
    } finally {
      setSubmitting(false)
    }
  }, [reg])

  // ── Stripe card payment (verified server-side) ─────────────────────────────

  const startCheckout = async () => {
    setSubmitting(true)
    try {
      // Persist the funnel identity across the redirect to Stripe and back.
      sessionStorage.setItem('icreate_funnel', JSON.stringify({
        registration_id: reg.registration_id, access_token: reg.access_token, fee_cents: feeCents,
      }))
      const { data } = await api.post(`/api/icreate/registrations/${reg.registration_id}/checkout`, {
        access_token: reg.access_token,
        return_url: window.location.origin + window.location.pathname,
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
    const r = rOverride || reg
    if (!r) return
    setSubmitting(true)
    try {
      const { data } = await api.post(`/api/icreate/registrations/${r.registration_id}/confirm-payment`, {
        access_token: r.access_token,
      })
      if (data.status === 'completed') {
        setScheduling({ url: absUrl(data.scheduling_url), emailed: !!data.scheduling_emailed })
        clearICreateRegistrationGate()
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
  const paymentUrl = absUrl(config.payment_url)

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-6 py-6 flex items-center gap-6">
          {logo ? <img src={logo} alt={org.name} className="h-48 sm:h-56 w-auto" /> : (
            <span className="text-3xl font-bold text-optio-purple">{org.name}</span>
          )}
          <h1 className="text-lg font-semibold text-neutral-500 tracking-wide">Family Registration</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 flex gap-10">
        <VerticalStepper step={step} onNavigate={setStep} />
        <div className="flex-1 min-w-0 max-w-2xl">
        <MobileStepper step={step} onNavigate={setStep} />

        {step === 'account' && !pendingVerify && (
          <div className="space-y-6">
            <Section title="Your account" subtitle="Registration starts with your parent account.">
              <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-neutral-50 mb-5">
                <button onClick={() => setMode('create')}
                  className={`text-sm px-4 py-1.5 rounded-md font-medium transition-colors ${mode === 'create' ? 'bg-optio-purple text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}>
                  Create account
                </button>
                <button onClick={() => setMode('signin')}
                  className={`text-sm px-4 py-1.5 rounded-md font-medium transition-colors ${mode === 'signin' ? 'bg-optio-purple text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}>
                  I have an Optio account
                </button>
              </div>

              {mode === 'create' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-neutral-500 mb-1">First name</label>
                    <input className={field} value={account.first_name} onChange={(e) => setAccount({ ...account, first_name: e.target.value })} /></div>
                  <div><label className="block text-xs font-medium text-neutral-500 mb-1">Last name</label>
                    <input className={field} value={account.last_name} onChange={(e) => setAccount({ ...account, last_name: e.target.value })} /></div>
                  <div className="sm:col-span-2"><label className="block text-xs font-medium text-neutral-500 mb-1">Email</label>
                    <input type="email" className={field} value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} /></div>
                  <div><label className="block text-xs font-medium text-neutral-500 mb-1">Password</label>
                    <PasswordInput value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} /></div>
                  <div><label className="block text-xs font-medium text-neutral-500 mb-1">Confirm password</label>
                    <PasswordInput value={account.confirm} onChange={(e) => setAccount({ ...account, confirm: e.target.value })} /></div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-neutral-500 -mt-1">
                    Sign in with your existing Optio account — it will be connected to {org.name} automatically.
                  </p>
                  <div><label className="block text-xs font-medium text-neutral-500 mb-1">Email</label>
                    <input type="email" className={field} value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} /></div>
                  <div><label className="block text-xs font-medium text-neutral-500 mb-1">Password</label>
                    <PasswordInput value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && submitSignin()} /></div>
                </div>
              )}
            </Section>

            <PrimaryButton onClick={mode === 'create' ? submitCreate : submitSignin} disabled={submitting}>
              {submitting ? 'One moment…' : mode === 'create' ? 'Create account' : 'Sign in & continue'}
            </PrimaryButton>
          </div>
        )}

        {step === 'account' && pendingVerify && (
          <div className="space-y-6">
            <Section title="Check your email"
              subtitle={`We sent a 6-digit code to ${pendingVerify.email}. Enter it below to confirm your email.`}>
              <input
                inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                className={`${field} text-center text-2xl tracking-[0.5em] font-semibold`}
                placeholder="••••••"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => e.key === 'Enter' && submitVerify()}
                autoFocus
              />
              <div className="flex items-center justify-between mt-3">
                <button onClick={resendCode} className="text-sm text-optio-purple font-medium hover:underline">Resend code</button>
                <button onClick={() => { setPendingVerify(null); setOtp('') }} className="text-sm text-neutral-500 hover:underline">Use a different email</button>
              </div>
            </Section>
            <PrimaryButton onClick={submitVerify} disabled={submitting || otp.length !== 6}>
              {submitting ? 'Verifying…' : 'Confirm email'}
            </PrimaryButton>
          </div>
        )}

        {step === 'family' && (
          <div className="space-y-6">
            <Section title="Contact & address">
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
                <div className="sm:col-span-2"><label className="block text-xs font-medium text-neutral-500 mb-1">Phone</label>
                  <input type="tel" className={field} placeholder="XXX-XXX-XXXX" value={family.phone} onChange={(e) => setFamily({ ...family, phone: e.target.value })} /></div>
                <div className="sm:col-span-4"><label className="block text-xs font-medium text-neutral-500 mb-1">Street address</label>
                  <input className={field} value={family.address_line1} onChange={(e) => setFamily({ ...family, address_line1: e.target.value })} /></div>
                <div className="sm:col-span-2"><label className="block text-xs font-medium text-neutral-500 mb-1">Apt / unit (optional)</label>
                  <input className={field} value={family.address_line2} onChange={(e) => setFamily({ ...family, address_line2: e.target.value })} /></div>
                <div className="sm:col-span-2"><label className="block text-xs font-medium text-neutral-500 mb-1">City</label>
                  <input className={field} value={family.city} onChange={(e) => setFamily({ ...family, city: e.target.value })} /></div>
                <div className="sm:col-span-1"><label className="block text-xs font-medium text-neutral-500 mb-1">State</label>
                  <input className={field} placeholder="UT" value={family.state} onChange={(e) => setFamily({ ...family, state: e.target.value })} /></div>
                <div className="sm:col-span-1"><label className="block text-xs font-medium text-neutral-500 mb-1">ZIP</label>
                  <input className={field} value={family.postal_code} onChange={(e) => setFamily({ ...family, postal_code: e.target.value })} /></div>
              </div>
            </Section>

            <Section title="Children">
              <div className="flex justify-end -mt-8 mb-3">
                <button onClick={() => setKids((ks) => [...ks, emptyKid()])} className="text-sm font-medium text-optio-purple hover:underline">+ Add another child</button>
              </div>
              <div className="space-y-5">
                {kids.map((k, i) => {
                  const age = ageFromDob(k.date_of_birth)
                  const teen = age != null && age >= 13
                  return (
                    <div key={i} className="rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-neutral-700">Child {i + 1}{age != null ? ` · age ${age}` : ''}</span>
                        {kids.length > 1 && <button onClick={() => setKids((ks) => ks.filter((_, j) => j !== i))} className="text-xs text-red-500 hover:underline">Remove</button>}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input className={field} placeholder="First name" value={k.first_name} onChange={(e) => setKid(i, { first_name: e.target.value })} />
                        <input className={field} placeholder="Last name" value={k.last_name} onChange={(e) => setKid(i, { last_name: e.target.value })} />
                        <input className={field} placeholder="Preferred name (if different)" value={k.preferred_name} onChange={(e) => setKid(i, { preferred_name: e.target.value })} />
                        <select className={field} value={k.gender} onChange={(e) => setKid(i, { gender: e.target.value })}>
                          <option value="">Gender</option>
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                        </select>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-neutral-500 mb-1">Date of birth</label>
                          <input type="date" className={field} value={k.date_of_birth} onChange={(e) => setKid(i, { date_of_birth: e.target.value })} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-neutral-500 mb-1">Allergies <span className="text-neutral-400"></span></label>
                          <textarea rows={2} className={field} value={k.allergies} onChange={(e) => setKid(i, { allergies: e.target.value })} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-neutral-500 mb-1">Required medications <span className="text-neutral-400"></span></label>
                          <textarea rows={2} className={field} value={k.medications} onChange={(e) => setKid(i, { medications: e.target.value })} />
                        </div>
                      </div>
                      {teen && (
                        <div className="mt-3">
                          {!k.as_dependent && (
                            <input type="email" className={field} placeholder="Child's email (they'll get their own login)"
                              value={k.email} onChange={(e) => setKid(i, { email: e.target.value })} />
                          )}
                          <label className="mt-2 flex items-center gap-2 text-sm text-neutral-600">
                            <input type="checkbox" checked={k.as_dependent}
                              onChange={(e) => setKid(i, { as_dependent: e.target.checked, email: '' })}
                              className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                            No email — I'll manage this child's account
                          </label>
                        </div>
                      )}
                      {age != null && age < 13 && (
                        <p className="mt-2 text-xs text-neutral-400">Under 13 — managed under your account (no separate login).</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </Section>

            {estimateFeeCents() > 0 && (
              <p className="text-center text-sm text-neutral-500">
                Estimated registration fee: <span className="font-semibold text-neutral-800">{money(estimateFeeCents())}</span>
              </p>
            )}

            <PrimaryButton onClick={submitFamily} disabled={submitting}>
              {submitting ? 'Saving your family…' : 'Continue'}
            </PrimaryButton>
          </div>
        )}

        {step === 'details' && (
          <div className="space-y-6">
            <Section title="Emergency contacts"
              subtitle="Add at least one emergency contact for your family.">
              <div className="space-y-4">
                {contacts.map((c, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-neutral-700">Contact {i + 1}</span>
                      {contacts.length > 1 && <button onClick={() => setContacts((cs) => cs.filter((_, j) => j !== i))} className="text-xs text-red-500 hover:underline">Remove</button>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input className={field} placeholder="Full name" value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} />
                      <select className={field} value={c.relationship} onChange={(e) => setContact(i, { relationship: e.target.value })}>
                        <option value="">Relationship</option>
                        {CONTACT_RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <input type="tel" className={field} placeholder="Phone" value={c.phone} onChange={(e) => setContact(i, { phone: e.target.value })} />
                      <input type="email" className={field} placeholder="Email (optional)" value={c.email} onChange={(e) => setContact(i, { email: e.target.value })} />
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setContacts((cs) => [...cs, emptyContact()])} className="mt-3 text-sm font-medium text-optio-purple hover:underline">+ Add another contact</button>
            </Section>

            {(config.questions || []).length > 0 && (
              <Section title="A few questions">
                <div className="space-y-5">
                  {(config.questions || []).map((q) => (
                    <div key={q.key}>
                      <label className="block text-sm font-medium text-neutral-800 mb-1">{q.label}{q.required && <span className="text-red-400"> *</span>}</label>
                      {q.help && <p className="text-xs text-neutral-500 mb-2 whitespace-pre-wrap">{q.help}</p>}
                      {q.type === 'multi' ? (
                        <div className="space-y-1.5">
                          {(q.options || []).map((opt) => {
                            const cur = answers[q.key] || []
                            return (
                              <label key={opt} className="flex items-center gap-2 text-sm text-neutral-700">
                                <input type="checkbox" checked={cur.includes(opt)}
                                  onChange={(e) => setAnswers((a) => ({
                                    ...a,
                                    [q.key]: e.target.checked ? [...cur, opt] : cur.filter((x) => x !== opt),
                                  }))}
                                  className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                                {opt}
                              </label>
                            )
                          })}
                        </div>
                      ) : (
                        <select className={field} value={answers[q.key] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}>
                          <option value="">-- Please select --</option>
                          {(q.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <PrimaryButton onClick={submitDetails} disabled={submitting}>
              {submitting ? 'Saving…' : 'Continue'}
            </PrimaryButton>
          </div>
        )}

        {step === 'paperwork' && (
          <div className="space-y-6">
            <Section title="Paperwork" subtitle="Review each item, confirm you agree, and type your full name to sign.">
              <div className="space-y-5">
                {(config.paperwork || []).map((it) => (
                  <div key={it.key} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="font-semibold text-neutral-900">{it.label}</span>
                      {it.doc_url && <a href={absUrl(it.doc_url)} target="_blank" rel="noreferrer" className="text-sm text-optio-purple hover:underline whitespace-nowrap">Open in new tab</a>}
                    </div>
                    {/* Uploaded PDFs render inline so parents can read before signing;
                        other file types fall back to the open-in-new-tab link above. */}
                    {it.doc_url && /\.pdf($|\?)/i.test(it.doc_url) && (
                      <iframe src={absUrl(it.doc_url)} title={it.label}
                        className="w-full h-80 rounded-lg border border-gray-200 mb-3 bg-white" />
                    )}
                    {it.body && (
                      <div className="text-sm text-neutral-600 whitespace-pre-wrap bg-neutral-50 rounded-lg p-3 mb-3 max-h-56 overflow-y-auto">
                        {it.body}
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-sm text-neutral-700 mb-2">
                      <input type="checkbox" checked={!!agreed[it.key]}
                        onChange={(e) => setAgreed((a) => ({ ...a, [it.key]: e.target.checked }))}
                        className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                      I confirm I have read and agree to the above terms
                    </label>
                    <input className={field} placeholder="Type your full name to sign"
                      value={signatures[it.key] || ''} onChange={(e) => setSignatures((s) => ({ ...s, [it.key]: e.target.value }))} />
                    <p className="text-xs text-neutral-400 mt-1.5">
                      By typing your name above, you agree this electronic signature has the same legal force and effect as a manual written signature.
                    </p>
                  </div>
                ))}
              </div>
            </Section>
            <PrimaryButton onClick={submitPaperwork} disabled={submitting}>
              {submitting ? 'Saving…' : 'Continue'}
            </PrimaryButton>
          </div>
        )}

        {step === 'fee' && (
          <div className="space-y-6">
            <Section title="Registration fee">
              <div className="text-center">
                {feeCents > 0
                  ? <p className="text-3xl font-bold text-optio-purple my-3">{money(feeCents)}</p>
                  : <p className="text-sm text-neutral-500 my-3">Complete your registration below.</p>}
                {config.stripe_enabled && feeCents > 0 ? (
                  <p className="text-xs text-neutral-400">
                    You'll be taken to a secure Stripe checkout. Your registration completes automatically once the payment is verified.
                  </p>
                ) : paymentUrl ? (
                  <>
                    <a href={paymentUrl} target="_blank" rel="noreferrer"
                      className="inline-block px-5 py-2.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold hover:opacity-90">
                      Pay {feeCents > 0 ? money(feeCents) : 'registration fee'}
                    </a>
                    <p className="text-xs text-neutral-400 mt-3">Payment opens in a new tab. Return here and continue once you've paid.</p>
                  </>
                ) : (
                  <p className="text-sm text-neutral-400">Your school will collect the fee separately.</p>
                )}
              </div>
            </Section>
            {config.stripe_enabled && feeCents > 0 ? (
              <>
                <PrimaryButton onClick={startCheckout} disabled={submitting}>
                  {submitting ? 'One moment…' : `Pay ${money(feeCents)} securely`}
                </PrimaryButton>
                <button onClick={() => confirmPayment()} disabled={submitting}
                  className="w-full text-sm text-optio-purple font-medium hover:underline disabled:opacity-50">
                  Already paid? Verify my payment
                </button>
              </>
            ) : (
              <PrimaryButton onClick={() => finishFee()} disabled={submitting}>
                {submitting ? 'Finishing…' : paymentUrl ? "I've paid — finish registration" : 'Finish registration'}
              </PrimaryButton>
            )}
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-6 text-center">
            <div className="bg-white rounded-xl border border-gray-200 p-8">
              <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
              <h2 className="text-xl font-bold text-neutral-900 mb-2">You're registered!</h2>
              <p className="text-neutral-500 mb-6">
                Your account is ready — you can sign in at any time with your email and password.
                {scheduling.emailed && ' We also emailed you a link to book your custom learning plan appointment.'}
              </p>
              {scheduling.url && (
                <a href={scheduling.url} target="_blank" rel="noreferrer"
                  className="inline-block px-5 py-2.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold hover:opacity-90">
                  Book your appointment
                </a>
              )}
            </div>
          </div>
        )}
        </div>
      </main>
    </div>
  )
}

export default ICreateRegisterPage

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { EyeIcon, EyeSlashIcon, LockClosedIcon, CheckIcon, PhotoIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import { clearICreateRegistrationGate } from '../hooks/useICreateRegistrationGate'

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

const STEPS = ['account', 'family', 'details', 'paperwork', 'fee', 'done']
const STEP_LABELS = {
  account: 'Account', family: 'Your family', details: 'Contacts & questions',
  paperwork: 'Paperwork', fee: 'Registration fee', done: 'Next steps',
}

// Steps after the fee is settled: the family data is final, so completed steps
// are no longer back-editable from here.
const POST_FEE_STEPS = new Set(['done'])

const CONTACT_RELATIONSHIPS = ['Grandparent', 'Guardian', 'Parent', 'Family friend', 'Neighbor', 'Other']

const ageFromDob = (dob, onDate = null) => {
  if (!dob) return null
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  const t = onDate ? new Date(`${String(onDate).slice(0, 10)}T00:00:00`) : new Date()
  if (Number.isNaN(t.getTime())) return null
  let a = t.getFullYear() - d.getFullYear()
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a -= 1
  return a
}

// The enrollment-waitlist band this child falls in, or null. Ages are judged as
// of the first day of school (matching the backend gate), so the notice a
// parent sees is exactly what will happen when they submit.
const enrollmentGateFor = (config, dobIso) => {
  const gates = config?.enrollment_age_gates || []
  if (!gates.length || !dobIso) return null
  const age = ageFromDob(dobIso, config?.first_day_of_school)
  if (age == null) return null
  return gates.find((g) =>
    (g.min_age == null || age >= g.min_age) && (g.max_age == null || age <= g.max_age)) || null
}

const gateBandText = (g) => (g.min_age != null && g.max_age != null
  ? `ages ${g.min_age}–${g.max_age}`
  : g.min_age != null ? `ages ${g.min_age} and up` : `ages ${g.max_age} and under`)

const money = (cents) => `$${((cents || 0) / 100).toFixed(2)}`
// Config URLs saved without a scheme would resolve relative to the Optio origin.
const absUrl = (v) => {
  const s = (v || '').trim()
  if (!s) return ''
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}
const field = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// ── Date of birth as validated text (MM/DD/YYYY) ─────────────────────────────
// A plain masked text input with real calendar validation: impossible dates
// like 2/31/2008 are rejected with an inline error instead of being accepted
// (or silently mangled) the way loosely-handled date boxes do.

// Keep only digits and group them as MM/DD/YYYY while the parent types.
const formatMdy = (raw) => {
  const d = String(raw || '').replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

// "MM/DD/YYYY" -> ISO date, or null when incomplete, impossible, or in the future.
const mdyToIso = (text) => {
  const m = String(text || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const [, mm, dd, yyyy] = m
  const mo = Number(mm); const da = Number(dd); const yr = Number(yyyy)
  const d = new Date(yr, mo - 1, da)
  if (d.getFullYear() !== yr || d.getMonth() !== mo - 1 || d.getDate() !== da) return null
  if (yr < 1900 || d > new Date()) return null
  return `${yyyy}-${mm}-${dd}`
}

const isoToMdy = (iso) => {
  const [y, mo, d] = String(iso || '').slice(0, 10).split('-')
  return (y && mo && d) ? `${mo}/${d}/${y}` : ''
}

// Stable identity for kid rows so async photo uploads land on the right kid
// even if rows are added/removed while an upload is in flight.
const kidKey = () => Math.random().toString(36).slice(2)

const emptyKid = () => ({
  _key: kidKey(),
  user_id: '',                       // set on resume back-edit (account exists)
  first_name: '', last_name: '', preferred_name: '', gender: '',
  date_of_birth: '', dob_text: '',
  email: '', allergies: '', medications: '',
  photo_file: null, photo_preview: '', avatar_url: '',
  staged_url: '',                    // uploaded-on-select photo, attached at family submit
  photo_uploading: false, photo_error: '',
})
const emptyContact = () => ({ name: '', relationship: '', phone: '', email: '' })

// Browser/password-manager autofill can paint values into inputs WITHOUT firing
// the events React listens to, so the field looks filled while state stays ''.
// The submit then fails validation ("add an address") even though the parent
// sees their address on screen. Before validating, trust the DOM for any
// state-empty field: read input[name=...] values out of the section and merge.
export const mergeAutofilledFields = (state, container, nameByKey) => {
  if (!container) return state
  const merged = { ...state }
  for (const [key, inputName] of Object.entries(nameByKey)) {
    if (String(merged[key] || '').trim()) continue
    const el = container.querySelector(`input[name="${inputName}"]`)
    if (el && el.value.trim()) merged[key] = el.value
  }
  return merged
}

const FAMILY_INPUT_NAMES = {
  phone: 'phone', address_line1: 'address-line1', address_line2: 'address-line2',
  city: 'city', state: 'state', postal_code: 'zip',
}

// First validation error for the org's registration questions, or null.
// Family-level questions hold a single value; per_student questions hold
// {kidUserId: value} and every kid on the registration must answer required
// ones (kidsList = the kids as the server knows them, with user_id).
export const firstQuestionError = (questions, answers, kidsList) => {
  const empty = (q, v) => (q.type === 'multi' ? !(v || []).length : !(v || '').trim())
  for (const q of questions || []) {
    if (!q.required) continue
    if (q.per_student) {
      for (const k of kidsList || []) {
        if (empty(q, (answers[q.key] || {})[k.user_id])) {
          return `Please answer for ${k.first_name || k.name || 'each child'}: ${q.label}`
        }
      }
    } else if (empty(q, answers[q.key])) {
      return `Please answer: ${q.label}`
    }
  }
  return null
}

// One org-question input (select / free text / multi checkboxes). Shared by
// the family-level questions and the per-student groups on the details step.
const QuestionField = ({ q, value, onChange }) => (
  <div>
    <label className="block text-sm font-medium text-neutral-800 mb-1">{q.label}{q.required && <span className="text-red-400"> *</span>}</label>
    {q.help && <p className="text-xs text-neutral-500 mb-2 whitespace-pre-wrap">{q.help}</p>}
    {q.type === 'multi' ? (
      <div className="space-y-1.5">
        {(q.options || []).map((opt) => {
          const cur = value || []
          return (
            <label key={opt} className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={cur.includes(opt)}
                onChange={(e) => onChange(e.target.checked ? [...cur, opt] : cur.filter((x) => x !== opt))}
                className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
              {opt}
            </label>
          )
        })}
      </div>
    ) : q.type === 'text' ? (
      <textarea rows={3} className={field} value={value || ''}
        onChange={(e) => onChange(e.target.value)} />
    ) : (
      <select className={field} value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">-- Please select --</option>
        {(q.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    )}
  </div>
)

// What to try when a photo won't attach — written for the common iPhone case
// (the original lives in iCloud and Safari silently fails to fetch it).
const PHOTO_TIPS = "That photo didn't come through. On iPhones this usually means the "
  + 'photo has to download from iCloud first. Try taking a new photo with the camera '
  + 'instead of choosing from your library, connect to Wi-Fi and try again, or finish '
  + 'this form on a computer — your progress is saved.'

// Circular photo preview + picker. Photos are required for every family member.
// Uploads happen the moment a photo is picked (see pickParentPhoto/pickKidPhoto),
// so `busy` shows upload progress and `error` surfaces failures right here.
const PhotoPicker = ({ label, url, busy, error, onSelect }) => (
  <div>
    <div className="flex items-center gap-3">
      <div className="relative w-14 h-14 shrink-0">
        {url ? (
          <img src={url} alt="" className="w-14 h-14 rounded-full object-cover border border-gray-200" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-neutral-100 border border-dashed border-gray-300 flex items-center justify-center">
            <PhotoIcon className="w-6 h-6 text-neutral-300" />
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 rounded-full bg-white/60 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
      <label className="text-sm font-medium text-optio-purple hover:underline cursor-pointer">
        {busy ? 'Uploading…' : url ? 'Change photo' : label}
        <input
          type="file" accept="image/*" className="hidden" disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onSelect(f)
            e.target.value = ''
          }}
        />
      </label>
    </div>
    {error && (
      <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2" role="alert">
        {error}
      </p>
    )}
  </div>
)

// Vertical stepper (desktop, left rail). Steps are sequential and all required:
// completed steps get a check and can be clicked to go back and edit, the
// current step is highlighted, and future steps are greyed out with a lock —
// they unlock only by finishing the one before them.
const BACK_EDITABLE = new Set(['family', 'details', 'paperwork'])

const VerticalStepper = ({ step, steps = STEPS, onNavigate, freeNav = false }) => {
  const idx = steps.indexOf(step)
  return (
    <aside className="hidden md:block w-56 shrink-0">
      <nav className="sticky top-8">
        <ol>
          {steps.map((s, i) => {
            const done = i < idx
            const current = i === idx
            // freeNav (preview mode): every step is one click away.
            const clickable = freeNav ? !current : (done && BACK_EDITABLE.has(s) && !POST_FEE_STEPS.has(step))
            return (
              <li key={s} className="relative pb-7 last:pb-0">
                {i < steps.length - 1 && (
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
const MobileStepper = ({ step, steps = STEPS, onNavigate, freeNav = false }) => {
  const idx = steps.indexOf(step)
  return (
    <div className="md:hidden mb-6">
      <div className="flex items-center gap-1.5 justify-center">
        {steps.map((s, i) => {
          const clickable = freeNav ? i !== idx : (i < idx && BACK_EDITABLE.has(s) && !POST_FEE_STEPS.has(step))
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
              {i < steps.length - 1 && <div className={`h-px w-3 ${i < idx ? 'bg-optio-purple' : 'bg-neutral-200'}`} />}
            </React.Fragment>
          )
        })}
      </div>
      <p className="text-center text-xs text-neutral-400 mt-2">
        Step {idx + 1} of {steps.length}: {STEP_LABELS[step]} — all steps are required, in order. Tap a completed step to edit it.
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
  const steps = feeApplies ? STEPS : STEPS.filter((s) => s !== 'fee')
  const [step, setStep] = useState('account')
  const [submitting, setSubmitting] = useState(false)

  // account step
  const [mode, setMode] = useState('create')            // create | signin
  const [account, setAccount] = useState({ first_name: '', last_name: '', email: '', password: '', confirm: '' })
  const [pendingVerify, setPendingVerify] = useState(null) // { registration_id, email }
  const [otp, setOtp] = useState('')

  // family step
  const [family, setFamily] = useState({ phone: '', address_line1: '', address_line2: '', city: '', state: '', postal_code: '' })
  const addressBoxRef = useRef(null)  // autofill reconciliation (mergeAutofilledFields)
  const [kids, setKids] = useState([emptyKid()])
  const [parentPhoto, setParentPhoto] = useState({ file: null, preview: '', avatar_url: '', uploading: false, error: '' })

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
    return api.post(`/api/icreate/registrations/${reg.registration_id}/photo`, form)
  }

  const pickParentPhoto = async (f) => {
    if (!f.size) return setParentPhoto((p) => ({ ...p, error: PHOTO_TIPS }))
    const preview = URL.createObjectURL(f)
    const canUpload = !previewMode && !!reg
    setParentPhoto({ file: f, preview, avatar_url: '', uploading: canUpload, error: '' })
    if (!canUpload) return
    try {
      const { data } = await uploadPhoto('parent', f)
      setParentPhoto({ file: null, preview, avatar_url: data.avatar_url, uploading: false, error: '' })
    } catch (e) {
      setParentPhoto((p) => ({ ...p, uploading: false, error: e.response?.data?.error || PHOTO_TIPS }))
    }
  }

  const pickKidPhoto = async (kidRef, f) => {
    const key = kidRef._key
    if (!f.size) return setKidByKey(key, { photo_error: PHOTO_TIPS })
    const preview = URL.createObjectURL(f)
    const canUpload = !previewMode && !!reg
    setKidByKey(key, {
      photo_file: f, photo_preview: preview, avatar_url: '', staged_url: '',
      photo_uploading: canUpload, photo_error: '',
    })
    if (!canUpload) return
    try {
      // Kids restored on back-edit already have accounts — upload straight to
      // them. New kids have no account until the family submits, so the file
      // is staged under the registration and attached at submit (photo_url).
      const { data } = await uploadPhoto(kidRef.user_id || 'staged', f)
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

  // Quietly establish a real app session (httpOnly cookies) so the later
  // "build your schedule" step can open the Schedule Builder without another
  // sign-in. The wizard itself keeps working off the funnel access_token, so a
  // failure here is invisible.
  const establishSession = async (email, password) => {
    try { await api.post('/api/auth/login', { email, password }) } catch { /* wizard works without it */ }
  }

  const submitVerify = async () => {
    if (!/^\d{6}$/.test(otp.trim())) return toast.error('Enter the 6-digit code from your email')
    setSubmitting(true)
    try {
      const { data } = await api.post('/api/icreate/verify', {
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
      const { data } = await api.post('/api/icreate/resend-code', { registration_id: pendingVerify.registration_id })
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
    try {
      const { data } = await api.post('/api/icreate/login', {
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
      toast.error(e.response?.data?.error || 'Could not sign in')
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
      const { data } = await api.post(`/api/icreate/registrations/${reg.registration_id}/family`, {
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
    if (previewMode) return setStep((config.paperwork || []).length ? 'paperwork' : (feeApplies ? 'fee' : 'done'))
    const validContacts = contacts.filter((c) => c.name.trim() || c.phone.trim())
    if (!validContacts.length) return toast.error('Add at least one emergency contact')
    for (const [i, c] of validContacts.entries()) {
      if (!c.name.trim() || !c.phone.trim()) return toast.error(`Emergency contact #${i + 1} needs a name and phone`)
    }
    const qErr = firstQuestionError(config.questions, answers, serverKids)
    if (qErr) return toast.error(qErr)
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
    if (previewMode) return setStep(feeApplies ? 'fee' : 'done')
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
    if (previewMode) return previewFinish()
    setSubmitting(true)
    try {
      const { data } = await api.post(`/api/icreate/registrations/${reg.registration_id}/fee`, {
        access_token: reg.access_token,
      })
      setScheduling({ url: absUrl(data.scheduling_url), emailed: !!data.scheduling_emailed })
      clearICreateRegistrationGate()  // fee settled — the app no longer redirects here
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
    if (previewMode) {
      // Real Stripe Checkout page (labeled preview, 50-cent line item — $0
      // isn't allowed) so staff sees exactly what families navigate.
      setSubmitting(true)
      try {
        const { data } = await api.post('/api/icreate/preview-checkout', {
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
      sessionStorage.setItem('icreate_funnel', JSON.stringify({
        registration_id: reg.registration_id, access_token: reg.access_token, fee_cents: feeCents,
      }))
      const { data } = await api.post(`/api/icreate/registrations/${reg.registration_id}/checkout`, {
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
      const { data } = await api.post(`/api/icreate/registrations/${r.registration_id}/confirm-payment`, {
        access_token: r.access_token,
      })
      if (['schedule', 'appointment', 'completed'].includes(data.status)) {
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
        <VerticalStepper step={step} steps={steps} onNavigate={setStep} freeNav={previewMode} />
        <div className="flex-1 min-w-0 max-w-2xl">
        <MobileStepper step={step} steps={steps} onNavigate={setStep} freeNav={previewMode} />

        {previewMode && (
          <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            <span className="font-semibold">Preview mode</span> — nothing is saved. Buttons advance
            without creating accounts, sending emails, or charging cards, and you can jump to any
            step from the stepper.
          </div>
        )}

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
              <div ref={addressBoxRef} className="grid grid-cols-1 sm:grid-cols-6 gap-4">
                <div className="sm:col-span-2"><label className="block text-xs font-medium text-neutral-500 mb-1">Phone</label>
                  <input type="tel" name="phone" autoComplete="tel" className={field} placeholder="XXX-XXX-XXXX" value={family.phone} onChange={(e) => setFamily({ ...family, phone: e.target.value })} /></div>
                <div className="sm:col-span-4"><label className="block text-xs font-medium text-neutral-500 mb-1">Street address</label>
                  <input name="address-line1" autoComplete="address-line1" className={field} value={family.address_line1} onChange={(e) => setFamily({ ...family, address_line1: e.target.value })} /></div>
                <div className="sm:col-span-2"><label className="block text-xs font-medium text-neutral-500 mb-1">Apt / unit (optional)</label>
                  <input name="address-line2" autoComplete="address-line2" className={field} value={family.address_line2} onChange={(e) => setFamily({ ...family, address_line2: e.target.value })} /></div>
                <div className="sm:col-span-2"><label className="block text-xs font-medium text-neutral-500 mb-1">City</label>
                  <input name="city" autoComplete="address-level2" className={field} value={family.city} onChange={(e) => setFamily({ ...family, city: e.target.value })} /></div>
                <div className="sm:col-span-1"><label className="block text-xs font-medium text-neutral-500 mb-1">State</label>
                  <input name="state" autoComplete="address-level1" className={field} placeholder="UT" value={family.state} onChange={(e) => setFamily({ ...family, state: e.target.value })} /></div>
                <div className="sm:col-span-1"><label className="block text-xs font-medium text-neutral-500 mb-1">ZIP</label>
                  <input name="zip" autoComplete="postal-code" className={field} value={family.postal_code} onChange={(e) => setFamily({ ...family, postal_code: e.target.value })} /></div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100">
                <label className="block text-xs font-medium text-neutral-500 mb-2">
                  Your photo <span className="text-red-400">*</span>
                </label>
                <PhotoPicker
                  label="Add your photo"
                  url={parentPhoto.preview || parentPhoto.avatar_url}
                  busy={parentPhoto.uploading}
                  error={parentPhoto.error}
                  onSelect={pickParentPhoto}
                />
                <p className="text-xs text-neutral-400 mt-1.5">Photos are required for every family member so staff can recognize your family.</p>
              </div>
            </Section>

            <Section title="Children">
              <div className="space-y-5">
                {kids.map((k, i) => {
                  const age = ageFromDob(k.date_of_birth)
                  const teen = age != null && age >= 13
                  const dobInvalid = k.dob_text.length === 10 && !k.date_of_birth
                  return (
                    <div key={k._key || i} className="rounded-lg border border-gray-200 p-4">
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
                          <input
                            className={`${field} ${dobInvalid ? 'border-red-400 focus:ring-red-400' : ''}`}
                            placeholder="MM/DD/YYYY" inputMode="numeric" maxLength={10}
                            value={k.dob_text}
                            onChange={(e) => {
                              const text = formatMdy(e.target.value)
                              setKid(i, { dob_text: text, date_of_birth: mdyToIso(text) || '' })
                            }}
                          />
                          {dobInvalid && (
                            <p className="text-xs text-red-500 mt-1" role="alert">
                              That date doesn't exist — double-check the month and day.
                            </p>
                          )}
                          {(() => {
                            const gate = enrollmentGateFor(config, k.date_of_birth)
                            if (!gate) return null
                            return (
                              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                                Students {gateBandText(gate)} are currently joining a waitlist. You can
                                finish registering {k.first_name.trim() || 'this child'} — {org.name || 'the school'} will
                                email you as soon as they can choose classes.
                              </p>
                            )
                          })()}
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-neutral-500 mb-1">
                            Photo <span className="text-red-400">*</span>
                          </label>
                          <PhotoPicker
                            label={`Add ${k.first_name.trim() ? `${k.first_name.trim()}'s` : "this child's"} photo`}
                            url={k.photo_preview || k.staged_url || k.avatar_url}
                            busy={k.photo_uploading}
                            error={k.photo_error}
                            onSelect={(f) => pickKidPhoto(k, f)}
                          />
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
                          <label className="block text-xs font-medium text-neutral-500 mb-1">Child's Email (Optional)</label>
                          <input type="email" className={field} placeholder="name@example.com"
                            value={k.email} onChange={(e) => setKid(i, { email: e.target.value })} />
                          <p className="mt-1 text-xs text-neutral-400">
                            With an email, {k.first_name.trim() || 'your child'} gets their own login. If they already
                            have an Optio account, enter its email and we'll connect it. Leave it blank to
                            manage their account under yours.
                          </p>
                        </div>
                      )}
                      {age != null && age < 13 && (
                        <p className="mt-2 text-xs text-neutral-400">Under 13 — managed under your account (no separate login).</p>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="mt-4">
                <button onClick={() => setKids((ks) => [...ks, emptyKid()])} className="text-sm font-medium text-optio-purple hover:underline">+ Add another child</button>
              </div>
            </Section>

            {estimateFeeCents() > 0 && (
              <p className="text-center text-sm text-neutral-500">
                Registration fee: <span className="font-semibold text-neutral-800">{money(estimateFeeCents())}</span>
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

            {(config.questions || []).length > 0 && (() => {
              const familyQs = (config.questions || []).filter((q) => !q.per_student)
              const studentQs = (config.questions || []).filter((q) => q.per_student)
              // Per-student answers are keyed by the kid's user_id, which only
              // exists after the family step submits. Preview mode fakes ids
              // from the sample kids so staff sees the per-child layout.
              const qKids = previewMode
                ? kids.map((k, i) => ({ user_id: `preview-${i}`, first_name: k.first_name, name: `${k.first_name} ${k.last_name}`.trim() }))
                : serverKids
              // Built-in follow-up: only Utah Fits All families need to say
              // whether they're enrolling as a UFA Private School.
              const paymentIsUFA = familyQs.some((q) => {
                const v = answers[q.key]
                return Array.isArray(v) ? v.includes('Utah Fits All') : v === 'Utah Fits All'
              })
              return (
                <Section title="A few questions">
                  <div className="space-y-5">
                    {familyQs.map((q) => (
                      <QuestionField key={q.key} q={q} value={answers[q.key]}
                        onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))} />
                    ))}
                    {paymentIsUFA && (
                      <div>
                        <label className="block text-sm font-medium text-neutral-800 mb-1">
                          Are you enrolling as a UFA (Utah Fits All) Private School?
                        </label>
                        <select className={field} value={answers.ufa_private || ''}
                          onChange={(e) => setAnswers((a) => ({ ...a, ufa_private: e.target.value }))}>
                          <option value="">-- Please select --</option>
                          <option value="No">No, standard Utah Fits All</option>
                          <option value="Yes">Yes, UFA Private School</option>
                        </select>
                      </div>
                    )}
                    {studentQs.length > 0 && qKids.map((k, idx) => (
                      <div key={k.user_id} className={familyQs.length || idx > 0 ? 'pt-4 border-t border-gray-100' : ''}>
                        <h3 className="text-sm font-semibold text-neutral-900 mb-3">
                          {(k.first_name || k.name || 'Your child').trim()}
                        </h3>
                        <div className="space-y-5">
                          {studentQs.map((q) => (
                            <QuestionField key={q.key} q={q} value={(answers[q.key] || {})[k.user_id]}
                              onChange={(v) => setAnswers((a) => ({
                                ...a,
                                [q.key]: { ...(a[q.key] || {}), [k.user_id]: v },
                              }))} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )
            })()}

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

        {step === 'fee' && (() => {
          const anyWaitlisted = kids.some((k) => enrollmentGateFor(config, k.date_of_birth))
          // A fee that includes a waitlisted child needs explicit consent to the
          // hold-your-place / fully-refundable terms before we let them pay.
          const needsAck = !feeDeferred && feeCents > 0 && anyWaitlisted
          const ackBlocks = needsAck && !waitlistAck
          return (
          <div className="space-y-6">
            {/* When nothing is due (fee configured at 0, or a prepaid credit)
                this step is just a finish gate — don't headline it as a fee. */}
            <Section title={feeDeferred || feeCents > 0 ? 'Registration fee' : 'Finish your registration'}>
              <div className="text-center">
                {feeDeferred ? (
                  <>
                    <p className="text-3xl font-bold text-optio-purple my-3">{money(feeCents)}</p>
                    <p className="text-sm text-neutral-500">
                      Nothing to pay today. Because your student{kids.length === 1 ? ' is' : 's are'} joining
                      the waitlist, your registration fee is due when a spot opens — we'll email you.
                    </p>
                  </>
                ) : feeCents > 0
                  ? <p className="text-3xl font-bold text-optio-purple my-3">{money(feeCents)}</p>
                  : <p className="text-sm text-neutral-500 my-3">
                      No payment is due — complete your registration below.
                    </p>}
                {/* Payment affordances only render when something is actually
                    owed NOW: a $0 family (prepaid credit) or a fee-deferred
                    waitlist family must never be handed a payment link. */}
                {!feeDeferred && feeCents > 0 && (config.stripe_enabled ? (
                  <p className="text-xs text-neutral-400">
                    You'll be taken to a secure Stripe checkout. Your registration completes automatically once the payment is verified.
                  </p>
                ) : paymentUrl ? (
                  <>
                    <a href={paymentUrl} target="_blank" rel="noreferrer"
                      className="inline-block px-5 py-2.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold hover:opacity-90">
                      Pay {money(feeCents)}
                    </a>
                    <p className="text-xs text-neutral-400 mt-3">Payment opens in a new tab. Return here and continue once you've paid.</p>
                  </>
                ) : (
                  <p className="text-sm text-neutral-400">Your school will collect the fee separately.</p>
                ))}
              </div>
            </Section>
            {needsAck && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold mb-1">
                  {kids.filter((k) => enrollmentGateFor(config, k.date_of_birth)).length === 1
                    ? 'One of your children is in a waitlisted age group.'
                    : 'Some of your children are in a waitlisted age group.'}
                </p>
                <p className="mb-3">
                  Paying now <strong>holds their place in line</strong> — it does not
                  guarantee a spot. If they aren't accepted, that portion of your
                  registration fee is <strong>fully refunded</strong> to your card. Your
                  other children are enrolled as usual.
                </p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={waitlistAck}
                    onChange={(e) => setWaitlistAck(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-amber-400 text-optio-purple focus:ring-optio-purple" />
                  <span>I understand this fee holds my child's place and is fully
                    refunded if they aren't accepted.</span>
                </label>
              </div>
            )}
            {!feeDeferred && config.stripe_enabled && feeCents > 0 ? (
              <>
                <PrimaryButton onClick={startCheckout} disabled={submitting || ackBlocks}>
                  {submitting ? 'One moment…' : `Pay ${money(feeCents)} securely`}
                </PrimaryButton>
                <button onClick={() => confirmPayment()} disabled={submitting}
                  className="w-full text-sm text-optio-purple font-medium hover:underline disabled:opacity-50">
                  Already paid? Verify my payment
                </button>
              </>
            ) : (
              <PrimaryButton onClick={() => finishFee()} disabled={submitting || ackBlocks}>
                {submitting ? 'Finishing…'
                  : !feeDeferred && paymentUrl && feeCents > 0 ? "I've paid — finish registration"
                  : 'Finish registration'}
              </PrimaryButton>
            )}
          </div>
          )
        })()}

        {step === 'done' && config.post_registration_flow === 'goals' && (
          <div className="space-y-6 text-center">
            <div className="bg-white rounded-xl border border-gray-200 p-8">
              <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
              <h2 className="text-xl font-bold text-neutral-900 mb-2">Your account is ready</h2>
              <p className="text-neutral-500 mb-5">
                Next, sit down with each of your kids and set a direction and goals for the
                year together.
              </p>
              <a href="/family/goals"
                className="inline-block px-5 py-2.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold hover:opacity-90">
                Set your student's goals
              </a>
              <p className="text-sm text-neutral-500 mt-5">
                You'll review these together at your meeting with {org.name || 'the school'}.
              </p>
            </div>
            <p className="text-sm text-neutral-400">
              Registration is complete. You can sign in at any time with your email and password.
            </p>
          </div>
        )}

        {step === 'done' && config.post_registration_flow !== 'goals' && (
          <div className="space-y-6 text-center">
            <div className="bg-white rounded-xl border border-gray-200 p-8">
              <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
              <h2 className="text-xl font-bold text-neutral-900 mb-2">Your account is ready</h2>
              <p className="text-neutral-500 mb-5">
                Your account has been created. Next, use the Schedule Builder to create your
                family's schedule for the coming school year.
              </p>
              {/* Preview mode opens the staff walkthrough of the builder (real
                  catalog, sample student, nothing saved) in a new tab so the
                  funnel preview stays put. */}
              <a href={previewMode ? `/schedule-builder/preview/${code}` : '/schedule-builder'}
                target={previewMode ? '_blank' : undefined} rel={previewMode ? 'noreferrer' : undefined}
                className="inline-block px-5 py-2.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold hover:opacity-90">
                Open the Schedule Builder
              </a>
              <div className="border-t border-gray-100 mt-7 pt-6">
                <p className="text-neutral-500 mb-5">
                  Then book an appointment with iCreate staff to build your Customized Learning
                  Plan — our team will review your schedule with you at the meeting.
                  {scheduling.emailed && ' We also emailed you the booking link.'}
                </p>
                {scheduling.url ? (
                  <a href={scheduling.url} target="_blank" rel="noreferrer"
                    className="inline-block px-5 py-2.5 rounded-lg border border-optio-purple text-optio-purple font-semibold hover:bg-optio-purple/5">
                    Book appointment
                  </a>
                ) : (
                  <p className="text-sm text-neutral-400">The school will reach out to schedule your appointment.</p>
                )}
              </div>
            </div>
            <p className="text-sm text-neutral-400">
              Registration is complete. You can sign in at any time with your email and password —
              the Schedule Builder also has a Book appointment button if you need it later.
            </p>
          </div>
        )}
        </div>
      </main>
    </div>
  )
}

export default ICreateRegisterPage

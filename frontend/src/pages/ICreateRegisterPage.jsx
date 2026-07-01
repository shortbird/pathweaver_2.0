import React, { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../services/api'

// Branded multi-step parent registration for the iCreate microschool.
// Reached only for iCreate parent registration links (AcceptInvitationPage
// redirects here); every other org keeps the standard invitation flow.
//
// Steps: account (parent + kids) -> paperwork (acknowledge/e-sign) ->
// fee (external payment link, record-only) -> done (scheduling handoff).

const STEPS = ['account', 'paperwork', 'fee', 'done']
const STEP_LABELS = { account: 'Your family', paperwork: 'Paperwork', fee: 'Registration fee', done: 'Done' }

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
const field = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'
const emptyKid = () => ({ first_name: '', last_name: '', date_of_birth: '', email: '', as_dependent: false })

const Stepper = ({ step }) => {
  const idx = STEPS.indexOf(step)
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((s, i) => (
        <React.Fragment key={s}>
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
              i < idx ? 'bg-optio-purple text-white' : i === idx ? 'bg-optio-purple text-white' : 'bg-neutral-200 text-neutral-500'
            }`}>{i + 1}</div>
            <span className={`text-xs font-medium hidden sm:inline ${i === idx ? 'text-optio-purple' : 'text-neutral-400'}`}>{STEP_LABELS[s]}</span>
          </div>
          {i < STEPS.length - 1 && <div className={`h-px w-6 ${i < idx ? 'bg-optio-purple' : 'bg-neutral-200'}`} />}
        </React.Fragment>
      ))}
    </div>
  )
}

const ICreateRegisterPage = () => {
  const { code } = useParams()
  const [loading, setLoading] = useState(true)
  const [fatal, setFatal] = useState(null)
  const [config, setConfig] = useState(null)
  const [step, setStep] = useState('account')
  const [submitting, setSubmitting] = useState(false)

  // account step
  const [parent, setParent] = useState({ email: '', password: '', confirm: '', first_name: '', last_name: '', date_of_birth: '' })
  const [kids, setKids] = useState([emptyKid()])

  // funnel state after register
  const [reg, setReg] = useState(null) // { registration_id, access_token }
  const [feeCents, setFeeCents] = useState(0) // computed per-family fee for this registration
  const [signatures, setSignatures] = useState({})
  const [scheduling, setScheduling] = useState({ url: '', emailed: false })
  const [paidOpened, setPaidOpened] = useState(false)

  useEffect(() => {
    let alive = true
    api.get(`/api/icreate/config/${code}`)
      .then((r) => { if (alive) setConfig(r.data) })
      .catch((e) => { if (alive) setFatal(e.response?.data?.error || 'This registration link is not valid.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [code])

  // Mirror the backend fee model so parents see a live estimate as they add kids.
  const estimateFeeCents = () => {
    if (!config) return 0
    const n = kids.filter((k) => k.first_name.trim() && k.date_of_birth).length
    const family = config.registration_fee_cents || 0
    const per = config.per_student_fee_cents || 0
    const mode = config.fee_mode || 'flat'
    if (mode === 'per_student') return per * n
    if (mode === 'lesser') { const o = [family, per * n].filter((v) => v > 0); return o.length ? Math.min(...o) : 0 }
    return family
  }

  const setKid = (i, patch) => setKids((ks) => ks.map((k, j) => (j === i ? { ...k, ...patch } : k)))
  const addKid = () => setKids((ks) => [...ks, emptyKid()])
  const removeKid = (i) => setKids((ks) => ks.filter((_, j) => j !== i))

  const submitAccount = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(parent.email)) return toast.error('Enter a valid parent email')
    if (parent.password.length < 8) return toast.error('Password must be at least 8 characters')
    if (parent.password !== parent.confirm) return toast.error('Passwords do not match')
    if (!parent.first_name.trim() || !parent.last_name.trim()) return toast.error('Enter your first and last name')
    for (const [i, k] of kids.entries()) {
      if (!k.first_name.trim() || !k.last_name.trim()) return toast.error(`Child #${i + 1} needs a first and last name`)
      if (!k.date_of_birth) return toast.error(`Child #${i + 1} needs a date of birth`)
      const age = ageFromDob(k.date_of_birth)
      if (age >= 13 && !k.as_dependent && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(k.email)) {
        return toast.error(`${k.first_name} is 13+, so add their email or mark them as managed by you`)
      }
    }

    setSubmitting(true)
    try {
      const { data } = await api.post('/api/icreate/register', {
        code,
        parent: {
          email: parent.email.trim(), password: parent.password,
          first_name: parent.first_name.trim(), last_name: parent.last_name.trim(),
          date_of_birth: parent.date_of_birth || null,
        },
        kids: kids.map((k) => ({
          first_name: k.first_name.trim(), last_name: k.last_name.trim(),
          date_of_birth: k.date_of_birth, email: k.email.trim(), as_dependent: k.as_dependent,
        })),
      })
      setReg({ registration_id: data.registration_id, access_token: data.access_token })
      // config may have been refreshed server-side; keep the richer response
      setConfig((c) => ({ ...c, ...data }))
      setFeeCents(data.fee_cents || 0)
      if ((data.paperwork || []).length) setStep('paperwork')
      else if ((data.fee_cents || 0) > 0 || data.payment_url) setStep('fee')
      else await finishFee({ registration_id: data.registration_id, access_token: data.access_token })
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not complete registration')
    } finally {
      setSubmitting(false)
    }
  }

  const submitPaperwork = async () => {
    const items = config.paperwork || []
    for (const it of items) {
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

  const finishFee = useCallback(async (regOverride) => {
    const r = regOverride || reg
    setSubmitting(true)
    try {
      const { data } = await api.post(`/api/icreate/registrations/${r.registration_id}/fee`, {
        access_token: r.access_token,
      })
      setScheduling({ url: data.scheduling_url || '', emailed: !!data.scheduling_emailed })
      setStep('done')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not finish registration')
    } finally {
      setSubmitting(false)
    }
  }, [reg])

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
  const paymentUrl = config.payment_url || ''

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
          {logo ? <img src={logo} alt={org.name} className="h-9 w-auto" /> : (
            <span className="text-lg font-bold text-optio-purple">{org.name}</span>
          )}
          <span className="text-sm text-neutral-400">Family Registration</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <Stepper step={step} />

        {step === 'account' && (
          <div className="space-y-6">
            <section className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-neutral-900 mb-4">Parent / guardian</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-neutral-500 mb-1">First name</label>
                  <input className={field} value={parent.first_name} onChange={(e) => setParent({ ...parent, first_name: e.target.value })} /></div>
                <div><label className="block text-xs font-medium text-neutral-500 mb-1">Last name</label>
                  <input className={field} value={parent.last_name} onChange={(e) => setParent({ ...parent, last_name: e.target.value })} /></div>
                <div className="sm:col-span-2"><label className="block text-xs font-medium text-neutral-500 mb-1">Email</label>
                  <input type="email" className={field} value={parent.email} onChange={(e) => setParent({ ...parent, email: e.target.value })} /></div>
                <div><label className="block text-xs font-medium text-neutral-500 mb-1">Password</label>
                  <input type="password" className={field} value={parent.password} onChange={(e) => setParent({ ...parent, password: e.target.value })} /></div>
                <div><label className="block text-xs font-medium text-neutral-500 mb-1">Confirm password</label>
                  <input type="password" className={field} value={parent.confirm} onChange={(e) => setParent({ ...parent, confirm: e.target.value })} /></div>
              </div>
            </section>

            <section className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-neutral-900">Children</h2>
                <button onClick={addKid} className="text-sm font-medium text-optio-purple hover:underline">+ Add another child</button>
              </div>
              <div className="space-y-5">
                {kids.map((k, i) => {
                  const age = ageFromDob(k.date_of_birth)
                  const teen = age != null && age >= 13
                  return (
                    <div key={i} className="rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-neutral-700">Child {i + 1}{age != null ? ` · age ${age}` : ''}</span>
                        {kids.length > 1 && <button onClick={() => removeKid(i)} className="text-xs text-red-500 hover:underline">Remove</button>}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input className={field} placeholder="First name" value={k.first_name} onChange={(e) => setKid(i, { first_name: e.target.value })} />
                        <input className={field} placeholder="Last name" value={k.last_name} onChange={(e) => setKid(i, { last_name: e.target.value })} />
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-neutral-500 mb-1">Date of birth</label>
                          <input type="date" className={field} value={k.date_of_birth} onChange={(e) => setKid(i, { date_of_birth: e.target.value })} />
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
            </section>

            {estimateFeeCents() > 0 && (
              <p className="text-center text-sm text-neutral-500">
                Estimated registration fee: <span className="font-semibold text-neutral-800">{money(estimateFeeCents())}</span>
              </p>
            )}

            <button onClick={submitAccount} disabled={submitting}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold hover:opacity-90 disabled:opacity-50">
              {submitting ? 'Creating your family…' : 'Continue'}
            </button>
          </div>
        )}

        {step === 'paperwork' && (
          <div className="space-y-6">
            <section className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-neutral-900 mb-1">Paperwork</h2>
              <p className="text-sm text-neutral-500 mb-5">Review each item and type your full name to sign.</p>
              <div className="space-y-4">
                {(config.paperwork || []).map((it) => (
                  <div key={it.key} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="font-medium text-neutral-900">{it.label}</span>
                      {it.doc_url && <a href={it.doc_url} target="_blank" rel="noreferrer" className="text-sm text-optio-purple hover:underline whitespace-nowrap">View document</a>}
                    </div>
                    <input className={field} placeholder="Type your full name to sign"
                      value={signatures[it.key] || ''} onChange={(e) => setSignatures((s) => ({ ...s, [it.key]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </section>
            <button onClick={submitPaperwork} disabled={submitting}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold hover:opacity-90 disabled:opacity-50">
              {submitting ? 'Saving…' : 'Continue'}
            </button>
          </div>
        )}

        {step === 'fee' && (
          <div className="space-y-6">
            <section className="bg-white rounded-xl border border-gray-200 p-6 text-center">
              <h2 className="text-lg font-semibold text-neutral-900 mb-1">Registration fee</h2>
              {feeCents > 0
                ? <p className="text-3xl font-bold text-optio-purple my-3">{money(feeCents)}</p>
                : <p className="text-sm text-neutral-500 my-3">Complete your registration below.</p>}
              {paymentUrl ? (
                <>
                  <a href={paymentUrl} target="_blank" rel="noreferrer" onClick={() => setPaidOpened(true)}
                    className="inline-block px-5 py-2.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold hover:opacity-90">
                    Pay {feeCents > 0 ? money(feeCents) : 'registration fee'}
                  </a>
                  <p className="text-xs text-neutral-400 mt-3">Payment opens in a new tab. Return here and continue once you've paid.</p>
                </>
              ) : (
                <p className="text-sm text-neutral-400">Your school will collect any fee separately.</p>
              )}
            </section>
            <button onClick={() => finishFee()} disabled={submitting}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold hover:opacity-90 disabled:opacity-50">
              {submitting ? 'Finishing…' : paymentUrl ? "I've paid — finish registration" : 'Finish registration'}
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-6 text-center">
            <div className="bg-white rounded-xl border border-gray-200 p-8">
              <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
              <h2 className="text-xl font-bold text-neutral-900 mb-2">You're registered!</h2>
              <p className="text-neutral-500 mb-6">
                Check your email to verify your account and set up your login.
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
      </main>
    </div>
  )
}

export default ICreateRegisterPage

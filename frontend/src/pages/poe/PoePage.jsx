import React, { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import MarketingLayout from '../../components/marketing/MarketingLayout'
import { getPoeCohorts, enrollInPoe } from '../../services/poeService'

// Hidden public page for the 2026 Pipe Organ Encounter pilot. Not linked in nav;
// families reach it via /poe from the AGO announcement email. This is an interest
// list, not a sign-up: participants pick their POE location and add their info;
// they get a confirmation email and Optio follows up to onboard them before camp.

const POPPINS = { fontFamily: 'Poppins' }

const BENEFITS = [
  { d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', title: '0.5 fine arts credit', text: 'Graded A, on your transcript' },
  { d: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', title: 'Accredited & transferable', text: 'WASC-accredited — transfers anywhere' },
  { d: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z', title: 'All during camp', text: 'Log it on your phone that week' },
]

const STEPS = [
  { title: 'Join the list', text: 'Pick your POE and add your info' },
  { title: 'Document', text: 'We set you up to log your week in the app' },
  { title: 'Earn credit', text: 'We review your work and post the credit' },
]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

const ageFromDob = (dob) => {
  if (!dob) return null
  const d = new Date(dob)
  if (isNaN(d.getTime())) return null
  return (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
}

const formatDateRange = (start, end) => {
  if (!start) return null
  const [sy, sm, sd] = start.split('-').map(Number)
  if (!sy || !sm || !sd) return null
  if (!end) return `${MONTHS[sm - 1]} ${sd}, ${sy}`
  const [ey, em, ed] = end.split('-').map(Number)
  if (sy === ey && sm === em) return `${MONTHS[sm - 1]} ${sd}–${ed}, ${sy}`
  if (sy === ey) return `${MONTHS[sm - 1]} ${sd} – ${MONTHS[em - 1]} ${ed}, ${sy}`
  return `${MONTHS[sm - 1]} ${sd}, ${sy} – ${MONTHS[em - 1]} ${ed}, ${ey}`
}

const Icon = ({ d, className = 'w-6 h-6' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={d} />
  </svg>
)

const field =
  'w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-optio-purple focus:ring-1 focus:ring-optio-purple'
const label = 'block text-sm font-medium text-gray-700 mb-1'

const PoePage = () => {
  const [cohorts, setCohorts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [form, setForm] = useState({
    poe_cohort: '',
    first_name: '', last_name: '', email: '', date_of_birth: '',
    parent_first_name: '', parent_last_name: '', parent_email: '',
    credit_dest: '', school_name: '', school_city: '', school_state: '', school_email: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    let active = true
    getPoeCohorts()
      .then((data) => { if (active) setCohorts(data.cohorts || []) })
      .catch(() => { if (active) setLoadError('Could not load the Pipe Organ Encounter locations. Please try again.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const age = ageFromDob(form.date_of_birth)
  const isMinor = age !== null && age < 18
  const selectedCohort = cohorts.find((c) => c.slug === form.poe_cohort) || null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError(null)
    if (!form.poe_cohort) { setSubmitError('Please select your POE location.'); return }
    if (age !== null && age < 13) { setSubmitError('Participants under 13 cannot sign up directly. Please contact us and we will help set things up.'); return }
    if (isMinor && !emailOk(form.parent_email)) { setSubmitError('A parent or guardian email is required for participants under 18.'); return }
    if (!form.credit_dest) { setSubmitError('Tell us where your credit should go.'); return }
    if (form.credit_dest === 'school' && !form.school_name.trim()) { setSubmitError('Enter your school name, or choose homeschool / not enrolled.'); return }

    setSubmitting(true)
    try {
      const body = {
        poe_cohort: form.poe_cohort,
        student: {
          first_name: form.first_name, last_name: form.last_name,
          email: form.email, date_of_birth: form.date_of_birth,
        },
        school: {
          is_homeschool: form.credit_dest === 'homeschool',
          name: form.school_name, city: form.school_city, state: form.school_state, contact_email: form.school_email,
        },
      }
      if (isMinor) {
        body.parent = { first_name: form.parent_first_name, last_name: form.parent_last_name, email: form.parent_email }
      }
      const result = await enrollInPoe(body)
      setSuccess(result)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      const d = err?.response?.data
      setSubmitError(d?.message || d?.error || 'Enrollment failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <MarketingLayout>
      <Helmet>
        <title>Pipe Organ Encounter Credit | Optio</title>
        <meta name="description" content="Earn 0.5 fine arts credit for your Pipe Organ Encounter. Document your week in the Optio app and receive accredited, transcript-ready credit." />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* ===== HERO ===== */}
      <section
        className="relative bg-optio-purple"
        style={{ backgroundImage: "url('/poe-hero.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        {/* Brand gradient overlay over the piano photo keeps the headline readable */}
        <div className="absolute inset-0 bg-gradient-to-r from-optio-purple/75 to-optio-pink/65" aria-hidden="true" />
        <div className="relative max-w-4xl mx-auto px-4 py-20 sm:py-24 text-center text-white">
          <p className="uppercase tracking-widest text-sm text-white/80 mb-3" style={POPPINS}>Pipe Organ Encounter · 2026</p>
          <h1 className="text-4xl sm:text-5xl font-bold mb-5 leading-tight" style={{ ...POPPINS, fontWeight: 700 }}>
            Turn your POE into a high school Fine Arts class
          </h1>
          <p className="text-lg sm:text-xl text-white/90 max-w-2xl mx-auto mb-8" style={{ ...POPPINS, fontWeight: 500 }}>
            Document your experience in the Optio app and transfer class credit back to your high school. Free for 2026.
          </p>
          <a href="#enroll" className="inline-block bg-white text-optio-purple font-semibold px-8 py-3 rounded-full text-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200" style={{ ...POPPINS, fontWeight: 600 }}>
            Get on the list
          </a>
        </div>
      </section>

      {/* ===== WHAT YOU GET ===== */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12" style={{ ...POPPINS, fontWeight: 700 }}>What you get</h2>
          <div className="grid sm:grid-cols-3 gap-6 sm:gap-8">
            {BENEFITS.map((b) => (
              <div key={b.title} className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 text-optio-purple mb-4">
                  <Icon d={b.d} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1" style={{ ...POPPINS, fontWeight: 700 }}>{b.title}</h3>
                <p className="text-sm text-gray-600" style={POPPINS}>{b.text}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mt-10" style={POPPINS}>
            Homeschool or not enrolled? You’ll get an official accredited transcript record instead.
          </p>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12" style={{ ...POPPINS, fontWeight: 700 }}>How it works</h2>
          <div className="grid sm:grid-cols-3 gap-6 sm:gap-8">
            {STEPS.map((s, i) => (
              <div key={s.title} className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 text-center">
                <span className="inline-flex w-10 h-10 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink text-white text-lg font-bold items-center justify-center mb-4" style={POPPINS}>{i + 1}</span>
                <h3 className="text-lg font-bold text-gray-900 mb-1" style={{ ...POPPINS, fontWeight: 700 }}>{s.title}</h3>
                <p className="text-sm text-gray-600" style={POPPINS}>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== ENROLL ===== */}
      <section id="enroll" className="py-16 sm:py-20 bg-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-3" style={{ ...POPPINS, fontWeight: 700 }}>Get on the list</h2>
          <p className="text-center text-gray-600 mb-10" style={POPPINS}>
            Tell us about yourself and which POE you’re attending. We’ll send a confirmation and follow up to get you set up.
          </p>

          {loading && <p className="text-center text-gray-500">Loading…</p>}
          {loadError && <p className="text-center text-red-600">{loadError}</p>}

          {success ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center" style={POPPINS}>
              <h3 className="text-xl font-bold text-green-800 mb-2" style={{ ...POPPINS, fontWeight: 700 }}>
                You’re on the list for {selectedCohort?.display_name || 'your POE'}
              </h3>
              <p className="text-green-800">
                Check your email for a confirmation. There’s nothing more to do right now — we’ll reach out
                closer to camp to get you set up to document your week and earn your credit.
              </p>
            </div>
          ) : (
            !loading && !loadError && cohorts.length > 0 && (
              <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8 space-y-6" style={POPPINS}>
                {/* Location picker */}
                <div>
                  <span className={label}>Which POE are you attending?</span>
                  <div className="space-y-2">
                    {cohorts.map((c) => {
                      const sel = c.slug === form.poe_cohort
                      const dates = formatDateRange(c.start_date, c.end_date)
                      return (
                        <button
                          type="button"
                          key={c.slug}
                          onClick={() => setForm((f) => ({ ...f, poe_cohort: c.slug }))}
                          className={`w-full flex items-center justify-between rounded-lg border p-3 text-left transition-colors ${sel ? 'border-optio-purple bg-optio-purple/5' : 'border-gray-200 hover:border-gray-300'}`}
                        >
                          <span>
                            <span className={`block font-medium ${sel ? 'text-optio-purple' : 'text-gray-800'}`}>{c.display_name}</span>
                            {dates && <span className="block text-xs text-gray-500">{dates}</span>}
                          </span>
                          <span className={`w-4 h-4 rounded-full border-2 ${sel ? 'border-optio-purple bg-optio-purple' : 'border-gray-300'}`} />
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className={label}>First name</label><input className={field} value={form.first_name} onChange={set('first_name')} required /></div>
                  <div><label className={label}>Last name</label><input className={field} value={form.last_name} onChange={set('last_name')} required /></div>
                </div>
                <div><label className={label}>Your email</label><input type="email" className={field} value={form.email} onChange={set('email')} required /></div>
                <div><label className={label}>Date of birth</label><input type="date" className={field} value={form.date_of_birth} onChange={set('date_of_birth')} max="2025-12-31" required /></div>

                {/* Parent / guardian contact (minors) — so we can follow up. No account or consent is created here. */}
                {isMinor && (
                  <div className="rounded-lg border border-optio-purple/30 bg-optio-purple/5 p-5 space-y-4">
                    <p className="font-semibold text-gray-900">Parent / guardian contact</p>
                    <p className="text-sm text-gray-600">
                      Since you’re under 18, we’ll send the confirmation to your parent or guardian too and follow up with them to get you set up.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div><label className={label}>Parent first name</label><input className={field} value={form.parent_first_name} onChange={set('parent_first_name')} /></div>
                      <div><label className={label}>Parent last name</label><input className={field} value={form.parent_last_name} onChange={set('parent_last_name')} /></div>
                    </div>
                    <div><label className={label}>Parent / guardian email</label><input type="email" className={field} value={form.parent_email} onChange={set('parent_email')} required={isMinor} /></div>
                  </div>
                )}

                {/* Credit destination */}
                <div>
                  <span className={label}>Where should your credit go?</span>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'school', title: 'My school', sub: 'Transfer to my school' },
                      { key: 'homeschool', title: 'Homeschool / not enrolled', sub: 'Standalone transcript' },
                    ].map((opt) => {
                      const sel = form.credit_dest === opt.key
                      return (
                        <button type="button" key={opt.key} onClick={() => setForm((f) => ({ ...f, credit_dest: opt.key }))}
                          className={`rounded-lg border p-3 text-left transition-colors ${sel ? 'border-optio-purple bg-optio-purple/5' : 'border-gray-200 hover:border-gray-300'}`}>
                          <span className={`block font-medium ${sel ? 'text-optio-purple' : 'text-gray-800'}`}>{opt.title}</span>
                          <span className="block text-xs text-gray-500">{opt.sub}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {form.credit_dest === 'school' && (
                  <div className="space-y-4">
                    <div><label className={label}>School name</label><input className={field} value={form.school_name} onChange={set('school_name')} placeholder="e.g. Lincoln High School" /></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div><label className={label}>School city</label><input className={field} value={form.school_city} onChange={set('school_city')} /></div>
                      <div><label className={label}>State</label><input className={field} value={form.school_state} onChange={set('school_state')} /></div>
                    </div>
                    <div>
                      <label className={label}>Counselor or registrar email <span className="text-gray-400 font-normal">(optional)</span></label>
                      <input type="email" className={field} value={form.school_email} onChange={set('school_email')} placeholder="counselor@school.org" />
                      <p className="text-xs text-gray-500 mt-1">Optional — helps us route your transcript. You can add it later.</p>
                    </div>
                  </div>
                )}

                {form.credit_dest === 'homeschool' && (
                  <div className="rounded-lg border border-optio-purple/20 bg-optio-purple/5 p-4">
                    <p className="text-sm text-gray-600">
                      We’ll issue an official accredited transcript record you can use for your homeschool records and college admissions.
                    </p>
                  </div>
                )}

                {submitError && <p className="text-red-600 text-sm">{submitError}</p>}

                <button type="submit" disabled={submitting}
                  className="w-full bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold px-8 py-3 rounded-full text-lg shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100"
                  style={{ ...POPPINS, fontWeight: 600 }}>
                  {submitting ? 'Submitting…' : 'Add me to the list'}
                </button>
                <p className="text-xs text-gray-500 text-center">
                  Free for 2026, and joining the list has no effect on your POE participation.
                </p>
              </form>
            )
          )}
        </div>
      </section>
    </MarketingLayout>
  )
}

export default PoePage

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { queryKeys } from '../utils/queryKeys'
import { INPUT_CLASS } from '../components/ui/Input'
import PhoneCodeVerifier from '../components/auth/PhoneCodeVerifier'
import {
  clearPendingSchoolSetup, getPendingSchoolSetup, setPendingSchoolSetup,
} from '../utils/pendingSchoolSetup'

/**
 * /start-school/:token -- the link Optio sends a new school's operator.
 *
 * Signed out: what the form is for, and a way to sign up or sign in. The token
 * is saved first, so after signing up (which may detour through email
 * verification or Google) PendingSchoolSetupRedirect brings them back here.
 * Signed in: the setup form. A short required set comes first; every later
 * section is optional, and each one says what Optio can do for that part of
 * running a school, so the form doubles as a tour of the features.
 *
 * Standalone, like /verify-phone: no app sidebar or navigation, because the
 * operator has no school yet and the platform's menus only confuse them here.
 *
 * The phone number is required and checked by text message
 * (components/auth/PhoneCodeVerifier.jsx, the same flow as the phone hold);
 * the server refuses a submit from an account without a verified phone.
 *
 * Submitting creates the school and makes this account its administrator
 * (services/school_onboarding_service.py). Only some answers become settings;
 * the rest go to Optio, who follows up.
 *
 * Features (Tanner, 2026-10-09: do not overwhelm a new admin, but let them
 * know what is there): every school starts on the same short list, and only
 * the two yes/no questions turn anything on. The list of what a school starts
 * with and can add comes with the link, from the Settings Features card's own
 * list, so the form and the card cannot disagree. Ticking one records
 * interest for Optio to follow up; it turns nothing on.
 */

const GRADES = ['PreK', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'Adult']
const GRADE_LABEL = { PreK: 'Pre-K', K: 'K', Adult: 'Adult' }
const STUDENT_COUNTS = ['1-10', '11-25', '26-50', '51-100', '101-250', '250+']
const SCHOOL_TYPES = ['Microschool', 'Hybrid school', 'Homeschool co-op', 'Private K-12 school', 'Public school',
  'Learning center or enrichment program', 'Online school', 'Other']
const APPROACHES = ['Project-based', 'Self-directed', 'Classical', 'Montessori', 'Traditional', 'A mix', 'Other']
const TERMS = ['Semesters', 'Trimesters', 'Quarters', 'Year-round', 'No set terms']
const TUITION_MODELS = ['Annual tuition', 'Monthly tuition', 'Per class', 'Per term', 'Free or donation-based']

// Always there, so the Features card does not list them; the form names them
// so a new admin sees the heart of Optio first.
const ALWAYS = [
  { key: 'quests', name: 'Projects and quests', description: 'Students take on projects, finish tasks and earn XP for their work.' },
  { key: 'messaging', name: 'Messaging', description: 'Message families, students and staff, and send announcements.' },
  { key: 'mobile_app', name: 'Mobile app', description: 'Students and families use Optio on iOS and Android.' },
]

// Each yes turns on the features behind it (QUESTION_MODULES in
// backend/services/school_onboarding_service.py).
const YES_NO_QUESTIONS = [
  { key: 'families_register', label: 'Would you like families to register through Optio?',
    hint: 'Families apply and enroll online, with waitlists and age limits, and browse your classes.' },
  { key: 'collects_tuition', label: 'Would you like families to pay tuition through Optio?',
    hint: 'Invoices, and monthly autopay by bank account or card. Families register through Optio too.' },
]

function totalStudents(counts) {
  return Object.values(counts || {}).reduce((sum, n) => sum + (Number(n) > 0 ? Number(n) : 0), 0)
}

function timeZones() {
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone
  const us = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
    'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu']
  let all = []
  try { all = Intl.supportedValuesOf('timeZone') } catch { all = [] }
  const rest = all.filter((z) => !us.includes(z))
  return { here, list: [...us, ...rest] }
}

const OPTIO_LOGO = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png'

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="px-4 py-4 border-b border-gray-100 bg-white">
        <img src={OPTIO_LOGO} alt="Optio" className="h-8 w-auto" />
      </header>
      {children}
    </div>
  )
}

function Section({ title, intro, required = false, badge = true, children }) {
  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 sm:p-6 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {badge && <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${required
            ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
            {required ? 'Required' : 'Optional'}
          </span>}
        </div>
        {intro && <p className="mt-1 text-sm text-gray-600">{intro}</p>}
      </div>
      {children}
    </section>
  )
}

function Field({ id, label, required, hint, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
}

function Choice({ id, value, onChange, options, placeholder = 'Choose one' }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS}>
      {placeholder !== null && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o]
        return <option key={v} value={v}>{l}</option>
      })}
    </select>
  )
}

export default function SchoolSetupPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated, user, loading: authLoading, logout } = useAuth()
  const zones = useMemo(timeZones, [])
  const [form, setForm] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState({})
  const [problem, setProblem] = useState(null)
  const [done, setDone] = useState(null)
  // { verified, phone (masked), prefill } from the phone-verification status.
  const [phoneState, setPhoneState] = useState(null)
  const [changingPhone, setChangingPhone] = useState(false)
  const topRef = useRef(null)

  const { data: link, isLoading, isError } = useQuery({
    queryKey: queryKeys.schoolSetup(token),
    queryFn: async () => (await api.get(`/api/school-setup/${encodeURIComponent(token)}`)).data.link,
    retry: false,
  })

  // The form starts once the link is known, so the school name the link was
  // made for can fill the first box.
  useEffect(() => {
    if (!link || form) return
    setForm({
      school_name: link.school_name_hint || '', contact_title: '',
      online_only: false, address: '', city: '', region: '', country: 'United States',
      timezone: zones.list.includes(zones.here) ? zones.here : 'America/New_York',
      grade_counts: {},
      logo: '', website: '', mission: '',
      school_type: '', teaching_approach: '', days_per_week: '', term_structure: '',
      year_start: '', year_end: '', staff_count: '', students_next_year: '', current_tools: '',
      features: [], families_register: '', collects_tuition: '',
      accreditation: '', optio_credit_interest: '',
      tuition_model: '', funding_programs: '', has_stripe: '',
      billing_contact_name: '', billing_contact_email: '',
      ai_choice: 'on', library_choice: 'all_optio',
      launch_date: '', referral_source: '', notes: '',
    })
  }, [link, form, zones])

  useEffect(() => {
    if (authLoading || !isAuthenticated) return
    api.get('/api/phone-verification/status')
      .then((r) => setPhoneState({ verified: !!r.data?.verified, phone: r.data?.phone, prefill: r.data?.prefill || '' }))
      .catch(() => setPhoneState({ verified: false, phone: null, prefill: '' }))
  }, [authLoading, isAuthenticated])

  const phoneVerified = (masked) => {
    setPhoneState((p) => ({ ...p, verified: true, phone: masked || p?.phone }))
    setChangingPhone(false)
    if (errors.contact_phone) setErrors((e) => ({ ...e, contact_phone: null }))
  }

  // A closed or unknown link is final; the saved token would only bring the
  // visitor back to this message after every sign-in.
  const closed = isError || (link && link.status !== 'open')
  useEffect(() => {
    if (closed && getPendingSchoolSetup() === token) clearPendingSchoolSetup()
  }, [closed, token])

  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: null }))
  }
  const setGradeCount = (grade, raw) => {
    const value = raw === '' ? '' : String(Math.max(0, Math.min(10000, Math.floor(Number(raw) || 0))))
    setForm((f) => ({ ...f, grade_counts: { ...f.grade_counts, [grade]: value } }))
    if (errors.grade_counts) setErrors((e) => ({ ...e, grade_counts: null }))
  }
  const toggleIn = (key, value) => setForm((f) => ({
    ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
  }))

  const goTo = (path) => {
    setPendingSchoolSetup(token)
    navigate(path)
  }

  const pickLogo = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Please pick an image file')
    if (file.size > 2 * 1024 * 1024) return toast.error('The logo must be under 2MB')
    const reader = new FileReader()
    reader.onload = () => set('logo')(reader.result)
    reader.readAsDataURL(file)
  }

  const checkRequired = () => {
    const e = {}
    if (!form.school_name.trim()) e.school_name = 'Enter the school name.'
    if (!form.contact_title.trim()) e.contact_title = 'Enter your role.'
    if (!phoneState?.verified || changingPhone) e.contact_phone = 'Verify your phone number.'
    if (!form.online_only && !form.city.trim()) e.city = 'Enter a city.'
    if (!form.online_only && !form.region.trim()) e.region = 'Enter a state or region.'
    if (!totalStudents(form.grade_counts)) e.grade_counts = 'Enter how many students you have in at least one grade.'
    return e
  }

  const submit = async (ev) => {
    ev.preventDefault()
    const missing = checkRequired()
    setErrors(missing)
    if (Object.keys(missing).length) {
      topRef.current?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    setSubmitting(true)
    setProblem(null)
    try {
      const gradeCounts = Object.fromEntries(Object.entries(form.grade_counts)
        .filter(([, n]) => Number(n) > 0).map(([g, n]) => [g, Number(n)]))
      const { data } = await api.post(`/api/school-setup/${encodeURIComponent(token)}`,
        { ...form, grade_counts: gradeCounts })
      clearPendingSchoolSetup()
      setDone(data)
      window.scrollTo({ top: 0 })
    } catch (err) {
      const data = err.response?.data || {}
      if (data.field) setErrors((e) => ({ ...e, [data.field]: data.error }))
      // A closed link or an account that cannot run a school is final; the
      // saved token would only send them back here.
      if (data.code) clearPendingSchoolSetup()
      setProblem(data.error || 'We could not set up your school. Please try again.')
      topRef.current?.scrollIntoView({ behavior: 'smooth' })
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading || authLoading) {
    return <Shell><div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div></Shell>
  }

  if (closed || !link) {
    const message = link?.status === 'used'
      ? 'This link was already used to set up a school. If that was you, sign in to reach your school.'
      : link?.status === 'expired'
        ? 'This link has expired. Ask the person who sent it for a new one.'
        : 'Check the link with the person who sent it to you.'
    return (
      <Shell>
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-gray-900">This setup link is not available</h1>
          <p className="mt-2 text-gray-600">{message}</p>
        </div>
      </Shell>
    )
  }

  if (done) {
    return (
      <Shell>
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">{done.name} is on Optio</h1>
        <p className="text-gray-600">
          You are the school&apos;s administrator. We have your answers, and we will be in touch about the next steps.
        </p>
        <p className="text-gray-600">
          Your school starts simple. To turn on more features, choose Add features at the bottom of your menu.
        </p>
        <p className="text-sm text-gray-600">
          Your school&apos;s sign-in page is{' '}
          <span className="font-medium text-gray-900">{window.location.origin}/login/{done.slug}</span>
        </p>
        <button
          onClick={() => window.location.assign('/')}
          className="btn-primary"
        >
          Go to your school
        </button>
      </div>
      </Shell>
    )
  }

  if (!isAuthenticated) {
    return (
      <Shell>
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">Set up {link.school_name_hint || 'your school'} on Optio</h1>
          <p className="text-gray-700">
            First, create your own Optio account. You will be the school&apos;s administrator. Then you will fill out a
            short form about your school. It takes about ten minutes, and only the first section is required.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button onClick={() => goTo('/register')} className="flex-1 btn-primary">Create an account</button>
            <button onClick={() => goTo('/login')} className="flex-1 btn-quiet border border-gray-300">I already have an account</button>
          </div>
        </div>
      </div>
      </Shell>
    )
  }

  if (!form || !phoneState) return <Shell />

  const signOutAndSwitch = async () => {
    setPendingSchoolSetup(token)
    await logout()
    navigate('/login')
  }

  const inSchool = !!user?.organization_id || user?.role === 'superadmin'
  const startsWith = link.features?.starts_with || []
  const canAdd = link.features?.can_add || []
  const groups = link.features?.groups || []

  return (
    <Shell>
    <div className="max-w-3xl mx-auto px-4 py-10" ref={topRef}>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Set up your school on Optio</h1>
        <p className="mt-2 text-gray-600">
          Only the first section is required. Your answers help us set Optio up the right way for you.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Signed in as {user?.email}.{' '}
          <button type="button" onClick={signOutAndSwitch} className="text-optio-purple hover:underline">
            Use a different account
          </button>
        </p>
      </div>

      {inSchool && (
        <div role="alert" className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
          This account cannot be the administrator of a new school, because it already belongs to a school or to Optio.
          Use a different account.
        </div>
      )}
      {problem && (
        <div role="alert" className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {problem}
        </div>
      )}

      <form onSubmit={submit} className="space-y-6" noValidate>
        <Section title="The basics" required intro="We need these to create your school.">
          <Field id="school_name" label="School name" required error={errors.school_name}>
            <input id="school_name" className={INPUT_CLASS} value={form.school_name}
              onChange={(e) => set('school_name')(e.target.value)} maxLength={120} />
          </Field>
          <Field id="contact_title" label="Your role at the school" required error={errors.contact_title}
            hint="For example: Founder, Director, Head of School.">
            <input id="contact_title" className={INPUT_CLASS} value={form.contact_title}
              onChange={(e) => set('contact_title')(e.target.value)} maxLength={80} />
          </Field>
          <div id="contact_phone">
            <p className="block text-sm font-medium text-gray-700 mb-1">
              Your mobile phone<span className="text-red-600"> *</span>
            </p>
            {phoneState.verified && !changingPhone ? (
              <p className="text-sm text-gray-700">
                <span className="font-medium text-green-700">Verified</span>
                {phoneState.phone ? ` ${phoneState.phone}` : ''}.{' '}
                <button type="button" onClick={() => setChangingPhone(true)} className="text-optio-purple hover:underline">
                  Use a different number
                </button>
              </p>
            ) : (
              <div className="max-w-sm rounded-lg border border-gray-200 p-4">
                <PhoneCodeVerifier initialPhone={phoneState.prefill} label="We'll text you a code to confirm the number." hint={null}
                  onVerified={phoneVerified} />
              </div>
            )}
            {errors.contact_phone && <p role="alert" className="mt-1 text-sm text-red-600">{errors.contact_phone}</p>}
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.online_only} onChange={(e) => set('online_only')(e.target.checked)}
              className="rounded border-gray-300" />
            We are an online school with no building
          </label>
          {!form.online_only && (
            <>
              <Field id="address" label="Street address" hint="Optional. Families see it on your registration page.">
                <input id="address" className={INPUT_CLASS} value={form.address}
                  onChange={(e) => set('address')(e.target.value)} maxLength={200} />
              </Field>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field id="city" label="City" required error={errors.city}>
                  <input id="city" className={INPUT_CLASS} value={form.city}
                    onChange={(e) => set('city')(e.target.value)} maxLength={80} />
                </Field>
                <Field id="region" label="State or region" required error={errors.region}>
                  <input id="region" className={INPUT_CLASS} value={form.region}
                    onChange={(e) => set('region')(e.target.value)} maxLength={80} />
                </Field>
                <Field id="country" label="Country">
                  <input id="country" className={INPUT_CLASS} value={form.country}
                    onChange={(e) => set('country')(e.target.value)} maxLength={80} />
                </Field>
              </div>
            </>
          )}
          <Field id="timezone" label="Time zone" required error={errors.timezone}
            hint="Attendance, due dates and reminders use this time zone.">
            <select id="timezone" className={INPUT_CLASS} value={form.timezone}
              onChange={(e) => set('timezone')(e.target.value)}>
              {zones.list.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>

          <div id="grade_counts">
            <p className="block text-sm font-medium text-gray-700">
              Students in each grade<span className="text-red-600"> *</span>
            </p>
            <p className="mb-2 text-xs text-gray-500">
              Type how many students you have now in each grade you serve. Estimates are fine. Leave the other grades empty.
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {GRADES.map((g) => (
                <label key={g} className="flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1.5">
                  <span className="w-12 text-sm text-gray-700">{GRADE_LABEL[g] || `Grade ${g}`}</span>
                  <input
                    type="number" min="0" max="10000" inputMode="numeric"
                    aria-label={`Students in ${GRADE_LABEL[g] || `grade ${g}`}`}
                    value={form.grade_counts[g] ?? ''}
                    onChange={(e) => setGradeCount(g, e.target.value)}
                    className="w-full min-w-0 rounded-md border border-gray-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-optio-purple"
                  />
                </label>
              ))}
            </div>
            <p className="mt-2 text-sm text-gray-700">
              Total: <span className="font-semibold">{totalStudents(form.grade_counts)}</span> students
            </p>
            {errors.grade_counts && <p role="alert" className="mt-1 text-sm text-red-600">{errors.grade_counts}</p>}
          </div>
        </Section>

        <Section title="Your brand" intro="Your logo appears on your school's sign-in page, in the app header, and on your registration page.">
          <Field id="logo" label="Logo" hint="A square image works best. PNG, JPG or SVG, 2MB at most.">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                {form.logo
                  ? <img src={form.logo} alt="Your logo" className="max-w-full max-h-full object-contain" />
                  : <span className="text-xs text-gray-400">None</span>}
              </div>
              <label className="text-sm font-medium text-optio-purple hover:underline cursor-pointer">
                {form.logo ? 'Change' : 'Upload a logo'}
                <input id="logo" type="file" accept="image/*" onChange={pickLogo} className="hidden" />
              </label>
              {form.logo && (
                <button type="button" onClick={() => set('logo')('')} className="text-sm text-red-600 hover:underline">Remove</button>
              )}
            </div>
            {errors.logo && <p role="alert" className="mt-1 text-sm text-red-600">{errors.logo}</p>}
          </Field>
          <Field id="website" label="Website">
            <input id="website" className={INPUT_CLASS} value={form.website} placeholder="https://"
              onChange={(e) => set('website')(e.target.value)} maxLength={200} />
          </Field>
          <Field id="mission" label="Your mission, in a sentence or two">
            <textarea id="mission" rows={2} className={INPUT_CLASS} value={form.mission}
              onChange={(e) => set('mission')(e.target.value)} maxLength={500} />
          </Field>
        </Section>

        <Section title="Your program" intro="This tells us how your school runs, so the setup fits it.">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field id="school_type" label="What kind of school are you?">
              <Choice id="school_type" value={form.school_type} onChange={set('school_type')} options={SCHOOL_TYPES} />
            </Field>
            <Field id="teaching_approach" label="How do students learn at your school?">
              <Choice id="teaching_approach" value={form.teaching_approach} onChange={set('teaching_approach')} options={APPROACHES} />
            </Field>
            <Field id="days_per_week" label="Days per week students attend">
              <Choice id="days_per_week" value={form.days_per_week} onChange={set('days_per_week')}
                options={['1', '2', '3', '4', '5', 'It varies']} />
            </Field>
            <Field id="term_structure" label="How is your year divided?">
              <Choice id="term_structure" value={form.term_structure} onChange={set('term_structure')} options={TERMS} />
            </Field>
            <Field id="year_start" label="First day of the school year">
              <input id="year_start" type="date" className={INPUT_CLASS} value={form.year_start}
                onChange={(e) => set('year_start')(e.target.value)} />
            </Field>
            <Field id="year_end" label="Last day of the school year">
              <input id="year_end" type="date" className={INPUT_CLASS} value={form.year_end}
                onChange={(e) => set('year_end')(e.target.value)} />
            </Field>
            <Field id="staff_count" label="How many staff do you have?">
              <Choice id="staff_count" value={form.staff_count} onChange={set('staff_count')}
                options={['Just me', '2-5', '6-15', '16-40', '40+']} />
            </Field>
            <Field id="students_next_year" label="How many students do you expect next year?">
              <Choice id="students_next_year" value={form.students_next_year} onChange={set('students_next_year')} options={STUDENT_COUNTS} />
            </Field>
          </div>
          <Field id="current_tools" label="What tools or curriculum do you use now?"
            hint="For example: Khan Academy, Bloomy, Google Classroom, a spreadsheet. Optio can connect to some of them.">
            <input id="current_tools" className={INPUT_CLASS} value={form.current_tools}
              onChange={(e) => set('current_tools')(e.target.value)} maxLength={300} />
          </Field>
        </Section>

        <Section title="What your school starts with" badge={false}
          intro="Optio starts simple, so you can learn it one piece at a time. Your school begins with these.">
          <ul className="grid sm:grid-cols-2 gap-3">
            {[...ALWAYS, ...startsWith].map((f) => (
              <li key={f.key} className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                <span className="block text-sm font-medium text-gray-900">{f.name}</span>
                <span className="block text-xs text-gray-600">{f.description}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Registration and tuition" intro="If you answer yes, we turn these on for you.">
          <div className="grid sm:grid-cols-2 gap-4">
            {YES_NO_QUESTIONS.map((q) => (
              <Field key={q.key} id={q.key} label={q.label} hint={q.hint}>
                <Choice id={q.key} value={form[q.key]} onChange={set(q.key)}
                  options={[['yes', 'Yes'], ['no', 'No']]} />
              </Field>
            ))}
          </div>
        </Section>

        {canAdd.length > 0 && (
          <Section title="More you can add later"
            intro="None of these are on yet. Tick the ones that interest you, and we will help you set them up. You can also turn most of them on yourself at any time: choose Add features at the bottom of your menu.">
            {groups.map((g) => {
              const items = canAdd.filter((f) => f.group === g.key)
              if (!items.length) return null
              return (
                <fieldset key={g.key} className="space-y-2">
                  <legend className="text-sm font-semibold text-gray-700 mb-2">{g.name}</legend>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {items.map((f) => (
                      <label key={f.key} className={`flex gap-3 p-3 rounded-lg border cursor-pointer ${form.features.includes(f.key)
                        ? 'border-optio-purple bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <input type="checkbox" className="mt-1 rounded border-gray-300"
                          checked={form.features.includes(f.key)} onChange={() => toggleIn('features', f.key)} />
                        <span>
                          <span className="block text-sm font-medium text-gray-900">{f.name}</span>
                          <span className="block text-xs text-gray-600">{f.description}</span>
                          {f.optio_turns_on && (
                            <span className="block mt-1 text-xs text-gray-500">Optio turns this on for you.</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )
            })}
          </Section>
        )}

        <Section title="Credit and transcripts"
          intro="Optio tracks the work students do as credit. Students can also earn credit on an accredited Optio Academy transcript.">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field id="optio_credit_interest" label="Do you want students to earn Optio Academy credit?">
              <Choice id="optio_credit_interest" value={form.optio_credit_interest} onChange={set('optio_credit_interest')}
                options={['Yes', 'Maybe', 'No']} />
            </Field>
          </div>
          <Field id="accreditation" label="Is your school accredited? If so, by whom?">
            <input id="accreditation" className={INPUT_CLASS} value={form.accreditation}
              onChange={(e) => set('accreditation')(e.target.value)} maxLength={200} />
          </Field>
        </Section>

        <Section title="Tuition and payments"
          intro="Optio can bill families, run monthly autopay, and track scholarships and state funding.">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field id="tuition_model" label="How do families pay?">
              <Choice id="tuition_model" value={form.tuition_model} onChange={set('tuition_model')} options={TUITION_MODELS} />
            </Field>
            <Field id="has_stripe" label="Do you have a Stripe account?">
              <Choice id="has_stripe" value={form.has_stripe} onChange={set('has_stripe')}
                options={['Yes', 'No', 'Not sure']} />
            </Field>
          </div>
          <Field id="funding_programs" label="Do families use state funds or scholarships?"
            hint="For example: an ESA, a voucher program, or your own scholarships. Name the programs.">
            <input id="funding_programs" className={INPUT_CLASS} value={form.funding_programs}
              onChange={(e) => set('funding_programs')(e.target.value)} maxLength={200} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field id="billing_contact_name" label="Billing contact name" hint="If someone else handles money.">
              <input id="billing_contact_name" className={INPUT_CLASS} value={form.billing_contact_name}
                onChange={(e) => set('billing_contact_name')(e.target.value)} maxLength={120} />
            </Field>
            <Field id="billing_contact_email" label="Billing contact email">
              <input id="billing_contact_email" type="email" className={INPUT_CLASS} value={form.billing_contact_email}
                onChange={(e) => set('billing_contact_email')(e.target.value)} maxLength={200} />
            </Field>
          </div>
        </Section>

        <Section title="Settings" intro="You can change both of these later in your school's settings.">
          <Field id="ai_choice" label="AI tools"
            hint="AI helps teachers write quests and lessons, suggests tasks, and gives students a tutor.">
            <Choice id="ai_choice" value={form.ai_choice} onChange={set('ai_choice')}
              placeholder={null}
              options={[['on', 'Turn them on'], ['off', 'Keep them off for now']]} />
          </Field>
          <Field id="library_choice" label="Quests and courses students can see">
            <Choice id="library_choice" value={form.library_choice} onChange={set('library_choice')}
              placeholder={null}
              options={[['all_optio', "Optio's library and your own"], ['private_only', 'Only the ones your school makes']]} />
          </Field>
        </Section>

        <Section title="Getting started" intro="This helps us plan your first weeks on Optio.">
          <Field id="launch_date" label="When do you want families on Optio?">
            <input id="launch_date" type="date" className={`${INPUT_CLASS} sm:max-w-xs`} value={form.launch_date}
              onChange={(e) => set('launch_date')(e.target.value)} />
          </Field>
          <Field id="referral_source" label="How did you hear about Optio?">
            <input id="referral_source" className={INPUT_CLASS} value={form.referral_source}
              onChange={(e) => set('referral_source')(e.target.value)} maxLength={200} />
          </Field>
          <Field id="notes" label="Anything else we should know?">
            <textarea id="notes" rows={4} className={INPUT_CLASS} value={form.notes}
              onChange={(e) => set('notes')(e.target.value)} maxLength={1500} />
          </Field>
        </Section>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button type="submit" disabled={submitting || inSchool} className="btn-primary disabled:opacity-50">
            {submitting ? 'Setting up your school...' : 'Create my school'}
          </button>
          <p className="text-sm text-gray-500">This makes you the administrator of the new school.</p>
        </div>
      </form>
    </div>
    </Shell>
  )
}

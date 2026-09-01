import React, { useState } from 'react'
import { EyeIcon, EyeSlashIcon, LockClosedIcon, CheckIcon, PhotoIcon } from '@heroicons/react/24/outline'

/**
 * Presentational pieces of the family registration funnel, shared between the
 * live funnel (pages/RegisterFunnelPage.jsx) and the SIS Registration setup
 * editor (components/sis/RegistrationSetupTab.jsx), which renders the funnel
 * exactly as families see it with the configurable parts editable in place.
 *
 * Everything here is stateless chrome — no API calls, no funnel logic — so the
 * editor stays pixel-identical to the real thing by construction, not by
 * copy-paste.
 */

// 'records' only appears for orgs whose funnel collects a school of record
// (credit partners); RegisterFunnelPage filters it out otherwise, the same way
// it drops 'fee' for orgs that charge nothing.
export const STEPS = ['account', 'family', 'details', 'records', 'paperwork', 'fee', 'done']
export const STEP_LABELS = {
  account: 'Account', family: 'Your family', details: 'Contacts & questions',
  records: 'School records', paperwork: 'Paperwork', fee: 'Registration fee',
  done: 'Next steps',
}

// Steps a family can navigate back into to edit; after the fee is settled the
// data is final, so nothing is back-editable from the done step.
export const BACK_EDITABLE = new Set(['family', 'details', 'records', 'paperwork'])
export const POST_FEE_STEPS = new Set(['done'])

export const field = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

export const money = (cents) => `$${((cents || 0) / 100).toFixed(2)}`

// Config URLs saved without a scheme would resolve relative to the Optio origin.
export const absUrl = (v) => {
  const s = (v || '').trim()
  if (!s) return ''
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

export const ageFromDob = (dob, onDate = null) => {
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
export const enrollmentGateFor = (config, dobIso) => {
  const gates = config?.enrollment_age_gates || []
  if (!gates.length || !dobIso) return null
  const age = ageFromDob(dobIso, config?.first_day_of_school)
  if (age == null) return null
  return gates.find((g) =>
    (g.min_age == null || age >= g.min_age) && (g.max_age == null || age <= g.max_age)) || null
}

export const gateBandText = (g) => (g.min_age != null && g.max_age != null
  ? `ages ${g.min_age}–${g.max_age}`
  : g.min_age != null ? `ages ${g.min_age} and up` : `ages ${g.max_age} and under`)

// One org-question input (select / free text / multi checkboxes). Shared by
// the family-level questions and the per-student groups on the details step.
export const QuestionField = ({ q, value, onChange }) => (
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

// Circular photo preview + picker. Photos are required for every family member.
// `busy` shows upload progress and `error` surfaces failures right here.
export const PhotoPicker = ({ label, url, busy, error, onSelect }) => (
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
export const VerticalStepper = ({ step, steps = STEPS, labels = STEP_LABELS, onNavigate, freeNav = false }) => {
  const idx = steps.indexOf(step)
  return (
    <aside className="hidden md:block w-56 shrink-0">
      <nav className="sticky top-8">
        <ol>
          {steps.map((s, i) => {
            const done = i < idx
            const current = i === idx
            // freeNav (preview mode / setup editor): every step is one click away.
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
                        : freeNav ? i + 1 : <LockClosedIcon className="w-3.5 h-3.5" />}
                  </div>
                  <div>
                    <div className={`text-sm font-medium ${current ? 'text-optio-purple' : done ? 'text-neutral-700' : 'text-neutral-400'}`}>
                      {labels[s]}
                    </div>
                    {!freeNav && (
                      <div className="text-[11px] text-neutral-400">
                        {done ? (clickable ? 'Completed — click to edit' : 'Completed') : current ? 'In progress' : 'Locked'}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ol>
        <p className="mt-6 text-xs text-neutral-400 leading-relaxed">
          {freeNav
            ? 'Click any step to view it. Families complete them in order.'
            : 'Steps must be completed in order. All steps are required to finish registration.'}
        </p>
      </nav>
    </aside>
  )
}

// Compact horizontal stepper for small screens. Completed steps are tappable
// to go back and edit.
export const MobileStepper = ({ step, steps = STEPS, labels = STEP_LABELS, onNavigate, freeNav = false }) => {
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
        Step {idx + 1} of {steps.length}: {labels[step]} — all steps are required, in order. Tap a completed step to edit it.
      </p>
    </div>
  )
}

export const Section = ({ title, subtitle, children }) => (
  <section className="bg-white rounded-xl border border-gray-200 p-6">
    <h2 className="text-lg font-semibold text-neutral-900 mb-1">{title}</h2>
    {subtitle && <p className="text-sm text-neutral-500 mb-4">{subtitle}</p>}
    {!subtitle && <div className="mb-3" />}
    {children}
  </section>
)

export const PasswordInput = ({ value, onChange, onKeyDown }) => {
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

export const PrimaryButton = ({ onClick, disabled, children }) => (
  <button onClick={onClick} disabled={disabled}
    className="w-full py-3 rounded-full bg-gradient-primary text-white font-semibold hover:opacity-90 disabled:opacity-50">
    {children}
  </button>
)

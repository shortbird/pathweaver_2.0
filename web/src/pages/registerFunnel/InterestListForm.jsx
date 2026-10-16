// "Join the waitlist": the door on the registration link for families who are
// not ready to register or pay (Apogee NoCo, 2026-10-16: pre-K families asking
// about kindergarten next year). No account, no fee -- the parent's contact
// details and each child's first name and birthday go on the school's
// interest list (backend/services/sis_interest_list_service.py), and the
// school emails the registration link when it has room.
//
// Shown only when the school turned the list on
// (config.interest_list.enabled). In preview mode nothing is sent.
import React, { useState } from 'react'
import { joinInterestList } from '../../hooks/api/useSisInterestList'
import { field, Section, PrimaryButton } from '../../components/registration/funnelUi'

const emptyChild = () => ({ _key: `${Date.now()}-${Math.random()}`, first_name: '', dob: '' })

const label = 'block text-xs font-medium text-neutral-500 mb-1'

const InterestListForm = ({ code, org, listLabel, previewMode, onBack }) => {
  const [form, setForm] = useState({
    parent_first_name: '', parent_last_name: '', email: '', phone: '', interest: '', notes: '',
    // Honeypot: hidden from people, filled in by form bots. The server answers
    // success and writes nothing when it has a value.
    website: '',
  })
  const [children, setChildren] = useState([emptyChild()])
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setChild = (i, patch) => setChildren((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const forWhat = listLabel ? ` for ${listLabel}` : ''

  const submit = async () => {
    setError('')
    if (!form.parent_first_name.trim() || !form.parent_last_name.trim()) return setError('Enter your first and last name.')
    if (!form.email.trim()) return setError('Enter your email address.')
    const kids = children.filter((c) => c.first_name.trim() || c.dob)
    if (!kids.length) return setError('Add at least one child.')
    const missing = kids.find((c) => !c.first_name.trim() || !c.dob)
    if (missing) return setError(missing.first_name.trim()
      ? `Enter ${missing.first_name.trim()}'s date of birth.`
      : "Enter each child's first name.")
    if (previewMode) { setDone(true); return }
    setSending(true)
    try {
      await joinInterestList(code, {
        ...form,
        children: kids.map(({ first_name, dob }) => ({ first_name: first_name.trim(), dob })),
      })
      setDone(true)
    } catch (e) {
      setError(e.response?.data?.error || 'We could not add you to the waitlist. Please try again.')
    } finally {
      setSending(false)
    }
  }

  if (done) {
    return (
      <Section title="You are on the waitlist">
        <p className="text-sm text-neutral-700">
          Thank you. {org.name || 'The school'} has your family on its waitlist{forWhat}.
        </p>
        <p className="text-sm text-neutral-700 mt-3">
          {previewMode
            ? 'Preview mode: nothing was saved and no email was sent.'
            : `We sent a confirmation to ${form.email.trim()}. When a spot is ready, the school will email you a link to register.`}
        </p>
        <button onClick={onBack} className="mt-5 text-sm text-optio-purple font-medium hover:underline">
          Back to registration
        </button>
      </Section>
    )
  }

  return (
    <div className="space-y-6">
      <Section title={`Join the waitlist${forWhat}`}
        subtitle={`Not ready to register yet? Tell ${org.name || 'the school'} about your family. You do not need an account, and you pay nothing now. The school will email you when it is time to register.`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label htmlFor="il-first" className={label}>Your first name</label>
            <input id="il-first" className={field} value={form.parent_first_name} onChange={set('parent_first_name')} autoComplete="given-name" /></div>
          <div><label htmlFor="il-last" className={label}>Your last name</label>
            <input id="il-last" className={field} value={form.parent_last_name} onChange={set('parent_last_name')} autoComplete="family-name" /></div>
          <div><label htmlFor="il-email" className={label}>Email</label>
            <input id="il-email" type="email" className={field} value={form.email} onChange={set('email')} autoComplete="email" /></div>
          <div><label htmlFor="il-phone" className={label}>Phone (optional)</label>
            <input id="il-phone" type="tel" className={field} value={form.phone} onChange={set('phone')} autoComplete="tel" /></div>
        </div>

        {/* Off-screen rather than display:none: some bots skip hidden inputs. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
          <label htmlFor="il-website">Website</label>
          <input id="il-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
        </div>

        <h3 className="text-sm font-semibold text-neutral-800 mt-6 mb-2">Your children</h3>
        <div className="space-y-3">
          {children.map((c, i) => (
            <div key={c._key} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end rounded-lg border border-gray-200 p-3">
              <div><label htmlFor={`il-child-${i}`} className={label}>Child's first name</label>
                <input id={`il-child-${i}`} className={field} value={c.first_name} onChange={(e) => setChild(i, { first_name: e.target.value })} /></div>
              <div><label htmlFor={`il-dob-${i}`} className={label}>Date of birth</label>
                <input id={`il-dob-${i}`} type="date" className={field} value={c.dob} onChange={(e) => setChild(i, { dob: e.target.value })} /></div>
              {children.length > 1 ? (
                <button type="button" onClick={() => setChildren((cs) => cs.filter((_, j) => j !== i))}
                  className="text-sm text-neutral-500 hover:text-red-600 py-2.5">
                  Remove
                </button>
              ) : <span />}
            </div>
          ))}
        </div>
        {children.length < 8 && (
          <button type="button" onClick={() => setChildren((cs) => [...cs, emptyChild()])}
            className="mt-3 text-sm text-optio-purple font-medium hover:underline">
            + Add another child
          </button>
        )}

        <div className="mt-6 space-y-4">
          <div><label htmlFor="il-interest" className={label}>Which grade or program are you interested in? (optional)</label>
            <input id="il-interest" className={field} value={form.interest} onChange={set('interest')}
              placeholder={listLabel ? `For example: Kindergarten, ${listLabel}` : 'For example: Kindergarten next fall'} /></div>
          <div><label htmlFor="il-notes" className={label}>Anything else the school should know? (optional)</label>
            <textarea id="il-notes" rows={3} className={field} value={form.notes} onChange={set('notes')} /></div>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}
      </Section>

      <PrimaryButton onClick={submit} disabled={sending}>
        {sending ? 'One moment…' : 'Join the waitlist'}
      </PrimaryButton>
      <div className="text-center">
        <button onClick={onBack} className="text-sm text-neutral-500 hover:text-optio-purple">
          Ready to register now? Go back
        </button>
      </div>
    </div>
  )
}

export default InterestListForm

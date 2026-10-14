import React, { useState } from 'react'

import Button from '../../../components/ui/Button'
import { INPUT_CLASS } from '../../../components/ui/Input'
import { sisPeopleApi } from '../../../hooks/api/useSisPeople'
import { ageFromDob } from '../../../utils/age'
import ConnectRequestPrompt, { isConnectable } from './ConnectRequestPrompt'

/**
 * "A family" in the People page's + Add wizard: the parents and the children
 * together, then a review, then one request (POST /api/sis/families).
 *
 * The old "+ Add > Family" made an empty household with a name, and the office
 * then added each person on the family record, one dialog at a time. This
 * asks for the whole family at once. The backend refuses anything it can
 * before the household exists, so a typo never leaves an empty family behind.
 *
 * Children: under 13 is a profile the parent manages (no email, no login);
 * 13 and up gets their own login and needs their own email. The backend makes
 * that split (family_student_service.create_child); this form only says which
 * is about to happen.
 */

const blankParent = () => ({ first_name: '', last_name: '', email: '' })
const blankChild = () => ({ first_name: '', last_name: '', date_of_birth: '', email: '' })

const childSummary = (child) => {
  const age = ageFromDob(child.date_of_birth)
  if (age == null) return ''
  return age >= 13
    ? `Age ${age}: their own login at ${child.email || '(email needed)'}`
    : `Age ${age}: a profile their parent manages, no login`
}

const Field = ({ label, children }) => (
  <label className="block text-xs font-medium text-neutral-600">
    {label}
    <div className="mt-0.5">{children}</div>
  </label>
)

const PersonFields = ({ person, onChange, withEmail = true, withDob = false }) => {
  const set = (k) => (e) => onChange({ ...person, [k]: e.target.value })
  const age = withDob ? ageFromDob(person.date_of_birth) : null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <Field label="First name"><input className={INPUT_CLASS} value={person.first_name} onChange={set('first_name')} /></Field>
      <Field label="Last name"><input className={INPUT_CLASS} value={person.last_name} onChange={set('last_name')} /></Field>
      {withDob && (
        <Field label="Date of birth"><input type="date" className={INPUT_CLASS} value={person.date_of_birth} onChange={set('date_of_birth')} /></Field>
      )}
      {(withEmail || (age != null && age >= 13)) && (
        <Field label={withDob ? 'Their own email' : 'Email'}>
          <input type="email" className={INPUT_CLASS} value={person.email} onChange={set('email')} />
        </Field>
      )}
      {withDob && age != null && (
        <p className="sm:col-span-2 text-xs text-neutral-500">{childSummary(person)}</p>
      )}
    </div>
  )
}

export default function AddFamilyForm({ orgId, onBack, onDone, onCreated, onOpenFamily }) {
  const [parents, setParents] = useState([blankParent()])
  const [children, setChildren] = useState([blankChild()])
  const [familyName, setFamilyName] = useState('')
  const [sendEmails, setSendEmails] = useState(true)
  const [step, setStep] = useState('form') // 'form' | 'review' | 'done'
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  // An email with a platform account: offer "Ask to connect" (ticket af8469aa).
  const [connect, setConnect] = useState(null)

  const filledChildren = children.filter((c) => c.first_name.trim() || c.last_name.trim() || c.date_of_birth)
  const defaultName = parents[0].last_name.trim() ? `${parents[0].last_name.trim()} Family` : ''
  const name = familyName.trim() || defaultName

  const setParent = (i) => (p) => setParents((prev) => prev.map((x, j) => (j === i ? p : x)))
  const setChild = (i) => (c) => setChildren((prev) => prev.map((x, j) => (j === i ? c : x)))

  // The same checks the backend makes, asked here so the review step only
  // shows a family that can be created.
  const problem = () => {
    for (const p of parents) {
      if (!p.first_name.trim() || !p.last_name.trim()) return 'Each parent needs a first and last name'
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email.trim())) return 'Each parent needs a valid email address'
    }
    for (const c of filledChildren) {
      if (!c.first_name.trim() || !c.last_name.trim()) return 'Each child needs a first and last name'
      const age = ageFromDob(c.date_of_birth)
      if (age == null) return `${c.first_name || 'Each child'} needs a date of birth`
      if (age >= 13 && !c.email.trim()) return `${c.first_name} is 13 or older and needs their own email`
    }
    return ''
  }

  const review = () => {
    const why = problem()
    setError(why)
    if (!why) setStep('review')
  }

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      const { data } = await sisPeopleApi.createFamily(orgId, {
        name,
        guardians: parents.map((p) => ({ ...p, email: p.email.trim() })),
        children: filledChildren.map((c) => ({
          ...c, email: ageFromDob(c.date_of_birth) >= 13 ? c.email.trim() : '',
        })),
        send_emails: sendEmails,
      })
      setResult(data)
      setStep('done')
      onCreated?.()
    } catch (e) {
      const d = e?.response?.data
      setError(d?.error || 'Could not create the family')
      setConnect(isConnectable(d) ? d.connect : null)
      setStep('form')
    } finally {
      setSaving(false)
    }
  }

  if (step === 'done' && result) {
    const people = [...(result.guardians || []), ...(result.children || [])]
    return (
      <div className="space-y-4">
        <p className="text-sm text-neutral-700">
          <span className="font-semibold">{result.household?.name}</span> is ready.
        </p>
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
          {people.map((p) => (
            <li key={p.name} className="px-3 py-2 flex justify-between gap-2">
              <span>{p.name}</span>
              <span className="text-xs text-neutral-500">
                {p.kind === 'dependent' ? 'Managed by their parent'
                  : p.kind === 'connected' ? 'Already had an account here'
                  : p.invite_sent ? 'Setup email sent' : 'No email sent yet'}
              </span>
            </li>
          ))}
        </ul>
        {result.problems?.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
            Not added: {result.problems.map((p) => `${p.name} (${p.error})`).join('; ')}. Open the
            family to add them.
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenFamily?.(result.household?.id)}>Open family</Button>
          <Button size="sm" onClick={onDone || onBack}>Done</Button>
        </div>
      </div>
    )
  }

  if (step === 'review') {
    return (
      <div className="space-y-4 text-sm">
        <div>
          <h3 className="font-semibold text-neutral-900">{name}</h3>
          <p className="text-xs text-neutral-500">This makes one family with these people in it.</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 mb-1">Parents</p>
          <ul className="space-y-1">
            {parents.map((p) => (
              <li key={p.email}>{p.first_name} {p.last_name} <span className="text-neutral-500">{p.email}</span></li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 mb-1">Children</p>
          {filledChildren.length ? (
            <ul className="space-y-1">
              {filledChildren.map((c, i) => (
                <li key={i}>{c.first_name} {c.last_name} <span className="text-neutral-500">{childSummary(c)}</span></li>
              ))}
            </ul>
          ) : <p className="text-neutral-500">None yet. You can add them on the family later.</p>}
        </div>
        <p className="text-neutral-700">
          {sendEmails
            ? 'Each new account gets an email with a link to set a password.'
            : 'No emails go out now. Use "Send setup email" on People when you are ready.'}
        </p>
        {error && <p className="text-red-600" role="alert">{error}</p>}
        <div className="flex justify-between gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setStep('form')} disabled={saving}>Edit</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? 'Creating…' : 'Create family'}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-sm font-semibold text-neutral-900 mb-2">Parents</h3>
        <div className="space-y-3">
          {parents.map((p, i) => (
            <div key={i} className="rounded-lg border border-gray-200 p-3">
              {parents.length > 1 && (
                <div className="flex justify-between mb-1 text-xs text-neutral-500">
                  <span>{i === 0 ? 'Primary contact' : 'Second parent'}</span>
                  {i > 0 && (
                    <button type="button" className="hover:underline"
                      onClick={() => setParents((prev) => prev.slice(0, 1))}>Remove</button>
                  )}
                </div>
              )}
              <PersonFields person={p} onChange={setParent(i)} />
            </div>
          ))}
        </div>
        {parents.length < 2 && (
          <button type="button" className="mt-2 text-sm text-optio-purple hover:underline"
            onClick={() => setParents((prev) => [...prev, blankParent()])}>+ Add a second parent</button>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-neutral-900 mb-2">Children</h3>
        <div className="space-y-3">
          {children.map((c, i) => (
            <div key={i} className="rounded-lg border border-gray-200 p-3">
              {children.length > 1 && (
                <div className="flex justify-end mb-1 text-xs text-neutral-500">
                  <button type="button" className="hover:underline"
                    onClick={() => setChildren((prev) => prev.filter((_, j) => j !== i))}>Remove</button>
                </div>
              )}
              <PersonFields person={c} onChange={setChild(i)} withEmail={false} withDob />
            </div>
          ))}
        </div>
        <button type="button" className="mt-2 text-sm text-optio-purple hover:underline"
          onClick={() => setChildren((prev) => [...prev, blankChild()])}>+ Add another child</button>
      </section>

      <section className="space-y-3">
        <Field label="Family name">
          <input className={INPUT_CLASS} value={familyName} placeholder={defaultName || 'Watson Family'}
            onChange={(e) => setFamilyName(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={sendEmails} onChange={(e) => setSendEmails(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
          Email each new account a link to set their password now
        </label>
      </section>

      {connect ? (
        <ConnectRequestPrompt connect={connect} orgId={orgId} onClose={() => { setConnect(null); setError('') }} />
      ) : error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <div className="flex justify-between gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>Back</Button>
        <Button size="sm" onClick={review}>Review</Button>
      </div>
    </div>
  )
}

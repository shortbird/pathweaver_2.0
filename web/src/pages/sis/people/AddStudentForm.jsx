import React, { useState } from 'react'
import { toast } from 'react-hot-toast'

import Button from '../../../components/ui/Button'
import { INPUT_CLASS } from '../../../components/ui/Input'
import SearchSelect from '../../../components/ui/SearchSelect'
import { sisFamilyApi } from '../../../hooks/api/useSisFamilyDetail'
import { sisPeopleApi } from '../../../hooks/api/useSisPeople'
import { useSisHouseholds } from '../../../hooks/api/useSisHouseholds'
import { getLearningOrigin } from '../../../utils/appSurface'
import AddChildForm from '../familyDetail/AddChildForm'

/**
 * "A student" in the People page's + Add wizard: one child, usually into a
 * family the school already has (the sibling who comes late).
 *
 * Two ways in, because schools do both:
 *  - Through the family: the family record's own "Add a child" form. Under 13
 *    is a profile the parent manages; 13 and up gets their own login by email.
 *  - Username and password: a login with no email, which young students at
 *    several schools use on a shared computer. The password is shown once.
 *    With a family chosen, the student joins it afterwards.
 */

export default function AddStudentForm({ orgId, onBack, onDone, onCreated }) {
  const { data } = useSisHouseholds(orgId)
  const households = data?.households || []
  const [householdId, setHouseholdId] = useState('')
  const [method, setMethod] = useState('family') // 'family' | 'username'
  const [form, setForm] = useState({ first_name: '', last_name: '', username: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [credentials, setCredentials] = useState(null)

  // No family means no parent to manage the profile: username is the only way.
  const effectiveMethod = householdId ? method : 'username'
  const set = (k) => (e) => setForm({ ...form, [k]: k === 'username' ? e.target.value.toLowerCase() : e.target.value })

  const createUsername = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) { setError('First and last name are required'); return }
    if (!form.username.trim()) { setError('Username is required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await sisPeopleApi.createUsernameStudent(orgId, {
        username: form.username.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
      })
      const creds = res.data.login_credentials
      const studentId = res.data.user?.id || res.data.user_id
      let joined = false
      if (householdId && studentId) {
        try {
          await sisFamilyApi.addMember(householdId, {
            user_id: studentId, relationship: 'student', confirm_duplicate: true, organization_id: orgId,
          })
          joined = true
        } catch {
          toast.error('The login was made, but joining the family failed. Add them from the family record.')
        }
      }
      setCredentials({
        name: `${form.first_name.trim()} ${form.last_name.trim()}`,
        username: creds.username,
        password: creds.password,
        loginUrl: `${getLearningOrigin()}${creds.login_url}`,
        joined,
      })
      onCreated?.()
    } catch (e) {
      const d = e?.response?.data
      setError(d?.error || d?.message || 'Could not create the student')
    } finally {
      setSaving(false)
    }
  }

  const copyCredentials = () => {
    navigator.clipboard.writeText(`Login for ${credentials.name}\n\nLogin URL: ${credentials.loginUrl}\n`
      + `Username: ${credentials.username}\nPassword: ${credentials.password}`)
    toast.success('Copied')
  }

  if (credentials) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-neutral-700">
          {credentials.name} can sign in now{credentials.joined ? ', and is in the family' : ''}.
        </p>
        <dl className="rounded-lg bg-neutral-50 p-4 space-y-2 text-sm">
          <div><dt className="text-xs text-neutral-500">Login URL</dt><dd className="break-all text-optio-purple">{credentials.loginUrl}</dd></div>
          <div><dt className="text-xs text-neutral-500">Username</dt><dd className="font-mono">{credentials.username}</dd></div>
          <div><dt className="text-xs text-neutral-500">Password</dt><dd className="font-mono">{credentials.password}</dd></div>
        </dl>
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          Copy this now. The password is not shown again, but you can reset it later.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={copyCredentials}>Copy all</Button>
          <Button size="sm" onClick={onDone || onBack}>Done</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Family</label>
        <SearchSelect
          value={householdId}
          onChange={setHouseholdId}
          options={households}
          getId={(h) => h.id}
          getLabel={(h) => h.name || 'Unnamed family'}
          placeholder="Search families"
          emptyLabel="No family here"
        />
        <p className="text-xs text-neutral-500 mt-1">
          A new family with parents? Go back and choose &ldquo;A family&rdquo;.
        </p>
      </div>

      {householdId && (
        <fieldset>
          <legend className="block text-sm font-medium text-neutral-700 mb-1">How will they sign in?</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { key: 'family', title: 'Through the family', sub: 'Under 13: the parent manages it. 13+: their own email.' },
              { key: 'username', title: 'Username and password', sub: 'No email. You get the password to share.' },
            ].map((m) => (
              <label key={m.key} className={`rounded-lg border px-3 py-2 cursor-pointer ${
                method === m.key ? 'border-optio-purple bg-optio-purple/5' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input type="radio" name="student-signin" className="sr-only" checked={method === m.key}
                  onChange={() => setMethod(m.key)} />
                <span className="block text-sm font-medium">{m.title}</span>
                <span className="block text-xs text-neutral-500">{m.sub}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {effectiveMethod === 'family' ? (
        <AddChildForm householdId={householdId} orgId={orgId}
          onDone={() => { onCreated?.(); (onDone || onBack)() }} onCancel={onBack} />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-neutral-600">First name
              <input className={`${INPUT_CLASS} mt-0.5`} value={form.first_name} onChange={set('first_name')} />
            </label>
            <label className="block text-xs font-medium text-neutral-600">Last name
              <input className={`${INPUT_CLASS} mt-0.5`} value={form.last_name} onChange={set('last_name')} />
            </label>
          </div>
          <label className="block text-xs font-medium text-neutral-600">Username
            <input className={`${INPUT_CLASS} mt-0.5`} value={form.username} onChange={set('username')} placeholder="ava.watson" />
          </label>
          <p className="text-xs text-neutral-500">
            We make a simple password. Letters, numbers, dots, underscores and hyphens only.
          </p>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex justify-between gap-2">
            <Button variant="outline" size="sm" onClick={onBack}>Back</Button>
            <Button size="sm" onClick={createUsername} disabled={saving}>
              {saving ? 'Creating…' : 'Create student'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

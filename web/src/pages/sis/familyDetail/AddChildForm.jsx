import React, { useState } from 'react'
import { toast } from 'react-hot-toast'

import Button from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { useConfirm } from '../../../contexts/ConfirmContext'
import { sisFamilyApi } from '../../../hooks/api/useSisFamilyDetail'

/**
 * Add a child the family has no Optio account for yet.
 *
 * The Members section's other door connects an account that already exists.
 * Neither door reached the common case: a family who left a child off their
 * registration, since the funnel refuses a completed one and nothing in the
 * console could make an account (iCreate, 2026-09-18 — "Is there a way to add
 * a person manually on our end?").
 *
 * The age split is the backend's, not this form's: under 13 becomes a profile
 * the parent manages, 13+ gets their own login and an email. The form only
 * says which is about to happen, so nobody is surprised by an email going out
 * — or by one not going out.
 */
const AddChildForm = ({ householdId, orgId, onDone, onCancel }) => {
  const confirm = useConfirm()
  const [form, setForm] = useState({ first_name: '', last_name: '', date_of_birth: '', email: '' })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  // Whole years today, the question this form actually asks ("does this child
  // get their own login?"). School-year age lives on the backend and decides
  // nothing here.
  const age = (() => {
    const dob = new Date(form.date_of_birth)
    if (!form.date_of_birth || Number.isNaN(dob.getTime())) return null
    const now = new Date()
    let years = now.getFullYear() - dob.getFullYear()
    const before = now.getMonth() < dob.getMonth()
      || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())
    if (before) years -= 1
    return years
  })()
  const needsEmail = age != null && age >= 13

  const submit = async (confirmDuplicate = false) => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error('First and last name are required'); return
    }
    if (!form.date_of_birth) { toast.error('Date of birth is required'); return }
    if (needsEmail && !form.email.trim()) {
      toast.error('A child 13 or older needs their own email to have a login'); return
    }
    setSaving(true)
    try {
      const { data } = await sisFamilyApi.addChild(householdId, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        date_of_birth: form.date_of_birth,
        email: needsEmail ? form.email.trim() : '',
        organization_id: orgId,
        ...(confirmDuplicate ? { confirm_duplicate: true } : {}),
      })
      toast.success(data?.kind === 'student'
        ? `${form.first_name} was added — we emailed them a link to set a password.`
        : `${form.first_name} was added to the family.`)
      onDone?.()
    } catch (e) {
      const d = e?.response?.data
      // Looks like a child already in this family — the same prompt the
      // connect-an-account door gives, asked before anything is created.
      if (d?.needs_confirmation && !confirmDuplicate) {
        setSaving(false)
        if (await confirm(d.error)) return submit(true)
        return
      }
      toast.error(d?.error || 'Could not add the child')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-gray-200 p-3">
      <div className="flex gap-2">
        <Input value={form.first_name} onChange={set('first_name')} placeholder="First name" />
        <Input value={form.last_name} onChange={set('last_name')} placeholder="Last name" />
      </div>
      <label className="block text-xs text-neutral-500">
        Date of birth
        <Input type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
      </label>
      {needsEmail && (
        <Input type="email" value={form.email} onChange={set('email')}
          placeholder="Their own email address" />
      )}
      {age != null && (
        <p className="text-xs text-neutral-500">
          {needsEmail
            ? `Age ${age}: they get their own Optio login, and we email them a link to set a password.`
            : `Age ${age}: a profile their parent manages — no email, no login of their own.`}
        </p>
      )}
      <div className="flex gap-2 items-center">
        <Button size="sm" onClick={() => submit()} disabled={saving}>
          {saving ? 'Adding…' : 'Add child'}
        </Button>
        <button onClick={onCancel} className="text-sm text-neutral-500 hover:underline">Cancel</button>
      </div>
    </div>
  )
}

export default AddChildForm

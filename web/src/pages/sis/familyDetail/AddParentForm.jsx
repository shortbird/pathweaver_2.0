import React, { useState } from 'react'
import { toast } from 'react-hot-toast'

import Button from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { sisFamilyApi } from '../../../hooks/api/useSisFamilyDetail'

/**
 * Add a parent the family has no Optio account for yet — typically the second
 * parent in a family that registered under one login.
 *
 * "+ Add member" only connects people the school already has, so until
 * 2026-09-30 an office asked to add a father had to email Optio (iCreate,
 * Andrew Larson). The backend makes the account, puts it in this family with
 * links to every child, and emails a set-your-password link. An adult who is
 * already at the school is connected instead, with no email.
 */
const AddParentForm = ({ householdId, orgId, onDone, onCancel }) => {
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '' })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error('First and last name are required'); return
    }
    if (!form.email.trim()) { toast.error('An email address is required'); return }
    setSaving(true)
    try {
      const { data } = await sisFamilyApi.addGuardian(householdId, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        organization_id: orgId,
      })
      if (data?.kind === 'connected') {
        toast.success(`${form.first_name} already had an account and is now in this family.`)
      } else if (data?.invite_sent) {
        toast.success(`${form.first_name} was added. We emailed them a link to set a password.`)
      } else {
        toast.success(`${form.first_name} was added, but the email did not send. They can use "Forgot password" on the login page.`)
      }
      onDone?.()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not add the parent')
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
      <Input type="email" value={form.email} onChange={set('email')} placeholder="Their email address" />
      <p className="text-xs text-neutral-500">
        They get their own login, connected to every child in this family. We email them a link to set a password.
      </p>
      <div className="flex gap-2 items-center">
        <Button size="sm" onClick={submit} disabled={saving}>
          {saving ? 'Adding…' : 'Add parent'}
        </Button>
        <button onClick={onCancel} className="text-sm text-neutral-500 hover:underline">Cancel</button>
      </div>
    </div>
  )
}

export default AddParentForm

import React, { useState, memo } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { Modal, Alert, FormFooter } from '../ui'

// Mirrors services/account_invite_service.py. superadmin is deliberately not
// offered; the backend refuses it too.
const PLATFORM_ROLES = [
  ['student', 'Student'],
  ['parent', 'Parent'],
  ['advisor', 'Advisor'],
  ['observer', 'Observer'],
]
const ORG_ROLES = [
  ...PLATFORM_ROLES,
  ['org_admin', 'Org admin'],
  ['campus_coordinator', 'Campus coordinator'],
]

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple min-h-[44px]'

/**
 * Create an account by email (superadmin). The account and its role exist as
 * soon as this saves; the email lets the person sign in with Google, Apple, or
 * a password of their choosing.
 */
const CreateAccountModal = ({ organizations = [], onClose, onCreated }) => {
  const [form, setForm] = useState({
    email: '', first_name: '', last_name: '', role: 'student', organization_id: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const roles = form.organization_id ? ORG_ROLES : PLATFORM_ROLES
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const onOrgChange = (e) => {
    const organization_id = e.target.value
    setForm((f) => ({
      ...f,
      organization_id,
      // An org-only role makes no sense once the org is cleared.
      role: !organization_id && !PLATFORM_ROLES.some(([r]) => r === f.role) ? 'student' : f.role,
    }))
  }

  const submit = async () => {
    if (!form.email.trim()) {
      setError('Enter an email address')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await api.post('/api/admin/users/create-by-email', {
        ...form,
        organization_id: form.organization_id || null,
      })
      if (res.data.email_sent) {
        toast.success(res.data.message)
      } else {
        toast.error(res.data.message, { duration: 8000 })
      }
      onCreated?.()
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create the account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Create Account"
      size="md"
      footer={
        <FormFooter
          onCancel={onClose}
          onSubmit={submit}
          cancelText="Cancel"
          submitText={saving ? 'Creating...' : 'Create and Send Email'}
          isSubmitting={saving}
        />
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          They get an email to finish setup. They can sign in with Google, Apple, or a
          password, and the role you pick here is active from their first sign-in.
        </p>

        {error && <Alert variant="error">{error}</Alert>}

        <div>
          <label htmlFor="ca-email" className="block text-sm font-medium text-gray-700 mb-2">Email</label>
          <input id="ca-email" type="email" value={form.email} onChange={set('email')}
            className={inputClass} placeholder="name@example.com" autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="ca-first" className="block text-sm font-medium text-gray-700 mb-2">
              First name <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input id="ca-first" type="text" value={form.first_name} onChange={set('first_name')} className={inputClass} />
          </div>
          <div>
            <label htmlFor="ca-last" className="block text-sm font-medium text-gray-700 mb-2">
              Last name <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input id="ca-last" type="text" value={form.last_name} onChange={set('last_name')} className={inputClass} />
          </div>
        </div>

        <div>
          <label htmlFor="ca-org" className="block text-sm font-medium text-gray-700 mb-2">Organization</label>
          <select id="ca-org" value={form.organization_id} onChange={onOrgChange} className={inputClass}>
            <option value="">None (platform account)</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="ca-role" className="block text-sm font-medium text-gray-700 mb-2">Role</label>
          <select id="ca-role" value={form.role} onChange={set('role')} className={inputClass}>
            {roles.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  )
}

export default memo(CreateAccountModal)

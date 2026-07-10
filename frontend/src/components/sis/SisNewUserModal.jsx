import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import ModalOverlay from '../ui/ModalOverlay'

/**
 * Add any type of user to the organization from the SIS Users page.
 *
 * Two methods, mirroring the existing org-admin tooling:
 *  - "Create now": a username + auto-generated password account (no email
 *    needed) via /users/create-username. Available for student/parent/advisor/
 *    observer. Students can be linked to the creating admin as their parent.
 *  - "Invite by email": an email invitation via /invitations. Available for all
 *    roles, and the ONLY way to add another org admin.
 */

const ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'parent', label: 'Parent' },
  { value: 'advisor', label: 'Teacher' },
  { value: 'org_admin', label: 'Org Admin' },
  { value: 'observer', label: 'Observer' },
]

// Roles that support immediate username+password creation (no email).
const CREATE_NOW_ROLES = new Set(['student', 'parent', 'advisor', 'observer'])

export default function SisNewUserModal({ orgId, onClose, onCreated }) {
  const [role, setRole] = useState('student')
  const [method, setMethod] = useState('create') // 'create' | 'invite'
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    username: '',
    email: '',
    name: '',
    link_to_me: false,
    send_email: true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [credentials, setCredentials] = useState(null)

  // Org admins can only be added by invitation.
  const canCreateNow = CREATE_NOW_ROLES.has(role)
  const effectiveMethod = canCreateNow ? method : 'invite'
  const roleLabel = ROLES.find((r) => r.value === role)?.label || 'User'

  const update = (patch) => setForm((f) => ({ ...f, ...patch }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (effectiveMethod === 'create') {
      if (!form.first_name.trim()) return setError('First name is required')
      if (!form.last_name.trim()) return setError('Last name is required')
      if (!form.username.trim()) return setError('Username is required')
    } else if (!form.email.trim()) {
      return setError('Email is required')
    }

    setLoading(true)
    try {
      if (effectiveMethod === 'create') {
        const res = await api.post(`/api/admin/organizations/${orgId}/users/create-username`, {
          username: form.username.trim().toLowerCase(),
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          org_role: role,
          link_to_me: role === 'student' ? form.link_to_me : false,
        })
        const creds = res.data.login_credentials
        setCredentials({
          name: `${form.first_name} ${form.last_name}`.trim(),
          username: creds.username,
          password: creds.password,
          loginUrl: `${window.location.origin}${creds.login_url}`,
          linkedToParent: res.data.linked_to_parent === true,
        })
      } else {
        const res = await api.post(`/api/admin/organizations/${orgId}/invitations`, {
          email: form.email.trim(),
          name: form.name.trim(),
          role,
          send_email: form.send_email,
        })
        if (res.data?.success === false) {
          setError(res.data.error || 'Failed to send invitation')
        } else {
          toast.success(
            form.send_email
              ? `Invitation emailed to ${form.email.trim()}`
              : `Invitation created for ${form.email.trim()}`
          )
          onCreated?.()
          onClose()
        }
      }
    } catch (err) {
      const data = err.response?.data?.error || err.response?.data?.message || err.response?.data
      setError(typeof data === 'string' ? data : data?.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const copyCredentials = () => {
    const text = `Login credentials for ${credentials.name}\n\n`
      + `Login URL: ${credentials.loginUrl}\n`
      + `Username: ${credentials.username}\n`
      + `Password: ${credentials.password}\n\n`
      + 'Please keep this information secure.'
    navigator.clipboard.writeText(text)
    toast.success('Credentials copied')
  }

  const handleDone = () => {
    onCreated?.()
    onClose()
  }

  // Dismissing (backdrop/Esc/X) after an account was created should still refresh
  // the roster so the new user appears.
  const dismiss = () => {
    if (credentials) onCreated?.()
    onClose()
  }

  // ── Credentials screen (after a "create now" account) ───────────────────────
  if (credentials) {
    return (
      <Overlay onClose={dismiss}>
        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-neutral-900">{roleLabel} created</h2>
          <p className="text-neutral-600 mt-1">Share these login credentials with the user.</p>
        </div>

        {credentials.linkedToParent && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-green-800">
              Linked to your account. You can follow {credentials.name}'s progress from your parent view.
            </p>
          </div>
        )}

        <div className="bg-neutral-50 rounded-lg p-4 space-y-3 mb-6">
          <Field label="Name" value={credentials.name} />
          <Field label="Login URL" value={credentials.loginUrl} valueClass="text-optio-purple break-all" />
          <Field label="Username" value={credentials.username} mono />
          <Field label="Password" value={credentials.password} mono />
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6">
          <p className="text-sm text-yellow-800">
            <strong>Important:</strong> Save or copy these now. You can reset the password later, but this
            password won't be shown again.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={copyCredentials}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 font-medium"
          >
            Copy all
          </button>
          <button
            onClick={handleDone}
            className="flex-1 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 font-medium"
          >
            Done
          </button>
        </div>
      </Overlay>
    )
  }

  // ── New-user form ───────────────────────────────────────────────────────────
  return (
    <Overlay onClose={dismiss}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-neutral-900">New User</h2>
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100" aria-label="Close">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
          >
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        {/* Method toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">How to add them</label>
          <div className="grid grid-cols-2 gap-2">
            <MethodButton
              active={effectiveMethod === 'create'}
              disabled={!canCreateNow}
              onClick={() => setMethod('create')}
              title="Create now"
              subtitle="Username + password"
            />
            <MethodButton
              active={effectiveMethod === 'invite'}
              onClick={() => setMethod('invite')}
              title="Invite by email"
              subtitle="Send a sign-up link"
            />
          </div>
          {!canCreateNow && (
            <p className="text-xs text-gray-500 mt-1">Org admins can only be added by email invitation.</p>
          )}
        </div>

        {effectiveMethod === 'create' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">First Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.first_name}
                  onChange={(e) => update({ first_name: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                  placeholder="John"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Last Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={(e) => update({ last_name: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                  placeholder="Doe"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Username <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => update({ username: e.target.value.toLowerCase() })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                placeholder="john.doe"
              />
              <p className="text-xs text-gray-500 mt-1">
                A simple password is generated automatically. Letters, numbers, dots, underscores, and hyphens only.
              </p>
            </div>

            {role === 'student' && (
              <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={form.link_to_me}
                  onChange={(e) => update({ link_to_me: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple/20"
                />
                <span className="text-sm text-gray-700">
                  <span className="font-medium">This student is my own child.</span> Link them to my account so I can follow their progress as a parent.
                </span>
              </label>
            )}
          </>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Email Address <span className="text-red-500">*</span></label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update({ email: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                placeholder="user@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Name <span className="text-gray-400">(optional)</span></label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update({ name: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                placeholder="John Doe"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.send_email}
                onChange={(e) => update({ send_email: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
              />
              Send the invitation email now
            </label>
          </>
        )}

        {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 font-medium">
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-medium"
          >
            {loading ? 'Working…' : effectiveMethod === 'create' ? 'Create User' : 'Send Invitation'}
          </button>
        </div>
      </form>
    </Overlay>
  )
}

const Overlay = ({ children, onClose }) => (
  <ModalOverlay onClose={onClose}>
    <div className="bg-white rounded-xl p-6 w-full max-w-md my-auto">{children}</div>
  </ModalOverlay>
)

const MethodButton = ({ active, disabled, onClick, title, subtitle }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`text-left rounded-lg border px-3 py-2 transition-colors ${
      disabled
        ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
        : active
          ? 'border-optio-purple bg-optio-purple/5 text-neutral-900'
          : 'border-gray-200 text-neutral-700 hover:bg-gray-50'
    }`}
  >
    <span className="block text-sm font-medium">{title}</span>
    <span className="block text-xs text-gray-500">{subtitle}</span>
  </button>
)

const Field = ({ label, value, mono, valueClass = '' }) => (
  <div>
    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
    <p className={`text-neutral-900 font-medium ${mono ? 'font-mono bg-white px-2 py-1 rounded border' : ''} ${valueClass}`}>{value}</p>
  </div>
)

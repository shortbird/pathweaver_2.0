import React, { useState } from 'react'
import api from '../../../services/api'
import toast from 'react-hot-toast'
import { TrashIcon } from '@heroicons/react/24/outline'

/**
 * Modal for editing organization user details.
 * Handles name, email, roles, and password reset for username accounts.
 */
function EditUserModal({ orgId, user, onClose, onSuccess, onRemove }) {
  const getEffectiveRoles = () => {
    if (user.role !== 'org_managed') return [user.role]
    if (user.org_roles && Array.isArray(user.org_roles) && user.org_roles.length > 0) {
      return user.org_roles
    }
    if (user.org_role) return [user.org_role]
    return ['student']
  }

  const [formData, setFormData] = useState({
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    email: user.email || '',
    org_roles: getEffectiveRoles()
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [generatedPassword, setGeneratedPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  const isUsernameAccount = user.username && !user.email

  const handleRegeneratePassword = async () => {
    setResetLoading(true)
    setError('')
    setGeneratedPassword('')
    try {
      const response = await api.post(`/api/admin/organizations/${orgId}/users/${user.id}/reset-password`, {
        regenerate: true
      })
      if (response.data.new_password) {
        setGeneratedPassword(response.data.new_password)
      }
    } catch (err) {
      const errorData = err.response?.data?.error || err.response?.data?.message || err.response?.data
      setError(typeof errorData === 'string' ? errorData : errorData?.message || 'Failed to reset password')
    } finally {
      setResetLoading(false)
    }
  }

  const copyPassword = () => {
    navigator.clipboard.writeText(generatedPassword)
    toast.success('Password copied to clipboard!')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await api.put(`/api/admin/users/${user.id}`, {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email
      })

      const originalRoles = getEffectiveRoles()
      const rolesChanged = JSON.stringify(formData.org_roles.sort()) !== JSON.stringify(originalRoles.sort())

      if (rolesChanged) {
        await api.put(`/api/admin/org/users/${user.id}/role`, {
          org_roles: formData.org_roles
        })
      }

      onSuccess()
    } catch (err) {
      const errorData = err.response?.data?.error || err.response?.data?.message || err.response?.data
      setError(typeof errorData === 'string' ? errorData : errorData?.message || 'Failed to update user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 w-full h-full bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl p-6 w-full max-w-md my-auto">
        <h2 className="text-2xl font-bold mb-4">Edit User</h2>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">First Name</label>
              <input
                type="text"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                placeholder="First name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Last Name</label>
              <input
                type="text"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                placeholder="Last name"
              />
            </div>
          </div>

          {isUsernameAccount ? (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Username</label>
              <div className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-600">
                {user.username}
              </div>
              <p className="text-xs text-gray-500 mt-1">Username cannot be changed</p>
            </div>
          ) : (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                required
              />
            </div>
          )}

          {isUsernameAccount && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">Password</label>
                {!generatedPassword && (
                  <button
                    type="button"
                    onClick={handleRegeneratePassword}
                    disabled={resetLoading}
                    className="text-xs text-optio-purple hover:underline disabled:opacity-50"
                  >
                    {resetLoading ? 'Generating...' : 'Generate New Password'}
                  </button>
                )}
              </div>
              {generatedPassword ? (
                <div className="space-y-2">
                  <div className="p-2 bg-green-50 border border-green-200 rounded text-sm">
                    <p className="text-green-700 font-medium mb-1">New password generated!</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-white px-2 py-1 rounded border text-gray-900 font-mono">
                        {generatedPassword}
                      </code>
                      <button
                        type="button"
                        onClick={copyPassword}
                        className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    Share this password with the student. It won't be shown again after closing this modal.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  Click "Generate New Password" to create a new simple password for this student.
                </p>
              )}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Organization Role(s)</label>
            <p className="text-xs text-gray-500 mb-2">Users can have multiple roles (e.g., Parent + Advisor)</p>
            <div className="space-y-2 border border-gray-200 rounded-lg p-3">
              {[
                { value: 'student', label: 'Student' },
                { value: 'parent', label: 'Parent' },
                { value: 'advisor', label: 'Advisor' },
                { value: 'observer', label: 'Observer' },
                { value: 'org_admin', label: 'Organization Admin' }
              ].map(role => (
                <label key={role.value} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                  <input
                    type="checkbox"
                    checked={formData.org_roles.includes(role.value)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        if (!formData.org_roles.includes(role.value)) {
                          setFormData({ ...formData, org_roles: [...formData.org_roles, role.value] })
                        }
                      } else {
                        const newRoles = formData.org_roles.filter(r => r !== role.value)
                        if (newRoles.length > 0) {
                          setFormData({ ...formData, org_roles: newRoles })
                        }
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                  />
                  <span className="text-sm">{role.label}</span>
                </label>
              ))}
            </div>
            {formData.org_roles.length === 0 && (
              <p className="text-xs text-red-600 mt-1">At least one role is required</p>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={() => {
                const name = user.display_name || (user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.first_name || user.last_name) || user.email
                if (confirm(`Remove ${name} from this organization?`)) {
                  onRemove()
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-full text-sm font-medium transition-colors"
            >
              <TrashIcon className="w-4 h-4" />
              Remove
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditUserModal

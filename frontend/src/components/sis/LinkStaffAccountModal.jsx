import React, { useState } from 'react'
import { XMarkIcon, LinkIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { ModalOverlay } from '../ui'

/**
 * LinkStaffAccountModal — connect a placeholder staff row to the teacher's
 * real email so they can actually log in.
 *
 * Backend decides between two outcomes: a brand-new email claims the
 * placeholder in place (set-password invite goes out), while an email that
 * already has an Optio account (e.g. a parent who also teaches) absorbs the
 * placeholder's class assignments and gains the Teacher role.
 */

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent'

export default function LinkStaffAccountModal({ orgId, staff, onClose, onLinked }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim()) {
      setError('Email is required')
      return
    }
    setSubmitting(true)
    try {
      const r = await api.post(`/api/sis/staff/${staff.id}/link`, {
        email: email.trim(),
        organization_id: orgId,
      })
      const data = r.data || {}
      if (data.linked === 'merged') {
        toast.success(`${staff.name} is now linked to their existing Optio account`)
      } else if (data.email_sent === false) {
        toast.error(
          'Account linked, but the set-password email could not be sent. Ask them to use "Forgot password" on the login page.',
          { duration: 8000 },
        )
      } else {
        toast.success(`Invite sent — ${staff.name} will get an email to set their password`)
      }
      onLinked()
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not link the account')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center">
              <LinkIcon className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Link {staff.name}&apos;s account</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-3">
            <p className="text-sm text-neutral-600">
              This staff member doesn&apos;t have a login yet. Enter their real email address to
              connect them. If they already use Optio (for example as a parent), their existing
              account becomes the teacher account and keeps all class assignments.
            </p>
            <div>
              <label htmlFor="link-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                id="link-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@example.com"
                className={inputClass}
                required
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {submitting ? 'Linking…' : 'Link account'}
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  )
}

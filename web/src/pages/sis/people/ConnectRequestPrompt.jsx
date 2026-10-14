import React, { useState } from 'react'

import Button from '../../../components/ui/Button'
import { INPUT_CLASS } from '../../../components/ui/Input'
import { sisPeopleApi } from '../../../hooks/api/useSisPeople'
import { useSisOrg } from '../useSisOrg'

/**
 * "Ask to connect" (ticket af8469aa).
 *
 * An add door met an email that already has a platform Optio account. The
 * backend used to refuse it and point at "the school's connect flow", which
 * did not exist for a school admin, so the office emailed support every time
 * (Apogee Cache Valley, three times in three days).
 *
 * This sends the account's owner -- or, for a minor student, their parent --
 * a request to join the school. Nothing is attached until they accept, signed
 * in, from the email or their notifications. Shown wherever an add door
 * answers with code 'connectable'; `connect` is that answer's
 * {email, role, household_id}.
 */

const ROLE_OPTIONS = [['student', 'Student'], ['parent', 'Parent'], ['advisor', 'Teacher']]

export const isConnectable = (data) => data?.code === 'connectable' && Boolean(data?.connect?.email)

export default function ConnectRequestPrompt({ connect, orgId, onClose, onSent }) {
  const { activeOrg } = useSisOrg()
  const school = activeOrg?.name || 'your school'
  const [role, setRole] = useState(connect.role || 'student')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(null)

  const send = async () => {
    setSaving(true)
    setError('')
    try {
      const { data } = await sisPeopleApi.sendConnectRequest(orgId, {
        email: connect.email, role, household_id: connect.household_id || null,
      })
      setSent(data)
      onSent?.(data)
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not send the request')
    } finally {
      setSaving(false)
    }
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900 space-y-2" role="status">
        <p>
          Request sent. {sent.sent_to === 'parent'
            ? `We asked the parent of ${connect.email} to accept.`
            : `${connect.email} joins ${school} when they accept.`}
          {' '}You will get a notification when they do.
        </p>
        {onClose && <Button size="sm" variant="outline" onClick={onClose}>Done</Button>}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-2"
      data-testid="connect-request-prompt">
      <p>
        <span className="font-medium">{connect.email}</span> already has an Optio account.
        Send them a request to join {school}. Nothing changes until they accept, and for a
        student under 18 their parent decides.
      </p>
      <label className="block text-xs text-amber-900">Join as
        <select className={`${INPUT_CLASS} mt-0.5`} value={role} onChange={(e) => setRole(e.target.value)}
          aria-label="Join as">
          {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      {error && <p className="text-red-700" role="alert">{error}</p>}
      <div className="flex justify-end gap-2">
        {onClose && <Button size="sm" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>}
        <Button size="sm" onClick={send} disabled={saving}>{saving ? 'Sending…' : 'Send request'}</Button>
      </div>
    </div>
  )
}

import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import ModalOverlay from '../ui/ModalOverlay'
import Button from '../ui/Button'
import { withOrg } from '../../pages/sis/useSisOrg'

/**
 * "Invite second parents" (ticket d11e5168: no way to message BOTH parents).
 *
 * Most second parents exist only as an emergency contact with an email and no
 * account, so no message can reach them. This lists those contacts, one row
 * per family and email, and sends each ticked row through the family record's
 * "+ Add a parent" (the server calls the same service). A parent whose email
 * already has an account at this school is connected instead of invited.
 *
 * The server acts only on row keys from its own preview for this school.
 */

const ACCOUNT_LABEL = {
  new: 'New account, invite email',
  existing: 'Has an account here, will be connected',
  other_school: 'Account at another school',
  student: 'Student email',
}

export default function InviteSecondParentsModal({ orgId, onClose, onDone }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [picked, setPicked] = useState(() => new Set())
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState(null)

  useEffect(() => {
    let live = true
    api.get(withOrg('/api/sis/second-parent-invites', orgId))
      .then((r) => {
        if (!live) return
        const list = r.data?.candidates || []
        setRows(list)
        setPicked(new Set(list.filter((c) => c.invitable).map((c) => c.key)))
      })
      .catch(() => { if (live) setError('Could not load the list.') })
    return () => { live = false }
  }, [orgId])

  const invitable = useMemo(() => (rows || []).filter((r) => r.invitable), [rows])
  const allPicked = invitable.length > 0 && invitable.every((r) => picked.has(r.key))

  const toggle = (key) => setPicked((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(invitable.map((r) => r.key)))

  const send = async () => {
    if (!picked.size) return
    setSending(true)
    try {
      const r = await api.post(withOrg('/api/sis/second-parent-invites', orgId),
        { keys: [...picked] })
      const counts = r.data?.counts || {}
      setResults(r.data?.results || [])
      const done = (counts.invited || 0) + (counts.connected || 0)
      const failed = (counts.failed || 0) + (counts.skipped || 0) + (counts.not_found || 0)
      if (done) toast.success(`${done} parent${done === 1 ? '' : 's'} added`)
      if (failed) toast.error(`${failed} could not be added`)
      onDone?.()
    } catch {
      toast.error('Could not send the invites')
    } finally {
      setSending(false)
    }
  }

  const resultFor = (key) => (results || []).find((r) => r.key === key)

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5 space-y-4"
        role="dialog" aria-modal="true" aria-label="Invite second parents">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Invite second parents</h2>
          <button onClick={onClose} className="text-sm text-neutral-500 hover:text-neutral-800">Close</button>
        </div>
        <p className="text-sm text-neutral-600">
          These parents are listed as an emergency contact with an email, but they have no
          account linked to their child, so school messages do not reach them. Each one you
          invite joins the family and gets an email to set a password.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {!rows && !error && <p className="text-sm text-neutral-500">Loading...</p>}
        {rows && rows.length === 0 && (
          <p className="text-sm text-neutral-500">Every parent contact with an email is already linked.</p>
        )}

        {rows && rows.length > 0 && (
          <>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={allPicked} onChange={toggleAll}
                disabled={!invitable.length || !!results} aria-label="Select all" />
              Select all ({invitable.length})
            </label>
            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
              {rows.map((r) => {
                const done = resultFor(r.key)
                return (
                  <li key={r.key} className="flex items-start gap-3 px-3 py-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={picked.has(r.key)}
                      disabled={!r.invitable || !!results} onChange={() => toggle(r.key)}
                      aria-label={`Invite ${r.name || r.email}`} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-neutral-900">
                        {r.name || r.email}
                        <span className="ml-2 font-normal text-neutral-500">{r.email}</span>
                      </div>
                      <div className="text-xs text-neutral-500">
                        {r.household_name || 'No family'}
                        {r.students?.length > 0 && ` · ${r.students.map((s) => s.name).join(', ')}`}
                        {r.relationship && ` · ${r.relationship}`}
                      </div>
                      <div className={`text-xs ${r.invitable ? 'text-neutral-500' : 'text-amber-700'}`}>
                        {r.reason || ACCOUNT_LABEL[r.account] || ''}
                      </div>
                      {done && (
                        <div className={`text-xs ${done.status === 'invited' || done.status === 'connected' ? 'text-green-700' : 'text-red-600'}`}>
                          {done.status === 'invited' && (done.invite_sent ? 'Invited' : 'Added, but the email did not send')}
                          {done.status === 'connected' && 'Connected'}
                          {!['invited', 'connected'].includes(done.status) && (done.reason || 'Not added')}
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>{results ? 'Done' : 'Cancel'}</Button>
          {!results && (
            <Button size="sm" onClick={send} disabled={sending || !picked.size}>
              {sending ? 'Inviting...' : `Invite selected (${picked.size})`}
            </Button>
          )}
        </div>
      </div>
    </ModalOverlay>
  )
}

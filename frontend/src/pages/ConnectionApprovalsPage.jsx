import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../services/api'

/**
 * Peer connections — the grown-up's side.
 *
 * A parent (or, for two students inside one school, that school's admin) is
 * asked to approve their OWN child joining a connection. They are never asked
 * to speak for the other family; the other child's approver gets their own copy
 * of this page, and one "no" from either side ends it.
 *
 * The card states plainly what is being consented to, because that is the whole
 * point of asking: what the other student would be able to see, and that it can
 * be undone later. A consent screen that says "approve connection?" and nothing
 * else is a click, not a consent.
 *
 * Backed by /api/connections/approvals.
 */
export default function ConnectionApprovalsPage() {
  const [pending, setPending] = useState([])
  const [approved, setApproved] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/connections/approvals')
      const data = res.data?.data || res.data
      setPending(data?.pending || [])
      setApproved(data?.approved || [])
    } catch {
      toast.error('Could not load approval requests.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const decide = async (connectionId, approve) => {
    setBusy(true)
    try {
      await api.post(`/api/connections/${connectionId}/approve`, { approve })
      toast.success(approve ? 'Approved.' : 'Declined.')
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save your answer.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (connectionId) => {
    setBusy(true)
    try {
      await api.post(`/api/connections/${connectionId}/revoke`, {})
      toast.success('Connection removed.')
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not remove that connection.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto p-6 text-neutral-500">Loading...</div>
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-neutral-900">Student connections</h1>
      <p className="text-neutral-600 mt-1">
        Approve new connections, and manage the ones you've already approved.
      </p>

      <h2 className="text-lg font-semibold text-neutral-900 mt-8">Waiting on you</h2>
      {pending.length === 0 ? (
        <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-5 text-neutral-600">
          Nothing waiting on you right now.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {pending.map((req) => (
            <div key={req.id} className="rounded-lg border border-neutral-200 bg-white p-5">
              <p className="font-medium text-neutral-900">
                {req.child.display_name} wants to connect with {req.peer.display_name}
              </p>

              {/* Spelled out rather than summarised. This is the disclosure the
                  approval authorises, and it is the only place it is stated. */}
              <ul className="mt-3 space-y-1 text-sm text-neutral-700 list-disc list-inside">
                <li>They would each be able to see the other's portfolio and work</li>
                <li>They would each be able to leave comments on that work</li>
                <li>They would not see each other's email address or birthday</li>
                <li>You can undo this at any time</li>
              </ul>

              {req.approver_kind === 'org_admin' && (
                <p className="mt-3 text-sm text-neutral-500">
                  You're being asked as this student's school administrator,
                  because no parent or guardian account is linked to them. Both
                  students are at your school.
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => decide(req.connection_id, true)}
                  disabled={busy}
                  className="rounded-md bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2 text-white font-medium disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => decide(req.connection_id, false)}
                  disabled={busy}
                  className="rounded-md border border-neutral-300 px-4 py-2 text-neutral-700 disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* The part that was missing: approval is not the end of a parent's
          involvement. Revocation was always in the API, but with no surface a
          parent who changed their mind had to email support — a right you can
          only exercise by asking someone else is not much of a right. */}
      <h2 className="text-lg font-semibold text-neutral-900 mt-10">Active connections</h2>
      <p className="text-sm text-neutral-600 mt-1">
        Connections you approved. You can end any of these at any time, without
        asking the other family.
      </p>

      {approved.length === 0 ? (
        <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-5 text-neutral-600">
          No active connections yet.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {approved.map((c) => (
            <div
              key={c.connection_id}
              className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-neutral-900">
                  {c.child.display_name} and {c.peer.display_name}
                </p>
                {c.connected_since && (
                  <p className="text-sm text-neutral-500">
                    Connected since {new Date(c.connected_since).toLocaleDateString()}
                  </p>
                )}
              </div>
              <button
                onClick={() => remove(c.connection_id)}
                disabled={busy}
                className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50"
              >
                End connection
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

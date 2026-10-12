import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import * as parentLink from '../../services/parentLinkAPI'

/**
 * /admin/parent-links -- parent link requests waiting on a superadmin.
 *
 * A platform student named a parent email and that parent accepted from the
 * inbox. The address is proven; the relationship is not, and a linked parent
 * approves the child's friends and portfolio. Approve writes the link; the
 * parent's role is left as it is.
 * Every superadmin gets a notification when a request lands here.
 */

const when = (iso) => (iso ? new Date(iso).toLocaleString() : '')

function Person({ label, person, fallback }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      {person ? (
        <>
          <div className="font-medium text-neutral-900">{person.name || '(no name)'}</div>
          <div className="text-sm text-neutral-600">{person.email}</div>
          {person.date_of_birth && <div className="text-sm text-neutral-600">Born {person.date_of_birth}</div>}
          {person.role && (
            <div className="text-sm text-neutral-600">
              Role: {person.role}{person.organization_id ? ' (school member)' : ''}
            </div>
          )}
        </>
      ) : (
        <div className="text-sm text-neutral-600">{fallback}</div>
      )}
    </div>
  )
}

export default function ParentLinkRequests() {
  const [data, setData] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    try {
      setData(await parentLink.adminList())
    } catch (err) {
      toast.error(parentLink.errorText(err, 'Could not load parent link requests.'))
    }
  }, [])

  useEffect(() => { load() }, [load])

  const decide = async (id, approve) => {
    setBusyId(id)
    try {
      await parentLink.adminDecide(id, approve)
      toast.success(approve ? 'Linked.' : 'Declined.')
      await load()
    } catch (err) {
      toast.error(parentLink.errorText(err, 'Could not save that.'))
    } finally {
      setBusyId(null)
    }
  }

  if (!data) return <div className="p-6 text-neutral-500">Loading...</div>

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <section>
        <h1 className="text-2xl font-bold text-neutral-900">Parent link requests</h1>
        <p className="text-neutral-600 mt-1">
          A student asked for a parent, and the parent accepted from that email inbox. Approve if the pair looks right.
        </p>
        {data.waiting.length === 0 ? (
          <p className="mt-4 text-neutral-500">Nothing is waiting.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {data.waiting.map((r) => (
              <li key={r.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Person label="Student" person={r.student} fallback="Account deleted" />
                  <Person label="Parent" person={r.parent} fallback={r.parent_email} />
                </div>
                <div className="text-sm text-neutral-500 mt-3">
                  Asked {when(r.created_at)}, accepted {when(r.accepted_at)}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => decide(r.id, true)}
                    disabled={busyId === r.id}
                    className="rounded-md bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2 text-white font-medium disabled:opacity-50"
                  >
                    Approve and link
                  </button>
                  <button
                    type="button"
                    onClick={() => decide(r.id, false)}
                    disabled={busyId === r.id}
                    className="rounded-md border border-neutral-300 px-4 py-2 text-neutral-700 disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-neutral-900">Last 30 days</h2>
        {data.recent.length === 0 ? (
          <p className="mt-2 text-neutral-500">No other requests.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="py-2 pr-4 font-medium">Student</th>
                  <th className="py-2 pr-4 font-medium">Parent email</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Asked</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((r) => (
                  <tr key={r.id} className="border-t border-neutral-100">
                    <td className="py-2 pr-4">{r.student?.name || r.student?.email || ''}</td>
                    <td className="py-2 pr-4">{r.parent_email}</td>
                    <td className="py-2 pr-4">{r.status}</td>
                    <td className="py-2">{when(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

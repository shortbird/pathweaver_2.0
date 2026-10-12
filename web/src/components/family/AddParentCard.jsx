import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import * as parentLink from '../../services/parentLinkAPI'

/**
 * "Parent or guardian" -- a platform student with no parent linked asks for
 * one. Until 2026-10-12 only a superadmin could link a parent to an existing
 * student account, and a parent and her 15-year-old looked for this button for
 * a day (bounty report, 2026-09-09).
 *
 * The student names an email; the parent accepts from that inbox; Optio
 * approves. The card says all three steps so nobody waits on the wrong person.
 * It renders nothing for a school's student (the school links families) or
 * for an account that is not a student.
 */
export default function AddParentCard({ className = '' }) {
  const [status, setStatus] = useState(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setStatus(await parentLink.getMine())
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (!status || status.state === 'school' || status.state === 'not_student') return null

  const send = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    try {
      await parentLink.sendRequest(email.trim())
      toast.success('Sent. Your parent got an email.')
      setEmail('')
      await load()
    } catch (err) {
      toast.error(parentLink.errorText(err, 'Could not send that.'))
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    setBusy(true)
    try {
      await parentLink.cancelRequest()
      await load()
    } catch (err) {
      toast.error(parentLink.errorText(err, 'Could not cancel that.'))
    } finally {
      setBusy(false)
    }
  }

  const request = status.request

  return (
    <section className={`rounded-lg border border-neutral-200 bg-white p-5 ${className}`} aria-labelledby="parent-link-heading">
      <h2 id="parent-link-heading" className="text-lg font-semibold text-neutral-900">Parent or guardian</h2>

      {status.state === 'has_parent' && (
        <p className="text-neutral-700 mt-2">
          {status.parents.length
            ? <>Linked to your account: <strong>{status.parents.map((p) => p.name).join(', ')}</strong>.</>
            : 'A parent manages your account.'}
        </p>
      )}

      {status.state === 'available' && !request && (
        <form onSubmit={send} className="mt-2">
          <p className="text-neutral-700">
            Link a parent to your account so they can see your work and help you. Enter their email address.
          </p>
          <label htmlFor="parent-email" className="sr-only">Parent&rsquo;s email address</label>
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <input
              id="parent-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="parent@example.com"
              className="flex-1 rounded-md border border-neutral-300 px-3 py-2"
              required
            />
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="rounded-md bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2 text-white font-medium disabled:opacity-50"
            >
              Send
            </button>
          </div>
          <p className="text-sm text-neutral-500 mt-2">
            Your parent gets an email and accepts it. Then Optio checks and confirms the link, usually within a day.
          </p>
        </form>
      )}

      {status.state === 'available' && request && (
        <div className="mt-2">
          {request.status === 'invited' ? (
            <p className="text-neutral-700">
              We emailed <strong>{request.parent_email}</strong>. Ask them to open the email and click the button.
            </p>
          ) : (
            <p className="text-neutral-700">
              <strong>{request.parent_email}</strong> accepted. Optio will confirm the link soon.
            </p>
          )}
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="mt-3 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50"
          >
            Cancel and use a different email
          </button>
        </div>
      )}
    </section>
  )
}

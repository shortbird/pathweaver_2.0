import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import * as parentLink from '../services/parentLinkAPI'

/**
 * /parent-link/:token -- where the email a student sent their parent lands.
 *
 * The parent signs in, or makes an account, with the invited address and
 * accepts. That proves the address; Optio then approves the link by hand
 * (backend/services/parent_link_request_service.py says why).
 *
 * Register does not carry a return path, so a new parent is told to come back
 * to the email after signing up. Sign in does (?redirect=).
 */
export default function ParentLinkAcceptPage() {
  const { token } = useParams()
  const { isAuthenticated, loading, user } = useAuth()
  const [invite, setInvite] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    parentLink.previewInvite(token)
      .then(setInvite)
      .catch((err) => setError(parentLink.errorText(err, 'This link is not valid.')))
  }, [token])

  const accept = async () => {
    setBusy(true)
    setError(null)
    try {
      await parentLink.acceptInvite(token)
      setAccepted(true)
    } catch (err) {
      setError(parentLink.errorText(err, 'Could not accept the request.'))
    } finally {
      setBusy(false)
    }
  }

  const here = `/parent-link/${token}`
  const name = invite?.student_name || 'your student'

  let body
  if (!invite && !error) {
    body = <p className="text-neutral-500">Loading...</p>
  } else if (!invite) {
    body = <p className="text-neutral-700">{error}</p>
  } else if (accepted || invite.status === 'accepted') {
    body = (
      <>
        <h1 className="text-xl font-bold text-neutral-900">Thank you</h1>
        <p className="text-neutral-700 mt-2">
          Optio will check and confirm the link to {name}, usually within a day. You will get a notification when it is done.
        </p>
      </>
    )
  } else if (invite.status !== 'invited') {
    body = (
      <p className="text-neutral-700">
        This link has {invite.status === 'expired' ? 'expired' : 'already been used'}. Ask {name} to send a new one from their account settings.
      </p>
    )
  } else if (loading) {
    body = <p className="text-neutral-500">Loading...</p>
  } else if (!isAuthenticated) {
    body = (
      <>
        <h1 className="text-xl font-bold text-neutral-900">{name} asked to link you as their parent</h1>
        <p className="text-neutral-700 mt-2">
          Sign in with <strong>{invite.parent_email}</strong>. If you do not have an Optio account yet, create one with that email address, then open the link in the email again.
        </p>
        <div className="mt-5 flex flex-col sm:flex-row gap-2">
          <Link
            to={`/login?redirect=${encodeURIComponent(here)}`}
            className="text-center rounded-md bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2 text-white font-medium"
          >
            Sign in
          </Link>
          <Link to="/register" className="text-center rounded-md border border-neutral-300 px-4 py-2 text-neutral-700 font-medium">
            Create an account
          </Link>
        </div>
      </>
    )
  } else {
    const wrongAccount = (user?.email || '').toLowerCase() !== invite.parent_email
    body = (
      <>
        <h1 className="text-xl font-bold text-neutral-900">{name} asked to link you as their parent</h1>
        {wrongAccount ? (
          <p className="text-neutral-700 mt-2">
            This link is for <strong>{invite.parent_email}</strong>, and you are signed in as {user?.email}. Sign out, then sign in with {invite.parent_email}.
          </p>
        ) : (
          <>
            <p className="text-neutral-700 mt-2">
              When your account is linked, you can see {name}&rsquo;s quests and work, add quests for them, and approve their friends and portfolio.
            </p>
            <button
              type="button"
              onClick={accept}
              disabled={busy}
              className="mt-5 rounded-md bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2 text-white font-medium disabled:opacity-50"
            >
              I am {name}&rsquo;s parent or guardian
            </button>
          </>
        )}
        {error && <p className="text-red-600 mt-3" role="alert">{error}</p>}
      </>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
      <div className="max-w-md w-full rounded-lg border border-neutral-200 bg-white p-6">{body}</div>
    </div>
  )
}

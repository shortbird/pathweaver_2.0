import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import authService from '../services/authService'

/**
 * /invitation/:code when the code is a school's connect request (ticket
 * af8469aa), rendered by AcceptInvitationPage.
 *
 * A school asked an existing Optio account to join. Only the account the
 * request names -- or, for a minor student, their parent -- may decide, and
 * only signed in: the code alone is not enough, so a forwarded email cannot
 * attach anyone. The account keeps its work and XP either way.
 */
export default function ConnectRequestView({ code, invitation, currentUser }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null) // 'accepted' | 'declined'

  const school = invitation.organization?.name || 'A school'
  const person = invitation.person_name || 'this account'
  const roleLabel = { student: 'a student', parent: 'a parent', advisor: 'a teacher' }[invitation.role] || invitation.role
  const here = `/invitation/${code}`

  const decide = async (what) => {
    setBusy(true)
    setError(null)
    try {
      await api.post(what === 'accept'
        ? `/api/connect-requests/${code}/accept`
        : `/api/connect-requests/${code}/decline`, {})
      if (what === 'accept') await authService.checkAuthStatus?.()
      setDone(what === 'accept' ? 'accepted' : 'declined')
    } catch (err) {
      setError(err?.response?.data?.error || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  let body
  if (done === 'accepted') {
    body = (
      <>
        <h1 className="text-xl font-bold text-neutral-900">Done</h1>
        <p className="text-neutral-700 mt-2">
          {invitation.for_parent ? `${person} is now part of ${school}.` : `You are now part of ${school}.`}
          {' '}All of the work and XP stay where they were.
        </p>
        <Link to="/dashboard" className="inline-block mt-5 rounded-md bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2 text-white font-medium">
          Go to Optio
        </Link>
      </>
    )
  } else if (done === 'declined') {
    body = <p className="text-neutral-700">You declined. Nothing changed, and {school} was told.</p>
  } else if (!currentUser) {
    body = (
      <>
        <h1 className="text-xl font-bold text-neutral-900">{school} asked to connect {invitation.for_parent ? person : 'your account'}</h1>
        <p className="text-neutral-700 mt-2">
          Sign in to Optio with the account this email was sent to, then choose Accept or Decline.
        </p>
        <Link to={`/login?redirect=${encodeURIComponent(here)}`}
          className="inline-block mt-5 rounded-md bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2 text-white font-medium">
          Sign in
        </Link>
      </>
    )
  } else {
    body = (
      <>
        <h1 className="text-xl font-bold text-neutral-900">{school} asked to connect {invitation.for_parent ? person : 'your account'}</h1>
        <p className="text-neutral-700 mt-2">
          {invitation.for_parent
            ? `${school} would like to add ${person} to the school on Optio as ${roleLabel}.`
            : `${school} would like you to join the school on Optio as ${roleLabel}.`}
          {' '}If you accept, the school can see the account the way it sees its other members. Work and XP stay as they are.
        </p>
        <div className="mt-5 flex flex-col sm:flex-row gap-2">
          <button type="button" onClick={() => decide('accept')} disabled={busy}
            className="rounded-md bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2 text-white font-medium disabled:opacity-50">
            Accept
          </button>
          <button type="button" onClick={() => decide('decline')} disabled={busy}
            className="rounded-md border border-neutral-300 px-4 py-2 text-neutral-700 font-medium disabled:opacity-50">
            Decline
          </button>
        </div>
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

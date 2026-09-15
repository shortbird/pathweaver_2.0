import React, { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/**
 * /f/:code — where a friend's invite link lands.
 *
 * The link is the QR code's payload and what the share sheet sends, on the
 * app host (www 404s any SPA route missing from its redirect list). The app
 * has no universal links yet, so this page is the bridge: it offers to open
 * the code in the Optio app, and otherwise takes the visitor to the right
 * place on the web:
 *
 *   - signed out: to login, coming back here afterwards;
 *   - a student: to Friends with the code filled in (the request still needs
 *     a tap -- a link must never add a friend by being opened);
 *   - a parent: to the family dashboard, where they connect a child by code.
 *
 * The code itself is not validated here. The server answers "not valid or
 * expired" for an unknown one, exactly as for a code that never existed.
 */

const CODE = /^[A-Z2-9]{8}$/i

export default function FriendInvitePage() {
  const { code: raw } = useParams()
  const { isAuthenticated, loading, effectiveRole } = useAuth()
  const code = String(raw || '').toUpperCase()
  const valid = CODE.test(code)
  const [wantsWeb, setWantsWeb] = useState(false)

  useEffect(() => {
    if (valid) {
      try { sessionStorage.setItem('friend_invite_code', code) } catch { /* private mode */ }
    }
  }, [code, valid])

  if (!valid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold text-neutral-900">That link is not a friend code.</h1>
          <p className="text-neutral-600 mt-2">Ask your friend to send it again.</p>
          <Link to="/" className="inline-block mt-4 text-optio-purple font-medium">Go to Optio</Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-neutral-500">Loading...</div>
  }

  if (wantsWeb) {
    if (!isAuthenticated) {
      return <Navigate to={`/login?redirect=${encodeURIComponent(`/f/${code}`)}`} replace />
    }
    if (effectiveRole === 'parent') {
      return <Navigate to={`/family?friend_code=${code}`} replace />
    }
    return <Navigate to={`/connections?code=${code}`} replace />
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
      <div className="max-w-md w-full rounded-xl border border-neutral-200 bg-white p-6 text-center">
        <p className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">Friend invite</p>
        <h1 className="text-2xl font-bold text-neutral-900 mt-2">Someone wants to be your friend on Optio</h1>
        <p className="font-mono text-2xl tracking-widest text-optio-purple mt-4" aria-label={`Code ${code}`}>{code}</p>
        <p className="text-sm text-neutral-600 mt-3">
          Friends see and cheer on each other&rsquo;s work. Both of you have to say yes, and your families set the rules.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <a
            href={`optio://f/${code}`}
            className="rounded-md bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2.5 text-white font-medium"
          >
            Open in the Optio app
          </a>
          <button
            type="button"
            onClick={() => setWantsWeb(true)}
            className="rounded-md border border-neutral-300 px-4 py-2.5 text-neutral-700 font-medium"
          >
            Continue on the web
          </button>
        </div>
      </div>
    </div>
  )
}

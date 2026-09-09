/**
 * LTI launch handoff (v1).
 *
 * Canvas → backend /lti/launch verifies the id_token and redirects the
 * iframe here with `?code=<one-time>&mode=<deep_link|pending>?`. We
 * exchange the code via POST /lti/token, store the resulting Bearer tokens
 * in `tokenStore`, and route into the actual page (quest detail or
 * deep-link form).
 *
 * `mode=pending` is the deferred student flow: the backend has NOT created
 * a `users` row yet, so we deliberately do NOT exchange the code on mount.
 * Instead we show a single-button landing page; the click is what triggers
 * the exchange — and the exchange is what materializes the Optio account.
 * If the student never clicks (e.g. Canvas course-nav auto-loaded the
 * iframe), no user is ever created.
 *
 * Intentionally minimal — no Layout, no sidebar, no marketing chrome. The
 * iframe is a single-purpose surface.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api, { tokenStore } from '../../services/api'
import LtiShell from '../../components/lti/LtiShell'

export default function LtiLaunchPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  const [exchanging, setExchanging] = useState(false)
  // Guard the code exchange against React.StrictMode's double-invoke in dev.
  // /lti/token is one-time use — a second call always returns "expired" and
  // tears down the just-established session.
  const exchangeStarted = useRef(false)

  const code = searchParams.get('code')
  const mode = searchParams.get('mode')
  const isPending = mode === 'pending'

  const runExchange = useCallback(async () => {
    if (exchangeStarted.current) return
    exchangeStarted.current = true
    setExchanging(true)
    try {
      const { data } = await api.post('/lti/token', { code })
      if (!data?.access_token || !data?.refresh_token) {
        setError('Launch token exchange failed.')
        return
      }
      tokenStore.setTokens(data.access_token, data.refresh_token)

      if (mode === 'deep_link' || data.target_path === '/lti-deep-link') {
        navigate(`/lti-deep-link?code=${encodeURIComponent(code)}`, { replace: true })
        return
      }
      if (data.quest_id) {
        navigate(`/lti-quest/${data.quest_id}`, { replace: true })
        return
      }
      navigate('/lti-error?reason=no_target', { replace: true })
    } catch (e) {
      const raw = e?.response?.data?.error
      const msg =
        typeof raw === 'string'
          ? raw
          : raw?.message || e?.message || 'Launch failed'
      setError(msg)
      // Re-allow retry on a soft failure (network) by clearing the guard.
      // Backend has already consumed the code if we got a 2xx, but on
      // network errors the code is still valid.
      if (!e?.response) exchangeStarted.current = false
    } finally {
      setExchanging(false)
    }
  }, [code, mode, navigate])

  useEffect(() => {
    if (!code) {
      setError('Missing launch code.')
      return
    }
    // Pending student flow: wait for the user to click "Enter Optio" before
    // exchanging the code — that exchange is what creates their Optio
    // account, so a passive iframe load must not auto-trigger it.
    if (isPending) return
    runExchange()
  }, [code, isPending, runExchange])

  if (error) return <LtiShell error={error} />
  if (!isPending || exchanging) return <LtiShell loading />

  return (
    <LtiShell
      title="Welcome from Canvas"
      subtitle="Click below to enter Optio and continue with your assignment."
    >
      <div className="mt-4 flex justify-center">
        <button
          type="button"
          onClick={runExchange}
          className="px-6 py-2 rounded-full font-semibold text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-optio-purple disabled:opacity-50"
          disabled={exchanging}
          data-testid="lti-launch-enter"
        >
          Enter Optio
        </button>
      </div>
    </LtiShell>
  )
}

/**
 * LTI launch handoff (v1).
 *
 * Canvas → backend /lti/launch verifies the id_token and redirects the
 * iframe here with `?code=<one-time>&mode=<deep_link?>`. We exchange the
 * code via POST /lti/token, store the resulting Bearer tokens in
 * `tokenStore`, and route into the actual page (quest detail or deep-link
 * form).
 *
 * Intentionally minimal — no Layout, no sidebar, no marketing chrome. The
 * iframe is a single-purpose surface.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api, { tokenStore } from '../../services/api'

export default function LtiLaunchPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    const code = searchParams.get('code')
    const mode = searchParams.get('mode')
    if (!code) {
      setError('Missing launch code.')
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const { data } = await api.post('/lti/token', { code })
        if (cancelled) return
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
        if (cancelled) return
        const msg = e?.response?.data?.error || e?.message || 'Launch failed'
        setError(msg)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [searchParams, navigate])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold text-gray-900">
            Could not start your Optio launch
          </h1>
          <p className="mt-2 text-sm text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
    </div>
  )
}

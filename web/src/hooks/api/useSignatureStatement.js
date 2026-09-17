import { useEffect, useState } from 'react'
import api from '../../services/api'

/**
 * The sentence a person ticks to make a typed name a signature.
 *
 * It is one constant on the server (sis_onboarding_service.SIGNATURE_STATEMENT)
 * and the server records that exact wording against every signature it
 * accepts, so the client must show the same one. Payloads that carry a
 * signable thing already include it (assignment.signature_statement, the
 * funnel config); this hook is for the surfaces that have no such payload,
 * the setup tab's preview being the one today. Fetched once per page load.
 *
 * FALLBACK is what the server has said since 2026-08-06, shown only when the
 * request fails: the alternative is a checkbox with no sentence beside it.
 */

export const STATEMENT_URL = '/api/registration/signature-statement'

export const FALLBACK_STATEMENT =
  'I am typing my own name below, and I intend it to count as my official signature.'

let inFlight = null

export function fetchSignatureStatement() {
  if (!inFlight) {
    inFlight = Promise.resolve()
      .then(() => api.get(STATEMENT_URL))
      .then((r) => r?.data?.statement || FALLBACK_STATEMENT)
      .catch(() => { inFlight = null; return FALLBACK_STATEMENT })
  }
  return inFlight
}

/** `given` wins when the caller's payload carried the sentence. */
export default function useSignatureStatement(given) {
  const [fetched, setFetched] = useState(null)
  useEffect(() => {
    if (given) return undefined
    let active = true
    fetchSignatureStatement().then((s) => { if (active) setFetched(s) })
    return () => { active = false }
  }, [given])
  return given || fetched || FALLBACK_STATEMENT
}

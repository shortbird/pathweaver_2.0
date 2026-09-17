import { useEffect, useRef, useState } from 'react'
import api from '../../services/api'

/**
 * The registration funnel's money, quoted by the server: one number per
 * question, from services/registration_pricing.quote (M5).
 *
 * The browser used to mirror the fee rule (estimateFeeCents), the monthly
 * arithmetic (monthlyPricing.js) and the setup editor's draft fee
 * (draftFeeCents), and the funnel route kept a second fee engine; the
 * copies disagreed (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, A2/A3).
 * Now every surface asks and draws. Three doors, one shape:
 *
 *   quoteRegistration(regId, accessToken, { num_students, add_ons })
 *     the family's own registration, with an unsaved selection on top
 *   quoteByCode(code, { num_students, kids })
 *     an org's saved config before any registration exists (?preview=1)
 *   quotePreview(config, { num_students, kids })
 *     the setup tab's unsaved draft (front office only)
 *
 * useRegistrationQuote(request, key) runs `request` (which returns one of
 * those promises, or null for "nothing to quote") whenever `key` changes,
 * debounced so a parent typing a child's name does not fire per keystroke,
 * and keeps the last quote while the next one is in flight.
 */

const QUOTE_URL = '/api/registration/quote'

export const quoteRegistration = (regId, accessToken, extra = {}) =>
  api.post(`/api/registration/registrations/${regId}/quote`, { access_token: accessToken, ...extra })
    .then((r) => r.data?.quote || null)

export const quoteByCode = (code, extra = {}) =>
  api.post(QUOTE_URL, { code, ...extra }).then((r) => r.data?.quote || null)

export const quotePreview = (config, extra = {}) =>
  api.post(`${QUOTE_URL}-preview`, { config, ...extra }).then((r) => r.data?.quote || null)

export const EMPTY_QUOTE = {
  cadence: 'none', lines: [],
  fee: { amount_cents: 0, deferred: false, waived: false },
  monthly: { total_cents: 0, plan: null },
  due_today_cents: 0,
}

export default function useRegistrationQuote(request, key, { delay = 250, initial = null } = {}) {
  const [quote, setQuote] = useState(initial)
  const [loading, setLoading] = useState(false)
  const latest = useRef(0)
  // The newest closure, read when the debounce timer fires rather than when
  // it was set: by then the page's kids or selection may have moved on.
  const requestRef = useRef(request)
  useEffect(() => { requestRef.current = request })

  useEffect(() => {
    const seq = ++latest.current
    const timer = setTimeout(() => {
      let promise = null
      try { promise = requestRef.current() } catch { promise = null }
      if (!promise) { setLoading(false); return }
      setLoading(true)
      promise
        .then((q) => { if (latest.current === seq && q) setQuote(q) })
        .catch(() => { /* keep the last quote; the server decides at checkout */ })
        .finally(() => { if (latest.current === seq) setLoading(false) })
    }, delay)
    return () => clearTimeout(timer)
  }, [key, delay])

  return { quote: quote || EMPTY_QUOTE, setQuote, loading }
}

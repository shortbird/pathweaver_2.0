import api from '../../services/api'
import { PENDING_CODE_KEYS } from './oauthPendingCodes'

/**
 * Finish a parent registration that was started with Google or Apple.
 *
 * This is how an account with NO password reaches the registration funnel at
 * all. The funnel used to prove identity with a password and nothing else,
 * which silently excluded every social signup and every org-imported parent —
 * 118 of 906 accounts on 2026-08-25, when a parent who had signed up with Apple
 * found "Create account" telling her the email was taken and "Sign in" telling
 * her the password was wrong.
 *
 * The provider button parks the funnel's invitation code in localStorage before
 * the redirect (stashPendingCodes); /auth/callback establishes the session and
 * calls this, which posts the code to /api/registration/attach — the session-proved
 * twin of the password login.
 *
 * Must go through the api client: the OAuth exchange has set auth cookies by
 * now, so /attach enforces CSRF (it is the one funnel endpoint that isn't
 * exempt) and a raw fetch would 400.
 *
 * @returns {Promise<string|null>} where to send the browser, or null when no
 *   registration funnel is pending and the caller should route normally.
 */
export async function resumePendingRegistrationFunnel() {
  const code = localStorage.getItem(PENDING_CODE_KEYS.registrationCode)
  if (!code) return null
  // Consumed either way: a code left behind would re-fire the attach on the
  // parent's next unrelated sign-in.
  localStorage.removeItem(PENDING_CODE_KEYS.registrationCode)
  try {
    await api.post('/api/registration/attach', { code })
    // /enroll/resume rehydrates the registration from the server, so a parent
    // who signed in mid-funnel lands back on the step they left.
    return '/enroll/resume'
  } catch (err) {
    console.error('[registrationFunnel] attach failed:', err)
    // Hand the refusal back to the funnel rather than dropping them on a
    // dashboard with no explanation — the guardrails refuse for reasons the
    // page can state ("this account belongs to another school", etc.).
    const reason = err?.response?.data?.error
    const q = reason ? `?attach_error=${encodeURIComponent(reason)}` : ''
    return `/enroll/${encodeURIComponent(code)}${q}`
  }
}

export default resumePendingRegistrationFunnel

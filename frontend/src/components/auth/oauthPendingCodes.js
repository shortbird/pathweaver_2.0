/**
 * Codes that have to survive an OAuth redirect.
 *
 * The trip out to Google/Apple and back to /auth/callback destroys component
 * state, so a promo or invitation code the user arrived with is parked in
 * localStorage until AuthCallback picks it up. Shared by GoogleButton and
 * AppleButton so the two providers can't drift on which keys they write —
 * AuthCallback reads these exact names.
 */

export const PENDING_CODE_KEYS = {
  promoCode: 'pendingPromoCode',
  invitationCode: 'pendingObserverInvitation',
  orgInvitationCode: 'pendingOrgInvitation',
  // Parent registration funnel (RegisterFunnelPage). Distinct from
  // orgInvitationCode because the funnel does NOT accept the invitation — the
  // link is shareable and stays pending — it posts the code to
  // /api/registration/attach, which joins the org and opens a registration.
  registrationCode: 'pendingRegistrationFunnel'
}

export function stashPendingCodes({ promoCode, invitationCode, orgInvitationCode, registrationCode } = {}) {
  if (promoCode) localStorage.setItem(PENDING_CODE_KEYS.promoCode, promoCode)
  if (invitationCode) localStorage.setItem(PENDING_CODE_KEYS.invitationCode, invitationCode)
  if (orgInvitationCode) localStorage.setItem(PENDING_CODE_KEYS.orgInvitationCode, orgInvitationCode)
  if (registrationCode) localStorage.setItem(PENDING_CODE_KEYS.registrationCode, registrationCode)
}

export function clearPendingCodes() {
  Object.values(PENDING_CODE_KEYS).forEach((key) => localStorage.removeItem(key))
}

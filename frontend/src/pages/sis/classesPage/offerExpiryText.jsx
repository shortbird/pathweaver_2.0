/**
 * Extracted from sis/ClassesPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

const offerExpiryText = (e) => {
  if (e.status !== 'offered' || !e.offer_expires_at) return null
  const ms = new Date(e.offer_expires_at) - Date.now()
  if (Number.isNaN(ms)) return null
  if (ms <= 0) return 'offer lapsed'
  const days = Math.floor(ms / 86400000)
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`
  const hours = Math.max(1, Math.round(ms / 3600000))
  return `${hours} hour${hours === 1 ? '' : 's'} left`
}

export default offerExpiryText

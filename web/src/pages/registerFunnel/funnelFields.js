/**
 * Pure field helpers for the parent registration funnel (QF-02).
 *
 * Lifted verbatim out of RegisterFunnelPage.jsx when that page was split into
 * per-step components. Everything here is a pure function or a constant: no
 * state, no api calls, no JSX. RegisterFunnelPage and its step components both
 * import from here, which is why it is a module rather than three copies.
 *
 * mergeAutofilledFields, firstQuestionError and firstDestinationError have
 * their own unit tests (registrationAutofillMerge.test.jsx,
 * registrationRecordsStep.test.jsx) and were already exported for them.
 */


export const CONTACT_RELATIONSHIPS = ['Grandparent', 'Guardian', 'Parent', 'Family friend', 'Neighbor', 'Other']

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// ── Date of birth as validated text (MM/DD/YYYY) ─────────────────────────────
// A plain masked text input with real calendar validation: impossible dates
// like 2/31/2008 are rejected with an inline error instead of being accepted
// (or silently mangled) the way loosely-handled date boxes do.

// Keep only digits and group them as MM/DD/YYYY while the parent types.
export const formatMdy = (raw) => {
  const d = String(raw || '').replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

// "MM/DD/YYYY" -> ISO date, or null when incomplete, impossible, or in the future.
export const mdyToIso = (text) => {
  const m = String(text || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const [, mm, dd, yyyy] = m
  const mo = Number(mm); const da = Number(dd); const yr = Number(yyyy)
  const d = new Date(yr, mo - 1, da)
  if (d.getFullYear() !== yr || d.getMonth() !== mo - 1 || d.getDate() !== da) return null
  if (yr < 1900 || d > new Date()) return null
  return `${yyyy}-${mm}-${dd}`
}

export const isoToMdy = (iso) => {
  const [y, mo, d] = String(iso || '').slice(0, 10).split('-')
  return (y && mo && d) ? `${mo}/${d}/${y}` : ''
}

// Stable identity for kid rows so async photo uploads land on the right kid
// even if rows are added/removed while an upload is in flight.
export const kidKey = () => Math.random().toString(36).slice(2)

export const emptyKid = () => ({
  _key: kidKey(),
  user_id: '',                       // set on resume back-edit (account exists)
  first_name: '', last_name: '', preferred_name: '', gender: '',
  date_of_birth: '', dob_text: '',
  email: '', allergies: '', medications: '',
  photo_file: null, photo_preview: '', avatar_url: '',
  staged_url: '',                    // uploaded-on-select photo, attached at family submit
  photo_uploading: false, photo_error: '',
})
export const emptyContact = () => ({ name: '', relationship: '', phone: '', email: '' })

// Browser/password-manager autofill can paint values into inputs WITHOUT firing
// the events React listens to, so the field looks filled while state stays ''.
// The submit then fails validation ("add an address") even though the parent
// sees their address on screen. Before validating, trust the DOM for any
// state-empty field: read input[name=...] values out of the section and merge.
export const mergeAutofilledFields = (state, container, nameByKey) => {
  if (!container) return state
  const merged = { ...state }
  for (const [key, inputName] of Object.entries(nameByKey)) {
    if (String(merged[key] || '').trim()) continue
    const el = container.querySelector(`input[name="${inputName}"]`)
    if (el && el.value.trim()) merged[key] = el.value
  }
  return merged
}

export const FAMILY_INPUT_NAMES = {
  phone: 'phone', address_line1: 'address-line1', address_line2: 'address-line2',
  city: 'city', state: 'state', postal_code: 'zip',
}

// First validation error for the org's registration questions, or null.
// Family-level questions hold a single value; per_student questions hold
// {kidUserId: value} and every kid on the registration must answer required
// ones (kidsList = the kids as the server knows them, with user_id).
export const firstQuestionError = (questions, answers, kidsList) => {
  const empty = (q, v) => (q.type === 'multi' ? !(v || []).length : !(v || '').trim())
  for (const q of questions || []) {
    if (!q.required) continue
    if (q.per_student) {
      for (const k of kidsList || []) {
        if (empty(q, (answers[q.key] || {})[k.user_id])) {
          return `Please answer for ${k.first_name || k.name || 'each child'}: ${q.label}`
        }
      }
    } else if (empty(q, answers[q.key])) {
      return `Please answer: ${q.label}`
    }
  }
  return null
}

// First validation error for the school-records step, or null. Mirrors the
// backend's validate_destination so a family sees the problem before a round
// trip. Exported for unit tests, like firstQuestionError above.
export const firstDestinationError = (kidsList, destinations) => {
  const who = (k) => (k.first_name || k.name || 'your student').trim()
  for (const k of kidsList || []) {
    const d = (destinations || {})[k.user_id] || {}
    if (!d.destination_type) return `Choose where ${who(k)}'s records should go`
    if (d.destination_type !== 'school') continue
    if (!(d.school_name || '').trim()) return `Enter the school ${who(k)} attends`
    if (d.auto_send_consent && !(d.registrar_email || '').trim()) {
      return `Add a registrar email for ${who(k)}, or untick sending the transcript automatically`
    }
  }
  return null
}

// What to try when a photo won't attach — written for the common iPhone case
// (the original lives in iCloud and Safari silently fails to fetch it).
export const PHOTO_TIPS = "That photo didn't come through. On iPhones this usually means the "
  + 'photo has to download from iCloud first. Try taking a new photo with the camera '
  + 'instead of choosing from your library, connect to Wi-Fi and try again, or finish '
  + 'this form on a computer — your progress is saved.'

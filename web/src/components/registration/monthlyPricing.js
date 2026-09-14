/**
 * Monthly program pricing for the registration funnel -- the browser-side
 * mirror of backend/services/registration_pricing.py, so the total a family
 * watches change as they tick add-ons is the total Stripe will ask them for.
 * The server prices from its own copy of the rules; this one only draws.
 *
 * A plan is the normalized `monthly` block the config endpoint returns:
 *   { per_student_cents, family_cap_cents, add_ons: [{ key, label,
 *     description, amount_cents, includes_program_fee }] }
 * Students are [{ id, name, add_ons: [key] }].
 */

export const PROGRAM_FEE_KEY = 'program_fee'

const cents = (v) => {
  const n = Math.round(Number(v || 0))
  return Number.isFinite(n) && n > 0 ? n : 0
}

// Normalize a raw config block (the SIS editor builds one from form fields; the
// funnel gets one already normalized). null when nothing bills monthly.
export const monthlyPlanFrom = (raw) => {
  if (!raw || typeof raw !== 'object') return null
  const perStudent = cents(raw.per_student_cents)
  const familyCap = cents(raw.family_cap_cents)
  const seen = new Set()
  const addOns = (raw.add_ons || []).flatMap((a) => {
    if (!a || typeof a !== 'object') return []
    const key = String(a.key || '').trim()
    const label = String(a.label || '').trim()
    const amount = cents(a.amount_cents)
    if (!key || !label || !amount || seen.has(key) || key === PROGRAM_FEE_KEY) return []
    seen.add(key)
    return [{
      key, label, description: String(a.description || '').trim(),
      amount_cents: amount, includes_program_fee: !!a.includes_program_fee,
    }]
  })
  if (!perStudent && !addOns.length) return null
  return { per_student_cents: perStudent, family_cap_cents: familyCap, add_ons: addOns }
}

// [{ key, label, amount_cents, students: [names], capped }] -- the program fee
// counts only students without an includes-the-fee add-on, then the family
// cap applies; each chosen add-on is its own line per student.
export const monthlyLineItems = (plan, students) => {
  if (!plan) return []
  const kids = students || []
  const byKey = Object.fromEntries((plan.add_ons || []).map((a) => [a.key, a]))
  const covered = new Set()
  for (const kid of kids) {
    for (const key of kid.add_ons || []) {
      if (byKey[key]?.includes_program_fee) covered.add(kid.id)
    }
  }
  const uncovered = kids.filter((k) => !covered.has(k.id))
  const items = []
  let program = (plan.per_student_cents || 0) * uncovered.length
  const capped = !!plan.family_cap_cents && program > plan.family_cap_cents
  if (capped) program = plan.family_cap_cents
  if (program > 0) {
    items.push({ key: PROGRAM_FEE_KEY, label: 'Program fee', amount_cents: program,
      students: uncovered.map((k) => k.name), capped })
  }
  for (const addOn of plan.add_ons || []) {
    for (const kid of kids) {
      if ((kid.add_ons || []).includes(addOn.key)) {
        items.push({ key: addOn.key, label: addOn.label, amount_cents: addOn.amount_cents,
          students: [kid.name], capped: false })
      }
    }
  }
  return items
}

export const monthlyTotalCents = (plan, students) =>
  monthlyLineItems(plan, students).reduce((sum, i) => sum + i.amount_cents, 0)

// "$50 per student each month, capped at $150 per family."
export const monthlyPlanSentence = (plan, fmt) => {
  if (!plan?.per_student_cents) return ''
  const per = `${fmt(plan.per_student_cents)} per student each month`
  return plan.family_cap_cents ? `${per}, capped at ${fmt(plan.family_cap_cents)} per family.` : `${per}.`
}

// Toggle one add-on for one student in a { [studentId]: [keys] } selection.
export const toggleAddOn = (selection, studentId, key, on) => {
  const current = new Set(selection?.[studentId] || [])
  if (on) current.add(key); else current.delete(key)
  return { ...(selection || {}), [studentId]: [...current].sort() }
}

// Students as the pricing sees them, from the funnel's server-known kids (or,
// in preview, the local kid cards) plus the family's current selection.
export const studentsForPricing = (kids, selection) => (kids || []).map((k) => {
  const id = k.user_id || k._key || k.id
  return {
    id,
    name: k.preferred_name || k.first_name || (k.name || '').split(' ')[0] || 'Student',
    add_ons: selection?.[id] || k.add_ons || [],
  }
})

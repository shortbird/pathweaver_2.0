/**
 * Cents as dollars, one way.
 *
 * Ten copies of `money(cents)` lived across the funnel, the builder, the
 * embeds, the family billing page and five SIS pages, and disagreed on what
 * nothing looks like ("--", "$0.00", "", null), on negatives ("$-5.00" vs
 * "-$5.00") and on thousands ("$1500.00" vs "$1,500.00")
 * (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, A6; M7 in
 * docs/sis/CONSOLIDATION_PLAN.md). The rule:
 *
 *   formatCents(12345)      -> "$123.45"
 *   formatCents(150000)     -> "$1,500.00"
 *   formatCents(-500)       -> "−$5.00"   (a refund, a credit)
 *   formatCents(0)          -> "$0.00"
 *   formatCents(null)       -> "—"       (nothing on file; `blank` overrides)
 *   formatCents(5000, { compact: true }) -> "$50"   (a price read as a plan,
 *                                                   "$50 per student each month")
 *
 * formatDollars is the same rule for a value already in dollars (the public
 * embed's payload, a class's supply_fee).
 */

const usd = (dollars, compact) => dollars.toLocaleString('en-US', {
  minimumFractionDigits: compact && Number.isInteger(dollars) ? 0 : 2,
  maximumFractionDigits: 2,
})

export function formatCents(cents, { blank = '—', compact = false } = {}) {
  if (cents == null || cents === '' || Number.isNaN(Number(cents))) return blank
  const n = Math.round(Number(cents))
  const sign = n < 0 ? '−' : ''
  return `${sign}$${usd(Math.abs(n) / 100, compact)}`
}

export function formatDollars(dollars, options) {
  if (dollars == null || dollars === '' || Number.isNaN(Number(dollars))) return (options && options.blank !== undefined) ? options.blank : '—'
  return formatCents(Math.round(Number(dollars) * 100), options)
}

export default formatCents

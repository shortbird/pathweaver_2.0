/**
 * Extracted from pages/ScheduleBuilderPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

const ageBandText = (c) => (c.min_age != null && c.max_age != null
  ? `ages ${c.min_age}–${c.max_age}`
  : c.min_age != null ? `ages ${c.min_age}+` : `up to age ${c.max_age}`)

// ── Block-based tuition ───────────────────────────────────────────────────────
// The org can define weekly-block pricing tiers (sis_settings.block_pricing,
// e.g. 5 blocks = $1500/yr). A class's block count is how many teaching blocks
// its meetings overlap each week — a 2-hour class is 2 blocks, a full school
// day is 5 (the labeled Lunch block never counts) — unless the class carries a
// billing_blocks override (e.g. Exceptional Kids bills as 4 for its staffing
// ratio). Tuition is the LESSER of the per-class price sum and the cheapest
// tier covering the total (below-tier schedules stay per-class priced). UFA
// academy students pay a flat plan price instead, with a minimum block count.
// Supply fees roll into the financed total; the installment plan adds the
// org's convenience fee and splits into equal payments.

export default ageBandText

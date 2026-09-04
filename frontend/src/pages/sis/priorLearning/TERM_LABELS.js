/**
 * Extracted from sis/PriorLearningPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

const TERM_LABELS = { full_year: 'Full year', semester: 'Semester' }

/**
 * The suggestion, drawn as the transcript it is proposing.
 *
 * A registrar's question is "what would this put on the transcript, line by
 * line" — a paragraph of prose makes them reconstruct the table in their head
 * before they can check it, and a number nobody checks is a number nobody
 * caught. So: one row per course, subject and term and credit in columns,
 * confidence attached to the row it belongs to, and the credit/XP total
 * spelled out at the foot the way the transcript will show it.
 *
 * Still labelled a suggestion, and still requiring "Use these numbers" — the
 * table is a preview of a proposal, not a record of a decision.
 */

export default TERM_LABELS

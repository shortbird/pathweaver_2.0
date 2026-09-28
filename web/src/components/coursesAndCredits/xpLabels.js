// How Courses and Credits words an amount (2026-09-28): XP is what a student
// earns, credits are what the diploma counts. Anything earned, pending or
// broken down by source is XP; a credit figure appears only beside it, and
// only where the diploma's own units matter (a course's size, a requirement).
// "0.01 credit" says nothing to a family; "25 XP" is what the task showed.
import { XP_PER_CREDIT, formatCredits } from '../../utils/creditRequirements'

/** "1,250 XP" */
export const xpLabel = (xp) => `${Math.round(Number(xp) || 0).toLocaleString()} XP`

/** "2,000 XP (1 credit)" */
export const xpWithCredits = (xp) => `${xpLabel(xp)} (${formatCredits((Number(xp) || 0) / XP_PER_CREDIT)} credit)`

/** Credits as the XP they stand for. */
export const creditsToXp = (credits) => (Number(credits) || 0) * XP_PER_CREDIT

/** "Every 2,000 XP is one credit." */
export const XP_PER_CREDIT_LINE = `Every ${xpLabel(XP_PER_CREDIT)} is one credit.`

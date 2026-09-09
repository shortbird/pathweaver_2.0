/**
 * Credit requirements for an accredited high school diploma.
 *
 * The table and the arithmetic moved to `@shared/credits` so the backend and
 * this app read one definition of how much XP is a credit and how many credits
 * a subject needs. This file stays as the import path the app already uses --
 * fifteen modules import from here, and rewriting them buys nothing.
 *
 * The four-copy history that made the move necessary is recorded in
 * shared/data/credits.json and in
 * src/components/credit-dashboard/studentContextCredits.test.jsx.
 */

export {
  CREDIT_REQUIREMENTS,
  TOTAL_CREDITS_REQUIRED,
  TOTAL_XP_REQUIRED,
  XP_PER_CREDIT,
  ELECTIVE_SUBJECT,
  calculateCreditsFromXP,
  calculateTotalCredits,
  getCreditProgress,
  getAllCreditProgress,
  formatCredits,
  getCreditStanding,
  splitCreditProgress,
  creditsRemaining,
  creditsBeyondRequirement,
  meetsGraduationRequirements,
} from '@shared/credits'

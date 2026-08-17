/**
 * Credit requirements for accredited high school diploma
 * Based on 2000 XP = 1 credit conversion ratio
 */

export const CREDIT_REQUIREMENTS = {
  'language_arts': {
    displayName: 'Language Arts',
    credits: 4.0,
    xpRequired: 8000,
    description: 'English, Literature, Writing, and Reading Comprehension'
  },
  'math': {
    displayName: 'Mathematics',
    credits: 3.0,
    xpRequired: 6000,
    description: 'Algebra, Geometry, Statistics, and Applied Mathematics'
  },
  'science': {
    displayName: 'Science',
    credits: 3.0,
    xpRequired: 6000,
    description: 'Biology, Chemistry, Physics, and Earth Sciences'
  },
  'social_studies': {
    displayName: 'Social Studies',
    credits: 4.0,
    xpRequired: 8000,
    description: 'History, Government, Geography, and Economics'
  },
  'financial_literacy': {
    displayName: 'Financial Literacy',
    credits: 0.5,
    xpRequired: 1000,
    description: 'Personal Finance, Economics, and Financial Planning'
  },
  'health': {
    displayName: 'Health',
    credits: 0.5,
    xpRequired: 1000,
    description: 'Health Education, Nutrition, and Wellness'
  },
  'pe': {
    displayName: 'Physical Education',
    credits: 2.0,
    xpRequired: 4000,
    description: 'Physical Fitness, Sports, and Exercise Science'
  },
  'fine_arts': {
    displayName: 'Fine Arts',
    credits: 1.5,
    xpRequired: 3000,
    description: 'Visual Arts, Music, Theater, and Creative Expression'
  },
  'cte': {
    displayName: 'Career & Technical Education',
    credits: 1.0,
    xpRequired: 2000,
    description: 'Career Preparation, Technical Skills, and Vocational Training'
  },
  'digital_literacy': {
    displayName: 'Digital Literacy',
    credits: 0.5,
    xpRequired: 1000,
    description: 'Computer Skills, Digital Citizenship, and Technology'
  },
  'electives': {
    displayName: 'Electives',
    credits: 4.0,
    xpRequired: 8000,
    description: 'Additional courses in areas of student interest and exploration'
  }
};

export const TOTAL_CREDITS_REQUIRED = 24.0;
export const TOTAL_XP_REQUIRED = 48000;
export const XP_PER_CREDIT = 2000;

/**
 * Calculate credits earned from XP
 * @param {number} xp - XP earned in subject
 * @returns {number} - Credits earned (rounded to 1 decimal place)
 */
export const calculateCreditsFromXP = (xp) => {
  return Math.round((xp / XP_PER_CREDIT) * 10) / 10;
};

/**
 * Calculate total credits earned across all subjects, capped per-subject at
 * each subject's requirement. Over-earning in one subject (e.g., 5 elective
 * credits when only 4 are required) does not inflate the headline total.
 * @param {Object} subjectXP - Object with subject keys and XP values
 * @returns {number} - Total credits earned (max = sum of all requirements)
 */
export const calculateTotalCredits = (subjectXP) => {
  return Object.entries(subjectXP).reduce((total, [subject, xp]) => {
    const requirement = CREDIT_REQUIREMENTS[subject];
    if (requirement) {
      const earned = calculateCreditsFromXP(xp);
      return total + Math.min(earned, requirement.credits);
    }
    return total;
  }, 0);
};

/**
 * Get credit progress for a subject
 * @param {string} subject - Subject key
 * @param {number} xp - XP earned in subject
 * @returns {Object} - Credit progress information
 */
export const getCreditProgress = (subject, xp) => {
  const requirement = CREDIT_REQUIREMENTS[subject];
  if (!requirement) return null;

  const creditsEarned = calculateCreditsFromXP(xp);
  const progressPercentage = Math.min((creditsEarned / requirement.credits) * 100, 100);

  return {
    subject,
    displayName: requirement.displayName,
    description: requirement.description,
    creditsEarned,
    creditsRequired: requirement.credits,
    xpEarned: xp,
    xpRequired: requirement.xpRequired,
    progressPercentage,
    isComplete: creditsEarned >= requirement.credits
  };
};

/**
 * Get all subjects with their credit progress
 * @param {Object} subjectXP - Object with subject keys and XP values
 * @returns {Array} - Array of credit progress objects, sorted by progress
 */
export const getAllCreditProgress = (subjectXP) => {
  return Object.keys(CREDIT_REQUIREMENTS).map(subject => {
    const xp = subjectXP[subject] || 0;
    return getCreditProgress(subject, xp);
  }).sort((a, b) => {
    // Sort by progress percentage descending, then by credits required descending
    if (b.progressPercentage !== a.progressPercentage) {
      return b.progressPercentage - a.progressPercentage;
    }
    return b.creditsRequired - a.creditsRequired;
  });
};

/** The one bucket defined as "anything", so the only one surplus may flow into. */
export const ELECTIVE_SUBJECT = 'electives';

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * A student's credit standing, with surplus credit allowed to overflow into
 * Electives.
 *
 * THE RULE. A subject earned beyond its requirement used to have its excess
 * discarded: 2.25 CTE against a 1.0 requirement counted as 1.0 and the other
 * 1.25 vanished. That is not how a transcript works. Electives are the bucket
 * defined as "anything", so a student who takes three years of engineering when
 * one satisfies CTE doesn't forfeit two credits — the extra two ARE electives.
 *
 * So surplus flows one way, into Electives only, capped at the Electives
 * requirement. It never flows between academic subjects: Math surplus must not
 * satisfy a Science requirement, or the diploma would attest to science the
 * student never did.
 *
 * The DATA does not move. A course stays filed under the subject it was taught
 * as — the transcript still lists Aerospace Engineering under CTE. This is the
 * requirement-satisfaction reading of that transcript, which is exactly the
 * arithmetic a registrar does by hand.
 *
 * Two totals come out, and they answer different questions. Collapsing them
 * into one is what made a student's XP disagree with their headline credits:
 *   totalEarned  — what is on the transcript.
 *   totalApplied — how much of it closes a graduation requirement.
 *
 * @returns {{progress: Array, totalEarned: number, totalApplied: number,
 *            beyond: number, overflowApplied: number, remaining: number}}
 */
export const getCreditStanding = (subjectXP = {}) => {
  const base = getAllCreditProgress(subjectXP);

  // Surplus from every subject EXCEPT electives — elective over-earning has
  // nowhere left to go, so it is beyond by definition.
  const donors = base
    .filter((c) => c.subject !== ELECTIVE_SUBJECT)
    .map((c) => ({ subject: c.subject, surplus: round2(Math.max(0, c.creditsEarned - c.creditsRequired)) }))
    .filter((d) => d.surplus > 0)
    // Deterministic order so the same transcript always allocates the same way.
    .sort((a, b) => (b.surplus - a.surplus) || a.subject.localeCompare(b.subject));

  const elective = base.find((c) => c.subject === ELECTIVE_SUBJECT) || null;
  const electiveGap = elective
    ? round2(Math.max(0, elective.creditsRequired - elective.creditsEarned))
    : 0;

  // Hand out the spill donor by donor, so each contributing subject can say how
  // much of its surplus actually went somewhere.
  let left = electiveGap;
  const givenBy = {};
  for (const donor of donors) {
    if (left <= 0) break;
    const given = round2(Math.min(donor.surplus, left));
    givenBy[donor.subject] = given;
    left = round2(left - given);
  }
  const overflowApplied = round2(electiveGap - left);

  const progress = base.map((credit) => {
    const overflowOut = givenBy[credit.subject] || 0;
    const overflowIn = credit.subject === ELECTIVE_SUBJECT ? overflowApplied : 0;
    const creditsCounted = round2(
      Math.min(credit.creditsEarned + overflowIn, credit.creditsRequired)
    );
    return {
      ...credit,
      overflowIn,
      overflowOut,
      creditsCounted,
      // Credit this subject earned that closes nobody's requirement.
      creditsBeyond: round2(
        Math.max(0, credit.creditsEarned - credit.creditsRequired) - overflowOut
      ),
      isComplete: creditsCounted >= credit.creditsRequired,
      progressPercentage: Math.min(
        ((credit.creditsEarned + overflowIn) / credit.creditsRequired) * 100, 100
      ),
    };
  });

  const totalEarned = round2(progress.reduce((s, c) => s + c.creditsEarned, 0));
  const totalApplied = round2(progress.reduce((s, c) => s + c.creditsCounted, 0));

  return {
    progress,
    totalEarned,
    totalApplied,
    beyond: round2(totalEarned - totalApplied),
    overflowApplied,
    remaining: round2(
      progress.reduce((s, c) => s + Math.max(0, c.creditsRequired - c.creditsCounted), 0)
    ),
  };
};

/**
 * Split credit progress into what's left and what's done, in the order a
 * student wants to read it.
 *
 * Unfinished first — the panel's job is "what do I do next", and a wall of
 * finished bars pushed that to the bottom of the list. Within the unfinished,
 * closest-to-done leads, so the nearest win is the first thing seen.
 *
 * Finished subjects keep their own group rather than being hidden: the growing
 * pile IS the reward, and a student should be able to look at it.
 *
 * @param {Array} progress - from getAllCreditProgress
 * @returns {{remaining: Array, complete: Array}}
 */
export const splitCreditProgress = (progress = []) => {
  const remaining = progress
    .filter((c) => !c.isComplete)
    .sort((a, b) => b.progressPercentage - a.progressPercentage);
  const complete = progress
    .filter((c) => c.isComplete)
    .sort((a, b) => b.creditsRequired - a.creditsRequired);
  return { remaining, complete };
};

/**
 * Credits still needed, counting only what closes a gap.
 *
 * Deliberately not `TOTAL_CREDITS_REQUIRED - totalEarned`: over-earning one
 * subject can't fill another's gap, so summing the per-subject shortfalls is
 * the only figure that answers "how much is actually left".
 */
export const creditsRemaining = (progress = []) => Math.round(
  progress.reduce((sum, c) => sum + Math.max(0, c.creditsRequired - c.creditsEarned), 0) * 100
) / 100;

/**
 * Credit earned in a subject beyond its requirement. Real, on the transcript,
 * and NOT counted toward the 24 — which is the whole reason to show it. A row
 * reading "2.3/1" with a full bar otherwise looks like a bug, and silently
 * explains none of the gap between a student's XP and their headline total.
 */
export const creditsBeyondRequirement = (credit) => Math.round(
  Math.max(0, credit.creditsEarned - credit.creditsRequired) * 100
) / 100;

/**
 * Check if student has earned enough credits for graduation. A real
 * accredited diploma requires the per-subject minimum in EVERY subject —
 * over-loading one subject can't substitute for unmet requirements in another.
 * @param {Object} subjectXP - Object with subject keys and XP values
 * @returns {boolean} - Whether student meets graduation requirements
 */
export const meetsGraduationRequirements = (subjectXP) => {
  // Reads the same standing the panel shows, so a student can never be told
  // every subject is complete while this says otherwise. Surplus counts only
  // where getCreditStanding lets it: into Electives, never between academics.
  return getCreditStanding(subjectXP).progress.every((credit) => {
    return credit.isComplete;
  });
};
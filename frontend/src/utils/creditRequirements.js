/**
 * Credit requirements for accredited high school diploma
 * Based on 1000 XP = 1 credit conversion ratio
 */

export const CREDIT_REQUIREMENTS = {
  'language_arts': {
    displayName: 'Language Arts',
    credits: 4.0,
    xpRequired: 4000,
    description: 'English, Literature, Writing, and Reading Comprehension'
  },
  'math': {
    displayName: 'Mathematics',
    credits: 3.0,
    xpRequired: 3000,
    description: 'Algebra, Geometry, Statistics, and Applied Mathematics'
  },
  'science': {
    displayName: 'Science',
    credits: 3.0,
    xpRequired: 3000,
    description: 'Biology, Chemistry, Physics, and Earth Sciences'
  },
  'social_studies': {
    displayName: 'Social Studies',
    credits: 3.5,
    xpRequired: 3500,
    description: 'History, Government, Geography, and Economics'
  },
  'financial_literacy': {
    displayName: 'Financial Literacy',
    credits: 0.5,
    xpRequired: 500,
    description: 'Personal Finance, Economics, and Financial Planning'
  },
  'health': {
    displayName: 'Health',
    credits: 0.5,
    xpRequired: 500,
    description: 'Health Education, Nutrition, and Wellness'
  },
  'pe': {
    displayName: 'Physical Education',
    credits: 2.0,
    xpRequired: 2000,
    description: 'Physical Fitness, Sports, and Exercise Science'
  },
  'fine_arts': {
    displayName: 'Fine Arts',
    credits: 1.5,
    xpRequired: 1500,
    description: 'Visual Arts, Music, Theater, and Creative Expression'
  },
  'cte': {
    displayName: 'Career & Technical Education',
    credits: 1.0,
    xpRequired: 1000,
    description: 'Career Preparation, Technical Skills, and Vocational Training'
  },
  'digital_literacy': {
    displayName: 'Digital Literacy',
    credits: 0.5,
    xpRequired: 500,
    description: 'Computer Skills, Digital Citizenship, and Technology'
  },
  'electives': {
    displayName: 'Electives',
    credits: 4.0,
    xpRequired: 4000,
    description: 'Additional courses in areas of student interest and exploration'
  }
};

export const TOTAL_CREDITS_REQUIRED = 24.0;
export const TOTAL_XP_REQUIRED = 24000;
export const XP_PER_CREDIT = 1000;

/**
 * Calculate credits earned from XP
 * @param {number} xp - XP earned in subject
 * @returns {number} - Credits earned (rounded to 1 decimal place)
 */
export const calculateCreditsFromXP = (xp) => {
  return Math.round((xp / XP_PER_CREDIT) * 10) / 10;
};

/**
 * Calculate total credits earned across all subjects
 * @param {Object} subjectXP - Object with subject keys and XP values
 * @returns {number} - Total credits earned
 */
export const calculateTotalCredits = (subjectXP) => {
  return Object.entries(subjectXP).reduce((total, [subject, xp]) => {
    if (CREDIT_REQUIREMENTS[subject]) {
      return total + calculateCreditsFromXP(xp);
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

/**
 * Check if student has earned enough credits for graduation
 * @param {Object} subjectXP - Object with subject keys and XP values
 * @returns {boolean} - Whether student meets graduation requirements
 */
export const meetsGraduationRequirements = (subjectXP) => {
  const totalCredits = calculateTotalCredits(subjectXP);
  return totalCredits >= TOTAL_CREDITS_REQUIRED;
};
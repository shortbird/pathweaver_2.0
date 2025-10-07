// Tier mapping utility for the new 4-tier subscription system

export const TIER_DISPLAY_NAMES = {
  // New tier names (case-sensitive to match database)
  Explore: 'Explore',
  Accelerate: 'Accelerate',
  Achieve: 'Achieve',
  Excel: 'Excel'
};

export const getTierDisplayName = (backendTier) => {
  if (!backendTier) return 'Explore';
  return TIER_DISPLAY_NAMES[backendTier] || backendTier;
};

export const TIER_FEATURES = {
  Explore: {
    name: 'Explore',
    backendValue: 'Explore',
    stripeValue: null,
    price: 0,
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      'Access quest library',
      'Track ongoing quests',
      'Mark tasks complete (no evidence submission)',
      'No XP earned',
      'No Optio Portfolio Diploma'
    ],
    limitations: [],
    buttonText: 'Start Free',
    buttonDisabled: false,
    description: 'Perfect for exploring the platform'
  },
  Accelerate: {
    name: 'Accelerate',
    backendValue: 'Accelerate',
    stripeValue: 'Accelerate',
    price: 39.99,
    monthlyPrice: 39.99,
    yearlyPrice: 449.99,  // Save ~$30/year
    yearlySavings: 30,
    features: [
      'Everything in Explore, plus:',
      'Access to a support team of Optio educators',
      'Team up with other learners for XP bonuses',
      'Optio Portfolio Diploma'
    ],
    limitations: [
      'Traditionally-accredited Diploma'
    ],
    buttonText: 'Get Accelerate',
    buttonDisabled: false,
    popular: true,
    description: 'For dedicated learners ready to grow'
  },
  Achieve: {
    name: 'Achieve',
    backendValue: 'Achieve',
    stripeValue: 'Achieve',
    price: 199.99,
    monthlyPrice: 199.99,
    yearlyPrice: 2199.99,  // Save ~$200/year
    yearlySavings: 200,
    features: [
      'Everything in Accelerate, plus:',
      'Advanced AI tutor (100 messages/day)',
      'Priority support responses',
      'Team collaboration tools',
      'Custom learning paths'
    ],
    limitations: [],
    buttonText: 'Get Achieve',
    buttonDisabled: false,
    description: 'Advanced learning with AI guidance'
  },
  Excel: {
    name: 'Excel',
    backendValue: 'Excel',
    stripeValue: 'Excel',
    price: 499.99,
    monthlyPrice: 499.99,
    yearlyPrice: 5499.99,  // Save ~$500/year
    yearlySavings: 500,
    features: [
      'Everything in Achieve, plus:',
      'TWO diplomas: Optio Portfolio + Accredited HS Diploma',
      'Personal learning guide & 1-on-1 teacher support',
      'Regular check-ins with licensed educators',
      'Connect with Optio\'s network of business leaders and mentors'
    ],
    limitations: [],
    buttonText: 'Join Excel',
    buttonDisabled: false,
    premium: true,
    description: 'A personalized private school experience'
  }
};

// Get tier features by backend value
export const getTierFeaturesByBackendValue = (backendTier) => {
  if (!backendTier) return TIER_FEATURES.Explore;
  return TIER_FEATURES[backendTier] || TIER_FEATURES.Explore;
};

// Check if user has access to a feature based on tier
export const hasFeatureAccess = (userTier, requiredTier) => {
  const tierOrder = {
    Explore: 0,
    Accelerate: 1,
    Achieve: 2,
    Excel: 3
  };

  const userLevel = tierOrder[userTier] ?? 0;
  const requiredLevel = tierOrder[requiredTier] ?? 0;

  return userLevel >= requiredLevel;
};

// Get the next upgrade tier
export const getNextTier = (currentTier) => {
  const tierProgression = {
    Explore: 'Accelerate',
    Accelerate: 'Achieve',
    Achieve: 'Excel',
    Excel: null
  };

  return tierProgression[currentTier];
};

// Format price for display
export const formatPrice = (price, period = 'month') => {
  if (price === 0) return 'Free';
  return `$${price}/${period}`;
};

// Get tier badge color for UI
export const getTierBadgeColor = (tier) => {
  const colors = {
    Explore: 'bg-gray-100 text-gray-800',
    Accelerate: 'bg-blue-100 text-blue-800',
    Achieve: 'bg-purple-100 text-purple-800',
    Excel: 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white'
  };

  return colors[tier] || colors.Explore;
};

// Check if tier is legacy (for migration purposes - always returns false now)
export const isLegacyTier = (tier) => {
  return false;  // No legacy tiers in new system
};

// Convert legacy tier to new tier (no-op in new system)
export const convertLegacyTier = (tier) => {
  return tier || 'Explore';
};

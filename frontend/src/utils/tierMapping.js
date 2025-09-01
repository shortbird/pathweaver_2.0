// Tier mapping utility for converting backend tier names to frontend display names

export const TIER_DISPLAY_NAMES = {
  // Legacy tier names (for backwards compatibility)
  explorer: 'Free',
  creator: 'Supported',
  visionary: 'Academy',
  // New tier names
  free: 'Free',
  supported: 'Supported',
  academy: 'Academy'
};

export const getTierDisplayName = (backendTier) => {
  if (!backendTier) return 'Free';
  return TIER_DISPLAY_NAMES[backendTier.toLowerCase()] || backendTier;
};

export const TIER_FEATURES = {
  free: {
    name: 'Free',
    backendValue: 'free',
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
  supported: {
    name: 'Supported',
    backendValue: 'supported',
    stripeValue: 'supported',
    price: 39.99,
    monthlyPrice: 39.99,
    yearlyPrice: 429.88,  // Save $50/year
    yearlySavings: 50,
    features: [
      'Everything in Free, plus:',
      'Access to a support team of Optio educators',
      'Team up with other Supported learners for XP bonuses',
      'Optio Portfolio Diploma',
      'Traditionally-accredited Diploma'
    ],
    limitations: [],
    buttonText: 'Get Supported',
    buttonDisabled: false,
    popular: true,
    description: 'For dedicated learners ready to grow'
  },
  academy: {
    name: 'Academy',
    backendValue: 'academy',
    stripeValue: 'academy',
    price: 499.99,
    monthlyPrice: 499.99,
    yearlyPrice: 5499.88,  // Save $500/year
    yearlySavings: 500,
    features: [
      'Everything in Supported, plus:',
      'TWO diplomas: Optio Portfolio + Accredited HS Diploma',
      'Personal learning guide & 1-on-1 teacher support',
      'Regular check-ins with licensed educators',
      'Connect with Optio\'s network of business leaders and mentors'
    ],
    limitations: [],
    buttonText: 'Join Academy',
    buttonDisabled: false,
    premium: true,
    description: 'A personalized private school experience'
  }
};

// Get tier features by backend value
export const getTierFeaturesByBackendValue = (backendTier) => {
  if (!backendTier) return TIER_FEATURES.free;
  
  // Map both legacy and new tier names
  const tierMap = {
    // Legacy names
    explorer: TIER_FEATURES.free,
    creator: TIER_FEATURES.supported,
    visionary: TIER_FEATURES.academy,
    // New names
    free: TIER_FEATURES.free,
    supported: TIER_FEATURES.supported,
    academy: TIER_FEATURES.academy
  };
  
  return tierMap[backendTier.toLowerCase()] || TIER_FEATURES.free;
};

// Check if user has access to a feature based on tier
export const hasFeatureAccess = (userTier, requiredTier) => {
  const tierOrder = {
    // Legacy names
    explorer: 0,
    creator: 1,
    visionary: 2,
    // New names
    free: 0,
    supported: 1,
    academy: 2
  };
  
  const userLevel = tierOrder[userTier?.toLowerCase()] ?? 0;
  const requiredLevel = tierOrder[requiredTier?.toLowerCase()] ?? 0;
  
  return userLevel >= requiredLevel;
};

// Get the next upgrade tier
export const getNextTier = (currentTier) => {
  const tierProgression = {
    free: 'supported',
    explorer: 'supported',  // Legacy
    supported: 'academy',
    creator: 'academy',  // Legacy
    academy: null,
    visionary: null  // Legacy
  };
  
  return tierProgression[currentTier?.toLowerCase()];
};

// Format price for display
export const formatPrice = (price, period = 'month') => {
  if (price === 0) return 'Free';
  return `$${price}/${period}`;
};

// Get tier badge color for UI
export const getTierBadgeColor = (tier) => {
  const colors = {
    free: 'bg-gray-100 text-gray-800',
    explorer: 'bg-gray-100 text-gray-800',  // Legacy
    supported: 'bg-blue-100 text-blue-800',
    creator: 'bg-blue-100 text-blue-800',  // Legacy
    academy: 'bg-purple-100 text-purple-800',
    visionary: 'bg-purple-100 text-purple-800'  // Legacy
  };
  
  return colors[tier?.toLowerCase()] || colors.free;
};

// Check if tier is legacy
export const isLegacyTier = (tier) => {
  const legacyTiers = ['explorer', 'creator', 'visionary'];
  return legacyTiers.includes(tier?.toLowerCase());
};

// Convert legacy tier to new tier
export const convertLegacyTier = (legacyTier) => {
  const conversionMap = {
    explorer: 'free',
    creator: 'supported',
    visionary: 'academy'
  };
  
  return conversionMap[legacyTier?.toLowerCase()] || legacyTier;
};
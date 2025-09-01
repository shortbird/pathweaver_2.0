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
    backendValue: 'free',  // Updated to use new tier name
    stripeValue: null,  // No Stripe price for free tier
    price: 0,
    monthlyPrice: 0,
    features: [
      'Access to 5 basic quests',
      'Public diploma page',
      'Community support',
      'Track your learning progress'
    ],
    limitations: [
      'Limited to 5 active quests',
      'Basic diploma customization'
    ],
    buttonText: 'Current Plan',
    buttonDisabled: true
  },
  supported: {
    name: 'Supported',
    backendValue: 'supported',  // Updated to use new tier name
    stripeValue: 'supported',  // Used for Stripe checkout
    price: 10,
    monthlyPrice: 10,
    yearlyPrice: 100,  // Optional yearly discount
    features: [
      'Everything in Free tier',
      'Unlimited active quests',
      'Priority quest access',
      'Enhanced diploma customization',
      'Priority support',
      'Custom quest submissions',
      'Advanced analytics'
    ],
    limitations: [],
    buttonText: 'Upgrade to Supported',
    buttonDisabled: false,
    popular: true  // Mark as popular/recommended
  },
  academy: {
    name: 'Academy',
    backendValue: 'academy',  // Updated to use new tier name
    stripeValue: 'academy',  // Used for Stripe checkout
    price: 25,
    monthlyPrice: 25,
    yearlyPrice: 250,  // Optional yearly discount
    features: [
      'Everything in Supported tier',
      '1-on-1 mentorship sessions',
      'Custom learning paths',
      'Verified certificates',
      'Quarterly progress reviews',
      'College application support',
      'Exclusive academy content',
      'Direct advisor access'
    ],
    limitations: [],
    buttonText: 'Upgrade to Academy',
    buttonDisabled: false
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
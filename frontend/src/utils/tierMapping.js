// Tier mapping utility for converting backend tier names to frontend display names

export const TIER_DISPLAY_NAMES = {
  explorer: 'Free',
  creator: 'Supported',
  visionary: 'Academy',
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
    backendValue: 'explorer',
    price: 0,
    monthlyPrice: 0,
    features: [
      'Access to basic quests',
      'Public diploma page',
      'Community support',
      'Track your learning progress'
    ],
    limitations: [
      'Limited to 3 active quests',
      'Basic diploma customization'
    ]
  },
  supported: {
    name: 'Supported',
    backendValue: 'creator',
    price: 10,
    monthlyPrice: 10,
    features: [
      'Everything in Free tier',
      'Unlimited active quests',
      'Priority quest access',
      'Enhanced diploma customization',
      'Email support',
      'Custom quest submissions'
    ],
    limitations: []
  },
  academy: {
    name: 'Academy',
    backendValue: 'visionary',
    price: 25,
    monthlyPrice: 25,
    features: [
      'Everything in Supported tier',
      'Personal advisor access',
      'Advanced analytics dashboard',
      'Priority support',
      'Exclusive academy quests',
      'Quarterly progress reviews',
      'College application support'
    ],
    limitations: []
  }
};

// Get tier features by backend value
export const getTierFeaturesByBackendValue = (backendTier) => {
  if (!backendTier) return TIER_FEATURES.free;
  
  const tierMap = {
    explorer: TIER_FEATURES.free,
    creator: TIER_FEATURES.supported,
    visionary: TIER_FEATURES.academy
  };
  
  return tierMap[backendTier.toLowerCase()] || TIER_FEATURES.free;
};

// Check if user has access to a feature based on tier
export const hasFeatureAccess = (userTier, requiredTier) => {
  const tierOrder = {
    explorer: 0,
    free: 0,
    creator: 1,
    supported: 1,
    visionary: 2,
    academy: 2
  };
  
  const userLevel = tierOrder[userTier?.toLowerCase()] || 0;
  const requiredLevel = tierOrder[requiredTier?.toLowerCase()] || 0;
  
  return userLevel >= requiredLevel;
};
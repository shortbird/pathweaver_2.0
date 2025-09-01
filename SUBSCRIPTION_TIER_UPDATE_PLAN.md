# Subscription Tier Name Update Implementation Plan

## Overview
Update subscription tier names across the entire frontend from:
- Explorer → Free
- Creator → Supported  
- Visionary → Academy

## Implementation Checklist

### Phase 1: Core Components & Pages

#### 1. **SubscriptionPage.jsx** (Primary subscription management)
- [ ] Update tier display names in UI
- [ ] Update tier selection buttons/cards
- [ ] Update pricing information display
- [ ] Update feature comparison table
- [ ] Update any tier-specific messaging

#### 2. **ProfilePage.jsx** (User profile display)
- [ ] Update current tier display
- [ ] Update upgrade prompts if present

#### 3. **DashboardPage.jsx** (Main user dashboard)
- [ ] Update tier-based welcome messages
- [ ] Update tier badges/indicators
- [ ] Update any tier-based feature gates

#### 4. **AdminPage.jsx** (Admin management)
- [ ] Update user tier display in admin tables
- [ ] Update tier filter options
- [ ] Update tier assignment dropdowns

#### 5. **HomePage.jsx** (Landing page)
- [ ] Update pricing section
- [ ] Update feature comparison
- [ ] Update CTAs related to tiers

### Phase 2: Context & State Management

#### 6. **AuthContext.jsx**
- [ ] Update any tier-related display logic
- [ ] Update tier comparison functions
- [ ] Keep backend values intact (explorer/creator/visionary)

### Phase 3: Demo Components

#### 7. **VisionaryTierModal.jsx & VisionaryTierModalUpdated.jsx**
- [ ] Rename component to AcademyTierModal
- [ ] Update all "Visionary" references to "Academy"
- [ ] Update modal content and descriptions

#### 8. **ConversionPanel.jsx**
- [ ] Update tier names in conversion prompts
- [ ] Update upgrade messaging

#### 9. **ComparisonView.jsx**
- [ ] Update tier comparison table
- [ ] Update feature lists for each tier

#### 10. **QuestSimulatorRedesigned.jsx & QuestExperience.jsx**
- [ ] Update tier-based quest access messages
- [ ] Update tier upgrade prompts

#### 11. **DiplomaCertificate.jsx & DiplomaGenerator.jsx**
- [ ] Update any tier badges on diplomas
- [ ] Update tier-based diploma features

#### 12. **DemoContext.jsx**
- [ ] Update demo tier selection options
- [ ] Update tier-based demo features

### Phase 4: Utility Functions & Constants

#### 13. **Create Tier Mapping Utility**
```javascript
// utils/tierMapping.js
export const TIER_DISPLAY_NAMES = {
  explorer: 'Free',
  creator: 'Supported',
  visionary: 'Academy',
  free: 'Free',
  supported: 'Supported',
  academy: 'Academy'
};

export const getTierDisplayName = (backendTier) => {
  return TIER_DISPLAY_NAMES[backendTier?.toLowerCase()] || backendTier;
};

export const TIER_FEATURES = {
  free: {
    name: 'Free',
    price: 0,
    features: [
      'Access to basic quests',
      'Public diploma page',
      'Community support'
    ]
  },
  supported: {
    name: 'Supported',
    price: 10,
    features: [
      'All Free features',
      'Priority quest access',
      'Enhanced diploma customization',
      'Email support'
    ]
  },
  academy: {
    name: 'Academy',
    price: 25,
    features: [
      'All Supported features',
      'Unlimited custom quests',
      'Personal advisor',
      'Advanced analytics',
      'Priority support'
    ]
  }
};
```

### Phase 5: Search & Replace Operations

#### 14. **Text Search & Replace**
Search for and replace (case-insensitive):
- "Explorer" → "Free" (when referring to tier)
- "Creator" → "Supported" (when referring to tier)
- "Visionary" → "Academy" (when referring to tier)

Be careful to:
- Only replace UI text, not backend variable names
- Check context to ensure it's tier-related
- Preserve capitalization patterns

### Phase 6: Testing & Verification

#### 15. **Test Each Component**
- [ ] Test SubscriptionPage tier display
- [ ] Test ProfilePage tier display
- [ ] Test DashboardPage tier features
- [ ] Test AdminPage tier management
- [ ] Test HomePage pricing display
- [ ] Test all demo components
- [ ] Test tier upgrade flows
- [ ] Test tier-based feature access

#### 16. **Visual Regression Testing**
- [ ] Screenshot each page before changes
- [ ] Screenshot each page after changes
- [ ] Compare for unintended changes

### Implementation Notes

1. **Backend Compatibility**: 
   - DO NOT change backend field values
   - Backend will continue using 'explorer', 'creator', 'visionary'
   - Only update display text in frontend

2. **Component Naming**:
   - Consider renaming VisionaryTierModal → AcademyTierModal
   - Update imports accordingly

3. **CSS Classes**:
   - Check for tier-specific CSS classes
   - Update class names if they include tier names

4. **Translation Keys** (if i18n is used):
   - Update translation files
   - Maintain key structure for backward compatibility

5. **Documentation**:
   - Update CLAUDE.md after implementation
   - Update any user-facing documentation

### Rollback Plan

If issues arise:
1. Git revert the commit
2. Deploy previous version
3. Investigate issues before re-attempting

### Success Criteria

- [ ] No instances of "Explorer", "Creator", or "Visionary" visible in UI
- [ ] All tier-based features working correctly
- [ ] Backend integration unchanged
- [ ] No console errors related to tier changes
- [ ] All tests passing

### Estimated Time

- Implementation: 2-3 hours
- Testing: 1 hour
- Total: 3-4 hours

### Priority Order

1. SubscriptionPage (highest user impact)
2. DashboardPage & ProfilePage
3. HomePage (public facing)
4. AdminPage
5. Demo components (lower priority)
# Pillar Mapping Refactoring TODO

**Created**: 2025-01-22
**Status**: Infrastructure Complete - Gradual Migration Needed
**Priority**: Medium (technical debt)

## What Was Completed (Week 2.2)

✅ **Backend API**:
- Created `/api/pillars` endpoint (GET all pillars)
- Created `/api/pillars/:key` endpoint (GET single pillar)
- Created `/api/pillars/validate/:key` endpoint (validate pillar key)

✅ **Frontend Service Layer**:
- Created `frontend/src/services/pillarService.js` with caching
- Created `frontend/src/config/pillars.js` for synchronous access
- Both files have fallback data if API is unavailable

## Files with Hardcoded Pillar Mappings (24 files)

These files need gradual migration to use the centralized pillar config:

### High Priority (User-Facing):
1. `frontend/src/pages/DiplomaPage.jsx` - Public portfolio
2. `frontend/src/pages/BadgeDetail.jsx` - Badge detail page
3. `frontend/src/components/diploma/AchievementCard.jsx` - Diploma achievements
4. `frontend/src/components/hub/BadgeCarouselCard.jsx` - Badge hub
5. `frontend/src/components/hub/BadgeCarousel.jsx` - Badge carousel

### Medium Priority (Dashboard):
6. `frontend/src/components/dashboard/BadgeRecommendations.jsx`
7. `frontend/src/components/credits/CreditTracker.jsx`
8. `frontend/src/components/credits/TranscriptView.jsx`

### Low Priority (Connections):
9. `frontend/src/components/connections/YourConnections/ConnectionCard.jsx`
10. `frontend/src/components/connections/ActivityFeed/ActivityCard.jsx`

### Calendar Components:
11. `frontend/src/components/calendar/CalendarView.jsx`
12. `frontend/src/components/calendar/WhatDoIDoNext.jsx`
13. `frontend/src/components/calendar/ScheduleSidebar.jsx`
14. `frontend/src/components/calendar/ListView.jsx`
15. `frontend/src/components/calendar/EventDetailModal.jsx`

### Constellation Components (Visual):
16. `frontend/src/components/constellation/QuestTooltip.jsx`
17. `frontend/src/components/constellation/QuestPillarLines.jsx`
18. `frontend/src/components/constellation/PillarStar.jsx`
19. `frontend/src/components/constellation/QuestOrb.jsx`
20. `frontend/src/components/constellation/PillarInfoCard.jsx`
21. `frontend/src/components/constellation/PillarOrb.jsx`
22. `frontend/src/components/constellation/ParticleTrail.jsx`

### Other Components:
23. `frontend/src/components/badge/BadgeProgress.jsx`
24. `frontend/src/components/quest/QuestCardV3.jsx`

## Migration Pattern

### Old Pattern:
```javascript
const pillarGradients = {
  creativity: 'from-[#ef597b] to-[#ff8fa3]',
  critical_thinking: 'from-[#6d469b] to-[#8b5cf6]',
  // ...
};
```

### New Pattern (Synchronous):
```javascript
import { getPillarGradient } from '@/config/pillars';

// Use directly
const gradient = getPillarGradient(pillarKey);
```

### New Pattern (Async with API):
```javascript
import { getPillar } from '@/services/pillarService';

// In component
const [pillarData, setPillarData] = useState(null);

useEffect(() => {
  getPillar(pillarKey).then(setPillarData);
}, [pillarKey]);
```

## Migration Strategy

1. **Immediate** (Week 2.2): Infrastructure in place, no file changes yet
2. **Week 3**: Migrate high-priority user-facing components (5 files)
3. **Week 4**: Migrate dashboard and connections (5 files)
4. **Future Sprint**: Migrate calendar and constellation components (14 files)

## Benefits After Full Migration

- Single source of truth for pillar data
- Easy to update pillar colors/names across entire app
- Consistent pillar definitions between frontend and backend
- API-driven pillar configuration (can be admin-configurable in future)
- Reduced code duplication

## Notes

- **Old pillar names** (creativity, critical_thinking, etc.) are deprecated
- **New pillar names** (stem, wellness, communication, civics, art) are canonical
- Some files may be using old pillar system and need data migration first
- Test thoroughly after each migration - pillar colors affect visual branding

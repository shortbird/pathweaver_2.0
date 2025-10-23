# Pillar Mapping Refactoring TODO

**Created**: 2025-01-22
**Last Updated**: 2025-01-22
**Status**: High-Priority Migration COMPLETE (5/24 files)
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

## Migration Status

### ✅ COMPLETED (5/24 files - 2025-01-22)

**High Priority (User-Facing):**
1. ✅ `frontend/src/pages/DiplomaPage.jsx` - Public portfolio
2. ✅ `frontend/src/pages/BadgeDetail.jsx` - Badge detail page
3. ✅ `frontend/src/components/hub/BadgeCarouselCard.jsx` - Badge hub
4. ✅ `frontend/src/components/hub/BadgeCarousel.jsx` - Badge carousel

**Medium Priority (Dashboard):**
5. ✅ `frontend/src/components/dashboard/BadgeRecommendations.jsx`

**Bug Fix Applied:**
- Fixed wellness/civics color swap (wellness=orange, civics=red per centralized config)

### ⏳ REMAINING (19/24 files)

**High Priority (User-Facing):**
1. `frontend/src/components/diploma/AchievementCard.jsx` - Diploma achievements

**Medium Priority (Dashboard):**
2. `frontend/src/components/credits/CreditTracker.jsx`
3. `frontend/src/components/credits/TranscriptView.jsx`

**Low Priority (Connections):**
4. `frontend/src/components/connections/YourConnections/ConnectionCard.jsx`
5. `frontend/src/components/connections/ActivityFeed/ActivityCard.jsx`

**Calendar Components:**
6. `frontend/src/components/calendar/CalendarView.jsx`
7. `frontend/src/components/calendar/WhatDoIDoNext.jsx`
8. `frontend/src/components/calendar/ScheduleSidebar.jsx`
9. `frontend/src/components/calendar/ListView.jsx`
10. `frontend/src/components/calendar/EventDetailModal.jsx`

**Constellation Components (Visual):**
11. `frontend/src/components/constellation/QuestTooltip.jsx`
12. `frontend/src/components/constellation/QuestPillarLines.jsx`
13. `frontend/src/components/constellation/PillarStar.jsx`
14. `frontend/src/components/constellation/QuestOrb.jsx`
15. `frontend/src/components/constellation/PillarInfoCard.jsx`
16. `frontend/src/components/constellation/PillarOrb.jsx`
17. `frontend/src/components/constellation/ParticleTrail.jsx`

**Other Components:**
18. `frontend/src/components/badge/BadgeProgress.jsx`
19. `frontend/src/components/quest/QuestCardV3.jsx`

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

1. ✅ **Week 2.2** (2025-01-22): Infrastructure in place + HIGH-PRIORITY MIGRATION COMPLETE
   - ✅ Backend API endpoints created and tested
   - ✅ Frontend config files created (pillars.js, pillarService.js)
   - ✅ Migrated 5 high-priority user-facing components
   - ✅ Fixed wellness/civics color swap bug

2. ⏳ **Future Sprint**: Migrate remaining components (19 files)
   - AchievementCard (high priority - 1 file)
   - Dashboard and connections (medium/low - 4 files)
   - Calendar and constellation components (14 files)

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

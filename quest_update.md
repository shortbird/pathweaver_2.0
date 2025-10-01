# Optio Quest System Transformation Plan

## IMPLEMENTATION TODO LIST

**Legend:** ⬜ Not Started | 🟦 In Progress | ✅ Completed

### Phase 1: Database Schema & Badge System Foundation
- ✅ Create all 6 new tables (badges, user_badges enhanced, quest_templates, badge_quests, credit_ledger, ai_content_metrics)
- ✅ Run all 8 database migrations
- ✅ Create performance indexes
- ✅ Verify RLS policies

### Phase 2: Backend Services & AI Infrastructure
- ✅ Create 5 core services (badge, credit, recommendation, AI generation, badge_seeder)
- ✅ Create 4 route modules (badges, credits, ai_content, admin_badge_seed)
- ✅ Integrate Gemini API
- ✅ Register blueprints in app.py

### Phase 3: Automated AI Content Pipeline
- ✅ Create jobs directory structure
- ✅ Create 3 job workers (scheduler, content_generation, quality_monitor)
- ✅ Create 2 services (student_quest_assistant, advisor_content)
- ✅ Create admin UI at /admin/ai-pipeline
- ✅ Database migration for scheduled_jobs and quality_action_logs
- ⬜ Configure Render cron jobs (manual triggers for now)

### Phase 4: Frontend Transformation ✅ COMPLETE
**Core Badge Pages:**
- ✅ BadgeExplorer.jsx, BadgeDetail.jsx
- ✅ BadgeQuestLinker.jsx (admin), BadgeSeeder.jsx (admin)
- ✅ BadgeRecommendations.jsx (dashboard integration)

**Reusable Components:**
- ✅ BadgeCard.jsx, BadgeProgress.jsx, ConstellationView.jsx
- ✅ CreditTracker.jsx, TranscriptView.jsx

**Dedicated Feature Pages:**
- ✅ ConstellationPage.jsx (/constellation)
- ✅ BadgeProgressPage.jsx (/badge-progress)
- ✅ CreditTrackerPage.jsx (/credits)
- ✅ TranscriptPage.jsx (/transcript)

**Page Enhancements:**
- ✅ DiplomaPage.jsx - Earned badges section
- ✅ ProfilePage.jsx - Full-width layout + 8 feature links (central hub)
- ✅ DashboardPage.jsx - Badge recommendations

**Routing & Navigation:**
- ✅ All routes added to App.jsx
- ✅ Profile page as central navigation hub
- ✅ Navigation links (desktop + mobile)

### Phase 5: Advisor Features Enhancement
- ⬜ Create advisor_service.py
- ⬜ Create/enhance advisor routes
- ⬜ Create AdvisorDashboard.jsx
- ⬜ Custom badge creation for advisors
- ⬜ Badge recommendation system

### Phase 6: AI Integration & Intelligence
- ⬜ Badge generation prompts
- ⬜ Quest personalization prompts
- ⬜ Quality validation system
- ⬜ AI content performance monitoring
- ⬜ Automated content improvement pipeline

### Phase 7: Testing & Deployment
- ⬜ Backend service unit tests
- ⬜ Frontend component tests
- ⬜ End-to-end user flow testing
- ⬜ Full production deployment to main branch

### Phase 8: Content Library Seeding
- ✅ Create 13 foundational badges across pillars
- ⬜ Generate 10-15 quests per badge (AI-assisted)
- ⬜ Admin review of initial content
- ⬜ Map existing quests to applicable badges

---

## Current Status

**Session Date:** 2025-10-01 (Constellation View Complete Redesign)
**Overall Progress:** 42/87 tasks (48%)

**Phase Completion:**
- Phase 1: ✅ 100%
- Phase 2: ✅ 95%
- Phase 3: ✅ 95% (awaiting cron job setup)
- Phase 4: ✅ 100% ← **ConstellationPage completely redesigned**
- Phase 5: ⬜ 0%
- Phase 6: ⬜ 0%
- Phase 7: ⬜ 0%
- Phase 8: 🟦 25%

**Latest Work (Constellation Redesign):**
- Complete visual overhaul: pure light orbs with lens flare effects
- Gravitational quest orb system with XP-based positioning
- Advanced interactions: time travel, zoom/pan, particle trails
- Fixed multiple hover card bugs and alignment issues
- Implemented minimum distance enforcement between orbs
- Disabled navigation on click (X button only exit)

**Deployment Status:**
- ✅ All changes deployed to develop branch: https://optio-dev-frontend.onrender.com
- ✅ Badge system fully functional
- ✅ 13 badges visible in badge explorer
- ⬜ Production deployment pending

**What Works Now:**
1. Browse badges at /badges with pillar filtering
2. View badge details with quest lists
3. Admin badge seeding and quest linking
4. Badge recommendations on dashboard
5. **✨ NEW: Immersive constellation visualization at /constellation**
   - Pure light orbs with lens flare effects (no emoji/SVG stars)
   - Quest orbs with gravitational positioning based on XP distribution
   - Time travel slider (press T) to view learning history
   - Zoom controls (Ctrl/Cmd + scroll, UI buttons)
   - Pan controls (Shift + drag)
   - Particle trails flowing from quests to pillars
   - Hover cards showing pillar XP and quest breakdowns
   - Minimum distance enforcement (80px) between orbs
   - Static background starfield (3x viewport for zoom support)
6. Badge progress tracking at /badge-progress
7. Credit tracking at /credits
8. Printable transcript at /transcript
9. Profile as central hub with 8 feature links
10. Earned badges on diploma page

**Next Actions:**
- Option A: Phase 5 - Advisor features
- Option B: Phase 8 - Content seeding (link quests to badges)
- Option C: Production deployment

---

## Constellation View Technical Implementation

**Session Date:** 2025-10-01
**Status:** ✅ Complete and deployed to develop

### Visual Design
**Pillar Orbs (5 Learning Pillars):**
- Pure light with lens flare effect (horizontal, vertical, diagonal cross patterns)
- Size: 60-140px based on total XP (0-3000 XP range)
- Brightness: 0.5-1.0 based on XP
- Colors: STEM (blue), Society (purple), Arts (pink), Language (orange), Life (green)
- Pentagon formation, starting from top
- Hover: 15% scale with smooth transition
- Active state: pulsing brightness animation

**Quest Orbs (Completed & In-Progress Quests):**
- Small orbs: 8-20px based on total quest XP
- Color blending from contributing pillars via XP distribution
- Gravitational positioning: weighted average of pillar positions
- Deterministic orbit offset (30-70px) based on quest ID hash
- Opacity: 1.0 for completed, 0.7 for in-progress
- Gentle bobbing animation
- Hover: 30% scale with smooth transition

### Positioning Algorithm
**Pillar Positions:**
```javascript
Pentagon formation with responsive radius:
- baseRadius = min(width, height) * 0.3
- radius = clamp(150, baseRadius, 400)
- angle = (index * 2π / 5) - π/2 (starting from top)
```

**Quest Gravitational Positioning:**
```javascript
1. Weighted average of pillar positions based on XP distribution
2. Add deterministic orbit offset (hash-based)
3. Enforce minimum 80px distance from all pillars
4. Iterative repulsion algorithm (max 20 iterations)
```

### Interactive Features
**Time Travel (Press T):**
- Slider appears at bottom
- Filters quests by completion/start date
- Scrub through learning history
- Date range: earliest quest to now

**Zoom & Pan:**
- Zoom: Ctrl/Cmd + scroll (0.5x - 3x)
- Pan: Shift + drag
- UI controls in right sidebar
- Reset view button
- Starfield 3x viewport to support zoom-out

**Hover System:**
- Pillar hover: shows name and total XP
- Quest hover: shows title, status, XP breakdown by pillar
- Mutual exclusion: hovering one type clears the other
- Reliable mouse leave detection via separated hitbox/visual

**Visual Effects:**
- Static background starfield (200 twinkling stars)
- Pentagon constellation lines connecting pillars
- Quest-to-pillar connecting lines (dashed, opacity by XP contribution)
- Particle trails flowing from quests to pillars
- Parallax disabled (was too distracting)

### Bug Fixes Applied
**Hover Card Issues:**
- Root cause: Framer Motion whileHover on same element as mouse events
- Solution: Separate hitbox container from visual scaling div
- Hitbox: fixed dimensions with explicit positioning
- Visual: inner div with pointerEvents: 'none' and CSS transition

**Quest Orb Coverage:**
- Issue: Pillar hitboxes covering nearby quest orbs
- Solution 1: Quest orbs have higher z-index (20/60 vs 10/50)
- Solution 2: Minimum 80px distance enforcement
- Solution 3: Reduced pillar hitbox to match visual size

**Alignment:**
- Issue: Orbs not centered at pentagon vertices
- Solution: Explicit pixel calculation instead of CSS transform percentage

**Parallax:**
- Issue: Background stars moving too fast (canvas 3x viewport)
- Solution: Completely disabled parallax on starfield

### Component Architecture
**Created Files:**
- `ConstellationView.jsx` - Main orchestration component
- `PillarOrb.jsx` - Pillar orb with lens flare
- `QuestOrb.jsx` - Quest orb with color blending
- `PillarInfoCard.jsx` - Pillar hover tooltip
- `QuestTooltip.jsx` - Quest hover tooltip
- `ConstellationLines.jsx` - Pentagon lines (SVG)
- `QuestPillarLines.jsx` - Quest-to-pillar lines (SVG)
- `StarField.jsx` - Background stars (Canvas)
- `ParticleTrail.jsx` - Particle system (Canvas)
- `TimeTravelSlider.jsx` - Time travel UI
- `ZoomPanControls.jsx` - Zoom/pan UI
- `ConstellationExit.jsx` - Exit button

**API Integration:**
- Fetches from `/api/users/dashboard` for pillar XP
- Fetches from `/api/users/completed-quests` for quest data
- Processes quest tasks to calculate XP distributions
- Handles both completed and in-progress quests

### Performance Optimizations
- All components use React.memo
- Canvas rendering for stars and particles
- SVG for lines (GPU-accelerated)
- Deterministic positioning (no random on each render)
- Static starfield (no parallax recalculation)

---

## System Design Notes

**Badge Completion Model:**
- Flexible: Complete ANY min_quests number of linked quests
- No specific quests "required"
- Retroactive counting of previously completed quests
- "Complete any X of these quests" messaging
- Student-driven learning paths

**Navigation Hub:**
- ProfilePage serves as central hub
- 8 feature links: Badge Explorer, Badge Progress, Constellation, Credit Tracker, Transcript, Diploma, Dashboard, Quest Hub
- Full-width horizontal stacking for better UX

**Key Routes:**
- `/badges` - Badge explorer
- `/badges/:badgeId` - Badge detail
- `/constellation` - Star map visualization
- `/badge-progress` - Progress dashboard
- `/credits` - Credit tracking
- `/transcript` - Academic transcript
- `/diploma` - Portfolio with earned badges
- `/profile` - Central navigation hub

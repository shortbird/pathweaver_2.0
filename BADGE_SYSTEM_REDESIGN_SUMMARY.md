# Badge System Redesign: Pick Up/Set Down + OnFire Pathways

## Executive Summary

Successfully implemented the badge system redesign aligning with "The Process Is The Goal" philosophy. The new system replaces "completing" quests with "picking up" and "setting down" quests, encouraging conscious transitions and return visits. Added OnFire pathway badges (3 OnFire courses + 2 custom quests) to drive course enrollment while maintaining student agency.

## Key Changes Implemented (January 2025)

### 1. Database Schema Migrations ✅

**Created Files:**
- `backend/database_migration/badge_system_redesign.sql` - Core schema changes
- `backend/database_migration/seed_reflection_prompts.sql` - 25 reflection prompts
- `backend/database_migration/seed_onfire_pathway_badges.sql` - 10 pathway badges

**Schema Updates:**

**user_quests table:**
- `status` TEXT - 'available', 'picked_up', 'set_down' (replaces is_active boolean)
- `times_picked_up` INTEGER - Celebrates returning to quests
- `last_picked_up_at` TIMESTAMP - Track engagement dates
- `last_set_down_at` TIMESTAMP - When quest was consciously closed
- `reflection_notes` JSONB - Optional reflections on learning journey

**badges table:**
- `badge_type` TEXT - 'exploration' or 'onfire_pathway'
- `onfire_course_requirement` INTEGER - Number of OnFire courses needed (default 3)
- `optio_quest_requirement` INTEGER - Number of custom quests needed (default 2)
- `visual_stages` JSONB - 5-stage abstract shape progression data
- `quest_source_filter` TEXT - 'any', 'optio', or 'lms'

**badge_quests table:**
- `quest_source` TEXT - 'optio' or 'lms' (distinguish OnFire courses)
- `is_onfire_course` BOOLEAN - Flag for OnFire courses

**user_badges table:**
- `available_to_claim_at` TIMESTAMP - When badge became claimable
- `claimed_at` TIMESTAMP - When user claimed it
- `is_displayed` BOOLEAN - Auto-display on diploma (default true)
- `claim_notification_sent` BOOLEAN - Prevent duplicate notifications

**quest_reflection_prompts table (NEW):**
- 25 prompts across 5 categories: discovery, growth, challenge, connection, identity
- Powers optional reflection on "set down" flow

**Database Functions:**
- `check_badge_eligibility(user_id, badge_id)` - Validates badge requirements
- `update_badge_claim_availability()` - Trigger function that auto-updates when quests are set down

### 2. Backend Service Updates ✅

**badge_service.py enhancements:**

**Updated Methods:**
- `calculate_badge_progress()` - Now supports dual badge types with OnFire vs Optio breakdown
  - Returns `badge_type`, `can_claim`, `available_to_claim_at`, `claimed_at`
  - OnFire pathway: Shows `onfire_courses_completed`/`required`, `optio_quests_completed`/`required`
  - Exploration: Shows `quests_completed`/`required`, `xp_earned`/`required`

**New Methods:**
- `claim_badge(user_id, badge_id)` - Explicit claim action (not auto-awarded)
- `get_claimable_badges(user_id)` - For notification banner
- `get_claimed_badges(user_id)` - For diploma display
- `get_reflection_prompts(category, limit)` - Random prompts for set down flow
- `mark_claim_notification_sent(user_id, badge_id)` - Prevent duplicate notifications

### 3. API Endpoints ✅

**New Route Files:**
- `backend/routes/quest_lifecycle.py` - Pick up/set down workflow
- `backend/routes/badge_claiming.py` - Badge claiming workflow

**Quest Lifecycle Endpoints:**
```
POST /api/quests/:id/pickup
- Pick up quest (start or resume)
- Increments times_picked_up if returning
- Returns: user_quest, is_returning, times_picked_up

POST /api/quests/:id/setdown
- Set down quest with optional reflection
- Body: { reflection_note?, prompt_id? }
- Triggers database function to check badge eligibility
- Returns: user_quest, reflection_saved

GET /api/quests/:id/pickup-history
- View quest engagement history
- Returns: status, times_picked_up, dates, reflections

GET /api/reflection-prompts?category=&limit=5
- Get random reflection prompts
- Categories: discovery, growth, challenge, connection, identity
```

**Badge Claiming Endpoints:**
```
POST /api/badges/:id/claim
- Claim available badge (must pass {} JSON body for CSRF)
- Auto-displays on diploma
- Updates achievements_count
- Returns: claimed badge data

GET /api/badges/claimable
- Get badges ready to claim (for banner notification)
- Returns: badges[], count, has_claimable

GET /api/badges/claimed
- Get all claimed badges
- Returns: badges[], count

GET /api/badges/:id/progress
- Detailed progress with OnFire/Optio breakdown
- Returns: Full progress object with type-specific fields

POST /api/badges/:id/mark-notification-sent
- Prevent duplicate claim notifications
- Body: {}
```

### 4. OnFire Pathway Badges ✅

**10 Pathway Badges Created:**

1. **Digital Creator** (STEM)
   - OnFire: Web Development, Graphic Design, Video Production
   - Identity: "I build digital solutions and create multimedia content"

2. **Young Entrepreneur** (Civics)
   - OnFire: Entrepreneurship, Digital Business, Personal Finance
   - Identity: "I design business solutions and understand economics"

3. **Creative Technologist** (Art)
   - OnFire: 3D Modeling in Blender, Stop-Motion Animation, Coding with Roblox
   - Identity: "I merge technology and artistic expression"

4. **STEM Explorer** (STEM)
   - OnFire: Programming Foundations, Robotics, Minecraft Science Quest
   - Identity: "I investigate how things work through hands-on exploration"

5. **Wellness Advocate** (Wellness)
   - OnFire: Yoga, Physical Education, Taekwondo
   - Identity: "I cultivate mind-body practices for holistic health"

6. **Storytelling Master** (Communication)
   - OnFire: Creative Writing, Young Adult Literature, Journalism
   - Identity: "I craft narratives that engage and inspire audiences"

7. **Cultural Connector** (Civics)
   - OnFire: Spanish I, World Religions, World Civilizations
   - Identity: "I explore global cultures and build cross-cultural understanding"

8. **Visual Artist** (Art)
   - OnFire: Art Foundations, Digital Art, Photography Explorer
   - Identity: "I express ideas through visual media and design"

9. **Scientific Investigator** (STEM)
   - OnFire: Science 6/7/8, Geology, Dinosaur Science
   - Identity: "I ask questions and design experiments to find answers"

10. **Game Designer** (Art + STEM)
    - OnFire: Video Game Design I, Game Maker I, Computer Programming with Scratch
    - Identity: "I design interactive experiences that engage players"

**Visual Design:**
- Each badge has 5-stage abstract shape progression
- Shapes grow from simple circle → complex mandala as quests are completed
- Color coded by pillar (purple, pink, green, blue, orange)

### 5. Reflection Prompts ✅

**5 Categories with 5 Prompts Each:**

**Discovery:**
- "What surprised you most about this exploration?"
- "What new question emerged from this journey?"
- "What did you discover that you didn't expect?"
- "What was the most interesting thing you learned?"
- "What would you explore next based on what you discovered?"

**Growth:**
- "How did this quest stretch your thinking?"
- "What skill feels stronger now than when you started?"
- "What did you learn about how you learn?"
- "How has your perspective changed since picking this up?"
- "What can you do now that you couldn't do before?"

**Challenge:**
- "What was the hardest part, and how did you navigate it?"
- "When did you feel most out of your comfort zone?"
- "What obstacle did you overcome during this quest?"
- "What would you do differently if you picked this up again?"
- "What helped you push through when things got difficult?"

**Connection:**
- "How does this connect to something else you're learning?"
- "What real-world application can you see for this?"
- "How might this knowledge help you in your daily life?"
- "What other topics does this make you curious about?"
- "How does this relate to your other interests or passions?"

**Identity:**
- "What did this teach you about yourself?"
- "How has this changed the way you see your abilities?"
- "What strength did you discover in yourself through this?"
- "How does this fit into who you're becoming?"
- "What part of this experience feels most like 'you'?"

## Philosophy Alignment ✅

**Core Principles Honored:**

1. **Process-Focused**: Pick up/set down language removes finality of "completion"
2. **Present-Focused**: Reflections ask about current growth, not future potential
3. **Internal Motivation**: Badge claiming is intentional choice, not external achievement
4. **Return-Friendly**: times_picked_up celebrates returning to topics
5. **Conscious Transitions**: Setting down is healthy closure, not abandonment
6. **Identity-Based**: Badge statements use "I am..." and "I can..." language
7. **Student Agency**: OnFire pathways require 2 custom quests (not all prescribed)

## Next Steps (Frontend Implementation)

### Phase 1: Core Components
- [ ] `PickUpSetDownButton.jsx` - Unified quest action button
- [ ] `ReflectionModal.jsx` - Optional reflection on set down
- [ ] `BadgeClaimBanner.jsx` - Notification when badges are claimable
- [ ] `BadgeProgressCard.jsx` - Shows OnFire vs Optio breakdown

### Phase 2: Updated Components
- [ ] Update `QuestCard.jsx` - Add "pick up" vs "set down" states, show times_picked_up
- [ ] Update `BadgeCarouselCard.jsx` - Show OnFire branding, pathway requirements
- [ ] Update `DiplomaPage.jsx` - Display only claimed badges

### Phase 3: Visual Design
- [ ] `AbstractBadgeVisual.jsx` - Growing shape visualization (5 stages)
- [ ] Pillar color system integration
- [ ] OnFire vs Optio branding distinction

### Phase 4: Testing & Deployment
- [ ] Test pick up/set down flow on dev environment
- [ ] Test badge claiming workflow
- [ ] Test OnFire pathway logic (3+2 requirement)
- [ ] Test reflection prompt randomization
- [ ] Analytics: Track OnFire course enrollment attribution

## Database Migration Instructions

**Run in this order:**

1. **Schema Changes:**
   ```sql
   -- Run in Supabase SQL Editor
   \i backend/database_migration/badge_system_redesign.sql
   ```

2. **Seed Reflection Prompts:**
   ```sql
   \i backend/database_migration/seed_reflection_prompts.sql
   ```

3. **Seed OnFire Pathway Badges:**
   ```sql
   \i backend/database_migration/seed_onfire_pathway_badges.sql
   ```

4. **Verify:**
   ```sql
   -- Check user_quests columns
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'user_quests'
   AND column_name IN ('status', 'times_picked_up', 'reflection_notes');

   -- Check badges columns
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'badges'
   AND column_name IN ('badge_type', 'onfire_course_requirement');

   -- Check pathway badges
   SELECT name, badge_type, onfire_course_requirement, optio_quest_requirement
   FROM badges
   WHERE badge_type = 'onfire_pathway';

   -- Check reflection prompts
   SELECT category, COUNT(*) FROM quest_reflection_prompts
   GROUP BY category;
   ```

## API Testing Commands

**Test Quest Lifecycle:**
```bash
# Pick up quest
curl -X POST https://optio-dev-backend.onrender.com/api/quests/{quest_id}/pickup \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=..." \
  -d '{}'

# Set down quest with reflection
curl -X POST https://optio-dev-backend.onrender.com/api/quests/{quest_id}/setdown \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=..." \
  -d '{"reflection_note": "I learned...", "prompt_id": "uuid"}'

# Get reflection prompts
curl https://optio-dev-backend.onrender.com/api/reflection-prompts?category=growth&limit=3 \
  -H "Cookie: access_token=..."
```

**Test Badge Claiming:**
```bash
# Get claimable badges
curl https://optio-dev-backend.onrender.com/api/badges/claimable \
  -H "Cookie: access_token=..."

# Claim badge
curl -X POST https://optio-dev-backend.onrender.com/api/badges/{badge_id}/claim \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=..." \
  -d '{}'

# Get badge progress
curl https://optio-dev-backend.onrender.com/api/badges/{badge_id}/progress \
  -H "Cookie: access_token=..."
```

## Success Metrics

**Track these analytics:**
1. Quest pickup frequency (how often students return to quests)
2. Reflection completion rate (% of set downs with reflections)
3. Badge claim rate (% of available badges claimed)
4. OnFire course enrollment attribution (pathway badge progress → signups)
5. Time from "available to claim" to "claimed" (engagement measure)
6. Average times_picked_up per quest (return behavior)

## Documentation Updates Needed

- [ ] Update `CLAUDE.md` with new badge system details
- [ ] Update `IMPLEMENTATION_PLAN.md` with completion status
- [ ] Create frontend documentation for new components
- [ ] Update API documentation with new endpoints

## Files Modified/Created

**Backend:**
- ✅ `backend/services/badge_service.py` - Updated with new methods
- ✅ `backend/routes/quest_lifecycle.py` - NEW
- ✅ `backend/routes/badge_claiming.py` - NEW
- ✅ `backend/app.py` - Registered new blueprints
- ✅ `backend/database_migration/badge_system_redesign.sql` - NEW
- ✅ `backend/database_migration/seed_reflection_prompts.sql` - NEW
- ✅ `backend/database_migration/seed_onfire_pathway_badges.sql` - NEW

**Frontend (Pending):**
- [ ] `frontend/src/components/PickUpSetDownButton.jsx`
- [ ] `frontend/src/components/ReflectionModal.jsx`
- [ ] `frontend/src/components/BadgeClaimBanner.jsx`
- [ ] `frontend/src/components/BadgeProgressCard.jsx`
- [ ] `frontend/src/components/AbstractBadgeVisual.jsx`
- [ ] `frontend/src/pages/QuestCard.jsx` (update)
- [ ] `frontend/src/components/hub/BadgeCarouselCard.jsx` (update)
- [ ] `frontend/src/pages/DiplomaPage.jsx` (update)

## Commit Hash

```
commit 134f183
feat: Badge system redesign - Pick Up/Set Down + OnFire Pathways
```

## Ready for Testing ✅

All backend infrastructure is complete and ready for frontend integration. The system is philosophically aligned, technically sound, and positioned to drive OnFire course enrollments while honoring student agency and process-focused learning.

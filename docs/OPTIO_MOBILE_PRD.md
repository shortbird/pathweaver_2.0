# Optio Mobile App - Product Requirements Document

## Context

Optio Education is a web-based learning platform built on the philosophy "The Process Is The Goal." It uses a 5-pillar system (STEM, Art, Communication, Civics, Wellness), XP-based progression, personalized quests/tasks, and a network of observers (parents, mentors, family) to celebrate present-focused learning. The platform serves students ages 5-17, parents, advisors, and observers across both individual and organizational (school) contexts.

**Why a mobile app?** Learning happens everywhere - not just at a desk. Students need a frictionless way to capture learning moments in real-time, care for their virtual companion, browse bounties on the go, and let their support network follow along. The mobile app is NOT a port of the web platform - it is a complementary, mobile-first experience focused on capture, engagement, and connection.

**Intended Outcome:** Increase daily active engagement, make XP spending meaningful through the virtual pet economy, introduce community-driven learning via bounties, and lower the barrier to recording learning moments from "sit down and type" to "snap, speak, or tap."

---

## 1. Executive Summary

The Optio Mobile App is a React Native companion to the existing web platform. The MVP introduces seven features: a Learning Journal for quick capture (with Snap-to-Learn camera and Voice Journaling modes), a Bounty Board for community-posted educational challenges with XP and sponsored real-world rewards, an Optio Yeti virtual companion for spending earned XP, and an Activity Feed where observers follow along with expressive Reactions. The app also surfaces the student's Overview Page (read-only) from the web platform. The app shares the existing Flask + Supabase backend and targets iOS and Android for students ages 5-17 with age-appropriate adaptations.

- **Design Language:** Liquid Glass aesthetic using Optio brand colors - modern, translucent, layered, and polished.
- **Development Approach:** Test-driven development, security-first (building for minors), component reuse via inheritance patterns.

---

## 2. Problem Statement & Opportunity

### Problems

- Students earn XP but have no compelling reason to spend it - XP accumulation feels abstract
- Learning happens outside the platform (field trips, conversations, hobbies) but there's no low-friction way to capture it on the go
- Observers (parents, family, mentors) want to engage with student progress but the web feed requires deliberate login
- There's no community marketplace for learning challenges - quests are top-down from advisors/orgs

### Opportunity

- A virtual pet companion creates an emotional, persistent reason to earn AND spend XP
- Mobile-first capture (camera, voice, quick text) removes friction from recording learning moments
- Push notifications keep observers engaged with real-time student activity
- A bounty system creates a two-sided marketplace where anyone can sponsor educational challenges
- Sponsored bounties open a monetization path (platform fees on sponsored rewards)

---

## 3. Target Users & Personas

### Primary: Students (Ages 5-17)

**Young Learners (5-10)**

- Motivated by visual rewards and pet care
- Need simplified UI with larger touch targets, minimal text
- Parent manages account (dependent profile, COPPA-compliant)
- Primary actions: feed Yeti, take photos, voice journal

**Tweens/Teens (11-17)**

- Motivated by autonomy, social validation, and earning rewards
- Browse and accept bounties independently
- Create detailed journal entries with rich media
- Manage their own observer list
- Primary actions: bounty hunting, journaling, social feed

### Secondary: Parents/Observers

- View activity feed via push notifications
- React to student learning moments with expressive reactions
- Post bounties for their children or community

### Tertiary: Bounty Sponsors (Orgs, Businesses, Community)

- Create and fund educational bounties with real-world rewards
- Review bounty submissions
- Build brand presence in the education space

---

## 4. Scalability Review

The MVP is designed to scale with low/no human-in-the-loop:

| Area | Scalability Approach |
|------|---------------------|
| Bounty Moderation | AI-first (Gemini) moderation with human escalation only for edge cases. Auto-approve bounties from verified orgs. |
| Content Moderation | All UGC passes through Gemini moderation. Flagged content queued for review, everything else auto-published. |
| XP Economy | Fixed-price item catalog. No manual intervention needed. Inflation controlled by periodic item catalog updates. |
| Bounty Rewards | Automated XP distribution on approval. Sponsored rewards fulfilled by sponsor (Optio facilitates, doesn't fulfill). |
| Onboarding | Self-service. Existing Optio accounts work immediately. Pet creation is in-app. |
| Observer Management | Student-initiated invitations, self-service accept/reject. No admin involvement. |
| Push Notifications | Firebase Cloud Messaging - fully automated based on event triggers. |

Only human-in-the-loop needed for: Sponsored bounty contract setup (B2B sales), escalated content moderation flags, App Store review process.

---

## 5. Monetization Strategy

### Revenue Streams

**1. Sponsored Bounties (Primary - MVP)**

- Organizations, businesses, and community sponsors post bounties with real-world rewards
- Sponsor pays Optio a platform fee (e.g., 15-20% of bounty value) for hosting, moderation, and distribution
- Sponsor provides rewards directly (gift cards, scholarships, experiences, merchandise)
- Optio handles: listing, moderation, matching, submission collection, review facilitation
- Sponsor handles: reward fulfillment
- Example: Local library sponsors "Read 5 books this month" bounty with $25 bookstore gift card. Library pays Optio $5 platform fee.

**2. Organization Subscriptions (Existing + Enhanced)**

- Schools/programs already pay for Optio platform access
- Mobile app included in org subscription (value-add)
- Org bounty creation included in subscription tier

**3. Premium Yeti Items (Future - Post-MVP)**

- Cosmetic-only premium accessories for the Yeti (seasonal, limited edition)
- Small purchases ($0.99-$2.99) via App Store/Play Store
- Never pay-to-win: premium items are cosmetic only, no stat advantages
- Requires careful implementation for minors (parental approval for purchases)

**4. Data Insights (Future - Post-MVP)**

- Anonymized, aggregated learning trend data for education research
- Engagement pattern reports for partnered organizations
- Never sell individual student data

### What We Will NEVER Do

- No third-party advertising
- No selling individual student data
- No pay-to-win mechanics
- No required purchases to use core features

---

## 6. MVP Features

### 6.1 Learning Journal (Quick Capture)

**Purpose:** Frictionless recording of learning moments from anywhere.

**Capture Modes:**

- **Text:** Quick note with optional pillar tag (min 10 chars)
- **Photo (Snap-to-Learn):** Camera capture with AI pillar suggestion (see 6.6)
- **Voice (Voice Journaling):** Audio recording with auto-transcription (see 6.7)
- **Link:** Paste a URL to an article/video with brief reflection

**Entry Structure:**

- Content (text/photo/audio/link)
- Pillar tag (auto-suggested or manual, single or multiple)
- Optional quest association (link to active quest)
- Optional reflection prompt ("What surprised you?" / "What do you want to explore next?")
- Timestamp (supports backdating: "I learned this yesterday")
- Privacy level: private / observers-only / public

**Journal View:**

- Chronological feed with filters by pillar, date range, media type
- Calendar heatmap showing capture frequency (reuses existing engagement calendar data)
- Monthly summary card: "You captured 23 moments this month across 4 pillars"

**Integration with Existing System:**

- Maps to existing `learning_events` table + `learning_event_evidence_blocks`
- Syncs bidirectionally with web platform learning events
- XP award: 5 XP per journal entry (encourages capture without gaming)

**Backend Changes:**

- `backend/routes/learning_events.py` - add mobile-optimized endpoints
- `backend/services/learning_events_service.py` - add voice/photo processing

---

### 6.2 Bounty Board

**Purpose:** Community-driven educational challenges with XP rewards and optional sponsored real-world prizes. This is a NEW system not on the web platform.

**Bounty Lifecycle:**

1. **Creation:** Poster creates bounty with title, description, requirements, pillar, XP reward, deadline, max participants, optional sponsored reward
2. **Review:** All bounties reviewed by Optio (AI moderation + manual review for sponsored bounties) before publishing
3. **Discovery:** Students browse bounties filtered by pillar, reward size, deadline, difficulty
4. **Acceptance:** Student claims a bounty (limited slots per bounty)
5. **Submission:** Student submits evidence (text, photos, video, links)
6. **Verification:** Poster reviews submission and approves/requests revision
7. **Reward:** XP automatically distributed on approval. Sponsored rewards fulfilled by sponsor.

**Bounty Types:**

| Type | Description |
|------|-------------|
| Open Bounty | Anyone can attempt, first N completions win |
| Challenge Bounty | Specific requirements, poster picks best submission |
| Family Bounty | Parent posts for their children only (private) |
| Org Bounty | Organization posts for their students only |
| Sponsored Bounty | Business/org sponsors with real-world reward (reviewed by Optio before publishing) |

**Reward Structure:**

- XP reward (25-500 XP range, poster sets amount, Optio reviews before publishing)
- Sponsored rewards (optional): gift cards, scholarships, experiences, merchandise - provided and fulfilled by sponsor
- Bounty Hunter flair: special profile badge after completing N bounties

**Sponsored Bounty Flow:**

1. Sponsor contacts Optio or uses self-service portal to create sponsored bounty
2. Sponsor describes challenge, sets requirements, specifies reward (gift card, merch, etc.)
3. Sponsor pays platform fee (15-20% of reward value)
4. Optio reviews for appropriateness, educational value, and safety
5. Bounty published to eligible students
6. On completion: Optio notifies sponsor to fulfill reward, XP distributed automatically

**Safety:**

- ALL bounties reviewed by AI moderation (Gemini) before publishing
- Sponsored bounties get additional manual review by Optio team
- Report mechanism for inappropriate bounties
- Under-13 users can only see family/org bounties (COPPA) - no public or sponsored bounties
- No real-money payments to students directly - rewards are goods/experiences only
- Sponsors never have direct contact with students

**New Database Tables:**

```sql
bounties
  - id (uuid, PK)
  - poster_id (uuid, FK -> users)
  - title (text)
  - description (text)
  - requirements (text) -- what students need to do/submit
  - pillar (text) -- stem, art, communication, civics, wellness
  - bounty_type (text) -- open, challenge, family, org, sponsored
  - xp_reward (int)
  - sponsored_reward (jsonb, nullable) -- {type, description, value, sponsor_name, sponsor_logo_url}
  - max_participants (int)
  - deadline (timestamptz)
  - status (text) -- draft, pending_review, active, completed, expired, rejected
  - organization_id (uuid, FK -> organizations, nullable)
  - moderation_status (text) -- pending, ai_approved, manually_approved, rejected
  - moderation_notes (text, nullable)
  - platform_fee_cents (int, nullable) -- for sponsored bounties
  - created_at (timestamptz)

bounty_claims
  - id (uuid, PK)
  - bounty_id (uuid, FK -> bounties)
  - student_id (uuid, FK -> users)
  - status (text) -- claimed, submitted, approved, rejected, revision_requested
  - evidence (jsonb) -- {text, media_urls[], links[]}
  - submitted_at (timestamptz, nullable)
  - reviewed_at (timestamptz, nullable)
  - created_at (timestamptz)

bounty_reviews
  - id (uuid, PK)
  - claim_id (uuid, FK -> bounty_claims)
  - reviewer_id (uuid, FK -> users)
  - decision (text) -- approved, rejected, revision_requested
  - feedback (text)
  - created_at (timestamptz)
```

**New API Endpoints:**

```
POST   /api/bounties                         - Create bounty
GET    /api/bounties                         - List bounties (filters: pillar, type, status, reward_type)
GET    /api/bounties/:id                     - Get bounty detail
POST   /api/bounties/:id/claim               - Claim a bounty
POST   /api/bounties/:id/submit              - Submit evidence
POST   /api/bounties/:id/review/:claimId     - Review submission (poster or Optio admin)
DELETE /api/bounties/:id                     - Cancel bounty (poster only, before any claims)
GET    /api/bounties/my-posted               - Poster's bounties
GET    /api/bounties/my-claims               - Student's claimed bounties
PUT    /api/bounties/:id/moderate            - Admin: approve/reject bounty (superadmin only)
```

---

### 6.3 Optio Yeti (Virtual Companion)

**Purpose:** Give XP emotional weight by creating a virtual Yeti companion that students name and care for.

**The Yeti:**

- Each student gets ONE Yeti companion on first app login
- Student names their Yeti (their choice, content-filtered)
- All Yetis are the same species - a friendly, expressive Yeti character
- Yeti is visible on the app home screen as a persistent companion
- Yeti has stats: Hunger, Happiness, Energy (0-100 each)
- Animated using Rive (interactive state machines, smooth transitions between moods)

**Stat Decay (Gentle - aligned with Optio philosophy):**

- Stats decrease by ~5 points per day of inactivity (not per hour)
- Minimum stat floor: 20 (Yeti NEVER "dies" or gets critically ill)
- Recovery is fast when student re-engages (2-3 actions restore fully)
- No punishment, just gentle visual cues (Yeti yawns, thought bubbles)

**Feeding & Care Actions:**

- **Feed:** Spend Spendable XP on food items from the shop to restore Hunger
- **Play:** Complete a journal entry or bounty task to restore Happiness
- **Rest:** Yeti auto-rests when student logs off (restores Energy over time)

**Visual States (Rive state machine):**

| State | Animation |
|-------|-----------|
| Happy | Bouncing, sparkle effects, big smile |
| Content | Gentle idle animation, occasional wave |
| Hungry | Slower movement, thought bubble with food |
| Sleepy | Yawning, droopy eyes, cozy pose |

**XP Spending Economy:**

Spendable XP is a **new currency** that does not exist in the current codebase. It must be built from scratch.

- When a student earns XP (from tasks, bounties, journal entries), they receive an equal amount of Spendable XP
- Total XP (earned) is never reduced - it represents academic progress and replaces grades
- Spendable XP is the currency used in the Yeti shop - this CAN be spent/reduced
- Think of it like: Total XP = your GPA (always grows), Spendable XP = your allowance (earn and spend)

> **Implementation Note:** The current `xp_service.py` `award_xp()` method updates `user_skill_xp` (per-pillar) and `user_mastery`. It has no concept of spendable XP. Every XP source in the system (task completion, journal entries, bounties) must be updated to also increment `yeti_pets.spendable_xp`. This is a cross-cutting change affecting multiple services and routes.

**Yeti Shop Items:**

| Item | Spendable XP Cost | Effect |
|------|-------------------|--------|
| Snack | 10 | +15 Hunger |
| Meal | 25 | +40 Hunger, +10 Happiness |
| Treat | 30 | +30 Hunger, +5 Energy |
| Toy | 20 | +25 Happiness |
| Accessory (hat, scarf, glasses, etc.) | 50 | Cosmetic only, persistent |

**New Database Tables:**

```sql
yeti_pets
  - id (uuid, PK)
  - user_id (uuid, FK -> users, unique)
  - name (text)
  - hunger (int, default 80)
  - happiness (int, default 80)
  - energy (int, default 80)
  - accessories (jsonb, default []) -- equipped accessory item IDs
  - spendable_xp (int, default 0) -- current spendable XP balance
  - total_xp_spent (int, default 0) -- lifetime XP spent
  - last_fed_at (timestamptz)
  - last_interaction_at (timestamptz)
  - created_at (timestamptz)

yeti_items
  - id (uuid, PK)
  - name (text)
  - category (text) -- food, toy, accessory
  - xp_cost (int) -- spendable XP cost
  - effect (jsonb) -- {hunger: +15, happiness: +10, energy: +5}
  - image_url (text)
  - rive_asset_id (text, nullable) -- Rive animation asset for this item
  - rarity (text) -- common, rare, legendary
  - is_active (boolean, default true)

yeti_inventory
  - id (uuid, PK)
  - user_id (uuid, FK -> users)
  - item_id (uuid, FK -> yeti_items)
  - quantity (int, default 1)
  - acquired_at (timestamptz)

yeti_interactions
  - id (uuid, PK)
  - user_id (uuid, FK -> users)
  - pet_id (uuid, FK -> yeti_pets)
  - action_type (text) -- feed, play, equip_accessory, unequip_accessory
  - item_id (uuid, FK -> yeti_items, nullable)
  - stat_changes (jsonb) -- {hunger: +15}
  - xp_spent (int, default 0)
  - created_at (timestamptz)
```

**New API Endpoints:**

```
GET    /api/yeti/my-pet              - Get Yeti state (calculates current stats with decay)
POST   /api/yeti/my-pet              - Create Yeti (first time: name only)
PUT    /api/yeti/my-pet/name         - Rename Yeti
POST   /api/yeti/my-pet/feed         - Feed with item from inventory
POST   /api/yeti/my-pet/play         - Play interaction
GET    /api/yeti/shop                - Browse item catalog
POST   /api/yeti/shop/buy            - Purchase item with Spendable XP
GET    /api/yeti/inventory           - View owned items
POST   /api/yeti/my-pet/equip        - Equip accessory
POST   /api/yeti/my-pet/unequip      - Unequip accessory
GET    /api/yeti/my-pet/balance      - Get Spendable XP balance
```

**Spendable XP Integration:**

- When XP is awarded (task completion, bounty, journal), also increment `yeti_pets.spendable_xp`
- Extend `backend/services/xp_service.py` `award_xp()` to also update spendable XP
- Shop purchases deduct from `spendable_xp` only
- `users.total_xp` is NEVER modified by spending

---

### 6.4 Activity Feed with Observers

**Purpose:** Social learning feed connecting students with their support network.

**Feed Content (Chronological):**

- Journal entries (text, photo, voice - respecting privacy level)
- Bounty claims and completions
- Yeti milestones (new pet created, rare items acquired)
- Quest progress updates (from web platform)
- XP milestones (level ups, pillar achievements)

**Observer Experience:**

- Push notifications for new feed items from linked students
- Quick reaction buttons (see 6.5)
- Comment capability (reuses existing `observer_comments` system)
- Daily/weekly digest option (email summary)

**Feed Privacy:**

- Students control who sees what (private/observers-only/public)
- Under-13 feeds visible only to parent + approved observers
- Students can remove observers at any time
- Feed items can be individually hidden after posting

**Integration with Existing System:**

- Extends existing `GET /api/observers/feed` endpoint
- Adds new feed item types (bounty, yeti, voice journal)
- Reuses existing `observer_student_links` for access control
- Reuses existing `observer_likes` and `observer_comments` tables

**Backend Changes:**

- `backend/routes/observer/feed.py` - add new feed item types
- `backend/routes/observer/social.py` - extend with reactions

---

### 6.5 Observer Reactions

**Purpose:** Richer emotional feedback beyond simple likes.

**Available Reactions:**

| Reaction | Icon | Meaning |
|----------|------|---------|
| Proud | Star | "I'm proud of you" |
| Mind-blown | Explosion | "Wow, that's impressive" |
| Inspired | Lightbulb | "You inspire me" |
| Love it | Heart | "I love this" |
| Curious | Magnifying glass | "Tell me more" |

**Behavior:**

- One reaction per observer per feed item (replaces previous if changed)
- Student sees reaction count + who reacted
- Reactions trigger Yeti happiness boost ("Someone is proud of you!")
- Push notification to student when observer reacts

**New Database Table:**

```sql
observer_reactions
  - id (uuid, PK)
  - observer_id (uuid, FK -> users)
  - target_type (text) -- completion, learning_event, bounty_claim
  - target_id (uuid)
  - reaction_type (text) -- proud, mind_blown, inspired, love_it, curious
  - created_at (timestamptz)
  - UNIQUE(observer_id, target_type, target_id)
```

> **Migration Note:** The existing `observer_likes` table uses direct foreign keys (`completion_id`, `learning_event_id`) with a CHECK constraint and UNIQUE constraint. The new `observer_reactions` table uses a polymorphic `target_type`/`target_id` pattern instead. This requires a data migration:
> 1. Create the new `observer_reactions` table
> 2. Migrate existing likes as `reaction_type = 'love_it'` with appropriate `target_type`/`target_id`
> 3. Update the existing like toggle endpoints in `observer/social.py` to write to both tables during a transition period
> 4. Deprecate and eventually remove the old `observer_likes` table
>
> **Existing endpoints that must be updated or deprecated:**
> - `POST /api/observers/completions/<id>/like` (toggle like on task completion)
> - `POST /api/observers/learning-events/<id>/like` (toggle like on learning event)
> - `GET /api/observers/completions/<id>/comments` (comments on task completion)
> - `GET /api/observers/learning-events/<id>/comments` (comments on learning event)

**New API Endpoints:**

```
POST   /api/observers/react              - Add/change reaction
DELETE /api/observers/react/:id          - Remove reaction
GET    /api/observers/reactions/:type/:id - Get reactions for a feed item
```

---

### 6.6 Snap-to-Learn (Camera Capture)

**Purpose:** Turn any visual moment into a learning entry with AI assistance.

**Flow:**

1. Student taps camera button (prominent on home screen and journal)
2. Takes photo or selects from gallery
3. AI (Gemini 2.5 Flash Lite) analyzes image and suggests:
   - Which pillar(s) it relates to
   - A brief description of what learning might be captured
   - 2-3 reflection prompts tailored to the image
4. Student confirms/edits pillar, adds optional reflection text
5. Entry saved to Learning Journal

**AI Prompt Design:**

```
Analyze this image from a student's perspective. Suggest which of these
learning pillars it relates to: STEM, Art, Communication, Civics, Wellness.
Provide a brief (1 sentence) description and 2 reflection questions.
Keep language encouraging and age-appropriate (ages 5-17).
```

**Examples:**

- Photo of a plant: "Wellness - Growing things! How does caring for plants make you feel?"
- Photo of a math worksheet: "STEM - Working through problems! What strategy helped you most?"
- Photo of a group project poster: "Communication - Teamwork in action! What was your role?"

**Privacy:**

- Photos stored in Supabase Storage (existing infrastructure)
- AI analysis happens server-side (photo sent to backend, not directly to Gemini from client)
- Students can delete any photo entry at any time
- Under-13: photos not shared publicly, only to linked observers

**New API Endpoint:**

```
POST /api/learning-events/snap-to-learn
  Request: multipart/form-data {photo, optional_text}
  Response: {suggested_pillar, description, reflection_prompts[]}
```

**Backend Changes:**

- Create new `backend/services/snap_to_learn_ai_service.py` extending `BaseAIService` - add image analysis method
- `backend/routes/learning_events.py` - add snap-to-learn endpoint

> **Codebase Note:** There is no `backend/services/ai/` subdirectory. All AI services live flat in `backend/services/` and extend `BaseAIService` from `backend/services/base_ai_service.py`. The existing `learning_ai_service.py` handles text-based pillar suggestions; image analysis should be a new service following the same pattern.

---

### 6.7 Voice Journaling

**Purpose:** Lowest-friction capture method - just talk about what you learned.

**Flow:**

1. Student taps microphone button
2. Records audio (max 3 minutes)
3. Audio auto-transcribed via **Google Cloud Speech-to-Text** (Enhanced model, best for child speech)
4. AI suggests pillar tag based on transcription content
5. Student reviews transcription, edits if needed, confirms
6. Entry saved with both audio file and text transcription

**Technical Approach:**

- React Native voice recording via `react-native-audio-recorder-player`
- Transcription via Google Cloud Speech-to-Text Enhanced model
- Transcription happens server-side to keep client lightweight
- Audio file stored in Supabase Storage alongside transcription text

**Age Considerations:**

- Young learners (5-10): Larger record button, visual recording indicator (bouncing dots), simpler review screen
- Teens (11-17): Standard voice memo interface, ability to trim audio before saving

**New API Endpoint:**

```
POST /api/learning-events/voice
  Request: multipart/form-data {audio_file}
  Response: {transcription, suggested_pillar, reflection_prompts[]}
```

**Backend Changes:**

- `backend/services/transcription_service.py` (new) - Google Cloud STT integration
- `backend/routes/learning_events.py` - add voice endpoint

---

### 6.8 Student Overview (Read-Only from Web)

**Purpose:** Let students check their progress on mobile without needing to open the web platform.

**What's Shown:**

- Total XP and Spendable XP balance
- Pillar breakdown (radar chart or bar chart)
- Active quests/projects with progress percentage
- Recent task completions
- Engagement rhythm state
- Level and mastery info

**What's NOT on Mobile (Web Only):**

- Quest/project enrollment/browsing
- Task creation and completion
- Course curriculum
- Advisor/admin dashboards
- Organization management

**Integration:**

- Reuses existing API endpoints: `GET /api/auth/me`, `GET /api/me/engagement`, `GET /api/quests` (active only)
- Read-only - no mutations from this screen
- Deep link to web platform for actions ("Complete this task on web")

> **Terminology Note:** On the web platform, Quests that belong to a Course are called "Projects." The mobile overview should use consistent terminology with the web UI - display "Projects" when showing course-linked quests.

---

## 7. Key User Flows

### 7.1 First Launch (New Student)

1. Download app -> Sign in with existing Optio account (or parent creates dependent)
2. Welcome screen: "Meet your Yeti!"
3. Name your Yeti (content-filtered)
4. Brief tutorial: "Capture learning moments to keep [Yeti Name] happy!"
5. Land on home screen with Yeti, journal button, bounty board, and feed

### 7.2 Quick Capture (30 seconds)

1. Student sees something interesting -> Opens app
2. Taps camera/mic/text button on home screen
3. Captures moment -> AI suggests pillar
4. Confirms -> Entry saved, Yeti does happy animation, +5 XP (both Total and Spendable)
5. Entry appears in observer feeds

### 7.3 Bounty Hunting

1. Student opens Bounty Board -> Browses by pillar/reward
2. Finds interesting bounty (maybe sponsored with gift card reward) -> Reads requirements
3. Taps "Accept Bounty" -> Bounty added to active list
4. Completes requirements -> Submits evidence
5. Poster reviews -> Approves -> XP awarded + sponsor notified to fulfill reward -> Yeti celebration

### 7.4 Yeti Care Session

1. Student opens app -> Sees Yeti on home screen
2. Yeti looks hungry (thought bubble animation) -> Student opens shop
3. Browses food items -> Buys "Meal" for 25 Spendable XP
4. Feeds Yeti -> Hunger restored, happy animation plays
5. Equips new accessory -> Yeti shows it off with a spin

### 7.5 Observer Check-in

1. Parent receives push notification: "[Child] captured a learning moment!"
2. Opens app -> Views feed item (photo of science experiment)
3. Taps "Mind-blown" reaction
4. Adds comment: "That's amazing! Tell me about it at dinner."
5. Student receives notification + Yeti happiness boost

---

## 8. Technical Architecture

### Design System: Liquid Glass

**Library:** `@callstack/liquid-glass` for React Native

- Native iOS 26+ Liquid Glass API support via Fabric/TurboModules
- Falls back to standard blur effects on older iOS / Android
- Provides `LiquidGlassView` and `LiquidGlassContainerView` components

**Design Token System (Single Source of Truth):**

All design values defined in ONE theme file (`src/theme/tokens.ts`). Change once, updates everywhere.

```typescript
// src/theme/tokens.ts
export const tokens = {
  colors: {
    primary: '#6D469B',      // optio-purple
    primaryDark: '#5A3A82',  // optio-purple hover
    accent: '#EF597B',       // optio-pink
    accentDark: '#E73862',   // optio-pink hover
    glass: {
      background: 'rgba(255, 255, 255, 0.12)',
      border: 'rgba(255, 255, 255, 0.2)',
      shadow: 'rgba(0, 0, 0, 0.1)',
    },
    pillars: {
      stem: '#2469D1',
      art: '#AF56E5',
      communication: '#3DA24A',
      civics: '#FF9028',
      wellness: '#E65C5C',
    },
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 },
  blur: { light: 10, medium: 20, heavy: 40 },
  typography: {
    fontFamily: 'Poppins',
    weights: { medium: '500', semiBold: '600', bold: '700' },
  },
  animation: { spring: { damping: 15, stiffness: 150 } },
};
```

**Liquid Glass Card Pattern:**

```typescript
// src/components/common/GlassCard.tsx - BASE component, all cards inherit from this
<LiquidGlassView style={{
  backgroundColor: tokens.colors.glass.background,
  borderRadius: tokens.radius.lg,
  borderWidth: 1,
  borderColor: tokens.colors.glass.border,
}}>
  {children}
</LiquidGlassView>
```

Every card in the app (bounty cards, journal entries, shop items, feed items) extends `GlassCard`. Change the glass effect once, it updates everywhere.

### React Native App Structure

```
optio-mobile/
├── src/
│   ├── theme/
│   │   ├── tokens.ts              # Single source of truth for all design values
│   │   └── ThemeProvider.tsx       # Context provider for theme
│   ├── screens/
│   │   ├── HomeScreen.tsx          # Yeti + quick action buttons
│   │   ├── JournalScreen.tsx       # Learning journal feed
│   │   ├── CaptureScreen.tsx       # Camera/voice/text capture
│   │   ├── BountyBoardScreen.tsx   # Bounty browsing + filters
│   │   ├── BountyDetailScreen.tsx  # Single bounty view + claim/submit
│   │   ├── YetiScreen.tsx          # Yeti care + stats detail
│   │   ├── ShopScreen.tsx          # Item purchasing
│   │   ├── FeedScreen.tsx          # Activity feed
│   │   ├── OverviewScreen.tsx      # Student progress (read-only from web)
│   │   └── ProfileScreen.tsx       # Settings + observer management
│   ├── components/
│   │   ├── common/                 # BASE components (GlassCard, GlassButton, GlassInput, GlassModal)
│   │   ├── yeti/                   # Yeti Rive rendering + animations
│   │   ├── journal/                # Journal entry cards (extends GlassCard)
│   │   ├── bounty/                 # Bounty cards + submission (extends GlassCard)
│   │   ├── feed/                   # Feed items + reaction bar (extends GlassCard)
│   │   └── capture/                # Capture mode components (BaseCaptureMode -> Text/Photo/Voice)
│   ├── services/                   # API client (axios, interceptors, same patterns as web)
│   ├── hooks/                      # useAuth, useYeti, useFeed, useOfflineQueue, useBounties
│   ├── navigation/                 # React Navigation (bottom tabs + stack)
│   ├── stores/                     # Zustand stores (auth, yeti, feed, offline queue)
│   ├── utils/                      # Helpers, constants, pillar config
│   ├── __tests__/                  # Test files mirror src/ structure
│   └── assets/
│       ├── rive/                   # Yeti .riv animation files
│       ├── icons/                  # App icons
│       └── sounds/                 # Interaction sound effects
├── android/
├── ios/
├── e2e/                            # Detox E2E tests
├── jest.config.js
└── package.json
```

### Component Inheritance Pattern

```
GlassCard (base)
  ├── JournalEntryCard
  ├── BountyCard
  ├── ShopItemCard
  ├── FeedItemCard
  │   ├── JournalFeedItem
  │   ├── BountyFeedItem
  │   └── YetiFeedItem
  └── OverviewStatCard

BaseCaptureMode (base)
  ├── TextCapture
  ├── PhotoCapture (Snap-to-Learn)
  └── VoiceCapture

BaseReaction (base)
  ├── ProudReaction
  ├── MindBlownReaction
  ├── InspiredReaction
  ├── LoveItReaction
  └── CuriousReaction
```

### Shared Backend (Existing Flask + Supabase)

- All new endpoints added to existing Flask backend under new route blueprints
- Authentication: token-based for mobile (Supabase JWT via `react-native-keychain`)
- Backend already supports Authorization header fallback (`utils/session_manager.py`)
- New tables added via Supabase migrations with RLS policies
- File storage (photos, audio) via Supabase Storage buckets
- AI features via existing Gemini integration (`base_ai_service.py` + specialized service classes)
- Push notifications via Firebase Cloud Messaging (new integration - see section 12)
- Voice transcription via Google Cloud Speech-to-Text Enhanced

### Key Libraries

| Library | Purpose |
|---------|---------|
| `react-native 0.76+` | Core framework |
| `@callstack/liquid-glass` | Liquid Glass UI components |
| `@react-navigation/native` | Navigation (bottom tabs + stack) |
| `react-native-reanimated` | Smooth animations / spring physics |
| `rive-react-native` | Yeti character animations (interactive state machines) |
| `expo-camera` | Snap-to-Learn photo capture |
| `react-native-audio-recorder-player` | Voice journaling |
| `@react-native-firebase/messaging` | Push notifications |
| `zustand` | Lightweight state management |
| `react-native-mmkv` | Fast local storage / offline cache |
| `react-native-keychain` | Secure token storage |

---

## 9. New Database Tables Summary

```sql
-- Bounty System (3 tables)
bounties
bounty_claims
bounty_reviews

-- Yeti System (4 tables)
yeti_pets
yeti_items
yeti_inventory
yeti_interactions

-- Enhanced Social (1 table)
observer_reactions

-- Push Notifications (1 table)
device_tokens

-- Total: 9 new tables + RLS policies for each
-- Voice/Photo journaling uses existing learning_events + learning_event_evidence_blocks tables
-- Audio/photo files stored in Supabase Storage
```

**device_tokens (new - required for Firebase Cloud Messaging):**

```sql
device_tokens
  - id (uuid, PK)
  - user_id (uuid, FK -> users)
  - token (text) -- FCM registration token
  - platform (text) -- ios, android
  - device_name (text, nullable)
  - is_active (boolean, default true)
  - last_used_at (timestamptz)
  - created_at (timestamptz)
  - UNIQUE(user_id, token)
```

---

## 10. XP Economy Design

### Dual XP System

```
Student completes task (variable XP, set per-task via user_quest_tasks.xp_value)
    ├── Total XP += N    (permanent, represents learning progress, replaces grades)
    └── Spendable XP += N (currency for Yeti shop, can be spent)

Student buys Yeti Meal (25 Spendable XP)
    ├── Total XP: unchanged
    └── Spendable XP -= 25
```

> **Current State:** The existing `xp_service.py` `award_xp()` method updates `user_skill_xp` (per-pillar XP) and `user_mastery` (total + level). There is NO spendable XP concept today. Task XP values are set per-task in `user_quest_tasks.xp_value` -- there is no system-wide default. The "50 XP" used in examples below is illustrative, not a codebase default.

### XP Sources

| Source | Total XP | Spendable XP |
|--------|----------|-------------|
| Task completion | +N (per `user_quest_tasks.xp_value`) | +N |
| Bounty completion | +25 to +500 (poster sets) | +25 to +500 |
| Journal entry | +5 | +5 |
| Quest completion bonus | +100 | +100 |

### Economy Balance Targets

- Average student earns ~200 XP/week (varies by task XP values)
- Journal entries add ~35 XP/week (7 entries at 5 XP)
- Basic Yeti maintenance costs ~70 Spendable XP/week (1 meal/day)
- Students should have surplus for accessories and treats
- Target: students spend 30-50% of Spendable XP on Yeti care

### Inflation Controls

- Item prices are fixed (no dynamic pricing in MVP)
- New items added periodically to create demand
- Rare items only available through bounty rewards (not purchasable)
- No XP trading between students (MVP)
- Spendable XP balance visible alongside Total XP

---

## 11. Age-Appropriate Adaptations

### Young Learners (5-10) - "Kid Mode"

- **UI:** Larger buttons (56px+ touch targets), more illustrations, less text
- **Navigation:** Bottom tab bar with 3 tabs (Yeti, Capture, Feed) - simplified
- **Bounties:** Only family/org bounties visible (no public or sponsored bounties)
- **Journal:** Defaults to photo/voice capture (text secondary)
- **Yeti:** Simplified shop with fewer choices, guided interactions
- **Privacy:** All content visible only to parent + approved observers
- **Account:** Managed by parent (dependent profile), no direct messaging
- **Content moderation:** Stricter AI moderation on all submissions

### Tweens/Teens (11-17) - "Full Mode"

- **UI:** Standard mobile patterns, compact information density
- **Navigation:** 5 tabs (Home, Journal, Bounties, Feed, Profile)
- **Bounties:** Full marketplace access (public + org + family + sponsored)
- **Journal:** All capture modes equally accessible
- **Yeti:** Full shop, rare items, all accessories
- **Privacy:** Student controls own privacy settings
- **Account:** Self-managed (13+), can approve/reject observer requests

### Mode Detection

- Based on existing `is_dependent` flag and user age (from `date_of_birth`)
- Parent can override to "Kid Mode" for 11-12 year olds via settings
- Mode affects UI layout, not backend access (API enforces COPPA regardless)

---

## 12. Notification Strategy

### Push Notification Infrastructure (New)

The existing `notification_service.py` handles Supabase Realtime broadcasts and in-app notifications only. Firebase Cloud Messaging is entirely new infrastructure requiring:

1. **Firebase project setup** for iOS and Android
2. **New `device_tokens` table** (see section 9) to store FCM registration tokens
3. **Token lifecycle management:** Registration on login, refresh on token rotation, cleanup on logout
4. **New `push_notification_service.py`** to handle FCM API calls, token management, and delivery tracking
5. **Integration with existing `notification_service.py`** to add FCM delivery alongside Realtime broadcasts

### Notification Events

| Event | Student | Parent/Observer | Channel |
|-------|---------|-----------------|---------|
| Observer reacted to entry | Yes | - | Push |
| Observer commented | Yes | - | Push |
| Bounty accepted by student | - | Yes (if parent) | Push |
| Bounty submission approved | Yes | Yes | Push |
| Yeti getting hungry (below 30) | Yes | - | Push (1x/day max) |
| New bounty matching interests | Yes | - | Push (daily digest) |
| Student captured learning moment | - | Yes | Push |
| XP milestone reached | Yes | Yes | Push |

### Rules

- Quiet hours: 9pm-7am local time (configurable by parent for dependents)
- Max 5 push notifications per day per user
- Parents can disable non-essential notifications for dependents
- Weekly digest email option for observers

---

## 13. Offline Support Strategy

### Offline-Capable (MVP)

- Journal entries (text, photo, voice) - queued locally, synced when online
- Yeti viewing (cached state from last sync)
- Reading existing feed items (cached)

### Online-Required

- Bounty browsing and claiming (real-time availability)
- Shop purchases (Spendable XP balance verification)
- AI features (Snap-to-Learn analysis, voice transcription)
- Observer reactions and comments
- Feed refresh

### Sync Strategy

- Offline journal entries stored in MMKV with `pending_sync` flag
- On reconnection: batch upload pending entries
- Conflict resolution: server wins for XP balance, client wins for journal content
- Visual indicator when offline ("Saving for later..." badge on pending entries)

---

## 14. Privacy & Safety (COPPA/FERPA Compliance)

### Under-13 (Dependents)

- No public profile or public feed items
- Parent manages account and approves all observers
- Photos analyzed server-side only, not stored in public indexes
- No direct messaging with non-family users
- Bounties limited to family/org-posted only (no public or sponsored)
- AI interactions logged and available to parent
- Data deletion: parent can request full account deletion

### 13+ Students

- Control own privacy settings
- Can approve/reject observer requests
- Can set journal entries to private, observer-only, or public
- Can participate in public and sponsored bounties
- Data export available on request

### All Users

- No location tracking
- No contact list access
- Camera/microphone permissions requested only when needed
- AI moderation on all user-generated content before publishing
- Encrypted data at rest (Supabase) and in transit (HTTPS)
- No third-party advertising
- Sponsors never have direct contact with students
- Yeti names content-filtered

---

## 15. Success Metrics & KPIs

| Metric | Target (3 months) | Target (6 months) |
|--------|-------------------|-------------------|
| Daily Active Users (DAU) | 20% of web users | 40% of web users |
| Journal entries per active user/week | 3 | 5 |
| Avg session duration | 4 min | 6 min |
| Bounties completed/month | 2 per active student | 4 per active student |
| Yeti care interactions/week | 5 per student | 7 per student |
| Observer reactions/week | 3 per observer | 5 per observer |
| D7 Retention | 40% | 55% |
| D30 Retention | 20% | 35% |
| Spendable XP spent / earned ratio | 30% | 50% |
| Sponsored bounties created/month | 5 | 20 |

---

## 16. Development Principles

### Test-Driven Development (TDD)

- Every feature starts with tests - write tests before implementation
- Backend: pytest for all endpoints and services. 95%+ pass rate required before merge.
- Mobile: Jest + React Native Testing Library for all components and hooks
- Integration tests for critical flows (auth, XP transactions, bounty lifecycle, COPPA enforcement)
- E2E tests with Detox for key user flows (quick capture, bounty claim, Yeti feeding)
- Test database isolation: use Supabase branching for safe testing

### Security & Privacy First (Building for Minors)

- COPPA compliance is non-negotiable - every feature reviewed through a minor-safety lens
- All user-generated content passes through AI moderation before publishing
- No PII exposed in API responses beyond what the requesting role needs
- RLS policies on every new table - no exceptions
- Input validation and sanitization on all endpoints (OWASP top 10)
- Rate limiting on all public endpoints (existing middleware)
- Audit logging for all data access involving minors (extend existing `observer_audit_repository.py` or create a new `ObserverAuditService`)
- Penetration testing before App Store submission
- Privacy review checklist for every PR that touches user data

### Component Architecture: Reuse & Inheritance

- Base component library - build shared components first (GlassCard, GlassButton, GlassInput, GlassModal)
- Inheritance/composition patterns: base components extended for specific use cases
  - `GlassCard` -> BountyCard, ShopItemCard, JournalEntryCard, FeedItemCard
  - `FeedItemCard` -> JournalFeedItem, BountyFeedItem, YetiFeedItem
  - `BaseCaptureMode` -> TextCapture, PhotoCapture, VoiceCapture
- Shared hooks: useAuth, useYeti, useFeed, useOfflineQueue, useBounties
- Design tokens in ONE file (`tokens.ts`) - change once, updates everywhere
- Shared services mirror web platform patterns (axios client with interceptors)
- Pillar config, colors, and icons defined once, imported everywhere

### Code Quality Standards

- TypeScript strict mode for all mobile code
- ESLint + Prettier enforced via pre-commit hooks
- No `any` types - everything typed
- PR reviews required before merge
- Backend follows existing repository pattern for all new data access

---

## 17. Phased Rollout Plan

### Phase 1: Foundation (Weeks 1-6)

- React Native project setup + CI/CD
- Design system: `@callstack/liquid-glass` + `tokens.ts` + base components
- Authentication (Supabase token-based for mobile)
- Home screen with Yeti (Rive animation, basic creation + naming + feeding)
- Learning Journal (text capture only)
- Basic activity feed (read-only, reuse existing endpoint)
- Push notification infrastructure (Firebase + `device_tokens` table)
- Student overview screen (read-only)
- Tests: Unit tests for all components, integration tests for auth flow

### Phase 2: Capture & Social (Weeks 7-12)

- Snap-to-Learn (camera + Gemini AI pillar suggestion)
- Voice Journaling (recording + Google Cloud STT transcription)
- Yeti Shop (full item catalog + Spendable XP purchasing)
- Observer reactions on feed (including `observer_likes` migration)
- Offline journal queueing (MMKV)
- Age-appropriate mode switching (Kid Mode vs Full Mode)
- Tests: E2E tests for capture flows, integration tests for XP economy

### Phase 3: Bounties (Weeks 13-16)

- Bounty Board (full lifecycle: create, browse, claim, submit, review)
- Bounty moderation (AI + manual review queue for sponsored)
- Sponsored bounty support (reward descriptions, sponsor branding)
- Enhanced feed (bounty events, Yeti milestones)
- Weekly digest emails for observers
- Tests: Full bounty lifecycle E2E, COPPA enforcement tests

### Phase 4: Polish & Launch (Weeks 17-20)

- Performance optimization + Rive animation polish
- Accessibility audit (WCAG 2.1 AA)
- Security audit + penetration testing
- Internal beta testing (TestFlight + Play Store internal track)
- Bug fixing and UX refinement
- App Store / Play Store submission
- Tests: Full regression suite, performance benchmarks

---

## 18. Open Questions (Resolved & Remaining)

### Resolved

| # | Question | Decision |
|---|----------|----------|
| 1 | XP economy model | Dual system: Total XP (permanent, academic) + Spendable XP (currency) |
| 2 | Bounty funding | Creator sets XP, reviewed by Optio. Sponsored bounties have real rewards fulfilled by sponsor. |
| 3 | Cross-platform Yeti | Yes - Yeti visible on web platform too |
| 4 | Animation tech | Rive - interactive state machines, modern quality, small files |
| 5 | Voice transcription | Google Cloud Speech-to-Text Enhanced model |
| 6 | App distribution | Start with internal testing (TestFlight + Play Store internal track) |
| 7 | Web features on mobile | Student overview page only. Quests/tasks/courses remain web-only. |
| 8 | Pet species | Single species: Yeti. Student names it. |
| 9 | Monetization | Sponsored bounties (platform fee), org subscriptions. No ads ever. |

### Remaining

1. **Sponsored bounty self-service portal:** Should sponsors be able to self-service create bounties, or is it all through Optio sales team initially?
2. **Yeti on web:** What level of Yeti integration on web? Full care experience, or just a status widget?
3. **Content filter for Yeti names:** Use existing AI moderation, or a simpler blocklist approach?
4. **Rive artist:** Who creates the Yeti Rive assets? In-house, freelance, or agency?
5. **Google Cloud STT pricing at scale:** At 1000 students x 5 voice entries/week x 2 min avg = ~10,000 min/week = ~$60/week. Acceptable?

---

## 19. Verification Plan

After each phase, verify end-to-end:

1. **Auth:** Login with existing Optio account on mobile, verify token-based auth works alongside web cookies
2. **Journal:** Create entries via text, photo, and voice - confirm they appear on web platform learning events
3. **Snap-to-Learn:** Take photo -> verify AI returns pillar suggestion -> save -> confirm in journal
4. **Voice:** Record audio -> verify transcription -> save -> confirm audio playback works
5. **Bounty:** Full lifecycle - create, claim, submit, review, XP reward distribution
6. **Sponsored Bounty:** Create with reward description -> moderation -> student completes -> sponsor notified
7. **Yeti:** Create Yeti, name it, buy items with Spendable XP, feed, verify Total XP unchanged, check stat decay over 24hrs
8. **Spendable XP:** Earn XP from task -> verify both Total and Spendable increment -> spend in shop -> verify only Spendable decrements
9. **Feed:** Post journal entry -> verify observer sees it -> add reaction -> verify student push notification
10. **Reactions:** All 5 reaction types work, one-per-observer-per-item constraint enforced, existing likes migrated correctly
11. **Offline:** Create journal entry while offline -> go online -> verify sync completes
12. **COPPA:** Under-13 dependent cannot see public/sponsored bounties, all content restricted to parent/approved observers
13. **Overview:** Student overview shows correct Total XP, Spendable XP, pillar breakdown, active quests/projects
14. **Performance:** App cold start <2s, Rive animations 60fps, quick capture flow <30s end-to-end
15. **Liquid Glass:** UI renders correctly on iOS 26+ (native liquid glass) and older iOS/Android (blur fallback)

---

## 20. Implementation Notes

### Files to Create (Backend)

| File | Purpose |
|------|---------|
| `backend/routes/bounties.py` | Bounty CRUD + claim/submit/review endpoints |
| `backend/routes/yeti.py` | Yeti management + shop + inventory endpoints |
| `backend/services/bounty_service.py` | Bounty business logic + moderation |
| `backend/services/yeti_service.py` | Yeti stat management + Spendable XP economy |
| `backend/services/transcription_service.py` | Google Cloud STT integration |
| `backend/services/snap_to_learn_ai_service.py` | Image analysis for Snap-to-Learn (extends `BaseAIService`) |
| `backend/services/bounty_moderation_ai_service.py` | AI moderation for bounty content (extends `BaseAIService`) |
| `backend/services/push_notification_service.py` | Firebase Cloud Messaging integration + device token management |
| `backend/repositories/bounty_repository.py` | Bounty data access |
| `backend/repositories/yeti_repository.py` | Yeti data access |
| Supabase migration files | 9 new tables (`bounties`, `bounty_claims`, `bounty_reviews`, `yeti_pets`, `yeti_items`, `yeti_inventory`, `yeti_interactions`, `observer_reactions`, `device_tokens`) + RLS policies |
| `observer_likes` migration | Data migration from `observer_likes` to `observer_reactions` (see section 6.5) |

### Files to Extend (Backend)

| File | Changes |
|------|---------|
| `backend/routes/learning_events.py` | Add snap-to-learn + voice endpoints |
| `backend/routes/observer/feed.py` | Add new feed item types (bounty, yeti) |
| `backend/routes/observer/social.py` | Add reactions, deprecate like toggle endpoints |
| `backend/services/learning_events_service.py` | Add voice/photo processing |
| `backend/services/xp_service.py` | Add Spendable XP integration (`award_xp` also updates `yeti_pets.spendable_xp`) |
| `backend/services/notification_service.py` | Integrate with new `push_notification_service.py` for FCM delivery |

### Mobile App (New Repository)

- Separate `optio-mobile/` repository (React Native + TypeScript)
- Shares API contract with web frontend but independent codebase
- Design system built on `@callstack/liquid-glass` + custom tokens
- Yeti animations via Rive (`.riv` files in assets)

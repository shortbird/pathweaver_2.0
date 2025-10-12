# Calendar Feature Implementation Plan for Claude Code

## Project Overview
Implement a student calendar system that allows drag-and-drop scheduling of quests and tasks with three philosophy-aligned features:
1. **Gentle visual feedback** - No stress-inducing red colors for overdue items
2. **Friend activity visibility** - Show what friends are learning without deadlines
3. **Celebration moments** - Periodic encouragement and milestone recognition

## Technical Context
- **Database**: PostgreSQL in Supabase (no ORM, using supabase-py client)
- **Backend**: Flask API
- **Frontend**: React with Tailwind CSS
- **Calendar Library**: FullCalendar React
- **Philosophy**: "The Process Is The Goal" - learning for joy, not external validation

---

## Phase 1: Database Setup

### 1.1 Schema Modifications
Create a new migration file in the Supabase migrations folder that:

**Adds deadline columns:**
- Add nullable `deadline` DATE column to `user_quests` table
- Add nullable `deadline` DATE column to `user_quest_tasks` table
- Add descriptive comments explaining these are student-set personal deadlines

**Creates performance indexes:**
- Create partial indexes on user_id + deadline for both tables (WHERE deadline IS NOT NULL)
- This optimizes queries for calendar views

**Creates celebration tracking table:**
- New table `celebration_log` with columns:
  - id (UUID primary key)
  - user_id (foreign key to auth.users)
  - celebration_type (TEXT)
  - acknowledged_at (TIMESTAMPTZ)
  - created_at (TIMESTAMPTZ)
- Add index on user_id and acknowledged_at
- Enable RLS with policies allowing users to view/insert their own records

---

## Phase 2: Backend Implementation

### 2.1 Calendar Management Module

**Create a new calendar routes file** that handles all calendar-related endpoints.

**Deadline Status Helper Function:**
Create a helper that calculates gentle, encouraging statuses for deadlines:
- Takes a deadline date and returns status object with color, message, and suggestion
- Categories based on days until/past deadline:
  - 7+ days overdue: "wandered" status with amber colors and "waiting patiently" message
  - 1-6 days overdue: "flowing" status with yellow colors and "continue at your pace" message
  - Today: "today" status with blue colors and pulsing animation flag
  - 1-3 days away: "approaching" status with indigo colors
  - 4+ days away: "future" status with neutral colors
- Never use red colors or stress-inducing language

**GET /api/calendar/items Endpoint:**
- Fetch all user_quests and user_quest_tasks for authenticated user
- Include both active and completed items
- Join with quest/task/pillar data to get titles and colors
- Process each item through the deadline status helper
- Return structured data with quests, tasks, and an encouraging message based on recent activity

**PUT /api/user-quests/{id}/deadline Endpoint:**
- Verify the user owns the quest
- Update the deadline field (can be null to clear)
- Return success with an encouraging message about learning rhythm

**PUT /api/user-quest-tasks/{id}/deadline Endpoint:**
- Verify the user owns the task
- Check that task deadline doesn't exceed parent quest deadline
- Update the deadline field
- Return success with encouraging message

### 2.2 Friends Activity Module

**GET /api/friends/learning-activity Endpoint:**
- Get authenticated user's accepted friendships
- Fetch friends' quest/task activity from last 24 hours
- Calculate each friend's "energy level" based on weekly activity:
  - 20+ activities: "blazing" 
  - 10-20: "flowing" 
  - 5-10: "growing" 
  - <5: "resting" 
- Identify shared quests and tasks (quests and tasks both user and friends are working on)
- Return structured data WITHOUT showing friends' deadlines

### 2.3 Celebrations Module

**Celebration Detection Logic:**
Create functions to detect different celebration triggers:

*Learning Milestones:*
- First task completion of the day
- Task completions within last hour
- Check celebration_log to avoid duplicates

*Consistency Celebrations:*
- Count unique active days in past week
- Celebrate 3-day and 5-day activity patterns
- Frame as "finding your rhythm" not "maintaining streaks"

*Growth Celebrations:*
- Track variety of pillars explored in past month
- Celebrate exploring 3+ different learning areas

*Spontaneous Encouragement:*
- 20% random chance to show encouraging message
- Pull from a list of growth-focused affirmations - not too cheesy or overly-excited. just simple encouragement.

**GET /api/celebrations/check Endpoint:**
- Run all celebration detection functions
- Filter out already-acknowledged celebrations
- Return maximum 3 celebrations at once
- Include celebration type, message, icon, and whether to show confetti

**POST /api/celebrations/acknowledge Endpoint:**
- Log that user saw the celebration
- Prevents showing same celebration repeatedly

### 2.4 Blueprint Registration
Register all new route blueprints in the main Flask application file.

---

## Phase 3: Frontend Implementation

### 3.1 Dependencies
Add to package.json:
- FullCalendar suite (@fullcalendar/react, daygrid, interaction)
- Framer Motion for animations
- React Confetti for celebrations
- date-fns for date manipulation
- react-use for utility hooks

### 3.2 Calendar Page Structure

**Main Calendar Page Component:**
- Container component managing state for all calendar features
- Fetch calendar items on mount
- Handle deadline updates for both quests and tasks
- Display encouragement message from API
- Responsive grid layout: sidebar (3 cols) + calendar (9 cols) on desktop, stacked on mobile

### 3.3 Component Architecture

**UnscheduledItemsSidebar Component:**
- Display quests/tasks without deadlines
- Separate sections for "Active Quests" and "Active Tasks"
- Make items draggable using FullCalendar's Draggable API
- Each item stores metadata needed for drop events
- Show pillar colors as left border
- Display "all scheduled" message when empty
- Include helpful tip about drag-and-drop

**CalendarView Component:**
- Wrap FullCalendar with configuration:
  - Enable drag and drop from external sources
  - Enable event dragging for rescheduling
  - Month and week view options
  - Custom event rendering using CalendarItem component
- Handle drop events from sidebar
- Handle event drag for rescheduling
- Format dates properly for API calls
- Show success toasts for updates

**CalendarItem Component:**
- Custom event display within calendar cells
- Apply visual styling based on deadline_status
- Show pillar color as left border
- Completed items: green background, strikethrough, reduced opacity
- Apply gentle pulse animation for "today" items
- Never show harsh red colors

**FriendsActivity Component:**
- Collapsible panel showing friend learning activity
- Display community energy level
- Highlight shared quests
- Show friend avatars, usernames, and current focus
- Display energy level icons
- "Show/Hide" toggle for friend list
- Inspirational quote at bottom

**CelebrationModal Component:**
- Full-screen overlay with semi-transparent background
- Animated entry/exit using Framer Motion
- Display celebration icon, message, and action button
- Show confetti for special celebrations
- Handle multiple celebrations with pagination dots
- Call acknowledge endpoint when dismissed
- Different button text based on celebration type

### 3.4 Styling Approach

**Philosophy-Aligned Visual Design:**
- Use soft, encouraging colors (ambers, yellows, blues, greens)
- Never use red for overdue items
- Gentle animations and transitions
- Rounded corners for approachable feel
- Subtle shadows instead of harsh borders
- Pillar colors as accent elements

**Mobile Optimization:**
- Stack sidebar above calendar on mobile
- Larger touch targets (minimum 60px height)
- Simplified calendar event display
- Collapsible friends activity by default
- Responsive typography sizing
- Touch-friendly drag handles

### 3.5 State Management
- Use React hooks for local state
- Consider creating a Calendar context if state becomes complex
- Implement optimistic updates for better UX
- Cache calendar data appropriately

### 3.6 Error Handling
- Show friendly error messages via toast
- Provide retry options for failed requests
- Handle offline scenarios gracefully
- Never show technical error details to users

---

## Phase 4: Integration Points

### 4.1 Navigation
Add calendar link to main navigation:
- Icon: Calendar or similar
- Label: "Calendar"
- Position: Logical placement with other student tools

### 4.2 Routing
Add route configuration:
- Path: /calendar
- Require authentication
- Add to student-accessible routes

# "What Do I Do Next?" Component Instructions

## Component Overview
Add a prioritized view component that shows quests and tasks ordered by deadline, helping students see their learning path without creating pressure. This component emphasizes gentle guidance over urgency.

## Backend Modifications

### Update GET /api/calendar/items Endpoint
Modify the existing calendar items endpoint to include a `next_items` field:

**Additional Processing Logic:**
- Filter items to only include those with deadlines and active status
- Sort items by deadline date (ascending)
- Group items by deadline date for better visualization
- Add a "suggested_focus" field based on what's coming up
- Include items without deadlines at the end with a special category

**Response Structure Addition:**
```
{
  "quests": [...],
  "tasks": [...],
  "encouragement": "...",
  "next_items": {
    "today": [...],
    "this_week": [...],
    "upcoming": [...],
    "unscheduled": [...],
    "suggested_focus": "..."
  }
}
```

**Suggested Focus Logic:**
- If items due today: "Today's adventures await!"
- If items this week: "You have a nice rhythm this week"
- If only future items: "Plenty of time to explore"
- If no scheduled items: "Choose what sparks your curiosity"

## Frontend Component Implementation

### Component: WhatDoIDoNext.jsx

**Location:** `frontend/src/components/calendar/WhatDoIDoNext.jsx`

**Component Structure:**

**Container Design:**
- Card-style container matching other calendar components
- Collapsible on mobile, expanded by default on desktop
- Subtle gradient or background to make it inviting
- Position: Above or beside the calendar view

**Header Section:**
- Title: "Your Learning Path" or "What Calls to You?" (avoid "What Do I Do Next?" as it implies obligation)
- Subtitle with dynamic encouragement based on item count
- Toggle button for expand/collapse
- Small icon indicating the philosophy (maybe a compass or path icon)

**Content Sections:**

*Today's Explorations:*
- Items due today
- Soft blue background with gentle pulse animation
- Show as "Ready to explore" not "Due today"
- Include quest/task title, pillar color accent
- Quick action button: "Start this adventure"

*This Week's Journey:*
- Items due within 7 days
- Grouped by day with friendly day names ("Tomorrow", "Thursday's explorations")
- Softer visual treatment than today's items
- Show approximate time since last activity on these items

*On the Horizon:*
- Items due beyond 7 days
- Collapsed by default, expandable
- Very subtle visual treatment
- Group by week or month

*Unscheduled Adventures:*
- Items without deadlines
- Frame as "Whenever inspiration strikes"
- Slightly grayed out but not disabled looking
- Include a "Schedule this" button for easy deadline setting

**Visual Design Elements:**

*Progress Indicators:*
- For each item, show progress subtly (e.g., "3 of 5 tasks flowing")
- Use dots or soft progress bars, not percentages
- Celebrate partial progress

*Deadline Display:*
- Use relative time ("in 3 days") not absolute dates for near items
- Far future items show month only
- Today's items just say "Today's adventure"
- Overdue items say "Ready when you are" in amber (not red)

*Interactive Elements:*
- Hover states that reveal more details
- Click to expand full quest/task details
- Drag items directly from this list onto the calendar
- Quick action buttons that don't feel pushy

**Empty States:**
- "No scheduled adventures - follow your curiosity!"
- Suggestion to explore quest hub
- Never make user feel behind or lazy

**Mobile Optimization:**
- Accordion-style sections
- Swipeable cards for today's items
- Bottom sheet pattern option
- Sticky header when scrolling

**State Management:**
- Shares data with calendar page (no separate API call)
- Updates when deadlines change
- Smooth transitions when items move between categories
- Optimistic updates when starting a quest/task

**Micro-interactions:**
- Gentle fade when marking item as started
- Satisfying check animation when completing from this view
- Smooth reordering animation when deadlines change
- Celebration micro-animation for completed items

### Integration with Calendar Page

**Placement Options:**
1. **Sidebar placement**: Below friends activity, above unscheduled items
2. **Top banner**: Full-width above calendar grid
3. **Floating panel**: Toggleable overlay on desktop
4. **Tab view**: Alternative view to calendar grid

**Data Flow:**
- Receives `next_items` from parent CalendarPage
- Shares deadline update handler with other components
- Can trigger calendar view to focus on specific date

### Philosophy Alignment Details

**Language to Use:**
- "Your learning path"
- "Ready to explore"
- "When you're curious"
- "Adventures waiting"
- "Continue your journey"

**Language to Avoid:**
- "Overdue"
- "Must complete"
- "Behind schedule"  
- "Urgent"
- "Required"

**Color Coding:**
- Today: Soft blue with gentle animation
- This week: Light indigo
- Future: Neutral gray-blue
- Unscheduled: Soft purple
- Completed: Green with celebration feel
- "Overdue": Warm amber (never red)

### Additional Features

**Smart Suggestions:**
- If user has been working on one pillar heavily, suggest variety
- If energy is low (based on recent activity), suggest lighter tasks
- If Friday, highlight creative/fun quests

**Quick Filters:**
- Filter by pillar
- Show only quests or only tasks
- Hide completed items
- Show items needing learning logs

**Celebration Integration:**
- When completing an item from this view, trigger mini-celebration
- Show encouraging message when all today's items are complete
- Celebrate clearing a backlog without making it feel like a chore

### Performance Considerations
- Virtualize list if more than 20 items
- Lazy load sections beyond "This Week"
- Cache sorted data
- Debounce updates during drag operations

This component should feel like a friendly guide showing possibilities, not a task master demanding completion. The focus is on helping students see their learning journey laid out beautifully, not creating pressure to complete everything.

---

## Phase 5: Testing Strategy

### 5.1 Backend Testing
Create test files covering:
- Calendar item retrieval with various deadline states
- Deadline update validation (including task/quest constraint)
- Friends activity data structure
- Celebration trigger conditions
- Authorization checks
- Edge cases (null deadlines, no friends, etc.)

### 5.2 Frontend Testing
Create test files covering:
- Component rendering
- Drag and drop interactions
- API call handling
- Loading and error states
- Mobile responsiveness
- Celebration modal behavior

### 5.3 End-to-End Testing
- Complete flow: drag unscheduled item → drop on calendar → verify update
- Friends activity updates
- Celebration trigger and acknowledgment
- Mobile drag-and-drop functionality

---

## Implementation Checklist

### Database Tasks
- [ ] Create migration file with deadline columns and indexes
- [ ] Create celebration_log table with RLS policies
- [ ] Run migration and verify schema in Supabase dashboard

### Backend Tasks
- [ ] Create calendar routes module with deadline status logic
- [ ] Implement calendar items endpoint with encouraging messages
- [ ] Implement quest deadline update with ownership verification
- [ ] Implement task deadline update with parent quest validation
- [ ] Create friends activity endpoint without exposing deadlines
- [ ] Implement celebration detection functions (milestones, consistency, growth)
- [ ] Create celebration check endpoint with deduplication
- [ ] Create celebration acknowledge endpoint
- [ ] Register all blueprints in main app
- [ ] Test all endpoints with various scenarios

### Frontend Tasks
- [ ] Install calendar and animation dependencies
- [ ] Create CalendarPage with state management
- [ ] Build UnscheduledItemsSidebar with draggable items
- [ ] Implement CalendarView with FullCalendar configuration
- [ ] Create CalendarItem with philosophy-aligned styling
- [ ] Build FriendsActivity with collapsible friend list
- [ ] Create CelebrationModal with confetti effects
- [ ] Add calendar route to router configuration
- [ ] Add calendar link to navigation
- [ ] Implement mobile-responsive styles
- [ ] Create loading and error states

### Testing Tasks
- [ ] Write backend unit tests for all endpoints
- [ ] Write frontend component tests
- [ ] Test drag-and-drop functionality
- [ ] Test mobile interactions
- [ ] Perform end-to-end testing
- [ ] Test edge cases and error scenarios

### Final Tasks
- [ ] Code review for philosophy alignment
- [ ] Performance optimization
- [ ] Accessibility audit
- [ ] Deploy to staging environment
- [ ] User acceptance testing
- [ ] Production deployment

---

## Key Implementation Notes

### Philosophy Alignment
- Every message should celebrate process over outcome
- Use language that creates internal motivation
- Never compare students or create competition
- Avoid urgency or stress-inducing patterns
- Frame deadlines as "personal rhythm" not obligations

### Technical Considerations
- Supabase queries return `.data` property - handle accordingly
- Use proper date formatting (ISO strings for API)
- Handle timezone consistently (dates only, no times)
- Implement proper error boundaries
- Add loading skeletons for better perceived performance

### User Experience
- Optimistic updates for immediate feedback
- Gentle animations for delightful interactions
- Clear visual hierarchy
- Consistent color coding for pillars
- Mobile-first responsive design

### Security
- Verify ownership on all update operations
- Use RLS policies in Supabase
- Validate deadline constraints server-side
- Sanitize all user inputs
# Optio UX Patterns

**Visual References**: See [mockups/MOCKUPS_INDEX.md](mockups/MOCKUPS_INDEX.md) for page layout screenshots

## Core Philosophy Integration

All UX decisions should reflect: **"The Process Is The Goal"**

See [core_philosophy.md](../core_philosophy.md) for complete messaging guidelines.

### Key Principles
1. **Present-focused celebration** - Celebrate what's happening NOW, not future outcomes
2. **Process over product** - Emphasize learning journey, not just completion
3. **Internal motivation** - Focus on how learning feels, not how it looks
4. **Authentic encouragement** - Honest support, not empty praise

## Navigation Patterns

**Reference**: See [navbar.png](mockups/components/navbar.png)

### Top-Level Navigation
```
Primary Navigation:
- Logo (home link)
- Dashboard
- Quest Hub
- Diploma (when user has completions)
- Profile (dropdown)

Mobile Navigation:
- Hamburger menu
- Bottom navigation bar for key actions
```

### Page Hierarchy
```
Home → Dashboard → Quest Hub → Quest Detail → Task Completion → Evidence Submission
                 ↓
              Diploma (showcase completed work)
```

### Breadcrumbs
Use breadcrumbs for deep navigation (admin, quest detail, etc.)
```jsx
<nav className="text-sm text-[#908B92] font-['Poppins'] font-medium mb-4">
  <a href="/dashboard" className="hover:text-[#6D469B] transition-colors">Dashboard</a>
  <span className="mx-2">/</span>
  <a href="/quests" className="hover:text-[#6D469B] transition-colors">Quests</a>
  <span className="mx-2">/</span>
  <span className="text-[#1B191B]">Quest Title</span>
</nav>
```

## Quest Discovery & Enrollment

**Reference**: See [quest_badge_hub.png](mockups/pages/quest_badge_hub.png)

### Quest Hub Pattern
1. **Filter/Search** - Allow filtering by pillar, XP range, completion status
2. **Card Grid** - Visual grid of quest cards with images
3. **Quest Preview** - Hover shows quick details
4. **Start Quest** - Clear CTA to begin

### Quest Detail Pattern
```
Layout:
1. Hero image/header with pillar gradient
2. Quest title and description
3. XP and pillar badges
4. Task list (expandable)
5. "Start Quest" or "Continue Quest" CTA
6. Community features (if paid tier)
```

### Task Completion Flow
```
1. View task details
2. Work on task (external)
3. Return to platform
4. Submit evidence (text + files)
5. Confirmation feedback
6. XP awarded celebration
7. Next task or quest completion
```

## Evidence Submission

### Evidence Types
- Text description (required)
- File uploads (images, PDFs, videos)
- Links to external work

### Submission Pattern
```jsx
<form>
  {/* Text evidence */}
  <textarea
    className="w-full px-4 py-2 border border-[#BAB4BB] rounded-lg
               font-['Poppins'] font-medium text-[#1B191B]
               focus:ring-2 focus:ring-[#6D469B]"
    placeholder="Describe what you learned and how you completed this task..."
  />

  {/* File upload */}
  <div className="border-2 border-dashed border-[#BAB4BB] rounded-lg p-6
                  hover:border-[#6D469B] transition-colors">
    <input type="file" multiple />
    <p className="text-[#605C61] font-['Poppins'] font-medium">
      Drag files here or click to upload
    </p>
  </div>

  {/* Submit */}
  <button className="bg-gradient-to-r from-[#6D469B] to-[#EF597B] text-white
                     px-6 py-3 rounded-lg font-['Poppins'] font-semibold">
    Submit Evidence
  </button>
</form>
```

## Feedback & Celebration

### Task Completion Feedback
```
✓ Immediate visual confirmation
✓ XP award animation
✓ Process-focused message: "You just learned [skill]!"
✓ Progress indicator update
✗ Avoid: "Great job!" or "Well done!" (empty praise)
```

### Quest Completion Celebration
```
✓ Completion animation/confetti
✓ Total XP earned display
✓ Bonus XP highlight (50% completion bonus)
✓ Process reflection: "You've grown through this journey"
✓ Diploma/portfolio update notification
✗ Avoid: Future-focused messages like "You'll be successful!"
```

### Messaging Examples

**Good (Process-focused)**
- "You're learning right now"
- "This attempt taught you something valuable"
- "You're building your understanding"
- "This is your journey"

**Avoid (Outcome-focused)**
- "You'll be successful"
- "Keep trying until you get it right"
- "Achieve your goals"
- "You'll make it"

### Color Usage in Messaging

Use pillar-specific colors to reinforce learning areas:

```jsx
{/* STEM completion feedback */}
<div className="bg-gradient-to-r from-[#F3EFF4] to-[#DDF1FC] p-6 rounded-lg">
  <h3 className="text-[#2469D1] font-['Poppins'] font-bold">STEM & Logic</h3>
  <p className="text-[#3B383C] font-['Poppins'] font-medium">You're building logical thinking right now</p>
</div>

{/* ART completion feedback */}
<div className="bg-gradient-to-r from-[#F3EFF4] to-[#E7D5F2] p-6 rounded-lg">
  <h3 className="text-[#AF56E5] font-['Poppins'] font-bold">Arts & Creativity</h3>
  <p className="text-[#3B383C] font-['Poppins'] font-medium">Your creative expression is growing</p>
</div>

{/* COMMUNICATION completion feedback */}
<div className="bg-gradient-to-r from-[#F3EFF4] to-[#D1EED3] p-6 rounded-lg">
  <h3 className="text-[#3DA24A] font-['Poppins'] font-bold">Language & Communication</h3>
  <p className="text-[#3B383C] font-['Poppins'] font-medium">You're expressing yourself more clearly</p>
</div>

{/* LIFE completion feedback */}
<div className="bg-gradient-to-r from-[#F3EFF4] to-[#FCD8D8] p-6 rounded-lg">
  <h3 className="text-[#E65C5C] font-['Poppins'] font-bold">Life & Wellness</h3>
  <p className="text-[#3B383C] font-['Poppins'] font-medium">You're developing healthy habits</p>
</div>

{/* SOCIETY completion feedback */}
<div className="bg-gradient-to-r from-[#F3EFF4] to-[#F5F2E7] p-6 rounded-lg">
  <h3 className="text-[#FF9028] font-['Poppins'] font-bold">Society & Culture</h3>
  <p className="text-[#3B383C] font-['Poppins'] font-medium">You're understanding the world better</p>
</div>
```

## Progress Visualization

**Reference**: See [dashboard.png](mockups/pages/dashboard.png)

### Dashboard Overview
```
Layout:
1. XP totals by pillar (radar chart with pillar colors)
2. Active quests (with progress bars)
3. Recent completions
4. Streak/consistency tracker
5. Quick actions (start new quest, view diploma)
```

### Progress Indicators

**Linear Progress Bar**
```jsx
{/* STEM Quest Progress */}
<div className="w-full bg-[#EEEBEF] rounded-full h-3">
  <div className="bg-[#2469D1] h-3 rounded-full transition-all duration-300"
       style={{ width: '60%' }}>
  </div>
</div>
```

**Radar Chart** (Pillar colors)
```jsx
{/* Use pillar-specific colors for each axis */}
const pillarColors = {
  'STEM & Logic': '#2469D1',
  'Arts & Creativity': '#AF56E5',
  'Language & Communication': '#3DA24A',
  'Life & Wellness': '#E65C5C',
  'Society & Culture': '#FF9028'
}
```

## Diploma/Portfolio

### Portfolio Layout (CORE FEATURE)
```
Sections:
1. Hero header (student name, tagline, avatar)
2. XP Overview (total + by pillar with pillar colors)
3. Completed Quests (grid with images and pillar badges)
4. Quest Evidence (expandable detail)
5. Skills/Achievements
6. Download/Share options

Critical: This is what students show employers
```

### Evidence Display
- Thumbnails for images/videos
- Text excerpts with "Read more" expansion
- File download links
- Clean, professional presentation with Optio colors
- Resume-ready aesthetic

## Community Features (Paid Tier)

### Friends System
```
Pattern:
1. Search/browse users
2. Send friend request
3. Accept/reject requests
4. View friend list
5. See friend activity feed
```

### Collaboration Invitations
```
Pattern:
1. Select quest
2. Choose friend to invite
3. Add optional message
4. Send invitation
5. Friend accepts/rejects
6. Shared progress tracking
```

## Admin Patterns

### Admin Dashboard
```
Sections:
1. Key metrics (users, quests, completions)
2. Recent activity
3. Quick actions
4. Moderation queue
```

### User Management
```
Table with:
- Search/filter
- Bulk actions
- Individual user actions (edit, suspend, etc.)
- Subscription management
- Role assignment
```

### Quest Management
```
CRUD Operations:
- Create quest (with tasks and pillar assignment)
- Edit quest/tasks
- Activate/deactivate
- View analytics
- Approve custom quest submissions
```

## Error Handling

### Error States
```jsx
<div className="bg-[#FCD8D8] border border-[#E65C5C] rounded-lg p-4">
  <h4 className="font-semibold font-['Poppins'] text-[#9C1818]">Something went wrong</h4>
  <p className="text-[#B3393F] font-['Poppins'] font-medium text-sm">Clear explanation of what happened</p>
  <button className="mt-3 text-[#9C1818] font-['Poppins'] font-semibold underline">Try again</button>
</div>
```

### Empty States
```jsx
<div className="text-center py-12">
  <svg className="w-16 h-16 text-[#BAB4BB] mx-auto mb-4" />
  <h3 className="text-xl font-semibold font-['Poppins'] text-[#1B191B]">No quests yet</h3>
  <p className="text-[#605C61] font-['Poppins'] font-medium mb-4">Start your first quest to begin learning</p>
  <button className="bg-gradient-to-r from-[#6D469B] to-[#EF597B] text-white
                     px-6 py-3 rounded-lg font-['Poppins'] font-semibold">
    Browse Quests
  </button>
</div>
```

### Loading States
- Show skeletons with [#EEEBEF] background
- Use spinners with [#6D469B] color
- Disable buttons during submission
- Provide clear feedback for long operations

## Form Patterns

### Validation
- Inline validation (after blur)
- Clear error messages in [#E65C5C] color
- Highlight invalid fields with [#E65C5C] border
- Disable submit until valid

### Multi-Step Forms
```
Pattern:
1. Progress indicator at top (use main gradient)
2. One section visible at a time
3. "Next" and "Back" navigation
4. Save draft functionality
5. Review before submit
```

## Mobile-Specific Patterns

### Touch Targets
- Minimum 44x44px for all interactive elements
- Extra spacing between clickable items
- Avoid hover-only interactions

### Mobile Navigation
- Bottom tab bar for primary actions
- Hamburger menu for secondary navigation
- Swipe gestures for cards/galleries
- Pull-to-refresh where appropriate

### Mobile Forms
- Large input fields (48px height minimum)
- Appropriate keyboard types (email, number, etc.)
- Minimize typing when possible
- Use native pickers for dates/times

## Accessibility Patterns

### Keyboard Navigation
- All interactive elements keyboard accessible
- Logical tab order
- Skip links for long navigation
- Clear focus indicators using [#6D469B] ring

### Screen Readers
- Semantic HTML (nav, main, article, etc.)
- ARIA labels where needed
- Alt text for all images
- Descriptive link text (not "click here")

### Color/Contrast
- Meet WCAG AA standards (4.5:1 for text)
- Don't rely on color alone for meaning
- Sufficient contrast for all text
- Consider colorblind users (pillar system helps with this)

## Animation Guidelines

### When to Animate
- Page transitions
- Task completion celebrations
- Progress updates
- Feedback confirmations
- Loading states

### When NOT to Animate
- Critical information
- Long-form content
- Repetitive actions
- User preference (respect prefers-reduced-motion)

### Animation Timing
```css
/* Quick: Hover effects, micro-interactions */
duration-200 (200ms)

/* Standard: Modal open/close, transitions */
duration-300 (300ms)

/* Slow: Celebrations, dramatic effects */
duration-500 (500ms)
```

## Notification Patterns

### Toast Notifications
```jsx
<div className="fixed top-4 right-4 z-50">
  <div className="bg-white rounded-lg shadow-lg p-4 max-w-sm border-l-4 border-[#6D469B]">
    <div className="flex items-start">
      <svg className="w-5 h-5 text-[#3DA24A] mr-3" />
      <div>
        <h4 className="font-semibold font-['Poppins'] text-[#1B191B]">Success</h4>
        <p className="text-sm text-[#605C61] font-['Poppins'] font-medium">Action completed</p>
      </div>
    </div>
  </div>
</div>
```

### In-App Notifications
- Badge count on notification icon (use gradient)
- Notification center/dropdown
- Mark as read functionality
- Filter by type

## Search Patterns

### Search Bar
```jsx
<div className="relative">
  <input
    type="text"
    placeholder="Search quests..."
    className="w-full pl-10 pr-4 py-2 border border-[#BAB4BB] rounded-lg
               font-['Poppins'] font-medium
               focus:ring-2 focus:ring-[#6D469B] focus:border-transparent"
  />
  <svg className="absolute left-3 top-2.5 w-5 h-5 text-[#908B92]" />
</div>
```

### Search Results
- Show count of results
- Highlight matching terms with pillar color
- Filter/sort options with pill badges
- Empty state for no results

## Onboarding Patterns

### New User Flow
```
1. Welcome message
2. Quick tour (optional, skippable)
3. Profile setup
4. First quest suggestion (with pillar explanation)
5. Guide to diploma page
```

### Tooltips/Hints
- Show on first use
- Make dismissible
- Don't show again option
- Contextual help throughout
- Style with subtle gradient background

## Best Practices Summary

### Do
- Focus on the learning process
- Celebrate present-moment growth
- Provide clear, honest feedback
- Make the diploma page prominent
- Use consistent pillar colors
- Use Poppins font (Bold, Semi-Bold, Medium weights)
- Test on mobile devices
- Consider accessibility

### Don't
- Make empty promises about future success
- Use emojis in UI
- Hide errors or loading states
- Create complex multi-step flows unnecessarily
- Swap gradient direction (always purple→pink)
- Use light/thin font weights
- Ignore mobile experience
- Assume users know the system

## 2. Curriculum Source Link Button for Course Quests

**Objective**: Allow admins to add external curriculum links to course quests, and display a "Visit Course" button on the quest detail page for students.

**Backend Requirements**:
- Accept a `material_link` field in the course quest creation and update endpoints
- Store this in the existing `material_link` column in the quests table
- This field is optional and only relevant for course-type quests

**Frontend - Admin Panel (Course Quest Form)**:
- Add a text input field for `material_link` below the description field
- Include a placeholder showing an example URL (e.g., Khan Academy link)
- Add helper text explaining this is for linking to external curriculum resources

**Frontend - Quest Detail Page**:
- Add a "Visit Course" button below the quest description
- Only show this button for course quests that have a material_link populated
- Style it with the Optio brand gradient (purple to pink)
- Include an external link icon
- Make it responsive (full width on mobile, auto width on desktop)
- Open the link in a new tab with security attributes

---

## 3. Connections Page Restructure - Observers System

**Objective**: Remove the parent invitation system from the connections page and add an observers section that is admin-managed only.

**Frontend - Connections Page**:
- Remove all parent invitation-related functionality:
  - Remove state and handlers for parent invitations
  - Remove the invite parent modal component
  - Remove parent request components from the invitations tab
  - Clean up any parent-related API calls
- Simplify the quick actions section to focus on finding learning partners

**Frontend - Network Section**:
- Rename "Family & Parents" to "Observers"
- Display observers in the left column (currently will be empty)
- Add a disabled "Add Observer" button with a tooltip explaining that observers are added by advisors
- Update the empty state message to explain that observers support the learning journey
- Use a blue color theme for the observers section (distinct from the purple-pink learning partners theme)

**New Component - Observer Connection Card**:
- Create a new card component specifically for displaying observer connections
- Use a blue gradient theme (different from learning partners)
- Include an eye icon to represent observation/support
- Show observer name, avatar, and "Observer" badge
- Follow the same general layout as connection cards but with blue accents

**Components to Delete**:
- Parent invitation modal
- Parent request component

---

## 4. Active/Completed Task Separation

**Objective**: Split the task list into distinct "Active Tasks" and "Completed Tasks" sections for better visual organization and progress tracking.

**Frontend - Quest Detail Page**:

**Active Tasks Section**:
- Filter and display only incomplete tasks
- Add a section header labeled "Active Tasks"
- Style cards with:
  - Pillar-based left border accent (4px thick)
  - Subtle pillar-based background tint
  - Clean gray border
  - Red X button for removing tasks (only for non-tutorial tasks)
- Show "Continue" button for regular tasks, "View Instructions" for tutorial tasks
- Include an "Add Task" card at the end of the grid (when enrolled and quest not completed)

**Completed Tasks Section**:
- Filter and display only completed tasks
- Add a section header labeled "Completed Tasks"
- Apply a green theme throughout:
  - Green border
  - Light green background tint
  - Green title text
- Add a prominent "COMPLETED" badge in the top-right corner with a checkmark icon
- Do NOT show the red X button (completed tasks cannot be removed)
- Show "Edit Evidence" button for regular completed tasks
- Show "Completed!" status for auto-verified tutorial tasks
- Maintain the same card layout and pillar/XP badges as active tasks

**Design Principles**:
- Only render each section when it has tasks to display
- Use consistent card design across both sections
- Maintain multi-column grid layout for both sections
- Clear visual distinction between active work and achievements

---

## 5. Improved Quest Navigation & Completed Task Styling

**Objective**: Fix navigation flow to prevent confusion and improve the visual design of completed tasks.

**Frontend - Quest Detail Page**:

**Navigation Improvement**:
- Change the back button to always navigate to the dashboard
- This prevents users from accidentally navigating back to the task library after adding tasks
- Ensures a consistent and predictable navigation pattern

**Completed Task Card Visual Improvements**:
- Remove the red X button from completed tasks entirely
- Add a prominent green "COMPLETED" badge in the top-right corner with a checkmark icon
- Apply a light green background tint to the entire card
- Use green for the border color
- Use green for the title text (instead of strikethrough)
- Keep the red X button visible only for incomplete, non-tutorial tasks

**Design Goal**: Make completed tasks feel celebratory and permanent, while keeping incomplete tasks actionable.

---

## 6. Connections Page Layout Simplification

**Objective**: Remove redundant hero card and streamline the page layout for immediate access to connections.

**Frontend - Connections Page**:
- Remove the QuickActions component entirely
- Users should immediately see the observers and learning partners sections upon page load

**Frontend - Network Section**:
- Add an "Add Learning Partner" button directly in the Learning Partners section header
- Remove benefits card text from the empty state
- Adjust section spacing for proper visual balance

**Result**: Cleaner, more focused page layout that gets users directly to their connections without scrolling past a large hero card.

---

## Implementation Order

Recommended order to minimize conflicts:

1. Task Library Integration (affects wizard and quest detail)
2. Curriculum Source Link (small isolated feature)
3. Active/Completed Task Separation (builds on task card changes from #1)
4. Improved Quest Navigation & Styling (minor refinement to #3)
5. Connections Page Restructure (isolated to connections page)
6. Connections Page Layout Simplification (final polish to #5)

---

## Testing Checklist

After implementing each feature:

- [ ] Test on develop branch deployment: https://optio-dev-frontend.onrender.com
- [ ] Verify no console errors in browser
- [ ] Check Render backend logs for errors
- [ ] Test mobile responsiveness
- [ ] Verify accessibility (keyboard navigation, screen readers)
- [ ] Confirm Optio brand colors are used (not default Tailwind)
- [ ] Test with different user roles (student, admin, advisor)

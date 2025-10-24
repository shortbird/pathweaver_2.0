# Quest Type System Update - January 2025

## Overview
Implemented quest type differentiation system to support both self-directed (Optio) and curriculum-aligned (Course) quests.

## Database Changes

### 1. **quests** table - Updated
- **Renamed column**: `source` → `quest_type`
- **Values**: `'optio'` (self-directed with sample tasks) or `'course'` (curriculum-aligned with preset tasks)
- **Migration**: All existing quests migrated to `quest_type='optio'`
- **Constraint**: Added CHECK constraint for valid quest types

### 2. **quest_sample_tasks** table - NEW
```sql
CREATE TABLE quest_sample_tasks (
  id UUID PRIMARY KEY,
  quest_id UUID REFERENCES quests(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  pillar TEXT CHECK (pillar IN ('stem', 'wellness', 'communication', 'civics', 'art')),
  xp_value INTEGER DEFAULT 100,
  diploma_subjects JSONB DEFAULT '["Electives"]',
  subject_xp_distribution JSONB DEFAULT '{}',
  order_index INTEGER DEFAULT 0,
  ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```
- **Purpose**: Store reusable sample tasks for Optio quests as inspiration
- **Target**: ~20 sample tasks per quest with flexible pillar distribution
- **Visibility**: Public read (anyone can view), admin-only write
- **NOT per-user**: These are templates, not personalized

### 3. **course_quest_tasks** table - NEW
```sql
CREATE TABLE course_quest_tasks (
  id UUID PRIMARY KEY,
  quest_id UUID REFERENCES quests(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  pillar TEXT CHECK (pillar IN ('stem', 'wellness', 'communication', 'civics', 'art')),
  xp_value INTEGER DEFAULT 100,
  order_index INTEGER DEFAULT 0,
  is_required BOOLEAN DEFAULT true,
  diploma_subjects JSONB DEFAULT '["Electives"]',
  subject_xp_distribution JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```
- **Purpose**: Store preset tasks for course quests (template tasks)
- **Behavior**: Auto-copied to `user_quest_tasks` when student enrolls
- **Visibility**: Public read, admin-only write

## Backend Changes

### New Services

**`backend/services/sample_task_generator.py`**
- AI-powered sample task generation using Gemini API (gemini-2.0-flash-lite)
- Philosophy-aligned prompts (present-focused, process-oriented, NO external validation)
- Real-world application focus ONLY (no traditional study approaches)
- Quality validation (forbidden word detection, pillar distribution checks)
- Returns ~20 diverse sample tasks per quest

### New API Routes

**Admin Sample Task Management** (`backend/routes/admin/sample_task_management.py`):
- `POST /api/admin/quests/:quest_id/sample-tasks/generate` - AI generate sample tasks
- `GET /api/admin/quests/:quest_id/sample-tasks` - List sample tasks
- `POST /api/admin/quests/:quest_id/sample-tasks` - Manually create sample task
- `PUT /api/admin/quests/:quest_id/sample-tasks/:task_id` - Update sample task
- `DELETE /api/admin/quests/:quest_id/sample-tasks/:task_id` - Delete sample task

**Admin Course Quest Management** (`backend/routes/admin/course_quest_management.py`):
- `POST /api/admin/quests/create-course-quest` - Create course quest with preset tasks
- `GET /api/admin/quests/:quest_id/course-tasks` - List preset tasks
- `PUT /api/admin/quests/:quest_id/course-tasks` - Replace all preset tasks
- `DELETE /api/admin/quests/:quest_id/course-tasks/:task_id` - Delete preset task

**Quest Types** (`backend/routes/quest_types.py`):
- `POST /api/quests/:quest_id/add-sample-task` - Student adds sample task to their quest
- Helper functions: `get_sample_tasks_for_quest()`, `get_course_tasks_for_quest()`

### Updated Routes

**`backend/routes/quests.py`**:
- **Quest Detail** (`GET /api/quests/:quest_id`):
  - For Optio quests (not enrolled): Returns `sample_tasks` array (randomized order)
  - For Course quests (not enrolled): Returns `preset_tasks` array (ordered)
  - For enrolled users: Returns personalized `quest_tasks` as before

- **Enrollment** (`POST /api/quests/:quest_id/enroll`):
  - Detects `quest_type`
  - For Optio quests: Normal enrollment → personalization wizard
  - For Course quests:
    - Auto-copies all `course_quest_tasks` to `user_quest_tasks`
    - Marks `personalization_completed=true`
    - Returns `skip_wizard=true` flag to frontend
    - No personalization wizard shown

## Frontend Changes Needed

### Components to Create

**`SampleTaskCard.jsx`**:
- Display sample task with pillar-colored styling
- "Add to My Quest" button
- Philosophy-aligned tooltips
- Mobile-responsive design

**`CourseQuestForm.jsx`** (admin):
- Title + Description fields
- LMS platform dropdown
- Dynamic task builder:
  - Add/remove task rows
  - Drag-to-reorder
  - Pillar dropdown, XP input, subjects
- Validation and bulk save

### Components to Update

**`QuestDetail.jsx`**:
- Check `quest_type` from API response
- For Optio quests (not enrolled):
  - Section: "Sample Tasks for Inspiration"
  - Display `quest.sample_tasks` in random order
  - Show "Add to My Quest" button per task
  - Philosophy copy: "These spark ideas. Choose what resonates or create your own path!"
- For Course quests (not enrolled):
  - Section: "Required Tasks"
  - Display `quest.preset_tasks` in fixed order
  - Show "Start Course" button (no wizard)
  - Clear messaging about fixed requirements
- Handle `skip_wizard` flag from enrollment response

**`UnifiedQuestForm.jsx`** (admin):
- Add quest type radio buttons at top
- Conditionally render:
  - Optio Quest Form: Title + Big Idea + "Generate Sample Tasks" button
  - Course Quest Form: New form with task builder
- Sample task generation UI with edit capability

**`QuestPersonalizationWizard.jsx`**:
- Check for `skip_wizard` flag or `quest_type='course'`
- Don't render if course quest (should never be shown)

## API Response Format Changes

**Quest Detail Response** (non-enrolled):
```json
{
  "success": true,
  "quest": {
    "id": "...",
    "title": "...",
    "quest_type": "optio",  // NEW FIELD
    "sample_tasks": [        // NEW FIELD (for Optio quests)
      {
        "id": "...",
        "title": "Explore...",
        "description": "...",
        "pillar": "stem",
        "xp_value": 100,
        "ai_generated": true
      }
    ],
    "preset_tasks": [],      // NEW FIELD (for Course quests)
    "quest_tasks": [],       // Empty until enrolled
    "user_enrollment": null,
    "progress": null
  }
}
```

**Enrollment Response**:
```json
{
  "success": true,
  "message": "...",
  "enrollment": {...},
  "skip_wizard": true,     // NEW FIELD (true for course quests)
  "quest_type": "course"   // NEW FIELD
}
```

## Philosophy Alignment

### Sample Task Generation Prompt
- **MUST USE**: Present-focused language ("Discover...", "Explore...", "Create...")
- **NEVER USE**: External validation ("prove", "showcase", "impress")
- **NEVER USE**: Future-focused ("will help", "for college")
- **NEVER USE**: Traditional study (textbooks, lectures, tests)
- **FOCUS**: Real-world application through sports, hobbies, interests, daily life

### Example Sample Task (Good):
```json
{
  "title": "Explore Geometry in Your Neighborhood",
  "description": "Take a walk and discover geometric shapes in buildings, nature, and everyday objects. Capture photos and create a visual collection. You're seeing math come alive around you!",
  "pillar": "stem",
  "xp_value": 100
}
```

### Example Sample Task (Bad - Would be rejected):
```json
{
  "title": "Complete Chapter 5 Practice Problems",
  "description": "Work through the practice problems in your textbook to demonstrate mastery of geometric concepts. This will help prepare you for the upcoming test.",
  "pillar": "stem",
  "xp_value": 100
}
```

## Migration Summary

**Executed via Supabase MCP**:
1. `rename_source_to_quest_type` - Renamed column
2. `set_all_existing_quests_to_optio` - Migrated data
3. `create_quest_sample_tasks_table` - New table + RLS
4. `create_course_quest_tasks_table` - New table + RLS
5. `add_quest_type_indexes` - Performance optimization

**Data Impact**:
- All 35 existing quests → `quest_type='optio'`
- No sample tasks initially (admins can generate on-demand)
- No breaking changes to existing user enrollments

## Testing Checklist

- [ ] AI sample generation produces philosophy-aligned tasks
- [ ] Sample tasks show on Optio quest detail page (not enrolled)
- [ ] "Add to My Quest" button works correctly
- [ ] Preset tasks show on Course quest detail page (not enrolled)
- [ ] Course quest enrollment auto-copies tasks
- [ ] Course quest enrollment skips wizard
- [ ] Admin can generate sample tasks
- [ ] Admin can create course quests with bulk tasks
- [ ] Existing quests work as before (backward compatibility)
- [ ] Database migrations successful

## Next Steps

1. Create frontend components (SampleTaskCard, CourseQuestForm)
2. Update QuestDetail and admin forms
3. Test AI sample generation quality
4. Create admin documentation for quest creation
5. Train admins on new quest types
6. Generate sample tasks for popular quests
7. Test with real students in dev environment
8. Merge to main when stable

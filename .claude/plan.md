# Course Generation Queue System - Implementation Plan

## Problem Statement

The current AI Course Generator wizard requires users to wait through each generation step:
1. Generate outline → wait → select
2. Generate lessons → wait → click continue
3. Generate tasks → wait → click continue
4. Review → publish

This is inefficient when creating multiple courses - users cannot queue work and must babysit each step.

## Proposed Solution

Create a **background queue system** that allows users to:
1. Enter topic and approve the outline/structure
2. Click "Generate & Queue" to queue the rest for background processing
3. View a **queue dashboard** showing all jobs with status and logs
4. Run **multiple generation jobs concurrently**

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Course Generation Flow                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Topic Input] → [Generate Outlines] → [Select & Approve]       │
│                          ↓                                       │
│              [Queue for Background Processing]                   │
│                          ↓                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           Course Generation Queue Dashboard              │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │ Course Title      │ Status      │ Progress │ Logs  │ │   │
│  │  ├─────────────────────────────────────────────────────┤ │   │
│  │  │ Build Board Games │ Lessons     │ 3/5 done │ View  │ │   │
│  │  │ Cooking Mastery   │ Tasks       │ 8/12     │ View  │ │   │
│  │  │ Woodworking 101   │ Completed   │ Done     │ View  │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Phase 1: Database Schema

**New table: `course_generation_jobs`**

```sql
CREATE TABLE course_generation_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) NOT NULL,
    organization_id UUID REFERENCES organizations(id),

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending',
    -- Values: pending, generating_lessons, generating_tasks, finalizing, completed, failed, cancelled

    -- Progress tracking
    current_step TEXT,  -- 'lessons' or 'tasks'
    current_item TEXT,  -- Name of current project/lesson being processed
    items_completed INT DEFAULT 0,
    items_total INT DEFAULT 0,

    -- Logging
    logs JSONB DEFAULT '[]',  -- Array of log entries with timestamps

    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Error handling
    error_message TEXT,
    retry_count INT DEFAULT 0,

    -- Auto-publish option
    auto_publish BOOLEAN DEFAULT false
);

-- Index for fast lookups
CREATE INDEX idx_course_gen_jobs_user ON course_generation_jobs(user_id, created_at DESC);
CREATE INDEX idx_course_gen_jobs_status ON course_generation_jobs(status);
```

### Phase 2: Backend - Job Processing

**File: `backend/services/course_generation_job_service.py`**

New service that:
- Creates generation jobs from approved outlines
- Processes jobs with detailed logging
- Updates progress in real-time
- Handles errors gracefully with retry logic
- Supports cancellation

Key methods:
```python
class CourseGenerationJobService:
    def create_job(course_id, user_id, org_id, auto_publish=False) -> job_id
    def process_job(job_id) -> success
    def get_job_status(job_id) -> Dict with status, progress, logs
    def get_user_jobs(user_id) -> List of jobs
    def cancel_job(job_id) -> success
    def add_log(job_id, message, level='info')
```

**File: `backend/routes/admin/curriculum_generate.py` (additions)**

New endpoints:
```python
# Queue a course for background generation
POST /api/admin/curriculum/generate/<course_id>/queue
Body: { "auto_publish": true/false }
Returns: { "success": true, "job_id": "uuid" }

# Get all generation jobs for current user
GET /api/admin/curriculum/generate/jobs
Returns: { "jobs": [...] }

# Get specific job status with logs
GET /api/admin/curriculum/generate/jobs/<job_id>
Returns: { "job": {...}, "logs": [...] }

# Cancel a running job
POST /api/admin/curriculum/generate/jobs/<job_id>/cancel
Returns: { "success": true }

# Retry a failed job
POST /api/admin/curriculum/generate/jobs/<job_id>/retry
Returns: { "success": true }
```

**Integration with existing JobScheduler**

Add new job type `course_generation` to `backend/jobs/scheduler.py`:
```python
JOB_TYPE_COURSE_GENERATION = 'course_generation'

# In execute_job():
elif job_type == JobScheduler.JOB_TYPE_COURSE_GENERATION:
    from services.course_generation_job_service import CourseGenerationJobService
    job_service = CourseGenerationJobService()
    result = job_service.process_job(job_data['job_id'])
```

### Phase 3: Frontend - Queue Dashboard

**File: `frontend/src/pages/admin/CourseGenerationQueue.jsx`**

New dashboard page with:
- Table of all generation jobs (pending, running, completed, failed)
- Real-time status updates via polling (every 3 seconds for active jobs)
- Expandable log viewer for each job
- Cancel button for running jobs
- Retry button for failed jobs
- "New Course" button to start wizard
- Filter by status (All, Running, Completed, Failed)

**Table columns:**
| Course Title | Status | Progress | Started | Duration | Actions |
|--------------|--------|----------|---------|----------|---------|
| Build Board Games | Generating Lessons | 3/5 projects | 2 min ago | -- | Cancel |
| Cooking Mastery | Generating Tasks | 8/12 lessons | 5 min ago | -- | Cancel |
| Woodworking 101 | Completed | Done | 1 hr ago | 4m 32s | View Course |
| Guitar Basics | Failed | -- | 2 hr ago | -- | Retry |

**Status badges:**
- `pending` → Gray "Queued"
- `generating_lessons` → Blue "Generating Lessons"
- `generating_tasks` → Blue "Generating Tasks"
- `finalizing` → Purple "Finalizing"
- `completed` → Green "Completed"
- `failed` → Red "Failed"
- `cancelled` → Gray "Cancelled"

### Phase 4: Modified Wizard Flow

**Update `CourseGeneratorWizard.jsx`**

After Stage 1 (outline approved), add new option:

```
┌─────────────────────────────────────────────────────────────┐
│                  Course Structure Approved                   │
│                                                             │
│  "Build a Board Game from Scratch"                          │
│  5 Projects | Ready for content generation                  │
│                                                             │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  │
│  │  Generate & Queue       │  │  Generate Manually      │  │
│  │  (Recommended)          │  │  (Step by step)         │  │
│  │                         │  │                         │  │
│  │  Queue for background   │  │  Continue with current  │  │
│  │  processing. View       │  │  wizard flow.           │  │
│  │  progress in queue.     │  │                         │  │
│  └─────────────────────────┘  └─────────────────────────┘  │
│                                                             │
│  ☑ Auto-publish when complete                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**"Generate & Queue" action:**
1. Call `POST /api/admin/curriculum/generate/<course_id>/queue`
2. Redirect to `/admin/course-generation-queue`
3. Show toast: "Course queued for generation"

### Phase 5: Navigation Updates

**Add queue dashboard to admin navigation**

In `AdminLayout.jsx` or equivalent:
```jsx
{
  path: '/admin/course-generation-queue',
  label: 'Generation Queue',
  icon: QueueIcon
}
```

**Update curriculum upload page**

Add link/button to view generation queue from the curriculum upload page.

## File Changes Summary

### New Files
1. `backend/services/course_generation_job_service.py` - Job processing service
2. `frontend/src/pages/admin/CourseGenerationQueue.jsx` - Queue dashboard

### Modified Files
1. `backend/routes/admin/curriculum_generate.py` - Add queue endpoints
2. `backend/jobs/scheduler.py` - Add course_generation job type
3. `frontend/src/pages/admin/CourseGeneratorWizard.jsx` - Add queue option after outline
4. `frontend/src/App.jsx` or router config - Add queue dashboard route
5. Navigation component - Add queue link

### Database Migration
1. `supabase/migrations/xxx_create_course_generation_jobs.sql`

## Detailed Log Format

Each log entry stored in the `logs` JSONB array:

```json
{
  "timestamp": "2024-01-13T10:30:45Z",
  "level": "info",  // info, warning, error, success
  "message": "Generating lessons for project: Build Your First Prototype",
  "details": {
    "project_index": 2,
    "project_total": 5
  }
}
```

Example full log sequence:
```
10:30:00 [INFO] Starting course generation job
10:30:01 [INFO] Course: Build a Board Game from Scratch
10:30:01 [INFO] Projects to process: 5
10:30:02 [INFO] Generating lessons for project 1/5: Design Your Game Concept
10:30:15 [SUCCESS] Generated 4 lessons for: Design Your Game Concept
10:30:16 [INFO] Generating lessons for project 2/5: Build Your First Prototype
10:30:28 [SUCCESS] Generated 3 lessons for: Build Your First Prototype
...
10:32:00 [INFO] Starting task generation
10:32:01 [INFO] Generating tasks for lesson 1/15: Understanding Game Mechanics
10:32:08 [SUCCESS] Generated 3 tasks for: Understanding Game Mechanics
...
10:35:22 [SUCCESS] Course generation complete
10:35:22 [INFO] Summary: 5 projects, 15 lessons, 42 tasks
```

## Polling Strategy

**Queue Dashboard polling:**
- Poll every 5 seconds when any jobs are `pending`, `generating_lessons`, `generating_tasks`, or `finalizing`
- Stop polling when all visible jobs are `completed`, `failed`, or `cancelled`
- Use `setInterval` with cleanup on unmount

**Endpoint for efficient polling:**
```python
GET /api/admin/curriculum/generate/jobs?status=active
# Returns only pending/running jobs for faster response
```

## Error Handling

**Retry logic:**
- Max 3 retries for AI generation failures
- Exponential backoff between retries
- Log each retry attempt
- After max retries, mark job as failed with error details

**User actions on failure:**
- View error message and logs
- Retry button to restart from failed step (not from beginning)
- Cancel to abandon the job

## Success Metrics

After implementation:
- Users can queue multiple courses and walk away
- No waiting required after outline approval
- Clear visibility into generation progress
- Ability to run 3+ generation jobs concurrently
- Easy recovery from failures via retry

## Implementation Order

1. **Database migration** - Create `course_generation_jobs` table
2. **Backend job service** - `CourseGenerationJobService` with processing logic
3. **Backend endpoints** - Queue, status, cancel, retry endpoints
4. **Frontend queue dashboard** - Table with polling and log viewer
5. **Wizard integration** - Add "Generate & Queue" option
6. **Navigation** - Add links to queue dashboard
7. **Testing** - Verify concurrent generation works

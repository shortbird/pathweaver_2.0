Course System Implementation Plan
Final Architecture
Chosen Approach: Curriculum Layer (Approach C) with Course Completion Badges

Mapping:

Course = Badge (auto-created)
Course Project = Quest
Project Assignment = Task
Discovery: Unified Badges + Courses page

How It Works
COURSE: "Scientific Research"
├── Intro content (course-level)
├── PROJECT 1: "Asking Questions" (quest with lessons + tasks)
├── PROJECT 2: "Research Methods" (quest with lessons + tasks)
├── PROJECT 3: "Data Analysis" (quest with lessons + tasks)
└── BADGE: "Scientific Researcher" (auto-created)
    └── Earned when all projects completed
Student Flow:

Badges Page -> See Courses -> Enroll -> Work on Projects -> Earn Badge
Designer Flow:

Create Course -> Add Projects (quests) -> Add Content -> Publish -> Badge Auto-Created
Database Schema
courses (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  created_by UUID NOT NULL REFERENCES users(id),
  badge_id UUID REFERENCES badges(id),  -- Auto-created on publish

  intro_content JSONB,           -- Course welcome/objectives
  cover_image_url TEXT,

  status TEXT DEFAULT 'draft',   -- draft, published, archived
  visibility TEXT DEFAULT 'organization',
  navigation_mode TEXT DEFAULT 'sequential',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
)

course_projects (
  id UUID PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  quest_id UUID NOT NULL REFERENCES quests(id),

  sequence_order INTEGER NOT NULL,
  custom_title TEXT,             -- Override quest title
  intro_content JSONB,           -- Project intro
  is_required BOOLEAN DEFAULT true,

  UNIQUE(course_id, quest_id),
  UNIQUE(course_id, sequence_order)
)

course_enrollments (
  id UUID PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  status TEXT DEFAULT 'enrolled', -- enrolled, in_progress, completed
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  current_project_id UUID REFERENCES course_projects(id),

  UNIQUE(course_id, user_id)
)
Implementation Steps
Phase 1: Database & Backend Foundation
Create migration backend/database_migration/022_course_system.sql

Create courses, course_projects, course_enrollments tables
Add RLS policies for organization isolation
Add badge_type = 'course_completion' to badges
Create CourseRepository backend/repositories/course_repository.py

CRUD for courses
Project management (add, remove, reorder)
Enrollment queries
Create CourseService backend/services/course_service.py

create_course() - Create draft course
publish_course() - Auto-create badge, populate badge_quests
enroll_student() - Create enrollment + start badge pursuit
get_student_progress() - Aggregate project completion
Create Course Routes backend/routes/courses.py

GET /api/courses - List courses (org-filtered)
POST /api/courses - Create course
GET /api/courses/:id - Course detail with projects
PUT /api/courses/:id - Update course
POST /api/courses/:id/publish - Publish + create badge
POST /api/courses/:id/projects - Add project
PUT /api/courses/:id/projects/reorder - Reorder projects
POST /api/courses/:id/enroll - Student enrollment
GET /api/courses/:id/progress - Student progress
Phase 2: Designer UI (Course Builder)
Create CourseBuilder frontend/src/pages/courses/CourseBuilder.jsx

Two-column layout (project list + editor)
Course metadata editor (title, description, intro)
Project list with drag-drop reordering
Add project modal (select from org quests)
Publish button (creates badge)
Create CourseCard frontend/src/components/courses/CourseCard.jsx

Display course with project count
Progress indicator for enrolled students
Phase 3: Student UI
Update BadgesPage frontend/src/pages/BadgesPage.jsx

Add "Available Courses" section at top
Course cards with enrollment CTA
Existing badge sections below
Create CourseDetailPage frontend/src/pages/courses/CourseDetailPage.jsx

Course intro and project list
Project completion status
Navigate to quest curriculum
Progress bar toward badge
Phase 4: Integration
Connect to existing curriculum

Project (quest) shows its existing curriculum_lessons
Task completion triggers badge eligibility
Update badge service backend/services/badge_service.py

Handle badge_type = 'course_completion'
Progress = projects completed / total
Key Files
Backend (New):

backend/database_migration/022_course_system.sql
backend/repositories/course_repository.py
backend/services/course_service.py
backend/routes/courses.py
Backend (Modify):

backend/routes/__init__.py - Register course routes
backend/services/badge_service.py - Course badge logic
Frontend (New):

frontend/src/pages/courses/CourseBuilder.jsx
frontend/src/pages/courses/CourseDetailPage.jsx
frontend/src/components/courses/CourseCard.jsx
frontend/src/services/courseService.js
Frontend (Modify):

frontend/src/pages/BadgesPage.jsx - Add courses section
frontend/src/App.jsx - Add course routes
Leverages Existing Code
Curriculum lessons: Quest lessons become project content (no changes)
Badge system: Extend with course_completion type, reuse claiming
Quest enrollment: user_quests pick-up/set-down triggers badge eligibility
CurriculumBuilder UI: Reference patterns for CourseBuilder
Out of Scope (Future)
Pathway badges (aggregate course badges)
Course prerequisites
Course certificates
Course analytics
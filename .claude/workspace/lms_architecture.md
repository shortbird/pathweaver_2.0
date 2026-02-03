# LMS Technical Architecture

**Last Updated**: December 27, 2025
**Status**: Design Phase
**Related Systems**: Organizations, Observer System, Canvas Converter

---

## Overview

This document defines the technical architecture for Optio's Learning Management System (LMS) integration, enabling schools to manage quests, invite advisors, share announcements, generate progress reports, and build custom curricula within a multi-tenant environment.

---

## Database Schema

### Core Tables

#### `quest_invitations`
Enables schools to invite specific students to join quests.

```sql
CREATE TABLE quest_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    UNIQUE(organization_id, quest_id, user_id)
);

CREATE INDEX idx_quest_invitations_user ON quest_invitations(user_id, status);
CREATE INDEX idx_quest_invitations_org ON quest_invitations(organization_id, quest_id);
CREATE INDEX idx_quest_invitations_expires ON quest_invitations(expires_at) WHERE status = 'pending';
```

**Fields**:
- `organization_id`: School/org issuing the invitation
- `quest_id`: Quest being shared
- `user_id`: Student receiving invitation
- `invited_by`: Admin/teacher who sent it
- `status`: Invitation state
- `expires_at`: Optional expiration date

---

#### `announcements`
Organization-wide announcements for students, advisors, and admins.

```sql
CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    target_audience TEXT NOT NULL DEFAULT 'all' CHECK (target_audience IN ('all', 'students', 'advisors', 'admins')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    published_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_announcements_org ON announcements(organization_id, published_at DESC);
CREATE INDEX idx_announcements_audience ON announcements(organization_id, target_audience, is_active);
CREATE INDEX idx_announcements_active ON announcements(is_active, expires_at) WHERE is_active = TRUE;
```

**Fields**:
- `author_id`: Admin/teacher who created it
- `target_audience`: Who should see it
- `priority`: Visual importance (affects UI display)
- `published_at`: When it becomes visible
- `expires_at`: Optional auto-hide date

---

#### `audit_logs`
Compliance and security audit trail for all LMS administrative actions.

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

**Common Actions**:
- `quest.invite`, `quest.create`, `quest.modify`, `quest.delete`
- `user.invite`, `user.role_change`, `user.suspend`
- `announcement.create`, `announcement.delete`
- `curriculum.create`, `curriculum.publish`
- `progress_report.generate`, `progress_report.export`

**Details JSONB Schema**:
```json
{
    "old_value": "previous state (for updates)",
    "new_value": "new state (for updates)",
    "metadata": {
        "quest_title": "context-specific info",
        "student_email": "context-specific info"
    }
}
```

---

#### `curriculum_templates`
Pre-built quest sequences for schools to adopt or customize.

```sql
CREATE TABLE curriculum_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    grade_level TEXT,
    subject_area TEXT,
    duration_weeks INTEGER,
    is_public BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_curriculum_org ON curriculum_templates(organization_id, is_active);
CREATE INDEX idx_curriculum_public ON curriculum_templates(is_public, is_active) WHERE is_public = TRUE;
```

**Fields**:
- `organization_id`: If NULL, it's an Optio-created public template
- `created_by`: Admin/teacher who built it
- `grade_level`: E.g., "9-10", "AP", "Intro"
- `subject_area`: E.g., "Math", "Science", "CS"
- `is_public`: If true, visible to all orgs

---

#### `curriculum_quest_mappings`
Links quests to curriculum templates in a specific order.

```sql
CREATE TABLE curriculum_quest_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    curriculum_id UUID NOT NULL REFERENCES curriculum_templates(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL,
    week_number INTEGER,
    is_required BOOLEAN DEFAULT TRUE,
    estimated_hours DECIMAL(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(curriculum_id, quest_id)
);

CREATE INDEX idx_curriculum_mappings ON curriculum_quest_mappings(curriculum_id, sequence_order);
```

**Fields**:
- `sequence_order`: Quest position in curriculum (1, 2, 3...)
- `week_number`: Suggested week of delivery
- `is_required`: vs. optional enrichment quest
- `estimated_hours`: Time estimate for planning

---

#### `progress_reports`
Pre-generated or on-demand student progress reports for schools.

```sql
CREATE TABLE progress_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    generated_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_type TEXT NOT NULL DEFAULT 'standard' CHECK (report_type IN ('standard', 'detailed', 'summary')),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    data JSONB NOT NULL,
    format TEXT NOT NULL DEFAULT 'json' CHECK (format IN ('json', 'pdf', 'csv')),
    file_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_progress_reports_org ON progress_reports(organization_id, created_at DESC);
CREATE INDEX idx_progress_reports_student ON progress_reports(student_id, created_at DESC);
```

**Data JSONB Schema**:
```json
{
    "student": {
        "name": "Jane Doe",
        "email": "jane@school.edu",
        "total_xp": 1250
    },
    "period": {
        "start": "2025-09-01",
        "end": "2025-12-20"
    },
    "quests_completed": 8,
    "quests_in_progress": 2,
    "pillars": {
        "creativity": { "xp": 300, "quests": 2 },
        "critical_thinking": { "xp": 450, "quests": 3 }
    },
    "badges_earned": [
        { "name": "Creative Explorer", "earned_at": "2025-10-15" }
    ],
    "recent_tasks": [
        {
            "title": "Design a poster",
            "completed_at": "2025-12-10",
            "xp": 50,
            "pillar": "creativity"
        }
    ]
}
```

---

### Integration with Existing Tables

#### `organizations`
**Existing Columns**:
- `id`, `name`, `slug`, `quest_visibility_policy`, `is_active`

**New Column (Optional)**:
```sql
ALTER TABLE organizations ADD COLUMN lms_features_enabled BOOLEAN DEFAULT FALSE;
```

If `lms_features_enabled = TRUE`, the school can use invitations, announcements, curriculum builder, etc.

---

#### `users`
**Existing Columns**:
- `id`, `email`, `role`, `organization_id`, `is_dependent`, `managed_by_parent_id`

**New Roles** (add to CHECK constraint):
- `school_admin`: Can manage organization-wide settings, invite advisors, create curricula
- `advisor`: Can invite students to quests, view progress reports, post announcements
- `student`: Default role (existing)

```sql
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('student', 'parent', 'observer', 'advisor', 'school_admin', 'platform_admin'));
```

---

#### `organization_quest_access`
**Existing Table**: Maps which quests are available to which organizations.

**Usage**: When a school admin "imports" a public quest or creates a private quest, add a row here. Quest invitations reference quests that are already in `organization_quest_access`.

---

#### Observer System Integration
**Existing Tables**: `friendships` (used for observers).

**LMS Enhancement**: Advisors (new role) function like observers but with organization-wide permissions. They can:
- View all students in their org
- Generate progress reports
- Invite students to quests

No new tables needed; use existing `users.role = 'advisor'` and `users.organization_id` for filtering.

---

## API Endpoints

### Quest Management (School Admins & Advisors)

#### `GET /api/lms/quests`
List all quests available to the school (from `organization_quest_access`).

**Query Params**:
- `?quest_type=lms_course|personal|admin_created`
- `?is_active=true|false`

**Response**:
```json
{
    "quests": [
        {
            "id": "uuid",
            "title": "Intro to Python",
            "quest_type": "lms_course",
            "lms_course_id": "canvas_12345",
            "is_active": true,
            "organization_id": "uuid"
        }
    ]
}
```

**Auth**: Requires `school_admin` or `advisor` role.

---

#### `POST /api/lms/quests/:quest_id/invite`
Invite student(s) to join a quest.

**Body**:
```json
{
    "user_ids": ["uuid1", "uuid2"],
    "expires_at": "2025-12-31T23:59:59Z" // optional
}
```

**Response**:
```json
{
    "invitations_created": 2,
    "invitations": [
        {
            "id": "uuid",
            "quest_id": "uuid",
            "user_id": "uuid1",
            "status": "pending"
        }
    ]
}
```

**Audit**: Logs `quest.invite` action.

**Auth**: Requires `school_admin` or `advisor` role + same organization as students.

---

#### `GET /api/lms/quests/invitations`
List all invitations sent by the school.

**Query Params**:
- `?status=pending|accepted|declined|expired`
- `?quest_id=uuid`

**Response**:
```json
{
    "invitations": [
        {
            "id": "uuid",
            "quest_id": "uuid",
            "quest_title": "Intro to Python",
            "user_id": "uuid",
            "user_email": "student@school.edu",
            "status": "pending",
            "expires_at": "2025-12-31T23:59:59Z",
            "created_at": "2025-11-01T10:00:00Z"
        }
    ]
}
```

**Auth**: Requires `school_admin` or `advisor` role.

---

### Announcements

#### `POST /api/lms/announcements`
Create a new announcement.

**Body**:
```json
{
    "title": "Finals Week Schedule",
    "content": "Finals will be held Dec 18-22. Good luck!",
    "target_audience": "students",
    "priority": "high",
    "expires_at": "2025-12-23T00:00:00Z" // optional
}
```

**Response**:
```json
{
    "announcement": {
        "id": "uuid",
        "title": "Finals Week Schedule",
        "published_at": "2025-12-01T08:00:00Z"
    }
}
```

**Audit**: Logs `announcement.create` action.

**Auth**: Requires `school_admin` or `advisor` role.

---

#### `GET /api/lms/announcements`
List active announcements for the user's organization.

**Query Params**:
- `?target_audience=all|students|advisors|admins`
- `?is_active=true|false`

**Response**:
```json
{
    "announcements": [
        {
            "id": "uuid",
            "title": "Finals Week Schedule",
            "content": "Finals will be held Dec 18-22...",
            "priority": "high",
            "published_at": "2025-12-01T08:00:00Z"
        }
    ]
}
```

**Auth**: Requires authenticated user in the organization.

---

#### `DELETE /api/lms/announcements/:id`
Delete an announcement.

**Audit**: Logs `announcement.delete` action.

**Auth**: Requires `school_admin` or `advisor` role + same organization.

---

### Curriculum Builder

#### `POST /api/lms/curriculum`
Create a new curriculum template.

**Body**:
```json
{
    "title": "AP Computer Science Principles",
    "description": "Full-year curriculum for AP CSP",
    "grade_level": "11-12",
    "subject_area": "Computer Science",
    "duration_weeks": 36,
    "is_public": false
}
```

**Response**:
```json
{
    "curriculum": {
        "id": "uuid",
        "title": "AP Computer Science Principles",
        "created_at": "2025-12-01T10:00:00Z"
    }
}
```

**Audit**: Logs `curriculum.create` action.

**Auth**: Requires `school_admin` role.

---

#### `POST /api/lms/curriculum/:curriculum_id/quests`
Add quests to a curriculum.

**Body**:
```json
{
    "quests": [
        {
            "quest_id": "uuid1",
            "sequence_order": 1,
            "week_number": 1,
            "is_required": true,
            "estimated_hours": 8
        },
        {
            "quest_id": "uuid2",
            "sequence_order": 2,
            "week_number": 3,
            "is_required": true,
            "estimated_hours": 10
        }
    ]
}
```

**Response**:
```json
{
    "mappings_created": 2
}
```

**Auth**: Requires `school_admin` role + same organization.

---

#### `GET /api/lms/curriculum`
List all curriculum templates available to the school.

**Query Params**:
- `?is_public=true` (includes Optio-created public templates)

**Response**:
```json
{
    "curricula": [
        {
            "id": "uuid",
            "title": "AP Computer Science Principles",
            "grade_level": "11-12",
            "subject_area": "Computer Science",
            "quest_count": 12,
            "is_public": false
        }
    ]
}
```

**Auth**: Requires `school_admin` or `advisor` role.

---

#### `GET /api/lms/curriculum/:curriculum_id`
Get curriculum details with full quest sequence.

**Response**:
```json
{
    "curriculum": {
        "id": "uuid",
        "title": "AP Computer Science Principles",
        "description": "Full-year curriculum...",
        "quests": [
            {
                "quest_id": "uuid",
                "quest_title": "Intro to Python",
                "sequence_order": 1,
                "week_number": 1,
                "is_required": true,
                "estimated_hours": 8
            }
        ]
    }
}
```

**Auth**: Requires `school_admin` or `advisor` role.

---

### Progress Reports

#### `POST /api/lms/reports/generate`
Generate a progress report for a student.

**Body**:
```json
{
    "student_id": "uuid",
    "report_type": "detailed",
    "period_start": "2025-09-01T00:00:00Z",
    "period_end": "2025-12-20T23:59:59Z",
    "format": "json" // or "pdf", "csv"
}
```

**Response**:
```json
{
    "report": {
        "id": "uuid",
        "student_id": "uuid",
        "format": "json",
        "data": { /* JSONB data structure */ },
        "file_url": null, // or S3 URL for PDF/CSV
        "created_at": "2025-12-20T10:00:00Z"
    }
}
```

**Audit**: Logs `progress_report.generate` action.

**Auth**: Requires `school_admin` or `advisor` role + same organization as student.

---

#### `GET /api/lms/reports`
List all generated reports for the school.

**Query Params**:
- `?student_id=uuid`
- `?report_type=standard|detailed|summary`

**Response**:
```json
{
    "reports": [
        {
            "id": "uuid",
            "student_id": "uuid",
            "student_name": "Jane Doe",
            "report_type": "detailed",
            "period_start": "2025-09-01",
            "period_end": "2025-12-20",
            "created_at": "2025-12-20T10:00:00Z",
            "file_url": "https://..."
        }
    ]
}
```

**Auth**: Requires `school_admin` or `advisor` role.

---

### Advisor Management

#### `POST /api/lms/advisors/invite`
Invite a teacher/advisor to join the organization.

**Body**:
```json
{
    "email": "teacher@school.edu",
    "display_name": "Mr. Smith",
    "role": "advisor" // or "school_admin"
}
```

**Response**:
```json
{
    "user": {
        "id": "uuid",
        "email": "teacher@school.edu",
        "role": "advisor",
        "organization_id": "uuid"
    },
    "invitation_sent": true
}
```

**Audit**: Logs `user.invite` action.

**Auth**: Requires `school_admin` role.

---

#### `GET /api/lms/advisors`
List all advisors in the school.

**Response**:
```json
{
    "advisors": [
        {
            "id": "uuid",
            "email": "teacher@school.edu",
            "display_name": "Mr. Smith",
            "role": "advisor",
            "created_at": "2025-11-01T10:00:00Z"
        }
    ]
}
```

**Auth**: Requires `school_admin` or `advisor` role.

---

### Audit Logs

#### `GET /api/lms/audit-logs`
Retrieve audit logs for compliance.

**Query Params**:
- `?user_id=uuid`
- `?action=quest.invite|announcement.create|etc`
- `?start_date=2025-11-01`
- `?end_date=2025-12-31`

**Response**:
```json
{
    "logs": [
        {
            "id": "uuid",
            "user_id": "uuid",
            "user_email": "admin@school.edu",
            "action": "quest.invite",
            "resource_type": "quest_invitation",
            "resource_id": "uuid",
            "details": {
                "quest_title": "Intro to Python",
                "student_email": "jane@school.edu"
            },
            "created_at": "2025-12-01T10:00:00Z"
        }
    ]
}
```

**Auth**: Requires `school_admin` role.

---

## Row-Level Security (RLS) Policies

All LMS tables use RLS to enforce multi-tenant isolation.

### General Pattern

```sql
-- Enable RLS on all tables
ALTER TABLE quest_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_quest_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_reports ENABLE ROW LEVEL SECURITY;
```

---

### `quest_invitations` Policies

```sql
-- Students can view their own pending invitations
CREATE POLICY quest_invitations_student_view ON quest_invitations
    FOR SELECT
    USING (
        user_id = auth.uid()
        AND status = 'pending'
    );

-- Students can update their own invitations (accept/decline)
CREATE POLICY quest_invitations_student_update ON quest_invitations
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Admins/advisors can view all invitations in their org
CREATE POLICY quest_invitations_admin_view ON quest_invitations
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role IN ('school_admin', 'advisor')
        )
    );

-- Admins/advisors can create invitations in their org
CREATE POLICY quest_invitations_admin_insert ON quest_invitations
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role IN ('school_admin', 'advisor')
        )
    );
```

---

### `announcements` Policies

```sql
-- All users in org can view announcements targeted to them
CREATE POLICY announcements_view ON announcements
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
        AND is_active = TRUE
        AND (
            expires_at IS NULL OR expires_at > NOW()
        )
        AND (
            target_audience = 'all'
            OR target_audience = (SELECT role FROM users WHERE id = auth.uid())
        )
    );

-- Admins/advisors can create announcements
CREATE POLICY announcements_admin_insert ON announcements
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role IN ('school_admin', 'advisor')
        )
    );

-- Admins/advisors can update/delete their own announcements
CREATE POLICY announcements_admin_update ON announcements
    FOR UPDATE
    USING (
        author_id = auth.uid()
        AND organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
    );

CREATE POLICY announcements_admin_delete ON announcements
    FOR DELETE
    USING (
        author_id = auth.uid()
        AND organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
    );
```

---

### `audit_logs` Policies

```sql
-- Only school_admin can view audit logs in their org
CREATE POLICY audit_logs_admin_view ON audit_logs
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role = 'school_admin'
        )
    );

-- Backend service (admin client) can insert logs
-- No user-facing INSERT policy needed (backend only)
```

---

### `curriculum_templates` Policies

```sql
-- Users in org can view their org's curricula + public curricula
CREATE POLICY curriculum_view ON curriculum_templates
    FOR SELECT
    USING (
        (
            organization_id IN (
                SELECT organization_id FROM users WHERE id = auth.uid()
            )
            OR is_public = TRUE
        )
        AND is_active = TRUE
    );

-- School admins can create curricula in their org
CREATE POLICY curriculum_admin_insert ON curriculum_templates
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role = 'school_admin'
        )
    );

-- School admins can update/delete their own curricula
CREATE POLICY curriculum_admin_update ON curriculum_templates
    FOR UPDATE
    USING (
        created_by = auth.uid()
        AND organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
    );
```

---

### `curriculum_quest_mappings` Policies

```sql
-- Users can view mappings for curricula they can access
CREATE POLICY curriculum_mappings_view ON curriculum_quest_mappings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM curriculum_templates
            WHERE id = curriculum_quest_mappings.curriculum_id
            AND (
                organization_id IN (
                    SELECT organization_id FROM users WHERE id = auth.uid()
                )
                OR is_public = TRUE
            )
        )
    );

-- School admins can create mappings for their curricula
CREATE POLICY curriculum_mappings_admin_insert ON curriculum_quest_mappings
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM curriculum_templates
            WHERE id = curriculum_quest_mappings.curriculum_id
            AND created_by = auth.uid()
        )
    );
```

---

### `progress_reports` Policies

```sql
-- Students can view their own reports
CREATE POLICY progress_reports_student_view ON progress_reports
    FOR SELECT
    USING (student_id = auth.uid());

-- Admins/advisors can view all reports in their org
CREATE POLICY progress_reports_admin_view ON progress_reports
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role IN ('school_admin', 'advisor')
        )
    );

-- Admins/advisors can create reports
CREATE POLICY progress_reports_admin_insert ON progress_reports
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role IN ('school_admin', 'advisor')
        )
    );
```

---

## Integration Points

### Canvas Course Converter

**Existing System**: Converts Canvas courses to Optio quests (`lms_course_id` field on `quests` table).

**LMS Enhancement**:
1. When a school admin imports a Canvas course, automatically create an `organization_quest_access` row
2. Optionally auto-create quest invitations for all students in the Canvas course
3. Log the import action to `audit_logs`

**API Flow**:
```
POST /api/lms/canvas/import
Body: { canvas_course_id: "12345", auto_invite: true }
→ Creates quest with lms_course_id
→ Adds to organization_quest_access
→ If auto_invite=true, creates quest_invitations for all org students
→ Logs audit event
```

---

### Observer System

**Existing System**: Uses `friendships` table for observer relationships.

**LMS Enhancement**:
- Advisors function like observers but org-wide
- No new tables needed
- API endpoints filter by `organization_id` and `role`

**Advisor Permissions vs. Observer Permissions**:
| Permission | Observer | Advisor |
|------------|----------|---------|
| View specific student's portfolio | Yes | Yes (all students in org) |
| Generate progress reports | No | Yes |
| Invite students to quests | No | Yes |
| Post announcements | No | Yes |

---

### Organizations Table

**Existing Columns**:
- `quest_visibility_policy` ("all_optio", "curated", "private_only")

**LMS Usage**:
- `all_optio`: Students see public quests + org's private quests + invited quests
- `curated`: Students only see org's curated quests + invited quests
- `private_only`: Students only see invited quests

**New Column** (optional):
```sql
ALTER TABLE organizations ADD COLUMN lms_features_enabled BOOLEAN DEFAULT FALSE;
```

If `lms_features_enabled = TRUE`, show LMS UI (announcements, curriculum builder, etc.).

---

## Repository Pattern (Recommended)

For new LMS code, use the repository pattern (see `backend/repositories/` for examples).

### Example: `InvitationRepository`

```python
# backend/repositories/invitation_repository.py

from typing import List, Optional
from datetime import datetime

class InvitationRepository:
    def __init__(self, client):
        self.client = client

    def create_invitation(
        self,
        organization_id: str,
        quest_id: str,
        user_id: str,
        invited_by: str,
        expires_at: Optional[datetime] = None
    ):
        """Create a quest invitation."""
        data = {
            "organization_id": organization_id,
            "quest_id": quest_id,
            "user_id": user_id,
            "invited_by": invited_by,
            "expires_at": expires_at.isoformat() if expires_at else None,
            "status": "pending"
        }
        result = self.client.table("quest_invitations").insert(data).execute()
        return result.data[0] if result.data else None

    def get_pending_invitations_for_user(self, user_id: str):
        """Get all pending invitations for a user."""
        result = self.client.table("quest_invitations") \
            .select("*, quests(title)") \
            .eq("user_id", user_id) \
            .eq("status", "pending") \
            .execute()
        return result.data

    def update_invitation_status(self, invitation_id: str, status: str):
        """Update invitation status (accept/decline)."""
        data = {
            "status": status,
            "accepted_at": datetime.utcnow().isoformat() if status == "accepted" else None
        }
        result = self.client.table("quest_invitations") \
            .update(data) \
            .eq("id", invitation_id) \
            .execute()
        return result.data[0] if result.data else None
```

---

## Data Model Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         ORGANIZATIONS                                │
│  id, name, slug, quest_visibility_policy, lms_features_enabled       │
└───────────────────────────┬──────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┬─────────────────┐
            │               │               │                 │
            ▼               ▼               ▼                 ▼
    ┌──────────────┐ ┌─────────────┐ ┌──────────────┐ ┌──────────────┐
    │    USERS     │ │   QUESTS    │ │ ANNOUNCEMENTS│ │ CURRICULUM   │
    │              │ │             │ │              │ │  TEMPLATES   │
    │ role:        │ │ quest_type  │ │ target_aud.  │ │              │
    │  student     │ │ lms_course  │ │ priority     │ │ grade_level  │
    │  advisor     │ │ org_id      │ │ expires_at   │ │ subject_area │
    │ school_admin │ │             │ │              │ │              │
    └───────┬──────┘ └──────┬──────┘ └──────────────┘ └──────┬───────┘
            │               │                                 │
            │               ▼                                 │
            │      ┌──────────────────┐                       │
            │      │ QUEST_INVITATIONS│◄──────────────────────┘
            │      │                  │
            │      │ user_id          │
            │      │ quest_id         │
            │      │ status           │
            │      │ expires_at       │
            │      └──────────────────┘
            │
            ▼
    ┌──────────────────┐
    │ PROGRESS_REPORTS │
    │                  │
    │ student_id       │
    │ generated_by     │
    │ data (JSONB)     │
    │ file_url         │
    └──────────────────┘

    ┌──────────────────────────────────────────┐
    │        CURRICULUM_QUEST_MAPPINGS         │
    │                                          │
    │  curriculum_id → curriculum_templates    │
    │  quest_id → quests                       │
    │  sequence_order                          │
    │  week_number                             │
    └──────────────────────────────────────────┘

    ┌──────────────────┐
    │   AUDIT_LOGS     │
    │                  │
    │ organization_id  │
    │ user_id          │
    │ action           │
    │ resource_type    │
    │ details (JSONB)  │
    └──────────────────┘
```

---

## Implementation Checklist

### Phase 1: Database Setup
- [ ] Create `quest_invitations` table with RLS policies
- [ ] Create `announcements` table with RLS policies
- [ ] Create `audit_logs` table with RLS policies
- [ ] Add new roles to `users` table constraint
- [ ] Test RLS policies with mock users

### Phase 2: Core Features
- [ ] Implement `InvitationRepository` and routes
- [ ] Implement `AnnouncementRepository` and routes
- [ ] Implement `AuditLogRepository` and logging middleware
- [ ] Test invitation flow (create → accept → start quest)
- [ ] Test announcement visibility by role

### Phase 3: Curriculum Builder
- [ ] Create `curriculum_templates` table with RLS
- [ ] Create `curriculum_quest_mappings` table with RLS
- [ ] Implement `CurriculumRepository` and routes
- [ ] Build curriculum UI (admin panel)
- [ ] Test curriculum creation and quest sequencing

### Phase 4: Progress Reports
- [ ] Create `progress_reports` table with RLS
- [ ] Implement `ProgressReportRepository` and routes
- [ ] Build report generation service (JSONB data)
- [ ] Add PDF export functionality
- [ ] Test report generation for various date ranges

### Phase 5: Integration
- [ ] Enhance Canvas converter to create `organization_quest_access`
- [ ] Add advisor UI to observer system
- [ ] Update `organizations` table with `lms_features_enabled`
- [ ] Implement feature flag checks in frontend
- [ ] End-to-end testing

---

## Security Considerations

1. **Multi-Tenant Isolation**: All RLS policies enforce `organization_id` checks
2. **Role-Based Access**: Admins/advisors/students have different permissions
3. **Audit Trail**: All administrative actions logged to `audit_logs`
4. **Invitation Expiry**: Automatic cleanup job for expired invitations (cron job)
5. **CSRF Protection**: All POST endpoints require CSRF tokens (existing middleware)
6. **httpOnly Cookies**: Authentication uses httpOnly cookies (existing pattern)

---

## Performance Optimizations

1. **Indexes**: All foreign keys and common query patterns have indexes
2. **JSONB Indexing**: Use GIN indexes for `audit_logs.details` and `progress_reports.data` if querying often
3. **Announcement Cleanup**: Cron job to archive/delete expired announcements
4. **Report Caching**: Cache generated reports; regenerate only when needed

---

## Future Enhancements

1. **Bulk Invitations**: CSV upload for inviting entire classes
2. **Analytics Dashboard**: School-wide progress tracking
3. **Gamification**: Leaderboards for schools (opt-in)
4. **Parent Portal**: Link dependents to school accounts
5. **Integration with Google Classroom**: Similar to Canvas converter

---

## References

- **Repository Pattern**: `backend/docs/REPOSITORY_PATTERN.md`
- **Observer System**: `backend/routes/observer_routes.py`
- **Canvas Converter**: `backend/services/canvas_converter.py`
- **Organizations**: `backend/routes/admin_routes.py` (organization management)

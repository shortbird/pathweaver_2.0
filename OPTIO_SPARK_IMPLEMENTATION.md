# Optio - Spark Integration Implementation Plan

**For:** Optio Development Team
**Timeline:** 3 Weeks
**Status:** Ready for Development

---

## Overview

This document outlines the internal implementation plan for integrating Spark LMS with Optio. We're adding Spark as another LMS platform (like Canvas, Moodle, Google Classroom) with minimal new code by reusing existing infrastructure.

**Core Value:** Students submit assignments in Spark once → automatically appear in Optio portfolios with zero student effort.

---

## What We're Building

### Week 1: SSO Authentication
Students click "View Portfolio" in Spark → instant Optio login (no separate credentials)

### Week 2: Evidence Auto-Sync
Spark assignment submissions (essays, PDFs, images, videos) → webhook to Optio → portfolio updates automatically

### Week 3: Observer Role & Automated Course Sync
- Observer role: Extended family can view portfolios and leave encouraging comments
- Course sync: Spark courses/assignments automatically create Optio quests/tasks via API

---

## Technical Architecture Summary

### Reusing Existing Infrastructure

**Database Tables (NO changes needed):**
- `lms_integrations` - Store Spark user connections
- `quests` - Spark courses (with `lms_platform='spark'`)
- `user_quest_tasks` - Spark assignments
- `quest_task_completions` - Evidence storage
- `evidence_document_blocks` - File uploads

**New Tables (Week 3 only):**
- `observer_invitations`
- `observer_student_links`
- `observer_comments`

**Existing Services (reuse as-is):**
- `LMSSyncService` - Roster sync, assignment import patterns
- `XPService` - Award XP for completed tasks
- `BaseService` - Error handling, retry logic

---

## Week 1: SSO Authentication

### Goal
Enable students to log into Optio via Spark SSO using JWT tokens.

### Files to Create

**1. `backend/routes/spark_integration.py` (NEW - ~50 lines for Week 1)**

```python
from flask import Blueprint, request, redirect
import jwt
import os
from utils.session_manager import session_manager
from database import get_supabase_admin_client

bp = Blueprint('spark', __name__)

@bp.route('/spark/sso', methods=['GET'])
def spark_sso():
    """
    SSO login from Spark LMS
    Query param: token (JWT signed by Spark)
    """
    token = request.args.get('token')
    if not token:
        return 'Missing token', 400

    # Validate JWT
    try:
        secret = os.getenv('SPARK_SSO_SECRET')
        claims = jwt.decode(token, secret, algorithms=['HS256'])
    except Exception as e:
        return f'Invalid token: {str(e)}', 401

    # Create or update user
    user = create_or_update_spark_user(claims)

    # Set session cookies
    response = redirect('/dashboard')
    session_manager.set_auth_cookies(response, user['id'])

    return response

def create_or_update_spark_user(claims):
    """Create or update user from Spark SSO"""
    supabase = get_supabase_admin_client()

    # Check if user exists by Spark ID
    spark_user_id = claims['sub']
    integration = supabase.table('lms_integrations')\
        .select('user_id')\
        .eq('lms_platform', 'spark')\
        .eq('lms_user_id', spark_user_id)\
        .execute()

    if integration.data:
        return {'id': integration.data[0]['user_id']}

    # Check by email
    email = claims['email']
    user = supabase.table('users').select('id').eq('email', email).execute()

    if user.data:
        user_id = user.data[0]['id']
    else:
        # Create new user
        new_user = supabase.table('users').insert({
            'email': email,
            'first_name': claims['given_name'],
            'last_name': claims['family_name'],
            'role': 'student'
        }).execute()
        user_id = new_user.data[0]['id']

    # Create LMS integration record
    supabase.table('lms_integrations').insert({
        'user_id': user_id,
        'lms_platform': 'spark',
        'lms_user_id': spark_user_id,
        'sync_enabled': True
    }).execute()

    return {'id': user_id}
```

### Files to Modify

**2. `backend/config/lms_platforms.py` (ADD 10 lines)**

```python
LMS_PLATFORMS = {
    # ... existing platforms ...

    'spark': {
        'name': 'Spark LMS',
        'auth_method': 'simple_jwt',
        'shared_secret': 'ENV:SPARK_SSO_SECRET',
        'supports_grade_passback': True,
        'supports_roster_sync': True,
        'supports_webhooks': True
    }
}
```

**3. `backend/main.py` (ADD 2 lines)**

```python
# Register blueprints
from routes import spark_integration
app.register_blueprint(spark_integration.bp)
```

**4. Frontend (optional - good for clarity)**

```jsx
// frontend/src/App.jsx - Add route
<Route path="/spark/sso" element={<Navigate to="/dashboard" />} />
```

### Environment Variables

Add to Render environment variables:

```bash
SPARK_SSO_SECRET=<64_character_shared_secret>  # Generate with: openssl rand -hex 32
```

### Testing

**Unit Tests:**
```python
# backend/tests/test_spark_sso.py
def test_validate_spark_token_valid()
def test_validate_spark_token_expired()
def test_validate_spark_token_invalid_signature()
```

**Manual Tests:**
1. Generate JWT at jwt.io using shared secret
2. Visit `https://optio-dev-frontend.onrender.com/spark/sso?token={jwt}`
3. Verify redirect to dashboard
4. Check `lms_integrations` table for new record

### Success Criteria
- [ ] Student can SSO from Spark to Optio
- [ ] User created/linked in database
- [ ] Session cookies set correctly
- [ ] Redirects to dashboard

---

## Week 2: Evidence Auto-Sync

### Goal
Receive webhooks from Spark when students submit assignments → mark task complete → award XP → show in portfolio.

### Extend `backend/routes/spark_integration.py` (ADD ~100 lines)

```python
import hmac
import hashlib
import requests
import uuid

@bp.route('/spark/webhook/submission', methods=['POST'])
def submission_webhook():
    """
    Receive assignment submissions from Spark
    Headers: X-Spark-Signature (HMAC-SHA256)
    """
    # Validate signature
    signature = request.headers.get('X-Spark-Signature')
    if not validate_spark_signature(request.data, signature):
        return 'Invalid signature', 401

    data = request.json

    # Process submission
    try:
        process_spark_submission(data)
        return {'status': 'success'}, 200
    except Exception as e:
        return {'error': str(e)}, 500

def validate_spark_signature(payload, signature):
    """Validate webhook signature"""
    secret = os.getenv('SPARK_WEBHOOK_SECRET')
    expected = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)

def process_spark_submission(data):
    """Process Spark assignment submission"""
    supabase = get_supabase_admin_client()

    # Find user by Spark ID
    spark_user_id = data['spark_user_id']
    integration = supabase.table('lms_integrations')\
        .select('user_id')\
        .eq('lms_platform', 'spark')\
        .eq('lms_user_id', spark_user_id)\
        .execute()

    if not integration.data:
        raise Exception(f"User not found for Spark ID: {spark_user_id}")

    user_id = integration.data[0]['user_id']

    # Find task for this assignment
    spark_assignment_id = data['spark_assignment_id']
    task = supabase.table('user_quest_tasks')\
        .select('id, quest_id, xp_value, pillar')\
        .eq('user_id', user_id)\
        .eq('lms_assignment_id', spark_assignment_id)\
        .execute()

    if not task.data:
        raise Exception(f"Task not found for assignment: {spark_assignment_id}")

    task_id = task.data[0]['id']

    # Download files and upload to Supabase storage
    evidence_files = []
    for file_data in data.get('submission_files', []):
        file_url = download_and_upload_file(file_data['url'], user_id)
        evidence_files.append(file_url)

    # Mark task complete
    completion = supabase.table('quest_task_completions').insert({
        'user_id': user_id,
        'quest_id': task.data[0]['quest_id'],
        'task_id': task_id,
        'evidence_text': data.get('submission_text', ''),
        'evidence_url': evidence_files[0] if evidence_files else None,
        'completed_at': data['submitted_at'],
        'xp_awarded': task.data[0]['xp_value']
    }).execute()

    # Award XP
    from services.xp_service import XPService
    xp_service = XPService()
    xp_service.award_xp(user_id, task.data[0]['xp_value'], task.data[0]['pillar'])

    return completion.data[0]

def download_and_upload_file(temp_url, user_id):
    """Download file from Spark and upload to Supabase storage"""
    supabase = get_supabase_admin_client()

    # Download file
    response = requests.get(temp_url, timeout=30)
    response.raise_for_status()

    # Generate unique filename
    filename = f"{user_id}/{uuid.uuid4()}.pdf"

    # Upload to Supabase storage
    supabase.storage.from_('evidence-files').upload(filename, response.content)

    # Return public URL
    return supabase.storage.from_('evidence-files').get_public_url(filename)
```

### Environment Variables

Add to Render:

```bash
SPARK_WEBHOOK_SECRET=<64_character_shared_secret>  # Generate with: openssl rand -hex 32
```

### Testing

**Unit Tests:**
```python
# backend/tests/test_spark_webhook.py
def test_submission_webhook_valid()
def test_submission_webhook_invalid_signature()
def test_submission_webhook_missing_files()
```

**Manual Tests:**
1. Use Postman to send webhook payload with HMAC signature
2. Verify task completion in database
3. Verify evidence appears on diploma page
4. Verify XP awarded correctly

### Success Criteria
- [ ] Webhook receives submissions from Spark
- [ ] Signature validation prevents unauthorized requests
- [ ] Files downloaded and uploaded to Supabase storage
- [ ] Task marked complete, XP awarded
- [ ] Evidence appears in portfolio

---

## Week 3: Observer Role & Automated Course Sync

### Part 1: Automated Course Sync (Days 1-2)

#### Goal
Admin can sync Spark courses/assignments to create Optio quests/tasks automatically.

#### Extend `backend/routes/spark_integration.py` (ADD ~150 lines)

```python
@bp.route('/api/admin/spark/sync/courses', methods=['POST'])
@require_auth
@require_role('admin')
def sync_spark_courses():
    """Fetch courses from Spark API and create/update Optio quests"""
    import requests
    from database import get_supabase_admin_client

    spark_api_url = os.getenv('SPARK_API_URL')
    spark_api_key = os.getenv('SPARK_API_KEY')

    # Fetch courses from Spark
    response = requests.get(
        f"{spark_api_url}/api/courses",
        headers={"Authorization": f"Bearer {spark_api_key}"},
        timeout=30
    )

    courses = response.json()['courses']
    synced_count = 0

    for course in courses:
        supabase = get_supabase_admin_client()

        # Check if quest already exists
        existing_quest = supabase.table('quests')\
            .select('id')\
            .eq('lms_platform', 'spark')\
            .eq('lms_course_id', course['id'])\
            .execute()

        if existing_quest.data:
            # Update existing quest
            quest_id = existing_quest.data[0]['id']
            supabase.table('quests').update({
                'title': f"Spark: {course['title']}",
                'description': course['description']
            }).eq('id', quest_id).execute()
        else:
            # Create new quest
            quest = supabase.table('quests').insert({
                'title': f"Spark: {course['title']}",
                'description': course['description'],
                'source': 'lms',
                'lms_platform': 'spark',
                'lms_course_id': course['id'],
                'is_active': True
            }).execute()
            quest_id = quest.data[0]['id']

        # Sync assignments as tasks
        sync_spark_assignments(course['id'], quest_id)
        synced_count += 1

    return {'status': 'success', 'courses_synced': synced_count}, 200

def sync_spark_assignments(spark_course_id, quest_id):
    """Sync assignments for a specific course"""
    import requests

    spark_api_url = os.getenv('SPARK_API_URL')
    spark_api_key = os.getenv('SPARK_API_KEY')
    supabase = get_supabase_admin_client()

    response = requests.get(
        f"{spark_api_url}/api/courses/{spark_course_id}/assignments",
        headers={"Authorization": f"Bearer {spark_api_key}"},
        timeout=30
    )

    assignments = response.json()['assignments']

    for idx, assignment in enumerate(assignments):
        # Detect pillar from assignment title
        pillar = detect_pillar(assignment['title'])

        # Calculate XP based on estimated hours
        xp_value = calculate_xp(assignment.get('estimated_hours', 2))

        # Create task template (copied to user_quest_tasks when student starts quest)
        existing_task = supabase.table('quest_tasks_templates')\
            .select('id')\
            .eq('quest_id', quest_id)\
            .eq('lms_assignment_id', assignment['id'])\
            .execute()

        if not existing_task.data:
            supabase.table('quest_tasks_templates').insert({
                'quest_id': quest_id,
                'title': assignment['title'],
                'description': assignment['description'],
                'lms_assignment_id': assignment['id'],
                'pillar': pillar,
                'xp_value': xp_value,
                'order_index': idx + 1,
                'is_required': True
            }).execute()

def detect_pillar(title):
    """Simple heuristic to detect pillar from assignment title"""
    title_lower = title.lower()

    if any(word in title_lower for word in ['math', 'science', 'physics', 'chemistry', 'biology', 'code']):
        return 'stem'
    elif any(word in title_lower for word in ['essay', 'write', 'read', 'story', 'language']):
        return 'communication'
    elif any(word in title_lower for word in ['art', 'draw', 'design', 'music', 'create']):
        return 'art'
    elif any(word in title_lower for word in ['health', 'wellness', 'exercise']):
        return 'wellness'
    elif any(word in title_lower for word in ['history', 'civics', 'government']):
        return 'civics'
    else:
        return 'stem'  # Default

def calculate_xp(estimated_hours):
    """Calculate XP based on estimated completion time"""
    base_xp = 100
    return max(50, min(500, int(estimated_hours * base_xp / 2)))
```

#### Frontend: Admin UI

```jsx
// frontend/src/components/admin/LMSIntegrationPanel.jsx
// Add button:
<button
  onClick={handleSyncSparkCourses}
  className="btn-primary"
>
  Sync Spark Courses
</button>

const handleSyncSparkCourses = async () => {
  try {
    const response = await api.post('/api/admin/spark/sync/courses', {});
    alert(`Synced ${response.data.courses_synced} courses`);
  } catch (error) {
    alert('Sync failed: ' + error.message);
  }
};
```

#### Environment Variables

```bash
SPARK_API_URL=https://spark-api.com
SPARK_API_KEY=<api_key_from_spark_team>
```

### Part 2: Observer Role (Days 3-5)

#### Goal
Extended family (grandparents, mentors) can view student portfolios and leave encouraging comments.

#### Database Migrations

```sql
-- backend/migrations/xxx_create_observer_tables.sql

CREATE TABLE observer_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES users(id) NOT NULL,
  observer_email TEXT NOT NULL,
  observer_name TEXT NOT NULL,
  invitation_code TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending',
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  accepted_at TIMESTAMP,
  CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'declined', 'expired'))
);

CREATE INDEX idx_observer_invitations_student ON observer_invitations(student_id);
CREATE INDEX idx_observer_invitations_code ON observer_invitations(invitation_code);

CREATE TABLE observer_student_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  observer_id UUID REFERENCES users(id) NOT NULL,
  student_id UUID REFERENCES users(id) NOT NULL,
  relationship TEXT,
  can_comment BOOLEAN DEFAULT true,
  can_view_evidence BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(observer_id, student_id)
);

CREATE INDEX idx_observer_links_observer ON observer_student_links(observer_id);
CREATE INDEX idx_observer_links_student ON observer_student_links(student_id);

CREATE TABLE observer_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  observer_id UUID REFERENCES users(id) NOT NULL,
  student_id UUID REFERENCES users(id) NOT NULL,
  task_completion_id UUID REFERENCES quest_task_completions(id),
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  CONSTRAINT comment_not_empty CHECK (length(trim(comment_text)) > 0)
);

CREATE INDEX idx_observer_comments_student ON observer_comments(student_id);
```

#### Backend: New Routes File

Create `backend/routes/observer.py` with these endpoints:

**Student Endpoints:**
- `POST /api/observers/invite` - Send invitation
- `GET /api/observers/my-invitations` - List sent invitations
- `DELETE /api/observers/invitations/:id/cancel` - Cancel invitation
- `GET /api/observers/my-observers` - List linked observers
- `DELETE /api/observers/:id/remove` - Remove observer access

**Observer Endpoints:**
- `POST /api/observers/accept/:code` - Accept invitation
- `GET /api/observers/my-students` - List linked students
- `GET /api/observers/student/:id/portfolio` - View student portfolio (read-only)
- `POST /api/observers/comments` - Leave encouraging comment
- `GET /api/observers/student/:id/comments` - View comments

**Register Blueprint:**
```python
# backend/main.py
from routes import observer
app.register_blueprint(observer.bp)
```

#### Frontend: New Components

**1. Student View - Send Invitations**
```jsx
// frontend/src/components/observers/ObserverInvitations.jsx
// Similar to ParentLinking.jsx
// Button to send invitation, list pending/accepted invitations
```

**2. Observer View - Accept Invitation**
```jsx
// frontend/src/pages/ObserverAcceptPage.jsx
// Public page at /observer/accept/:code
// Form to accept invitation, create account if needed
```

**3. Observer View - Dashboard**
```jsx
// frontend/src/pages/ObserverDashboardPage.jsx
// List linked students
// View student portfolios (read-only)
// Leave encouraging comments
```

**4. Portfolio Enhancement**
```jsx
// frontend/src/pages/DiplomaPage.jsx
// Add section showing observer comments on completed work
```

### Success Criteria (Week 3)
- [ ] Admin can sync Spark courses → creates quests automatically
- [ ] Assignments synced as tasks with correct pillar and XP
- [ ] Student can send observer invitation
- [ ] Observer can accept invitation and view portfolio
- [ ] Observer can leave encouraging comments
- [ ] Comments appear on student's portfolio

---

## Timeline Checklist

### Week 1: SSO (5 days)
- [ ] Day 1-2: Create `spark_integration.py`, update config files, add env vars
- [ ] Day 3-4: Write unit tests, test with mock JWTs
- [ ] Day 5: End-to-end test with Spark team, verify in production

### Week 2: Webhooks (5 days)
- [ ] Day 1-2: Add webhook endpoint, signature validation
- [ ] Day 3-4: File download/upload logic, task completion, XP award
- [ ] Day 5: End-to-end test with Spark team, verify evidence in portfolio

### Week 3: Observer + Sync (5 days)
- [ ] Day 1-2: Course sync endpoint, pillar detection, admin UI
- [ ] Day 3: Database migrations, observer backend endpoints
- [ ] Day 4: Observer frontend (student invitation flow)
- [ ] Day 5: Observer frontend (dashboard, comments), end-to-end testing

---

## Testing Strategy

### Unit Tests
```python
backend/tests/
├── test_spark_sso.py           # JWT validation
├── test_spark_webhook.py       # Webhook signature, file processing
├── test_spark_sync.py          # Course sync logic
└── test_observer.py            # Observer invitation flow
```

### Integration Tests
- SSO flow: Spark JWT → Optio session → Dashboard redirect
- Webhook flow: Submission → Evidence sync → Portfolio display
- Course sync: API call → Quest created → Tasks created
- Observer flow: Invitation → Acceptance → Portfolio view

### Manual Testing Checklist
- [ ] Generate JWT at jwt.io, test SSO redirect
- [ ] Send webhook via Postman, verify task completion
- [ ] Trigger course sync, verify quests created
- [ ] Send observer invitation, accept it, view portfolio
- [ ] Leave observer comment, verify it appears

---

## Deployment

### Environment Variables (Render)

**Dev Environment (`optio-dev-backend`):**
```bash
SPARK_SSO_SECRET=<dev_secret>
SPARK_WEBHOOK_SECRET=<dev_secret>
SPARK_API_URL=https://spark-sandbox.com
SPARK_API_KEY=<dev_api_key>
```

**Production Environment (`optio-prod-backend`):**
```bash
SPARK_SSO_SECRET=<prod_secret>
SPARK_WEBHOOK_SECRET=<prod_secret>
SPARK_API_URL=https://spark-api.com
SPARK_API_KEY=<prod_api_key>
```

### Database Migrations

Run migrations in order:
```bash
# Week 3 only
psql $DATABASE_URL -f backend/migrations/xxx_create_observer_tables.sql
```

### Monitoring

**Key Metrics:**
- SSO login success rate (target: >99%)
- Webhook delivery success rate (target: >99%)
- Evidence sync latency (target: <5 minutes)
- Course sync accuracy (manual verification)

**Logging:**
```python
logger.info(f"Spark SSO login: user_id={spark_user_id}")
logger.info(f"Spark submission processed: assignment_id={spark_assignment_id}")
logger.error(f"Spark webhook failed: {str(e)}", exc_info=True)
```

---

## Rollback Plan

If issues arise:

**Week 1 (SSO):**
- Remove `spark_integration.py` blueprint registration
- Revert `lms_platforms.py` changes
- Remove environment variables

**Week 2 (Webhooks):**
- Disable webhook endpoint (comment out route)
- No database changes to rollback

**Week 3 (Observer):**
- Drop observer tables: `DROP TABLE observer_comments, observer_student_links, observer_invitations;`
- Remove observer blueprint registration

---

## Success Metrics

**Technical:**
- SSO login success rate: >99%
- Evidence sync latency: <5 minutes
- Webhook failure rate: <1%
- Course sync accuracy: 100%

**Business:**
- % of Spark students using Optio portfolios: Target 80%+
- Observer engagement: Comments per student per month
- Badge completion rate: % students earning at least 1 badge

---

## Questions for Spark Team

Before Week 3 implementation:
- [ ] API endpoint specifications confirmed?
- [ ] API key provided?
- [ ] Sandbox environment available?
- [ ] Rate limits documented?

---

## Notes

**Critical Dependencies:**
- Spark must provide JWT tokens (Week 1)
- Spark must send webhooks (Week 2)
- Spark must provide API endpoints (Week 3)

**Existing Code to Reference:**
- `backend/services/lms_sync_service.py` - LMS sync patterns
- `backend/routes/lms_integration.py` - LMS endpoint patterns
- `frontend/src/components/parent/ParentLinking.jsx` - Invitation flow pattern

**Document Maintained By:** Optio Dev Team
**Last Updated:** January 2025

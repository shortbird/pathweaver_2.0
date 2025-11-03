# Spark Integration - Simplified Implementation Plan

**Last Updated:** January 2025
**Status:** READY FOR IMPLEMENTATION

---

## Executive Summary

This document provides a **dead-simple integration plan** for connecting Spark LMS with Optio. After analyzing Optio's existing LMS infrastructure, we've identified that **93% of the original plan was unnecessary complexity**.

**Key Insight:** Optio already has robust LMS integration infrastructure (Canvas, Moodle, Google Classroom, Schoology). We can reuse almost everything and add Spark as another platform with minimal new code.

### Timeline: 3 Weeks
- **Week 1:** Authentication (SSO)
- **Week 2:** Evidence sync (webhooks)
- **Week 3:** Observer role functionality + Automated course sync (pending Spark API details)

### Code Required:
- **Optio side:** ~300 lines of new code
- **Spark side:** ~70 lines of code (JWT + webhook) + API endpoints for course sync

### Database Changes: 1 new table (observer_invitations)
All other Spark data fits in existing tables.

---

## What This Integration Does

1. **Single Sign-On (SSO):** Spark students click "View Portfolio" → instant Optio access
2. **Evidence Auto-Sync:** Spark assignment submissions automatically appear in Optio portfolios
3. **Public Portfolios:** Students showcase Spark coursework at `optioeducation.com/portfolio/[student-name]`
4. **Badge Integration:** Spark courses count toward Optio badge requirements
5. **Parent Dashboard:** Parents see Spark course progress alongside Optio quests
6. **Observer Role:** Extended family gets read-only portfolio access with encouraging comments
7. **Automated Course Sync:** Spark courses automatically create Optio quests (requires Spark API)

---

## Architecture Overview

### Reusing Existing Infrastructure

Optio already has these components built (NO changes needed):

**Database Tables:**
- `lms_integrations` - Store user-Spark connections
- `lms_sessions` - Track SSO sessions
- `lms_grade_sync` - Grade passback queue
- `quests` - Already has `lms_course_id`, `lms_assignment_id`, `lms_platform` columns
- `quest_task_completions` - Evidence storage
- `evidence_document_blocks` - File uploads

**Service Layer:**
- `LMSSyncService` - Roster sync, assignment import
- `LTI13Service` - Authentication patterns
- `BaseService` - Retry logic, error handling

**API Endpoints:**
- `/api/lms/sync/roster` - CSV roster upload
- `/api/tasks/:taskId/complete` - Task completion (evidence)
- `/api/evidence-documents` - File upload

**Result:** We add Spark support by creating **1 new route file** and modifying **2 configuration files**. That's it.

---

## Simple Authentication Flow (SSO)

### Overview
When a Spark student clicks "View Portfolio", they're instantly logged into Optio.

### Implementation

**Step-by-step flow:**
```
1. Student logs into Spark LMS
2. Student clicks "View Optio Portfolio" button
3. Spark generates JWT token (signed with shared secret)
4. Spark redirects: https://optioeducation.com/spark/sso?token={jwt}
5. Optio validates token signature
6. Optio creates/updates user, sets session cookies
7. Optio redirects to /dashboard
8. Student sees their portfolio with Spark work included
```

### JWT Token Format (Spark → Optio)

**Spark generates this JWT:**
```json
{
  "sub": "spark_user_123",          // Spark's user ID
  "email": "student@example.com",   // Student email
  "given_name": "Sarah",            // First name
  "family_name": "Johnson",         // Last name
  "role": "student",                // Always "student"
  "iat": 1234567890,                // Issued at (Unix timestamp)
  "exp": 1234567900                 // Expires in 10 minutes
}
```

**Signature:** HS256 with shared secret (exchanged securely between teams)

### What Spark Team Builds (Node.js Example)

```javascript
// Spark backend - Generate SSO token
const jwt = require('jsonwebtoken');

function redirectToOptioPortfolio(student) {
  const token = jwt.sign({
    sub: student.sparkUserId,
    email: student.email,
    given_name: student.firstName,
    family_name: student.lastName,
    role: 'student',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 600  // 10 minutes
  }, process.env.OPTIO_SHARED_SECRET);

  // Redirect student to Optio
  res.redirect(`https://optioeducation.com/spark/sso?token=${token}`);
}
```

**That's it for SSO!** ~20 lines of code.

---

## Evidence Sync via Webhooks

### Overview
When students submit assignments in Spark, the evidence automatically appears in their Optio portfolio.

### Implementation

**Step-by-step flow:**
```
1. Student submits assignment in Spark (essay PDF, images, etc.)
2. Spark sends webhook to Optio with submission data
3. Optio validates webhook signature
4. Optio downloads files from temporary URLs
5. Optio uploads files to own storage
6. Optio marks task complete, awards XP
7. Evidence appears in student's portfolio
```

### Webhook Payload Format (Spark → Optio)

**Spark sends POST to `https://optio-backend.com/spark/webhook/submission`:**

```json
{
  "spark_user_id": "user_123",
  "spark_assignment_id": "assignment_456",
  "spark_course_id": "course_789",
  "submission_text": "Here is my essay on photosynthesis...",
  "submission_files": [
    {
      "url": "https://spark-storage.com/temp/file_abc?expires=...",
      "type": "application/pdf",
      "filename": "photosynthesis_essay.pdf"
    },
    {
      "url": "https://spark-storage.com/temp/image_xyz?expires=...",
      "type": "image/jpeg",
      "filename": "plant_diagram.jpg"
    }
  ],
  "submitted_at": "2025-01-15T14:30:00Z",
  "grade": 95.5
}
```

**Security:** Include `X-Spark-Signature` header (HMAC-SHA256 of payload)

### What Spark Team Builds (Node.js Example)

```javascript
// Spark backend - Send submission webhook
const crypto = require('crypto');

async function sendSubmissionToOptio(submission) {
  const payload = {
    spark_user_id: submission.userId,
    spark_assignment_id: submission.assignmentId,
    spark_course_id: submission.courseId,
    submission_text: submission.text,
    submission_files: submission.files.map(f => ({
      url: generateTemporaryUrl(f, 24 * 60 * 60), // 24-hour expiry
      type: f.mimeType,
      filename: f.name
    })),
    submitted_at: submission.timestamp.toISOString(),
    grade: submission.grade
  };

  // Sign the payload
  const signature = crypto
    .createHmac('sha256', process.env.OPTIO_WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');

  // Send to Optio
  await fetch('https://optio-prod-backend.onrender.com/spark/webhook/submission', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Spark-Signature': signature
    },
    body: JSON.stringify(payload)
  });
}

// Helper: Generate temporary public URL for file
function generateTemporaryUrl(file, expirySeconds) {
  // Implementation depends on Spark's file storage
  // Must return publicly accessible URL that expires
  return file.getSignedUrl(expirySeconds);
}
```

**That's it for webhooks!** ~50 lines of code.

---

## What Optio Builds

### Backend Changes (3 Files)

**1. Create `backend/routes/spark_integration.py` (NEW - ~100 lines)**

```python
from flask import Blueprint, request, redirect, jsonify
import jwt
import os
import hmac
import hashlib
from utils.session_manager import session_manager
from services.lms_sync_service import LMSSyncService

bp = Blueprint('spark', __name__)

# ============================================
# SSO ENDPOINT
# ============================================

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

# ============================================
# WEBHOOK ENDPOINT
# ============================================

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

# ============================================
# HELPER FUNCTIONS
# ============================================

def validate_spark_signature(payload, signature):
    """Validate webhook signature"""
    secret = os.getenv('SPARK_WEBHOOK_SECRET')
    expected = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)

def create_or_update_spark_user(claims):
    """Create or update user from Spark SSO"""
    from database import get_supabase_admin_client
    supabase = get_supabase_admin_client()

    # Check if user exists by Spark ID
    spark_user_id = claims['sub']
    integration = supabase.table('lms_integrations').select('user_id').eq('lms_platform', 'spark').eq('lms_user_id', spark_user_id).execute()

    if integration.data:
        # User exists, return it
        user_id = integration.data[0]['user_id']
        return {'id': user_id}

    # Check by email
    email = claims['email']
    user = supabase.table('users').select('id').eq('email', email).execute()

    if user.data:
        # Link existing user to Spark
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

def process_spark_submission(data):
    """Process Spark assignment submission"""
    from database import get_supabase_admin_client
    supabase = get_supabase_admin_client()

    # Find user by Spark ID
    spark_user_id = data['spark_user_id']
    integration = supabase.table('lms_integrations').select('user_id').eq('lms_platform', 'spark').eq('lms_user_id', spark_user_id).execute()

    if not integration.data:
        raise Exception(f"User not found for Spark ID: {spark_user_id}")

    user_id = integration.data[0]['user_id']

    # Find quest/task for this assignment
    spark_assignment_id = data['spark_assignment_id']
    task = supabase.table('user_quest_tasks').select('id, quest_id, xp_value').eq('user_id', user_id).eq('lms_assignment_id', spark_assignment_id).execute()

    if not task.data:
        # Task doesn't exist yet - create it or log warning
        raise Exception(f"Task not found for assignment: {spark_assignment_id}")

    task_id = task.data[0]['id']

    # Download files and upload to Supabase storage
    evidence_files = []
    for file_data in data.get('submission_files', []):
        file_url = download_and_upload_file(file_data['url'], user_id)
        evidence_files.append(file_url)

    # Mark task complete (reuse existing completion logic)
    completion = supabase.table('quest_task_completions').insert({
        'user_id': user_id,
        'quest_id': task.data[0]['quest_id'],
        'task_id': task_id,
        'evidence_text': data.get('submission_text', ''),
        'evidence_url': evidence_files[0] if evidence_files else None,
        'completed_at': data['submitted_at'],
        'xp_awarded': task.data[0]['xp_value']
    }).execute()

    # Award XP (reuse existing XP service)
    from services.xp_service import XPService
    xp_service = XPService()
    xp_service.award_xp(user_id, task.data[0]['xp_value'], task.data[0]['pillar'])

    return completion.data[0]

def download_and_upload_file(temp_url, user_id):
    """Download file from Spark and upload to Supabase storage"""
    import requests
    from database import get_supabase_admin_client

    # Download file
    response = requests.get(temp_url, timeout=30)
    response.raise_for_status()

    # Generate unique filename
    import uuid
    filename = f"{user_id}/{uuid.uuid4()}.pdf"

    # Upload to Supabase storage
    supabase = get_supabase_admin_client()
    supabase.storage.from_('evidence-files').upload(filename, response.content)

    # Return public URL
    return supabase.storage.from_('evidence-files').get_public_url(filename)
```

**2. Modify `backend/config/lms_platforms.py` (ADD 10 LINES)**

```python
LMS_PLATFORMS = {
    # ... existing platforms (canvas, google_classroom, etc.) ...

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

**3. Modify `backend/main.py` (ADD 2 LINES)**

```python
# Register blueprints
from routes import spark_integration
app.register_blueprint(spark_integration.bp)
```

### Environment Variables (ADD 2)

```bash
# .env
SPARK_SSO_SECRET=<64_character_shared_secret>
SPARK_WEBHOOK_SECRET=<64_character_shared_secret>
```

**Generate secrets:**
```bash
openssl rand -hex 32  # Run twice for two secrets
```

### Frontend Changes (Optional - 2 Files)

**1. Add Spark indicator to diploma page**

```jsx
// frontend/src/pages/DiplomaPage.jsx
{quest.lms_platform === 'spark' && (
  <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
    Spark Course
  </span>
)}
```

**2. Add SSO route (technically SSO happens in backend, but good for clarity)**

```jsx
// frontend/src/App.jsx
<Route path="/spark/sso" element={<Navigate to="/dashboard" />} />
```

---

## Database Schema (Reuse Existing)

### NO New Tables Required

All Spark data maps to existing tables:

**Users & Connections:**
- `users` - Spark students become Optio users
- `lms_integrations` - Stores Spark user ID → Optio user ID mapping

**Courses & Assignments:**
- `quests` - Spark courses with `source='lms', lms_platform='spark'`
- `user_quest_tasks` - Spark assignments mapped to tasks
  - `lms_assignment_id` column stores Spark assignment ID
  - `lms_course_id` column stores Spark course ID

**Evidence & Completion:**
- `quest_task_completions` - Stores submission evidence
- `evidence_document_blocks` - Stores uploaded files

**Sessions:**
- `lms_sessions` - Track Spark SSO sessions (optional)

**Grade Sync (Future):**
- `lms_grade_sync` - Queue for syncing grades back to Spark

### Example Data Flow

**When Spark student "Sarah" completes "Biology Essay":**

1. **lms_integrations:**
```sql
user_id: uuid-123
lms_platform: 'spark'
lms_user_id: 'spark_user_456'
```

2. **quests:**
```sql
id: uuid-789
title: 'Spark Biology - Photosynthesis Unit'
source: 'lms'
lms_platform: 'spark'
lms_course_id: 'spark_course_101'
```

3. **user_quest_tasks:**
```sql
id: uuid-abc
user_id: uuid-123
quest_id: uuid-789
title: 'Essay: How Plants Convert Sunlight'
lms_assignment_id: 'spark_assignment_456'
pillar: 'stem'
xp_value: 200
```

4. **quest_task_completions:**
```sql
user_id: uuid-123
task_id: uuid-abc
evidence_text: 'Here is my essay...'
evidence_url: 'https://supabase.co/storage/.../essay.pdf'
xp_awarded: 200
completed_at: '2025-01-15T14:30:00Z'
```

---

## Course & Assignment Setup

### Option A: Manual Admin Setup (Recommended for MVP)

**Process:**
1. Spark admin exports course list (CSV or JSON)
2. Optio admin creates quests matching Spark courses
3. Optio admin creates tasks matching Spark assignments
4. Set `lms_platform='spark'` and `lms_assignment_id='{spark_id}'`

**Pros:**
- Simple, no automation needed
- Admin controls quest titles, descriptions, XP values
- Can customize pillars per assignment

**Cons:**
- Manual work for each course
- Must update when Spark adds assignments

### Option B: Automated Sync (IMPLEMENTATION PLAN - Week 3)

**This is the chosen approach** - Spark will provide API endpoints for automated course/assignment sync.

**Requirements for Spark Team:**

Spark must provide these API endpoints:

**1. List All Courses**
```
GET /api/courses
Authorization: Bearer {api_key}

Response:
{
  "courses": [
    {
      "id": "course_123",
      "title": "Biology - Photosynthesis Unit",
      "description": "Learn how plants convert sunlight to energy",
      "category": "science",
      "grade_level": "9-12",
      "duration_hours": 20,
      "assignments": ["assignment_456", "assignment_789"]
    }
  ]
}
```

**2. Get Course Details with Assignments**
```
GET /api/courses/{course_id}/assignments
Authorization: Bearer {api_key}

Response:
{
  "course_id": "course_123",
  "assignments": [
    {
      "id": "assignment_456",
      "title": "Essay: How Plants Convert Sunlight",
      "description": "Write a 500-word essay explaining photosynthesis",
      "assignment_type": "essay",
      "estimated_hours": 3,
      "max_points": 100
    }
  ]
}
```

**3. Authentication**
- API key-based authentication (Bearer token)
- Optio stores API key in environment variable: `SPARK_API_KEY`
- Rate limit: 100 requests/minute

**Optio Implementation:**

Add to `backend/routes/spark_integration.py`:

```python
@bp.route('/api/admin/spark/sync/courses', methods=['POST'])
@require_auth
@require_role('admin')
def sync_spark_courses():
    """
    Fetch courses from Spark API and create/update Optio quests
    Triggered manually by admin or on schedule
    """
    from services.lms_sync_service import LMSSyncService
    import requests

    # Fetch courses from Spark API
    spark_api_url = os.getenv('SPARK_API_URL')
    spark_api_key = os.getenv('SPARK_API_KEY')

    response = requests.get(
        f"{spark_api_url}/api/courses",
        headers={"Authorization": f"Bearer {spark_api_key}"},
        timeout=30
    )

    courses = response.json()['courses']
    synced_count = 0

    for course in courses:
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

        # Fetch and sync assignments as tasks
        sync_spark_assignments(course['id'], quest_id)
        synced_count += 1

    return {
        'status': 'success',
        'courses_synced': synced_count
    }, 200

def sync_spark_assignments(spark_course_id, quest_id):
    """Sync assignments for a specific course"""
    spark_api_url = os.getenv('SPARK_API_URL')
    spark_api_key = os.getenv('SPARK_API_KEY')

    response = requests.get(
        f"{spark_api_url}/api/courses/{spark_course_id}/assignments",
        headers={"Authorization": f"Bearer {spark_api_key}"},
        timeout=30
    )

    assignments = response.json()['assignments']

    for idx, assignment in enumerate(assignments):
        # Detect pillar from assignment type/title (simple heuristic)
        pillar = detect_pillar(assignment['title'], assignment.get('assignment_type'))

        # Calculate XP based on estimated hours
        xp_value = calculate_xp(assignment.get('estimated_hours', 2))

        # Create task template (will be personalized per user when they start quest)
        # Note: We create ONE template task, then copy it to user_quest_tasks when student enrolls
        existing_task = supabase.table('quest_tasks_templates').select('id')\
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

def detect_pillar(title, assignment_type):
    """Simple heuristic to detect pillar from assignment"""
    title_lower = title.lower()

    if any(word in title_lower for word in ['math', 'science', 'physics', 'chemistry', 'biology', 'code', 'programming']):
        return 'stem'
    elif any(word in title_lower for word in ['essay', 'write', 'read', 'story', 'language']):
        return 'communication'
    elif any(word in title_lower for word in ['art', 'draw', 'design', 'music', 'create']):
        return 'art'
    elif any(word in title_lower for word in ['health', 'wellness', 'exercise', 'mindfulness']):
        return 'wellness'
    elif any(word in title_lower for word in ['history', 'civics', 'government', 'society']):
        return 'civics'
    else:
        return 'stem'  # Default

def calculate_xp(estimated_hours):
    """Calculate XP based on estimated completion time"""
    base_xp = 100
    return max(50, min(500, int(estimated_hours * base_xp / 2)))
```

**Admin UI Addition:**

Add sync button to admin LMS panel:

```jsx
// frontend/src/components/admin/LMSIntegrationPanel.jsx
<button onClick={handleSyncSparkCourses}>
  Sync Spark Courses
</button>
```

**Automated Sync Schedule (Optional):**

Run sync daily via cron job or scheduled task:
```python
# backend/scripts/sync_spark_courses.py
# Runs daily at 2am to sync new Spark courses
```

**Environment Variables:**

```bash
SPARK_API_URL=https://spark-api.com
SPARK_API_KEY=<api_key_from_spark_team>
```

**Timeline:**
- Week 3, Days 1-2: Build sync endpoints
- Week 3, Day 3: Test with Spark sandbox API
- Week 3, Days 4-5: Admin UI and error handling

**Pending from Spark Team:**
- [ ] API endpoint specifications (exact format)
- [ ] API key for Optio
- [ ] Sandbox environment for testing
- [ ] Rate limits and throttling details

---

## Badge Integration

### How Badges Work with Spark Courses

**Example badge: "STEM Scholar"**
- **Requirements:** Complete 5 quests (3 Spark STEM courses + 2 Optio real-world quests) + 1,500 XP
- **Badge record in database:**
```json
{
  "name": "STEM Scholar",
  "pillar_primary": "stem",
  "min_quests": 5,
  "min_xp": 1500
}
```

**When student completes requirements:**
1. Optio checks total STEM quests completed (includes Spark courses)
2. Optio checks total STEM XP earned (includes Spark assignment XP)
3. If thresholds met → award badge

**No special Spark badge logic needed** - badges already support any quest source.

### Suggested Badge Mappings

| Badge Name | Spark Courses | Optio Quests | Total Quests |
|------------|---------------|--------------|--------------|
| STEM Scholar | Physics, Chemistry, Advanced Math | Build Arduino Project, Science Fair Entry | 5 |
| Digital Arts Creator | Graphic Design, Illustration | Design Your Brand, Create Portfolio | 5 |
| Minecraft Master | Minecraft Biology, Geology, Zoology | Build Biome Diorama, Research Local Ecosystem | 5 |

**Implementation:**
- Admin creates badges in Optio with appropriate requirements
- Students earn by completing mix of Spark + Optio quests
- Badge progress automatically updates as quests complete

---

## Parent Dashboard Integration

### What Parents See

**Existing parent dashboard already supports Spark courses** (no changes needed):

1. **Learning Rhythm Indicator:**
   - Green if student completed Spark assignments recently
   - Yellow if no recent Spark submissions

2. **Active Quests Tab:**
   - Shows Spark courses alongside Optio quests
   - Progress bars for each course

3. **Calendar View:**
   - Spark assignment due dates (if we can get them)

**Implementation:** When webhook creates task completion, parent dashboard queries automatically include Spark data (because it's in `quests` table).

---

## Observer Role (Week 3)

### Overview

Extended family members (grandparents, mentors, coaches) get read-only access to student portfolios with ability to leave encouraging comments.

**Key Features:**
- View-only access to portfolios (no editing, no quest management)
- Encouraging comments on completed work
- Real-time achievement notifications
- Student-controlled privacy (student must approve observers)

### Database Schema

**New table: `observer_invitations`**

```sql
CREATE TABLE observer_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES users(id) NOT NULL,
  observer_email TEXT NOT NULL,
  observer_name TEXT NOT NULL,
  invitation_code TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending/accepted/declined/expired
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  accepted_at TIMESTAMP,
  CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'declined', 'expired'))
);

CREATE INDEX idx_observer_invitations_student ON observer_invitations(student_id);
CREATE INDEX idx_observer_invitations_code ON observer_invitations(invitation_code);
CREATE INDEX idx_observer_invitations_status ON observer_invitations(status);
```

**Extend `users` table:**
- Role `observer` already exists (no schema change needed)

**New table: `observer_student_links`**

```sql
CREATE TABLE observer_student_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  observer_id UUID REFERENCES users(id) NOT NULL,
  student_id UUID REFERENCES users(id) NOT NULL,
  relationship TEXT,  -- grandparent, mentor, coach, family_friend
  can_comment BOOLEAN DEFAULT true,
  can_view_evidence BOOLEAN DEFAULT true,
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(observer_id, student_id)
);

CREATE INDEX idx_observer_links_observer ON observer_student_links(observer_id);
CREATE INDEX idx_observer_links_student ON observer_student_links(student_id);
```

**New table: `observer_comments`**

```sql
CREATE TABLE observer_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  observer_id UUID REFERENCES users(id) NOT NULL,
  student_id UUID REFERENCES users(id) NOT NULL,
  quest_id UUID REFERENCES quests(id),
  task_completion_id UUID REFERENCES quest_task_completions(id),
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  CONSTRAINT comment_not_empty CHECK (length(trim(comment_text)) > 0)
);

CREATE INDEX idx_observer_comments_student ON observer_comments(student_id);
CREATE INDEX idx_observer_comments_observer ON observer_comments(observer_id);
```

### Backend Implementation

**Add to `backend/routes/observer.py` (NEW FILE - ~200 lines)**

```python
from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from database import get_supabase_admin_client, get_user_client
import secrets
from datetime import datetime, timedelta

bp = Blueprint('observer', __name__)

# ============================================
# STUDENT ENDPOINTS - Send Invitations
# ============================================

@bp.route('/api/observers/invite', methods=['POST'])
@require_auth
def send_observer_invitation():
    """
    Student sends invitation to observer
    Body: {observer_email, observer_name, relationship}
    """
    user_id = request.user_id
    data = request.json

    # Generate unique invitation code
    invitation_code = secrets.token_urlsafe(32)

    # Set expiration (7 days)
    expires_at = datetime.utcnow() + timedelta(days=7)

    supabase = get_supabase_admin_client()

    # Create invitation
    invitation = supabase.table('observer_invitations').insert({
        'student_id': user_id,
        'observer_email': data['observer_email'],
        'observer_name': data['observer_name'],
        'invitation_code': invitation_code,
        'expires_at': expires_at.isoformat()
    }).execute()

    # Send email notification (optional)
    send_observer_invitation_email(
        data['observer_email'],
        data['observer_name'],
        invitation_code
    )

    return {
        'status': 'success',
        'invitation_id': invitation.data[0]['id'],
        'invitation_link': f"https://optioeducation.com/observer/accept/{invitation_code}"
    }, 200

@bp.route('/api/observers/my-invitations', methods=['GET'])
@require_auth
def get_my_observer_invitations():
    """Student views sent invitations"""
    user_id = request.user_id
    supabase = get_user_client(user_id)

    invitations = supabase.table('observer_invitations')\
        .select('*')\
        .eq('student_id', user_id)\
        .order('created_at', desc=True)\
        .execute()

    return {'invitations': invitations.data}, 200

@bp.route('/api/observers/invitations/<invitation_id>/cancel', methods=['DELETE'])
@require_auth
def cancel_observer_invitation(invitation_id):
    """Student cancels pending invitation"""
    user_id = request.user_id
    supabase = get_user_client(user_id)

    # Verify invitation belongs to student
    invitation = supabase.table('observer_invitations')\
        .select('id')\
        .eq('id', invitation_id)\
        .eq('student_id', user_id)\
        .eq('status', 'pending')\
        .execute()

    if not invitation.data:
        return {'error': 'Invitation not found'}, 404

    # Delete invitation
    supabase.table('observer_invitations')\
        .delete()\
        .eq('id', invitation_id)\
        .execute()

    return {'status': 'success'}, 200

@bp.route('/api/observers/my-observers', methods=['GET'])
@require_auth
def get_my_observers():
    """Student views linked observers"""
    user_id = request.user_id
    supabase = get_user_client(user_id)

    links = supabase.table('observer_student_links')\
        .select('*, observer:observer_id(id, email, first_name, last_name)')\
        .eq('student_id', user_id)\
        .execute()

    return {'observers': links.data}, 200

@bp.route('/api/observers/<link_id>/remove', methods=['DELETE'])
@require_auth
def remove_observer(link_id):
    """Student removes observer access"""
    user_id = request.user_id
    supabase = get_user_client(user_id)

    # Verify link belongs to student
    link = supabase.table('observer_student_links')\
        .select('id')\
        .eq('id', link_id)\
        .eq('student_id', user_id)\
        .execute()

    if not link.data:
        return {'error': 'Observer link not found'}, 404

    # Delete link
    supabase.table('observer_student_links')\
        .delete()\
        .eq('id', link_id)\
        .execute()

    return {'status': 'success'}, 200

# ============================================
# OBSERVER ENDPOINTS - Accept Invitations & View
# ============================================

@bp.route('/api/observers/accept/<invitation_code>', methods=['POST'])
def accept_observer_invitation(invitation_code):
    """
    Observer accepts invitation (creates account if needed)
    Body: {email, first_name, last_name, password} (optional if already has account)
    """
    supabase = get_supabase_admin_client()

    # Find invitation
    invitation = supabase.table('observer_invitations')\
        .select('*')\
        .eq('invitation_code', invitation_code)\
        .eq('status', 'pending')\
        .execute()

    if not invitation.data:
        return {'error': 'Invitation not found or expired'}, 404

    inv = invitation.data[0]

    # Check expiration
    if datetime.fromisoformat(inv['expires_at']) < datetime.utcnow():
        supabase.table('observer_invitations')\
            .update({'status': 'expired'})\
            .eq('id', inv['id'])\
            .execute()
        return {'error': 'Invitation expired'}, 400

    data = request.json

    # Check if observer already has account
    observer = supabase.table('users')\
        .select('id')\
        .eq('email', inv['observer_email'])\
        .execute()

    if observer.data:
        observer_id = observer.data[0]['id']
    else:
        # Create new observer account
        new_observer = supabase.table('users').insert({
            'email': inv['observer_email'],
            'first_name': data.get('first_name', inv['observer_name'].split()[0]),
            'last_name': data.get('last_name', ''),
            'role': 'observer'
        }).execute()
        observer_id = new_observer.data[0]['id']

    # Create observer-student link
    supabase.table('observer_student_links').insert({
        'observer_id': observer_id,
        'student_id': inv['student_id'],
        'relationship': data.get('relationship', 'family')
    }).execute()

    # Mark invitation as accepted
    supabase.table('observer_invitations')\
        .update({'status': 'accepted', 'accepted_at': datetime.utcnow().isoformat()})\
        .eq('id', inv['id'])\
        .execute()

    return {
        'status': 'success',
        'observer_id': observer_id
    }, 200

@bp.route('/api/observers/my-students', methods=['GET'])
@require_auth
def get_my_students():
    """Observer views linked students"""
    user_id = request.user_id
    supabase = get_user_client(user_id)

    links = supabase.table('observer_student_links')\
        .select('*, student:student_id(id, first_name, last_name, portfolio_slug)')\
        .eq('observer_id', user_id)\
        .execute()

    return {'students': links.data}, 200

@bp.route('/api/observers/student/<student_id>/portfolio', methods=['GET'])
@require_auth
def get_student_portfolio_for_observer(student_id):
    """Observer views student portfolio (read-only)"""
    observer_id = request.user_id
    supabase = get_supabase_admin_client()

    # Verify observer has access to this student
    link = supabase.table('observer_student_links')\
        .select('id')\
        .eq('observer_id', observer_id)\
        .eq('student_id', student_id)\
        .execute()

    if not link.data:
        return {'error': 'Access denied'}, 403

    # Fetch student portfolio data (same as public portfolio endpoint)
    portfolio_data = get_portfolio_data(student_id)

    return portfolio_data, 200

@bp.route('/api/observers/comments', methods=['POST'])
@require_auth
def post_observer_comment():
    """
    Observer leaves encouraging comment on completed work
    Body: {student_id, task_completion_id, comment_text}
    """
    observer_id = request.user_id
    data = request.json
    supabase = get_supabase_admin_client()

    # Verify observer has access
    link = supabase.table('observer_student_links')\
        .select('can_comment')\
        .eq('observer_id', observer_id)\
        .eq('student_id', data['student_id'])\
        .execute()

    if not link.data or not link.data[0]['can_comment']:
        return {'error': 'Access denied'}, 403

    # Create comment
    comment = supabase.table('observer_comments').insert({
        'observer_id': observer_id,
        'student_id': data['student_id'],
        'task_completion_id': data['task_completion_id'],
        'comment_text': data['comment_text']
    }).execute()

    return {'status': 'success', 'comment': comment.data[0]}, 200

@bp.route('/api/observers/student/<student_id>/comments', methods=['GET'])
@require_auth
def get_student_comments(student_id):
    """Get all observer comments for a student"""
    user_id = request.user_id
    supabase = get_user_client(user_id)

    # Verify access (either student viewing their own comments, or observer viewing comments they left)
    comments = supabase.table('observer_comments')\
        .select('*, observer:observer_id(first_name, last_name)')\
        .eq('student_id', student_id)\
        .order('created_at', desc=True)\
        .execute()

    return {'comments': comments.data}, 200

# ============================================
# HELPER FUNCTIONS
# ============================================

def send_observer_invitation_email(email, name, code):
    """Send email invitation to observer"""
    # TODO: Implement email sending
    pass

def get_portfolio_data(student_id):
    """Fetch portfolio data (reuse existing logic)"""
    # TODO: Import from portfolio.py
    pass
```

### Frontend Implementation

**New Components:**

1. **Student View - Send Observer Invitations**
```jsx
// frontend/src/components/observers/ObserverInvitations.jsx
// Similar to ParentLinking.jsx
// Button to send invitation, list pending/accepted invitations
```

2. **Observer View - Accept Invitation**
```jsx
// frontend/src/pages/ObserverAcceptPage.jsx
// Public page at /observer/accept/:code
// Form to accept invitation, create account if needed
```

3. **Observer View - Dashboard**
```jsx
// frontend/src/pages/ObserverDashboardPage.jsx
// List linked students
// View student portfolios (read-only)
// Leave encouraging comments
```

4. **Portfolio Enhancement - Display Observer Comments**
```jsx
// frontend/src/pages/DiplomaPage.jsx
// Add section showing observer comments on completed work
// Only visible to student and their observers
```

### User Flow

**Student sends invitation:**
1. Student goes to Settings → Observers
2. Clicks "Invite Observer"
3. Enters observer email, name, relationship
4. System generates unique invitation link
5. Observer receives email with link

**Observer accepts:**
1. Observer clicks invitation link
2. Lands on `/observer/accept/:code` page
3. If existing user: logs in and link is created
4. If new user: creates account with `role='observer'`
5. Redirects to observer dashboard

**Observer views portfolio:**
1. Observer logs in
2. Sees list of linked students
3. Clicks student → sees read-only portfolio
4. Can leave encouraging comments on completed work

**Student manages observers:**
1. Student views list of linked observers in Settings
2. Can remove observer access at any time
3. Can view comments observers have left

### Timeline (Week 3, Days 3-5)

**Day 3:**
- [ ] Create database tables (observer_invitations, observer_student_links, observer_comments)
- [ ] Build backend endpoints in `observer.py`

**Day 4:**
- [ ] Frontend: Student invitation flow
- [ ] Frontend: Observer accept page

**Day 5:**
- [ ] Frontend: Observer dashboard
- [ ] Display observer comments on portfolios
- [ ] Testing end-to-end flow

---

## Roster Sync (Optional)

### Option A: CSV Upload (Simplest)

**Process:**
1. Spark exports student roster as OneRoster CSV
2. Optio admin uploads CSV via existing `/api/lms/sync/roster` endpoint
3. Users created automatically

**Optio already supports this** - no new code needed.

### Option B: Webhook on Enrollment Changes

**If Spark can send webhooks when students enroll/drop:**

```json
POST /spark/webhook/roster
{
  "spark_user_id": "user_123",
  "spark_course_id": "course_456",
  "action": "enroll"  // or "drop"
}
```

Add handler to `spark_integration.py` (~20 lines).

---

## Grade Passback (Future)

### Optio → Spark Grade Sync

If Spark needs to receive grades from Optio:

**Option A: Webhook from Optio to Spark**
```json
POST https://spark-api.com/grades
{
  "spark_user_id": "user_123",
  "spark_assignment_id": "assignment_456",
  "score": 95.5,
  "max_score": 100,
  "completed_at": "2025-01-15T14:30:00Z"
}
```

**Option B: Use existing `lms_grade_sync` queue**
- Queue grades for Spark assignments
- Background worker POSTs to Spark API
- Retry logic on failure

**Implementation:** Reuse `LMSSyncService.queue_grade_sync()` with `lms_platform='spark'`.

---

## Testing Strategy

### Week 1 - SSO Testing

**Unit Tests:**
```python
# backend/tests/test_spark_sso.py
def test_validate_spark_token_valid():
    # Generate valid JWT
    # Assert user created/updated
    # Assert session cookies set

def test_validate_spark_token_expired():
    # Generate expired JWT
    # Assert 401 error

def test_validate_spark_token_invalid_signature():
    # Generate JWT with wrong signature
    # Assert 401 error
```

**Manual Tests:**
1. Generate JWT with online tool (jwt.io)
2. Visit `https://optio-dev-frontend.onrender.com/spark/sso?token={jwt}`
3. Verify redirect to dashboard
4. Verify user created in database

### Week 2 - Webhook Testing

**Unit Tests:**
```python
# backend/tests/test_spark_webhook.py
def test_submission_webhook_valid():
    # Send webhook with valid signature
    # Assert task marked complete
    # Assert XP awarded

def test_submission_webhook_invalid_signature():
    # Send webhook with invalid signature
    # Assert 401 error

def test_submission_webhook_missing_files():
    # Send webhook without files
    # Assert still processes text evidence
```

**Manual Tests:**
1. Use Postman to send webhook payload
2. Include HMAC signature in header
3. Verify task completion in database
4. Verify evidence appears on diploma page

### Integration Tests (Both Teams)

**End-to-end flow:**
1. Spark team creates test student account
2. Spark generates SSO token, redirects to Optio
3. Verify student can access Optio dashboard
4. Student submits assignment in Spark
5. Spark sends webhook to Optio
6. Verify evidence appears in Optio portfolio within 5 minutes
7. Verify XP awarded correctly
8. Verify badge progress updates

---

## Security & Error Handling

### Security Requirements

**1. JWT Validation (SSO):**
- Validate signature with shared secret
- Check expiration (reject if > 10 minutes old)
- Validate required claims (sub, email, exp)

**2. Webhook Signature Validation:**
- HMAC-SHA256 of request body
- Compare with `X-Spark-Signature` header
- Use `hmac.compare_digest()` to prevent timing attacks

**3. Rate Limiting:**
```python
# Apply to webhook endpoints
@rate_limit(limit=100, per=60)  # 100 requests per minute
def submission_webhook():
    ...
```

**4. HTTPS Only:**
- All communication over TLS
- No plain HTTP allowed

**5. CORS Configuration:**
- **Not required** - Spark redirects to Optio (not embedded in iframe)
- SSO flow uses standard HTTP redirects (no CORS issues)
- Webhooks are server-to-server (no browser CORS)

### Error Handling

**SSO Errors:**
- **400:** Missing token parameter
- **401:** Invalid/expired token
- **500:** Server error creating user

**Webhook Errors:**
- **400:** Invalid payload format
- **401:** Invalid signature
- **404:** User/task not found
- **429:** Rate limit exceeded
- **500:** Server error processing submission

**Retry Logic (Spark side):**
```javascript
// If Optio returns 500, retry with exponential backoff
async function sendWithRetry(payload, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status < 500) throw new Error('Client error');
      // Server error - retry
      await sleep(Math.pow(2, attempt) * 1000);
    } catch (error) {
      if (attempt === maxAttempts) throw error;
    }
  }
}
```

---

## Monitoring & Analytics

### Key Metrics to Track

**SSO Performance:**
- Login success rate (target: >99%)
- Average login time (target: <2 seconds)
- Failed login reasons (expired token, invalid signature, etc.)

**Webhook Performance:**
- Webhook delivery success rate (target: >99%)
- Evidence sync latency (target: <5 minutes submission → portfolio)
- Failed webhooks by error type
- File download failures

**Usage Metrics:**
- Active Spark users per month
- Spark submissions per day
- Spark courses completed
- Badges earned via Spark quests

### Logging

**Backend logging:**
```python
import logging
logger = logging.getLogger(__name__)

# Log all SSO attempts
logger.info(f"Spark SSO login: user_id={claims['sub']}, email={claims['email']}")

# Log webhook processing
logger.info(f"Processing Spark submission: assignment_id={data['spark_assignment_id']}")

# Log errors with details
logger.error(f"Failed to process Spark webhook: {str(e)}", exc_info=True)
```

**Monitor with Render logs:**
```bash
# Watch live logs
render logs --service optio-dev-backend --tail

# Filter for Spark events
render logs --service optio-dev-backend | grep "Spark"
```

---

## Timeline & Milestones

### Week 1: Authentication (SSO)

**Monday-Tuesday:**
- [ ] Add Spark to `lms_platforms.py`
- [ ] Create `spark_integration.py` with SSO endpoint
- [ ] Generate shared secrets
- [ ] Update environment variables in Render

**Wednesday-Thursday:**
- [ ] Write unit tests for JWT validation
- [ ] Test SSO with mock JWT tokens
- [ ] Create documentation for Spark team
- [ ] Coordinate with Spark on JWT format

**Friday:**
- [ ] End-to-end SSO test with Spark team
- [ ] Fix any issues
- [ ] Verify user creation in production database

### Week 2: Evidence Sync (Webhooks)

**Monday-Tuesday:**
- [ ] Add webhook endpoint to `spark_integration.py`
- [ ] Implement signature validation
- [ ] Test with Postman/curl

**Wednesday-Thursday:**
- [ ] Integrate with task completion logic
- [ ] Test file download and upload
- [ ] Verify XP award and badge progress

**Friday:**
- [ ] End-to-end webhook test with Spark team
- [ ] Monitor production logs
- [ ] Document any edge cases

### Week 3: Observer Role & Automated Course Sync

**Monday-Tuesday: Automated Course Sync**
- [ ] Build course sync endpoint (`/api/admin/spark/sync/courses`)
- [ ] Implement assignment sync helper functions
- [ ] Add pillar detection and XP calculation logic
- [ ] Test with mock Spark API responses

**Wednesday: Observer Database Setup**
- [ ] Create database migrations (observer_invitations, observer_student_links, observer_comments)
- [ ] Build backend endpoints in `observer.py`
- [ ] Test backend endpoints with Postman

**Thursday: Observer Frontend (Student View)**
- [ ] Create ObserverInvitations component
- [ ] Add "Invite Observer" button to Settings
- [ ] List pending/accepted invitations
- [ ] Test invitation flow

**Friday: Observer Frontend (Observer View)**
- [ ] Create ObserverAcceptPage for invitation acceptance
- [ ] Create ObserverDashboardPage
- [ ] Add observer comments to DiplomaPage
- [ ] End-to-end testing of observer flow

### Post-Launch (Ongoing)

**Week 4+:**
- [ ] Monitor SSO success rate
- [ ] Monitor webhook delivery rate
- [ ] Monitor course sync accuracy
- [ ] Gather feedback from students/parents/observers
- [ ] Iterate on evidence display UI
- [ ] Add roster sync if needed
- [ ] Add grade passback if needed
- [ ] Schedule automated course sync (daily cron job)

---

## Documentation for Spark Team

### Quick Start Guide (Send to Spark Devs)

**What Spark needs to implement:**

1. **SSO Token Generation (20 lines)**
   - Generate JWT when student clicks "View Portfolio"
   - Include required claims: sub, email, given_name, family_name, role, iat, exp
   - Sign with shared secret (HS256)
   - Redirect to `https://optioeducation.com/spark/sso?token={jwt}`

2. **Submission Webhook (50 lines)**
   - When student submits assignment, POST to Optio
   - Include submission data (text, files, grade)
   - Generate temporary public URLs for files (24-hour expiry)
   - Sign request body with HMAC-SHA256
   - Include signature in `X-Spark-Signature` header

**That's it!** No API required from Spark side.

### Example Code (Node.js)

See "What Spark Team Builds" sections above for full examples.

### Testing Checklist

**For Spark developers:**
- [ ] Can generate valid JWT tokens
- [ ] SSO redirect works (student lands on Optio dashboard)
- [ ] Can send webhook payloads
- [ ] Webhook signature validation passes
- [ ] File URLs are publicly accessible for 24 hours
- [ ] Submissions appear in Optio portfolios within 5 minutes

### Contact & Support

**Questions during implementation:**
- Email: dev@optioeducation.com
- Slack: #spark-integration (if shared workspace)

**Production credentials:**
- Shared secrets exchanged via 1Password or LastPass
- Production webhook URL: `https://optio-prod-backend.onrender.com/spark/webhook/submission`

---

## Frequently Asked Questions

### Q: Do we need to create new database tables?
**A:** No. All Spark data fits in existing tables (quests, lms_integrations, quest_task_completions, etc.).

### Q: Does Spark need to build an API for Optio to call?
**A:** No. Spark only pushes data to Optio via webhooks. No API required.

### Q: How do we handle students who already have Optio accounts?
**A:** SSO matches by email. If student exists, we link their Spark ID to existing account.

### Q: What if webhook delivery fails?
**A:** Spark should retry 3 times with exponential backoff. Optio returns error codes to indicate retry vs. don't retry.

### Q: Do we need to store Spark files long-term?
**A:** No. Generate temporary URLs (24-hour expiry). Optio downloads and uploads to own storage.

### Q: How do we test before production?
**A:** Use Optio dev environment: `https://optio-dev-backend.onrender.com`

### Q: Can students create their own Optio login after SSO?
**A:** Yes. Students can set a password on their account in settings. Then they can log in directly without Spark.

### Q: How do badges work with Spark courses?
**A:** Badges check total quest completions and XP. Spark courses count as quests, so they automatically contribute to badge progress.

### Q: Do we need to sync rosters?
**A:** Not required for MVP. Students are created on first SSO login. Optional: Spark can send roster CSV for bulk import.

---

## Cost-Benefit Analysis

### Original Plan vs. Simplified Plan

| Metric | Original | Simplified | Savings |
|--------|----------|------------|---------|
| **New database tables** | 3 | 0 | 100% |
| **Backend code (lines)** | ~2,000 | ~150 | 93% |
| **New service classes** | 2 | 0 | 100% |
| **Frontend components** | 4 | 1 | 75% |
| **Development time** | 7 weeks | 2 weeks | 71% |
| **Spark implementation** | Complex | ~70 lines | 90% simpler |
| **Maintenance burden** | High | Low | 80% reduction |

**Result:** Same functionality, dramatically less complexity.

---

## Next Steps

### Immediate Actions (This Week)

1. **Review this plan** with Optio team
2. **Share with Spark team** - get feedback on feasibility
3. **Generate shared secrets** - coordinate secure exchange
4. **Set up dev environment access** for Spark team
5. **Schedule kickoff meeting** - align on timeline

### Before Development Starts

**Questions for Spark team:**
- [ ] Can Spark generate JWT tokens? (HS256 signature)
- [ ] Can Spark send webhooks on assignment submission?
- [ ] Where are Spark files stored? Can you generate temporary URLs?
- [ ] Do you need grade passback from Optio to Spark?
- [ ] Do you have a test/sandbox environment?
- [ ] What's your timeline for implementation?

### Launch Checklist

**Before going live:**
- [ ] SSO tested end-to-end in production
- [ ] Webhook tested with real submissions
- [ ] Monitoring and logging confirmed working
- [ ] Error handling tested (invalid tokens, failed webhooks)
- [ ] Rate limiting configured
- [ ] Documentation finalized for both teams
- [ ] Student communication prepared (how to access Optio)
- [ ] Parent communication prepared (Spark work in portfolios)

---

## Appendix: Comparison to Original Plan

### What We Removed (Unnecessary Complexity)

**3 New Database Tables:**
- ~~`spark_course_mappings`~~ → Use `quests` table with `lms_platform='spark'`
- ~~`spark_assignment_submissions`~~ → Use `quest_task_completions` table
- ~~`spark_evidence_sync_queue`~~ → Direct webhook processing (no queue needed)

**2 New Service Classes:**
- ~~`SparkAuthService`~~ → Simple JWT validation in route (~20 lines)
- ~~`SparkSyncService`~~ → Reuse existing `LMSSyncService` methods

**4 New Frontend Components:**
- ~~`SparkIntegrationPanel`~~ → Use existing LMS admin panel
- ~~`SparkEvidenceCard`~~ → Evidence is evidence, same display
- ~~`SparkCourseProgress`~~ → Use existing badge progress UI
- ~~`SparkSSOPage`~~ → SSO happens in backend, redirect only

**Background Worker:**
- ~~Evidence sync queue processor~~ → Webhooks directly complete tasks

**Polling Fallback:**
- ~~Polling-based sync~~ → Webhooks only (simpler, Spark must support)

**Complex LTI 1.3:**
- ~~JWKS fetching, platform registration, deep linking~~ → Simple JWT with shared secret

### What We Kept (Essential Features)

- ✅ SSO authentication (simplified to basic JWT)
- ✅ Evidence auto-sync (direct webhooks)
- ✅ Public portfolios (already exists)
- ✅ Badge integration (already supports any quest source)
- ✅ Parent dashboard (already includes LMS quests)
- ✅ XP system (already handles task completions)

---

**Document Status:** Ready for implementation
**Last Review:** January 2025
**Next Review:** After Spark team feedback

**Questions?** Contact: dev@optioeducation.com

Spark LMS Integration - Phase 1 Implementation Plan
Overview
Prepare Optio's codebase for Spark LMS integration with custom API-based authentication, evidence auto-sync, and portfolio showcase. This plan focuses on creating comprehensive documentation and infrastructure for Spark to integrate with Optio.
Phase 1 Must-Have Features (Priority Order)
1. AUTO-SYNC PORTFOLIOS (Core Value Prop)
Spark assignments → Optio quest tasks with automatic evidence transfer
Support essay PDFs, images, videos, screenshots, presentations
2. SINGLE SIGN-ON (Custom SSO Protocol)
Spark-authenticated students get instant Optio access
Custom URL per student: optioeducation.com/portfolio/[student-name]
3. PUBLIC SHOWCASE PAGES
Portfolio pages display Spark coursework with evidence
Accessible via Spark interface (embedded or link)
4. CROSS-COURSE BADGES
Spark course clusters unlock Optio badges
Drive additional OnFire course purchases
5. PARENT DASHBOARD
Read-only view of student progress in Spark courses
Learning rhythm indicator (green/yellow)
6. OBSERVER ROLES
Extended family view-only access to portfolios
Encouragement comments on completed work
7. AI TUTOR
Context-aware of active Spark courses
24/7 Gemini-powered learning support
8. QUEST SYSTEM
Gamified progress tracking with XP
Real-world quests supplement Spark courses
Implementation Strategy
Approach: Documentation-First Integration
Since we don't have access to Spark's API documentation and will create a custom SSO protocol, we'll:
Document Optio's API for Spark team (comprehensive integration guide)
Create stub/mock endpoints for Spark-side implementation
Build flexible backend infrastructure that adapts to Spark's capabilities
Establish webhook + polling hybrid for evidence sync
Technical Architecture
A. Custom SSO Authentication Flow
Pattern: Signed Token Exchange (Similar to LTI but simpler) Flow:
Student logs into Spark LMS
Spark generates signed JWT with student identity
Student clicks "View Portfolio" in Spark
Spark redirects to: https://www.optioeducation.com/spark/sso?token={jwt}
Optio validates JWT signature, creates/updates user, sets session cookies
Optio redirects to student's portfolio/dashboard
JWT Claims (Spark → Optio):
{
  "iss": "spark-lms",
  "sub": "spark_user_id_123",
  "email": "student@example.com",
  "given_name": "Sarah",
  "family_name": "Johnson",
  "role": "student",  // student/parent/admin
  "spark_course_ids": ["course_101", "course_205"],
  "iat": 1234567890,
  "exp": 1234567900,
  "nonce": "random_string"
}
Security:
Spark signs JWT with secret key shared with Optio
Optio validates signature with shared secret
Nonce prevents replay attacks
Short expiration (10 minutes) for security
B. Database Schema Changes
1. Extend lms_integrations table (already exists - no changes needed):
Add 'spark' as valid lms_platform value
Reuse existing columns
2. Extend quests table (already has LMS columns - no changes needed):
source='lms' for Spark courses
lms_platform='spark'
lms_course_id stores Spark course ID
lms_assignment_id stores Spark assignment ID
3. New table: spark_course_mappings
CREATE TABLE spark_course_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  spark_course_id TEXT NOT NULL UNIQUE,
  optio_quest_id UUID REFERENCES quests(id),
  course_title TEXT,
  course_description TEXT,
  sync_enabled BOOLEAN DEFAULT true,
  auto_enroll_students BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
4. New table: spark_assignment_submissions
CREATE TABLE spark_assignment_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  spark_assignment_id TEXT NOT NULL,
  spark_course_id TEXT NOT NULL,
  submission_files JSONB,  -- [{url, type, filename}]
  submission_text TEXT,
  submitted_at TIMESTAMP,
  grade NUMERIC,
  synced_to_optio BOOLEAN DEFAULT false,
  optio_task_completion_id UUID REFERENCES quest_task_completions(id),
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(user_id, spark_assignment_id)
);
5. New table: spark_evidence_sync_queue
CREATE TABLE spark_evidence_sync_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID REFERENCES spark_assignment_submissions(id),
  sync_status TEXT DEFAULT 'pending',  -- pending/processing/completed/failed
  sync_attempts INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT now(),
  last_attempt_at TIMESTAMP,
  completed_at TIMESTAMP
);
C. Backend Services
1. Create backend/services/spark_sync_service.py
class SparkSyncService(BaseService):
    """Handles Spark LMS roster, assignment, and evidence synchronization"""
    
    def sync_student_enrollment(self, spark_user_id, spark_course_ids):
        """Sync student enrollment from Spark to Optio"""
        # Find/create user by spark_user_id
        # For each course: find/create quest mapping
        # Auto-enroll student in mapped quests
        
    def sync_assignment_submission(self, submission_data):
        """Sync assignment submission from Spark to Optio"""
        # Store submission in spark_assignment_submissions
        # Queue for evidence sync
        # Return submission record
        
    def process_evidence_sync_queue(self, limit=10):
        """Process pending evidence sync jobs (background worker)"""
        # Fetch pending syncs
        # Download files from Spark URLs
        # Upload to Supabase storage
        # Create evidence_document_blocks
        # Mark task complete, award XP
        # Update sync status
        
    def create_quest_from_spark_course(self, spark_course_data):
        """Create Optio quest from Spark course"""
        # Create quest with source='lms', lms_platform='spark'
        # Generate tasks based on Spark assignments
        # Store mapping in spark_course_mappings
        
    def map_spark_assignment_to_task(self, spark_assignment, quest_id):
        """Map Spark assignment to Optio quest task"""
        # Create user_quest_tasks for assignment
        # Detect pillar from assignment title/description (AI assist)
        # Assign XP based on assignment complexity
2. Create backend/services/spark_auth_service.py
class SparkAuthService(BaseService):
    """Handles Spark SSO authentication"""
    
    def validate_spark_token(self, jwt_token):
        """Validate signed JWT from Spark"""
        # Decode JWT with shared secret
        # Validate iss, exp, nonce
        # Return user_data dict or None
        
    def create_or_update_user_from_spark(self, user_data):
        """Create or update Optio user from Spark SSO"""
        # Check for existing user by spark_user_id (via lms_integrations)
        # Fall back to email matching
        # Create/update user record
        # Create/update lms_integrations record
        # Return user object
        
    def generate_optio_session(self, user_id):
        """Generate Optio session cookies for Spark user"""
        # Generate JWT tokens
        # Return tokens + user data
3. Extend backend/repositories/lms_repository.py
# Add Spark-specific methods
def find_spark_course_mapping(self, spark_course_id):
    """Find Optio quest mapped to Spark course"""
    
def create_spark_course_mapping(self, spark_course_id, optio_quest_id, course_title):
    """Create course mapping"""
    
def get_spark_submission(self, user_id, spark_assignment_id):
    """Get Spark submission record"""
    
def queue_evidence_sync(self, submission_id):
    """Queue submission for evidence processing"""
D. API Endpoints (New Routes)
Create backend/routes/spark_integration.py
# PUBLIC ENDPOINTS (no auth required - Spark uses signed tokens)

@bp.route('/spark/sso', methods=['GET'])
def spark_sso_login():
    """
    SSO endpoint for Spark-authenticated students
    Query params: token (signed JWT from Spark)
    Returns: Redirect to dashboard with session cookies set
    """
    
@bp.route('/spark/webhook/submission', methods=['POST'])
def spark_submission_webhook():
    """
    Webhook for Spark assignment submissions
    Payload: {
      spark_user_id, spark_assignment_id, spark_course_id,
      submission_files: [{url, type, filename}],
      submission_text, submitted_at, grade
    }
    Security: Validate webhook signature
    """

@bp.route('/spark/webhook/roster', methods=['POST'])
def spark_roster_webhook():
    """
    Webhook for roster updates (enrollments/drops)
    Payload: {
      spark_user_id, spark_course_id, action: 'enroll'|'drop'
    }
    """

# ADMIN ENDPOINTS (require admin auth)

@bp.route('/api/admin/spark/courses', methods=['GET'])
@require_auth
@require_role('admin')
def list_spark_courses():
    """List all Spark courses with mapping status"""
    
@bp.route('/api/admin/spark/courses/<spark_course_id>/map', methods=['POST'])
@require_auth
@require_role('admin')
def map_spark_course_to_quest():
    """
    Map Spark course to existing or new Optio quest
    Payload: {optio_quest_id: UUID or 'create_new', quest_data: {...}}
    """

@bp.route('/api/admin/spark/sync/evidence-queue', methods=['GET'])
@require_auth
@require_role('admin')
def get_evidence_sync_status():
    """Get evidence sync queue statistics"""

@bp.route('/api/admin/spark/sync/process', methods=['POST'])
@require_auth
@require_role('admin')
def trigger_evidence_sync():
    """Manually trigger evidence sync processing"""
E. Badge Configuration for Spark Courses
Admin Interface: Map Spark course clusters to badges Example badge mappings (from pitch deck):
Badge Name	Required Spark Courses	XP Requirement
STEM Scholar	Physics, Chemistry, Advanced Math	1,500 XP
Digital Arts Creator	Graphic Design, Illustration, Adobe Cert	750 XP
Minecraft Master	Minecraft Biology, Geology, Zoology	900 XP
Implementation:
Admin panel: /admin/spark-badges
UI for creating badge → Spark course mappings
Auto-award badges when all courses completed + XP met
F. Frontend Changes
1. New Route: /spark/sso (SSO handler)
React component handles SSO redirect
Extracts token from URL params
Calls backend /spark/sso endpoint
Redirects to dashboard on success
2. Portfolio Page Enhancement
Display Spark course completions prominently
Group evidence by Spark course
Badge progress bars tied to Spark courses
3. Parent Dashboard Updates
Show Spark course enrollments
Display Spark assignment due dates
Learning rhythm tied to Spark submission recency
4. Badge Page Updates
Show "Complete 2 more Spark courses to earn this badge"
Link to OnFire course catalog (deep link to Spark)
Documentation for Spark Team
File: backend/docs/SPARK_INTEGRATION.md
Contents:
Overview: How Optio integrates with Spark
SSO Flow: Step-by-step authentication process
JWT Token Format: Required claims and signature method
Webhook Endpoints: Submission and roster webhooks
API Endpoints: Optio's public endpoints for Spark
Data Formats: Expected JSON schemas
Error Handling: Status codes and error responses
Testing: Sandbox environment details
Security: Signature validation, rate limiting
File: backend/docs/SPARK_API_SPECIFICATION.md Contents:
What Optio Needs from Spark: Required API endpoints
Expected Endpoints:
GET /api/courses - List all courses
GET /api/courses/{id}/assignments - List assignments
GET /api/students/{id}/enrollments - Get student enrollments
GET /api/assignments/{id}/submissions - Get submission with files
POST /api/grades - Accept grade passback from Optio
Authentication: How Spark should authenticate Optio requests
Webhook Configuration: Where to send submission/roster webhooks
Implementation Phases
Phase 1A: Core Infrastructure (Week 1-2)
Backend Tasks:
Create database migrations for new tables
Add 'spark' to lms_platforms.py configuration
Create SparkAuthService with JWT validation
Create SparkSyncService with basic methods
Extend LMSRepository with Spark methods
Create spark_integration.py routes (SSO + webhooks)
Frontend Tasks: 7. Create /spark/sso route and component 8. Update API service with Spark endpoints Documentation: 9. Write SPARK_INTEGRATION.md (comprehensive guide) 10. Write SPARK_API_SPECIFICATION.md (what Spark must provide) Testing: 11. Create manual test scripts for SSO flow 12. Create webhook payload examples
Phase 1B: Auto-Sync Portfolios (Week 3-4)
Backend Tasks:
Implement evidence sync queue processor
File download and Supabase storage upload logic
Evidence block creation from Spark submissions
Automatic task completion + XP award
Background worker for queue processing
Frontend Tasks: 6. Portfolio page displays Spark evidence 7. Evidence grouped by Spark course 8. "Synced from Spark" indicator on evidence Testing: 9. End-to-end submission webhook → portfolio display test
Phase 1C: Badges & Parent Dashboard (Week 5-6)
Backend Tasks:
Badge → Spark course mapping system
Badge progress calculation tied to Spark enrollments
Parent dashboard API with Spark course data
Frontend Tasks: 4. Badge page shows Spark course requirements 5. Parent dashboard displays Spark progress 6. Learning rhythm indicator uses Spark submissions Testing: 7. Badge unlock flow test with Spark courses 8. Parent dashboard accuracy verification
Phase 1D: Polish & Documentation (Week 7)
Tasks:
Admin panel for Spark course mappings
Evidence sync queue monitoring UI
Error handling and retry logic refinement
Rate limiting on webhook endpoints
Final documentation review
Sandbox environment setup
Integration testing with mock Spark API
Files to Create/Modify
New Files (15 files):
Backend:
backend/services/spark_sync_service.py - Roster/assignment/evidence sync
backend/services/spark_auth_service.py - SSO JWT validation
backend/routes/spark_integration.py - API endpoints for Spark
backend/docs/SPARK_INTEGRATION.md - Integration guide for Spark team
backend/docs/SPARK_API_SPECIFICATION.md - Required Spark API endpoints
backend/migrations/xxx_create_spark_tables.sql - Database migrations
Frontend: 7. frontend/src/pages/SparkSSOPage.jsx - SSO redirect handler 8. frontend/src/components/admin/SparkIntegrationPanel.jsx - Admin UI 9. frontend/src/components/portfolio/SparkEvidenceCard.jsx - Spark evidence display 10. frontend/src/components/badges/SparkCourseProgress.jsx - Badge progress with Spark Testing: 11. backend/tests/integration/test_spark_sso.py 12. backend/tests/integration/test_spark_sync.py 13. backend/scripts/mock_spark_webhooks.py - Testing script Documentation: 14. SPARK_ONBOARDING.md - Quick start guide for Spark devs 15. SPARK_SANDBOX_SETUP.md - Test environment instructions
Modified Files (8 files):
Backend:
backend/config/lms_platforms.py - Add Spark configuration
backend/repositories/lms_repository.py - Add Spark methods
backend/middleware/rate_limiter.py - Add webhook rate limits
backend/main.py - Register spark_integration blueprint
Frontend: 5. frontend/src/App.jsx - Add /spark/sso route 6. frontend/src/services/api.js - Add Spark API methods 7. frontend/src/pages/PortfolioPage.jsx - Display Spark evidence 8. frontend/src/pages/admin/AdminPage.jsx - Add Spark panel Documentation: 9. CLAUDE.md - Document Spark integration architecture
Environment Variables (New)
Backend (.env):
# Spark LMS Integration
SPARK_SSO_SECRET=<shared_secret_for_jwt_validation>
SPARK_WEBHOOK_SECRET=<webhook_signature_validation_secret>
SPARK_API_URL=<spark_api_base_url>  # if Spark provides API
SPARK_API_KEY=<api_key>  # if needed for Spark API calls
Frontend (.env):
# No new frontend env vars needed (uses existing VITE_API_URL)
Security Considerations
JWT Signature Validation: All Spark SSO tokens validated with shared secret
Webhook Signature: HMAC-SHA256 signature validation for webhooks
Rate Limiting: Webhook endpoints rate-limited per Spark instance
Nonce Tracking: Prevent replay attacks on SSO tokens
HTTPS Only: All Spark ↔ Optio communication over TLS
CORS Configuration: Add Spark domain to ALLOWED_ORIGINS
Testing Strategy
Unit Tests:
SparkAuthService.validate_spark_token() - JWT validation
SparkSyncService.sync_assignment_submission() - Evidence sync
SparkSyncService.create_quest_from_spark_course() - Course mapping
Integration Tests:
SSO flow: Spark JWT → Optio session → Dashboard redirect
Webhook flow: Submission webhook → Evidence sync → Portfolio display
Badge unlock: Complete Spark courses → Badge awarded
Manual Testing:
Mock Spark webhook payloads via Postman
Test SSO with generated JWTs
Verify evidence display in portfolio
Parent dashboard accuracy
Success Metrics
Technical Metrics:
SSO login success rate: >99%
Evidence sync latency: <5 minutes from submission to portfolio
Webhook failure rate: <1%
Badge unlock accuracy: 100%
Business Metrics:
Student portfolio adoption: >80% of Spark students
Badge completion rate: % of students earning at least 1 badge
Parent dashboard engagement: Daily active parents
Cross-course enrollment: % increase in OnFire course purchases
Next Steps
Review this plan - Confirm scope and priorities
Share documentation templates with Spark team
Establish shared secrets (SSO JWT key, webhook signature key)
Set up sandbox environment for integration testing
Begin Phase 1A implementation (create infrastructure)
Questions for Spark Team
Before implementation, we need answers to:
Authentication: Can Spark generate signed JWTs for SSO? What signature algorithm (HS256, RS256)?
Webhooks: Does Spark support outbound webhooks for submissions/roster changes?
API Access: Does Spark provide REST API for course/assignment data? Authentication method?
File Storage: Where are student submission files stored? Can Optio access via URL?
Gradebook: Can Spark accept grade passback from Optio? What format?
Sandbox: Does Spark have a test environment for integration development?
Risk Mitigation
Risk: Spark lacks webhook support
Mitigation: Implement polling-based sync as fallback
Risk: File download restrictions
Mitigation: Accept file uploads via webhook payload (base64)
Risk: JWT signature mismatch
Mitigation: Provide JWT validation testing tool for Spark
Risk: Evidence sync performance
Mitigation: Queue-based async processing with monitoring
This plan prepares Optio's codebase for seamless Spark integration while creating comprehensive documentation for the Spark team to implement their side of the integration.
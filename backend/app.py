from flask import Flask, jsonify, request, make_response
from dotenv import load_dotenv
import os
import uuid

# Initialize logging FIRST before any other imports
load_dotenv()
from utils.logger import setup_logging, get_logger
setup_logging()
logger = get_logger(__name__)
logger.info("Starting Optio Backend API - Session persistence test #2")

# Initialize Swagger/OpenAPI documentation
from swagger_config import init_swagger

from routes.auth import register_auth_routes
from routes.auth.oauth import bp as oauth_bp
from routes import users, community, portfolio
from routes import uploads, images
from routes.settings import settings_bp
from routes.promo import promo_bp
from routes.contact import bp as contact_bp
from routes.demo import bp as demo_bp
from routes.ai_access import bp as ai_access_bp
from routes.services import services_bp
from routes.admin.services import admin_services_bp
from routes.observer_requests import observer_requests_bp
from routes.organizations import bp as organizations_bp
from routes.courses import bp as courses_bp

# Import routes
from routes import tasks, admin_core, evidence_documents, analytics as analytics_routes, webhooks
from routes.quest import register_quest_blueprints  # Refactored quest routes (P2-ARCH-1)
from routes.admin import user_management, quest_management, analytics, student_task_management, sample_task_management, course_quest_management, task_flags, advisor_management, parent_connections, masquerade, crm, course_import, organization_management, observer_audit, ferpa_compliance, bulk_import, user_invitations, curriculum_upload, curriculum_generate, org_connections, course_enrollments, course_refine, transfer_credits
# badge_management import removed (January 2026 - Microschool client feedback)
from cors_config import configure_cors
from middleware.security import security_middleware
from middleware.error_handler import error_handler
from middleware.memory_monitor import memory_monitor
from middleware.activity_tracker import activity_tracker

# Optional CSRF protection (not critical for JWT-based auth)
try:
    from middleware.csrf_protection import init_csrf, get_csrf_token
    CSRF_AVAILABLE = True
except ImportError:
    CSRF_AVAILABLE = False
    logger.warning("Warning: Flask-WTF not installed. CSRF protection unavailable.")

# Set Flask environment (development or production)
if not os.getenv('FLASK_ENV'):
    os.environ['FLASK_ENV'] = 'development'  # Default to development for local

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max request size (matches frontend upload limit)

# Validate configuration on startup
try:
    from app_config import Config
    Config.validate()
except RuntimeError as e:
    logger.error(f"Configuration validation failed: {e}")
    raise

# Add correlation ID middleware
@app.before_request
def add_correlation_id():
    request.correlation_id = request.headers.get('X-Correlation-ID', str(uuid.uuid4()))

# Configure security middleware
security_middleware.init_app(app)

# Configure CSRF protection for enhanced security
if CSRF_AVAILABLE:
    init_csrf(app)

# Configure CORS with proper settings - MUST come before error handler
configure_cors(app)

# Configure error handling middleware - MUST come after CORS
error_handler.init_app(app)

# Configure memory monitoring
memory_monitor.init_app(app)

# Configure activity tracking middleware
activity_tracker.init_app(app)

# Configure rate limit headers for all responses
from middleware.rate_limiter import add_rate_limit_headers
app.after_request(add_rate_limit_headers)

# Register existing routes
# Auth routes - refactored from mega-file (1,523 lines) to 4 focused modules (P2-ARCH-1)
register_auth_routes(app)
app.register_blueprint(oauth_bp)  # /api/oauth (OAuth 2.0 authorization flow for LMS integrations)
# subscription_requests.bp removed in Phase 1 refactoring (January 2025)
app.register_blueprint(users.bp, url_prefix='/api/users')
app.register_blueprint(community.bp, url_prefix='/api/community')
app.register_blueprint(portfolio.bp, url_prefix='/api/portfolio')
app.register_blueprint(uploads.bp, url_prefix='/api/uploads')
app.register_blueprint(images.bp)  # /api/images (blueprint has url_prefix)
app.register_blueprint(settings_bp, url_prefix='/api')  # /api/settings
app.register_blueprint(promo_bp, url_prefix='/api/promo')  # /api/promo
app.register_blueprint(contact_bp, url_prefix='/api')  # /api/contact (demo requests, sales inquiries)
app.register_blueprint(demo_bp)  # /api/demo (public demo task generation with AI)
app.register_blueprint(ai_access_bp)  # /api/ai-access (AI feature access status)
app.register_blueprint(services_bp)  # /api/services (blueprint has url_prefix in route definitions)
app.register_blueprint(admin_services_bp)  # /api/admin/services (blueprint has url_prefix in route definitions)
app.register_blueprint(observer_requests_bp)  # /api/observer-requests (blueprint has url_prefix in route definitions)
app.register_blueprint(organizations_bp, url_prefix='/api/organizations')  # /api/organizations (public organization endpoints for signup)
app.register_blueprint(courses_bp)  # /api/courses (course management, quest sequencing, enrollments)

# Register homepage images route (January 2025 - Homepage redesign)
from routes.homepage_images import bp as homepage_images_bp
app.register_blueprint(homepage_images_bp)  # /api/homepage (blueprint has url_prefix in route definitions)

# Register Personalized Quest System blueprints FIRST (before main quests.bp)
# This ensures specific personalization routes take precedence over generic quest routes
try:
    from routes import quest_personalization
    from routes.admin import task_approval
    app.register_blueprint(quest_personalization.bp)  # /api/quests/* (specific routes)
    app.register_blueprint(task_approval.bp)  # /api/admin/manual-tasks/*
except ImportError as e:
    logger.error(f"CRITICAL: Failed to import quest_personalization module: {e}", exc_info=True)
    raise
except (ValueError, AttributeError, KeyError) as e:
    logger.error(f"CRITICAL: Configuration error in quest_personalization blueprint: {e}", exc_info=True)
    raise
except Exception as e:
    logger.error(f"CRITICAL: Unexpected error registering quest_personalization blueprint: {e}", exc_info=True)
    raise

# Register quest routes (refactored from quests.py mega-file to 4 modules - P2-ARCH-1)
register_quest_blueprints(app)  # /api/quests (listing, detail, enrollment, completion modules)

# Register other routes
app.register_blueprint(tasks.bp)      # /api/tasks (blueprint has url_prefix='/api/tasks')

# Register task steps routes (AI-powered step breakdowns)
from routes.task_steps import bp as task_steps_bp
app.register_blueprint(task_steps_bp)  # /api/tasks/<id>/steps (AI step generation)

app.register_blueprint(evidence_documents.bp)  # /api/evidence (blueprint has url_prefix='/api/evidence')

# Register helper evidence routes (advisors/parents uploading for students)
from routes import helper_evidence
app.register_blueprint(helper_evidence.bp)  # /api/evidence/helper (blueprint has url_prefix='/api/evidence/helper')

# Register collaboration routes (collaborative quests and evidence sharing)
from routes.collaborations import collaborations_bp
app.register_blueprint(collaborations_bp, url_prefix='/api/collaborations')  # /api/collaborations

# Register teacher verification routes (diploma subject verification workflow)
from routes.teacher_verification import bp as teacher_verification_bp
app.register_blueprint(teacher_verification_bp)  # /api/teacher

# Register subject backfill blueprint (AI-powered subject XP classification)
try:
    from routes.admin.subject_backfill import bp as subject_backfill_bp
    app.register_blueprint(subject_backfill_bp)  # /api/admin/subject-backfill
    logger.info("Registered subject_backfill blueprint directly to app")
except ImportError as e:
    logger.warning(f"Warning: Subject backfill module not available: {e}")
except Exception as e:
    logger.error(f"Error registering subject backfill routes: {e}", exc_info=True)

app.register_blueprint(admin_core.bp)   # /api/admin (blueprint has url_prefix='/api/admin')
app.register_blueprint(user_management.bp)  # /api/admin (blueprint has url_prefix='/api/admin')
app.register_blueprint(quest_management.bp)  # /api/admin (blueprint has url_prefix='/api/admin')
# badge_management.bp removed (January 2026 - Microschool client feedback)
app.register_blueprint(analytics.bp)  # /api/admin/analytics (blueprint has url_prefix='/api/admin/analytics')
app.register_blueprint(student_task_management.bp)  # /api/admin/users (blueprint has url_prefix='/api/admin/users')
app.register_blueprint(sample_task_management.bp)  # /api/admin (blueprint has url_prefix='/api/admin')
app.register_blueprint(course_quest_management.bp)  # /api/admin (blueprint has url_prefix='/api/admin')
app.register_blueprint(task_flags.bp)  # /api/admin (blueprint has url_prefix='/api/admin')
app.register_blueprint(advisor_management.bp)  # /api/admin (blueprint has url_prefix='/api/admin')
app.register_blueprint(parent_connections.bp)  # /api/admin/parent-connections (blueprint has url_prefix='/api/admin/parent-connections')
app.register_blueprint(masquerade.masquerade_bp)  # /api/admin/masquerade (blueprint has url_prefix='/api/admin/masquerade')
app.register_blueprint(crm.crm_bp)  # /api/admin/crm (CRM system for email campaigns and automation)
app.register_blueprint(course_import.bp)  # /api/admin/courses (Course import from IMSCC files)
app.register_blueprint(curriculum_upload.bp)  # /api/admin/curriculum (AI-powered curriculum upload and transformation)
app.register_blueprint(curriculum_generate.bp)  # /api/admin/curriculum/generate (Multi-stage AI course generation wizard)
app.register_blueprint(course_refine.bp)  # /api/admin/curriculum/refine (AI-powered course-wide refinement - superadmin only)
app.register_blueprint(organization_management.bp, url_prefix='/api/admin/organizations')  # /api/admin/organizations (Multi-organization management)
app.register_blueprint(course_enrollments.bp)  # /api/admin/courses (Course enrollment management for admins)
app.register_blueprint(bulk_import.bp)  # /api/admin/organizations/<org_id>/users/bulk-import (CSV bulk user import for org admins)
app.register_blueprint(user_invitations.bp)  # /api/admin/organizations/<org_id>/invitations (Email invitations for org admins)
app.register_blueprint(org_connections.bp)  # /api/admin/organizations/<org_id>/advisors, /connections (Org-scoped advisor-student and parent-student connections)
app.register_blueprint(observer_audit.bp)  # /api/admin/observer-audit (Observer access audit logging - COPPA/FERPA compliance)
app.register_blueprint(ferpa_compliance.bp)  # /api/admin/ferpa (FERPA disclosure reporting and student access logging)
app.register_blueprint(transfer_credits.bp)  # /api/admin/transfer-credits (Import external transcript credits toward diploma)
app.register_blueprint(webhooks.webhooks_bp, url_prefix='/api/webhooks')  # /api/webhooks (Webhook subscriptions for LMS integrations)
# Register quest types routes (sample tasks, course tasks)
try:
    from routes import quest_types
    app.register_blueprint(quest_types.bp)  # /api/quests (has url_prefix='/api/quests')
except ImportError as e:
    logger.warning(f"Warning: Quest types module not available: {e}")
except Exception as e:
    logger.error(f"Error registering quest types routes: {e}", exc_info=True)
# collaborations.bp removed in Phase 1 refactoring (January 2025)
# Conditionally import and register Quest AI blueprint
try:
    from routes import quest_ai
    app.register_blueprint(quest_ai.bp)  # /api/quest-ai
except ImportError as e:
    logger.warning(f"Warning: Quest AI module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Quest AI routes: {e}", exc_info=True)

# Register AI Tutor blueprints (refactored from tutor.py mega-file to 2 modules - P2-ARCH-1)
try:
    from routes.tutor import register_tutor_blueprints
    register_tutor_blueprints(app)  # /api/tutor (chat, management modules)
except ImportError as e:
    logger.warning(f"Warning: AI Tutor module not available: {e}")
except Exception as e:
    logger.error(f"Error registering AI Tutor routes: {e}", exc_info=True)

# Register Task Library blueprint
try:
    from routes import task_library
    app.register_blueprint(task_library.task_library_bp)  # /api/quests/<quest_id>/task-library
except ImportError as e:
    logger.warning(f"Warning: Task Library module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Task Library routes: {e}", exc_info=True)

# Register LMS Integration blueprint
try:
    from routes import lms_integration
    app.register_blueprint(lms_integration.bp)  # /lti/* and /api/lms/*
except ImportError as e:
    logger.warning(f"Warning: LMS Integration module not available: {e}")
except Exception as e:
    logger.error(f"Error registering LMS Integration routes: {e}", exc_info=True)

# Register Spark LMS Integration blueprint (January 2025)
try:
    from routes import spark_integration
    app.register_blueprint(spark_integration.bp)  # /spark/* endpoints
except ImportError as e:
    logger.warning(f"Warning: Spark LMS Integration module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Spark LMS Integration routes: {e}", exc_info=True)

# Register Observer Role blueprint (January 2025)
try:
    from routes import observer
    app.register_blueprint(observer.bp)  # /api/observers/* endpoints
except ImportError as e:
    logger.warning(f"Warning: Observer role module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Observer role routes: {e}", exc_info=True)


# Badge system removed (January 2026 - Microschool client feedback)
# Register Credits blueprint only (credits are still used for diploma)
try:
    from routes import credits
    app.register_blueprint(credits.bp)  # /api/credits
except ImportError as e:
    logger.warning(f"Warning: Credits module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Credits routes: {e}", exc_info=True)

# Register Quest Lifecycle blueprints (Pick Up/Set Down system - January 2025)
try:
    from routes.quest_lifecycle import quest_lifecycle_bp
    # badge_claiming blueprint removed (January 2026 - Microschool client feedback)
    app.register_blueprint(quest_lifecycle_bp, url_prefix='/api')  # /api/quests/:id/pickup, /api/quests/:id/setdown
except ImportError as e:
    logger.warning(f"Warning: Quest Lifecycle module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Quest Lifecycle routes: {e}", exc_info=True)

# Register AI Jobs blueprint (admin)
try:
    from routes.admin import ai_jobs
    app.register_blueprint(ai_jobs.ai_jobs_bp, url_prefix='/api/admin')  # /api/admin/*
except ImportError as e:
    logger.warning(f"Warning: AI Jobs module not available: {e}")
except Exception as e:
    logger.error(f"Error registering AI Jobs routes: {e}", exc_info=True)

# Register Parental Consent blueprint (COPPA compliance)
try:
    from routes import parental_consent
    app.register_blueprint(parental_consent.bp, url_prefix='/api')  # /api/parental-consent, /api/admin/parental-consent
except ImportError as e:
    logger.warning(f"Warning: Parental Consent module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Parental Consent routes: {e}", exc_info=True)

# Register Account Deletion blueprint (GDPR/CCPA compliance)
try:
    from routes import account_deletion
    app.register_blueprint(account_deletion.bp, url_prefix='/api')  # /api/users/delete-account
except ImportError as e:
    logger.warning(f"Warning: Account Deletion module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Account Deletion routes: {e}", exc_info=True)

# Register Advisor blueprint
try:
    from routes import advisor
    app.register_blueprint(advisor.advisor_bp, url_prefix='/api/advisor')  # /api/advisor/*
except ImportError as e:
    logger.warning(f"Warning: Advisor module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Advisor routes: {e}", exc_info=True)

# Register Advisor Check-ins blueprint
try:
    from routes.advisor_checkins import checkins_bp
    app.register_blueprint(checkins_bp)  # /api/advisor/checkins/* (full paths in route definitions)
except ImportError as e:
    logger.error(f"CRITICAL: Failed to import Advisor Check-ins module: {e}", exc_info=True)
except (ValueError, AttributeError, KeyError) as e:
    logger.error(f"CRITICAL: Configuration error in Advisor Check-ins blueprint: {e}", exc_info=True)
except Exception as e:
    logger.error(f"CRITICAL: Unexpected error registering Advisor Check-ins routes: {e}", exc_info=True)

# Register Advisor Notes blueprint
try:
    from routes.advisor_notes import notes_bp
    app.register_blueprint(notes_bp)  # /api/advisor/notes/* (full paths in route definitions)
except ImportError as e:
    logger.error(f"CRITICAL: Failed to import Advisor Notes module: {e}", exc_info=True)
except (ValueError, AttributeError, KeyError) as e:
    logger.error(f"CRITICAL: Configuration error in Advisor Notes blueprint: {e}", exc_info=True)
except Exception as e:
    logger.error(f"CRITICAL: Unexpected error registering Advisor Notes routes: {e}", exc_info=True)

# Register Direct Messages blueprint
try:
    from routes import direct_messages
    app.register_blueprint(direct_messages.bp)  # /api/messages
except ImportError as e:
    logger.warning(f"Warning: Direct Messages module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Direct Messages routes: {e}", exc_info=True)

# AI Quest Review routes removed in admin cleanup (January 2025)
# Batch generation and AI tools have been removed from the admin panel

# Register Khan Academy Sync blueprint (admin)
try:
    from routes.admin import khan_academy_sync
    app.register_blueprint(khan_academy_sync.bp)  # /api/admin/khan-academy/* (blueprint has url_prefix)
except ImportError as e:
    logger.warning(f"Warning: Khan Academy Sync module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Khan Academy Sync routes: {e}", exc_info=True)

# Tier Management routes removed in Phase 2 refactoring (January 2025)
# All subscription tier functionality has been removed from the platform
# Legacy code: tier_management.bp and tiers.bp blueprints deleted

# Personalized Quest System blueprints moved earlier in registration order (above line 103)
# This ensures personalization routes are registered before main quests.bp to avoid route conflicts

# AI Performance Analytics and AI Prompt Optimizer routes removed in admin cleanup (January 2025)
# Batch generation and AI tools have been removed from the admin panel

# Register Student AI Assistance blueprint
try:
    from routes import student_ai_assistance
    app.register_blueprint(student_ai_assistance.student_ai_bp, url_prefix='/api/student-ai')  # /api/student-ai/*
except ImportError as e:
    logger.warning(f"Warning: Student AI Assistance module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Student AI Assistance routes: {e}", exc_info=True)

# Register Batch Quest Generation blueprint (admin)
try:
    from routes.admin import batch_quest_generation
    app.register_blueprint(batch_quest_generation.batch_generation_bp, url_prefix='/api/admin/batch-generation')  # /api/admin/batch-generation/*
except ImportError as e:
    logger.warning(f"Warning: Batch Quest Generation module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Batch Quest Generation routes: {e}", exc_info=True)

# Register AI Quest Review blueprint (admin)
try:
    from routes.admin import ai_quest_review
    app.register_blueprint(ai_quest_review.ai_quest_review_bp, url_prefix='/api/admin/ai-quest-review')  # /api/admin/ai-quest-review/*
except ImportError as e:
    logger.warning(f"Warning: AI Quest Review module not available: {e}")
except Exception as e:
    logger.error(f"Error registering AI Quest Review routes: {e}", exc_info=True)

# Register AI Prompts Management blueprint (admin - superadmin only)
try:
    from routes.admin import ai_prompts
    app.register_blueprint(ai_prompts.ai_prompts_bp, url_prefix='/api/admin/ai')  # /api/admin/ai/*
except ImportError as e:
    logger.warning(f"Warning: AI Prompts module not available: {e}")
except Exception as e:
    logger.error(f"Error registering AI Prompts routes: {e}", exc_info=True)

# Batch Badge Generation removed (January 2026 - Microschool client feedback)

# Register Calendar blueprint
try:
    from routes.calendar import calendar_bp
    app.register_blueprint(calendar_bp)  # /api/calendar
except ImportError as e:
    logger.warning(f"Warning: Calendar module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Calendar routes: {e}", exc_info=True)

# Register Learning Events blueprint
try:
    from routes.learning_events import learning_events_bp
    app.register_blueprint(learning_events_bp)  # /api/learning-events
except ImportError as e:
    logger.warning(f"Warning: Learning Events module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Learning Events routes: {e}", exc_info=True)

# Register Interest Tracks blueprint (Learning Moments 2.0 - organizational tracks)
try:
    from routes.interest_tracks import interest_tracks_bp
    app.register_blueprint(interest_tracks_bp)  # /api/interest-tracks
except ImportError as e:
    logger.warning(f"Warning: Interest Tracks module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Interest Tracks routes: {e}", exc_info=True)

# Register Quest Conversion blueprint (Learning Moments 2.0 - graduation to quests)
try:
    from routes.quest_conversion import quest_conversion_bp
    app.register_blueprint(quest_conversion_bp)  # /api/quest-conversions
except ImportError as e:
    logger.warning(f"Warning: Quest Conversion module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Quest Conversion routes: {e}", exc_info=True)

# Register Parent Dashboard blueprints (refactored from parent_dashboard.py mega-file to 4 modules - P2-ARCH-1)
try:
    from routes import parent_linking
    from routes.parent import register_parent_blueprints
    app.register_blueprint(parent_linking.bp)  # /api/parents
    register_parent_blueprints(app)  # /api/parent (dashboard, quests, evidence, analytics modules)

    # Register dependent profiles blueprint (January 2025 - COPPA-compliant dependent profiles)
    from routes import dependents
    app.register_blueprint(dependents.bp)  # /api/dependents (blueprint has url_prefix='/api/dependents')
except ImportError as e:
    logger.warning(f"Warning: Parent Dashboard module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Parent Dashboard routes: {e}", exc_info=True)

# Register Pillars Configuration API blueprint (public endpoint)
try:
    from routes.pillars import pillars_bp
    app.register_blueprint(pillars_bp, url_prefix='/api')  # /api/pillars
except ImportError as e:
    logger.warning(f"Warning: Pillars Configuration API module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Pillars Configuration API routes: {e}", exc_info=True)

# Register Activity Tracking & Analytics blueprint
try:
    app.register_blueprint(analytics_routes.analytics_bp, url_prefix='/api/analytics')  # /api/analytics/* and /api/activity/*
except ImportError as e:
    logger.warning(f"Warning: Activity Tracking module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Activity Tracking routes: {e}", exc_info=True)

# Register Client-Side Activity Tracking blueprint (December 2025)
try:
    from routes.activity import bp as activity_bp
    app.register_blueprint(activity_bp)  # /api/activity/track (client-side event batching)
except ImportError as e:
    logger.warning(f"Warning: Client Activity Tracking module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Client Activity Tracking routes: {e}", exc_info=True)

# Register LMS Feature blueprints (December 2025 - Multi-tenant LMS transformation)
# Curriculum Builder - custom quest curriculum editing
try:
    from routes.curriculum import bp as curriculum_bp
    app.register_blueprint(curriculum_bp)  # /api/quests/:id/curriculum (blueprint has url_prefix)
except ImportError as e:
    logger.warning(f"Warning: Curriculum Builder module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Curriculum Builder routes: {e}", exc_info=True)

# Curriculum AI Enhancement - AI-powered content enhancement (superadmin only)
try:
    from routes.curriculum_enhance import bp as curriculum_enhance_bp
    app.register_blueprint(curriculum_enhance_bp)  # /api/curriculum/enhance (blueprint has url_prefix)
except ImportError as e:
    logger.warning(f"Warning: Curriculum AI Enhancement module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Curriculum AI Enhancement routes: {e}", exc_info=True)

# Notifications - user notification system
try:
    from routes.notifications import bp as notifications_bp
    app.register_blueprint(notifications_bp)  # /api/notifications (blueprint has url_prefix)
except ImportError as e:
    logger.warning(f"Warning: Notifications module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Notifications routes: {e}", exc_info=True)

# Admin Audit Logs - compliance and activity tracking
try:
    from routes.admin.audit_logs import bp as audit_logs_bp
    app.register_blueprint(audit_logs_bp, url_prefix='/api/admin/audit-logs')  # /api/admin/audit-logs/*
except ImportError as e:
    logger.warning(f"Warning: Admin Audit Logs module not available: {e}")
except Exception as e:
    logger.error(f"Error registering Admin Audit Logs routes: {e}", exc_info=True)


@app.route('/', methods=['GET', 'HEAD'])
def root():
    return jsonify({'message': 'Optio API Server', 'status': 'running'}), 200

@app.route('/api/health')
def health_check():
    return jsonify({'status': 'healthy'}), 200

@app.route('/csrf-token', methods=['GET'])
def get_csrf():
    """
    Get a CSRF token for the session.
    """
    if CSRF_AVAILABLE:
        token = get_csrf_token()
        return jsonify({'csrf_token': token, 'csrf_enabled': True}), 200
    else:
        # CSRF module not installed
        return jsonify({'csrf_token': None, 'csrf_enabled': False, 'module_available': False}), 200

@app.route('/test-config')
def test_config():
    """Test endpoint to verify configuration"""
    from app_config import Config
    
    config_status = {
        'has_supabase_url': bool(Config.SUPABASE_URL),
        'has_supabase_anon_key': bool(Config.SUPABASE_ANON_KEY),
        'has_supabase_service_key': bool(Config.SUPABASE_SERVICE_ROLE_KEY),
        'has_stripe_key': bool(Config.STRIPE_SECRET_KEY),
        'frontend_url': Config.FRONTEND_URL,
        'supabase_url': Config.SUPABASE_URL[:30] + '...' if Config.SUPABASE_URL else None
    }
    
    # Try to connect to Supabase
    try:
        from database import get_supabase_client
        client = get_supabase_client()
        config_status['supabase_connection'] = 'success'
    except ImportError as e:
        config_status['supabase_connection'] = f'import error: {str(e)}'
    except (ConnectionError, TimeoutError) as e:
        config_status['supabase_connection'] = f'connection failed: {str(e)}'
    except Exception as e:
        config_status['supabase_connection'] = f'unexpected error: {str(e)}'
    
    return jsonify(config_status), 200

# Debug endpoint removed in Phase 2 refactoring (January 2025)
# /debug-user-tier endpoint deleted - subscription tiers no longer exist

# CORS headers are now managed by Flask-CORS in cors_config.py (single source of truth)

# Error handlers are now managed by error_handler middleware

# Register API v1 routes (API Versioning Infrastructure - Week 8, Dec 2025)
# This registers all existing routes under /api/v1/* prefix for LMS integration readiness
# Legacy /api/* routes remain active with deprecation warnings (sunset: June 30, 2026)
try:
    from routes.v1 import register_v1_routes
    register_v1_routes(app)
    logger.info("API v1 routes registered at /api/v1/* (versioning infrastructure complete)")
except ImportError as e:
    logger.warning(f"Warning: API v1 routes not yet fully migrated: {e}")
except Exception as e:
    logger.error(f"Error registering API v1 routes: {e}", exc_info=True)

# Initialize Swagger documentation (must be after all blueprints are registered)
try:
    swagger = init_swagger(app)
    logger.info("Swagger API documentation initialized at /api/docs")
except ImportError as e:
    logger.warning(f"Warning: Swagger module not available: {e}")
except (ValueError, AttributeError, KeyError) as e:
    logger.error(f"Error: Swagger configuration error: {e}", exc_info=True)
except Exception as e:
    logger.error(f"Error: Swagger documentation initialization failed: {e}", exc_info=True)

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)
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

from routes import auth, users, community, portfolio
from routes import uploads
from routes.settings import settings_bp
from routes.promo import promo_bp
from routes.services import services_bp
from routes.admin.services import admin_services_bp
from routes.observer_requests import observer_requests_bp

# Import routes
from routes import quests, tasks, admin_core, evidence_documents, tutorial, analytics as analytics_routes
from routes.admin import user_management, quest_management, analytics, student_task_management, sample_task_management, course_quest_management, badge_management, task_flags, advisor_management, parent_connections, masquerade, crm
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
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10MB max request size (matches upload limit)

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

# Register existing routes
app.register_blueprint(auth.bp, url_prefix='/api/auth')
# subscription_requests.bp removed in Phase 1 refactoring (January 2025)
app.register_blueprint(users.bp, url_prefix='/api/users')
app.register_blueprint(community.bp, url_prefix='/api/community')
app.register_blueprint(portfolio.bp, url_prefix='/api/portfolio')
app.register_blueprint(uploads.bp, url_prefix='/api/uploads')
app.register_blueprint(settings_bp, url_prefix='/api')  # /api/settings
app.register_blueprint(promo_bp, url_prefix='/api/promo')  # /api/promo
app.register_blueprint(services_bp)  # /api/services (blueprint has url_prefix in route definitions)
app.register_blueprint(admin_services_bp)  # /api/admin/services (blueprint has url_prefix in route definitions)
app.register_blueprint(observer_requests_bp)  # /api/observer-requests (blueprint has url_prefix in route definitions)

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
except Exception as e:
    logger.error(f"CRITICAL: Failed to register quest_personalization blueprint: {e}", exc_info=True)
    # Re-raise to see full traceback in production logs
    raise

# Register routes
app.register_blueprint(quests.bp)  # /api/quests (blueprint has url_prefix='/api/quests')
app.register_blueprint(tasks.bp)      # /api/tasks (blueprint has url_prefix='/api/tasks')
app.register_blueprint(evidence_documents.bp)  # /api/evidence (blueprint has url_prefix='/api/evidence')

# Register helper evidence routes (advisors/parents uploading for students)
from routes import helper_evidence
app.register_blueprint(helper_evidence.bp)  # /api/evidence/helper (blueprint has url_prefix='/api/evidence/helper')
app.register_blueprint(tutorial.tutorial_bp, url_prefix='/api/tutorial')  # /api/tutorial
app.register_blueprint(admin_core.bp)   # /api/admin (blueprint has url_prefix='/api/admin')
app.register_blueprint(user_management.bp)  # /api/admin (blueprint has url_prefix='/api/admin')
app.register_blueprint(quest_management.bp)  # /api/admin (blueprint has url_prefix='/api/admin')
app.register_blueprint(badge_management.bp)  # /api/admin (blueprint has url_prefix='/api/admin')
app.register_blueprint(analytics.bp)  # /api/admin/analytics (blueprint has url_prefix='/api/admin/analytics')
app.register_blueprint(student_task_management.bp)  # /api/admin/users (blueprint has url_prefix='/api/admin/users')
app.register_blueprint(sample_task_management.bp)  # /api/admin (blueprint has url_prefix='/api/admin')
app.register_blueprint(course_quest_management.bp)  # /api/admin (blueprint has url_prefix='/api/admin')
app.register_blueprint(task_flags.bp)  # /api/admin (blueprint has url_prefix='/api/admin')
app.register_blueprint(advisor_management.bp)  # /api/admin (blueprint has url_prefix='/api/admin')
app.register_blueprint(parent_connections.bp)  # /api/admin/parent-connections (blueprint has url_prefix='/api/admin/parent-connections')
app.register_blueprint(masquerade.masquerade_bp)  # /api/admin/masquerade (blueprint has url_prefix='/api/admin/masquerade')
app.register_blueprint(crm.crm_bp)  # /api/admin/crm (CRM system for email campaigns and automation)
# Register quest types routes (sample tasks, course tasks)
try:
    from routes import quest_types
    app.register_blueprint(quest_types.bp)  # /api/quests (has url_prefix='/api/quests')
except Exception as e:
    logger.warning(f"Warning: Quest types routes not available: {e}")
# collaborations.bp removed in Phase 1 refactoring (January 2025)
# Conditionally import and register Quest AI blueprint
try:
    from routes import quest_ai
    app.register_blueprint(quest_ai.bp)  # /api/quest-ai
except Exception as e:
    logger.warning(f"Warning: Quest AI routes not available: {e}")

# Register AI Tutor blueprint
try:
    from routes import tutor
    app.register_blueprint(tutor.bp)  # /api/tutor
except Exception as e:
    logger.warning(f"Warning: AI Tutor routes not available: {e}")

# Register Task Library blueprint
try:
    from routes import task_library
    app.register_blueprint(task_library.task_library_bp)  # /api/quests/<quest_id>/task-library
except Exception as e:
    logger.warning(f"Warning: Task Library routes not available: {e}")

# Register LMS Integration blueprint
try:
    from routes import lms_integration
    app.register_blueprint(lms_integration.bp)  # /lti/* and /api/lms/*
except Exception as e:
    logger.warning(f"Warning: LMS Integration routes not available: {e}")

# Register Spark LMS Integration blueprint (January 2025)
try:
    from routes import spark_integration
    app.register_blueprint(spark_integration.bp)  # /spark/* endpoints
except Exception as e:
    logger.warning(f"Warning: Spark LMS Integration routes not available: {e}")

# Register Observer Role blueprint (January 2025)
try:
    from routes import observer
    app.register_blueprint(observer.bp)  # /api/observers/* endpoints
except Exception as e:
    logger.warning(f"Warning: Observer role routes not available: {e}")


# Register Badge System blueprints
try:
    from routes import badges, credits, admin_badge_seed, quest_badge_hub
    app.register_blueprint(badges.bp)  # /api/badges
    app.register_blueprint(credits.bp)  # /api/credits
    app.register_blueprint(admin_badge_seed.bp)  # /api/admin/seed
    app.register_blueprint(quest_badge_hub.bp)  # /api/hub
except Exception as e:
    logger.warning(f"Warning: Badge system routes not available: {e}")

# Register Quest Lifecycle blueprints (Pick Up/Set Down system - January 2025)
try:
    from routes.quest_lifecycle import quest_lifecycle_bp
    from routes.badge_claiming import badge_claiming_bp
    app.register_blueprint(quest_lifecycle_bp, url_prefix='/api')  # /api/quests/:id/pickup, /api/quests/:id/setdown
    app.register_blueprint(badge_claiming_bp, url_prefix='/api')  # /api/badges/:id/claim, /api/badges/claimable
except Exception as e:
    logger.warning(f"Warning: Quest Lifecycle routes not available: {e}")

# Register AI Jobs blueprint (admin)
try:
    from routes.admin import ai_jobs
    app.register_blueprint(ai_jobs.ai_jobs_bp, url_prefix='/api/admin')  # /api/admin/*
except Exception as e:
    logger.warning(f"Warning: AI Jobs routes not available: {e}")

# Register Parental Consent blueprint (COPPA compliance)
try:
    from routes import parental_consent
    app.register_blueprint(parental_consent.bp, url_prefix='/api/auth')  # /api/auth/parental-consent
except Exception as e:
    logger.warning(f"Warning: Parental Consent routes not available: {e}")

# Register Account Deletion blueprint (GDPR/CCPA compliance)
try:
    from routes import account_deletion
    app.register_blueprint(account_deletion.bp, url_prefix='/api')  # /api/users/delete-account
except Exception as e:
    logger.warning(f"Warning: Account Deletion routes not available: {e}")

# Register Advisor blueprint
try:
    from routes import advisor
    app.register_blueprint(advisor.advisor_bp, url_prefix='/api/advisor')  # /api/advisor/*
except Exception as e:
    logger.warning(f"Warning: Advisor routes not available: {e}")

# Register Advisor Check-ins blueprint
try:
    from routes.advisor_checkins import checkins_bp
    app.register_blueprint(checkins_bp)  # /api/advisor/checkins/* (full paths in route definitions)
except Exception as e:
    logger.error(f"CRITICAL: Failed to register Advisor Check-ins routes: {e}")
    import traceback
    logger.error(traceback.format_exc())

# Register Advisor Notes blueprint
try:
    from routes.advisor_notes import notes_bp
    app.register_blueprint(notes_bp)  # /api/advisor/notes/* (full paths in route definitions)
except Exception as e:
    logger.error(f"CRITICAL: Failed to register Advisor Notes routes: {e}")
    import traceback
    logger.error(traceback.format_exc())

# Register Direct Messages blueprint
try:
    from routes import direct_messages
    app.register_blueprint(direct_messages.bp)  # /api/messages
except Exception as e:
    logger.warning(f"Warning: Direct Messages routes not available: {e}")

# AI Quest Review routes removed in admin cleanup (January 2025)
# Batch generation and AI tools have been removed from the admin panel

# Register Khan Academy Sync blueprint (admin)
try:
    from routes.admin import khan_academy_sync
    app.register_blueprint(khan_academy_sync.bp)  # /api/admin/khan-academy/* (blueprint has url_prefix)
except Exception as e:
    logger.warning(f"Warning: Khan Academy Sync routes not available: {e}")

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
except Exception as e:
    logger.warning(f"Warning: Student AI Assistance routes not available: {e}")

# Register Batch Quest Generation blueprint (admin)
try:
    from routes.admin import batch_quest_generation
    app.register_blueprint(batch_quest_generation.batch_generation_bp, url_prefix='/api/admin/batch-generation')  # /api/admin/batch-generation/*
except Exception as e:
    logger.warning(f"Warning: Batch Quest Generation routes not available: {e}")

# Register AI Quest Review blueprint (admin)
try:
    from routes.admin import ai_quest_review
    app.register_blueprint(ai_quest_review.ai_quest_review_bp, url_prefix='/api/admin/ai-quest-review')  # /api/admin/ai-quest-review/*
except Exception as e:
    logger.warning(f"Warning: AI Quest Review routes not available: {e}")

# Register Batch Badge Generation blueprint (admin)
try:
    from routes.admin import batch_badge_generation
    app.register_blueprint(batch_badge_generation.batch_badge_generation_bp, url_prefix='/api/admin/batch-badge-generation')  # /api/admin/batch-badge-generation/*
except Exception as e:
    logger.warning(f"Warning: Batch Badge Generation routes not available: {e}")

# Register Calendar blueprint
try:
    from routes.calendar import calendar_bp
    app.register_blueprint(calendar_bp)  # /api/calendar
except Exception as e:
    logger.warning(f"Warning: Calendar routes not available: {e}")

# Register Learning Events blueprint
try:
    from routes.learning_events import learning_events_bp
    app.register_blueprint(learning_events_bp)  # /api/learning-events
except Exception as e:
    logger.warning(f"Warning: Learning Events routes not available: {e}")

# Register Parent Dashboard blueprints
try:
    from routes import parent_linking, parent_dashboard, parent_evidence
    app.register_blueprint(parent_linking.bp)  # /api/parents
    app.register_blueprint(parent_dashboard.bp)  # /api/parent
    app.register_blueprint(parent_evidence.bp)  # /api/parent (evidence endpoints)
except Exception as e:
    logger.warning(f"Warning: Parent Dashboard routes not available: {e}")

# Register Pillars Configuration API blueprint (public endpoint)
try:
    from routes.pillars import pillars_bp
    app.register_blueprint(pillars_bp, url_prefix='/api')  # /api/pillars
except Exception as e:
    logger.warning(f"Warning: Pillars Configuration API routes not available: {e}")

# Register Activity Tracking & Analytics blueprint
try:
    app.register_blueprint(analytics_routes.analytics_bp, url_prefix='/api/analytics')  # /api/analytics/* and /api/activity/*
except Exception as e:
    logger.warning(f"Warning: Activity Tracking routes not available: {e}")


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
    except Exception as e:
        config_status['supabase_connection'] = f'failed: {str(e)}'
    
    return jsonify(config_status), 200

# Debug endpoint removed in Phase 2 refactoring (January 2025)
# /debug-user-tier endpoint deleted - subscription tiers no longer exist

# CORS headers are now managed by Flask-CORS in cors_config.py (single source of truth)

# Error handlers are now managed by error_handler middleware

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)
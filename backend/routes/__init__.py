"""
Centralized blueprint registration for the Optio backend.

All route modules are mandatory — a failed import indicates a bug, not an
optional feature. Previously app.py wrapped each registration in try/except
that swallowed errors and silently degraded the API surface; that hid
production-breaking import failures (e.g. a renamed module not caught until
a user hit a 404 in a feature nobody re-tested).

The only legitimately optional integrations stay in app.py:
- CSRF middleware (Flask-WTF, dev tolerance only — hard fail in prod)
- Swagger/OpenAPI doc UI (cosmetic; not request-path)

Ordering rules baked in here (do NOT reorder casually):
- quest_personalization + admin/task_approval must register BEFORE the main
  quest blueprints so that specific personalization routes take precedence
  over the generic /api/quests/<id> matcher.
"""
from utils.logger import get_logger

logger = get_logger(__name__)


def register_all(app):
    """Register every route blueprint on the Flask app.

    Raises on any import failure — a missing route module is a critical bug
    we want to surface at startup, not silently drop endpoints.
    """
    # ── Auth (refactored from 1,523-line mega-file into 4 focused modules) ────
    from routes.auth import register_auth_routes
    register_auth_routes(app)

    # OAuth 2.0 authorization flow for LMS integrations
    from routes.auth.oauth import bp as oauth_bp
    app.register_blueprint(oauth_bp)

    # ── Users / profile / settings ────────────────────────────────────────────
    from routes import users, portfolio
    app.register_blueprint(users.bp, url_prefix='/api/users')
    app.register_blueprint(portfolio.bp, url_prefix='/api/portfolio')

    from routes import uploads, images
    app.register_blueprint(uploads.bp, url_prefix='/api/uploads')
    app.register_blueprint(images.bp)  # url_prefix in route definitions

    from routes.settings import settings_bp
    app.register_blueprint(settings_bp, url_prefix='/api')

    # ── Public / marketing ────────────────────────────────────────────────────
    from routes.contact import bp as contact_bp
    app.register_blueprint(contact_bp, url_prefix='/api')

    from routes.promo import bp as promo_bp
    app.register_blueprint(promo_bp, url_prefix='/api')

    from routes.demo import bp as demo_bp
    app.register_blueprint(demo_bp)

    from routes.ai_access import bp as ai_access_bp
    app.register_blueprint(ai_access_bp)

    from routes.observer_requests import observer_requests_bp
    app.register_blueprint(observer_requests_bp)

    from routes.organizations import bp as organizations_bp
    app.register_blueprint(organizations_bp, url_prefix='/api/organizations')

    from routes.courses import bp as courses_bp
    app.register_blueprint(courses_bp)

    from routes.public import bp as public_bp
    app.register_blueprint(public_bp)

    from routes.platform_settings import bp as platform_settings_bp
    app.register_blueprint(platform_settings_bp)

    # ── Docs / philosophy (public + admin pairs) ──────────────────────────────
    from routes.docs import public_docs_bp, admin_docs_bp
    app.register_blueprint(public_docs_bp)
    app.register_blueprint(admin_docs_bp)

    from routes.philosophy import public_philosophy_bp, admin_philosophy_bp
    app.register_blueprint(public_philosophy_bp)
    app.register_blueprint(admin_philosophy_bp)

    from routes.homepage_images import bp as homepage_images_bp
    app.register_blueprint(homepage_images_bp)

    # ── Personalized Quest System (MUST register BEFORE main quest routes
    #    so /api/quests/<specific>/* takes precedence over /api/quests/<id>) ──
    from routes import quest_personalization
    app.register_blueprint(quest_personalization.bp)

    from routes.admin import task_approval
    app.register_blueprint(task_approval.bp)

    # Quest routes (refactored from quests.py mega-file into 4 modules)
    from routes.quest import register_quest_blueprints
    register_quest_blueprints(app)

    # ── Tasks ─────────────────────────────────────────────────────────────────
    from routes import tasks
    app.register_blueprint(tasks.bp)

    from routes.task_steps import bp as task_steps_bp
    app.register_blueprint(task_steps_bp)

    # ── Evidence ──────────────────────────────────────────────────────────────
    from routes import evidence_documents, helper_evidence
    app.register_blueprint(evidence_documents.bp)
    app.register_blueprint(helper_evidence.bp)

    from routes.teacher_verification import bp as teacher_verification_bp
    app.register_blueprint(teacher_verification_bp)

    # ── Admin (core + sub-modules) ────────────────────────────────────────────
    from routes import admin_core
    app.register_blueprint(admin_core.bp)

    from routes.admin import (
        user_management,
        quest_management,
        student_task_management,
        sample_task_management,
        course_quest_management,
        task_flags,
        advisor_management,
        parent_connections,
        masquerade,
        course_import,
        organization_management,
        observer_audit,
        ferpa_compliance,
        bulk_import,
        user_invitations,
        curriculum_upload,
        curriculum_generate,
        org_connections,
        course_enrollments,
        course_refine,
        transfer_credits,
        plan_mode,
        xp_reconciliation,
        transcript_generator,
        subject_backfill,
        ai_jobs,
        ai_quest_review,
        ai_prompts,
        ai_costs,
        audit_logs,
    )
    app.register_blueprint(user_management.bp)
    app.register_blueprint(quest_management.bp)
    app.register_blueprint(student_task_management.bp)
    app.register_blueprint(sample_task_management.bp)
    app.register_blueprint(course_quest_management.bp)
    app.register_blueprint(task_flags.bp)
    app.register_blueprint(advisor_management.bp)
    app.register_blueprint(parent_connections.bp)
    app.register_blueprint(masquerade.masquerade_bp)
    app.register_blueprint(course_import.bp)
    app.register_blueprint(curriculum_upload.bp)
    app.register_blueprint(curriculum_generate.bp)
    app.register_blueprint(course_refine.bp)
    app.register_blueprint(plan_mode.bp)
    app.register_blueprint(organization_management.bp, url_prefix='/api/admin/organizations')
    app.register_blueprint(course_enrollments.bp)
    app.register_blueprint(bulk_import.bp)
    app.register_blueprint(user_invitations.bp)
    app.register_blueprint(org_connections.bp)
    app.register_blueprint(observer_audit.bp)
    app.register_blueprint(ferpa_compliance.bp)
    app.register_blueprint(transfer_credits.bp)
    app.register_blueprint(transcript_generator.bp)
    app.register_blueprint(xp_reconciliation.bp)
    app.register_blueprint(subject_backfill.bp)
    app.register_blueprint(ai_jobs.ai_jobs_bp, url_prefix='/api/admin')
    app.register_blueprint(ai_quest_review.ai_quest_review_bp, url_prefix='/api/admin/ai-quest-review')
    app.register_blueprint(ai_prompts.ai_prompts_bp, url_prefix='/api/admin/ai')
    app.register_blueprint(ai_costs.ai_costs_bp, url_prefix='/api/admin/ai')
    app.register_blueprint(audit_logs.bp, url_prefix='/api/admin/audit-logs')

    # ── Organization classes (classroom mgmt) ─────────────────────────────────
    from routes.classes import bp as classes_bp
    app.register_blueprint(classes_bp)

    # ── Quest types + Quest AI ────────────────────────────────────────────────
    from routes import quest_types, quest_ai
    app.register_blueprint(quest_types.bp)
    app.register_blueprint(quest_ai.bp)

    # AI Tutor removed (M1) — ai_tutor_service was deleted in earlier audit; route + service stack removed 2026-04-13.

    # ── Task library / Spark LMS / Observer role ──────────────────────────────
    from routes import task_library
    app.register_blueprint(task_library.task_library_bp)

    from routes import spark_integration
    app.register_blueprint(spark_integration.bp)

    from routes import observer
    app.register_blueprint(observer.bp)

    # ── Family / mobile companions (Yeti, Bounties, Buddy) ────────────────────
    from routes.family_quests import bp as family_quests_bp
    app.register_blueprint(family_quests_bp)

    from routes.yeti import yeti_bp
    app.register_blueprint(yeti_bp)

    from routes.bounties import bounties_bp
    app.register_blueprint(bounties_bp)

    from routes.buddy import buddy_bp
    app.register_blueprint(buddy_bp)

    from routes.link_preview import bp as link_preview_bp
    app.register_blueprint(link_preview_bp)

    # ── Credits + quest lifecycle ─────────────────────────────────────────────
    from routes import credits
    app.register_blueprint(credits.bp)

    from routes.quest_lifecycle import quest_lifecycle_bp
    app.register_blueprint(quest_lifecycle_bp, url_prefix='/api')

    # ── Compliance (COPPA / GDPR / CCPA) ──────────────────────────────────────
    from routes import parental_consent
    app.register_blueprint(parental_consent.bp, url_prefix='/api')

    from routes import account_deletion
    app.register_blueprint(account_deletion.bp, url_prefix='/api')

    # ── Advisor (notes, check-ins, student overview) ──────────────────────────
    from routes.advisor_checkins import checkins_bp
    app.register_blueprint(checkins_bp)

    from routes.advisor_notes import notes_bp
    app.register_blueprint(notes_bp)

    from routes.advisor import register_advisor_blueprints
    register_advisor_blueprints(app)

    # ── Messaging (DMs + groups) + student AI ─────────────────────────────────
    from routes import direct_messages, group_messages
    app.register_blueprint(direct_messages.bp)
    app.register_blueprint(group_messages.bp)

    from routes import student_ai_assistance
    app.register_blueprint(student_ai_assistance.student_ai_bp, url_prefix='/api/student-ai')

    # ── Learning events / interest tracks / quest conversion ──────────────────
    from routes.learning_events import learning_events_bp
    app.register_blueprint(learning_events_bp)

    from routes.interest_tracks import interest_tracks_bp
    app.register_blueprint(interest_tracks_bp)

    from routes.quest_conversion import quest_conversion_bp
    app.register_blueprint(quest_conversion_bp)

    # ── Parent dashboard + linking + dependents ───────────────────────────────
    from routes import parent_linking, dependents
    from routes.parent import register_parent_blueprints
    app.register_blueprint(parent_linking.bp)
    register_parent_blueprints(app)
    app.register_blueprint(dependents.bp)

    # ── Credit dashboard / pillars / analytics / activity ─────────────────────
    from routes.credit_dashboard import bp as credit_dashboard_bp
    app.register_blueprint(credit_dashboard_bp)

    from routes.pillars import pillars_bp
    app.register_blueprint(pillars_bp, url_prefix='/api')

    from routes import analytics as analytics_routes
    app.register_blueprint(analytics_routes.analytics_bp, url_prefix='/api/analytics')

    from routes.activity import bp as activity_bp
    app.register_blueprint(activity_bp)

    # ── Curriculum builder + AI enhancement ───────────────────────────────────
    from routes.curriculum import bp as curriculum_bp
    app.register_blueprint(curriculum_bp)

    from routes.curriculum_enhance import bp as curriculum_enhance_bp
    app.register_blueprint(curriculum_enhance_bp)

    # ── Notifications (in-app + push) ─────────────────────────────────────────
    from routes.notifications import bp as notifications_bp
    app.register_blueprint(notifications_bp)

    from routes.push_subscriptions import bp as push_subscriptions_bp
    app.register_blueprint(push_subscriptions_bp)

    # ── Content moderation (report/block + admin queue) ───────────────────────
    from routes.moderation import bp as moderation_bp
    app.register_blueprint(moderation_bp)

    from routes.admin.moderation_queue import bp as admin_moderation_bp
    app.register_blueprint(admin_moderation_bp)

    # ── Evidence reports (shareable PDFs) ─────────────────────────────────────
    from routes.evidence_reports import bp as evidence_reports_bp
    app.register_blueprint(evidence_reports_bp)

    logger.info("All route blueprints registered")

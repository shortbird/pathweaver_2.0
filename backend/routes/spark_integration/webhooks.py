"""Spark course-sync and submission webhook receivers.

Split from routes/spark_integration.py on 2026-04-14 (Q1).
"""

"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED - Integration Layer
- SSO authentication endpoint (JWT signature validation)
- Webhook handler for external LMS events (HMAC signature validation)
- Uses XPService for XP calculations from LMS submissions
- Integration layer, not standard CRUD operations
- Security-focused code (JWT, HMAC, rate limiting, replay protection)
- Direct DB access acceptable for SSO user provisioning and webhook processing
- Per migration guidelines: Integration endpoints don't benefit from repository abstraction

Spark LMS Integration Routes

Handles SSO authentication and evidence webhooks from Spark LMS.
Implements simple JWT-based SSO (not LTI 1.3) and HMAC-signed webhooks.

Security features:
- JWT signature validation
- HMAC webhook signature validation
- Rate limiting
- Replay attack protection
- SSRF protection for file downloads
"""

from flask import Blueprint, request, redirect, jsonify
from app_config import Config
import jwt
import hmac
import hashlib
import json
import requests
from datetime import datetime, timedelta
from urllib.parse import urlparse
import uuid

from database import get_supabase_admin_client
from utils.session_manager import session_manager
from services.xp_service import XPService
from middleware.rate_limiter import rate_limit
from middleware.activity_tracker import track_custom_event
from routes.quest_types import get_course_tasks_for_quest
import logging

logger = logging.getLogger(__name__)


from routes.spark_integration import bp


@bp.route('/spark/webhook/course', methods=['POST'])
@rate_limit(limit=50, per=60)  # 50 course updates per minute
def course_sync_webhook():
    """
    Receive course data from Spark to auto-create/update Optio quests

    Headers:
        X-Spark-Signature: HMAC-SHA256 signature of request body

    Body (JSON):
        spark_org_id: Spark organization ID
        spark_course_id: Spark's course ID (unique identifier)
        course_title: Course name (becomes quest title)
        course_description: Course description (optional)
        assignments: Array of assignment objects
            - spark_assignment_id: Assignment ID
            - title: Assignment title (becomes task title)
            - description: Assignment description (optional)
            - due_date: ISO timestamp (optional)

    Returns:
        200: Success with quest_id and task count
        400: Invalid payload
        401: Invalid signature
        500: Server error
    """
    # Validate signature
    signature = request.headers.get('X-Spark-Signature')
    if not signature:
        logger.warning("Spark course webhook missing signature")
        return jsonify({'error': 'Missing signature'}), 401

    try:
        # Validate signature using webhook secret BEFORE parsing JSON
        # IMPORTANT: Must use raw request body bytes, not re-serialized JSON
        webhook_secret = Config.SPARK_WEBHOOK_SECRET
        if not webhook_secret:
            logger.error("SPARK_WEBHOOK_SECRET not configured")
            return jsonify({'error': 'Webhook not configured'}), 503

        # Calculate expected signature from raw body
        expected_signature = hmac.new(
            webhook_secret.encode(),
            request.data,
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(signature, expected_signature):
            logger.warning(f"Invalid Spark course webhook signature. Expected: {expected_signature[:16]}..., Got: {signature[:16]}...")
            return jsonify({'error': 'Invalid signature'}), 401

        # Parse request body after signature validation
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Missing request body'}), 400

        # Extract required fields
        spark_org_id = data.get('spark_org_id')
        spark_course_id = data.get('spark_course_id')
        course_title = data.get('course_title')
        course_description = data.get('course_description', '')
        assignments = data.get('assignments', [])

        if not spark_course_id or not course_title:
            return jsonify({'error': 'Missing spark_course_id or course_title'}), 400

        logger.info(f"Course sync webhook: course_id={spark_course_id}, title={course_title}, assignments={len(assignments)}")

        # Process course sync
        result = process_spark_course_sync(
            spark_org_id=spark_org_id,
            spark_course_id=spark_course_id,
            course_title=course_title,
            course_description=course_description,
            assignments=assignments
        )

        return jsonify({
            'success': True,
            'quest_id': result['quest_id'],
            'task_count': result['task_count'],
            'message': f"Quest '{course_title}' synced successfully"
        }), 200

    except Exception as e:
        logger.error(f"Course sync webhook error: {str(e)}", exc_info=True)
        return jsonify({'error': 'Course sync failed'}), 500


# ============================================
# SUBMISSION WEBHOOK
# ============================================

@bp.route('/spark/webhook/submission', methods=['POST'])
@rate_limit(limit=100, per=60)  # 100 webhooks per minute (batch submissions)
def submission_webhook():
    """
    Receive assignment submissions from Spark

    Headers:
        X-Spark-Signature: HMAC-SHA256 signature of metadata field (for multipart) or request body (for JSON)

    Body (JSON - text-only submission):
        spark_user_id: Spark's user ID
        spark_assignment_id: Spark's assignment ID
        spark_course_id: Spark's course ID
        submission_text: Student's text submission
        submitted_at: ISO timestamp
        grade: Numeric grade (optional)

    Body (multipart/form-data - with files):
        metadata: JSON string with all fields above
        file1, file2, ...: File attachments (50MB per file, 200MB total)

    Returns:
        200: Success
        400: Invalid payload
        401: Invalid signature
        404: User or task not found
        500: Server error
    """
    # Validate signature
    signature = request.headers.get('X-Spark-Signature')
    if not signature:
        logger.warning("Spark webhook missing signature")
        track_custom_event(
            event_type='spark_webhook_failed',
            event_data={
                'error_type': 'missing_signature',
                'error_message': 'Missing signature'
            }
        )
        return jsonify({'error': 'Missing signature'}), 401

    try:
        # Parse request based on content type
        content_type = request.content_type or ''

        if 'multipart/form-data' in content_type:
            # Multipart request with files
            if 'metadata' not in request.form:
                return jsonify({'error': 'Missing metadata field in multipart request'}), 400

            metadata_json = request.form['metadata']

            # Validate signature on metadata field only
            if not validate_spark_signature(metadata_json.encode('utf-8'), signature):
                logger.warning("Spark webhook invalid signature")
                track_custom_event(
                    event_type='spark_webhook_invalid_signature',
                    event_data={
                        'error_type': 'invalid_signature',
                        'error_message': 'HMAC signature validation failed'
                    }
                )
                return jsonify({'error': 'Invalid signature'}), 401

            data = json.loads(metadata_json)
            files = request.files
        else:
            # JSON request (text-only)
            if not validate_spark_signature(request.data, signature):
                logger.warning("Spark webhook invalid signature")
                track_custom_event(
                    event_type='spark_webhook_invalid_signature',
                    event_data={
                        'error_type': 'invalid_signature',
                        'error_message': 'HMAC signature validation failed'
                    }
                )
                return jsonify({'error': 'Invalid signature'}), 401

            data = request.json
            files = None

        # Validate required fields
        if not data.get('submission_text') and not files:
            return jsonify({'error': 'Must provide either submission_text or files'}), 400

        # Check for replay attacks (timestamp freshness)
        submitted_at = datetime.fromisoformat(data['submitted_at'].replace('Z', '+00:00'))
        if datetime.utcnow() - submitted_at.replace(tzinfo=None) > timedelta(minutes=5):
            logger.warning(f"Rejected old Spark webhook: {submitted_at}")
            track_custom_event(
                event_type='spark_webhook_replay_attack',
                event_data={
                    'error_type': 'old_timestamp',
                    'error_message': 'Submission timestamp too old',
                    'submitted_at': data['submitted_at'],
                    'spark_assignment_id': data.get('spark_assignment_id')
                }
            )
            return jsonify({'error': 'Submission timestamp too old'}), 400

        # Track webhook received (before processing)
        processing_start = datetime.utcnow()

        # Process submission
        result = process_spark_submission(data, files)

        # Track successful webhook processing
        processing_time_ms = int((datetime.utcnow() - processing_start).total_seconds() * 1000)

        track_custom_event(
            event_type='spark_webhook_success',
            event_data={
                'spark_assignment_id': data['spark_assignment_id'],
                'spark_course_id': data.get('spark_course_id'),
                'quest_id': result.get('quest_id'),
                'file_count': len(files) if files else 0,
                'processing_time_ms': processing_time_ms
            },
            user_id=result['user_id']
        )

        logger.info(f"Spark submission processed: assignment_id={data['spark_assignment_id']}, user_id={result['user_id']}")
        return jsonify({'status': 'success', 'completion_id': result['completion_id']}), 200

    except KeyError as e:
        logger.warning(f"Spark webhook missing field: {str(e)}")
        track_custom_event(
            event_type='spark_webhook_failed',
            event_data={
                'error_type': 'missing_field',
                'error_message': f'Missing required field: {str(e)}',
                'spark_assignment_id': data.get('spark_assignment_id') if 'data' in locals() else None
            }
        )
        return jsonify({'error': f'Missing required field: {str(e)}'}), 400
    except ValueError as e:
        logger.warning(f"Spark webhook invalid data: {str(e)}")
        error_message = str(e)
        track_custom_event(
            event_type='spark_webhook_failed',
            event_data={
                'error_type': 'user_not_found' if 'User not found' in error_message else 'quest_not_found' if 'Quest not found' in error_message else 'invalid_data',
                'error_message': error_message,
                'spark_assignment_id': data.get('spark_assignment_id') if 'data' in locals() else None
            }
        )
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Failed to process Spark webhook: {str(e)}", exc_info=True)
        track_custom_event(
            event_type='spark_webhook_failed',
            event_data={
                'error_type': 'processing_error',
                'error_message': str(e),
                'spark_assignment_id': data.get('spark_assignment_id') if 'data' in locals() else None
            }
        )
        return jsonify({'error': 'Failed to process submission'}), 500


# ============================================
# HELPER FUNCTIONS
# ============================================


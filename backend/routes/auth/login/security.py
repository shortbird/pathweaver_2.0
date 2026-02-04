"""
Login Module - Security Helpers

Account lockout, timing protection, and user initialization.
"""

from flask import request, jsonify, make_response
from database import get_supabase_client, get_supabase_admin_client
from utils.session_manager import session_manager
from middleware.rate_limiter import rate_limit
from utils.log_scrubber import mask_user_id, mask_email
from middleware.error_handler import ValidationError, AuthenticationError
from datetime import datetime, timedelta, timezone
import os
import time
import random

from utils.logger import get_logger
from config.constants import MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MINUTES
from utils.api_response_v1 import success_response, error_response
from utils.retry_handler import with_connection_retry

logger = get_logger(__name__)

def constant_time_delay(min_ms=100, max_ms=300):
    """
    Add a random delay to prevent timing attacks.
    This makes response times statistically similar regardless of whether
    an account exists or the password is correct.
    """
    time.sleep(random.randint(min_ms, max_ms) / 1000.0)


def check_account_lockout(email):
    """
    Check if account is locked due to too many failed attempts.
    Returns (is_locked, retry_after_seconds, attempt_count)
    """
    try:
        admin_client = get_supabase_admin_client()

        # Get login attempt record with retry logic for transient connection failures
        result = with_connection_retry(
            lambda: admin_client.table('login_attempts')
                .select('*')
                .eq('email', email.lower())
                .execute(),
            operation_name='check_account_lockout'
        )

        if not result.data:
            return False, 0, 0

        record = result.data[0]
        locked_until = record.get('locked_until')
        attempt_count = record.get('attempt_count', 0)

        # Check if account is currently locked
        if locked_until:
            locked_until_dt = datetime.fromisoformat(locked_until.replace('Z', '+00:00'))
            now = datetime.now(locked_until_dt.tzinfo)

            if now < locked_until_dt:
                retry_after = int((locked_until_dt - now).total_seconds())
                return True, retry_after, attempt_count

        return False, 0, attempt_count

    except Exception as e:
        logger.error(f"Error checking account lockout: {e}")
        return False, 0, 0


def record_failed_login(email):
    """
    Record a failed login attempt and lock account if threshold is reached.
    Returns (is_now_locked, attempts_remaining, lockout_duration_minutes)
    """
    try:
        admin_client = get_supabase_admin_client()

        # Get current record
        result = admin_client.table('login_attempts')\
            .select('*')\
            .eq('email', email.lower())\
            .execute()

        if not result.data:
            # Create new record
            admin_client.table('login_attempts').insert({
                'email': email.lower(),
                'attempt_count': 1,
                'locked_until': None,
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }).execute()
            return False, MAX_LOGIN_ATTEMPTS - 1, 0

        record = result.data[0]
        attempt_count = record.get('attempt_count', 0) + 1

        # Check if we should lock the account
        if attempt_count >= MAX_LOGIN_ATTEMPTS:
            locked_until = datetime.utcnow() + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
            admin_client.table('login_attempts').update({
                'attempt_count': attempt_count,
                'locked_until': locked_until.isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }).eq('email', email.lower()).execute()
            return True, 0, LOCKOUT_DURATION_MINUTES
        else:
            # Increment attempt count
            admin_client.table('login_attempts').update({
                'attempt_count': attempt_count,
                'updated_at': datetime.utcnow().isoformat()
            }).eq('email', email.lower()).execute()
            return False, MAX_LOGIN_ATTEMPTS - attempt_count, 0

    except Exception as e:
        logger.error(f"Error recording failed login: {e}")
        return False, 0, 0


def reset_login_attempts(email):
    """
    Reset login attempts after successful login.
    """
    try:
        admin_client = get_supabase_admin_client()

        admin_client.table('login_attempts').update({
            'attempt_count': 0,
            'locked_until': None,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('email', email.lower()).execute()

    except Exception as e:
        logger.error(f"Error resetting login attempts: {e}")


def ensure_user_diploma_and_skills(supabase, user_id, first_name, last_name):
    """Ensure user has diploma and skill categories initialized - OPTIMIZED"""
    try:
        # Check if diploma exists for this user
        diploma_check = supabase.table('diplomas').select('id').eq('user_id', user_id).execute()

        if not diploma_check.data:
            # Generate unique slug with better collision handling
            import re
            base_slug = re.sub(r'[^a-zA-Z0-9]', '', first_name + last_name).lower()

            # Try to create diploma with increasingly unique slugs
            for counter in range(100):
                try:
                    check_slug = base_slug if counter == 0 else f"{base_slug}{counter}"

                    # Try to insert directly - let database handle uniqueness
                    supabase.table('diplomas').insert({
                        'user_id': user_id,
                        'portfolio_slug': check_slug
                    }).execute()

                    # If successful, we're done
                    break

                except Exception as insert_error:
                    # If it's a duplicate key error, try next slug
                    if '23505' in str(insert_error) or 'duplicate' in str(insert_error).lower():
                        continue
                    else:
                        # Some other error - log it but don't fail
                        logger.error(f"Error creating diploma: {str(insert_error)}")
                        break

        # Batch insert all skill categories at once instead of checking each one
        skill_categories = ['Arts & Creativity', 'STEM & Logic', 'Life & Wellness',
                           'Language & Communication', 'Society & Culture']

        # Build all skill records to insert
        skill_records = [
            {
                'user_id': user_id,
                'pillar': pillar,
                'xp_amount': 0
            }
            for pillar in skill_categories
        ]

        # Try to insert all at once, ignore conflicts (if they already exist)
        try:
            supabase.table('user_skill_xp').upsert(skill_records, on_conflict='user_id,pillar').execute()
        except Exception as skill_error:
            # If batch insert fails, fall back to individual inserts
            logger.error(f"Batch skill insert failed: {str(skill_error)}, trying individual inserts")
            for record in skill_records:
                try:
                    supabase.table('user_skill_xp').insert(record).execute()
                except:
                    pass  # Skill already exists

    except Exception as e:
        logger.error(f"Error ensuring diploma and skills: {str(e)}")
        # Don't fail registration if this fails - the database trigger should handle it

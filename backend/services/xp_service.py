"""
XP calculation and award service for Quest V3 system.
Handles XP calculations and audit trails.

Updated January 2025: Migrated to use BaseService for consistent error handling,
retry logic, and logging patterns.
"""

from typing import Dict, List, Optional, Tuple
from datetime import datetime
from services.base_service import BaseService, ValidationError, DatabaseError
from utils.pillar_utils import is_valid_pillar
from utils.pillar_utils import normalize_pillar_name
import json

from utils.logger import get_logger

logger = get_logger(__name__)

class XPService(BaseService):
    """Service for handling XP calculations and awards."""

    def __init__(self, client=None):
        """Initialize XP service with optional database client."""
        super().__init__()
        self._client = client
        self._supabase = None

    @property
    def supabase(self):
        """Lazy-initialize database client on first use."""
        if self._supabase is None:
            if self._client:
                self._supabase = self._client
            else:
                from database import get_supabase_admin_client
                self._supabase = get_supabase_admin_client()
        return self._supabase

    def calculate_task_xp(self,
                         user_id: str,
                         task_id: str,
                         quest_id: str,
                         base_xp: int) -> int:
        """
        Calculate XP for a task completion.
        Returns the base task XP value.

        Args:
            user_id: User completing the task
            task_id: Task being completed
            quest_id: Quest containing the task
            base_xp: Base XP amount for the task

        Returns:
            Final XP amount (equals base_xp)
        """
        final_xp = base_xp

        # Log XP calculation for audit
        self._log_xp_calculation(user_id, task_id, base_xp, final_xp)

        return final_xp
    
    def award_xp(self,
                 user_id: str,
                 pillar: str,
                 xp_amount: int,
                 source: str = 'task_completion') -> bool:
        """
        Award XP to a user for a specific pillar.

        Args:
            user_id: User receiving XP
            pillar: Skill pillar for XP
            xp_amount: Amount of XP to award
            source: Source of XP (for tracking)

        Returns:
            True if successful, False otherwise

        Raises:
            ValidationError: If inputs are invalid
            DatabaseError: If database operation fails
        """
        # Validate required fields
        self.validate_required(user_id=user_id, pillar=pillar)

        if not isinstance(xp_amount, int) or xp_amount <= 0:
            raise ValidationError(f"xp_amount must be positive integer, got: {xp_amount}")

        logger.debug(f"=== XP SERVICE AWARD DEBUG ===")
        logger.info(f"User: {user_id}, Pillar: {pillar}, Amount: {xp_amount}, Source: {source}")

        # Normalize pillar input (handles display names, old keys, etc.)
        # Updated January 2025: New single-word pillar names
        original_pillar = pillar

        try:
            # Normalize to new single-word format (art, stem, communication, civics, wellness)
            db_pillar = normalize_pillar_name(pillar)
            logger.info(f"Mapped pillar from '{original_pillar}' to database key '{db_pillar}' for storage")
        except ValueError as e:
            raise ValidationError(f"Invalid pillar name: {pillar} - {str(e)}")

        # Validate that we have a valid pillar for storage
        self.validate_one_of('pillar', db_pillar, ['art', 'stem', 'wellness', 'communication', 'civics'])
        
        try:
            # NOTE: For atomic increment, run the migration:
            #   psql $DATABASE_URL -f backend/migrations/20260215_create_atomic_xp_increment.sql
            # Then switch to RPC call: self.supabase.rpc('increment_user_xp', {...})

            # Current approach: read-modify-write with upsert for new records
            current_xp = self.supabase.table('user_skill_xp')\
                .select('id, xp_amount')\
                .eq('user_id', user_id)\
                .eq('pillar', db_pillar)\
                .execute()

            if current_xp.data:
                existing_record = current_xp.data[0]
                existing_xp = existing_record.get('xp_amount', 0)
                new_total = existing_xp + xp_amount
                record_id = existing_record.get('id')

                logger.info(f"Updating XP: {existing_xp} + {xp_amount} = {new_total}")

                result = self.supabase.table('user_skill_xp')\
                    .update({
                        'xp_amount': new_total,
                        'updated_at': datetime.utcnow().isoformat()
                    })\
                    .eq('id', record_id)\
                    .execute()
            else:
                logger.info(f"Creating new XP record for {db_pillar} with {xp_amount} XP")
                result = self.supabase.table('user_skill_xp')\
                    .upsert({
                        'user_id': user_id,
                        'pillar': db_pillar,
                        'xp_amount': xp_amount,
                        'updated_at': datetime.utcnow().isoformat()
                    }, on_conflict='user_id,pillar')\
                    .execute()

            # Create audit log entry
            self._create_xp_audit_log(user_id, pillar, xp_amount, source)

            # Update user mastery level
            self.update_user_mastery(user_id)

            logger.info(f"XP award success: {bool(result.data)}")
            logger.info("===============================")

            return bool(result.data)
            
        except Exception as e:
            logger.error(f"Error awarding XP: {str(e)}")
            logger.error(f"Error type: {type(e).__name__}")
            import traceback
            logger.info(f"Traceback: {traceback.format_exc()}")
            return False
    
    def get_user_total_xp(self, user_id: str) -> Dict[str, int]:
        """
        Get total XP for a user across all pillars.

        Args:
            user_id: User ID

        Returns:
            Dictionary of pillar -> xp_amount using current pillar keys
            (art, stem, communication, civics, wellness)
        """
        try:
            xp_data = self.supabase.table('user_skill_xp')\
                .select('pillar, xp_amount')\
                .eq('user_id', user_id)\
                .execute()

            # Initialize result with zeros for all current pillar keys
            result = {
                'art': 0,
                'stem': 0,
                'communication': 0,
                'civics': 0,
                'wellness': 0
            }

            if xp_data.data:
                for item in xp_data.data:
                    db_pillar = item['pillar']
                    xp_amount = item['xp_amount'] or 0

                    # Normalize any legacy pillar names to current format
                    try:
                        normalized_pillar = normalize_pillar_name(db_pillar)
                        if normalized_pillar in result:
                            result[normalized_pillar] += xp_amount
                        else:
                            logger.warning(f"Unknown pillar '{normalized_pillar}' for user {user_id}")
                    except ValueError:
                        logger.warning(f"Could not normalize pillar '{db_pillar}' for user {user_id}")

            return result

        except Exception as e:
            logger.error(f"Error getting user XP: {str(e)}")
            return {
                'art': 0,
                'stem': 0,
                'communication': 0,
                'civics': 0,
                'wellness': 0
            }
    
    def get_leaderboard(self, pillar: Optional[str] = None, limit: int = 10) -> List[Dict]:
        """
        Get XP leaderboard for a specific pillar or overall.
        
        Args:
            pillar: Specific pillar to filter by (None for overall)
            limit: Number of users to return
            
        Returns:
            List of user data with XP rankings
        """
        try:
            if pillar:
                # Get top users for specific pillar
                leaderboard = self.supabase.table('user_skill_xp')\
                    .select('user_id, xp_amount, users(username, avatar_url)')\
                    .eq('pillar', pillar)\
                    .order('xp_amount', desc=True)\
                    .limit(limit)\
                    .execute()
            else:
                # Get overall leaderboard by summing all XP
                # Note: This would be better as a database view or function
                all_xp = self.supabase.table('user_skill_xp')\
                    .select('user_id, xp_amount')\
                    .execute()

                if all_xp.data:
                    # Sum XP per user
                    user_totals = {}
                    for record in all_xp.data:
                        uid = record['user_id']
                        if uid not in user_totals:
                            user_totals[uid] = 0
                        user_totals[uid] += record['xp_amount']

                    # Sort and limit
                    sorted_users = sorted(user_totals.items(), key=lambda x: x[1], reverse=True)[:limit]

                    # Batch fetch all user details in one query (avoid N+1)
                    user_ids = [uid for uid, _ in sorted_users]
                    users_response = self.supabase.table('users')\
                        .select('id, username, avatar_url')\
                        .in_('id', user_ids)\
                        .execute()

                    # Build lookup map
                    users_by_id = {u['id']: {'username': u.get('username'), 'avatar_url': u.get('avatar_url')}
                                   for u in (users_response.data or [])}

                    # Assemble leaderboard in sorted order
                    leaderboard_data = []
                    for uid, total_xp in sorted_users:
                        user_info = users_by_id.get(uid)
                        if user_info:
                            leaderboard_data.append({
                                'user_id': uid,
                                'xp_amount': total_xp,
                                'users': user_info
                            })

                    return leaderboard_data
            
            return leaderboard.data if leaderboard.data else []
            
        except Exception as e:
            logger.error(f"Error getting leaderboard: {str(e)}")
            return []
    
    def _log_xp_calculation(self,
                           user_id: str,
                           task_id: str,
                           base_xp: int,
                           final_xp: int):
        """Log XP calculation for audit purposes."""
        log_data = {
            'user_id': user_id,
            'task_id': task_id,
            'base_xp': base_xp,
            'final_xp': final_xp,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # In production, this would write to an audit log table
        # For now, just log to console
        logger.info(f"XP Calculation: {json.dumps(log_data)}")
    
    def update_user_mastery(self, user_id: str) -> Optional[int]:
        """
        Update user's mastery level based on total XP.
        
        Args:
            user_id: User to update
            
        Returns:
            New mastery level or None if error
        """
        try:
            # Get total XP across all pillars
            xp_records = self.supabase.table('user_skill_xp')\
                .select('xp_amount')\
                .eq('user_id', user_id)\
                .execute()
            
            total_xp = sum(record.get('xp_amount', 0) for record in xp_records.data) if xp_records.data else 0
            
            # Simple level calculation (or remove if not needed)
            mastery_level = 1
            
            # Check if user_mastery record exists
            existing = self.supabase.table('user_mastery')\
                .select('id')\
                .eq('user_id', user_id)\
                .execute()
            
            if existing.data:
                # Update existing record
                self.supabase.table('user_mastery')\
                    .update({
                        'total_xp': total_xp,
                        'mastery_level': mastery_level,
                        'last_updated': datetime.utcnow().isoformat()
                    })\
                    .eq('user_id', user_id)\
                    .execute()
            else:
                # Create new record
                self.supabase.table('user_mastery')\
                    .insert({
                        'user_id': user_id,
                        'total_xp': total_xp,
                        'mastery_level': mastery_level
                    })\
                    .execute()
            
            logger.info(f"Updated mastery for user {user_id}: Level {mastery_level} (Total XP: {total_xp})")
            return mastery_level
            
        except Exception as e:
            logger.error(f"Error updating user mastery: {str(e)}")
            return None
    
    def _create_xp_audit_log(self, 
                            user_id: str, 
                            pillar: str, 
                            xp_amount: int, 
                            source: str):
        """Create an audit log entry for XP awards."""
        audit_data = {
            'user_id': user_id,
            'pillar': pillar,
            'xp_amount': xp_amount,
            'source': source,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # In production, this would write to an audit log table
        # For now, just log to console
        logger.info(f"XP Award Audit: {json.dumps(audit_data)}")
    
    def validate_xp_integrity(self, user_id: str) -> bool:
        """
        Validate that a user's XP totals are consistent.
        Used to detect potential XP manipulation.

        Args:
            user_id: User to validate

        Returns:
            True if XP appears valid, False if inconsistencies detected
        """
        try:
            # Get all completed tasks for user (join to get xp_value and pillar from user_quest_tasks)
            completed_tasks = self.supabase.table('quest_task_completions')\
                .select('task_id, user_quest_tasks(xp_value, pillar)')\
                .eq('user_id', user_id)\
                .execute()

            if not completed_tasks.data:
                return True  # No tasks completed yet

            # Calculate expected XP per pillar (using simplified pillar keys)
            expected_xp = {
                'stem': 0,
                'wellness': 0,
                'communication': 0,
                'civics': 0,
                'art': 0
            }

            for task in completed_tasks.data:
                user_task = task.get('user_quest_tasks')
                if user_task:
                    raw_pillar = user_task.get('pillar', 'stem')
                    xp = user_task.get('xp_value', 0) or 0
                    # Normalize pillar name to current format
                    try:
                        pillar = normalize_pillar_name(raw_pillar)
                    except ValueError:
                        pillar = 'stem'  # Default fallback
                    if pillar in expected_xp:
                        expected_xp[pillar] += xp

            # Get actual XP from user_skill_xp
            actual_xp = self.get_user_total_xp(user_id)

            # Check for discrepancies
            for pillar, expected in expected_xp.items():
                actual = actual_xp.get(pillar, 0)
                if actual != expected:
                    logger.info(f"XP discrepancy for user {user_id}, pillar {pillar}: expected {expected}, actual {actual}")
                    return False

            return True

        except Exception as e:
            logger.error(f"Error validating XP integrity: {str(e)}")
            return False

    def finalize_subject_xp(self,
                           user_id: str,
                           school_subject: str,
                           completion_id: str) -> int:
        """
        Finalize pending subject XP for a user.
        Moves XP from pending_xp to xp_amount when student confirms ready work.

        Args:
            user_id: User receiving finalized XP
            school_subject: The school subject (normalized)
            completion_id: The task completion being finalized

        Returns:
            New total finalized XP for the subject

        Raises:
            ValueError: If no pending XP found
        """
        try:
            # Get current XP record
            record = self.supabase.table('user_subject_xp')\
                .select('id, xp_amount, pending_xp')\
                .eq('user_id', user_id)\
                .eq('school_subject', school_subject)\
                .single()\
                .execute()

            if not record.data:
                raise ValueError(f"No XP record found for user {user_id}, subject {school_subject}")

            current_data = record.data
            pending_xp = current_data.get('pending_xp', 0) or 0

            if pending_xp <= 0:
                logger.info(f"No pending XP to finalize for {school_subject}")
                return current_data.get('xp_amount', 0)

            # Move pending to finalized
            new_finalized = (current_data.get('xp_amount', 0) or 0) + pending_xp

            self.supabase.table('user_subject_xp')\
                .update({
                    'xp_amount': new_finalized,
                    'pending_xp': 0,
                    'updated_at': datetime.utcnow().isoformat()
                })\
                .eq('id', current_data['id'])\
                .execute()

            logger.info(f"Finalized {pending_xp} XP for user {user_id}, subject {school_subject}. New total: {new_finalized}")

            return new_finalized

        except Exception as e:
            logger.error(f"Error finalizing subject XP: {str(e)}")
            raise
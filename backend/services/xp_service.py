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
from utils.pillar_mapping import normalize_pillar_name
import json

from utils.logger import get_logger

logger = get_logger(__name__)

class XPService(BaseService):
    """Service for handling XP calculations and awards."""
    
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
            # Check current XP for this pillar
            current_xp = self.supabase.table('user_skill_xp')\
                .select('*')\
                .eq('user_id', user_id)\
                .eq('pillar', db_pillar)\
                .execute()
            
            logger.info(f"Current XP records found: {len(current_xp.data) if current_xp.data else 0}")
            if current_xp.data:
                logger.info(f"Existing record: {current_xp.data[0]}")
            
            if current_xp.data:
                # Update existing XP record - use 'xp_amount' column
                existing_record = current_xp.data[0]
                existing_xp = existing_record.get('xp_amount', 0)
                new_total = existing_xp + xp_amount
                
                logger.info(f"Updating XP: {existing_xp} + {xp_amount} = {new_total}")
                
                # Use the record ID for a more reliable update
                record_id = existing_record.get('id')
                if record_id:
                    result = self.supabase.table('user_skill_xp')\
                        .update({
                            'xp_amount': new_total,
                            'updated_at': datetime.utcnow().isoformat()
                        })\
                        .eq('id', record_id)\
                        .execute()
                else:
                    # Fallback to composite key update
                    result = self.supabase.table('user_skill_xp')\
                        .update({
                            'xp_amount': new_total,
                            'updated_at': datetime.utcnow().isoformat()
                        })\
                        .eq('user_id', user_id)\
                        .eq('pillar', db_pillar)\
                        .execute()
                
                logger.info(f"Update result: {result.data}")
            else:
                # Create new XP record - use 'pillar' and 'xp_amount' columns
                logger.info(f"Creating new XP record for {db_pillar} with {xp_amount} XP")
                result = self.supabase.table('user_skill_xp')\
                    .insert({
                        'user_id': user_id,
                        'pillar': db_pillar,
                        'xp_amount': xp_amount,
                        'updated_at': datetime.utcnow().isoformat()
                    })\
                    .execute()
                logger.info(f"Insert result: {result.data}")
            
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
            Dictionary of pillar -> xp_amount
        """
        try:
            xp_data = self.supabase.table('user_skill_xp')\
                .select('pillar, xp_amount')\
                .eq('user_id', user_id)\
                .execute()
            
            if xp_data.data:
                # Handle pillar key normalization - convert old keys to new ones
                pillar_mapping = {
                    'creativity': 'arts_creativity',
                    'critical_thinking': 'stem_logic',
                    'practical_skills': 'life_wellness',
                    'communication': 'language_communication',
                    'cultural_literacy': 'society_culture'
                }
                
                result = {}
                for item in xp_data.data:
                    old_pillar = item['pillar']
                    new_pillar = pillar_mapping.get(old_pillar, old_pillar)
                    result[new_pillar] = item['xp_amount']
                    
                return result
            
            # Return zeros for all pillars if no data (using new pillar keys)
            return {
                'arts_creativity': 0,
                'stem_logic': 0,
                'life_wellness': 0,
                'language_communication': 0,
                'society_culture': 0
            }
            
        except Exception as e:
            logger.error(f"Error getting user XP: {str(e)}")
            return {}
    
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
                        user_id = record['user_id']
                        if user_id not in user_totals:
                            user_totals[user_id] = 0
                        user_totals[user_id] += record['xp_amount']
                    
                    # Sort and limit
                    sorted_users = sorted(user_totals.items(), key=lambda x: x[1], reverse=True)[:limit]
                    
                    # Fetch user details
                    leaderboard_data = []
                    for user_id, total_xp in sorted_users:
                        user_info = self.supabase.table('users')\
                            .select('username, avatar_url')\
                            .eq('id', user_id)\
                            .single()\
                            .execute()
                        
                        if user_info.data:
                            leaderboard_data.append({
                                'user_id': user_id,
                                'xp_amount': total_xp,
                                'users': user_info.data
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
            # Get all completed tasks for user
            completed_tasks = self.supabase.table('user_quest_tasks')\
                .select('xp_awarded, quest_task_id, quest_tasks(xp_amount, pillar)')\
                .eq('user_id', user_id)\
                .execute()
            
            if not completed_tasks.data:
                return True  # No tasks completed yet
            
            # Calculate expected XP per pillar (using new pillar keys)
            expected_xp = {
                'arts_creativity': 0,
                'stem_logic': 0,
                'life_wellness': 0,
                'language_communication': 0,
                'society_culture': 0
            }
            
            # Pillar mapping for normalization
            pillar_mapping = {
                'creativity': 'arts_creativity',
                'critical_thinking': 'stem_logic',
                'practical_skills': 'life_wellness',
                'communication': 'language_communication',
                'cultural_literacy': 'society_culture'
            }
            
            for task in completed_tasks.data:
                if task.get('quest_tasks'):
                    old_pillar = task['quest_tasks']['pillar']
                    new_pillar = pillar_mapping.get(old_pillar, old_pillar)
                    if new_pillar in expected_xp:
                        expected_xp[new_pillar] += task['xp_awarded']
            
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
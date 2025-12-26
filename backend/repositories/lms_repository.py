"""
LMS Repository

Handles all database operations related to LMS integrations, sessions, and grade sync.
"""

from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta
from repositories.base_repository import BaseRepository, NotFoundError
from utils.logger import get_logger

logger = get_logger(__name__)


class LMSRepository(BaseRepository):
    """Repository for LMS integration operations."""

    table_name = 'lms_integrations'

    def find_by_user(self, user_id: str, lms_platform: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get all LMS integrations for a user.

        Args:
            user_id: User ID
            lms_platform: Optional platform filter (canvas, google_classroom, schoology, moodle)

        Returns:
            List of LMS integrations
        """
        try:
            query = self.client.table(self.table_name)\
                .select('*')\
                .eq('user_id', user_id)

            if lms_platform:
                query = query.eq('lms_platform', lms_platform)

            query = query.order('created_at', desc=True)

            result = query.execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching LMS integrations for user {user_id}: {e}")
            return []

    def create_integration(self, user_id: str, lms_platform: str, lms_user_id: str, lms_course_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Create a new LMS integration.

        Args:
            user_id: User ID
            lms_platform: LMS platform (canvas, google_classroom, schoology, moodle)
            lms_user_id: LMS-specific user ID
            lms_course_id: Optional LMS course ID

        Returns:
            Created integration record
        """
        valid_platforms = ['canvas', 'google_classroom', 'schoology', 'moodle']
        if lms_platform not in valid_platforms:
            raise ValueError(f"Invalid LMS platform. Must be one of: {', '.join(valid_platforms)}")

        try:
            data = {
                'user_id': user_id,
                'lms_platform': lms_platform,
                'lms_user_id': lms_user_id,
                'lms_course_id': lms_course_id,
                'sync_enabled': True,
                'sync_status': 'active',
                'last_sync_at': datetime.utcnow().isoformat(),
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }

            result = self.client.table(self.table_name)\
                .insert(data)\
                .execute()

            if not result.data:
                raise ValueError("Failed to create LMS integration")

            logger.info(f"Created LMS integration for user {user_id} on platform {lms_platform}")
            return result.data[0]
        except Exception as e:
            logger.error(f"Error creating LMS integration: {e}")
            raise

    def update_sync_status(self, integration_id: str, sync_status: str, last_sync_at: Optional[str] = None) -> Dict[str, Any]:
        """
        Update sync status for an integration.

        Args:
            integration_id: Integration ID
            sync_status: Sync status (active, paused, error)
            last_sync_at: Optional last sync timestamp

        Returns:
            Updated integration record
        """
        try:
            data = {
                'sync_status': sync_status,
                'updated_at': datetime.utcnow().isoformat()
            }

            if last_sync_at:
                data['last_sync_at'] = last_sync_at

            result = self.client.table(self.table_name)\
                .update(data)\
                .eq('id', integration_id)\
                .execute()

            if not result.data:
                raise NotFoundError(f"Integration {integration_id} not found")

            logger.info(f"Updated sync status for integration {integration_id} to {sync_status}")
            return result.data[0]
        except Exception as e:
            logger.error(f"Error updating sync status for integration {integration_id}: {e}")
            raise

    def create_session(self, user_id: str, lms_platform: str, session_token: str, expires_at: str) -> Dict[str, Any]:
        """
        Create an LMS session (LTI session tracking).

        Args:
            user_id: User ID
            lms_platform: LMS platform
            session_token: Session token
            expires_at: Expiration timestamp

        Returns:
            Created session record
        """
        try:
            data = {
                'user_id': user_id,
                'lms_platform': lms_platform,
                'session_token': session_token,
                'expires_at': expires_at,
                'created_at': datetime.utcnow().isoformat()
            }

            result = self.client.table('lms_sessions')\
                .insert(data)\
                .execute()

            if not result.data:
                raise ValueError("Failed to create LMS session")

            logger.info(f"Created LMS session for user {user_id} on platform {lms_platform}")
            return result.data[0]
        except Exception as e:
            logger.error(f"Error creating LMS session: {e}")
            raise

    def find_session(self, session_token: str) -> Optional[Dict[str, Any]]:
        """
        Find an LMS session by token.

        Args:
            session_token: Session token

        Returns:
            Session record or None if not found or expired
        """
        try:
            result = self.client.table('lms_sessions')\
                .select('*')\
                .eq('session_token', session_token)\
                .gt('expires_at', datetime.utcnow().isoformat())\
                .single()\
                .execute()

            return result.data if result.data else None
        except Exception as e:
            logger.error(f"Error finding LMS session: {e}")
            return None

    def create_grade_sync(self, user_id: str, quest_id: str, lms_platform: str, lms_assignment_id: str, score: float, max_score: float = 100) -> Dict[str, Any]:
        """
        Create a grade sync record (queue for grade passback).

        Args:
            user_id: User ID
            quest_id: Quest ID
            lms_platform: LMS platform
            lms_assignment_id: LMS assignment ID
            score: Score to sync
            max_score: Maximum possible score

        Returns:
            Created grade sync record
        """
        try:
            data = {
                'user_id': user_id,
                'quest_id': quest_id,
                'lms_platform': lms_platform,
                'lms_assignment_id': lms_assignment_id,
                'score': score,
                'max_score': max_score,
                'sync_status': 'pending',
                'sync_attempts': 0,
                'created_at': datetime.utcnow().isoformat()
            }

            result = self.client.table('lms_grade_sync')\
                .insert(data)\
                .execute()

            if not result.data:
                raise ValueError("Failed to create grade sync record")

            logger.info(f"Created grade sync record for user {user_id}, quest {quest_id}")
            return result.data[0]
        except Exception as e:
            logger.error(f"Error creating grade sync record: {e}")
            raise

    def get_pending_grade_syncs(self, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Get all pending grade syncs (for background processing).

        Args:
            limit: Maximum number of syncs to return

        Returns:
            List of pending grade sync records
        """
        try:
            result = self.client.table('lms_grade_sync')\
                .select('*')\
                .eq('sync_status', 'pending')\
                .order('created_at', desc=False)\
                .limit(limit)\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching pending grade syncs: {e}")
            return []

    def update_grade_sync_status(self, sync_id: str, sync_status: str, error_message: Optional[str] = None) -> Dict[str, Any]:
        """
        Update grade sync status.

        Args:
            sync_id: Grade sync ID
            sync_status: Sync status (pending, completed, failed)
            error_message: Optional error message

        Returns:
            Updated grade sync record
        """
        try:
            data = {
                'sync_status': sync_status,
                'last_attempt_at': datetime.utcnow().isoformat()
            }

            if sync_status == 'completed':
                data['synced_at'] = datetime.utcnow().isoformat()

            if error_message:
                data['error_message'] = error_message

            # Increment sync attempts
            result = self.client.table('lms_grade_sync')\
                .select('sync_attempts')\
                .eq('id', sync_id)\
                .single()\
                .execute()

            if result.data:
                data['sync_attempts'] = result.data['sync_attempts'] + 1

            update_result = self.client.table('lms_grade_sync')\
                .update(data)\
                .eq('id', sync_id)\
                .execute()

            if not update_result.data:
                raise NotFoundError(f"Grade sync {sync_id} not found")

            logger.info(f"Updated grade sync {sync_id} to status {sync_status}")
            return update_result.data[0]
        except Exception as e:
            logger.error(f"Error updating grade sync status for {sync_id}: {e}")
            raise

    def get_failed_grade_syncs(self, hours: int = 24) -> List[Dict[str, Any]]:
        """
        Get all failed grade syncs within a time window.

        Args:
            hours: Number of hours to look back

        Returns:
            List of failed grade sync records
        """
        try:
            since = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

            result = self.client.table('lms_grade_sync')\
                .select('*')\
                .eq('sync_status', 'failed')\
                .gte('created_at', since)\
                .order('created_at', desc=True)\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching failed grade syncs: {e}")
            return []

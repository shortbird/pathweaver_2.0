"""
LMS Sync Service

Handles roster synchronization, assignment import, and grade passback for LMS platforms.
Supports OneRoster CSV format for bulk user imports.
"""

import csv
from io import StringIO
from database import get_supabase_admin_client
from flask import current_app


class LMSSyncService:
    """Service for syncing rosters and grades with LMS"""

    def sync_roster_from_oneroster(self, csv_content, lms_platform):
        """
        Import student roster from OneRoster CSV format

        Args:
            csv_content: CSV file content as string
            lms_platform: Platform name (canvas, google_classroom, etc.)

        Returns:
            Dict with sync results
        """
        users_created = 0
        users_updated = 0
        errors = []

        try:
            reader = csv.DictReader(StringIO(csv_content))

            for row in reader:
                try:
                    user_data = {
                        'lms_user_id': row['sourcedId'],
                        'email': row['email'],
                        'first_name': row.get('givenName', 'Student'),
                        'last_name': row.get('familyName', ''),
                        'role': self._map_oneroster_role(row.get('role', 'student')),
                        'lms_platform': lms_platform
                    }

                    # Create or update user
                    user, created = self._create_or_update_user(user_data)

                    if created:
                        users_created += 1
                    else:
                        users_updated += 1

                except Exception as e:
                    errors.append(f"Row {row.get('sourcedId', 'unknown')}: {str(e)}")

        except Exception as e:
            errors.append(f"CSV parsing error: {str(e)}")

        return {
            'users_created': users_created,
            'users_updated': users_updated,
            'errors': errors
        }

    def _map_oneroster_role(self, role):
        """
        Map OneRoster role to Optio role

        Args:
            role: OneRoster role string

        Returns:
            Optio role string
        """
        role_mapping = {
            'student': 'student',
            'teacher': 'advisor',
            'administrator': 'admin',
            'parent': 'parent',
            'aide': 'observer'
        }

        return role_mapping.get(role.lower(), 'student')

    def _create_or_update_user(self, user_data):
        """
        Create or update user from roster data

        Args:
            user_data: Dict with user information

        Returns:
            Tuple of (user, created) where created is boolean
        """
        try:
            supabase = get_supabase_admin_client()

            # Check if user exists by LMS user ID
            existing_user = supabase.table('users').select('*').eq(
                'lms_user_id', user_data['lms_user_id']
            ).execute()

            if existing_user.data:
                # Update existing user
                user_id = existing_user.data[0]['id']
                supabase.table('users').update({
                    'email': user_data['email'],
                    'first_name': user_data['first_name'],
                    'last_name': user_data['last_name'],
                    'role': user_data['role'],
                    'lms_platform': user_data['lms_platform'],
                    'last_active': 'now()'
                }).eq('id', user_id).execute()

                return existing_user.data[0], False
            else:
                # Check if user exists by email (merge account)
                existing_email = supabase.table('users').select('*').eq(
                    'email', user_data['email']
                ).execute()

                if existing_email.data:
                    # Link existing email account to LMS
                    user_id = existing_email.data[0]['id']
                    supabase.table('users').update({
                        'lms_user_id': user_data['lms_user_id'],
                        'lms_platform': user_data['lms_platform']
                    }).eq('id', user_id).execute()

                    return existing_email.data[0], False
                else:
                    # Create new user
                    new_user = {
                        'email': user_data['email'],
                        'first_name': user_data['first_name'],
                        'last_name': user_data['last_name'],
                        'lms_user_id': user_data['lms_user_id'],
                        'lms_platform': user_data['lms_platform'],
                        'role': user_data['role'],
                        'sso_provider': 'lms',
                        'created_at': 'now()'
                    }

                    result = supabase.table('users').insert(new_user).execute()
                    return result.data[0] if result.data else None, True

        except Exception as e:
            current_app.logger.error(f"Error creating/updating user: {e}")
            raise

    def sync_lms_assignment_to_quest(self, lms_assignment_data):
        """
        Convert LMS assignment to Optio quest

        Args:
            lms_assignment_data: Dict with assignment information

        Returns:
            Created quest object or None
        """
        try:
            supabase = get_supabase_admin_client()

            # Check if quest already exists for this LMS assignment
            existing = supabase.table('quests').select('*').eq(
                'lms_assignment_id', lms_assignment_data['id']
            ).execute()

            if existing.data:
                current_app.logger.info(f"Quest already exists for LMS assignment {lms_assignment_data['id']}")
                return existing.data[0]

            # Create new quest
            quest_data = {
                'title': lms_assignment_data['name'],
                'description': lms_assignment_data.get('description', ''),
                'source': 'lms',
                'lms_course_id': lms_assignment_data['course_id'],
                'lms_assignment_id': lms_assignment_data['id'],
                'lms_platform': lms_assignment_data['platform'],
                'is_active': True,
                'created_at': 'now()'
            }

            result = supabase.table('quests').insert(quest_data).execute()
            return result.data[0] if result.data else None

        except Exception as e:
            current_app.logger.error(f"Error syncing LMS assignment to quest: {e}")
            return None

    def sync_quest_completion_to_lms(self, user_id, quest_id):
        """
        Push quest completion as grade to LMS

        Args:
            user_id: Optio user ID
            quest_id: Quest ID

        Returns:
            Boolean indicating if grade was queued for sync
        """
        try:
            supabase = get_supabase_admin_client()

            # Get quest info
            quest = supabase.table('quests').select('*').eq('id', quest_id).single().execute()

            if not quest.data or quest.data['source'] != 'lms':
                current_app.logger.info(f"Quest {quest_id} is not an LMS quest")
                return False

            # Get user's LMS integration
            integration = supabase.table('lms_integrations').select('*').eq(
                'user_id', user_id
            ).eq('lms_platform', quest.data['lms_platform']).single().execute()

            if not integration.data:
                current_app.logger.error(f"No LMS integration for user {user_id}")
                return False

            # Calculate score (100% if completed)
            score = 100

            # Queue for grade sync
            self.queue_grade_sync(
                user_id=user_id,
                quest_id=quest_id,
                lms_platform=quest.data['lms_platform'],
                lms_assignment_id=quest.data['lms_assignment_id'],
                score=score
            )

            return True

        except Exception as e:
            current_app.logger.error(f"Error syncing quest completion to LMS: {e}")
            return False

    def queue_grade_sync(self, user_id, quest_id, lms_platform, lms_assignment_id, score, max_score=100):
        """
        Queue a grade for syncing to LMS

        Args:
            user_id: User ID
            quest_id: Quest ID
            lms_platform: Platform identifier
            lms_assignment_id: LMS assignment ID
            score: Score value
            max_score: Maximum score (default 100)

        Returns:
            Boolean indicating success
        """
        try:
            supabase = get_supabase_admin_client()

            supabase.table('lms_grade_sync').insert({
                'user_id': user_id,
                'quest_id': quest_id,
                'lms_platform': lms_platform,
                'lms_assignment_id': lms_assignment_id,
                'score': score,
                'max_score': max_score,
                'sync_status': 'pending',
                'sync_attempts': 0,
                'created_at': 'now()'
            }).execute()

            return True

        except Exception as e:
            current_app.logger.error(f"Error queuing grade sync: {e}")
            return False

    def get_pending_grade_syncs(self, limit=100):
        """
        Get pending grade syncs for processing

        Args:
            limit: Maximum number of records to return

        Returns:
            List of pending grade sync records
        """
        try:
            supabase = get_supabase_admin_client()

            result = supabase.table('lms_grade_sync').select('*').eq(
                'sync_status', 'pending'
            ).order('created_at').limit(limit).execute()

            return result.data

        except Exception as e:
            current_app.logger.error(f"Error fetching pending grade syncs: {e}")
            return []

    def mark_grade_sync_complete(self, sync_id):
        """
        Mark a grade sync as completed

        Args:
            sync_id: Grade sync record ID

        Returns:
            Boolean indicating success
        """
        try:
            supabase = get_supabase_admin_client()

            supabase.table('lms_grade_sync').update({
                'sync_status': 'completed',
                'synced_at': 'now()'
            }).eq('id', sync_id).execute()

            return True

        except Exception as e:
            current_app.logger.error(f"Error marking grade sync complete: {e}")
            return False

    def mark_grade_sync_failed(self, sync_id, error_message):
        """
        Mark a grade sync as failed

        Args:
            sync_id: Grade sync record ID
            error_message: Error message

        Returns:
            Boolean indicating success
        """
        try:
            supabase = get_supabase_admin_client()

            supabase.table('lms_grade_sync').update({
                'sync_status': 'failed',
                'sync_attempts': supabase.table('lms_grade_sync').select('sync_attempts').eq('id', sync_id).single().execute().data['sync_attempts'] + 1,
                'error_message': error_message,
                'last_attempt_at': 'now()'
            }).eq('id', sync_id).execute()

            return True

        except Exception as e:
            current_app.logger.error(f"Error marking grade sync failed: {e}")
            return False

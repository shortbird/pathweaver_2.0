"""
Portfolio service for managing diploma and portfolio data aggregation.

Orchestrates multiple repositories for portfolio-related operations including:
- Diploma management (creation, visibility, consent)
- Portfolio data aggregation (quests, evidence, XP breakdown)
- FERPA compliance (minor status, parent approval)
"""

from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, date
import re
import logging

from database import get_supabase_admin_client
from repositories import UserRepository, QuestRepository

logger = logging.getLogger(__name__)


class PortfolioService:
    """
    Service for portfolio/diploma data operations.
    Uses admin client since this handles public/cross-user data.
    """

    def __init__(self, client=None):
        self.client = client or get_supabase_admin_client()

    # =========================================================================
    # DIPLOMA MANAGEMENT
    # =========================================================================

    def get_diploma_by_slug(self, portfolio_slug: str) -> Optional[Dict[str, Any]]:
        """Get diploma record by portfolio slug."""
        result = self.client.table('diplomas').select('*').eq(
            'portfolio_slug', portfolio_slug
        ).execute()
        return result.data[0] if result.data else None

    def get_diploma_by_user_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get diploma record by user ID."""
        result = self.client.table('diplomas').select('*').eq(
            'user_id', user_id
        ).execute()
        return result.data[0] if result.data else None

    def get_or_create_diploma(self, user_id: str) -> Dict[str, Any]:
        """
        Get existing diploma or create one with auto-generated slug.

        Args:
            user_id: User ID to get/create diploma for

        Returns:
            Diploma record dict
        """
        # Try to get existing diploma
        diploma = self.get_diploma_by_user_id(user_id)
        if diploma:
            return diploma

        # Get user data to generate slug
        user_data = self.client.table('users').select(
            'first_name, last_name'
        ).eq('id', user_id).execute()

        if not user_data.data:
            # No user found, create minimal diploma
            return self._create_diploma_with_slug(user_id, f"user{user_id[:8]}")

        # Generate portfolio slug from name
        first_name = user_data.data[0].get('first_name', '') or ''
        last_name = user_data.data[0].get('last_name', '') or ''
        base_slug = re.sub(r'[^a-zA-Z0-9]', '', first_name + last_name).lower()

        if not base_slug:
            base_slug = user_id[:8]

        # Make slug unique
        slug = self._generate_unique_slug(base_slug, user_id)

        return self._create_diploma_with_slug(user_id, slug)

    def _generate_unique_slug(self, base_slug: str, user_id: str) -> str:
        """Generate a unique portfolio slug."""
        slug = base_slug
        counter = 0

        while counter <= 100:
            check_slug = slug if counter == 0 else f"{slug}{counter}"
            existing = self.client.table('diplomas').select('id').eq(
                'portfolio_slug', check_slug
            ).execute()

            if not existing.data:
                return check_slug
            counter += 1

        # Fallback to user ID suffix
        return f"{base_slug}{user_id[:8]}"

    def _create_diploma_with_slug(self, user_id: str, slug: str) -> Dict[str, Any]:
        """Create diploma record with given slug."""
        try:
            result = self.client.table('diplomas').insert({
                'user_id': user_id,
                'portfolio_slug': slug
            }).execute()
            return result.data[0] if result.data else {
                'portfolio_slug': slug,
                'issued_date': None,
                'is_public': True
            }
        except Exception as e:
            logger.error(f"Error creating diploma: {e}")
            return {
                'portfolio_slug': slug,
                'issued_date': None,
                'is_public': True
            }

    # =========================================================================
    # PORTFOLIO DATA AGGREGATION
    # =========================================================================

    def get_user_basic_info(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get basic user info for portfolio display (non-sensitive)."""
        result = self.client.table('users').select(
            'id, first_name, last_name'
        ).eq('id', user_id).execute()
        return result.data[0] if result.data else None

    def get_completed_quests(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all completed quests with quest details."""
        result = self.client.table('user_quests').select('''
            id,
            completed_at,
            quests:quests!inner(id, title, description, big_idea)
        ''').eq('user_id', user_id).not_.is_('completed_at', 'null').order(
            'completed_at', desc=True
        ).execute()
        return result.data or []

    def get_in_progress_quests(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all in-progress quests with at least one task submitted."""
        result = self.client.table('user_quests').select('''
            id,
            started_at,
            is_active,
            quests:quests!inner(id, title, description, big_idea)
        ''').eq('user_id', user_id).eq('is_active', True).is_(
            'completed_at', 'null'
        ).order('started_at', desc=True).execute()
        return result.data or []

    def get_approved_tasks(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all approved tasks for a user."""
        result = self.client.table('user_quest_tasks').select('''
            id,
            title,
            pillar,
            quest_id,
            user_quest_id,
            xp_value,
            approval_status,
            updated_at,
            diploma_subjects
        ''').eq('user_id', user_id).eq('approval_status', 'approved').execute()
        return result.data or []

    def get_task_completions(self, user_id: str) -> List[Dict[str, Any]]:
        """Get task completions with associated task info (legacy evidence source)."""
        result = self.client.table('quest_task_completions').select('''
            *,
            user_quest_tasks!inner(title, pillar, quest_id, user_quest_id, xp_value)
        ''').eq('user_id', user_id).execute()
        return result.data or []

    def get_skill_xp(self, user_id: str) -> Dict[str, int]:
        """
        Get XP breakdown by skill category/pillar.

        Returns:
            Dict mapping pillar name to XP amount
        """
        result = self.client.table('user_skill_xp').select('*').eq(
            'user_id', user_id
        ).execute()

        xp_by_category = {}
        for record in (result.data or []):
            category = record.get('pillar', record.get('skill_category'))
            xp = record.get('xp_amount', record.get('total_xp', 0))
            if category:
                xp_by_category[category] = xp

        return xp_by_category

    def calculate_xp_from_tasks(self, approved_tasks: List[Dict]) -> Tuple[Dict[str, int], int]:
        """
        Calculate XP breakdown from approved tasks.

        Args:
            approved_tasks: List of approved task records

        Returns:
            Tuple of (xp_by_category dict, total_xp int)
        """
        xp_by_category = {}
        total_xp = 0

        for task in approved_tasks:
            pillar = task.get('pillar')
            xp = task.get('xp_value', 0) or 0
            if pillar:
                xp_by_category[pillar] = xp_by_category.get(pillar, 0) + xp
                total_xp += xp

        return xp_by_category, total_xp

    def get_subject_xp(self, user_id: str) -> List[Dict[str, Any]]:
        """Get XP breakdown by school subject for diploma credits."""
        result = self.client.table('user_subject_xp').select(
            'school_subject, xp_amount'
        ).eq('user_id', user_id).execute()
        return result.data or []

    def calculate_subject_xp_from_tasks(
        self, approved_tasks: List[Dict]
    ) -> List[Dict[str, Any]]:
        """
        Calculate subject XP from approved tasks' diploma_subjects.

        Args:
            approved_tasks: List of approved task records with diploma_subjects

        Returns:
            List of {school_subject, xp_amount} dicts
        """
        subject_xp_map = {}

        for task in approved_tasks:
            diploma_subjects = task.get('diploma_subjects')
            task_xp = task.get('xp_value', 0) or 0

            if not diploma_subjects or not task_xp:
                continue

            # Handle dict format: {'Math': 75, 'Science': 25}
            if isinstance(diploma_subjects, dict):
                for subject, percentage in diploma_subjects.items():
                    normalized = subject.lower().replace(' ', '_').replace('&', 'and')
                    subject_xp = int(task_xp * percentage / 100)
                    subject_xp_map[normalized] = subject_xp_map.get(normalized, 0) + subject_xp

            # Handle array format: ['Electives'] - split XP evenly
            elif isinstance(diploma_subjects, list) and diploma_subjects:
                per_subject_xp = task_xp // len(diploma_subjects)
                for subject in diploma_subjects:
                    normalized = subject.lower().replace(' ', '_').replace('&', 'and')
                    subject_xp_map[normalized] = subject_xp_map.get(normalized, 0) + per_subject_xp

        return [
            {'school_subject': subject, 'xp_amount': xp}
            for subject, xp in subject_xp_map.items()
        ]

    def get_transfer_credits(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get transfer credits data formatted for diploma display."""
        result = self.client.table('transfer_credits').select('*').eq(
            'user_id', user_id
        ).execute()

        if not result.data:
            return None

        tc = result.data[0]
        XP_PER_CREDIT = 2000
        subject_credits = {}
        total_tc_credits = 0
        subject_xp_tc = tc.get('subject_xp', {})

        for subject, xp in subject_xp_tc.items():
            credits = xp / XP_PER_CREDIT
            subject_credits[subject] = credits
            total_tc_credits += credits

        return {
            'id': tc.get('id'),
            'school_name': tc.get('school_name'),
            'transcript_url': tc.get('transcript_url'),
            'notes': tc.get('notes'),
            'subject_xp': subject_xp_tc,
            'subject_credits': subject_credits,
            'total_xp': tc.get('total_xp', 0),
            'total_credits': total_tc_credits,
            'created_at': tc.get('created_at')
        }

    def get_skill_details(self, user_id: str) -> List[Dict[str, Any]]:
        """Get skill details (times practiced) for a user."""
        result = self.client.table('user_skill_details').select('*').eq(
            'user_id', user_id
        ).execute()
        return result.data or []

    def calculate_skill_details_from_quests(
        self, completed_quests: List[Dict]
    ) -> List[Dict[str, Any]]:
        """
        Calculate skill details from completed quests' core_skills.

        Args:
            completed_quests: List of completed quest records with nested quest data

        Returns:
            List of {skill_name, times_practiced} dicts
        """
        skill_details_map = {}

        for quest_record in completed_quests:
            quest = quest_record.get('quests', {})
            core_skills = quest.get('core_skills', [])
            if core_skills and isinstance(core_skills, list):
                for skill in core_skills:
                    skill_details_map[skill] = skill_details_map.get(skill, 0) + 1

        return [
            {'skill_name': skill, 'times_practiced': count}
            for skill, count in skill_details_map.items()
        ]

    # =========================================================================
    # EVIDENCE HANDLING
    # =========================================================================

    def get_evidence_documents(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get all completed evidence documents with blocks for a user.

        Returns:
            List of evidence document records with nested blocks
        """
        result = self.client.table('user_task_evidence_documents').select('''
            id,
            task_id,
            quest_id,
            user_id,
            status,
            completed_at,
            is_confidential,
            evidence_document_blocks (
                id,
                block_type,
                content,
                order_index,
                is_private
            )
        ''').eq('user_id', user_id).eq('status', 'completed').execute()
        return result.data or []

    def build_evidence_map(
        self,
        evidence_documents: List[Dict],
        filter_private: bool = True
    ) -> Dict[str, Dict[str, Any]]:
        """
        Build lookup map of evidence documents by task_id.

        Args:
            evidence_documents: List of evidence document records
            filter_private: If True, exclude private blocks

        Returns:
            Dict mapping task_id to evidence info
        """
        evidence_docs_map = {}

        for doc in evidence_documents:
            task_id = doc.get('task_id')
            if not task_id:
                continue

            all_blocks = doc.get('evidence_document_blocks', [])

            if filter_private:
                blocks = [b for b in all_blocks if not b.get('is_private', False)]
            else:
                blocks = all_blocks

            # Only add if there are displayable blocks
            if blocks:
                evidence_docs_map[task_id] = {
                    'document_id': doc.get('id'),
                    'blocks': sorted(blocks, key=lambda b: b.get('order_index', 0)),
                    'completed_at': doc.get('completed_at'),
                    'is_confidential': doc.get('is_confidential', False),
                    'owner_user_id': doc.get('user_id')
                }

        return evidence_docs_map

    def fetch_evidence_blocks_by_document_id(
        self,
        document_id: str,
        filter_private: bool = True
    ) -> Tuple[List[Dict], bool, Optional[str]]:
        """
        Fetch evidence blocks directly by document ID (fallback method).

        Args:
            document_id: UUID of user_task_evidence_documents record
            filter_private: If True, exclude private blocks

        Returns:
            Tuple of (blocks list, is_confidential boolean, owner_user_id)
        """
        try:
            query = self.client.table('user_task_evidence_documents').select('''
                id,
                user_id,
                is_confidential,
                evidence_document_blocks!inner (
                    id, block_type, content, order_index, is_private
                )
            ''').eq('id', document_id)

            if filter_private:
                query = query.eq('evidence_document_blocks.is_private', False)

            result = query.execute()

            if result.data and len(result.data) > 0:
                doc = result.data[0]
                blocks = doc.get('evidence_document_blocks', [])
                sorted_blocks = sorted(blocks, key=lambda b: b.get('order_index', 0))
                return sorted_blocks, doc.get('is_confidential', False), doc.get('user_id')

            return [], False, None

        except Exception as e:
            logger.error(f"Error fetching evidence blocks for document {document_id}: {e}")
            return [], False, None

    @staticmethod
    def parse_document_id_from_evidence_text(evidence_text: str) -> Optional[str]:
        """
        Extract document ID from multi-format evidence placeholder string.

        Args:
            evidence_text: Text from quest_task_completions.evidence_text

        Returns:
            Document UUID if found, None otherwise
        """
        if evidence_text and evidence_text.startswith('Multi-format evidence document'):
            match = re.search(r'Document ID: ([\w-]+)', evidence_text)
            if match:
                return match.group(1)
        return None

    def build_completions_maps(
        self, task_completions: List[Dict], approved_tasks: List[Dict]
    ) -> Tuple[Dict[str, List], Dict[str, List]]:
        """
        Build lookup maps for task completions by quest_id and user_quest_id.

        Args:
            task_completions: List from quest_task_completions
            approved_tasks: List from user_quest_tasks

        Returns:
            Tuple of (completions_by_quest, completions_by_user_quest)
        """
        completions_by_quest = {}
        completions_by_user_quest = {}

        # Process quest_task_completions (legacy with evidence data)
        for tc in task_completions:
            task_info = tc.get('user_quest_tasks')
            quest_id = None
            user_quest_id = None

            if task_info and isinstance(task_info, dict):
                quest_id = task_info.get('quest_id')
                user_quest_id = task_info.get('user_quest_id')
            elif task_info and isinstance(task_info, list) and len(task_info) > 0:
                task_info_dict = task_info[0]
                quest_id = task_info_dict.get('quest_id')
                user_quest_id = task_info_dict.get('user_quest_id')
                tc = {**tc, 'user_quest_tasks': task_info_dict}

            if quest_id:
                completions_by_quest.setdefault(quest_id, []).append(tc)
            if user_quest_id:
                completions_by_user_quest.setdefault(user_quest_id, []).append(tc)

        # If no completions from quest_task_completions, use approved_tasks
        if not completions_by_quest and approved_tasks:
            for task in approved_tasks:
                quest_id = task.get('quest_id')
                user_quest_id = task.get('user_quest_id')

                tc = {
                    'task_id': task.get('id'),
                    'completed_at': task.get('updated_at'),
                    'user_quest_tasks': {
                        'title': task.get('title'),
                        'pillar': task.get('pillar'),
                        'quest_id': quest_id,
                        'user_quest_id': user_quest_id,
                        'xp_value': task.get('xp_value', 0)
                    }
                }

                if quest_id:
                    completions_by_quest.setdefault(quest_id, []).append(tc)
                if user_quest_id:
                    completions_by_user_quest.setdefault(user_quest_id, []).append(tc)

        return completions_by_quest, completions_by_user_quest

    def get_task_counts_by_user_quest(
        self, user_quest_ids: List[str]
    ) -> Dict[str, int]:
        """
        Get task counts for multiple user quests in a single query.

        Args:
            user_quest_ids: List of user_quest IDs

        Returns:
            Dict mapping user_quest_id to task count
        """
        if not user_quest_ids:
            return {}

        result = self.client.table('user_quest_tasks').select(
            'user_quest_id'
        ).in_('user_quest_id', user_quest_ids).execute()

        counts = {}
        for task in (result.data or []):
            uq_id = task.get('user_quest_id')
            if uq_id:
                counts[uq_id] = counts.get(uq_id, 0) + 1

        return counts

    # =========================================================================
    # FERPA COMPLIANCE
    # =========================================================================

    @staticmethod
    def check_is_minor(user_data: Dict[str, Any]) -> bool:
        """
        Check if a user is considered a minor (under 18 OR is_dependent=true).
        Used for FERPA parental consent requirements.

        Args:
            user_data: Dict containing user fields (is_dependent, date_of_birth)

        Returns:
            True if user is a minor, False otherwise
        """
        if user_data.get('is_dependent') is True:
            return True

        dob = user_data.get('date_of_birth')
        if not dob:
            return False

        try:
            if isinstance(dob, str):
                dob = datetime.strptime(dob.split('T')[0], '%Y-%m-%d').date()
            elif hasattr(dob, 'date'):
                dob = dob.date()

            age = (date.today() - dob).days / 365.25
            return age < 18
        except Exception as e:
            logger.warning(f"Error parsing date_of_birth: {e}")
            return False

    def get_visibility_status(self, user_id: str) -> Dict[str, Any]:
        """
        Get portfolio visibility status including consent and minor status.

        Returns:
            Dict with visibility status, consent info, minor status, parent info
        """
        # Get user info
        user_result = self.client.table('users').select(
            'id, date_of_birth, is_dependent, managed_by_parent_id, first_name'
        ).eq('id', user_id).execute()

        if not user_result.data:
            return {'error': 'User not found'}

        user_data = user_result.data[0]
        is_minor = self.check_is_minor(user_data)

        # Get diploma info
        try:
            diploma_result = self.client.table('diplomas').select(
                'is_public, public_consent_given, public_consent_given_at, '
                'pending_parent_approval, parent_approval_denied, parent_approval_denied_at'
            ).eq('user_id', user_id).execute()
            diploma_data = diploma_result.data[0] if diploma_result.data else {}
        except Exception:
            diploma_result = self.client.table('diplomas').select(
                'is_public'
            ).eq('user_id', user_id).execute()
            diploma_data = diploma_result.data[0] if diploma_result.data else {}
            diploma_data['public_consent_given'] = diploma_data.get('is_public', False)
            diploma_data['pending_parent_approval'] = False
            diploma_data['parent_approval_denied'] = False

        # Get parent info if minor
        parent_info = None
        if is_minor:
            parent_info = self._get_parent_info(user_id, user_data)

        # Check for pending request
        pending_request = None
        if is_minor and diploma_data.get('pending_parent_approval'):
            pending_request = self._get_pending_visibility_request(user_id)

        return {
            'is_public': diploma_data.get('is_public', False),
            'consent_given': diploma_data.get('public_consent_given', False),
            'consent_given_at': diploma_data.get('public_consent_given_at'),
            'is_minor': is_minor,
            'requires_parent_approval': is_minor,
            'pending_parent_approval': diploma_data.get('pending_parent_approval', False),
            'pending_request': pending_request,
            'parent_approval_denied': diploma_data.get('parent_approval_denied', False),
            'parent_approval_denied_at': diploma_data.get('parent_approval_denied_at'),
            'parent_info': parent_info,
            'can_make_public': not is_minor or parent_info is not None
        }

    def _get_parent_info(
        self, user_id: str, user_data: Dict
    ) -> Optional[Dict[str, Any]]:
        """Get parent info for a minor user."""
        parent_id = user_data.get('managed_by_parent_id')

        if parent_id:
            parent_result = self.client.table('users').select(
                'first_name, email'
            ).eq('id', parent_id).execute()
            if parent_result.data:
                return {
                    'first_name': parent_result.data[0].get('first_name'),
                    'has_email': bool(parent_result.data[0].get('email'))
                }

        # Check parent_student_links table
        link_result = self.client.table('parent_student_links').select(
            'parent_user_id'
        ).eq('student_user_id', user_id).eq('status', 'approved').limit(1).execute()

        if link_result.data:
            parent_link_id = link_result.data[0].get('parent_user_id')
            if parent_link_id:
                parent_result = self.client.table('users').select(
                    'first_name, email'
                ).eq('id', parent_link_id).execute()
                if parent_result.data:
                    return {
                        'first_name': parent_result.data[0].get('first_name'),
                        'has_email': bool(parent_result.data[0].get('email'))
                    }

        return None

    def _get_pending_visibility_request(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get pending visibility request for a user."""
        try:
            req_result = self.client.table('public_visibility_requests').select(
                'id, requested_at'
            ).eq('student_user_id', user_id).eq('status', 'pending').limit(1).execute()

            if req_result.data:
                return {
                    'id': req_result.data[0]['id'],
                    'requested_at': req_result.data[0]['requested_at']
                }
        except Exception:
            pass

        return None

    def find_parent_id(self, user_id: str, user_data: Dict) -> Optional[str]:
        """
        Find parent ID for a user.

        Args:
            user_id: Student user ID
            user_data: User data dict with managed_by_parent_id

        Returns:
            Parent user ID if found, None otherwise
        """
        parent_id = user_data.get('managed_by_parent_id')
        if parent_id:
            return parent_id

        # Check parent_student_links
        link_result = self.client.table('parent_student_links').select(
            'parent_user_id'
        ).eq('student_user_id', user_id).eq('status', 'approved').limit(1).execute()

        if link_result.data:
            return link_result.data[0].get('parent_user_id')

        return None

    def make_portfolio_private(self, user_id: str) -> Dict[str, Any]:
        """
        Make a portfolio private (immediate, always allowed).

        Args:
            user_id: User ID

        Returns:
            Result dict with success info
        """
        try:
            self.client.table('diplomas').update({
                'is_public': False,
                'pending_parent_approval': False
            }).eq('user_id', user_id).execute()
        except Exception:
            self.client.table('diplomas').update({
                'is_public': False
            }).eq('user_id', user_id).execute()

        # Cancel pending visibility requests
        try:
            self.client.table('public_visibility_requests').update({
                'status': 'denied',
                'responded_at': datetime.utcnow().isoformat(),
                'denial_reason': 'User made portfolio private'
            }).eq('student_user_id', user_id).eq('status', 'pending').execute()
        except Exception:
            pass

        return {'success': True, 'is_public': False}

    def make_portfolio_public_adult(self, user_id: str) -> Dict[str, Any]:
        """
        Make portfolio public for an adult user (immediate consent).

        Args:
            user_id: User ID

        Returns:
            Result dict with success info
        """
        try:
            result = self.client.table('diplomas').update({
                'is_public': True,
                'public_consent_given': True,
                'public_consent_given_at': datetime.utcnow().isoformat(),
                'public_consent_given_by': user_id,
                'pending_parent_approval': False,
                'parent_approval_denied': False
            }).eq('user_id', user_id).execute()

            if result.data:
                return {'success': True, 'is_public': True, 'consent_given': True}
        except Exception:
            # Fall back if new columns don't exist
            result = self.client.table('diplomas').update({
                'is_public': True
            }).eq('user_id', user_id).execute()

            if result.data:
                return {'success': True, 'is_public': True}

        return {'success': False, 'error': 'Failed to update'}

    def create_parent_approval_request(
        self, user_id: str, parent_id: str
    ) -> Dict[str, Any]:
        """
        Create a parent approval request for making portfolio public.

        Args:
            user_id: Student user ID
            parent_id: Parent user ID

        Returns:
            Result dict with request info or error
        """
        # Check for existing pending request
        existing = self.client.table('public_visibility_requests').select(
            'id'
        ).eq('student_user_id', user_id).eq('status', 'pending').execute()

        if existing.data:
            return {'error': 'REQUEST_PENDING', 'message': 'Request already pending'}

        # Check if recently denied (within 30 days)
        diploma_result = self.client.table('diplomas').select(
            'parent_approval_denied, parent_approval_denied_at'
        ).eq('user_id', user_id).execute()

        if diploma_result.data:
            diploma = diploma_result.data[0]
            if diploma.get('parent_approval_denied') and diploma.get('parent_approval_denied_at'):
                denied_at = datetime.fromisoformat(
                    diploma['parent_approval_denied_at'].replace('Z', '+00:00')
                )
                days_since = (datetime.now(denied_at.tzinfo) - denied_at).days
                if days_since < 30:
                    return {
                        'error': 'REQUEST_DENIED_RECENTLY',
                        'message': f'Denied {days_since} days ago. Try again in {30 - days_since} days.',
                        'days_until_retry': 30 - days_since
                    }

        # Create request
        self.client.table('public_visibility_requests').insert({
            'student_user_id': user_id,
            'parent_user_id': parent_id,
            'status': 'pending',
            'requested_at': datetime.utcnow().isoformat()
        }).execute()

        # Update diploma status
        self.client.table('diplomas').update({
            'pending_parent_approval': True,
            'parent_approval_denied': False,
            'parent_approval_denied_at': None
        }).eq('user_id', user_id).execute()

        # Get parent name
        parent_result = self.client.table('users').select(
            'first_name'
        ).eq('id', parent_id).execute()
        parent_name = parent_result.data[0]['first_name'] if parent_result.data else 'your parent'

        return {
            'success': True,
            'pending_parent_approval': True,
            'parent_name': parent_name
        }

    # =========================================================================
    # HIGH-LEVEL AGGREGATION METHODS
    # =========================================================================

    def get_portfolio_summary(self, user_id: str) -> Dict[str, Any]:
        """
        Get portfolio summary data for user portfolio page.

        Args:
            user_id: User ID

        Returns:
            Dict with diploma, user info, XP data, quest counts
        """
        diploma = self.get_or_create_diploma(user_id)
        user_data = self.get_user_basic_info(user_id) or {'id': user_id}
        skill_xp = self.get_skill_xp(user_id)
        completed_quests = self.get_completed_quests(user_id)

        total_xp = sum(skill_xp.values())

        return {
            'diploma': diploma,
            'user': user_data,
            'skill_xp': [
                {'pillar': k, 'xp_amount': v} for k, v in skill_xp.items()
            ],
            'total_quests_completed': len(completed_quests),
            'total_xp': total_xp,
            'portfolio_url': f"https://optio.com/portfolio/{diploma.get('portfolio_slug')}"
        }

    def get_public_portfolio_data(self, portfolio_slug: str) -> Dict[str, Any]:
        """
        Get public portfolio data by slug.

        Args:
            portfolio_slug: Portfolio slug

        Returns:
            Dict with portfolio data or error
        """
        diploma = self.get_diploma_by_slug(portfolio_slug)

        if not diploma or not diploma.get('is_public'):
            return {'error': 'Portfolio not found or private'}

        user_id = diploma['user_id']
        user_data = self.get_user_basic_info(user_id)

        if not user_data:
            return {'error': 'User not found'}

        completed_quests = self.get_completed_quests(user_id)
        skill_xp = self.get_skill_xp(user_id)
        skill_details = self.get_skill_details(user_id)

        if not skill_details and completed_quests:
            skill_details = self.calculate_skill_details_from_quests(completed_quests)

        total_xp = sum(skill_xp.values())

        return {
            'student': user_data,
            'diploma_issued': diploma.get('issued_date'),
            'completed_quests': completed_quests,
            'skill_xp': [
                {'skill_category': k, 'total_xp': v} for k, v in skill_xp.items()
            ],
            'skill_details': skill_details,
            'total_quests_completed': len(completed_quests),
            'total_xp': total_xp,
            'portfolio_url': f"https://optio.com/portfolio/{portfolio_slug}"
        }

    def get_diploma_data(
        self,
        user_id: str,
        viewer_user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get full diploma data for diploma page.

        Args:
            user_id: User whose diploma to fetch
            viewer_user_id: User viewing the diploma (for access check)

        Returns:
            Dict with diploma data including achievements, XP, evidence
        """
        # Get user info
        user_data = self.get_user_basic_info(user_id)
        if not user_data:
            return {'error': 'User not found'}

        # Check access
        diploma = self.get_diploma_by_user_id(user_id)
        is_public = diploma.get('is_public', False) if diploma else False

        if not is_public and viewer_user_id != user_id:
            return {'error': 'Portfolio not found or private'}

        # Fetch all data
        completed_quests = self.get_completed_quests(user_id)
        in_progress_quests = self.get_in_progress_quests(user_id)
        approved_tasks = self.get_approved_tasks(user_id)
        task_completions = self.get_task_completions(user_id)
        evidence_documents = self.get_evidence_documents(user_id)

        # Build maps
        evidence_map = self.build_evidence_map(evidence_documents, filter_private=True)
        completions_by_quest, completions_by_user_quest = self.build_completions_maps(
            task_completions, approved_tasks
        )

        # Calculate XP
        xp_by_category, total_xp = self.calculate_xp_from_tasks(approved_tasks)
        if total_xp == 0:
            xp_by_category = self.get_skill_xp(user_id)
            total_xp = sum(xp_by_category.values())

        # Get subject XP
        subject_xp = self.get_subject_xp(user_id)
        if not subject_xp and approved_tasks:
            subject_xp = self.calculate_subject_xp_from_tasks(approved_tasks)

        # Get transfer credits
        transfer_credits = self.get_transfer_credits(user_id)

        # Get task counts for in-progress quests
        user_quest_ids = [q.get('id') for q in in_progress_quests if q.get('id')]
        task_counts = self.get_task_counts_by_user_quest(user_quest_ids)

        # Build achievements
        achievements = self._build_achievements(
            completed_quests=completed_quests,
            in_progress_quests=in_progress_quests,
            completions_by_quest=completions_by_quest,
            completions_by_user_quest=completions_by_user_quest,
            evidence_map=evidence_map,
            task_counts=task_counts,
            user_id=user_id
        )

        return {
            'student': user_data,
            'achievements': achievements,
            'skill_xp': xp_by_category,
            'subject_xp': subject_xp,
            'total_xp': total_xp,
            'total_quests_completed': len([a for a in achievements if a.get('status') == 'completed']),
            'transfer_credits': transfer_credits
        }

    def _build_achievements(
        self,
        completed_quests: List[Dict],
        in_progress_quests: List[Dict],
        completions_by_quest: Dict[str, List],
        completions_by_user_quest: Dict[str, List],
        evidence_map: Dict[str, Dict],
        task_counts: Dict[str, int],
        user_id: str
    ) -> List[Dict[str, Any]]:
        """Build achievements list from quests and evidence."""
        achievements = []

        # Add completed quests
        for cq in completed_quests:
            quest = cq.get('quests')
            if not quest:
                continue

            quest_id = quest.get('id')
            quest_completions = completions_by_quest.get(quest_id, [])

            task_evidence, total_xp = self._process_quest_evidence(
                quest_completions, evidence_map, user_id
            )

            if task_evidence:
                achievements.append({
                    'quest': quest,
                    'completed_at': cq['completed_at'],
                    'task_evidence': task_evidence,
                    'total_xp_earned': total_xp,
                    'status': 'completed'
                })

        # Add in-progress quests with submitted tasks
        for cq in in_progress_quests:
            quest = cq.get('quests')
            if not quest:
                continue

            user_quest_id = cq.get('id')
            quest_completions = completions_by_user_quest.get(user_quest_id, [])

            if not quest_completions:
                continue

            task_evidence, total_xp = self._process_quest_evidence(
                quest_completions, evidence_map, user_id
            )

            total_tasks = task_counts.get(user_quest_id, 0)
            completed_tasks = len(task_evidence)

            achievements.append({
                'quest': quest,
                'started_at': cq['started_at'],
                'task_evidence': task_evidence,
                'total_xp_earned': total_xp,
                'status': 'in_progress',
                'progress': {
                    'completed_tasks': completed_tasks,
                    'total_tasks': total_tasks,
                    'percentage': (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
                }
            })

        # Sort by date
        achievements.sort(
            key=lambda x: x.get('completed_at') or x.get('started_at'),
            reverse=True
        )

        return achievements

    def _process_quest_evidence(
        self,
        quest_completions: List[Dict],
        evidence_map: Dict[str, Dict],
        user_id: str
    ) -> Tuple[Dict[str, Dict], int]:
        """
        Process task completions into evidence dict.

        Returns:
            Tuple of (task_evidence dict, total_xp int)
        """
        task_evidence = {}
        total_xp = 0

        for tc in quest_completions:
            task_info = tc.get('user_quest_tasks', {})
            task_title = task_info.get('title', 'Unknown Task')
            task_id = tc.get('task_id')
            task_xp = task_info.get('xp_value', 0)
            total_xp += task_xp

            # Check for multi-format evidence
            evidence_doc = evidence_map.get(task_id)

            if evidence_doc and evidence_doc.get('blocks'):
                task_evidence[task_title] = {
                    'evidence_type': 'multi_format',
                    'evidence_blocks': evidence_doc['blocks'],
                    'xp_awarded': task_xp,
                    'completed_at': tc.get('completed_at'),
                    'pillar': task_info.get('pillar', 'Arts & Creativity'),
                    'is_legacy': False,
                    'is_confidential': evidence_doc.get('is_confidential', False),
                    'owner_user_id': evidence_doc.get('owner_user_id')
                }
            else:
                # Legacy evidence handling
                evidence_text = tc.get('evidence_text', '')
                evidence_url = tc.get('evidence_url', '')

                # Check for document ID in text
                document_id = self.parse_document_id_from_evidence_text(evidence_text)
                if document_id:
                    blocks, is_conf, owner = self.fetch_evidence_blocks_by_document_id(
                        document_id, filter_private=True
                    )
                    if blocks:
                        task_evidence[task_title] = {
                            'evidence_type': 'multi_format',
                            'evidence_blocks': blocks,
                            'xp_awarded': task_xp,
                            'completed_at': tc.get('completed_at'),
                            'pillar': task_info.get('pillar', 'Arts & Creativity'),
                            'is_legacy': False,
                            'is_confidential': is_conf,
                            'owner_user_id': owner
                        }
                        continue

                # Standard legacy evidence
                is_confidential = tc.get('is_confidential', False)

                if evidence_text and not evidence_text.startswith('Multi-format'):
                    evidence_type = 'text'
                    evidence_content = evidence_text
                elif evidence_url:
                    evidence_type = 'link'
                    evidence_content = evidence_url
                else:
                    evidence_type = 'text'
                    evidence_content = 'No evidence submitted for this task'

                task_evidence[task_title] = {
                    'evidence_type': evidence_type,
                    'evidence_content': evidence_content,
                    'xp_awarded': task_xp,
                    'completed_at': tc.get('completed_at'),
                    'pillar': task_info.get('pillar', 'Arts & Creativity'),
                    'is_legacy': True,
                    'is_confidential': is_confidential,
                    'owner_user_id': user_id
                }

        return task_evidence, total_xp

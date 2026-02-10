"""
Evidence Report Service

Handles creation, retrieval, and management of shareable evidence reports.
These reports allow students to share selected quest/course evidence with
anyone via a public URL.

FERPA Compliance:
- Minors (is_dependent=true or age < 18) require parent approval for public reports
- Confidential evidence is automatically filtered from public view
- Private evidence blocks are excluded from reports
"""

import secrets
from typing import Dict, List, Optional, Any
from datetime import datetime

from services.base_service import BaseService, ValidationError, NotFoundError, PermissionError
from utils.logger import get_logger
from supabase import create_client
from app_config import Config

logger = get_logger(__name__)


class EvidenceReportService(BaseService):
    """Manages shareable evidence reports."""

    def __init__(self, supabase=None):
        """Initialize with optional supabase client."""
        super().__init__()
        # Always create a fresh client to avoid Flask g context issues
        self.supabase = supabase or create_client(
            Config.SUPABASE_URL,
            Config.SUPABASE_SERVICE_ROLE_KEY
        )

    def create_report(
        self,
        user_id: str,
        title: str = 'Evidence Report',
        description: Optional[str] = None,
        included_quest_ids: Optional[List[str]] = None,
        included_course_ids: Optional[List[str]] = None,
        include_learning_events: bool = False,
        include_xp_summary: bool = True,
        include_skills_breakdown: bool = True
    ) -> Dict[str, Any]:
        """
        Create a new evidence report configuration.

        Args:
            user_id: Student's user ID
            title: Report title
            description: Optional description
            included_quest_ids: List of quest UUIDs to include
            included_course_ids: List of course UUIDs to include
            include_learning_events: Whether to include learning events
            include_xp_summary: Whether to include XP summary
            include_skills_breakdown: Whether to include skills breakdown

        Returns:
            Created report config with access_token

        Raises:
            ValidationError: If no quests or courses selected
        """
        self.validate_required(user_id=user_id)

        if not included_quest_ids and not included_course_ids:
            raise ValidationError("Must select at least one quest or course")

        try:
            # Generate unique access token
            access_token = secrets.token_urlsafe(32)

            # Check if user is a minor (requires parent approval)
            user_data = self._get_user_data(user_id)
            is_minor = self._check_is_minor(user_data)

            # Determine parent approval status
            requires_parent_approval = is_minor
            parent_approval_status = 'pending' if is_minor else 'not_required'

            # Create report config
            report_data = {
                'user_id': user_id,
                'access_token': access_token,
                'title': title,
                'description': description,
                'included_quest_ids': included_quest_ids or [],
                'included_course_ids': included_course_ids or [],
                'include_learning_events': include_learning_events,
                'include_xp_summary': include_xp_summary,
                'include_skills_breakdown': include_skills_breakdown,
                'requires_parent_approval': requires_parent_approval,
                'parent_approval_status': parent_approval_status,
                'is_active': True
            }

            result = self.supabase.table('evidence_report_configs')\
                .insert(report_data)\
                .execute()

            report = result.data[0] if result.data else None

            if not report:
                raise Exception("Failed to create report config")

            # If minor, create parent approval request
            if is_minor:
                self._create_parent_approval_request(report['id'], user_id, user_data)

            logger.info(f"Created evidence report for user {user_id[:8]}: {report['id']}")
            return report

        except Exception as e:
            logger.error(f"Error creating evidence report: {str(e)}")
            raise

    def get_user_reports(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get all reports created by a user.

        Args:
            user_id: Student's user ID

        Returns:
            List of report configs
        """
        try:
            result = self.supabase.table('evidence_report_configs')\
                .select('*')\
                .eq('user_id', user_id)\
                .eq('is_active', True)\
                .order('created_at', desc=True)\
                .execute()

            return result.data or []

        except Exception as e:
            logger.error(f"Error fetching user reports: {str(e)}")
            raise

    def get_report_by_id(self, report_id: str, user_id: str) -> Dict[str, Any]:
        """
        Get a specific report by ID (owner only).

        Args:
            report_id: Report config UUID
            user_id: Requesting user's ID (must be owner)

        Returns:
            Report config with analytics

        Raises:
            NotFoundError: If report not found
            PermissionError: If user is not the owner
        """
        try:
            result = self.supabase.table('evidence_report_configs')\
                .select('*')\
                .eq('id', report_id)\
                .single()\
                .execute()

            report = result.data
            if not report:
                raise NotFoundError("Report not found")

            if report['user_id'] != user_id:
                raise PermissionError("You don't have permission to view this report")

            return report

        except NotFoundError:
            raise
        except PermissionError:
            raise
        except Exception as e:
            logger.error(f"Error fetching report: {str(e)}")
            raise NotFoundError("Report not found")

    def update_report(
        self,
        report_id: str,
        user_id: str,
        **updates
    ) -> Dict[str, Any]:
        """
        Update a report configuration.

        Args:
            report_id: Report config UUID
            user_id: Requesting user's ID (must be owner)
            **updates: Fields to update (title, description, included_quest_ids, etc.)

        Returns:
            Updated report config

        Raises:
            NotFoundError: If report not found
            PermissionError: If user is not the owner
        """
        # Verify ownership
        report = self.get_report_by_id(report_id, user_id)

        # Filter allowed updates
        allowed_fields = {
            'title', 'description', 'included_quest_ids', 'included_course_ids',
            'include_learning_events', 'include_xp_summary', 'include_skills_breakdown'
        }
        update_data = {k: v for k, v in updates.items() if k in allowed_fields}

        if not update_data:
            return report

        try:
            result = self.supabase.table('evidence_report_configs')\
                .update(update_data)\
                .eq('id', report_id)\
                .execute()

            logger.info(f"Updated evidence report {report_id[:8]}")
            return result.data[0] if result.data else report

        except Exception as e:
            logger.error(f"Error updating report: {str(e)}")
            raise

    def deactivate_report(self, report_id: str, user_id: str) -> bool:
        """
        Deactivate (soft delete) a report.

        Args:
            report_id: Report config UUID
            user_id: Requesting user's ID (must be owner)

        Returns:
            True if successful

        Raises:
            NotFoundError: If report not found
            PermissionError: If user is not the owner
        """
        # Verify ownership
        self.get_report_by_id(report_id, user_id)

        try:
            self.supabase.table('evidence_report_configs')\
                .update({'is_active': False})\
                .eq('id', report_id)\
                .execute()

            logger.info(f"Deactivated evidence report {report_id[:8]}")
            return True

        except Exception as e:
            logger.error(f"Error deactivating report: {str(e)}")
            raise

    def get_public_report(self, access_token: str) -> Dict[str, Any]:
        """
        Get report data for public viewing (no auth required).

        Args:
            access_token: URL-safe token for report access

        Returns:
            Report data with evidence

        Raises:
            NotFoundError: If report not found or inactive
            PermissionError: If report requires pending parent approval
        """
        try:
            # Get report config - use limit(1) instead of single() to avoid exception on no results
            result = self.supabase.table('evidence_report_configs')\
                .select('*')\
                .eq('access_token', access_token)\
                .eq('is_active', True)\
                .limit(1)\
                .execute()

            if not result.data or len(result.data) == 0:
                logger.warning(f"No report found for token: {access_token[:8]}...")
                raise NotFoundError("Report not found")

            report = result.data[0]

            # Check parent approval for minors
            if report['requires_parent_approval']:
                if report['parent_approval_status'] == 'pending':
                    raise PermissionError("This report is pending parent approval")
                elif report['parent_approval_status'] == 'denied':
                    raise PermissionError("This report has been denied by parent")

            # Increment view count
            self._increment_view_count(report['id'])

            # Fetch evidence data
            report_data = self._build_report_data(report)

            return report_data

        except NotFoundError:
            raise
        except PermissionError:
            raise
        except Exception as e:
            logger.error(f"Error fetching public report: {str(e)}")
            raise NotFoundError("Report not found")

    def _build_report_data(self, report: Dict[str, Any]) -> Dict[str, Any]:
        """
        Build the complete report data with evidence.

        Args:
            report: Report config from database

        Returns:
            Complete report data with student info, achievements, XP, etc.
        """
        user_id = report['user_id']

        # Get user info
        user_result = self.supabase.table('users')\
            .select('id, first_name, last_name, display_name')\
            .eq('id', user_id)\
            .single()\
            .execute()

        student = user_result.data if user_result.data else {}

        # Build response
        report_data = {
            'report': {
                'id': report['id'],
                'title': report['title'],
                'description': report['description'],
                'created_at': report['created_at'],
                'view_count': report.get('view_count', 0)
            },
            'student': {
                'first_name': student.get('first_name'),
                'last_name': student.get('last_name'),
                'display_name': student.get('display_name')
            },
            'achievements': []
        }

        # Collect all task IDs for skills lookup
        included_task_ids = []

        # Fetch included quests
        if report.get('included_quest_ids'):
            achievements, task_ids = self._fetch_quest_evidence(
                user_id,
                report['included_quest_ids']
            )
            report_data['achievements'].extend(achievements)
            included_task_ids.extend(task_ids)

        # Fetch included courses
        if report.get('included_course_ids'):
            course_achievements, course_task_ids = self._fetch_course_evidence(
                user_id,
                report['included_course_ids']
            )
            report_data['achievements'].extend(course_achievements)
            included_task_ids.extend(course_task_ids)

        # Add XP summary calculated from achievements (not global)
        if report.get('include_xp_summary', True):
            report_data['xp_summary'] = self._calculate_xp_from_achievements(
                report_data['achievements']
            )

        # Add skills breakdown only for tasks in this report
        if report.get('include_skills_breakdown', True):
            report_data['skills_breakdown'] = self._get_skills_for_tasks(included_task_ids)

        # Add learning events if enabled
        if report.get('include_learning_events', False):
            report_data['learning_events'] = self._get_learning_events(user_id)

        return report_data

    def _fetch_quest_evidence(
        self,
        user_id: str,
        quest_ids: List[str]
    ) -> tuple:
        """
        Fetch evidence for specified quests.

        Reuses patterns from portfolio.py for evidence aggregation.
        Filters out confidential evidence and private blocks.

        Returns:
            Tuple of (achievements list, task_ids list)
        """
        achievements = []
        all_task_ids = []

        try:
            # Get completed user_quests for these quests
            user_quests_result = self.supabase.table('user_quests')\
                .select('''
                    id,
                    completed_at,
                    quests!inner(id, title, description, big_idea)
                ''')\
                .eq('user_id', user_id)\
                .in_('quest_id', quest_ids)\
                .execute()

            if not user_quests_result.data:
                return achievements

            # Get approved tasks for these quests
            approved_tasks = self.supabase.table('user_quest_tasks')\
                .select('id, title, pillar, quest_id, user_quest_id, xp_value, updated_at')\
                .eq('user_id', user_id)\
                .eq('approval_status', 'approved')\
                .in_('quest_id', quest_ids)\
                .execute()

            # Get evidence documents (filter private blocks)
            evidence_docs = self.supabase.table('user_task_evidence_documents')\
                .select('''
                    id,
                    task_id,
                    quest_id,
                    status,
                    completed_at,
                    is_confidential,
                    evidence_document_blocks (
                        id, block_type, content, order_index, is_private
                    )
                ''')\
                .eq('user_id', user_id)\
                .eq('status', 'completed')\
                .eq('is_confidential', False)\
                .in_('quest_id', quest_ids)\
                .execute()

            # Build evidence map (filter private blocks)
            evidence_map = {}
            for doc in (evidence_docs.data or []):
                task_id = doc.get('task_id')
                if task_id and not doc.get('is_confidential'):
                    blocks = doc.get('evidence_document_blocks', [])
                    public_blocks = [b for b in blocks if not b.get('is_private', False)]
                    if public_blocks:
                        evidence_map[task_id] = {
                            'document_id': doc['id'],
                            'blocks': sorted(public_blocks, key=lambda b: b.get('order_index', 0)),
                            'completed_at': doc.get('completed_at')
                        }

            # Build achievements list
            for uq in user_quests_result.data:
                quest = uq.get('quests')
                if not quest:
                    continue

                quest_id = quest['id']
                user_quest_id = uq['id']

                # Get tasks for this quest
                quest_tasks = [t for t in (approved_tasks.data or [])
                               if t.get('quest_id') == quest_id]

                task_evidence = {}
                total_xp = 0

                for task in quest_tasks:
                    task_id = task['id']
                    task_title = task['title']
                    task_xp = task.get('xp_value', 0) or 0
                    total_xp += task_xp
                    all_task_ids.append(task_id)

                    evidence_doc = evidence_map.get(task_id)
                    if evidence_doc:
                        task_evidence[task_title] = {
                            'evidence_type': 'multi_format',
                            'evidence_blocks': evidence_doc['blocks'],
                            'xp_awarded': task_xp,
                            'completed_at': evidence_doc.get('completed_at') or task.get('updated_at'),
                            'pillar': task.get('pillar', 'creativity')
                        }

                if task_evidence:
                    achievements.append({
                        'quest': quest,
                        'completed_at': uq.get('completed_at'),
                        'task_evidence': task_evidence,
                        'total_xp_earned': total_xp,
                        'status': 'completed' if uq.get('completed_at') else 'in_progress'
                    })

            return achievements, all_task_ids

        except Exception as e:
            logger.error(f"Error fetching quest evidence: {str(e)}")
            return [], []

    def _fetch_course_evidence(
        self,
        user_id: str,
        course_ids: List[str]
    ) -> tuple:
        """
        Fetch evidence for specified courses.

        Gets all quest evidence for quests that are part of the course.

        Returns:
            Tuple of (achievements list, task_ids list)
        """
        try:
            # Get quests linked to these courses
            course_quests = self.supabase.table('course_quests')\
                .select('quest_id, course_id')\
                .in_('course_id', course_ids)\
                .execute()

            quest_ids = [cq['quest_id'] for cq in (course_quests.data or []) if cq.get('quest_id')]

            if not quest_ids:
                return [], []

            # Fetch quest evidence (returns tuple)
            return self._fetch_quest_evidence(user_id, quest_ids)

        except Exception as e:
            logger.error(f"Error fetching course evidence: {str(e)}")
            return [], []

    def _calculate_xp_from_achievements(
        self,
        achievements: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Calculate XP summary from achievements data.

        Only includes XP from tasks in the report, not global user XP.
        """
        xp_by_pillar = {}
        total_xp = 0

        for achievement in achievements:
            task_evidence = achievement.get('task_evidence', {})
            for task_title, evidence in task_evidence.items():
                xp = evidence.get('xp_awarded', 0) or 0
                pillar = evidence.get('pillar', 'creativity')

                if pillar:
                    xp_by_pillar[pillar] = xp_by_pillar.get(pillar, 0) + xp
                    total_xp += xp

        return {
            'total_xp': total_xp,
            'by_pillar': xp_by_pillar
        }

    def _get_skills_for_tasks(self, task_ids: List[str]) -> List[Dict[str, Any]]:
        """
        Get skills practiced only for specific tasks.

        Args:
            task_ids: List of task UUIDs to get skills for

        Returns:
            List of skills with practice counts
        """
        if not task_ids:
            return []

        try:
            # Get skills linked to these specific tasks
            result = self.supabase.table('task_skills')\
                .select('skill_name')\
                .in_('task_id', task_ids)\
                .execute()

            # Count occurrences of each skill
            skill_counts = {}
            for record in (result.data or []):
                skill_name = record.get('skill_name')
                if skill_name:
                    skill_counts[skill_name] = skill_counts.get(skill_name, 0) + 1

            # Convert to list format
            return [
                {'skill_name': name, 'times_practiced': count}
                for name, count in skill_counts.items()
            ]

        except Exception as e:
            logger.error(f"Error fetching skills for tasks: {str(e)}")
            return []

    def _get_xp_summary(self, user_id: str) -> Dict[str, Any]:
        """Get XP summary for user."""
        try:
            result = self.supabase.table('user_skill_xp')\
                .select('pillar, xp_amount')\
                .eq('user_id', user_id)\
                .execute()

            xp_by_pillar = {}
            total_xp = 0

            for record in (result.data or []):
                pillar = record.get('pillar')
                xp = record.get('xp_amount', 0) or 0
                if pillar:
                    xp_by_pillar[pillar] = xp
                    total_xp += xp

            return {
                'total_xp': total_xp,
                'by_pillar': xp_by_pillar
            }

        except Exception as e:
            logger.error(f"Error fetching XP summary: {str(e)}")
            return {'total_xp': 0, 'by_pillar': {}}

    def _get_skills_breakdown(self, user_id: str) -> List[Dict[str, Any]]:
        """Get skills breakdown for user."""
        try:
            result = self.supabase.table('user_skill_details')\
                .select('skill_name, times_practiced')\
                .eq('user_id', user_id)\
                .execute()

            return result.data or []

        except Exception as e:
            logger.error(f"Error fetching skills breakdown: {str(e)}")
            return []

    def _get_learning_events(self, user_id: str) -> List[Dict[str, Any]]:
        """Get learning events for user."""
        try:
            result = self.supabase.table('learning_events')\
                .select('id, title, description, created_at, category')\
                .eq('user_id', user_id)\
                .eq('is_private', False)\
                .order('created_at', desc=True)\
                .limit(50)\
                .execute()

            return result.data or []

        except Exception as e:
            logger.error(f"Error fetching learning events: {str(e)}")
            return []

    def _increment_view_count(self, report_id: str):
        """Increment view count and update last_viewed_at."""
        try:
            # Use raw SQL to increment atomically
            self.supabase.table('evidence_report_configs')\
                .update({
                    'view_count': self.supabase.table('evidence_report_configs')
                        .select('view_count')
                        .eq('id', report_id)
                        .single()
                        .execute()
                        .data.get('view_count', 0) + 1,
                    'last_viewed_at': datetime.utcnow().isoformat()
                })\
                .eq('id', report_id)\
                .execute()
        except Exception as e:
            # Don't fail the request if view count update fails
            logger.warning(f"Failed to increment view count: {str(e)}")

    def _get_user_data(self, user_id: str) -> Dict[str, Any]:
        """Get user data for FERPA checks."""
        try:
            result = self.supabase.table('users')\
                .select('id, is_dependent, date_of_birth, managed_by_parent_id')\
                .eq('id', user_id)\
                .single()\
                .execute()

            return result.data or {}

        except Exception as e:
            logger.error(f"Error fetching user data: {str(e)}")
            return {}

    def _check_is_minor(self, user_data: Dict[str, Any]) -> bool:
        """
        Check if user is a minor (FERPA compliance).

        A user is considered a minor if:
        - is_dependent = true, OR
        - age < 18 (based on date_of_birth)
        """
        # If marked as dependent, always a minor
        if user_data.get('is_dependent') is True:
            return True

        # Check date of birth
        dob = user_data.get('date_of_birth')
        if not dob:
            return False

        try:
            from datetime import date
            if isinstance(dob, str):
                dob = datetime.strptime(dob.split('T')[0], '%Y-%m-%d').date()
            elif hasattr(dob, 'date'):
                dob = dob.date()

            age = (date.today() - dob).days / 365.25
            return age < 18

        except Exception as e:
            logger.warning(f"Error parsing date_of_birth: {e}")
            return False

    def _create_parent_approval_request(
        self,
        report_id: str,
        student_id: str,
        user_data: Dict[str, Any]
    ):
        """
        Create parent approval request for minor's report.
        """
        try:
            # Find parent
            parent_id = user_data.get('managed_by_parent_id')

            if not parent_id:
                # Check parent_student_links
                link_result = self.supabase.table('parent_student_links')\
                    .select('parent_user_id')\
                    .eq('student_user_id', student_id)\
                    .eq('status', 'approved')\
                    .limit(1)\
                    .execute()

                if link_result.data:
                    parent_id = link_result.data[0].get('parent_user_id')

            if not parent_id:
                logger.warning(f"No parent found for minor {student_id[:8]}")
                return

            # Create approval request
            self.supabase.table('evidence_report_parent_approvals')\
                .insert({
                    'report_config_id': report_id,
                    'parent_user_id': parent_id,
                    'status': 'pending'
                })\
                .execute()

            # Send notification to parent
            try:
                from services.notification_service import NotificationService
                notification_service = NotificationService()

                student_result = self.supabase.table('users')\
                    .select('first_name, organization_id')\
                    .eq('id', student_id)\
                    .single()\
                    .execute()

                student_name = student_result.data.get('first_name', 'Your child') if student_result.data else 'Your child'
                org_id = student_result.data.get('organization_id') if student_result.data else None

                notification_service.create_notification(
                    user_id=parent_id,
                    notification_type='parent_approval_required',
                    title='Evidence Report Approval Requested',
                    message=f'{student_name} wants to create a shareable evidence report and needs your approval.',
                    link='/parent-dashboard',
                    metadata={'student_id': student_id, 'report_id': report_id},
                    organization_id=org_id
                )

                logger.info(f"Sent parent approval notification for report {report_id[:8]}")

            except Exception as notif_err:
                logger.warning(f"Failed to send parent notification: {notif_err}")

        except Exception as e:
            logger.error(f"Error creating parent approval request: {str(e)}")

    def approve_report(self, report_id: str, parent_user_id: str) -> bool:
        """
        Parent approves a minor's evidence report.

        Args:
            report_id: Report config UUID
            parent_user_id: Parent's user ID

        Returns:
            True if successful

        Raises:
            NotFoundError: If approval request not found
            PermissionError: If user is not the assigned parent
        """
        try:
            # Verify parent is assigned to this approval
            approval = self.supabase.table('evidence_report_parent_approvals')\
                .select('*')\
                .eq('report_config_id', report_id)\
                .eq('parent_user_id', parent_user_id)\
                .eq('status', 'pending')\
                .single()\
                .execute()

            if not approval.data:
                raise NotFoundError("Approval request not found or already processed")

            # Update approval status
            self.supabase.table('evidence_report_parent_approvals')\
                .update({
                    'status': 'approved',
                    'responded_at': datetime.utcnow().isoformat()
                })\
                .eq('id', approval.data['id'])\
                .execute()

            # Update report config
            self.supabase.table('evidence_report_configs')\
                .update({
                    'parent_approval_status': 'approved',
                    'parent_approved_at': datetime.utcnow().isoformat()
                })\
                .eq('id', report_id)\
                .execute()

            logger.info(f"Parent {parent_user_id[:8]} approved report {report_id[:8]}")
            return True

        except NotFoundError:
            raise
        except Exception as e:
            logger.error(f"Error approving report: {str(e)}")
            raise

    def deny_report(
        self,
        report_id: str,
        parent_user_id: str,
        reason: Optional[str] = None
    ) -> bool:
        """
        Parent denies a minor's evidence report.

        Args:
            report_id: Report config UUID
            parent_user_id: Parent's user ID
            reason: Optional denial reason

        Returns:
            True if successful
        """
        try:
            # Verify parent is assigned to this approval
            approval = self.supabase.table('evidence_report_parent_approvals')\
                .select('*')\
                .eq('report_config_id', report_id)\
                .eq('parent_user_id', parent_user_id)\
                .eq('status', 'pending')\
                .single()\
                .execute()

            if not approval.data:
                raise NotFoundError("Approval request not found or already processed")

            # Update approval status
            self.supabase.table('evidence_report_parent_approvals')\
                .update({
                    'status': 'denied',
                    'responded_at': datetime.utcnow().isoformat(),
                    'denial_reason': reason
                })\
                .eq('id', approval.data['id'])\
                .execute()

            # Update report config
            self.supabase.table('evidence_report_configs')\
                .update({
                    'parent_approval_status': 'denied'
                })\
                .eq('id', report_id)\
                .execute()

            logger.info(f"Parent {parent_user_id[:8]} denied report {report_id[:8]}")
            return True

        except NotFoundError:
            raise
        except Exception as e:
            logger.error(f"Error denying report: {str(e)}")
            raise

    def get_pending_approvals(self, parent_user_id: str) -> List[Dict[str, Any]]:
        """
        Get pending approval requests for a parent.

        Args:
            parent_user_id: Parent's user ID

        Returns:
            List of pending approval requests with report details
        """
        try:
            result = self.supabase.table('evidence_report_parent_approvals')\
                .select('''
                    id,
                    report_config_id,
                    requested_at,
                    evidence_report_configs (
                        id, title, description, user_id, created_at,
                        included_quest_ids, included_course_ids
                    )
                ''')\
                .eq('parent_user_id', parent_user_id)\
                .eq('status', 'pending')\
                .order('requested_at', desc=True)\
                .execute()

            approvals = result.data or []

            # Get student names
            for approval in approvals:
                report = approval.get('evidence_report_configs')
                if report and report.get('user_id'):
                    student = self.supabase.table('users')\
                        .select('first_name, last_name')\
                        .eq('id', report['user_id'])\
                        .single()\
                        .execute()

                    if student.data:
                        approval['student_name'] = f"{student.data.get('first_name', '')} {student.data.get('last_name', '')}".strip()

            return approvals

        except Exception as e:
            logger.error(f"Error fetching pending approvals: {str(e)}")
            return []

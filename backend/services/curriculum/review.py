"""
Curriculum Review Workflow

Handles the human review gate in the curriculum pipeline:
- process_upload_to_review(): Process through Stage 2 and pause
- approve_structure(): Resume after human review
- apply_structure_edits(): Apply user corrections to structure
"""

from datetime import datetime
from typing import Dict, Optional, Any

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)


class CurriculumReviewService:
    """
    Handles the human review workflow for curriculum uploads.

    The review gate pauses processing after Stage 2 (structure detection)
    to allow human verification and correction before continuing to
    Stage 3 (philosophy alignment) and Stage 4 (content generation).
    """

    def __init__(self, admin_client=None):
        """Initialize with optional admin client."""
        self._admin_client = admin_client

    @property
    def admin_client(self):
        """Lazy-load admin client."""
        if self._admin_client is None:
            self._admin_client = get_supabase_admin_client()
        return self._admin_client

    def process_to_review(
        self,
        upload_id: str,
        parse_result: Dict,
        structure_result: Dict
    ) -> Dict[str, Any]:
        """
        Mark upload as ready for human review after Stage 2.

        This pauses the pipeline so users can verify/correct the
        detected structure before AI philosophy alignment.

        Args:
            upload_id: The upload record ID
            parse_result: Output from Stage 1 (parsing)
            structure_result: Output from Stage 2 (structure detection)

        Returns:
            Dict with review status and structure data
        """
        try:
            # Save Stage 2 output and set status to ready_for_review
            self.admin_client.table('curriculum_uploads').update({
                'status': 'ready_for_review',
                'structured_content': structure_result,
                'progress_percent': 50,
                'current_stage_name': 'Ready for review',
                'current_item': 'Waiting for structure approval',
                'can_resume': True,
                'resume_from_stage': 3,
                'stage_2_completed_at': datetime.utcnow().isoformat()
            }).eq('id', upload_id).execute()

            logger.info(f"Upload {upload_id} paused for structure review")

            return {
                'success': True,
                'status': 'ready_for_review',
                'structure': structure_result
            }

        except Exception as e:
            logger.error(f"Failed to set review status: {str(e)}")
            return {
                'success': False,
                'error': f'Failed to set review status: {str(e)}'
            }

    def approve_structure(
        self,
        upload_id: str,
        edits: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Approve structure (with optional edits) and prepare for continuation.

        Called after user reviews Stage 2 output and approves/edits it.

        Args:
            upload_id: The upload record ID
            edits: Optional structure corrections from user

        Returns:
            Dict with approval status and updated structure
        """
        try:
            # Get current upload
            result = self.admin_client.table('curriculum_uploads').select(
                'id, status, structured_content'
            ).eq('id', upload_id).execute()

            if not result.data:
                return {'success': False, 'error': 'Upload not found'}

            upload = result.data[0]

            if upload.get('status') != 'ready_for_review':
                return {'success': False, 'error': 'Upload not ready for approval'}

            structured = upload.get('structured_content', {})

            # Apply any edits
            if edits:
                structured = self.apply_structure_edits(structured, edits)

                # Save edited structure
                self.admin_client.table('curriculum_uploads').update({
                    'structured_content': structured,
                    'human_structure_edits': edits
                }).eq('id', upload_id).execute()

                logger.info(f"Applied {len(edits)} structure edits to upload {upload_id}")

            # Update status to continue processing
            self.admin_client.table('curriculum_uploads').update({
                'status': 'processing',
                'current_stage_name': 'Continuing processing',
                'current_item': 'Structure approved'
            }).eq('id', upload_id).execute()

            return {
                'success': True,
                'structure': structured,
                'resume_from': 3
            }

        except Exception as e:
            logger.error(f"Approve structure failed: {str(e)}")
            return {
                'success': False,
                'error': f'Failed to approve structure: {str(e)}'
            }

    def apply_structure_edits(self, structure: Dict, edits: Dict) -> Dict:
        """
        Apply user edits to detected structure.

        Edits format:
        {
            'course': {'title': 'New Title', ...},
            'module_1': {'title': 'New Title', 'description': '...'},
            'lesson_2': {'title': 'New Lesson Title', 'parent_module': 'module_1'},
            ...
        }

        Args:
            structure: Original structured_content
            edits: Dict of element_id -> field edits

        Returns:
            Updated structure
        """
        if not edits:
            return structure

        updated = dict(structure)

        # Apply course edits
        if 'course' in edits:
            updated['course'] = {**updated.get('course', {}), **edits['course']}

        # Apply module edits
        for i, module in enumerate(updated.get('modules', [])):
            module_id = module.get('id', f'module_{i+1}')
            if module_id in edits:
                updated['modules'][i] = {**module, **edits[module_id]}

        # Apply lesson edits
        for i, lesson in enumerate(updated.get('lessons', [])):
            lesson_id = lesson.get('id', f'lesson_{i+1}')
            if lesson_id in edits:
                updated['lessons'][i] = {**lesson, **edits[lesson_id]}

        # Apply task edits
        for i, task in enumerate(updated.get('tasks', [])):
            task_id = task.get('id', f'task_{i+1}')
            if task_id in edits:
                updated['tasks'][i] = {**task, **edits[task_id]}

        return updated

    def get_review_status(self, upload_id: str) -> Dict[str, Any]:
        """
        Get current review status for an upload.

        Args:
            upload_id: The upload record ID

        Returns:
            Dict with status information
        """
        try:
            result = self.admin_client.table('curriculum_uploads').select(
                'id, status, structured_content, human_structure_edits, '
                'progress_percent, current_stage_name, current_item'
            ).eq('id', upload_id).execute()

            if not result.data:
                return {'success': False, 'error': 'Upload not found'}

            upload = result.data[0]

            return {
                'success': True,
                'status': upload.get('status'),
                'ready_for_review': upload.get('status') == 'ready_for_review',
                'has_edits': bool(upload.get('human_structure_edits')),
                'structure': upload.get('structured_content'),
                'progress': {
                    'percent': upload.get('progress_percent'),
                    'stage': upload.get('current_stage_name'),
                    'item': upload.get('current_item')
                }
            }

        except Exception as e:
            logger.error(f"Get review status failed: {str(e)}")
            return {
                'success': False,
                'error': f'Failed to get review status: {str(e)}'
            }

    def reject_and_restart(self, upload_id: str) -> Dict[str, Any]:
        """
        Reject the detected structure and allow re-upload.

        Args:
            upload_id: The upload record ID

        Returns:
            Dict with status
        """
        try:
            self.admin_client.table('curriculum_uploads').update({
                'status': 'rejected',
                'can_resume': False,
                'current_stage_name': 'Structure rejected',
                'current_item': 'Please re-upload with corrections'
            }).eq('id', upload_id).execute()

            logger.info(f"Upload {upload_id} structure rejected")

            return {
                'success': True,
                'status': 'rejected'
            }

        except Exception as e:
            logger.error(f"Reject structure failed: {str(e)}")
            return {
                'success': False,
                'error': f'Failed to reject structure: {str(e)}'
            }

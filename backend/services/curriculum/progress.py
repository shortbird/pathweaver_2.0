"""
Curriculum Progress Tracking

Handles checkpoint saving, progress updates, and upload tracking.
"""

from datetime import datetime
from typing import Dict, Optional, Any
import json

from database import get_supabase_admin_client
from utils.logger import get_logger

logger = get_logger(__name__)


class ProgressTracker:
    """Manages curriculum upload progress and checkpoints."""

    def __init__(self, admin_client=None):
        self._admin_client = admin_client

    @property
    def admin_client(self):
        """Lazy-load admin client."""
        if self._admin_client is None:
            self._admin_client = get_supabase_admin_client()
        return self._admin_client

    def save_checkpoint(self, upload_id: str, stage: int, output: dict) -> None:
        """
        Save checkpoint after completing a pipeline stage.

        Allows resume from any point if process crashes or times out.

        Args:
            upload_id: Unique identifier for the upload
            stage: Stage number (1-4)
            output: Stage output to save as checkpoint
        """
        try:
            checkpoint_data = {
                'stage_output': output,
                'saved_at': datetime.utcnow().isoformat()
            }

            # Update the upload record with checkpoint
            self.admin_client.table('curriculum_uploads').update({
                f'stage_{stage}_checkpoint': json.dumps(checkpoint_data),
                'last_checkpoint_stage': stage,
                'updated_at': datetime.utcnow().isoformat()
            }).eq('id', upload_id).execute()

            logger.info(f"Checkpoint saved: upload={upload_id}, stage={stage}")

        except Exception as e:
            logger.error(f"Failed to save checkpoint: {e}")
            # Don't raise - checkpoint failure shouldn't stop processing

    def update_progress(
        self,
        upload_id: str,
        stage: int,
        status: str,
        message: str = None,
        progress_percent: int = None,
        stage_data: Dict = None
    ) -> None:
        """
        Update upload progress for real-time status display.

        Args:
            upload_id: Unique identifier for the upload
            stage: Current stage number (1-4)
            status: Status string (processing, awaiting_review, complete, error)
            message: Optional status message for UI
            progress_percent: Optional completion percentage (0-100)
            stage_data: Optional additional data for the stage
        """
        try:
            update_data = {
                'current_stage': stage,
                'status': status,
                'updated_at': datetime.utcnow().isoformat()
            }

            if message:
                update_data['status_message'] = message
            if progress_percent is not None:
                update_data['progress_percent'] = progress_percent
            if stage_data:
                update_data['stage_data'] = json.dumps(stage_data)

            self.admin_client.table('curriculum_uploads').update(
                update_data
            ).eq('id', upload_id).execute()

            logger.debug(f"Progress updated: upload={upload_id}, stage={stage}, status={status}")

        except Exception as e:
            logger.error(f"Failed to update progress: {e}")

    def get_upload(self, upload_id: str) -> Optional[Dict]:
        """
        Get upload record by ID.

        Args:
            upload_id: Unique identifier for the upload

        Returns:
            Upload record dict or None if not found
        """
        try:
            result = self.admin_client.table('curriculum_uploads').select(
                '*'
            ).eq('id', upload_id).execute()

            if result.data:
                return result.data[0]
            return None

        except Exception as e:
            logger.error(f"Failed to get upload: {e}")
            return None

    def mark_error(self, upload_id: str, error_message: str) -> None:
        """
        Mark upload as failed with error message.

        Args:
            upload_id: Unique identifier for the upload
            error_message: Error description to store
        """
        try:
            self.admin_client.table('curriculum_uploads').update({
                'status': 'error',
                'error_message': error_message,
                'updated_at': datetime.utcnow().isoformat()
            }).eq('id', upload_id).execute()

        except Exception as e:
            logger.error(f"Failed to mark error: {e}")

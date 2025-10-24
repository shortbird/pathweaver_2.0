"""
Evidence Repository

Handles all database operations related to evidence uploads and evidence document blocks.
"""

from typing import List, Dict, Optional, Any
from repositories.base_repository import BaseRepository, NotFoundError
from utils.logger import get_logger

logger = get_logger(__name__)


class EvidenceRepository(BaseRepository):
    """Repository for evidence document operations."""

    table_name = 'evidence_document_blocks'

    def find_by_task_completion(self, task_completion_id: str) -> List[Dict[str, Any]]:
        """
        Get all evidence documents for a task completion.

        Args:
            task_completion_id: Task completion ID

        Returns:
            List of evidence documents
        """
        try:
            result = self.client.table(self.table_name)\
                .select('*')\
                .eq('task_completion_id', task_completion_id)\
                .order('created_at', desc=True)\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching evidence for task completion {task_completion_id}: {e}")
            return []

    def find_by_user(self, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Get all evidence documents uploaded by a user.

        Args:
            user_id: User ID
            limit: Maximum number of documents to return

        Returns:
            List of evidence documents
        """
        try:
            result = self.client.table(self.table_name)\
                .select('*')\
                .eq('user_id', user_id)\
                .order('created_at', desc=True)\
                .limit(limit)\
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching evidence for user {user_id}: {e}")
            return []

    def create_evidence(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new evidence document record.

        Args:
            data: Evidence document data

        Returns:
            Created evidence document

        Raises:
            ValidationError: If required fields are missing
        """
        required_fields = ['user_id', 'task_completion_id', 'file_name', 'file_type', 'file_url']

        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            raise ValueError(f"Missing required fields: {', '.join(missing_fields)}")

        try:
            result = self.client.table(self.table_name)\
                .insert(data)\
                .execute()

            if not result.data:
                raise ValueError("Failed to create evidence document")

            logger.info(f"Created evidence document for user {data['user_id']}")
            return result.data[0]
        except Exception as e:
            logger.error(f"Error creating evidence document: {e}")
            raise

    def delete_evidence(self, evidence_id: str) -> bool:
        """
        Delete an evidence document.

        Args:
            evidence_id: Evidence document ID

        Returns:
            True if deleted successfully

        Raises:
            NotFoundError: If evidence document not found
        """
        try:
            # Check if exists first
            existing = self.find_by_id(evidence_id)
            if not existing:
                raise NotFoundError(f"Evidence document {evidence_id} not found")

            result = self.client.table(self.table_name)\
                .delete()\
                .eq('id', evidence_id)\
                .execute()

            logger.info(f"Deleted evidence document {evidence_id}")
            return True
        except Exception as e:
            logger.error(f"Error deleting evidence document {evidence_id}: {e}")
            raise

    def get_file_size_sum(self, user_id: str) -> int:
        """
        Get total file size for all user's evidence documents.

        Args:
            user_id: User ID

        Returns:
            Total file size in bytes
        """
        try:
            result = self.client.table(self.table_name)\
                .select('file_size')\
                .eq('user_id', user_id)\
                .execute()

            if not result.data:
                return 0

            return sum(doc.get('file_size', 0) for doc in result.data)
        except Exception as e:
            logger.error(f"Error calculating file size for user {user_id}: {e}")
            return 0

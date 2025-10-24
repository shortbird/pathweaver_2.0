"""
Evidence Document Repository - Database operations for multi-format evidence system

Handles user_task_evidence_documents and evidence_document_blocks tables.
"""

import logging
from typing import Optional, Dict, List, Any
from datetime import datetime
from backend.repositories.base_repository import BaseRepository, DatabaseError, NotFoundError
from postgrest.exceptions import APIError

from utils.logger import get_logger

logger = get_logger(__name__)


class EvidenceDocumentRepository(BaseRepository):
    """Repository for evidence document database operations"""

    table_name = 'user_task_evidence_documents'
    id_column = 'id'

    def find_by_task(
        self,
        user_id: str,
        task_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get evidence document for a specific task and user.

        Args:
            user_id: User ID
            task_id: Task ID

        Returns:
            Evidence document record or None if not found

        Raises:
            DatabaseError: If query fails
        """
        try:
            response = (
                self.client.table(self.table_name)
                .select('*')
                .eq('user_id', user_id)
                .eq('task_id', task_id)
                .execute()
            )

            if not response.data:
                return None

            return response.data[0]

        except APIError as e:
            logger.error(f"Error finding evidence document for task {task_id}: {e}")
            raise DatabaseError("Failed to fetch evidence document") from e

    def create_document(
        self,
        user_id: str,
        task_id: str,
        quest_id: str,
        status: str = 'draft'
    ) -> Dict[str, Any]:
        """
        Create a new evidence document.

        Args:
            user_id: User ID
            task_id: Task ID
            quest_id: Quest ID
            status: Document status (draft/completed)

        Returns:
            Created evidence document record

        Raises:
            DatabaseError: If creation fails
        """
        try:
            data = {
                'user_id': user_id,
                'quest_id': quest_id,
                'task_id': task_id,
                'status': status
            }

            if status == 'completed':
                data['completed_at'] = datetime.utcnow().isoformat()

            response = (
                self.client.table(self.table_name)
                .insert(data)
                .execute()
            )

            if not response.data:
                raise DatabaseError("Failed to create evidence document")

            logger.info(f"Created evidence document for task {task_id}, user {user_id}")
            return response.data[0]

        except APIError as e:
            logger.error(f"Error creating evidence document: {e}")
            raise DatabaseError("Failed to create evidence document") from e

    def update_document_status(
        self,
        document_id: str,
        status: str
    ) -> Dict[str, Any]:
        """
        Update evidence document status.

        Args:
            document_id: Document ID
            status: New status (draft/completed)

        Returns:
            Updated evidence document record

        Raises:
            NotFoundError: If document doesn't exist
            DatabaseError: If update fails
        """
        data = {
            'updated_at': datetime.utcnow().isoformat(),
            'status': status
        }

        if status == 'completed':
            data['completed_at'] = datetime.utcnow().isoformat()

        return self.update(document_id, data)

    def get_document_with_blocks(
        self,
        user_id: str,
        task_id: str
    ) -> Dict[str, Any]:
        """
        Get evidence document with all content blocks.

        Args:
            user_id: User ID
            task_id: Task ID

        Returns:
            Dictionary with 'document' and 'blocks' keys

        Raises:
            DatabaseError: If query fails
        """
        try:
            # Get the evidence document
            document = self.find_by_task(user_id, task_id)

            if not document:
                return {
                    'document': None,
                    'blocks': []
                }

            # Get all content blocks for this document
            blocks_response = (
                self.client.table('evidence_document_blocks')
                .select('*')
                .eq('document_id', document['id'])
                .order('order_index')
                .execute()
            )

            return {
                'document': document,
                'blocks': blocks_response.data or []
            }

        except APIError as e:
            logger.error(f"Error fetching document with blocks: {e}")
            raise DatabaseError("Failed to fetch evidence document") from e

    def get_blocks_for_document(
        self,
        document_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get all content blocks for a document.

        Args:
            document_id: Document ID

        Returns:
            List of block records ordered by order_index

        Raises:
            DatabaseError: If query fails
        """
        try:
            response = (
                self.client.table('evidence_document_blocks')
                .select('*')
                .eq('document_id', document_id)
                .order('order_index')
                .execute()
            )

            return response.data or []

        except APIError as e:
            logger.error(f"Error fetching blocks for document {document_id}: {e}")
            raise DatabaseError("Failed to fetch evidence blocks") from e

    def create_block(
        self,
        document_id: str,
        block_type: str,
        content: Dict[str, Any],
        order_index: int
    ) -> Dict[str, Any]:
        """
        Create a new content block.

        Args:
            document_id: Document ID
            block_type: Type of block (text/image/link/video/document)
            content: Block content as JSON
            order_index: Position in document

        Returns:
            Created block record

        Raises:
            DatabaseError: If creation fails
        """
        try:
            data = {
                'document_id': document_id,
                'block_type': block_type,
                'content': content,
                'order_index': order_index
            }

            response = (
                self.client.table('evidence_document_blocks')
                .insert(data)
                .execute()
            )

            if not response.data:
                raise DatabaseError("Failed to create evidence block")

            return response.data[0]

        except APIError as e:
            logger.error(f"Error creating evidence block: {e}")
            raise DatabaseError("Failed to create evidence block") from e

    def update_block(
        self,
        block_id: str,
        content: Optional[Dict[str, Any]] = None,
        order_index: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Update a content block.

        Args:
            block_id: Block ID
            content: New content (optional)
            order_index: New order index (optional)

        Returns:
            Updated block record

        Raises:
            NotFoundError: If block doesn't exist
            DatabaseError: If update fails
        """
        data = {}
        if content is not None:
            data['content'] = content
        if order_index is not None:
            data['order_index'] = order_index

        if not data:
            # Nothing to update, fetch current block
            try:
                response = (
                    self.client.table('evidence_document_blocks')
                    .select('*')
                    .eq('id', block_id)
                    .execute()
                )

                if not response.data:
                    raise NotFoundError(f"Block {block_id} not found")

                return response.data[0]

            except APIError as e:
                logger.error(f"Error fetching block {block_id}: {e}")
                raise DatabaseError("Failed to fetch block") from e

        try:
            response = (
                self.client.table('evidence_document_blocks')
                .update(data)
                .eq('id', block_id)
                .execute()
            )

            if not response.data:
                raise NotFoundError(f"Block {block_id} not found")

            return response.data[0]

        except APIError as e:
            logger.error(f"Error updating block {block_id}: {e}")
            raise DatabaseError("Failed to update block") from e

    def delete_blocks(
        self,
        block_ids: List[str]
    ) -> bool:
        """
        Delete multiple content blocks.

        Args:
            block_ids: List of block IDs to delete

        Returns:
            True if successful

        Raises:
            DatabaseError: If deletion fails
        """
        if not block_ids:
            return True

        try:
            self.client.table('evidence_document_blocks').delete().in_('id', block_ids).execute()

            logger.info(f"Deleted {len(block_ids)} evidence blocks")
            return True

        except APIError as e:
            logger.error(f"Error deleting blocks: {e}")
            raise DatabaseError("Failed to delete blocks") from e

    def batch_create_blocks(
        self,
        blocks: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Create multiple content blocks in a single operation.

        Args:
            blocks: List of block data dictionaries

        Returns:
            List of created block records

        Raises:
            DatabaseError: If creation fails
        """
        if not blocks:
            return []

        try:
            response = (
                self.client.table('evidence_document_blocks')
                .insert(blocks)
                .execute()
            )

            logger.info(f"Created {len(blocks)} evidence blocks")
            return response.data or []

        except APIError as e:
            logger.error(f"Error batch creating blocks: {e}")
            raise DatabaseError("Failed to create blocks") from e

    def get_block_with_ownership_check(
        self,
        block_id: str,
        user_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get a block with ownership verification.

        Args:
            block_id: Block ID
            user_id: User ID to verify ownership

        Returns:
            Block record or None if not found/not owned

        Raises:
            DatabaseError: If query fails
        """
        try:
            response = (
                self.client.table('evidence_document_blocks')
                .select('*, user_task_evidence_documents!inner(user_id)')
                .eq('id', block_id)
                .eq('user_task_evidence_documents.user_id', user_id)
                .single()
                .execute()
            )

            if not response.data:
                return None

            return response.data

        except APIError as e:
            logger.error(f"Error fetching block with ownership check: {e}")
            raise DatabaseError("Failed to fetch block") from e

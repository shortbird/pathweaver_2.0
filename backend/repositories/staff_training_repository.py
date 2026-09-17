"""
Staff Training Repository - the order of a school's training catalog.

sis_staff_training is otherwise read and written directly by
routes/sis/staff_training.py (fenced by the direct-call ratchet rather than
migrated). This repository exists for the one new write the Training page
needed after that fence went up: the creator's order. M18 in
docs/sis/CONSOLIDATION_PLAN.md merges the quest-backed and link-backed
training rows into one store; when it does, this is where that store's data
access belongs, and TrainingLinkRepository folds in.
"""

from typing import Dict, List

from postgrest.exceptions import APIError

from repositories.base_repository import BaseRepository, DatabaseError
from utils.logger import get_logger

logger = get_logger(__name__)


class StaffTrainingRepository(BaseRepository):
    """Repository for sis_staff_training."""

    table_name = 'sis_staff_training'
    id_column = 'id'

    def set_sequence_order(self, organization_id: str, ordered_ids: List[str],
                           positions: Dict[str, int]) -> int:
        """Write each row's place in the creator's order. Only this org's rows.

        `positions` maps row id -> position on the shared scale the Training
        page uses for quests and links alike; `ordered_ids` says which of them
        to write. Returns how many were written.
        """
        written = 0
        for row_id in ordered_ids:
            try:
                rows = (self.client.table(self.table_name)
                        .update({'sequence_order': positions[row_id]})
                        .eq('id', row_id).eq('organization_id', organization_id)
                        .execute()).data
            except APIError as e:
                logger.error(f"Error ordering training {row_id}: {e}")
                raise DatabaseError("Failed to save the training order") from e
            written += 1 if rows else 0
        return written

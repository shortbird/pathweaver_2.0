"""
Repository Layer - Data Access Abstraction

This package contains repository classes that handle all database operations.
Repositories provide a clean separation between business logic and data access.

Benefits:
- Single source of truth for database queries
- Easier to test (can mock repositories)
- Consistent error handling and logging
- Better code reusability
- Cleaner route handlers

Usage Example:
    from backend.repositories import UserRepository, QuestRepository

    # Initialize with user context for RLS enforcement
    user_repo = UserRepository(user_id=current_user_id)
    user = user_repo.find_by_id(user_id)

    # Or without user context (admin operations)
    quest_repo = QuestRepository()
    quests = quest_repo.get_active_quests(limit=20)
"""

from backend.repositories.base_repository import (
    BaseRepository,
    DatabaseError,
    NotFoundError,
    ValidationError,
    PermissionError
)
from backend.repositories.user_repository import UserRepository
from backend.repositories.quest_repository import QuestRepository, QuestTaskRepository
from backend.repositories.badge_repository import BadgeRepository
from backend.repositories.evidence_repository import EvidenceRepository
from backend.repositories.friendship_repository import FriendshipRepository
from backend.repositories.parent_repository import ParentRepository
from backend.repositories.tutor_repository import TutorRepository
from backend.repositories.lms_repository import LMSRepository
from backend.repositories.analytics_repository import AnalyticsRepository
from backend.repositories.task_repository import TaskRepository, TaskCompletionRepository
from backend.repositories.evidence_document_repository import EvidenceDocumentRepository

__all__ = [
    # Base classes
    'BaseRepository',

    # Exceptions
    'DatabaseError',
    'NotFoundError',
    'ValidationError',
    'PermissionError',

    # Repositories
    'UserRepository',
    'QuestRepository',
    'QuestTaskRepository',
    'BadgeRepository',
    'EvidenceRepository',
    'FriendshipRepository',
    'ParentRepository',
    'TutorRepository',
    'LMSRepository',
    'AnalyticsRepository',
    'TaskRepository',
    'TaskCompletionRepository',
    'EvidenceDocumentRepository',
]

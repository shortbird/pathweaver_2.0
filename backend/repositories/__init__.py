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
    from repositories import UserRepository, QuestRepository

    # Initialize with user context for RLS enforcement
    user_repo = UserRepository(user_id=current_user_id)
    user = user_repo.find_by_id(user_id)

    # Or without user context (admin operations)
    quest_repo = QuestRepository()
    quests = quest_repo.get_active_quests(limit=20)
"""

from repositories.base_repository import (
    BaseRepository,
    DatabaseError,
    NotFoundError,
    ValidationError,
    PermissionError
)
from repositories.user_repository import UserRepository
from repositories.quest_repository import QuestRepository, QuestTaskRepository
from repositories.evidence_repository import EvidenceRepository
from repositories.friendship_repository import FriendshipRepository
from repositories.parent_repository import ParentRepository
from repositories.tutor_repository import TutorRepository
from repositories.lms_repository import LMSRepository
from repositories.analytics_repository import AnalyticsRepository
from repositories.task_repository import TaskRepository, TaskCompletionRepository
from repositories.evidence_document_repository import EvidenceDocumentRepository
from repositories.site_settings_repository import SiteSettingsRepository
from repositories.quest_template_task_repository import QuestTemplateTaskRepository

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
    'EvidenceRepository',
    'FriendshipRepository',
    'ParentRepository',
    'TutorRepository',
    'LMSRepository',
    'AnalyticsRepository',
    'TaskRepository',
    'TaskCompletionRepository',
    'EvidenceDocumentRepository',
    'SiteSettingsRepository',
    'QuestTemplateTaskRepository',
]

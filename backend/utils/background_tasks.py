"""
Background Tasks Utility

Simple utility for running tasks in background threads.
Used for non-critical tasks like generating AI content after quest creation.
"""

import threading
from utils.logger import get_logger

logger = get_logger(__name__)


def generate_approaches_background(quest_id: str, quest_title: str, quest_description: str):
    """
    Generate starter path approaches for a quest in a background thread.

    This is called after quest creation to pre-generate the AI content
    so students don't have to wait when they first view the quest.

    Args:
        quest_id: UUID of the quest
        quest_title: Title of the quest
        quest_description: Description/big_idea of the quest
    """
    from flask import current_app

    # Get app reference for background thread context
    app = current_app._get_current_object()

    def _generate():
        with app.app_context():
            try:
                from services.quest_ai_service import QuestAIService

                logger.info(f"[BG] Starting approach generation for quest {quest_id[:8]}")

                ai_service = QuestAIService()
                result = ai_service.generate_approach_examples(
                    quest_id=quest_id,
                    quest_title=quest_title,
                    quest_description=quest_description
                )

                if result['success']:
                    logger.info(f"[BG] Successfully generated {len(result['approaches'])} approaches for quest {quest_id[:8]}")
                else:
                    logger.warning(f"[BG] Failed to generate approaches for quest {quest_id[:8]}: {result.get('error')}")

            except Exception as e:
                logger.error(f"[BG] Error generating approaches for quest {quest_id[:8]}: {str(e)}")

    # Start background thread
    thread = threading.Thread(target=_generate, daemon=True)
    thread.start()

    logger.info(f"[BG] Spawned background thread for quest {quest_id[:8]} approach generation")

"""The part of the XP question Optio tunes without a deploy.

Two inputs, both edited in the grader's Tune AI XP popup:

- the XP scale, the CREDIT_REVIEW_XP_GUIDE prompt component (default in
  prompts/credit_review_xp.py);
- worked examples, rows in credit_review_xp_examples -- "a two-sentence
  discussion comment is 25 XP" -- most of them saved from the grader when a
  reviewer disagreed with the AI's XP.

Worked examples rather than fine-tuning: they change the next review, a bad one
is deleted in a click, and the prompt shows exactly what the model was told.

Best effort. A review must never fail because calibration could not be read, so
every failure falls back to the default scale and no examples.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List

from prompts.credit_review_xp import CREDIT_REVIEW_XP_GUIDE
from utils.logger import get_logger

logger = get_logger(__name__)

XP_GUIDE_COMPONENT = 'CREDIT_REVIEW_XP_GUIDE'

#: Examples sent with each review, newest first. Enough to anchor the scale,
#: few enough that the prompt stays about the student's work.
MAX_EXAMPLES_IN_PROMPT = 40


@dataclass
class Calibration:
    guide: str = CREDIT_REVIEW_XP_GUIDE
    examples: List[Dict[str, Any]] = field(default_factory=list)


def load() -> Calibration:
    """The current scale and examples. Never raises."""
    calibration = Calibration()

    try:
        from services.prompt_management_service import PromptManagementService
        guide = PromptManagementService().get_component_content(XP_GUIDE_COMPONENT)
        if guide and guide.strip():
            calibration.guide = guide.strip()
    except Exception as e:  # noqa: BLE001
        logger.warning(f'XP guide not loaded, using the default: {e}')

    try:
        from repositories.credit_review_xp_example_repository import (
            CreditReviewXpExampleRepository,
        )
        from database import get_supabase_admin_client
        # admin client justified: credit_review_xp_examples is service-role only
        # (RLS on, no policies), and this runs on the review's background thread.
        calibration.examples = CreditReviewXpExampleRepository(
            client=get_supabase_admin_client()).list_active(MAX_EXAMPLES_IN_PROMPT)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'XP examples not loaded: {e}')

    return calibration

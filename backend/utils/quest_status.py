"""Single source of truth for quest / class completion state.

A regular quest's enrollment is complete when its ``completed_at`` is set.

A credit-class (``quest_type='class'``) is a one-off: it is complete once its
holistic Optio review awards credit (``quests.class_review_status='credit_awarded'``),
*even though the credit-award flow does not set the enrollment's completed_at*.

Several surfaces must agree on this rule — the dashboard's active-work list
(exclude completed) and the portfolio / diploma achievements list (mark
completed vs in-progress). Keeping the rule here prevents those surfaces from
drifting apart. Callers pass a ``user_quests`` row with its quest joined as
``quests`` (i.e. selected via ``.select('*, quests(*)')``).
"""

from typing import Any, Dict, Optional

CLASS_REVIEW_CREDIT_AWARDED = 'credit_awarded'


def is_class_credit_awarded(quest: Optional[Dict[str, Any]]) -> bool:
    """True when a class quest's holistic review has awarded credit."""
    if not quest:
        return False
    return (
        quest.get('quest_type') == 'class'
        and quest.get('class_review_status') == CLASS_REVIEW_CREDIT_AWARDED
    )


def is_enrollment_complete(user_quest: Optional[Dict[str, Any]]) -> bool:
    """Whether a ``user_quests`` enrollment is complete.

    Complete = the enrollment has a ``completed_at``, OR it is a class whose
    holistic review has awarded credit (one-off, completed_at not set).
    """
    if not user_quest:
        return False
    if user_quest.get('completed_at'):
        return True
    return is_class_credit_awarded(user_quest.get('quests'))


def enrollment_completed_at(user_quest: Optional[Dict[str, Any]]) -> Optional[str]:
    """Best completion timestamp for a complete enrollment.

    Falls back to the class review submission time for credit-awarded classes,
    whose enrollment ``completed_at`` is never set. Returns None for enrollments
    that are not complete.
    """
    if not user_quest:
        return None
    completed_at = user_quest.get('completed_at')
    if completed_at:
        return completed_at
    if is_class_credit_awarded(user_quest.get('quests')):
        return (user_quest.get('quests') or {}).get('class_review_submitted_at')
    return None

"""
The reads and writes behind holding a task's XP until a teacher accepts it
(services/teacher_acceptance.py; ticket 536a3018, Arete Academy).

Client-injected, like SisSubmissionRepository: every caller already holds the
client its own gate justified (the completion routes, the SIS Submissions
routes, the portfolio service), and the tests hand in a fake.

Every method returns plain lists or dicts and raises on a database error; the
service decides what a failure means (for a hold, "award as before").
"""

from typing import Any, Dict, List, Optional


def _rows(response) -> List[Dict[str, Any]]:
    """A PostgREST response's rows; anything that is not a list is none."""
    data = getattr(response, 'data', None)
    return data if isinstance(data, list) else []


def _first(response) -> Optional[Dict[str, Any]]:
    rows = _rows(response)
    return rows[0] if rows else None


class CompletionHoldRepository:

    def __init__(self, client):
        self.client = client

    # ── who ──────────────────────────────────────────────────────────────────

    def organization_of(self, user_id: str) -> Optional[str]:
        row = _first(self.client.table('users').select('organization_id')
                     .eq('id', user_id).limit(1).execute())
        return (row or {}).get('organization_id')

    def task(self, task_id: str) -> Dict[str, Any]:
        return _first(self.client.table('user_quest_tasks').select('id, pillar, xp_value')
                      .eq('id', task_id).limit(1).execute()) or {}

    # ── the hold ─────────────────────────────────────────────────────────────

    def stamp_hold(self, completion_id: str, at: str) -> bool:
        return bool(_rows(self.client.table('quest_task_completions')
                          .update({'xp_held_at': at})
                          .eq('id', completion_id).execute()))

    def claim_release(self, completion_id: str, at: str) -> Optional[Dict[str, Any]]:
        """Clear a hold, only if there is one. The row when this call won."""
        return _first(self.client.table('quest_task_completions')
                      .update({'xp_held_at': None, 'xp_released_at': at})
                      .eq('id', completion_id)
                      .not_.is_('xp_held_at', 'null')
                      .execute())

    def restore_hold(self, completion_id: str, at: str) -> None:
        self.client.table('quest_task_completions') \
            .update({'xp_held_at': at, 'xp_released_at': None}) \
            .eq('id', completion_id).execute()

    def claim_rehold(self, completion_id: str, at: str) -> Optional[Dict[str, Any]]:
        """Hold again a row an accept released, only if one did."""
        return _first(self.client.table('quest_task_completions')
                      .update({'xp_held_at': at, 'xp_released_at': None})
                      .eq('id', completion_id)
                      .not_.is_('xp_released_at', 'null')
                      .execute())

    # ── reads ────────────────────────────────────────────────────────────────

    def held_for_user(self, user_id: str) -> List[Dict[str, Any]]:
        """This student's held completions. Bounded by one student."""
        return _rows(self.client.table('quest_task_completions')
                     .select('id, user_quest_task_id')
                     .eq('user_id', user_id)
                     .not_.is_('xp_held_at', 'null')
                     .execute())

    def is_held(self, completion_id: str) -> bool:
        return bool(_rows(self.client.table('quest_task_completions').select('id')
                          .eq('id', completion_id)
                          .not_.is_('xp_held_at', 'null')
                          .limit(1).execute()))

    # ── resubmission ─────────────────────────────────────────────────────────

    def completion_id_for_task(self, user_id: str, task_id: str) -> Optional[str]:
        row = _first(self.client.table('quest_task_completions').select('id')
                     .eq('user_id', user_id).eq('user_quest_task_id', task_id)
                     .limit(1).execute())
        return (row or {}).get('id')

    def review_action(self, completion_id: str) -> Optional[str]:
        row = _first(self.client.table('sis_submission_reviews').select('id, action')
                     .eq('completion_id', completion_id).limit(1).execute())
        return (row or {}).get('action')

    def delete_grow_this_review(self, completion_id: str) -> None:
        self.client.table('sis_submission_reviews').delete() \
            .eq('completion_id', completion_id).eq('action', 'grow_this').execute()

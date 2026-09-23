"""
What the quest page records about a visit, and shows about a teacher's review.

Two small things GET /api/quests/<id> (routes/quest/detail.py) needs beyond the
quest and its tasks:

  - that the student, or their parent in family scope, opened an assigned
    quest. Assigning a class quest creates every student's enrollment at once,
    so an enrollment alone cannot tell a teacher who has looked (iCreate, ticket
    7cf5d330, 2026-09-23: "We'd want to see 'opened' 'assigned' 'done'").
  - that a teacher accepted a submitted task. The accept is written to
    sis_submission_reviews from the SIS submissions inbox, and until now nothing
    outside SIS read it, so a parent got the notification and then found no
    trace of it on the task (iCreate, ticket 650aa9b9, 2026-09-23).

Client-injected, like ClassQuestAudienceRepository: the route already holds the
service-role client its own scope check justified.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, Optional

_CHUNK = 200

# last_opened_at is a "recently looked" signal, not an audit log. Moving it at
# most hourly keeps a student who refreshes the page from writing on every load.
LAST_OPENED_GRANULARITY = timedelta(hours=1)

REVIEWER_EMBED = ('reviewer:users!sis_submission_reviews_reviewed_by_fkey'
                  '(first_name, last_name, display_name, preferred_name, username, email)')


def _parse_ts(value) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


class QuestViewRepository:

    def __init__(self, client):
        self.client = client

    def record_opened(self, user_quest_id: str, now: Optional[datetime] = None) -> Dict[str, Any]:
        """Stamp an enrollment as opened. Returns the fields written ({} for none).

        first_opened_at is set once and never moved: it answers "when did they
        first look", and a later visit must not erase that. last_opened_at moves
        at most once per LAST_OPENED_GRANULARITY.

        Raises whatever the client raises. Until migration
        20260923120000_user_quests_opened_at is applied the columns do not exist
        and the read fails; the route catches that so the quest still loads.
        """
        now = now or datetime.now(timezone.utc)
        rows = (self.client.table('user_quests')
                .select('first_opened_at, last_opened_at')
                .eq('id', user_quest_id).limit(1).execute()).data or []
        if not rows:
            return {}
        row = rows[0]
        changes: Dict[str, Any] = {}
        if not row.get('first_opened_at'):
            changes['first_opened_at'] = now.isoformat()
        last = _parse_ts(row.get('last_opened_at'))
        if last is None or now - last >= LAST_OPENED_GRANULARITY:
            changes['last_opened_at'] = now.isoformat()
        if changes:
            (self.client.table('user_quests').update(changes)
             .eq('id', user_quest_id).execute())
        return changes

    def reviews_for_completions(self, completion_ids: Iterable[str]) -> Dict[str, Dict[str, Any]]:
        """{completion_id: {action, reviewed_at, reviewer_name}} for reviewed ones.

        Bounded by one student's completions on one quest, and chunked anyway.
        A completion nobody has reviewed is simply absent.
        """
        from utils import person_name

        ids = [c for c in dict.fromkeys(completion_ids) if c]
        out: Dict[str, Dict[str, Any]] = {}
        for start in range(0, len(ids), _CHUNK):
            rows = (self.client.table('sis_submission_reviews')
                    .select(f'completion_id, action, reviewed_at, {REVIEWER_EMBED}')
                    .in_('completion_id', ids[start:start + _CHUNK])
                    .execute()).data or []
            for r in rows:
                reviewer = r.get('reviewer')
                if isinstance(reviewer, list):
                    reviewer = reviewer[0] if reviewer else None
                out[r['completion_id']] = {
                    'action': r.get('action'),
                    'reviewed_at': r.get('reviewed_at'),
                    'reviewer_name': person_name.full_name(reviewer, 'Your teacher'),
                }
        return out

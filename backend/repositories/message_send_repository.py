"""
Message send repository - the console's Compose, recorded, and the reads that
choose its audience.

  message_sends / message_send_recipients
      One row per send from the SIS Messaging page's Compose, and one per
      person it went to, so a send to forty families can say "Read by 12 of 40"
      and list who (iCreate, 2026-09-23, 9b46c748). Read state is computed in
      Postgres by the views message_send_recipient_status / message_send_read_stats
      (20260924110000): direct_messages.read_at for a separate send, the
      member's group last_read_at for a group send.

  classes, their staff and their students
      The class filter and the per-class teacher / aide / students / families
      picks (8ee000b6). A whole school's classes in three reads, not one per
      class: iCreate has 158.

Service-role only; the callers are ADMIN_ROLES routes that have resolved the
org.
"""

from typing import Any, Callable, Dict, Iterable, List, Optional

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger

logger = get_logger(__name__)

_CHUNK = 100
#: Rows per insert when recording recipients (well under PostgREST limits).
_INSERT_CHUNK = 500


def _chunks(items: List[str], size: int = _CHUNK):
    for i in range(0, len(items), size):
        yield items[i:i + size]


class MessageSendRepository(BaseRepository):
    table_name = 'message_sends'

    # ── Recording a send ──────────────────────────────────────────────────

    def create_send(self, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        row = (self.client.table('message_sends').insert(fields).execute()).data
        return row[0] if row else None

    def add_recipients(self, rows: List[Dict[str, Any]]) -> None:
        for i in range(0, len(rows), _INSERT_CHUNK):
            self.client.table('message_send_recipients').insert(
                rows[i:i + _INSERT_CHUNK]).execute()

    # ── Reading sends back ────────────────────────────────────────────────

    def list_sends(self, org_id: str, *, limit: int = 30,
                   offset: int = 0) -> List[Dict[str, Any]]:
        return (self.client.table('message_sends')
                .select('id, organization_id, sent_by, as_school, mode, subject, body, '
                        'push, email, group_id, created_at')
                .eq('organization_id', org_id)
                .order('created_at', desc=True)
                .range(offset, offset + limit - 1).execute()).data or []

    def get_send(self, org_id: str, send_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('message_sends').select('*')
                .eq('id', send_id).eq('organization_id', org_id)
                .limit(1).execute()).data or []
        return rows[0] if rows else None

    def read_stats(self, send_ids: Iterable[str]) -> Dict[str, Dict[str, Any]]:
        """{send_id: {recipient_count, read_count, skipped_count}}, one row per
        send from the aggregate view -- never a recipient row per person."""
        ids = [s for s in dict.fromkeys(send_ids) if s]
        out: Dict[str, Dict[str, Any]] = {}
        for chunk in _chunks(ids):
            rows = (self.client.table('message_send_read_stats')
                    .select('send_id, recipient_count, read_count, skipped_count')
                    .in_('send_id', chunk).execute()).data or []
            out.update({r['send_id']: r for r in rows})
        return out

    def recipient_status(self, send_id: str) -> List[Dict[str, Any]]:
        """Every recipient of one send with when they read it. Paged: a send
        to every family in a school passes the 1000-row cap."""
        return fetch_all_rows(lambda: (
            self.client.table('message_send_recipient_status')
            .select('send_id, user_id, kind, status, conversation_id, read_at')
            .eq('send_id', send_id)
        ), order_by='user_id')

    # ── The audience ──────────────────────────────────────────────────────

    def _query(self, table: str, columns: str, class_ids: List[str],
               **equals: Any) -> Callable[[], Any]:
        """A fresh-builder factory for fetch_all_rows: `table` rows for these
        classes, with each keyword an equality filter."""
        def build():
            query = self.client.table(table).select(columns).in_('class_id', class_ids)
            for column, value in equals.items():
                query = query.eq(column, value)
            return query
        return build

    def active_classes(self, org_id: str) -> List[Dict[str, Any]]:
        """This org's classes that are not archived, by name, with the two
        teacher columns org_classes carries."""
        return fetch_all_rows(lambda: (
            self.client.table('org_classes')
            .select('id, name, primary_instructor_id, assistant_instructor_ids')
            .eq('organization_id', org_id).neq('status', 'archived')
        ), order_by='name')

    def active_advisors_by_class(self, class_ids: Iterable[str]) -> Dict[str, List[str]]:
        """{class_id: [advisor_id, ...]} from the active class_advisors rows."""
        ids = [c for c in dict.fromkeys(class_ids) if c]
        out: Dict[str, List[str]] = {}
        for chunk in _chunks(ids):
            rows = fetch_all_rows(self._query(
                'class_advisors', 'id, class_id, advisor_id', chunk, is_active=True))
            for r in rows:
                if r.get('class_id') and r.get('advisor_id'):
                    out.setdefault(r['class_id'], []).append(r['advisor_id'])
        return out

    def active_enrollments(self, class_ids: Iterable[str]) -> Dict[str, List[str]]:
        """{class_id: [student_id, ...]} from the active class_enrollments rows."""
        ids = [c for c in dict.fromkeys(class_ids) if c]
        out: Dict[str, List[str]] = {}
        for chunk in _chunks(ids):
            rows = fetch_all_rows(self._query(
                'class_enrollments', 'id, class_id, student_id', chunk, status='active'))
            for r in rows:
                if r.get('class_id') and r.get('student_id'):
                    out.setdefault(r['class_id'], []).append(r['student_id'])
        return out

    def class_meeting_days(self, org_id: str, class_ids: Iterable[str]) -> Dict[str, List[int]]:
        """{class_id: [day_of_week, ...]} for the "Teaching Monday" quick picks."""
        ids = [c for c in dict.fromkeys(class_ids) if c]
        out: Dict[str, List[int]] = {}
        for chunk in _chunks(ids):
            rows = fetch_all_rows(self._query(
                'class_meetings', 'id, class_id, day_of_week', chunk, organization_id=org_id))
            for r in rows:
                if r.get('class_id') and r.get('day_of_week') is not None:
                    out.setdefault(r['class_id'], []).append(r['day_of_week'])
        return out

    # ── Board post read counts ────────────────────────────────────────────

    def board_post_read_stats(self, post_ids: Iterable[str]) -> Dict[str, Dict[str, int]]:
        """{sis_announcements.id: {recipient_count, read_count}} for the board
        posts whose send (announcements.source_announcement_id) recorded
        recipients. A board-only post has no send and no entry: nobody was
        sent it, so "read by 0 of 0" would be a wrong answer, not a zero."""
        ids = [p for p in dict.fromkeys(post_ids) if p]
        sends: Dict[str, str] = {}
        for chunk in _chunks(ids):
            rows = (self.client.table('announcements').select('id, source_announcement_id')
                    .in_('source_announcement_id', chunk).execute()).data or []
            sends.update({r['id']: r['source_announcement_id'] for r in rows
                          if r.get('source_announcement_id')})
        out: Dict[str, Dict[str, int]] = {}
        for chunk in _chunks(list(sends)):
            rows = (self.client.table('announcement_read_stats')
                    .select('announcement_id, recipient_count, read_count')
                    .in_('announcement_id', chunk).execute()).data or []
            for r in rows:
                if not r.get('recipient_count'):
                    continue
                post = sends.get(r['announcement_id'])
                if not post:
                    continue
                agg = out.setdefault(post, {'recipient_count': 0, 'read_count': 0})
                agg['recipient_count'] += r.get('recipient_count') or 0
                agg['read_count'] += r.get('read_count') or 0
        return out

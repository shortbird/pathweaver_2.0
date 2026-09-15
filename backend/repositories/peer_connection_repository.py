"""Data access the Friends rebuild added on top of peer_connections.

services/peer_connection_service predates the repository pattern and keeps
its own reads of peer_connections and peer_connection_approvals (the ratchet
in tests/unit/test_direct_db_calls_do_not_grow.py fences that debt rather
than migrating it). Everything NEW -- the parent's oversight reads, the bulk
revoke behind "Friends: off", the approval rows any parent may answer -- goes
here, in the layer that owns the table.

Authorization is the caller's: a parent's read of a child's activity is gated
by @require_relationship_to on the route, and "Friends: off" is gated by
peer_policy_service.set_policy. Nothing here decides who may ask.
"""

from typing import Any, Dict, Iterable, List

from repositories.base_repository import BaseRepository
from utils.logger import get_logger
from utils.timestamps import now_iso
from utils.validation.sanitizers import pgrst_uuid, pgrst_uuid_list

TARGET_COLUMNS = ('task_completion_id', 'learning_event_id', 'quest_id')

logger = get_logger(__name__)


class PeerConnectionRepository(BaseRepository):
    table_name = 'peer_connections'

    def __init__(self, client=None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: every row here joins two students from two
            # families, and the reads below are made by a parent about a child or
            # by a service about both sides -- none of it is the caller's own
            # scope under RLS. The route/service gate decides; this only reads.
            client = get_supabase_admin_client()
        super().__init__(client=client)

    def states_with(self, user_id: str, peer_ids: Iterable[str]) -> Dict[str, Dict[str, Any]]:
        """{peer_id: {'id', 'status', 'direction'}} for every connection row
        between this user and any of `peer_ids`, whatever its status. Feeds
        the suggestions list, so a classmate who already has a request open
        is shown with its state rather than offered again."""
        ids = sorted(p for p in set(peer_ids or []) if p and p != user_id)
        if not ids:
            return {}
        rows = self.client.table(self.table_name) \
            .select('id, requester_id, addressee_id, status') \
            .or_(f'and(requester_id.eq.{pgrst_uuid(user_id, "user_id")},'
                 f'addressee_id.in.({pgrst_uuid_list(ids, "peer_id")})),'
                 f'and(addressee_id.eq.{pgrst_uuid(user_id, "user_id")},'
                 f'requester_id.in.({pgrst_uuid_list(ids, "peer_id")}))') \
            .execute().data or []
        out: Dict[str, Dict[str, Any]] = {}
        for r in rows:
            outgoing = r['requester_id'] == user_id
            peer = r['addressee_id'] if outgoing else r['requester_id']
            out[peer] = {'id': r['id'], 'status': r['status'],
                         'direction': 'outgoing' if outgoing else 'incoming'}
        return out

    def blocked_either_way(self, user_id: str, other_ids: Iterable[str]) -> set:
        """The subset of `other_ids` with a block in either direction."""
        ids = sorted(o for o in set(other_ids or []) if o and o != user_id)
        if not ids:
            return set()
        rows = self.client.table('user_blocks').select('blocker_id, blocked_id') \
            .or_(f'and(blocker_id.eq.{pgrst_uuid(user_id, "user_id")},'
                 f'blocked_id.in.({pgrst_uuid_list(ids, "other_id")})),'
                 f'and(blocked_id.eq.{pgrst_uuid(user_id, "user_id")},'
                 f'blocker_id.in.({pgrst_uuid_list(ids, "other_id")}))') \
            .execute().data or []
        out = set()
        for r in rows:
            out.add(r['blocked_id'] if r['blocker_id'] == user_id else r['blocker_id'])
        return out

    def class_names(self, class_ids: Iterable[str]) -> Dict[str, str]:
        """{class_id: name} for the classes a suggestion is labelled with."""
        ids = [c for c in set(class_ids or []) if c]
        if not ids:
            return {}
        rows = self.client.table('org_classes').select('id, name') \
            .in_('id', ids).execute().data or []
        return {r['id']: r.get('name') or 'Class' for r in rows}

    def comment_counts(self, completion_ids: Iterable[str],
                       learning_event_ids: Iterable[str]) -> Dict[str, int]:
        """{target_id: count} of visible peer comments on a page of feed
        items, for merging into the card totals the way
        activity_feed_service does."""
        out: Dict[str, int] = {}
        for col, ids in (('task_completion_id', list(completion_ids or [])),
                         ('learning_event_id', list(learning_event_ids or []))):
            ids = [i for i in ids if i]
            if not ids:
                continue
            rows = self.client.table('peer_comments').select(col) \
                .in_(col, ids).is_('hidden_at', 'null').execute().data or []
            for r in rows:
                if r.get(col):
                    out[r[col]] = out.get(r[col], 0) + 1
        return out

    def revoke_all_active_for(self, student_id: str, *, revoked_by: str,
                              reason: str) -> int:
        """Revoke every active connection this student is on. Returns how many.

        The write behind "Friends: off". One statement per side rather than a
        filter on OR, so the two updates are the same shape the service's own
        single-row revoke writes.
        """
        sid = pgrst_uuid(student_id, 'student_id')
        payload = {
            'status': 'revoked',
            'revoked_at': now_iso(),
            'revoked_by': revoked_by,
            'revoke_reason': reason,
            'updated_at': now_iso(),
        }
        count = 0
        for column in ('requester_id', 'addressee_id'):
            rows = self.client.table(self.table_name).update(payload) \
                .eq('status', 'active').eq(column, sid).execute().data or []
            count += len(rows)
        return count

    def active_count_for(self, student_id: str) -> int:
        """How many friends this student has right now -- the number the
        confirm dialog names before a parent turns Friends off."""
        rows = self.client.table(self.table_name).select('id') \
            .eq('status', 'active') \
            .or_(f'requester_id.eq.{pgrst_uuid(student_id, "student_id")},'
                 f'addressee_id.eq.{pgrst_uuid(student_id, "student_id")}') \
            .execute().data or []
        return len(rows)

    def connections_touching(self, student_id: str, since_iso: str) -> List[Dict[str, Any]]:
        """Connections this student is on that changed since `since_iso`,
        for the parent's activity view (added, removed, declined)."""
        return self.client.table(self.table_name) \
            .select('id, requester_id, addressee_id, status, source, '
                    'created_at, activated_at, revoked_at, revoked_by, revoke_reason') \
            .or_(f'requester_id.eq.{pgrst_uuid(student_id, "student_id")},'
                 f'addressee_id.eq.{pgrst_uuid(student_id, "student_id")}') \
            .gte('updated_at', since_iso) \
            .order('updated_at', desc=True).execute().data or []

    def comments_involving(self, student_id: str, since_iso: str) -> List[Dict[str, Any]]:
        """Peer comments this student wrote or received since `since_iso`.
        Hidden comments included: a parent reviewing what was said to their
        child should see what a moderator took down, not a gap."""
        return self.client.table('peer_comments') \
            .select('id, author_id, student_id, learning_event_id, task_completion_id, '
                    'quest_id, comment_text, created_at, hidden_at, hidden_reason') \
            .or_(f'author_id.eq.{pgrst_uuid(student_id, "student_id")},'
                 f'student_id.eq.{pgrst_uuid(student_id, "student_id")}') \
            .gte('created_at', since_iso) \
            .order('created_at', desc=True).execute().data or []

    def pending_approvals_for(self, approver_id: str,
                              child_ids: Iterable[str]) -> List[Dict[str, Any]]:
        """Approval rows waiting on this adult: the ones naming them as the
        approver, plus any for a child they are a parent of. The second half is
        what lets a co-parent answer a request the other parent's policy
        routed, and what lets a parent answer at all when the policy was set
        by the school."""
        ids = sorted(c for c in set(child_ids or []) if c)
        query = self.client.table('peer_connection_approvals').select(
            'id, connection_id, student_id, approver_id, approver_kind, created_at'
        ).eq('status', 'pending')
        if ids:
            query = query.or_(f'approver_id.eq.{pgrst_uuid(approver_id, "approver_id")},'
                              f'student_id.in.({pgrst_uuid_list(ids, "child_id")})')
        else:
            query = query.eq('approver_id', pgrst_uuid(approver_id, 'approver_id'))
        return query.execute().data or []

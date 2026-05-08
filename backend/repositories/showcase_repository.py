"""
ShowcaseRepository - Marketing-showcase data access.

Covers four logical surfaces:
  1. Consent state (showcase_consent + history audit trail)
  2. Marketer queue (showcase_evidence_status over quest_task_completions)
  3. Posted-tracking (showcase_posts)
  4. Revocation cascade (consent revoke -> flag posts, dismiss queue)

The marketer routes always use the admin client (RLS bypass) -- callers should
instantiate this repository without a user_id when serving showcase routes.
Family-dashboard reads scope by user_id and rely on RLS policies (see migration).
"""

from typing import Optional, Dict, List, Any
from datetime import datetime, timezone
from postgrest.exceptions import APIError

from repositories.base_repository import BaseRepository, DatabaseError, NotFoundError
from utils.logger import get_logger

logger = get_logger(__name__)


# Valid status transitions / post platforms are enforced by CHECK constraints in the migration.
QUEUE_STATUSES = ('new', 'saved', 'scheduled', 'dismissed', 'posted')
# Display priority: fresh items first, then bookmarked, then scheduled, then posted.
# 'dismissed' is intentionally last (and excluded from default view).
_STATUS_RANK = {'new': 0, 'saved': 1, 'scheduled': 2, 'posted': 3, 'dismissed': 4}
POST_PLATFORMS = ('instagram', 'tiktok', 'x', 'linkedin', 'facebook', 'youtube', 'other')
CONSENT_FIELDS = ('consent_active', 'consent_work', 'consent_first_name',
                  'consent_face', 'consent_age')


class ShowcaseRepository(BaseRepository):
    """Marketing showcase data access. Designed for admin-client use."""

    table_name = 'showcase_evidence_status'  # primary table; cross-table operations use direct client access

    # ─── Consent ──────────────────────────────────────────────────────────────

    def get_consent(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Fetch the current consent row for a student, or None."""
        try:
            res = self.client.table('showcase_consent').select('*').eq('user_id', user_id).execute()
            return res.data[0] if res.data else None
        except APIError as e:
            logger.error(f"get_consent failed for {user_id}: {e}")
            raise DatabaseError("Failed to fetch consent")

    def upsert_consent(self, user_id: str, fields: Dict[str, Any], recorded_by: str) -> Dict[str, Any]:
        """Create or update the consent row. Always sets recorded_by + updated_at."""
        payload = {k: v for k, v in fields.items() if k in CONSENT_FIELDS or k in ('consent_doc_url', 'consent_signed_date')}
        payload['user_id'] = user_id
        payload['recorded_by'] = recorded_by
        payload['updated_at'] = datetime.now(timezone.utc).isoformat()

        # Set recorded_at on initial create only
        existing = self.get_consent(user_id)
        if not existing:
            payload['recorded_at'] = payload['updated_at']
            try:
                res = self.client.table('showcase_consent').insert(payload).execute()
                return res.data[0]
            except APIError as e:
                logger.error(f"upsert_consent (insert) failed for {user_id}: {e}")
                raise DatabaseError("Failed to create consent")

        # If consent was previously revoked and is being restored, clear revoked fields
        if fields.get('consent_active') is True and existing.get('revoked_at'):
            payload['revoked_at'] = None
            payload['revoked_reason'] = None
            payload['revoked_by'] = None

        try:
            res = self.client.table('showcase_consent').update(payload).eq('user_id', user_id).execute()
            return res.data[0]
        except APIError as e:
            logger.error(f"upsert_consent (update) failed for {user_id}: {e}")
            raise DatabaseError("Failed to update consent")

    def revoke_consent(self, user_id: str, revoked_by: str, reason: Optional[str], source: str = 'admin') -> Dict[str, Any]:
        """
        Revoke a student's consent.

        Cascade:
          - Sets consent_active=false, revoked_at, revoked_by on showcase_consent
          - Updates all showcase_posts for this user to take_down_required=true
          - Sets all non-posted showcase_evidence_status rows to 'dismissed'

        Returns the updated consent row + counts of cascaded changes.
        """
        existing = self.get_consent(user_id)
        if not existing:
            raise NotFoundError(f"No consent record for user {user_id}")

        now = datetime.now(timezone.utc).isoformat()
        try:
            # 1. Flip consent
            consent_res = self.client.table('showcase_consent').update({
                'consent_active': False,
                'revoked_at': now,
                'revoked_by': revoked_by,
                'revoked_reason': reason,
                'updated_at': now,
            }).eq('user_id', user_id).execute()

            # If parent self-revoke, patch the most recent history row's source
            # (trigger writes 'admin' by default — we override here)
            if source == 'parent_self_revoke':
                hist = self.client.table('showcase_consent_history') \
                    .select('id') \
                    .eq('user_id', user_id) \
                    .eq('action', 'revoke') \
                    .order('changed_at', desc=True) \
                    .limit(1) \
                    .execute()
                if hist.data:
                    self.client.table('showcase_consent_history').update({
                        'source': 'parent_self_revoke'
                    }).eq('id', hist.data[0]['id']).execute()

            # 2. Flag all existing posts for take-down
            posts_res = self.client.table('showcase_posts').update({
                'take_down_required': True,
            }).eq('user_id', user_id).eq('take_down_required', False).execute()
            posts_flagged = len(posts_res.data or [])

            # 3. Dismiss all non-posted queue items (don't touch 'posted' since those are tracked via showcase_posts)
            queue_res = self.client.table('showcase_evidence_status').update({
                'status': 'dismissed',
                'updated_by': revoked_by,
                'updated_at': now,
            }).eq('user_id', user_id).neq('status', 'posted').execute()
            queue_dismissed = len(queue_res.data or [])

            return {
                'consent': consent_res.data[0] if consent_res.data else None,
                'posts_flagged_for_takedown': posts_flagged,
                'queue_items_dismissed': queue_dismissed,
            }
        except APIError as e:
            logger.error(f"revoke_consent failed for {user_id}: {e}")
            raise DatabaseError("Failed to revoke consent")

    def get_consent_history(self, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        try:
            res = self.client.table('showcase_consent_history') \
                .select('*') \
                .eq('user_id', user_id) \
                .order('changed_at', desc=True) \
                .limit(limit) \
                .execute()
            return res.data or []
        except APIError as e:
            logger.error(f"get_consent_history failed for {user_id}: {e}")
            raise DatabaseError("Failed to fetch consent history")

    def list_students_with_consent(self, search: Optional[str] = None,
                                   active_only: bool = False,
                                   limit: int = 50, offset: int = 0) -> Dict[str, Any]:
        """List students for the admin consent panel. Returns rows joined with the consent row.

        Includes ALL students (consent_active true/false/null) unless active_only=True.
        """
        try:
            # Disambiguate FK: showcase_consent has user_id + recorded_by + revoked_by FKs to users.
            # We want the user_id one (the 1:1 consent record), via showcase_consent_user_id_fkey.
            q = self.client.table('users') \
                .select('id, email, first_name, last_name, display_name, role, organization_id, '
                        'showcase_consent!showcase_consent_user_id_fkey('
                        'consent_active, consent_work, consent_first_name, consent_face, consent_age, '
                        'consent_signed_date, revoked_at, updated_at)',
                        count='exact') \
                .or_('role.eq.student,org_role.eq.student') \
                .order('created_at', desc=True) \
                .range(offset, offset + limit - 1)

            if search:
                # Postgrest 'or' filter — case-insensitive partial match across email/first/last
                q = q.or_(f'email.ilike.%{search}%,first_name.ilike.%{search}%,last_name.ilike.%{search}%')

            res = q.execute()
            rows = res.data or []

            if active_only:
                rows = [r for r in rows if r.get('showcase_consent') and r['showcase_consent'].get('consent_active')]

            return {'students': rows, 'total': res.count or 0}
        except APIError as e:
            logger.error(f"list_students_with_consent failed: {e}")
            raise DatabaseError("Failed to list students")

    # ─── Multi-format evidence helpers ────────────────────────────────────────

    def _fetch_evidence_blocks_for_rows(self, rows: List[Dict[str, Any]]) -> None:
        """Mutate each row to add `evidence_blocks` (ordered list) and `evidence_text_synthesized`
        (concatenation of text-block content). Uses user_task_evidence_documents +
        evidence_document_blocks. Legacy single-format evidence is left alone.

        rows must have `user_id` and `id` (we resolve user_quest_task_id from each).
        """
        if not rows:
            return
        # Map by (user_id, task_id)
        keys = []
        for r in rows:
            tid = r.get('user_quest_task_id') or r.get('task_id')
            if r.get('user_id') and tid:
                keys.append((r['user_id'], tid))

        if not keys:
            return

        user_ids = list({k[0] for k in keys})
        task_ids = list({k[1] for k in keys})

        try:
            doc_res = self.client.table('user_task_evidence_documents') \
                .select('id, user_id, task_id') \
                .in_('user_id', user_ids) \
                .in_('task_id', task_ids) \
                .execute()
            docs = doc_res.data or []
        except APIError as e:
            logger.warning(f"failed to fetch evidence docs: {e}")
            return

        if not docs:
            return

        doc_by_key = {(d['user_id'], d['task_id']): d for d in docs}
        doc_ids = [d['id'] for d in docs]

        try:
            blocks_res = self.client.table('evidence_document_blocks') \
                .select('id, document_id, block_type, content, order_index, is_private') \
                .in_('document_id', doc_ids) \
                .order('order_index') \
                .execute()
            blocks = blocks_res.data or []
        except APIError as e:
            logger.warning(f"failed to fetch evidence blocks: {e}")
            return

        # Group blocks by document_id, exclude private ones from public-facing showcase
        blocks_by_doc = {}
        for b in blocks:
            if b.get('is_private'):
                continue
            blocks_by_doc.setdefault(b['document_id'], []).append(b)

        # Attach to rows
        for r in rows:
            tid = r.get('user_quest_task_id') or r.get('task_id')
            if not (r.get('user_id') and tid):
                continue
            doc = doc_by_key.get((r['user_id'], tid))
            if not doc:
                continue
            row_blocks = blocks_by_doc.get(doc['id'], [])
            r['evidence_blocks'] = row_blocks
            # Synthesize text-only summary for AI prompts and previews
            text_parts = []
            for b in row_blocks:
                if b.get('block_type') == 'text':
                    txt = (b.get('content') or {}).get('text')
                    if txt:
                        text_parts.append(txt)
            if text_parts:
                r['evidence_text_synthesized'] = '\n\n'.join(text_parts)

    # ─── Queue ────────────────────────────────────────────────────────────────

    def list_queue(self, status: Optional[str] = None,
                   pillar: Optional[str] = None,
                   has_image: Optional[bool] = None,
                   include_takedowns: bool = True,
                   limit: int = 30, offset: int = 0) -> Dict[str, Any]:
        """
        List eligible evidence for the marketer queue.

        Eligibility:
          - student has consent_active=true
          - completion is NOT confidential (quest_task_completions.is_confidential=false)
          - completion has been finalized (completed_at IS NOT NULL)

        Returned rows are denormalized: completion fields + status row + student first name + quest title + pillar.
        Status rows are auto-created on first read of an eligible completion.
        """
        try:
            # Step 1: pull consenting students with their tier flags so list rows can honor them
            consent_res = self.client.table('showcase_consent') \
                .select('user_id, consent_work, consent_first_name, consent_face, consent_age') \
                .eq('consent_active', True) \
                .execute()
            consent_rows = consent_res.data or []
            consenting_ids = [r['user_id'] for r in consent_rows]
            consent_by_user = {r['user_id']: r for r in consent_rows}
            if not consenting_ids:
                return {'items': [], 'total': 0}

            # Step 2: pull ALL completions for consenting users (the eligible set is naturally
            # bounded by consenting_ids -- much smaller than the full quest_task_completions
            # table). We sort/filter/paginate in Python so we can rank by status priority,
            # which PostgREST can't express directly.
            sel = ('id, evidence_url, evidence_text, completed_at, user_id, quest_id, '
                   'user_quest_task_id, is_confidential, '
                   'user_quest_tasks!user_quest_task_id(title, pillar, xp_value), '
                   'showcase_evidence_status(id, status, scheduled_for, notes, caption_final, updated_at)')

            res = self.client.table('quest_task_completions').select(sel) \
                .in_('user_id', consenting_ids) \
                .eq('is_confidential', False) \
                .not_.is_('completed_at', 'null') \
                .execute()
            rows = res.data or []

            # Hydrate users + quests separately (FKs don't resolve via PostgREST)
            user_ids_all = list({r['user_id'] for r in rows if r.get('user_id')})
            quest_ids_all = list({r['quest_id'] for r in rows if r.get('quest_id')})
            user_map = {}
            quest_map = {}
            if user_ids_all:
                u_res = self.client.table('users') \
                    .select('id, first_name, last_name, display_name') \
                    .in_('id', user_ids_all) \
                    .execute()
                user_map = {u['id']: u for u in (u_res.data or [])}
            if quest_ids_all:
                q_res = self.client.table('quests') \
                    .select('id, title, image_url') \
                    .in_('id', quest_ids_all) \
                    .execute()
                quest_map = {q['id']: q for q in (q_res.data or [])}
            for r in rows:
                r['users'] = user_map.get(r.get('user_id'), {})
                r['quests'] = quest_map.get(r.get('quest_id'), {})
                r['consent'] = consent_by_user.get(r.get('user_id'))

            # Attach multi-format evidence blocks (text/image/link/etc.)
            self._fetch_evidence_blocks_for_rows(rows)

            # Auto-create missing status rows as 'new'
            missing = [r for r in rows if not r.get('showcase_evidence_status')]
            if missing:
                inserts = [{'evidence_id': r['id'], 'user_id': r['user_id'], 'status': 'new'} for r in missing]
                try:
                    inserted = self.client.table('showcase_evidence_status').insert(inserts).execute()
                    by_evidence = {row['evidence_id']: row for row in (inserted.data or [])}
                    for r in missing:
                        if r['id'] in by_evidence:
                            r['showcase_evidence_status'] = [by_evidence[r['id']]]
                except APIError as e:
                    # Race: re-query to fetch authoritative state
                    logger.warning(f"queue auto-insert collision, re-querying: {e}")
                    again = self.client.table('showcase_evidence_status') \
                        .select('*') \
                        .in_('evidence_id', [r['id'] for r in missing]) \
                        .execute()
                    by_evidence = {row['evidence_id']: row for row in (again.data or [])}
                    for r in missing:
                        if r['id'] in by_evidence:
                            r['showcase_evidence_status'] = [by_evidence[r['id']]]

            def _status_obj(row):
                s = row.get('showcase_evidence_status')
                if isinstance(s, list):
                    return s[0] if s else None
                return s

            def _has_image(row):
                """Image present if evidence_url is set OR any block of type=image with items."""
                if row.get('evidence_url'):
                    return True
                for b in (row.get('evidence_blocks') or []):
                    if b.get('block_type') == 'image':
                        items = (b.get('content') or {}).get('items') or []
                        if items:
                            return True
                return False

            # Filter: explicit status filter wins; otherwise hide dismissed
            filtered = []
            for r in rows:
                cur_status = (_status_obj(r) or {}).get('status') or 'new'
                if status:
                    if cur_status != status:
                        continue
                else:
                    if cur_status == 'dismissed':
                        continue
                pillar_val = (r.get('user_quest_tasks') or {}).get('pillar') if isinstance(r.get('user_quest_tasks'), dict) else None
                if pillar and pillar_val != pillar:
                    continue
                if has_image is not None and bool(_has_image(r)) != has_image:
                    continue
                filtered.append(r)

            # Sort by (status priority asc, completed_at desc): fresh first, then bookmarked,
            # then scheduled, then posted. Within each group newest first.
            filtered.sort(key=lambda r: (
                _STATUS_RANK.get((_status_obj(r) or {}).get('status') or 'new', 0),
                # Sort newer dates first by negating via reverse-string trick on ISO timestamps
                # (lexical sort works on ISO 8601). We use a tuple, so the second key sorts asc;
                # reverse the timestamp by subtracting from a fixed reference is overkill —
                # easier to do two passes:
                r.get('completed_at') or '',
            ))
            # Apply secondary date sort properly (descending) — stable sort preserves status order
            filtered.sort(key=lambda r: r.get('completed_at') or '', reverse=True)
            filtered.sort(key=lambda r: _STATUS_RANK.get((_status_obj(r) or {}).get('status') or 'new', 0))

            total = len(filtered)
            page_slice = filtered[offset:offset + limit]
            return {'items': page_slice, 'total': total}
        except APIError as e:
            logger.error(f"list_queue failed: {e}")
            raise DatabaseError("Failed to list queue")

    def get_evidence_detail(self, evidence_id: str) -> Optional[Dict[str, Any]]:
        """Fetch full evidence + status + posts + consent flags for the composer pane."""
        try:
            sel = ('id, evidence_url, evidence_text, completed_at, user_id, quest_id, '
                   'user_quest_task_id, is_confidential, '
                   'user_quest_tasks!user_quest_task_id(title, pillar, xp_value, description)')
            res = self.client.table('quest_task_completions').select(sel).eq('id', evidence_id).execute()
            if not res.data:
                return None
            row = res.data[0]

            # Fetch users + quests separately (no resolvable PostgREST FK from completions to either)
            if row.get('user_id'):
                u_res = self.client.table('users') \
                    .select('first_name, last_name, display_name, date_of_birth') \
                    .eq('id', row['user_id']) \
                    .execute()
                row['users'] = u_res.data[0] if u_res.data else {}
            else:
                row['users'] = {}
            if row.get('quest_id'):
                q_res = self.client.table('quests') \
                    .select('title, image_url, description, big_idea') \
                    .eq('id', row['quest_id']) \
                    .execute()
                row['quests'] = q_res.data[0] if q_res.data else {}
            else:
                row['quests'] = {}

            # Attach multi-format evidence blocks
            self._fetch_evidence_blocks_for_rows([row])

            # Attach status, posts, consent
            status_res = self.client.table('showcase_evidence_status').select('*').eq('evidence_id', evidence_id).execute()
            row['status_row'] = status_res.data[0] if status_res.data else None

            if row['status_row']:
                posts_res = self.client.table('showcase_posts').select('*') \
                    .eq('evidence_status_id', row['status_row']['id']) \
                    .order('posted_at', desc=True).execute()
                row['posts'] = posts_res.data or []
            else:
                row['posts'] = []

            consent_res = self.client.table('showcase_consent').select('*').eq('user_id', row['user_id']).execute()
            row['consent'] = consent_res.data[0] if consent_res.data else None
            return row
        except APIError as e:
            logger.error(f"get_evidence_detail failed: {e}")
            raise DatabaseError("Failed to fetch evidence detail")

    def update_status(self, evidence_id: str, updates: Dict[str, Any], updated_by: str) -> Dict[str, Any]:
        """Update queue state (status, scheduled_for, notes, caption_final) for an evidence row.

        Auto-creates the status row if missing (looking up the user_id from the completion).
        """
        allowed = {'status', 'scheduled_for', 'notes', 'caption_final'}
        payload = {k: v for k, v in updates.items() if k in allowed}
        if 'status' in payload and payload['status'] not in QUEUE_STATUSES:
            raise ValueError(f"Invalid status: {payload['status']}")

        payload['updated_by'] = updated_by
        payload['updated_at'] = datetime.now(timezone.utc).isoformat()

        try:
            existing = self.client.table('showcase_evidence_status').select('*').eq('evidence_id', evidence_id).execute()
            if existing.data:
                res = self.client.table('showcase_evidence_status').update(payload).eq('evidence_id', evidence_id).execute()
                return res.data[0]

            # Need to look up user_id from the completion
            comp = self.client.table('quest_task_completions').select('user_id').eq('id', evidence_id).execute()
            if not comp.data:
                raise NotFoundError(f"No completion {evidence_id}")
            payload['evidence_id'] = evidence_id
            payload['user_id'] = comp.data[0]['user_id']
            res = self.client.table('showcase_evidence_status').insert(payload).execute()
            return res.data[0]
        except APIError as e:
            logger.error(f"update_status failed for {evidence_id}: {e}")
            raise DatabaseError("Failed to update queue status")

    # ─── Posts ────────────────────────────────────────────────────────────────

    def record_post(self, evidence_id: str, platform: str, post_url: str,
                    caption_used: Optional[str], posted_by: str,
                    notes: Optional[str] = None) -> Dict[str, Any]:
        """Record that an evidence was posted on a platform.

        Side effects:
          - Ensures showcase_evidence_status exists (creates as 'posted' if not)
          - Sets status to 'posted' on the status row
          - Inserts the showcase_posts row
        """
        if platform not in POST_PLATFORMS:
            raise ValueError(f"Invalid platform: {platform}")
        try:
            # Upsert status row
            status_row = self.update_status(evidence_id, {'status': 'posted', 'caption_final': caption_used}, posted_by)
            post_payload = {
                'evidence_status_id': status_row['id'],
                'user_id': status_row['user_id'],
                'platform': platform,
                'post_url': post_url,
                'posted_by': posted_by,
                'caption_used': caption_used,
                'notes': notes,
            }
            res = self.client.table('showcase_posts').insert(post_payload).execute()
            return res.data[0]
        except APIError as e:
            logger.error(f"record_post failed for {evidence_id}: {e}")
            raise DatabaseError("Failed to record post")

    def update_post(self, post_id: str, updates: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        """Update a posted record (post_url edit, take-down marking, notes)."""
        allowed = {'post_url', 'caption_used', 'notes', 'take_down_required'}
        payload = {k: v for k, v in updates.items() if k in allowed}

        # If marking taken down, stamp the metadata
        if updates.get('marked_taken_down'):
            payload['take_down_required'] = False
            payload['take_down_at'] = datetime.now(timezone.utc).isoformat()
            payload['taken_down_by'] = actor_id

        try:
            res = self.client.table('showcase_posts').update(payload).eq('id', post_id).execute()
            if not res.data:
                raise NotFoundError(f"No post {post_id}")
            return res.data[0]
        except APIError as e:
            logger.error(f"update_post failed for {post_id}: {e}")
            raise DatabaseError("Failed to update post")

    def list_pending_takedowns(self) -> List[Dict[str, Any]]:
        """Posts where take_down_required=true and take_down_at is null."""
        try:
            res = self.client.table('showcase_posts') \
                .select('*, users!showcase_posts_user_id_fkey(first_name, last_name, display_name)') \
                .eq('take_down_required', True) \
                .is_('take_down_at', 'null') \
                .order('posted_at', desc=True) \
                .execute()
            return res.data or []
        except APIError as e:
            logger.error(f"list_pending_takedowns failed: {e}")
            raise DatabaseError("Failed to list pending takedowns")

    # ─── Family-dashboard view ────────────────────────────────────────────────

    def list_posts_for_user(self, user_id: str) -> List[Dict[str, Any]]:
        """Public-to-family view: list of posts featuring this student."""
        try:
            res = self.client.table('showcase_posts') \
                .select('id, platform, post_url, posted_at, caption_used, take_down_required, take_down_at') \
                .eq('user_id', user_id) \
                .order('posted_at', desc=True) \
                .execute()
            return res.data or []
        except APIError as e:
            logger.error(f"list_posts_for_user failed for {user_id}: {e}")
            raise DatabaseError("Failed to list user posts")

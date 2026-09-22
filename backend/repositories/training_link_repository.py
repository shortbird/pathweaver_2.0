"""Training links: the org_resources rows the SIS Training page owns.

A training link is an org_resources row with `is_training` set
(supabase/migrations/20260918120000_training_links.sql). It shares the
table with the document library so it inherits the library's targeting
(`visible_to_roles`, `visible_to_user_ids`) and its completion record
(sis_resource_acks) rather than growing a second copy of each. Every read
here filters on the flag, so nothing the Training page shows is a guidebook
and nothing the Resources page shows is a training.

Done-ness is an ack. `version_date` is stamped on every training row at
creation and copied onto the ack, so the same comparison the document library
uses ("acked at or after the row's version") answers "has this person done
it" -- and a later re-version, if one is ever wanted, reuses it unchanged.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows

COLUMNS = (
    'id, organization_id, title, description, url, category, sort_order, '
    'audience, visible_to_roles, visible_to_user_ids, requires_ack, '
    'version_date, created_by, created_at, updated_at'
)

ACK_COLUMNS = 'resource_id, user_id, version_date, acknowledged_at'


class TrainingLinkRepository(BaseRepository):
    table_name = 'org_resources'
    acks_table = 'sis_resource_acks'

    # ── reads ────────────────────────────────────────────────────────────────

    def list_for_org(self, organization_id: str) -> List[Dict[str, Any]]:
        """Every training link one school has set, in the admin's order."""
        return (self.client.table(self.table_name).select(COLUMNS)
                .eq('organization_id', organization_id).eq('is_training', True)
                .order('sort_order').order('title').execute()).data or []

    def get_owned(self, organization_id: str, link_id: str) -> Optional[Dict[str, Any]]:
        """One training link, only if this school owns it. The id comes from
        the browser, so ownership is the first thing checked."""
        rows = (self.client.table(self.table_name).select(COLUMNS)
                .eq('id', link_id).eq('is_training', True).limit(1).execute()).data
        if not rows or rows[0].get('organization_id') != organization_id:
            return None
        return rows[0]

    def member_ids(self, organization_id: str, user_ids: Iterable[str]) -> set:
        """Which of these ids are people in this school -- a link pinned to a
        stranger's id would be visible to nobody and look like a bug."""
        wanted = [str(u) for u in user_ids if u]
        if not wanted:
            return set()
        rows = (self.client.table('users').select('id')
                .eq('organization_id', organization_id).in_('id', wanted)
                .execute()).data or []
        return {r['id'] for r in rows}

    def acks_for_user(self, user_id: str, link_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """{link_id: ack} for one person -- bounded by the org's link count."""
        if not link_ids:
            return {}
        rows = (self.client.table(self.acks_table).select(ACK_COLUMNS)
                .eq('user_id', user_id).in_('resource_id', link_ids)
                .execute()).data or []
        return {r['resource_id']: r for r in rows}

    def acks_for_links(self, link_ids: List[str]) -> List[Dict[str, Any]]:
        """Every ack on these links, for the who-has-done-what report.

        Paged: the row count is staff x links, which a school with a long
        catalog pushes past the 1,000-row cap PostgREST truncates at silently.
        """
        if not link_ids:
            return []
        return fetch_all_rows(lambda: (
            self.client.table(self.acks_table).select(ACK_COLUMNS)
            .in_('resource_id', link_ids)
        ))

    # ── writes ───────────────────────────────────────────────────────────────
    # Named *_link rather than create/update/delete: BaseRepository's three
    # return a row (or raise) and take an owner predicate, and an override
    # with a different contract fails the release's mypy gate (2026-09-15).

    def create_link(self, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """A training link, for whichever audience the caller resolved.

        `audience` was hardcoded to 'staff' until 2026-09-22, and that hardcode
        was the only thing keeping a teacher training out of the family
        document library: sis_parent_service.org_resources reads
        audience in (families, all) and did not filter `is_training`, so a
        family-audience training link would have appeared there AND on the
        training list. That query now excludes training, which is what makes it
        safe for this to honour what the admin chose (ae16c5da).

        Callers pass the org_resources vocabulary (families/staff/all), not the
        training one (staff/family/student) — the column's CHECK constraint
        knows only the former. sis_training_service.resource_audience is the
        one place that translates.
        """
        now = datetime.now(timezone.utc).isoformat()
        rows = (self.client.table(self.table_name).insert({
            'audience': 'staff',
            **fields,
            'is_training': True,
            # Stamped so acks have a version to match.
            'version_date': now,
        }).execute()).data
        return rows[0] if rows else None

    def update_link(self, link_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.table_name).update({
            **fields,
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }).eq('id', link_id).eq('is_training', True).execute()).data
        return rows[0] if rows else None

    def delete_link(self, link_id: str) -> None:
        self.client.table(self.table_name).delete() \
            .eq('id', link_id).eq('is_training', True).execute()

    def mark_done(self, link_id: str, user_id: str,
                  version_date: Optional[str]) -> Optional[Dict[str, Any]]:
        """Record that this person has done the training. Idempotent: pressing
        it twice refreshes the timestamp rather than tripping the unique key."""
        rows = (self.client.table(self.acks_table).upsert({
            'resource_id': link_id, 'user_id': user_id,
            'version_date': version_date,
            'acknowledged_at': datetime.now(timezone.utc).isoformat(),
        }, on_conflict='resource_id,user_id').execute()).data
        return rows[0] if rows else None

    def unmark_done(self, link_id: str, user_id: str) -> None:
        """The undo. Somebody who pressed done on the wrong row."""
        self.client.table(self.acks_table).delete() \
            .eq('resource_id', link_id).eq('user_id', user_id).execute()

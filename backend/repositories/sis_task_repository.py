"""Tasks: the rows of sis_onboarding_assignments, their comment threads, and
the recurring schedules that mint them.

The table keeps its onboarding name because the signature hold is keyed on it
(utils/signature_hold.py); since 2026-09-24 every task in the SIS lives there
(supabase/migrations/20260924100000_tasks_one_table.sql). The older reads and
writes still sit in services/sis_onboarding_service.py; this repository holds
the queries the task-center code added on top -- comments, schedules, counts --
so the new code does not add `.table()` calls above the repository layer.

Service-role client throughout: all three tables are RLS-on with no policies,
reached only through the backend, whose route gates (role + org, or "is this
your own task") are the authorization.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows

TASK_KINDS = ('checklist', 'task')


class SisTaskRepository(BaseRepository):
    table_name = 'sis_onboarding_assignments'
    comments_table = 'sis_task_comments'
    schedules_table = 'sis_task_schedules'

    # ── tasks ────────────────────────────────────────────────────────────────

    def get(self, task_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.table_name).select('*')
                .eq('id', task_id).limit(1).execute()).data
        return rows[0] if rows else None

    def list_for_schedule(self, schedule_id: str, since: Optional[str] = None,
                          until: Optional[str] = None) -> List[Dict[str, Any]]:
        """Every occurrence of one schedule, optionally within [since, until].
        Grows by a row per person per day, so it pages."""
        def _q():
            q = (self.client.table(self.table_name)
                 .select('id, user_id, occurrence_date, status, items, updated_at, audience')
                 .eq('schedule_id', schedule_id))
            if since:
                q = q.gte('occurrence_date', since)
            if until:
                q = q.lte('occurrence_date', until)
            return q
        return fetch_all_rows(_q)

    def occurrence_user_ids(self, schedule_id: str, occurrence_date: str) -> set:
        """Who already has this schedule's task for this day. One day of one
        schedule is bounded by its recipient list."""
        rows = (self.client.table(self.table_name).select('user_id')
                .eq('schedule_id', schedule_id).eq('occurrence_date', occurrence_date)
                .execute()).data or []
        return {r['user_id'] for r in rows}

    def expire_before(self, now_iso: str) -> int:
        """Mark every unfinished occurrence whose day has ended as expired.
        Returns how many rows changed."""
        rows = (self.client.table(self.table_name)
                .update({'status': 'expired', 'updated_at': now_iso})
                .eq('status', 'in_progress')
                .not_.is_('expires_at', 'null')
                .lt('expires_at', now_iso)
                .execute()).data or []
        return len(rows)

    def count_open(self, organization_id: str) -> int:
        """Tasks somebody still owes. Counted by Postgres, never len()."""
        return (self.client.table(self.table_name).select('id', count='exact')
                .eq('organization_id', organization_id)
                .in_('kind', list(TASK_KINDS)).eq('status', 'in_progress')
                .limit(1).execute()).count or 0

    def count_overdue(self, organization_id: str, today: str) -> int:
        """Open tasks whose due date has passed."""
        return (self.client.table(self.table_name).select('id', count='exact')
                .eq('organization_id', organization_id)
                .in_('kind', list(TASK_KINDS)).eq('status', 'in_progress')
                .lt('due_date', today)
                .limit(1).execute()).count or 0

    def open_for_user(self, organization_id: str, user_id: str) -> List[Dict[str, Any]]:
        """One person's open tasks. Bounded by that person."""
        return (self.client.table(self.table_name)
                .select('id, template_name, due_date, priority, action, status, '
                        'audience, items, created_at, kind')
                .eq('organization_id', organization_id).eq('user_id', user_id)
                .eq('status', 'in_progress')
                .order('created_at', desc=True).limit(100).execute()).data or []

    # ── comments ─────────────────────────────────────────────────────────────

    def list_comments(self, task_id: str) -> List[Dict[str, Any]]:
        return (self.client.table(self.comments_table)
                .select('id, task_id, author_id, body, created_at')
                .eq('task_id', task_id).order('created_at')
                .limit(500).execute()).data or []

    def add_comment(self, organization_id: str, task_id: str, author_id: str,
                    body: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.comments_table).insert({
            'organization_id': organization_id, 'task_id': task_id,
            'author_id': author_id, 'body': body,
        }).execute()).data
        return rows[0] if rows else None

    def comment_counts(self, task_ids: Iterable[str]) -> Dict[str, int]:
        """task_id -> number of comments, for the ids given. Bounded by the
        caller's list (one person's tasks)."""
        ids = [t for t in task_ids if t]
        if not ids:
            return {}
        out: Dict[str, int] = {}
        for i in range(0, len(ids), 100):
            rows = (self.client.table(self.comments_table).select('task_id')
                    .in_('task_id', ids[i:i + 100]).execute()).data or []
            for r in rows:
                out[r['task_id']] = out.get(r['task_id'], 0) + 1
        return out

    # ── schedules ────────────────────────────────────────────────────────────

    def list_schedules(self, organization_id: str) -> List[Dict[str, Any]]:
        return (self.client.table(self.schedules_table).select('*')
                .eq('organization_id', organization_id)
                .order('created_at', desc=True).execute()).data or []

    def get_schedule(self, schedule_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.schedules_table).select('*')
                .eq('id', schedule_id).limit(1).execute()).data
        return rows[0] if rows else None

    def insert_schedule(self, row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rows = self.client.table(self.schedules_table).insert(row).execute().data
        return rows[0] if rows else None

    def update_schedule(self, schedule_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.schedules_table).update(fields)
                .eq('id', schedule_id).execute()).data
        return rows[0] if rows else None

    def active_schedules(self) -> List[Dict[str, Any]]:
        """Every live schedule on the platform, for the cron."""
        return fetch_all_rows(lambda: (
            self.client.table(self.schedules_table).select('*').eq('active', True)))

    def org_timezones(self, organization_ids: Iterable[str]) -> Dict[str, Optional[str]]:
        ids = list({o for o in organization_ids if o})
        if not ids:
            return {}
        rows = (self.client.table('organizations').select('id, timezone')
                .in_('id', ids).execute()).data or []
        return {r['id']: r.get('timezone') for r in rows}

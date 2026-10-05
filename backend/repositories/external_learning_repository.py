"""Data access for outside learning platforms: which Optio student is which
platform student (lms_integrations), and which platform days the sync has
already read (external_learning_days).

Authorization is the caller's: the SIS routes (routes/sis/bloomy.py) gate by
role and resolved org, and the nightly sweep runs behind the cron secret.
Nothing here decides who may ask.
"""

from typing import Any, Dict, Iterable, List, Optional

from repositories.base_repository import BaseRepository
from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger
from utils.timestamps import now_iso

logger = get_logger(__name__)

DAYS_TABLE = 'external_learning_days'
LINKS_TABLE = 'lms_integrations'


class ExternalLearningRepository(BaseRepository):
    table_name = DAYS_TABLE

    def __init__(self, client=None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: the sync writes to students' records
            # from a cron with no user session, and a coach links another
            # person's (a student's) account. external_learning_days is
            # RLS deny-all by design. The route gate or the cron secret
            # decides; this touches only the org and ids it is handed.
            client = get_supabase_admin_client()
        super().__init__(client=client)

    # --- links --------------------------------------------------------------

    def links(self, org_id: str, platform: str) -> List[Dict[str, Any]]:
        """Every link at the org, enabled or not. Bounded by the roster, paged
        anyway."""
        return fetch_all_rows(lambda: (
            self.client.table(LINKS_TABLE)
            .select('id, user_id, lms_user_id, sync_enabled, sync_status, last_sync_at')
            .eq('organization_id', org_id)
            .eq('lms_platform', platform)
        ))

    def link_for_platform_user(self, platform: str, platform_user_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(LINKS_TABLE).select('id, user_id, organization_id')
                .eq('lms_platform', platform).eq('lms_user_id', platform_user_id)
                .limit(1).execute()).data or []
        return rows[0] if rows else None

    def delete_links(self, org_id: str, platform: str, *, user_id: Optional[str] = None,
                     platform_user_id: Optional[str] = None) -> None:
        query = (self.client.table(LINKS_TABLE).delete()
                 .eq('organization_id', org_id).eq('lms_platform', platform))
        if user_id:
            query = query.eq('user_id', user_id)
        if platform_user_id:
            query = query.eq('lms_user_id', platform_user_id)
        query.execute()

    def insert_link(self, org_id: str, platform: str, user_id: str, platform_user_id: str) -> None:
        self.client.table(LINKS_TABLE).insert({
            'organization_id': org_id,
            'user_id': user_id,
            'lms_platform': platform,
            'lms_user_id': platform_user_id,
            'sync_enabled': True,
            'sync_status': 'active',
        }).execute()

    def mark_synced(self, org_id: str, platform: str, status: str = 'active') -> None:
        (self.client.table(LINKS_TABLE)
         .update({'last_sync_at': now_iso(), 'sync_status': status, 'updated_at': now_iso()})
         .eq('organization_id', org_id).eq('lms_platform', platform).execute())

    # --- days ---------------------------------------------------------------

    def days(self, org_id: str, platform: str, user_ids: Iterable[str],
             date_from: str, date_to: str) -> List[Dict[str, Any]]:
        """Day rows for these students between two dates, inclusive."""
        ids = list(user_ids)
        if not ids:
            return []
        return fetch_all_rows(lambda: (
            self.client.table(DAYS_TABLE)
            .select('user_id, subject, activity_date, skills_worked, skills_mastered, '
                    'learning_hours_total, user_quest_task_id')
            .eq('organization_id', org_id)
            .eq('platform', platform)
            .in_('user_id', ids)
            .gte('activity_date', date_from)
            .lte('activity_date', date_to)
        ))

    def latest_hours_before(self, org_id: str, platform: str, user_ids: Iterable[str],
                            before: str) -> Dict[str, float]:
        """user_id -> the newest lifetime-hours snapshot dated before `before`.

        One read per student, bounded to one row each; the check-in board asks
        for one school's roster.
        """
        out: Dict[str, float] = {}
        for uid in user_ids:
            rows = (self.client.table(DAYS_TABLE).select('learning_hours_total')
                    .eq('organization_id', org_id).eq('platform', platform)
                    .eq('user_id', uid).lt('activity_date', before)
                    .not_.is_('learning_hours_total', 'null')
                    .order('activity_date', desc=True).limit(1).execute()).data or []
            if rows:
                out[uid] = float(rows[0]['learning_hours_total'])
        return out

    def insert_day(self, row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """The new row, or None when that (student, platform, subject, day)
        is already recorded -- the unique key is the sync's idempotency."""
        try:
            data = self.client.table(DAYS_TABLE).insert(row).execute().data
        except Exception as e:  # noqa: BLE001
            if '23505' in str(e) or 'duplicate key' in str(e):
                return None
            raise
        return data[0] if data else None

    def attach_task(self, day_id: str, user_quest_task_id: str) -> None:
        (self.client.table(DAYS_TABLE).update({'user_quest_task_id': user_quest_task_id})
         .eq('id', day_id).execute())

    def delete_day(self, day_id: str) -> None:
        self.client.table(DAYS_TABLE).delete().eq('id', day_id).execute()

    # --- what the sync writes on a student's record --------------------------

    def student_row(self, user_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('users').select('id, organization_id, role, org_role')
                .eq('id', user_id).limit(1).execute()).data or []
        return rows[0] if rows else None

    def orgs_with_module(self, key: str) -> List[str]:
        """Ids of orgs whose feature_flags.modules turns `key` on explicitly."""
        rows = (self.client.table('organizations').select('id')
                .eq(f'feature_flags->modules->>{key}', 'true').execute()).data or []
        return [r['id'] for r in rows]

    def quest_tagged(self, org_id: str, tag: str, value: str) -> Optional[str]:
        """The org's quest whose metadata[tag] is `value`, if any."""
        rows = (self.client.table('quests').select('id')
                .eq('organization_id', org_id).eq(f'metadata->>{tag}', value)
                .limit(1).execute()).data or []
        return rows[0]['id'] if rows else None

    def tag_quest(self, quest_id: str, tag: str, value: str) -> None:
        rows = (self.client.table('quests').select('metadata').eq('id', quest_id)
                .limit(1).execute()).data or []
        meta = (rows[0].get('metadata') if rows else None) or {}
        self.client.table('quests').update({'metadata': {**meta, tag: value}}) \
            .eq('id', quest_id).execute()

    def enrollment_id(self, user_id: str, quest_id: str) -> Optional[str]:
        rows = (self.client.table('user_quests').select('id')
                .eq('user_id', user_id).eq('quest_id', quest_id)
                .order('created_at', desc=True).limit(1).execute()).data or []
        return rows[0]['id'] if rows else None

    def insert_task(self, row: Dict[str, Any]) -> Dict[str, Any]:
        return self.client.table('user_quest_tasks').insert(row).execute().data[0]

    def record_xp_failure(self, row: Dict[str, Any]) -> None:
        self.client.table('xp_award_failures').insert(row).execute()

    def org_students(self, org_id: str) -> List[Dict[str, Any]]:
        """The org's student accounts, for a link picker. Bounded by the
        roster, paged anyway."""
        rows = fetch_all_rows(lambda: (
            self.client.table('users')
            .select('id, first_name, last_name, display_name, preferred_name, role, org_role')
            .eq('organization_id', org_id)
        ))
        return [r for r in rows if 'student' in (r.get('role'), r.get('org_role'))]

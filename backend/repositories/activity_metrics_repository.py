"""
Reads behind the activity dashboards (services/activity_metrics_service.py):
the superadmin home's per-organization activity, pipelines and sign-in list,
and the SIS School Dashboard's school activity.

The aggregates are SQL functions (supabase/migrations/
20261012200000_activity_dashboards.sql), service-role only, because
user_activity_events outgrows PostgREST's 1,000-row cap. login_attempts is
service-role only too. So this runs on the admin client; every caller is
behind require_superadmin or the SIS dashboard's ADMIN_ROLES and org gate.
"""

from typing import Any, Dict, List, Tuple

from repositories.base_repository import BaseRepository

USER_COLUMNS = ('id, email, first_name, last_name, display_name, role, org_role, '
                'organization_id, last_active')


class ActivityMetricsRepository(BaseRepository):
    table_name = 'user_activity_events'
    id_column = 'id'

    # ---------------------------------------------------------- aggregates

    def org_activity(self, days: int) -> List[Dict[str, Any]]:
        return self.client.rpc('admin_org_activity', {'p_days': days}).execute().data or []

    def platform_pipelines(self, days: int) -> Dict[str, Any]:
        return self.client.rpc('admin_platform_pipelines', {'p_days': days}).execute().data or {}

    def school_activity(self, org_id: str, days: int) -> Dict[str, Any]:
        return (self.client.rpc('sis_org_activity', {'p_org_id': org_id, 'p_days': days})
                .execute().data or {})

    def accounts_created(self, since_iso: str) -> Tuple[int, int]:
        """(all accounts, accounts belonging to an organization) made since."""
        total = (self.client.table('users').select('id', count='exact')
                 .gte('created_at', since_iso).limit(1).execute()).count or 0
        school = (self.client.table('users').select('id', count='exact')
                  .gte('created_at', since_iso).not_.is_('organization_id', 'null')
                  .limit(1).execute()).count or 0
        return total, school

    # ------------------------------------------------------------- sign-in

    def failing_logins(self, since_naive_iso: str, min_failures: int,
                       limit: int = 200) -> List[Dict[str, Any]]:
        """login_attempts rows still counting failures, newest first.

        A successful sign-in zeroes attempt_count, so a row here is an email
        nobody has signed in to since. The column is naive UTC.
        """
        return (self.client.table('login_attempts')
                .select('email, attempt_count, locked_until, updated_at, lockout_count')
                .gte('updated_at', since_naive_iso)
                .gte('attempt_count', min_failures)
                .order('updated_at', desc=True)
                .limit(limit)
                .execute()).data or []

    def users_by_email(self, emails: List[str]) -> List[Dict[str, Any]]:
        if not emails:
            return []
        return (self.client.table('users').select(USER_COLUMNS)
                .in_('email', emails).execute()).data or []

    def org_names(self, org_ids: List[str]) -> Dict[str, str]:
        if not org_ids:
            return {}
        rows = (self.client.table('organizations').select('id, name')
                .in_('id', org_ids).execute()).data or []
        return {r['id']: r.get('name') for r in rows}

    def households_for(self, user_ids: List[str]) -> Dict[str, str]:
        if not user_ids:
            return {}
        rows = (self.client.table('household_members').select('user_id, household_id')
                .in_('user_id', user_ids).execute()).data or []
        return {r['user_id']: r['household_id'] for r in rows}

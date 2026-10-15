"""Counts behind the org stage of credit review.

A student's credit request waits at diploma_status 'pending_org_approval' until
the school approves it on to Optio (routes/credit_dashboard/org_admin_actions.py).
The SIS School Dashboard shows how many wait, as a door to /credit-review
(services/sis_dashboard_service.py).

Client-injected: the dashboard hands in the service-role client its own role
and org gate justified. With no client it takes the admin client itself.

quest_task_completions has no organization_id, and its user_id points at
auth.users, so there is no embed to filter through: the school's member ids are
read (paged -- a truncated read would undercount) and Postgres counts each
chunk of them.
"""

from typing import Any

from utils.db_fetch import fetch_all_rows

# How many ids go into one `in.()` filter. The ids ride in the URL, so a whole
# school in one request risks the gateway's URL limit.
ID_CHUNK = 150


class CreditReviewQueueRepository:

    def __init__(self, client: Any = None):
        if client is None:
            from database import get_supabase_admin_client
            # admin client justified: the count spans every student in one
            # org, which no single caller can read under RLS; the caller's
            # role and org gate decided it may see the number.
            client = get_supabase_admin_client()
        self.client = client

    def pending_org_approval_count(self, org_id: str) -> int:
        """Credit requests from this org's members waiting on the org's approval."""
        ids = [r['id'] for r in fetch_all_rows(lambda: (
            self.client.table('users').select('id').eq('organization_id', org_id)))]
        total = 0
        for i in range(0, len(ids), ID_CHUNK):
            res = (self.client.table('quest_task_completions').select('id', count='exact')
                   .eq('diploma_status', 'pending_org_approval')
                   .in_('user_id', ids[i:i + ID_CHUNK])
                   .limit(1).execute())
            total += res.count or 0
        return total

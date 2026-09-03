"""
CRM Repository - data access for the marketing suppression list.

The CRM's other tables are still read directly by crm_service /
crm_funnel_engine (see docs/CRM_REPLACEMENT_PLAN.md); this repository holds
the suppression operations, which two callers have to agree on:

  * the SendGrid event webhook   (bounce / spam report / unsubscribe)
  * the admin console            (add / remove by hand)

Keeping "close this mailbox" and "reopen it" in one place is what stops those
drifting — an earlier version of the admin path exited the funnel membership
but left crm_leads.status alone, so an un-suppress un-suppressed nothing and
the lead stayed permanently unmailable.

The unsubscribe link (crm_funnel_engine.unsubscribe_by_token) deliberately
does NOT share this path: it writes the same suppression row but marks the
lead 'unsubscribed' rather than 'suppressed', because who closed the mailbox
matters — the recipient asked, we did not decide.

All CRM tables are service-role only (RLS enabled, zero policies), so these
run on the admin client; every caller is either cron, a signed webhook, or
behind require_superadmin.
"""

from typing import Any, Dict, List, Optional

from postgrest.exceptions import APIError

from repositories.base_repository import BaseRepository
from utils.logger import get_logger

logger = get_logger(__name__)


from utils.timestamps import now_iso as _now_iso  # noqa: E402


#: SendGrid reports transient delivery failures ('blocked' — no MX, SMTP
#: timeout, greylisting) under the same event name as permanent ones. A
#: transient failure is not a dead mailbox until it keeps happening.
TRANSIENT_BOUNCE_TYPES = frozenset({'blocked', 'deferred'})
TRANSIENT_BOUNCE_STRIKES = 3


class CrmRepository(BaseRepository):
    """Repository for crm_suppressions and the lead/membership state that
    follows from a suppression."""

    table_name = 'crm_suppressions'
    id_column = 'id'

    # ------------------------------------------------------------ bounces

    def transient_bounce_count(self, email: str) -> int:
        """How many transient bounces this address has already recorded.

        Counted from the event ledger rather than tracked on the lead, so a
        webhook redelivery (deduped on sg_event_id before it ever reaches
        here) cannot inflate it.
        """
        try:
            rows = (
                self.client.table('crm_email_events')
                .select('payload')
                .eq('email', email.lower())
                .eq('event_type', 'bounce')
                .limit(50)
                .execute()
            ).data or []
        except APIError as exc:
            logger.warning(f'CRM bounce-history lookup failed: {exc}')
            return 0
        return sum(
            1 for r in rows
            if ((r.get('payload') or {}).get('type') in TRANSIENT_BOUNCE_TYPES)
        )

    def bounce_is_permanent(self, event: Dict[str, Any], email: str) -> bool:
        """Whether a bounce event should close the mailbox.

        A transient type earns nothing until it has happened enough times to
        stop looking transient — an address whose domain has no MX answers
        every attempt with a timeout, and ignoring that forever would mail it
        once per step, on every funnel, indefinitely.
        """
        if event.get('type') not in TRANSIENT_BOUNCE_TYPES:
            return True
        if self.transient_bounce_count(email) < TRANSIENT_BOUNCE_STRIKES:
            return False
        logger.info('CRM: repeated transient bounces; treating as permanent')
        return True

    # ------------------------------------------------------- suppressions

    def list_suppressions(self, *, search: Optional[str] = None,
                          offset: int = 0, limit: int = 25):
        """(rows, total) for the admin console, newest first."""
        query = self.client.table(self.table_name).select('*', count='exact')
        if search:
            query = query.ilike('email', f'%{search}%')
        result = (query.order('created_at', desc=True)
                  .range(offset, offset + limit - 1).execute())
        return (result.data or []), (result.count or 0)

    def find_suppression(self, suppression_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.table_name).select('*')
                .eq('id', suppression_id).limit(1).execute()).data
        return rows[0] if rows else None

    def suppress(self, email: str, reason: str, source: str) -> bool:
        """Close a mailbox for marketing: record the suppression, mark the
        lead, and exit any funnel it is mid-way through.

        Idempotent — an address already on the list just has its lead and
        memberships re-checked. Returns True if a new row was written.
        """
        email = email.lower().strip()
        created = True
        try:
            self.client.table(self.table_name).insert({
                'email': email, 'reason': reason, 'source': source,
            }).execute()
        except APIError as exc:
            logger.debug(f'CRM suppression already present: {exc}')
            created = False

        for lead in self._leads_for(email):
            if lead.get('status') == 'active':
                self._set_lead_status(lead['id'], 'suppressed')
            self._exit_active_memberships(lead['id'], 'suppressed')
        return created

    def unsuppress(self, email: str) -> None:
        """Reopen a mailbox. The lead goes back to 'active' only if it was
        suppressed — a converted or unsubscribed lead keeps its own status,
        which outranks this.

        Funnel memberships are NOT reopened: exiting was correct at the time,
        and re-entry is a deliberate decision (see
        scripts/backfill_onboarding_memberships.py), not a side effect of
        tidying the suppression list.
        """
        email = email.lower().strip()
        self.client.table('crm_leads').update({
            'status': 'active', 'updated_at': _now_iso(),
        }).eq('email', email).eq('status', 'suppressed').execute()

    # ------------------------------------------------------------ helpers

    def _leads_for(self, email: str) -> List[Dict[str, Any]]:
        return (self.client.table('crm_leads').select('id, status')
                .eq('email', email).limit(1).execute()).data or []

    def _set_lead_status(self, lead_id: str, status: str) -> None:
        self.client.table('crm_leads').update({
            'status': status, 'updated_at': _now_iso(),
        }).eq('id', lead_id).execute()

    def _exit_active_memberships(self, lead_id: str, reason: str) -> None:
        rows = (self.client.table('crm_funnel_memberships').select('id')
                .eq('lead_id', lead_id).eq('status', 'active').execute()).data or []
        for row in rows:
            self.client.table('crm_funnel_memberships').update({
                'status': 'exited', 'exit_reason': reason,
                'exited_at': _now_iso(),
            }).eq('id', row['id']).execute()

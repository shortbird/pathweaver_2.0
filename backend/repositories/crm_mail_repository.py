"""
Storage for the CRM's connected Gmail mailbox (docs/CRM_AI_ASSISTANT_PLAN.md):
the account row and its OAuth token, sync bookkeeping in crm_settings, stored
messages, the send-path state of a draft, and the reply hook's funnel exits.

crm_* tables are service-role only (RLS on, no policies; crm_mail_accounts
also has grants revoked), so this runs on the admin client. Callers are the
superadmin console and the cron-secret sync.
"""

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.timestamps import now_iso


class CrmMailRepository(BaseRepository):
    table_name = 'crm_mail_accounts'
    id_column = 'id'

    # ----------------------------------------------------------- account

    def account(self) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('crm_mail_accounts').select('*')
                .order('connected_at', desc=True).limit(1).execute()).data
        return rows[0] if rows else None

    def replace_account(self, email: str, fields: Dict[str, Any]) -> None:
        """One mailbox: any other address's row goes."""
        self.client.table('crm_mail_accounts').delete().neq('email', email).execute()
        self.client.table('crm_mail_accounts').upsert(
            {'email': email, **fields, 'updated_at': now_iso()}, on_conflict='email').execute()

    def update_account(self, account_id: str, fields: Dict[str, Any]) -> None:
        self.client.table('crm_mail_accounts').update(
            {**fields, 'updated_at': now_iso()}).eq('id', account_id).execute()

    def delete_account(self, account_id: str) -> None:
        self.client.table('crm_mail_accounts').delete().eq('id', account_id).execute()

    # ---------------------------------------------------------- settings

    def setting(self, key: str) -> Any:
        rows = (self.client.table('crm_settings').select('value').eq('key', key)
                .limit(1).execute()).data
        return rows[0]['value'] if rows else None

    def set_setting(self, key: str, value: Any) -> None:
        self.client.table('crm_settings').upsert(
            {'key': key, 'value': value, 'updated_at': now_iso()}).execute()

    def delete_setting(self, key: str) -> None:
        self.client.table('crm_settings').delete().eq('key', key).execute()

    # ---------------------------------------------------------- contacts

    def lead_emails(self, emails: List[str]) -> List[str]:
        return [r['email'] for r in (self.client.table('crm_leads').select('email')
                                     .in_('email', emails).execute()).data or []]

    def users_by_email(self, emails: List[str]) -> List[Dict[str, Any]]:
        return (self.client.table('users').select('id, email, role, org_role')
                .in_('email', emails).execute()).data or []

    def lead_ids_by_email(self, emails: List[str]) -> Dict[str, str]:
        return {r['email']: r['id'] for r in (
            self.client.table('crm_leads').select('id, email')
            .in_('email', emails).execute()).data or []}

    def display_name(self, user_id: str) -> Optional[str]:
        rows = (self.client.table('users').select('first_name, last_name').eq('id', user_id)
                .limit(1).execute()).data
        if not rows:
            return None
        return ' '.join(p for p in (rows[0].get('first_name'), rows[0].get('last_name')) if p) or None

    # ---------------------------------------------------------- messages

    def upsert_message(self, row: Dict[str, Any]) -> None:
        self.client.table('crm_messages').upsert(row, on_conflict='gmail_message_id').execute()

    # ------------------------------------------------------------ drafts

    def claim_draft_for_send(self, draft_id: str) -> bool:
        """Move a draft to 'sending'. Only one caller can win."""
        return bool((self.client.table('crm_drafts')
                     .update({'status': 'sending', 'updated_at': now_iso()})
                     .eq('id', draft_id).eq('status', 'draft').execute()).data)

    def release_draft(self, draft_id: str) -> None:
        self.client.table('crm_drafts').update({'status': 'draft', 'updated_at': now_iso()}) \
            .eq('id', draft_id).eq('status', 'sending').execute()

    def mark_draft_sent(self, draft_id: str, gmail_message_id: Optional[str],
                        sent_by: str) -> Optional[Dict[str, Any]]:
        now = now_iso()
        rows = (self.client.table('crm_drafts').update({
            'status': 'sent', 'gmail_message_id': gmail_message_id, 'sent_at': now,
            'sent_by': sent_by, 'updated_at': now,
        }).eq('id', draft_id).execute()).data
        return rows[0] if rows else None

    # ------------------------------------------------------ reply → funnel

    def exit_active_funnels(self, lead_id: str, reason: str) -> int:
        active = (self.client.table('crm_funnel_memberships').select('id')
                  .eq('lead_id', lead_id).eq('status', 'active').execute()).data or []
        for membership in active:
            self.client.table('crm_funnel_memberships').update({
                'status': 'exited', 'exit_reason': reason, 'exited_at': now_iso(),
            }).eq('id', membership['id']).eq('status', 'active').execute()
        return len(active)

    def record_lead_event(self, lead_id: str, event_type: str, detail: Dict[str, Any]) -> None:
        self.client.table('crm_events').insert({
            'lead_id': lead_id, 'event_type': event_type, 'detail': detail,
        }).execute()

"""
A CRM contact's working file: email history, to-dos and drafts
(docs/CRM_AI_ASSISTANT_PLAN.md).

A contact is a lowercased email address; leads and users both resolve to one.
Every read here is bounded by one contact, so no truncation concern, except
`client_contacts`, which is bounded by the handful of client orgs.

crm_* tables are service-role only (RLS on, no policies), so this runs on the
admin client; every caller is behind require_superadmin or the cron secret.
"""

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.timestamps import now_iso

TASK_STATUSES = ('suggested', 'open', 'done', 'dismissed')
MESSAGE_COLUMNS = ('id, gmail_message_id, thread_id, rfc_message_id, direction, from_email, '
                   'to_emails, cc_emails, subject, snippet, body_text, sent_at')
CLIENT_ORGS_KEY = 'client_org_ids'


def normalize_email(email: Optional[str]) -> str:
    return (email or '').strip().lower()


class CrmContactRepository(BaseRepository):
    table_name = 'crm_tasks'
    id_column = 'id'

    # ---------------------------------------------------------- messages

    def messages_for(self, email: str, limit: int = 100) -> List[Dict[str, Any]]:
        return (self.client.table('crm_messages').select(MESSAGE_COLUMNS)
                .contains('contact_emails', [email])
                .order('sent_at', desc=True).limit(limit)
                .execute()).data or []

    def latest_message_in_thread(self, thread_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('crm_messages').select(MESSAGE_COLUMNS)
                .eq('thread_id', thread_id).order('sent_at', desc=True)
                .limit(1).execute()).data
        return rows[0] if rows else None

    # ------------------------------------------------------------- tasks

    def tasks_for(self, email: str) -> List[Dict[str, Any]]:
        return (self.client.table('crm_tasks').select('*')
                .eq('contact_email', email)
                .in_('status', ['suggested', 'open', 'done'])
                .order('created_at', desc=True)
                .execute()).data or []

    def due_tasks(self, on_or_before: str, limit: int = 200) -> List[Dict[str, Any]]:
        """Open to-dos due by a date, oldest first. One person's queue, so
        a few hundred rows at most; the limit is a guard, not a page."""
        return (self.client.table('crm_tasks').select('*')
                .eq('status', 'open').lte('due_on', on_or_before)
                .order('due_on').limit(limit)
                .execute()).data or []

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('crm_tasks').select('*').eq('id', task_id)
                .limit(1).execute()).data
        return rows[0] if rows else None

    def create_task(self, email: str, title: str, *, due_on: Optional[str] = None,
                    detail: Optional[str] = None, status: str = 'open',
                    source: str = 'manual', source_ref: Optional[str] = None,
                    created_by: Optional[str] = None) -> Dict[str, Any]:
        return (self.client.table('crm_tasks').insert({
            'contact_email': email, 'title': title, 'detail': detail,
            'due_on': due_on, 'status': status, 'source': source,
            'source_ref': source_ref, 'created_by': created_by,
        }).execute()).data[0]

    def update_task(self, task_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        updates = {**fields, 'updated_at': now_iso()}
        if 'status' in fields:
            updates['completed_at'] = now_iso() if fields['status'] == 'done' else None
        rows = (self.client.table('crm_tasks').update(updates)
                .eq('id', task_id).execute()).data
        return rows[0] if rows else None

    # ------------------------------------------------------------ drafts

    def drafts_for(self, email: str) -> List[Dict[str, Any]]:
        return (self.client.table('crm_drafts').select('*')
                .eq('contact_email', email).in_('status', ['draft', 'sending'])
                .order('created_at', desc=True)
                .execute()).data or []

    def get_draft(self, draft_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('crm_drafts').select('*').eq('id', draft_id)
                .limit(1).execute()).data
        return rows[0] if rows else None

    def create_draft(self, fields: Dict[str, Any]) -> Dict[str, Any]:
        return (self.client.table('crm_drafts').insert(fields).execute()).data[0]

    def update_draft(self, draft_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Edits apply only while the draft is still a draft."""
        rows = (self.client.table('crm_drafts')
                .update({**fields, 'updated_at': now_iso()})
                .eq('id', draft_id).eq('status', 'draft').execute()).data
        return rows[0] if rows else None

    # ----------------------------------------------------------- clients

    def active_orgs(self) -> List[Dict[str, Any]]:
        return (self.client.table('organizations').select('id, name, slug')
                .eq('is_active', True).is_('archived_at', 'null')
                .order('name').execute()).data or []

    def file_links(self, emails: List[str]) -> Dict[str, str]:
        """email -> the console path of that contact's file: their person
        file when they have an account, else their lead page."""
        if not emails:
            return {}
        links = {r['email']: f"/admin/crm/leads/{r['id']}" for r in (
            self.client.table('crm_leads').select('id, email').in_('email', emails)
            .execute()).data or []}
        for r in (self.client.table('users').select('id, email').in_('email', emails)
                  .execute()).data or []:
            links[normalize_email(r.get('email'))] = f"/admin/crm/people/{r['id']}"
        return links

    def client_org_ids(self) -> List[str]:
        rows = (self.client.table('crm_settings').select('value')
                .eq('key', CLIENT_ORGS_KEY).limit(1).execute()).data
        value = rows[0]['value'] if rows else []
        return [str(v) for v in value] if isinstance(value, list) else []

    def set_client_org_ids(self, org_ids: List[str]) -> List[str]:
        self.client.table('crm_settings').upsert({
            'key': CLIENT_ORGS_KEY, 'value': org_ids, 'updated_at': now_iso(),
        }).execute()
        return org_ids

    def client_contact_emails(self) -> Dict[str, str]:
        """Org-admin email -> org name, for every client org."""
        org_ids = self.client_org_ids()
        if not org_ids:
            return {}
        orgs = {o['id']: o['name'] for o in (
            self.client.table('organizations').select('id, name')
            .in_('id', org_ids).execute()).data or []}
        admins = (self.client.table('users').select('email, organization_id')
                  .in_('organization_id', org_ids).eq('org_role', 'org_admin')
                  .execute()).data or []
        return {normalize_email(a['email']): orgs.get(a['organization_id'], '')
                for a in admins if a.get('email')}

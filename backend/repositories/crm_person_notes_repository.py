"""
CRM person notes - internal notes about any Optio user.

Lead notes (crm_events rows with event_type 'note') only exist for people who
came in through a funnel. These are the notes for everyone else: a meeting
with a parent, a call with a school admin, anything worth keeping in that
person's file. A person who is also a lead sees both in their file; the lead
notes are read here but still written through the lead.

crm_person_notes is service-role only (RLS on, no policies), like every crm_*
table, so this runs on the admin client; every caller is behind
require_superadmin.
"""

from typing import Any, Dict, List, Optional

from repositories.base_repository import BaseRepository
from utils.logger import get_logger

logger = get_logger(__name__)

PERSON_COLUMNS = ('id, email, phone_number, first_name, last_name, display_name, role, org_role, '
                  'organization_id, created_at, last_active')
AUTHOR_EMBED = 'author:users!crm_person_notes_author_id_fkey(first_name, last_name, display_name)'


def _author_name(row: Dict[str, Any]) -> Optional[str]:
    author = row.pop('author', None) or {}
    name = f"{author.get('first_name') or ''} {author.get('last_name') or ''}".strip()
    return name or author.get('display_name') or None


class CrmPersonNotesRepository(BaseRepository):
    table_name = 'crm_person_notes'
    id_column = 'id'

    # ------------------------------------------------------------ reads

    def get_person(self, user_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('users').select(PERSON_COLUMNS)
                .eq('id', user_id).limit(1).execute()).data
        if not rows:
            return None
        person = rows[0]
        person['organization_name'] = None
        if person.get('organization_id'):
            org = (self.client.table('organizations').select('name')
                   .eq('id', person['organization_id']).limit(1).execute()).data
            person['organization_name'] = org[0]['name'] if org else None
        return person

    def notes_for(self, user_id: str) -> List[Dict[str, Any]]:
        # Bounded by one person, so no truncation concern.
        rows = (self.client.table(self.table_name)
                .select(f'*, {AUTHOR_EMBED}')
                .eq('user_id', user_id)
                .order('created_at', desc=True)
                .execute()).data or []
        for row in rows:
            row['author_name'] = _author_name(row)
        return rows

    def recent_notes(self, limit: int = 25) -> List[Dict[str, Any]]:
        """The newest notes across everyone, with the person each is about."""
        rows = (self.client.table(self.table_name)
                .select(f'*, {AUTHOR_EMBED}, '
                        'person:users!crm_person_notes_user_id_fkey'
                        '(id, email, first_name, last_name, display_name)')
                .order('created_at', desc=True)
                .limit(limit)
                .execute()).data or []
        for row in rows:
            row['author_name'] = _author_name(row)
        return rows

    def leads_for(self, person: Dict[str, Any]) -> List[Dict[str, Any]]:
        """CRM leads that are this person: linked by user_id, or by the same
        email before the lead was ever linked. Each carries its own notes."""
        leads = (self.client.table('crm_leads')
                 .select('id, email, status, lead_source, created_at, user_id')
                 .eq('user_id', person['id']).execute()).data or []
        email = (person.get('email') or '').strip().lower()
        if email:
            by_email = (self.client.table('crm_leads')
                        .select('id, email, status, lead_source, created_at, user_id')
                        .eq('email', email).execute()).data or []
            seen = {lead['id'] for lead in leads}
            leads.extend(lead for lead in by_email if lead['id'] not in seen)
        if not leads:
            return []
        notes = (self.client.table('crm_events')
                 .select('id, lead_id, detail, created_at')
                 .in_('lead_id', [lead['id'] for lead in leads])
                 .eq('event_type', 'note')
                 .order('created_at', desc=True)
                 .execute()).data or []
        for lead in leads:
            lead['notes'] = [n for n in notes if n['lead_id'] == lead['id']]
        return leads

    def user_id_for_email(self, email: Optional[str]) -> Optional[str]:
        email = (email or '').strip().lower()
        if not email:
            return None
        # ilike for case, then an exact compare: `_` is a LIKE wildcard, so
        # ilike alone would match a_b@x.com to axb@x.com and file a note
        # about one person on another person's account.
        rows = (self.client.table('users').select('id, email')
                .ilike('email', email).limit(10).execute()).data or []
        match = next((r for r in rows if (r.get('email') or '').lower() == email), None)
        return match['id'] if match else None

    def lead_for_email(self, email: Optional[str]) -> Optional[Dict[str, Any]]:
        email = (email or '').strip().lower()
        if not email:
            return None
        rows = (self.client.table('crm_leads').select('*')
                .eq('email', email).limit(1).execute()).data
        return rows[0] if rows else None

    def get_note(self, note_id: str) -> Optional[Dict[str, Any]]:
        rows = (self.client.table(self.table_name).select('*')
                .eq('id', note_id).limit(1).execute()).data
        return rows[0] if rows else None

    def get_lead_note(self, lead_id: str, note_id: str) -> Optional[Dict[str, Any]]:
        """A note on a lead's timeline, only if it is a note and on that lead,
        so a lead-note route can never touch another kind of CRM event."""
        rows = (self.client.table('crm_events').select('*')
                .eq('id', note_id).eq('lead_id', lead_id).eq('event_type', 'note')
                .limit(1).execute()).data
        return rows[0] if rows else None

    # ------------------------------------------------------------ writes

    def add_note(self, user_id: str, author_id: str, body: str,
                 met_on: Optional[str] = None,
                 doc: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """`doc` is the doc_url/doc_title/doc_text/doc_fetched_at columns."""
        return (self.client.table(self.table_name).insert({
            'user_id': user_id, 'author_id': author_id,
            'body': body, 'met_on': met_on, **(doc or {}),
        }).execute()).data[0]

    def add_lead_note(self, lead_id: str, author_id: str, body: str,
                      met_on: Optional[str] = None,
                      doc: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """A note on a lead, for a person with no Optio account. It lives on
        the lead's timeline, and reaches their user file once they sign up
        with the same email (leads_for). An attached doc goes in the detail
        under the same keys as the person-note columns."""
        detail: Dict[str, Any] = {'body': body, 'author_id': author_id}
        if met_on:
            detail['met_on'] = met_on
        detail.update({k: v for k, v in (doc or {}).items() if v is not None})
        return (self.client.table('crm_events').insert({
            'lead_id': lead_id, 'event_type': 'note', 'detail': detail,
        }).execute()).data[0]

    def update_note(self, note_id: str, body: str, met_on: Optional[str],
                    doc: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        """`doc` None leaves the attached doc alone; a dict replaces it."""
        from utils.timestamps import now_iso
        rows = (self.client.table(self.table_name).update({
            'body': body, 'met_on': met_on, 'updated_at': now_iso(), **(doc or {}),
        }).eq('id', note_id).execute()).data
        return rows[0] if rows else None

    def set_lead_note_detail(self, note_id: str, detail: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rows = (self.client.table('crm_events').update({'detail': detail})
                .eq('id', note_id).eq('event_type', 'note').execute()).data
        return rows[0] if rows else None

    def delete_lead_note(self, note_id: str) -> bool:
        rows = (self.client.table('crm_events').delete()
                .eq('id', note_id).eq('event_type', 'note').execute()).data
        return bool(rows)

    def delete_note(self, note_id: str) -> bool:
        rows = (self.client.table(self.table_name).delete()
                .eq('id', note_id).execute()).data
        return bool(rows)

"""
Export every contact from the Brevo lead/customer lists to a JSON archive
(CRM plan PR6, cutover step 5).

Run BEFORE deactivating the Brevo automations and cancelling the account —
the CONVERTED attribute and list memberships exist nowhere else. The archive
feeds import_brevo_contacts.py and is worth keeping permanently.

Usage:
    cd backend && python scripts/export_brevo_contacts.py [outfile.json]
"""
import json
import os
import sys
from datetime import datetime, timezone

import requests

BREVO_BASE = 'https://api.brevo.com/v3'
PAGE_SIZE = 500

# List ids and names as of 2026-08 (docs/marketing/brevo_funnel_plan.md §5C).
LISTS = {
    4: 'free_class_leads',
    5: 'families',
    6: 'b2b',
    7: 'poe_parents',
    8: 'customers',
    11: 'catchup_free_class',
    12: 'general_interest',
    13: 'new_accounts',
    14: 'course_students',
}


def _api_key():
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), '.env'))
    key = os.getenv('BREVO_API_KEY')
    if not key:
        print('ERROR: BREVO_API_KEY not set')
        sys.exit(1)
    return key


def main():
    outfile = sys.argv[1] if len(sys.argv) > 1 else 'brevo_contacts_export.json'
    headers = {'api-key': _api_key(), 'accept': 'application/json'}

    contacts = {}
    for list_id, list_name in LISTS.items():
        offset = 0
        while True:
            resp = requests.get(
                f'{BREVO_BASE}/contacts/lists/{list_id}/contacts',
                headers=headers,
                params={'limit': PAGE_SIZE, 'offset': offset},
                timeout=30,
            )
            resp.raise_for_status()
            body = resp.json()
            page = body.get('contacts') or []
            for contact in page:
                email = (contact.get('email') or '').lower()
                if not email:
                    continue
                entry = contacts.setdefault(email, {
                    'email': email,
                    'attributes': contact.get('attributes') or {},
                    'list_ids': [],
                    'email_blacklisted': contact.get('emailBlacklisted', False),
                })
                entry['list_ids'] = sorted(set(entry['list_ids'] + [list_id]))
                # attributes are identical across lists; keep the fullest set
                if len(contact.get('attributes') or {}) > len(entry['attributes']):
                    entry['attributes'] = contact['attributes']
            print(f'  list {list_id} ({list_name}): +{len(page)} at offset {offset}')
            offset += PAGE_SIZE
            if len(page) < PAGE_SIZE:
                break

    archive = {
        'exported_at': datetime.now(timezone.utc).isoformat(),
        'lists': LISTS,
        'contacts': sorted(contacts.values(), key=lambda c: c['email']),
    }
    with open(outfile, 'w', encoding='utf-8') as f:
        json.dump(archive, f, indent=2)
    print(f'\nWrote {len(contacts)} unique contacts to {outfile}. '
          f'Archive this file before cancelling Brevo.')


if __name__ == '__main__':
    main()

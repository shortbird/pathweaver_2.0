"""
Import the Brevo contact archive into the CRM (CRM plan PR6, cutover step 5).

Position approximation: Brevo's API cannot report where a contact sits inside
an automation, so a lead's position is inferred from LEAD_DATE and the
funnel's step delays — steps whose delay has already elapsed count as sent
(last_step_sent), which SKIPS anything Brevo may not have delivered yet and
never double-sends. That bias is deliberate: a missed nurture email is a
shrug; a duplicate is a spam report.

Mapping (Brevo list -> CRM):
  #4 free_class_leads, #11 catchup  -> free_class_nurture membership
  #5 families                       -> families_nurture membership
  #12 general_interest              -> general_interest_nurture membership
  #6 b2b, #7 poe_parents            -> lead row only (no funnel, parity)
  #8 customers / CONVERTED=true     -> lead status 'converted' (suppression memory)
  #13 new_accounts, #14 course_students -> onboarding membership, completed
       unless the account is newer than the funnel's total duration
  emailBlacklisted                  -> crm_suppressions (unsubscribe)

Idempotent: leads upsert on email; a lead that already has any membership in
the target funnel is left alone. Safe to re-run on a partial import.

Usage:
    cd backend && python scripts/import_brevo_contacts.py brevo_contacts_export.json [--dry-run]
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

LIST_FUNNELS = {
    4: 'free_class_nurture',
    11: 'free_class_nurture',
    5: 'families_nurture',
    12: 'general_interest_nurture',
    13: 'new_account_welcome',
    14: 'course_student_onboarding',
}
LEAD_ONLY_LISTS = {6, 7}
CUSTOMERS = 8


def _client():
    from dotenv import load_dotenv
    from supabase import create_client
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), '.env'))
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_KEY')
    if not url or not key:
        print('ERROR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set')
        sys.exit(1)
    return create_client(url, key)


def _parse_date(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value)[:19])
        return parsed.replace(tzinfo=parsed.tzinfo or timezone.utc)
    except ValueError:
        return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry_run = '--dry-run' in sys.argv
    if not args:
        print('Usage: python scripts/import_brevo_contacts.py <export.json> [--dry-run]')
        sys.exit(1)
    with open(args[0], encoding='utf-8') as f:
        archive = json.load(f)

    db = _client()
    funnels = {f['key']: f for f in
               (db.table('crm_funnels').select('*').execute()).data or []}
    steps_by_funnel = {}
    for step in (db.table('crm_funnel_steps').select('*')
                 .eq('is_active', True).order('step_order').execute()).data or []:
        steps_by_funnel.setdefault(step['funnel_id'], []).append(step)

    now = datetime.now(timezone.utc)
    stats = {'leads': 0, 'converted': 0, 'memberships': 0, 'completed': 0,
             'suppressed': 0, 'skipped': 0}

    for contact in archive['contacts']:
        email = contact['email'].lower().strip()
        attrs = contact.get('attributes') or {}
        list_ids = set(contact.get('list_ids') or [])
        converted = bool(attrs.get('CONVERTED')) or CUSTOMERS in list_ids
        lead_date = (_parse_date(attrs.get('LEAD_DATE'))
                     or _parse_date(attrs.get('SIGNUP_DATE')) or now)

        if dry_run:
            stats['leads'] += 1
            continue

        existing = (db.table('crm_leads').select('*')
                    .eq('email', email).limit(1).execute()).data
        if existing:
            lead = existing[0]
        else:
            lead = (db.table('crm_leads').insert({
                'email': email,
                'first_name': attrs.get('FIRSTNAME'),
                'last_name': attrs.get('LASTNAME'),
                'lead_type': attrs.get('LEAD_TYPE'),
                'lead_source': 'brevo_import',
                'created_at': lead_date.isoformat(),
            }).execute()).data[0]
            stats['leads'] += 1

        if contact.get('email_blacklisted'):
            try:
                db.table('crm_suppressions').insert({
                    'email': email, 'reason': 'unsubscribe',
                    'source': 'brevo_import'}).execute()
                stats['suppressed'] += 1
            except Exception:  # noqa: BLE001  # already suppressed
                pass
            if lead['status'] == 'active':
                db.table('crm_leads').update({'status': 'unsubscribed'}) \
                    .eq('id', lead['id']).execute()
            continue

        if converted and lead['status'] == 'active':
            db.table('crm_leads').update({
                'status': 'converted', 'converted_at': lead_date.isoformat(),
                'conversion_event': 'import',
            }).eq('id', lead['id']).execute()
            lead['status'] = 'converted'
            stats['converted'] += 1

        for list_id in sorted(list_ids & set(LIST_FUNNELS)):
            funnel = funnels.get(LIST_FUNNELS[list_id])
            if not funnel:
                continue
            is_onboarding = funnel['funnel_type'] == 'onboarding'
            if lead['status'] != 'active' and not is_onboarding:
                continue  # converted/unsubscribed leads never rejoin a nurture
            already = (db.table('crm_funnel_memberships').select('id')
                       .eq('lead_id', lead['id']).eq('funnel_id', funnel['id'])
                       .limit(1).execute()).data
            if already:
                stats['skipped'] += 1
                continue
            active_elsewhere = (db.table('crm_funnel_memberships').select('id')
                                .eq('lead_id', lead['id']).eq('status', 'active')
                                .limit(1).execute()).data
            if active_elsewhere:
                stats['skipped'] += 1
                continue

            steps = steps_by_funnel.get(funnel['id'], [])
            elapsed_hours = (now - lead_date).total_seconds() / 3600
            sent_steps = [s for s in steps if s['delay_hours'] <= elapsed_hours]
            last_step_sent = sent_steps[-1]['step_order'] if sent_steps else 0
            done = last_step_sent >= (steps[-1]['step_order'] if steps else 0)
            membership = {
                'lead_id': lead['id'], 'funnel_id': funnel['id'],
                'entered_at': lead_date.isoformat(),
                'last_step_sent': last_step_sent,
                'last_sent_at': (lead_date + timedelta(
                    hours=sent_steps[-1]['delay_hours'])).isoformat()
                if sent_steps else None,
            }
            if done:
                membership.update({'status': 'completed',
                                   'exited_at': now.isoformat()})
                stats['completed'] += 1
            else:
                stats['memberships'] += 1
            try:
                db.table('crm_funnel_memberships').insert(membership).execute()
            except Exception as e:  # noqa: BLE001
                print(f'  membership insert failed for {email}: {e}')
            break  # one funnel per lead: the lowest list id wins

        db.table('crm_events').insert({
            'lead_id': lead['id'], 'event_type': 'imported',
            'detail': {'list_ids': sorted(list_ids),
                       'converted': converted},
        }).execute()

    print(json.dumps(stats, indent=2))
    if dry_run:
        print('(dry run: nothing written)')


if __name__ == '__main__':
    main()

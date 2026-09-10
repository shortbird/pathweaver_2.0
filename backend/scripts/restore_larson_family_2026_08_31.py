"""
Restore the (Sarie) Larson family, erased by the deletion sweep on 2026-08-31.

Sarie Larson opened her Optio account on 2026-07-25 and clicked "delete my
account" six minutes later. The request sat unrun. She then kept using the
account: she added both children on 08-06, registered them for Thursday classes,
and paid on 08-27. On 08-31 the sweep finally caught up to the July request and
erased her account, taking both children and all ten class registrations with
it. The sweep never checked that she had come back.

The consent bug is fixed in services/account_deletion_service.py (commit
364030e1, `_reactivation_signal`). This script is the other half: putting the
family back. It does NOT re-run for anyone else — every id below is hard-coded
to this one household.

What survived, and is therefore the source of truth here:
  - households row d30d61a8 "(Sarie) Larson Family" (address + phone intact,
    primary_contact_user_id nulled by the cascade)
  - both sis_invoices, both sis_payment_plans (10-month, active, auto_charge)
  - the invoice line items, which name every class each child was paid into
  - account_deletion_log, which kept the parent's name and email

What did NOT survive and cannot be reconstructed:
  - the three users rows (parent + two children) and their original ids
  - emergency_contacts (keyed by the child's user id)
  - the registrations funnel row (answers, paperwork e-signatures, media consent)
  - Sarie's password

Which child owns which invoice is not a guess. Every class in this school is
age-banded, and the two invoices' bands intersect at exactly one age each:
invoice 25b0874b needs an 8-10 year old (Group Voice 8+, Story Detectives 8-11,
Theater Jr. 5-10) and invoice ef982ecd needs a 7 year old (Lego Lab 5-7, Lego
Robotics 7-10). Ellie is 9 and Max is 7. Their names and birthdates came from
iCreate's paper file, relayed 2026-09-10.

Deliberately NOT done:
  - no teacher "new student joined your class" alerts. These children never
    left the classroom; the teachers do not need ten notifications saying they
    arrived.
  - no email to Sarie. Her restored account has a password nobody knows. She
    recovers it through "forgot password" whenever the school tells her to.

Dry-run by default; pass --apply to write.

Run from backend/ with the venv:
    ../venv/bin/python scripts/restore_larson_family_2026_08_31.py
    ../venv/bin/python scripts/restore_larson_family_2026_08_31.py --apply
"""
import argparse
import os
import secrets
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from dateutil.relativedelta import relativedelta  # noqa: E402
from datetime import date  # noqa: E402

from supabase import create_client  # noqa: E402

SUPABASE_URL = os.environ['SUPABASE_URL']
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['SUPABASE_SERVICE_KEY']

ICREATE_ORG_ID = '1340004f-d12f-44ae-9ec3-185af5240130'
HOUSEHOLD_ID = 'd30d61a8-075f-49e7-8649-97e2b7c23288'

PARENT = {
    'email': 'sarie94@gmail.com',
    'first_name': 'Sarie',
    'last_name': 'Larson',
}

# dob and invoice_id are load-bearing: the invoice is what says which classes
# this child paid for. See the age-band reasoning in the module docstring.
CHILDREN = [
    {
        'first_name': 'Ellie',
        'last_name': 'Larson',
        'dob': date(2017, 6, 17),
        'invoice_id': '25b0874b-9b11-48a0-8ff7-011eec999c9d',
    },
    {
        'first_name': 'Max',
        'last_name': 'Larson',
        'dob': date(2019, 5, 17),
        'invoice_id': 'ef982ecd-7214-4134-af57-2dbe05f652eb',
    },
]


def db():
    return create_client(SUPABASE_URL, SERVICE_KEY)


def log(apply_, msg):
    print(('APPLY ' if apply_ else 'DRY   ') + msg)


# ---------------------------------------------------------------------------
# People
# ---------------------------------------------------------------------------

def find_user_by_email(client, email):
    rows = (client.table('users').select('id, first_name, last_name')
            .eq('email', email).limit(1).execute()).data or []
    return rows[0] if rows else None


def find_dependent(client, parent_id, first, last):
    """Match a child already restored by an earlier run, so this is re-runnable."""
    rows = (client.table('users')
            .select('id, first_name, last_name')
            .eq('managed_by_parent_id', parent_id)
            .eq('is_dependent', True).execute()).data or []
    for r in rows:
        if ((r.get('first_name') or '').strip().lower() == first.lower()
                and (r.get('last_name') or '').strip().lower() == last.lower()):
            return r
    return None


def restore_parent(client, apply_):
    existing = find_user_by_email(client, PARENT['email'])
    if existing:
        log(apply_, f"parent {PARENT['email']} already present -> {existing['id']}")
        return existing['id']
    if not apply_:
        log(apply_, f"would create parent auth user + users row for {PARENT['email']}")
        return None

    # email_confirm: she owned and used this address for five weeks and paid
    # through it. Restoring the account should not demote her to unverified.
    auth = client.auth.admin.create_user({
        'email': PARENT['email'],
        'password': secrets.token_urlsafe(24),  # nobody knows it; she resets
        'email_confirm': True,
        'user_metadata': {
            'first_name': PARENT['first_name'],
            'last_name': PARENT['last_name'],
        },
    })
    if not auth.user:
        raise RuntimeError('could not create the parent auth user')
    uid = auth.user.id
    client.table('users').upsert({
        'id': uid,
        'email': PARENT['email'],
        'first_name': PARENT['first_name'],
        'last_name': PARENT['last_name'],
        'display_name': f"{PARENT['first_name']} {PARENT['last_name']}",
        'role': 'org_managed',
        'org_role': 'parent',
        'org_roles': ['parent'],
        'organization_id': ICREATE_ORG_ID,
    }, on_conflict='id').execute()
    log(apply_, f"created parent {PARENT['email']} -> {uid}")
    return uid


def restore_child(client, parent_id, child, apply_):
    # Dry-run before the parent exists: there is nothing to match against yet.
    existing = (find_dependent(client, parent_id, child['first_name'], child['last_name'])
                if parent_id else None)
    if existing:
        log(apply_, f"child {child['first_name']} already present -> {existing['id']}")
        return existing['id']
    if not apply_:
        log(apply_, f"would create dependent {child['first_name']} {child['last_name']} "
                    f"(dob {child['dob']})")
        return None

    placeholder = f'dependent_{secrets.token_hex(16)}@optio-internal-placeholder.local'
    auth = client.auth.admin.create_user({
        'email': placeholder,
        'email_confirm': False,
        'user_metadata': {'is_dependent': True, 'managed_by_parent_id': parent_id},
        'app_metadata': {'provider': 'dependent', 'providers': ['dependent']},
    })
    if not auth.user:
        raise RuntimeError(f"could not create the auth user for {child['first_name']}")
    uid = auth.user.id
    # Same shape registration_accounts_service._create_dependent produces, so a
    # restored child is indistinguishable from a funnel-created one.
    client.table('users').upsert({
        'id': uid,
        'first_name': child['first_name'],
        'last_name': child['last_name'],
        'display_name': f"{child['first_name']} {child['last_name']}",
        'date_of_birth': str(child['dob']),
        'is_dependent': True,
        'managed_by_parent_id': parent_id,
        'promotion_eligible_at': str(child['dob'] + relativedelta(years=13)),
        'role': 'org_managed',
        'org_role': 'student',
        'org_roles': ['student'],
        'email': None,
        'organization_id': ICREATE_ORG_ID,
    }, on_conflict='id').execute()
    log(apply_, f"created dependent {child['first_name']} {child['last_name']} -> {uid}")
    return uid


# ---------------------------------------------------------------------------
# Family structure
# ---------------------------------------------------------------------------

def restore_household(client, parent_id, child_ids, apply_):
    if not apply_:
        log(apply_, f"would set households.primary_contact_user_id on {HOUSEHOLD_ID}")
        log(apply_, f"would upsert {1 + len(CHILDREN)} household_members rows")
        return
    client.table('households').update(
        {'primary_contact_user_id': parent_id}).eq('id', HOUSEHOLD_ID).execute()
    members = [{'household_id': HOUSEHOLD_ID, 'user_id': parent_id,
                'relationship': 'guardian', 'is_primary_guardian': True}]
    members += [{'household_id': HOUSEHOLD_ID, 'user_id': cid,
                 'relationship': 'student', 'is_primary_guardian': False}
                for cid in child_ids]
    client.table('household_members').upsert(
        members, on_conflict='household_id,user_id').execute()
    log(apply_, f"household {HOUSEHOLD_ID}: primary contact set, {len(members)} members")


def restore_links(client, parent_id, child_ids, apply_):
    for cid in child_ids:
        existing = (client.table('parent_student_links').select('id')
                    .eq('parent_user_id', parent_id)
                    .eq('student_user_id', cid).execute()).data or []
        if existing:
            log(apply_, f"parent_student_link parent->{cid} already present")
            continue
        if not apply_:
            log(apply_, f"would link parent -> student {cid}")
            continue
        client.table('parent_student_links').insert({
            'parent_user_id': parent_id,
            'student_user_id': cid,
            'status': 'approved',
            'admin_verified': True,
            'admin_notes': 'Restored after the 2026-08-31 erroneous deletion sweep',
        }).execute()
        log(apply_, f"linked parent -> student {cid}")


# ---------------------------------------------------------------------------
# Classes and money
# ---------------------------------------------------------------------------

def classes_on_invoice(client, invoice_id):
    """The tuition lines on an invoice ARE the classes that child paid for."""
    rows = (client.table('sis_invoice_line_items')
            .select('class_id, description, kind')
            .eq('invoice_id', invoice_id).eq('kind', 'tuition').execute()).data or []
    out = []
    for r in rows:
        if r.get('class_id') and r['class_id'] not in [c[0] for c in out]:
            out.append((r['class_id'], r.get('description') or ''))
    return out


def restore_enrollments(client, child_id, child, apply_):
    pairs = classes_on_invoice(client, child['invoice_id'])
    for class_id, name in pairs:
        existing = ((client.table('class_enrollments').select('id, status')
                     .eq('class_id', class_id).eq('student_id', child_id)
                     .execute()).data or []) if child_id else []
        if existing and existing[0].get('status') == 'active':
            log(apply_, f"  {child['first_name']}: already enrolled in {name}")
            continue
        if not apply_:
            log(apply_, f"  would enroll {child['first_name']} in {name} ({class_id})")
            continue
        client.table('class_enrollments').upsert({
            'class_id': class_id,
            'student_id': child_id,
            'status': 'active',
            'enrolled_by': None,
        }, on_conflict='class_id,student_id').execute()
        log(apply_, f"  enrolled {child['first_name']} in {name}")

        # Rebuild the LMS + messaging state the enrollment used to carry.
        # No class_roster_alerts call: see the module docstring.
        try:
            from services.class_quest_enrollment import enroll_in_class_quests
            enroll_in_class_quests(client, class_id, child_id)
        except Exception as e:  # noqa: BLE001
            print(f"    warn: class quest enrollment failed for {name}: {e}")
        try:
            from services.class_group_sync_service import sync_class_group
            sync_class_group(class_id)
        except Exception as e:  # noqa: BLE001
            print(f"    warn: class group sync failed for {name}: {e}")
    return [c[0] for c in pairs]


def reattach_invoice(client, child_id, child, apply_):
    row = (client.table('sis_invoices').select('id, student_user_id, invoice_number')
           .eq('id', child['invoice_id']).limit(1).execute()).data
    if not row:
        print(f"  warn: invoice {child['invoice_id']} is gone; skipping")
        return
    if child_id and row[0].get('student_user_id') == child_id:
        log(apply_, f"  invoice {row[0]['invoice_number']} already points at "
                    f"{child['first_name']}")
        return
    if not apply_:
        log(apply_, f"  would point invoice {row[0]['invoice_number']} at "
                    f"{child['first_name']}")
        return
    client.table('sis_invoices').update(
        {'student_user_id': child_id}).eq('id', child['invoice_id']).execute()
    log(apply_, f"  invoice {row[0]['invoice_number']} -> {child['first_name']}")


# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------

def verify(client, parent_id, restored):
    print('\n--- verification ---')
    hh = (client.table('households').select('primary_contact_user_id')
          .eq('id', HOUSEHOLD_ID).limit(1).execute()).data
    print(f"household primary contact: {hh[0]['primary_contact_user_id'] if hh else 'MISSING'}")
    members = (client.table('household_members').select('user_id, relationship')
               .eq('household_id', HOUSEHOLD_ID).execute()).data or []
    print(f"household members: {len(members)} "
          f"({sum(1 for m in members if m['relationship'] == 'student')} students)")
    for child_id, child in restored:
        enr = (client.table('class_enrollments').select('class_id')
               .eq('student_id', child_id).eq('status', 'active').execute()).data or []
        links = (client.table('parent_student_links').select('id')
                 .eq('parent_user_id', parent_id)
                 .eq('student_user_id', child_id).execute()).data or []
        inv = (client.table('sis_invoices').select('invoice_number, student_user_id')
               .eq('id', child['invoice_id']).limit(1).execute()).data or []
        print(f"{child['first_name']} {child['last_name']} ({child_id}): "
              f"{len(enr)} active enrollments, {len(links)} parent link, "
              f"invoice {'attached' if inv and inv[0]['student_user_id'] == child_id else 'NOT attached'}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--apply', action='store_true', help='write; otherwise dry-run')
    args = ap.parse_args()
    client = db()

    print(f"{'APPLYING' if args.apply else 'DRY RUN'} — restoring the (Sarie) Larson "
          f"family into iCreate\n")

    parent_id = restore_parent(client, args.apply)
    restored = []
    for child in CHILDREN:
        restored.append((restore_child(client, parent_id, child, args.apply), child))

    child_ids = [cid for cid, _ in restored if cid]
    if args.apply and (not parent_id or len(child_ids) != len(CHILDREN)):
        raise RuntimeError('parent or a child is missing; refusing to continue')

    restore_household(client, parent_id, child_ids, args.apply)
    restore_links(client, parent_id, child_ids, args.apply)

    for cid, child in restored:
        print(f"\n{child['first_name']} {child['last_name']}:")
        restore_enrollments(client, cid, child, args.apply)
        reattach_invoice(client, cid, child, args.apply)

    if args.apply:
        verify(client, parent_id, restored)
    else:
        print('\nDry run only. Re-run with --apply to write.')


if __name__ == '__main__':
    main()

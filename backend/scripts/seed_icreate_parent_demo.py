"""
One-off: seed an iCreate parent demo account + child + household + an open demo
class so iCreate admins can test parent self-signup. Idempotent on the parent email.

Run from backend/ with the venv:
    ../venv/bin/python scripts/seed_icreate_parent_demo.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))
from supabase import create_client

SUPABASE_URL = os.environ['SUPABASE_URL']
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['SUPABASE_SERVICE_KEY']


def get_supabase_admin_client():
    return create_client(SUPABASE_URL, SERVICE_KEY)

ORG_ID = '1340004f-d12f-44ae-9ec3-185af5240130'  # iCreate
PARENT_EMAIL = 'demo-parent@icreate-demo.com'
PARENT_PASSWORD = 'iCreateDemo2025!'
CHILD_FIRST, CHILD_LAST = 'Demo', 'Student'

admin = get_supabase_admin_client()


def find_user_by_email(email):
    rows = admin.table('users').select('id').eq('email', email).limit(1).execute().data
    return rows[0]['id'] if rows else None


def _find_auth_user_by_email(email):
    # paginate through auth users (small dataset per page is fine for a one-off)
    page = 1
    while True:
        users = admin.auth.admin.list_users(page=page, per_page=200)
        if not users:
            return None
        for u in users:
            if (u.email or '').lower() == email.lower():
                return u.id
        if len(users) < 200:
            return None
        page += 1


def create_auth_user(email, password, metadata):
    try:
        resp = admin.auth.admin.create_user({
            'email': email, 'password': password, 'email_confirm': True,
            'user_metadata': metadata,
        })
        return resp.user.id
    except Exception as e:
        # auth user already exists (orphaned from a prior partial run) — reuse it
        existing = _find_auth_user_by_email(email)
        if existing:
            print(f"  (reusing existing auth user for {email})")
            return existing
        raise e


def main():
    # ── Parent ────────────────────────────────────────────────────────────────
    parent_id = find_user_by_email(PARENT_EMAIL)
    if parent_id:
        print(f"Parent already exists: {parent_id} ({PARENT_EMAIL}) — reusing")
    else:
        parent_id = create_auth_user(PARENT_EMAIL, PARENT_PASSWORD, {
            'first_name': 'Demo', 'last_name': 'Parent', 'organization_id': ORG_ID,
        })
        admin.table('users').insert({
            'id': parent_id, 'email': PARENT_EMAIL,
            'first_name': 'Demo', 'last_name': 'Parent', 'display_name': 'Demo Parent',
            'organization_id': ORG_ID, 'role': 'org_managed', 'org_role': 'parent',
            'total_xp': 0,
        }).execute()
        print(f"Created parent: {parent_id} ({PARENT_EMAIL})")

    # ── Child (student) ──────────────────────────────────────────────────────
    # Dependents must have no email in public.users (check_dependent_no_email), so we
    # key idempotency off the existing dependent profile, not the auth email.
    existing_child = admin.table('users').select('id')\
        .eq('managed_by_parent_id', parent_id).eq('is_dependent', True).limit(1).execute().data
    if existing_child:
        child_id = existing_child[0]['id']
        print(f"Child already exists: {child_id} — reusing")
    else:
        child_email = f"orgstudent_demo_{parent_id[:8]}@optio-internal-placeholder.local"
        child_id = create_auth_user(child_email, PARENT_PASSWORD,
            {'first_name': CHILD_FIRST, 'last_name': CHILD_LAST, 'organization_id': ORG_ID})
        admin.table('users').insert({
            'id': child_id, 'email': None,
            'username': f'demo.student.{parent_id[:6]}',
            'first_name': CHILD_FIRST, 'last_name': CHILD_LAST,
            'display_name': f'{CHILD_FIRST} {CHILD_LAST}',
            'organization_id': ORG_ID, 'role': 'org_managed', 'org_role': 'student',
            'managed_by_parent_id': parent_id, 'is_dependent': True, 'total_xp': 0,
        }).execute()
        print(f"Created child: {child_id} ({CHILD_FIRST} {CHILD_LAST})")

    # ── Household linking parent (guardian) + child (student) ─────────────────
    hh = admin.table('households').select('id').eq('organization_id', ORG_ID)\
        .eq('name', 'Demo Family (testing)').limit(1).execute().data
    if hh:
        household_id = hh[0]['id']
        print(f"Household exists: {household_id} — reusing")
    else:
        household_id = admin.table('households').insert({
            'organization_id': ORG_ID, 'name': 'Demo Family (testing)',
            'primary_contact_user_id': parent_id,
        }).execute().data[0]['id']
        print(f"Created household: {household_id}")

    admin.table('household_members').upsert({
        'household_id': household_id, 'user_id': parent_id,
        'relationship': 'guardian', 'is_primary_guardian': True,
    }, on_conflict='household_id,user_id').execute()
    admin.table('household_members').upsert({
        'household_id': household_id, 'user_id': child_id,
        'relationship': 'student', 'is_primary_guardian': False,
    }, on_conflict='household_id,user_id').execute()
    print("Linked parent (guardian) + child (student) into household")

    # ── An OPEN demo class so the parent has something to register for ────────
    cls = admin.table('org_classes').select('id, registration_status')\
        .eq('organization_id', ORG_ID).eq('name', 'Self-Signup Demo Class').limit(1).execute().data
    if cls:
        class_id = cls[0]['id']
        admin.table('org_classes').update({'registration_status': 'open', 'status': 'active'})\
            .eq('id', class_id).execute()
        print(f"Demo class exists: {class_id} — ensured open")
    else:
        class_id = admin.table('org_classes').insert({
            'organization_id': ORG_ID, 'name': 'Self-Signup Demo Class',
            'status': 'active', 'registration_status': 'open',
            'capacity': 20, 'price_cents': 10000, 'created_by': parent_id,
        }).execute().data[0]['id']
        # one weekly meeting so the schedule shows
        admin.table('class_meetings').insert({
            'class_id': class_id, 'organization_id': ORG_ID,
            'day_of_week': 1, 'start_time': '09:00', 'end_time': '11:00',
        }).execute()
        print(f"Created open demo class: {class_id}")

    print("\n=== DONE ===")
    print(f"Org:      iCreate ({ORG_ID})")
    print(f"Login:    {PARENT_EMAIL}")
    print(f"Password: {PARENT_PASSWORD}")
    print(f"Child:    {CHILD_FIRST} {CHILD_LAST}")
    print(f"Open class: Self-Signup Demo Class ($100.00)")


if __name__ == '__main__':
    main()

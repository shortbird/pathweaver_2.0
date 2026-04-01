"""
Seed all E2E test users in both auth.users AND public.users.

This script creates the full set of test accounts needed for Maestro E2E tests.
It uses the Supabase Admin API to create auth.users entries (so users can actually
log in), then upserts the public.users rows with correct roles and relationships.

Run from project root:
    python backend/scripts/seed_e2e_users.py

Requires env vars:
    SUPABASE_URL
    SUPABASE_SERVICE_KEY

Uses the password from E2E_TEST_PASSWORD env var, or defaults to 'TestPass123!'
"""

import os
import sys
import json

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from supabase import create_client


# ── Test user definitions ──

DEFAULT_PASSWORD = os.environ.get('E2E_TEST_PASSWORD', 'TestPass123!')

ORGS = [
    {
        'id': '00000000-0000-0000-0000-000000000001',
        'name': 'Test Academy',
        'slug': 'test-academy',
        'quest_visibility_policy': 'all_optio',
        'is_active': True,
    },
]

USERS = [
    # Platform users (no org)
    {
        'id': '11111111-1111-1111-1111-111111111111',
        'email': 'test-superadmin@optioeducation.com',
        'first_name': 'Test', 'last_name': 'Admin',
        'display_name': 'Test Admin',
        'role': 'superadmin',
        'total_xp': 0,
    },
    {
        'id': '22222222-2222-2222-2222-222222222222',
        'email': 'test-student@example.com',
        'first_name': 'Test', 'last_name': 'Student',
        'display_name': 'Test Student',
        'role': 'student',
        'total_xp': 500,
    },
    {
        'id': '33333333-3333-3333-3333-333333333333',
        'email': 'test-parent@example.com',
        'first_name': 'Test', 'last_name': 'Parent',
        'display_name': 'Test Parent',
        'role': 'parent',
        'total_xp': 0,
    },
    {
        'id': '44444444-4444-4444-4444-444444444444',
        'email': 'test-advisor@example.com',
        'first_name': 'Test', 'last_name': 'Advisor',
        'display_name': 'Test Advisor',
        'role': 'advisor',
        'total_xp': 0,
    },
    {
        'id': '55555555-5555-5555-5555-555555555555',
        'email': 'test-observer@example.com',
        'first_name': 'Test', 'last_name': 'Observer',
        'display_name': 'Test Observer',
        'role': 'observer',
        'total_xp': 0,
    },
    # Dependent child (managed by parent)
    {
        'id': '99999999-9999-9999-9999-999999999999',
        'email': 'test-child@example.com',
        'first_name': 'Test', 'last_name': 'Child',
        'display_name': 'Test Child',
        'role': 'student',
        'total_xp': 100,
        'is_dependent': True,
        'managed_by_parent_id': '33333333-3333-3333-3333-333333333333',
    },
    # Second dependent (under 13) for multi-child parent tests
    {
        'id': 'aaaaaaaa-9999-9999-9999-999999999999',
        'email': 'test-child2@example.com',
        'first_name': 'Young', 'last_name': 'Child',
        'display_name': 'Young Child',
        'role': 'student',
        'total_xp': 50,
        'is_dependent': True,
        'managed_by_parent_id': '33333333-3333-3333-3333-333333333333',
        'date_of_birth': '2016-06-15',  # Under 13
    },
    # Org users
    {
        'id': '66666666-6666-6666-6666-666666666666',
        'email': 'org-admin@test-academy.com',
        'first_name': 'Org', 'last_name': 'Admin',
        'display_name': 'Org Admin',
        'role': 'org_managed',
        'org_role': 'org_admin',
        'organization_id': '00000000-0000-0000-0000-000000000001',
        'total_xp': 0,
    },
    {
        'id': '77777777-7777-7777-7777-777777777777',
        'email': 'org-student@test-academy.com',
        'first_name': 'Org', 'last_name': 'Student',
        'display_name': 'Org Student',
        'role': 'org_managed',
        'org_role': 'student',
        'organization_id': '00000000-0000-0000-0000-000000000001',
        'total_xp': 250,
    },
]

# Relationships to create after users exist
PARENT_LINKS = [
    {'parent_id': '33333333-3333-3333-3333-333333333333', 'student_id': '99999999-9999-9999-9999-999999999999', 'relationship_type': 'parent', 'status': 'active'},
    {'parent_id': '33333333-3333-3333-3333-333333333333', 'student_id': 'aaaaaaaa-9999-9999-9999-999999999999', 'relationship_type': 'parent', 'status': 'active'},
]

OBSERVER_LINKS = [
    {'observer_id': '55555555-5555-5555-5555-555555555555', 'student_id': '22222222-2222-2222-2222-222222222222', 'status': 'active'},
]

ADVISOR_LINKS = [
    {'advisor_id': '44444444-4444-4444-4444-444444444444', 'student_id': '22222222-2222-2222-2222-222222222222', 'is_active': True},
]

QUESTS = [
    {
        'id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'title': 'Learn to Code',
        'description': 'Introduction to programming fundamentals',
        'big_idea': 'Programming opens doors to creativity and problem-solving',
        'quest_type': 'standard',
        'is_active': True,
        'is_public': True,
        'created_by': '11111111-1111-1111-1111-111111111111',
    },
    {
        'id': 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'title': 'Financial Literacy',
        'description': 'Understanding money management and investing',
        'big_idea': 'Financial knowledge empowers independence',
        'quest_type': 'standard',
        'is_active': True,
        'is_public': False,
        'created_by': '11111111-1111-1111-1111-111111111111',
    },
]

ENROLLMENTS = [
    {'user_id': '22222222-2222-2222-2222-222222222222', 'quest_id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'status': 'active'},
    {'user_id': '22222222-2222-2222-2222-222222222222', 'quest_id': 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'status': 'active'},
    {'user_id': '99999999-9999-9999-9999-999999999999', 'quest_id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'status': 'active'},
]

TASKS = [
    {
        'id': 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        'user_id': '22222222-2222-2222-2222-222222222222',
        'quest_id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'title': 'Complete Python Tutorial',
        'description': 'Work through the Python basics tutorial',
        'pillar': 'Knowledge',
        'xp_value': 50,
        'approval_status': 'approved',
    },
    {
        'id': 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        'user_id': '22222222-2222-2222-2222-222222222222',
        'quest_id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'title': 'Build a Calculator App',
        'description': 'Create a simple calculator using Python',
        'pillar': 'Skill',
        'xp_value': 100,
        'approval_status': 'pending',
    },
]

COURSES = [
    {
        'id': '12345678-1234-1234-1234-123456789012',
        'title': 'Introduction to Self-Directed Learning',
        'description': 'Learn how to take charge of your own education',
        'status': 'published',
        'visibility': 'public',
        'created_by': '11111111-1111-1111-1111-111111111111',
    },
]

BOUNTIES = [
    {
        'id': 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0',
        'title': 'Clean Up the Community Garden',
        'description': 'Help maintain the community garden for 2 hours',
        'poster_id': '33333333-3333-3333-3333-333333333333',
        'xp_reward': 100,
        'pillar': 'Community',
        'status': 'open',
        'visibility': 'public',
        'max_claims': 3,
        'deliverables': json.dumps([
            {'id': 'd1', 'label': 'Photo of work done', 'completed': False},
            {'id': 'd2', 'label': 'Log 2 hours', 'completed': False},
        ]),
    },
]


def main():
    supabase_url = os.environ.get('SUPABASE_URL')
    supabase_service_key = os.environ.get('SUPABASE_SERVICE_KEY')

    if not supabase_url or not supabase_service_key:
        print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars")
        sys.exit(1)

    supabase = create_client(supabase_url, supabase_service_key)
    errors = []

    print("=" * 60)
    print("  Optio E2E Test Data Seeder")
    print("=" * 60)

    # ── 1. Create auth.users entries ──
    print("\n[1/8] Creating auth.users entries...")
    for user in USERS:
        try:
            # Check if auth user already exists
            existing = supabase.auth.admin.get_user_by_id(user['id'])
            if existing and existing.user:
                print(f"  EXISTS  {user['email']}")
                continue
        except Exception:
            pass  # User doesn't exist, create it

        try:
            result = supabase.auth.admin.create_user({
                'uid': user['id'],
                'email': user['email'],
                'password': DEFAULT_PASSWORD,
                'email_confirm': True,
                'user_metadata': {
                    'first_name': user['first_name'],
                    'last_name': user['last_name'],
                },
            })
            print(f"  CREATED {user['email']}")
        except Exception as e:
            err_msg = str(e)
            if 'already been registered' in err_msg or 'already exists' in err_msg:
                print(f"  EXISTS  {user['email']}")
            else:
                print(f"  FAILED  {user['email']}: {err_msg}")
                errors.append(f"auth.users: {user['email']}: {err_msg}")

    # ── 2. Upsert organizations ──
    print("\n[2/8] Upserting organizations...")
    for org in ORGS:
        try:
            supabase.table('organizations').upsert(org, on_conflict='id').execute()
            print(f"  OK  {org['name']} ({org['slug']})")
        except Exception as e:
            print(f"  FAILED  {org['name']}: {e}")
            errors.append(f"org: {org['name']}: {e}")

    # ── 3. Upsert public.users ──
    print("\n[3/8] Upserting public.users...")
    for user in USERS:
        row = {
            'id': user['id'],
            'email': user['email'],
            'first_name': user['first_name'],
            'last_name': user['last_name'],
            'display_name': user['display_name'],
            'role': user['role'],
            'total_xp': user.get('total_xp', 0),
            'level': 1,
        }
        if user.get('org_role'):
            row['org_role'] = user['org_role']
        if user.get('organization_id'):
            row['organization_id'] = user['organization_id']
        if user.get('is_dependent'):
            row['is_dependent'] = True
        if user.get('managed_by_parent_id'):
            row['managed_by_parent_id'] = user['managed_by_parent_id']
        if user.get('date_of_birth'):
            row['date_of_birth'] = user['date_of_birth']

        try:
            supabase.table('users').upsert(row, on_conflict='id').execute()
            print(f"  OK  {user['display_name']} ({user['role']})")
        except Exception as e:
            print(f"  FAILED  {user['email']}: {e}")
            errors.append(f"users: {user['email']}: {e}")

    # ── 4. Create relationships ──
    print("\n[4/8] Creating parent-student links...")
    for link in PARENT_LINKS:
        try:
            supabase.table('parent_student_links').upsert(
                {**link, 'verified_at': 'now()'},
                on_conflict='parent_id,student_id'
            ).execute()
            print(f"  OK  parent -> student {link['student_id'][:8]}...")
        except Exception as e:
            print(f"  FAILED  {e}")
            errors.append(f"parent_link: {e}")

    print("\n[5/8] Creating observer-student links...")
    for link in OBSERVER_LINKS:
        try:
            supabase.table('observer_student_links').upsert(
                link,
                on_conflict='observer_id,student_id'
            ).execute()
            print(f"  OK  observer -> student {link['student_id'][:8]}...")
        except Exception as e:
            print(f"  FAILED  {e}")
            errors.append(f"observer_link: {e}")

    print("\n[6/8] Creating advisor-student assignments...")
    for link in ADVISOR_LINKS:
        try:
            supabase.table('advisor_student_assignments').upsert(
                {**link, 'assigned_at': 'now()'},
                on_conflict='advisor_id,student_id'
            ).execute()
            print(f"  OK  advisor -> student {link['student_id'][:8]}...")
        except Exception as e:
            print(f"  FAILED  {e}")
            errors.append(f"advisor_link: {e}")

    # ── 5. Create test content ──
    print("\n[7/8] Creating quests, tasks, courses, bounties...")
    for quest in QUESTS:
        try:
            supabase.table('quests').upsert(quest, on_conflict='id').execute()
            print(f"  OK  Quest: {quest['title']}")
        except Exception as e:
            print(f"  FAILED  Quest {quest['title']}: {e}")
            errors.append(f"quest: {e}")

    for enrollment in ENROLLMENTS:
        try:
            supabase.table('user_quests').upsert(
                {**enrollment, 'started_at': 'now()'},
                on_conflict='user_id,quest_id'
            ).execute()
        except Exception as e:
            errors.append(f"enrollment: {e}")

    for task in TASKS:
        try:
            supabase.table('user_quest_tasks').upsert(task, on_conflict='id').execute()
            print(f"  OK  Task: {task['title']}")
        except Exception as e:
            print(f"  FAILED  Task {task['title']}: {e}")
            errors.append(f"task: {e}")

    for course in COURSES:
        try:
            supabase.table('courses').upsert(course, on_conflict='id').execute()
            print(f"  OK  Course: {course['title']}")
        except Exception as e:
            print(f"  FAILED  Course {course['title']}: {e}")
            errors.append(f"course: {e}")

    # Link course to quest
    try:
        supabase.table('course_quests').upsert(
            {'course_id': '12345678-1234-1234-1234-123456789012', 'quest_id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'sequence_order': 1},
            on_conflict='course_id,quest_id'
        ).execute()
    except Exception:
        pass

    for bounty in BOUNTIES:
        try:
            supabase.table('bounties').upsert(bounty, on_conflict='id').execute()
            print(f"  OK  Bounty: {bounty['title']}")
        except Exception as e:
            print(f"  FAILED  Bounty {bounty['title']}: {e}")
            errors.append(f"bounty: {e}")

    # ── 6. Enroll student in course ──
    print("\n[8/8] Enrolling test student in course...")
    try:
        supabase.table('course_enrollments').upsert(
            {'user_id': '22222222-2222-2222-2222-222222222222', 'course_id': '12345678-1234-1234-1234-123456789012', 'status': 'active'},
            on_conflict='user_id,course_id'
        ).execute()
        print("  OK  Student enrolled in SDL course")
    except Exception as e:
        print(f"  FAILED  {e}")
        errors.append(f"course_enrollment: {e}")

    # ── Summary ──
    print("\n" + "=" * 60)
    if errors:
        print(f"  DONE with {len(errors)} error(s):")
        for err in errors:
            print(f"    - {err}")
    else:
        print("  ALL DONE - No errors")

    print(f"\n  Users created: {len(USERS)}")
    print(f"  Password for all: {DEFAULT_PASSWORD}")
    print("")
    print("  Test accounts:")
    for u in USERS:
        role = u.get('org_role') or u['role']
        print(f"    {u['email']:40s} {role}")
    print("=" * 60)

    return len(errors) == 0


def cleanup():
    """Remove all test data created by the seeder."""
    supabase_url = os.environ.get('SUPABASE_URL')
    supabase_service_key = os.environ.get('SUPABASE_SERVICE_KEY')

    if not supabase_url or not supabase_service_key:
        print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars")
        sys.exit(1)

    supabase = create_client(supabase_url, supabase_service_key)

    print("=" * 60)
    print("  Optio E2E Test Data Cleanup")
    print("=" * 60)

    # Delete in reverse dependency order
    for bounty in BOUNTIES:
        try:
            supabase.table('bounties').delete().eq('id', bounty['id']).execute()
            print(f"  Deleted bounty: {bounty['title']}")
        except Exception as e:
            print(f"  Failed to delete bounty {bounty['title']}: {e}")

    print("\n  Cleanup complete.")
    print("=" * 60)


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--cleanup':
        cleanup()
    else:
        success = main()
        sys.exit(0 if success else 1)

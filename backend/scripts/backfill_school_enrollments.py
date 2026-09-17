"""
Backfill school_enrollments for families who registered through the funnel
before it wrote enrollments itself (M4, 2026-09-17).

Every child of a COMPLETED funnel registration in the org who has no
school_enrollments row becomes 'enrolled' (or 'applicant' when the school
still has them queued on the enrollment waitlist). A child who already has a
row -- withdrawn, graduated, anything -- is left alone: the row is the
school's decision and this script only fills the blanks the funnel left.

Dry-run by default; pass --apply to write. One org at a time, reviewed.

    ../venv/bin/python scripts/backfill_school_enrollments.py --org-slug icreate
    ../venv/bin/python scripts/backfill_school_enrollments.py --org-slug icreate --apply
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--org-slug', required=True)
    ap.add_argument('--apply', action='store_true', help='write to the database (default: dry run)')
    args = ap.parse_args()

    from utils.admin_client import admin_client
    from utils.db_fetch import fetch_all_rows
    admin = admin_client()
    org_rows = admin.table('organizations').select('id, name').eq('slug', args.org_slug).execute().data
    if not org_rows:
        sys.exit(f'No organization with slug "{args.org_slug}"')
    org = org_rows[0]

    regs = fetch_all_rows(lambda: (
        admin.table('registrations').select('id, kids, status')
        .eq('organization_id', org['id']).eq('status', 'completed')))
    kid_ids = []
    for r in regs:
        for k in r.get('kids') or []:
            if k.get('user_id') and k['user_id'] not in kid_ids:
                kid_ids.append(k['user_id'])
    existing = set()
    for i in range(0, len(kid_ids), 200):
        chunk = kid_ids[i:i + 200]
        existing.update(e['student_user_id'] for e in (
            admin.table('school_enrollments').select('student_user_id')
            .eq('organization_id', org['id']).in_('student_user_id', chunk).execute()).data or [])
    # Only students who still hold an account in the org (a kid the family
    # removed on a back-edit has no users row).
    present = set()
    for i in range(0, len(kid_ids), 200):
        chunk = kid_ids[i:i + 200]
        present.update(u['id'] for u in (
            admin.table('users').select('id').eq('organization_id', org['id'])
            .in_('id', chunk).execute()).data or [])
    missing = [k for k in kid_ids if k in present and k not in existing]
    waiting = set(e['student_user_id'] for e in (
        admin.table('sis_enrollment_waitlist').select('student_user_id')
        .eq('organization_id', org['id']).eq('status', 'waiting').execute()).data or []) if missing else set()

    print(f'{org["name"]}: {len(regs)} completed registrations, {len(kid_ids)} children, '
          f'{len(existing)} already have an enrollment row, {len(missing)} to fill '
          f'({len([m for m in missing if m in waiting])} as applicant)')
    if not args.apply:
        print('Dry run -- pass --apply to write.')
        return
    from services import sis_person_service
    written = sis_person_service.enroll_students(org['id'], missing,
                                                 applicant_ids=[m for m in missing if m in waiting])
    print(f'Wrote {written} school_enrollments rows.')


if __name__ == '__main__':
    main()

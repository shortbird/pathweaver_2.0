"""Schema invariants that account deletion depends on and no mock can see.

Sentry OPTIO-BACKEND-75 / -76, 2026-08-27: `auth.admin.delete_user()` failed for
every account on the platform, and GoTrue reported both underlying causes as the
same opaque string:

    delete auth user: Database error deleting user

Neither is reachable from a mocked test -- a fake Supabase happily deletes a row
that Postgres refuses -- so these read the migrations, the way
test_org_role_constraints.py does. Latest migration wins, because that is what
the database ends up with.
"""

import re
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
MIGRATION_DIRS = (REPO / 'supabase' / 'migrations',
                  REPO / 'supabase' / 'migrations-archive',
                  REPO / 'backend' / 'migrations')


def _migrations():
    files = [p for d in MIGRATION_DIRS if d.is_dir() for p in d.glob('*.sql')]
    return sorted(files, key=lambda p: p.name)


def _last_statement(pattern):
    """(filename, match) from the newest migration matching `pattern`."""
    found = None
    for path in _migrations():
        for m in re.finditer(pattern, path.read_text(encoding='utf-8'), re.S | re.I):
            found = (path.name, m)
    return found


def test_sync_auth_user_deletion_cannot_re_enter_the_auth_delete():
    """Two triggers delete each other's rows:

        DELETE FROM auth.users
          -> on_auth_user_delete           BEFORE DELETE ON auth.users
             -> cleanup_user_data()        DELETE FROM public.users
                -> trigger_sync_auth_user_deletion  AFTER DELETE ON public.users
                   -> sync_auth_user_deletion()     DELETE FROM auth.users

    The inner delete re-enters the tuple the outer command already has open, and
    Postgres refuses with SQLSTATE 27000 ("tuple to be deleted was already
    modified by an operation triggered by the current command"). That aborted
    EVERY account deletion, for every user with a public.users row.

    The pg_trigger_depth() guard is the only thing keeping the loop open-ended.
    Rewriting this function without it silently re-breaks deletion for everyone,
    which is why this test reads the newest definition rather than trusting the
    migration that added the guard to stay the last word.
    """
    found = _last_statement(
        r'CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.sync_auth_user_deletion\b.*?'
        r'\$function\$(.*?)\$function\$')
    assert found, 'No migration defines public.sync_auth_user_deletion()'
    name, match = found
    body = match.group(1)

    assert 'delete from auth.users' in body.lower(), (
        f'{name}: sync_auth_user_deletion() no longer deletes the auth user; '
        'if that is deliberate, delete this test with it.')
    assert 'pg_trigger_depth()' in body, (
        f'{name}: sync_auth_user_deletion() lost its pg_trigger_depth() guard. '
        'Without it every account deletion fails with SQLSTATE 27000 -- see '
        'Sentry OPTIO-BACKEND-75/76.')


def test_student_access_logs_accessor_id_is_nullable():
    """`accessor_id` carries ON DELETE SET NULL, so NOT NULL on the same column
    is a contradiction Postgres only resolves at delete time, with 23502. It
    blocked the erasure of anyone who had ever opened a student record, and it
    also silently dropped every access log written with no accessor (public and
    system reads, which AccessLogger passes as None).
    """
    dropped = _last_statement(
        r'ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?student_access_logs\s+'
        r'ALTER\s+COLUMN\s+accessor_id\s+DROP\s+NOT\s+NULL')
    readded = _last_statement(
        r'ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?student_access_logs\s+'
        r'ALTER\s+COLUMN\s+accessor_id\s+SET\s+NOT\s+NULL')

    assert dropped, (
        'No migration drops NOT NULL from student_access_logs.accessor_id. '
        'The column is ON DELETE SET NULL; NOT NULL makes every accessor '
        'undeletable (Sentry OPTIO-BACKEND-75/76).')
    if readded:
        assert readded[0] < dropped[0], (
            f'{readded[0]} re-adds NOT NULL to student_access_logs.accessor_id '
            f'after {dropped[0]} dropped it. That re-breaks account deletion '
            'for every parent, advisor, observer and admin.')

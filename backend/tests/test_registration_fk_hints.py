"""
PostgREST FK embed hints must not name a table that was renamed away.

A hint like `users!registrations_parent_user_id_fkey` is a STRING coupled to a
database object. Nothing imports it, no type checker sees it, and the query it
sits in parses fine — it fails at request time with PGRST200, "Could not find a
relationship in the schema cache".

That is exactly what happened on 2026-08-25. Renaming icreate_registrations to
registrations was done as expand/contract, and the expand phase deliberately
left the constraint names alone so the deployed backend's embed kept resolving
through the compatibility view. The contract migration then renamed the
constraints, which silently invalidated the one hint still spelling the old
name — in /start, on the path that resumes a half-finished registration.

So: whenever a migration renames a table, every hint carrying the old name has
to move with it. This test reads the rename history out of the migrations and
fails the build on any hint left behind.
"""

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
BACKEND = REPO / 'backend'
MIGRATIONS = REPO / 'supabase' / 'migrations'

# users!some_table_some_column_fkey  ->  captures "some_table_some_column_fkey"
HINT_RE = re.compile(r'!([a-z][a-z0-9_]*_fkey)\b')
# ALTER TABLE [public.]old RENAME TO new
RENAME_RE = re.compile(
    r'ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?([a-z][a-z0-9_]*)\s+RENAME\s+TO\s+(?:public\.)?([a-z][a-z0-9_]*)',
    re.IGNORECASE)


def _renamed_away_tables():
    """Old table names that a migration renamed to something else.

    A name that was later renamed BACK, or reused by a fresh CREATE TABLE, is
    not stale — only names with no current owner matter, so the new names are
    subtracted from the old ones.
    """
    old, new = set(), set()
    for sql in MIGRATIONS.glob('*.sql'):
        for a, b in RENAME_RE.findall(sql.read_text(encoding='utf-8')):
            old.add(a.lower())
            new.add(b.lower())
    return old - new


def _hints_in_backend():
    """(file, lineno, hint) for every PostgREST FK embed hint in backend/."""
    out = []
    for path in BACKEND.rglob('*.py'):
        if '__pycache__' in path.parts or 'tests' in path.parts:
            continue
        for i, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
            for hint in HINT_RE.findall(line):
                out.append((path.relative_to(REPO), i, hint))
    return out


@pytest.mark.unit
class TestFkEmbedHints:
    def test_the_migrations_record_the_registrations_rename(self):
        """Guards the guard: if this stops finding the rename, the test below is
        silently checking nothing."""
        assert 'icreate_registrations' in _renamed_away_tables()

    def test_no_hint_names_a_table_that_was_renamed_away(self):
        stale_tables = _renamed_away_tables()
        offenders = [
            f'{path}:{line} -> {hint}'
            for path, line, hint in _hints_in_backend()
            for table in stale_tables
            if hint.startswith(f'{table}_')
        ]
        assert not offenders, (
            'PostgREST embed hints name a renamed-away table. These fail at '
            'REQUEST time with PGRST200, not at import:\n  ' + '\n  '.join(offenders))

    def test_the_registration_funnel_hint_matches_its_table(self):
        """The specific one that broke. Pinned by name so a future edit that
        reintroduces the old spelling fails here with an obvious message."""
        src = (BACKEND / 'routes' / 'registration_funnel.py').read_text(encoding='utf-8')
        assert 'users!registrations_parent_user_id_fkey' in src
        assert 'icreate_registrations_parent_user_id_fkey' not in src

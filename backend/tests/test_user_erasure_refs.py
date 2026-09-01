"""
The three erasure reference lists must stay coherent.

Every column pointing at a departing user is handled exactly once: deleted
(OWNED_ROWS), nulled (ANONYMIZE_REFS), or reported as a blocker (BLOCKING_REFS).
A column in two lists is a contradiction -- ANONYMIZE_REFS nulls what
BLOCKING_REFS says cannot be nulled -- and a column in none of them blocks the
auth delete with GoTrue's unattributable "Database error deleting user", which
names nothing and cost a full schema investigation the last time
(Sentry OPTIO-BACKEND-75/76).

A 2026-09-01 audit of non-cascading FKs to auth.users found three that were in
no list at all: ai_generated_quests.reviewer_id, ai_generation_jobs.created_by
and docs_articles.created_by. They are nullable, so they anonymize.
"""

import app  # noqa: F401 — import graph ordering

from repositories.user_erasure_repository import (
    ANONYMIZE_REFS,
    BLOCKING_REFS,
    OWNED_ROWS,
)


class TestNoContradictions:
    def test_a_column_is_never_both_anonymized_and_blocking(self):
        overlap = set(ANONYMIZE_REFS) & set(BLOCKING_REFS)
        assert not overlap, f'nulled and declared un-nullable: {sorted(overlap)}'

    def test_a_column_is_never_both_deleted_and_anonymized(self):
        overlap = set(OWNED_ROWS) & set(ANONYMIZE_REFS)
        assert not overlap, f'deleted and nulled: {sorted(overlap)}'

    def test_a_column_is_never_both_deleted_and_blocking(self):
        overlap = set(OWNED_ROWS) & set(BLOCKING_REFS)
        assert not overlap, f'deleted and declared blocking: {sorted(overlap)}'


class TestNoDuplicates:
    def test_anonymize_refs_has_no_repeats(self):
        assert len(ANONYMIZE_REFS) == len(set(ANONYMIZE_REFS))

    def test_blocking_refs_has_no_repeats(self):
        assert len(BLOCKING_REFS) == len(set(BLOCKING_REFS))


class TestShape:
    def test_every_entry_is_a_table_column_pair(self):
        for name, refs in (('OWNED_ROWS', OWNED_ROWS),
                           ('ANONYMIZE_REFS', ANONYMIZE_REFS),
                           ('BLOCKING_REFS', BLOCKING_REFS)):
            for entry in refs:
                assert isinstance(entry, tuple) and len(entry) == 2, \
                    f'{name} entry is not a (table, column) pair: {entry!r}'
                assert all(isinstance(p, str) and p for p in entry), \
                    f'{name} entry has a non-string part: {entry!r}'


class TestAuthUsersReferencesAreCovered:
    """The columns that reference auth.users directly rather than public.users.

    These do not follow the public.users cascade, so each must be handled
    explicitly or it blocks the account's auth delete.
    """

    AUTH_REFS = (
        ('ai_generated_quests', 'reviewer_id'),
        ('ai_generation_jobs', 'created_by'),
        ('docs_articles', 'created_by'),
        ('lesson_reflections', 'user_id'),
    )

    def test_each_is_handled_by_exactly_one_list(self):
        handled = set(OWNED_ROWS) | set(ANONYMIZE_REFS) | set(BLOCKING_REFS)
        missing = [ref for ref in self.AUTH_REFS if ref not in handled]
        assert not missing, (
            'these reference auth.users on a non-cascading FK and would block '
            f'the auth delete unnamed: {missing}'
        )

    def test_the_reflections_rows_are_deleted_as_the_users_own_data(self):
        assert ('lesson_reflections', 'user_id') in OWNED_ROWS

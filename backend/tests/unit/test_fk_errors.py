"""Reading a Postgres foreign-key violation back to the admin who caused it.

See utils/fk_errors.py — this is the parser that stops an unhandled 23503 from
reaching an org admin as a 500.
"""

import pytest

from utils.fk_errors import fk_blocker, fk_blocker_label


PG_MESSAGE = (
    'update or delete on table "users" violates foreign key constraint '
    '"group_members_added_by_fkey" on table "group_members"'
)


@pytest.mark.unit
class TestFkBlocker:
    def test_it_finds_the_referencing_table_not_the_deleted_one(self):
        assert fk_blocker(Exception(PG_MESSAGE)) == 'group_members'

    def test_it_reads_the_dict_repr_supabase_actually_raises(self):
        raw = ("{'message': '" + PG_MESSAGE + "', 'code': '23503', 'hint': None, "
               "'details': 'Key (id)=(abc) is still referenced from table \"group_members\".'}")
        assert fk_blocker(Exception(raw)) == 'group_members'

    def test_a_bare_sqlstate_still_counts(self):
        assert fk_blocker(Exception('23503 on table "courses"')) == 'courses'

    def test_an_unrelated_error_is_none_so_the_caller_re_raises(self):
        assert fk_blocker(Exception('connection reset by peer')) is None
        assert fk_blocker(TimeoutError('the read operation timed out')) is None

    def test_a_violation_naming_no_other_table_is_none(self):
        assert fk_blocker(Exception('foreign key trouble on table "users"')) is None


@pytest.mark.unit
class TestLabels:
    def test_known_tables_read_as_english(self):
        assert fk_blocker_label('group_members') == 'message groups they added people to'
        assert fk_blocker_label('courses') == 'courses they created'

    def test_an_unknown_table_falls_back_to_its_name(self):
        assert fk_blocker_label('some_new_table_2027') == 'some_new_table_2027'

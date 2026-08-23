"""enroll_class_invite guards (blocks P2).

The accept half of a class invite link must: ignore non-class invitations,
refuse a class from another org or an archived class, and never raise —
the org join must survive a broken class reference.
"""

from unittest.mock import Mock

from services.class_invite_service import enroll_class_invite

ORG = 'org-1'
INV = {'id': 'inv-1', 'organization_id': ORG, 'invited_by': 'teacher-1',
       'metadata': {'invitation_type': 'class', 'class_id': 'class-1'}}


def _supabase(cls_row):
    supabase = Mock()
    table = supabase.table.return_value
    table.select.return_value.eq.return_value.maybe_single.return_value \
        .execute.return_value = Mock(data=cls_row)
    table.upsert.return_value.execute.return_value = Mock(data=[{'id': 'e-1'}])
    return supabase


def _cls(org=ORG, status='active'):
    return {'id': 'class-1', 'name': 'Biology', 'organization_id': org, 'status': status}


def test_enrolls_and_returns_class_name():
    supabase = _supabase(_cls())
    assert enroll_class_invite(supabase, 'student-1', INV) == 'Biology'
    row = supabase.table.return_value.upsert.call_args[0][0]
    assert row == {'class_id': 'class-1', 'student_id': 'student-1',
                   'enrolled_by': 'teacher-1', 'status': 'active'}


def test_ignores_non_class_invitations():
    supabase = _supabase(_cls())
    inv = {**INV, 'metadata': {'invitation_type': 'parent', 'student_ids': ['s1']}}
    assert enroll_class_invite(supabase, 'student-1', inv) is None
    supabase.table.assert_not_called()


def test_refuses_class_from_another_org():
    supabase = _supabase(_cls(org='other-org'))
    assert enroll_class_invite(supabase, 'student-1', INV) is None
    supabase.table.return_value.upsert.assert_not_called()


def test_refuses_archived_class():
    supabase = _supabase(_cls(status='archived'))
    assert enroll_class_invite(supabase, 'student-1', INV) is None
    supabase.table.return_value.upsert.assert_not_called()


def test_never_raises_on_db_error():
    supabase = Mock()
    supabase.table.side_effect = Exception('boom')
    assert enroll_class_invite(supabase, 'student-1', INV) is None

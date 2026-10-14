"""Unit tests for the Student-created quest badge annotation."""

import pytest
from unittest.mock import Mock, patch

from utils.student_created import annotate_student_created


def _users_response(rows, enrollments=()):
    """Admin client double: `users` answers with `rows`, `user_quests` with
    `enrollments` (rows that carry an enrolled_by_user_id)."""
    users = Mock()
    users.select.return_value.in_.return_value.execute.return_value = Mock(data=rows)
    user_quests = Mock()
    user_quests.select.return_value.in_.return_value.not_.is_.return_value \
        .execute.return_value = Mock(data=list(enrollments))
    admin = Mock()
    admin.table.side_effect = lambda name: {'users': users, 'user_quests': user_quests}[name]
    return admin


@pytest.mark.unit
class TestAnnotateStudentCreated:

    def test_student_creators_and_metadata_flag(self):
        quests = [
            {'id': 'q1', 'created_by': 'u-student'},
            {'id': 'q2', 'created_by': 'u-org-student'},
            {'id': 'q3', 'created_by': 'u-admin'},
            # Manual flag wins even though the creator is not a student
            # (e.g. staff entered the quest on a student's behalf).
            {'id': 'q4', 'created_by': 'u-admin', 'metadata': {'student_created': True}},
            {'id': 'q5', 'created_by': None},
        ]
        users = [
            {'id': 'u-student', 'role': 'student', 'org_role': None},
            {'id': 'u-org-student', 'role': 'org_managed', 'org_role': 'student'},
            {'id': 'u-admin', 'role': 'superadmin', 'org_role': None},
        ]
        with patch('utils.student_created.get_supabase_admin_client',
                   return_value=_users_response(users)):
            annotate_student_created(quests)

        assert [q['student_created'] for q in quests] == [True, True, False, True, False]

    def test_org_admin_creator_is_not_student(self):
        quests = [{'id': 'q1', 'created_by': 'u-oa'}]
        users = [{'id': 'u-oa', 'role': 'org_managed', 'org_role': 'org_admin'}]
        with patch('utils.student_created.get_supabase_admin_client',
                   return_value=_users_response(users)):
            annotate_student_created(quests)
        assert quests[0]['student_created'] is False

    def test_lookup_failure_degrades_to_metadata_only(self):
        quests = [
            {'id': 'q1', 'created_by': 'u-student'},
            {'id': 'q2', 'metadata': {'student_created': True}},
        ]
        with patch('utils.student_created.get_supabase_admin_client',
                   side_effect=RuntimeError('db down')):
            annotate_student_created(quests)
        assert quests[0]['student_created'] is False
        assert quests[1]['student_created'] is True

    def test_no_creator_ids_skips_lookup(self):
        quests = [{'id': 'q1'}]
        with patch('utils.student_created.get_supabase_admin_client') as mock_client:
            annotate_student_created(quests)
        mock_client.assert_not_called()
        assert quests[0]['student_created'] is False


STUDENT = 'u-eva'
PARENT = 'u-lisa'
STUDENT_ROW = {'id': STUDENT, 'role': 'org_managed', 'org_role': 'student'}


@pytest.mark.unit
class TestParentMadeQuestIsNotStudentCreated:
    """Ticket 41a29c4f: a parent asked why the quests she makes for her child
    are tagged "Student-created". In family scope the quest's created_by is
    the child, so the badge read the child as the author."""

    def _annotate(self, quests, enrollments=(), guardians=None):
        with patch('utils.student_created.get_supabase_admin_client',
                   return_value=_users_response([STUDENT_ROW], enrollments)), \
                patch('utils.student_created.guardians_by_student',
                      return_value=guardians if guardians is not None else {STUDENT: {PARENT}}) as g:
            annotate_student_created(quests)
        return g

    def test_parent_created_in_child_scope_is_not_flagged(self):
        quests = [{'id': 'q1', 'created_by': STUDENT,
                   'metadata': {'created_by_user_id': PARENT, 'created_via': 'parent'}}]
        self._annotate(quests)
        assert quests[0]['student_created'] is False

    def test_student_made_quest_is_still_flagged(self):
        quests = [{'id': 'q1', 'created_by': STUDENT, 'metadata': {}}]
        self._annotate(quests, enrollments=[
            {'quest_id': 'q1', 'user_id': STUDENT, 'enrolled_by_user_id': None}])
        assert quests[0]['student_created'] is True

    def test_legacy_quest_enrolled_by_a_parent_is_not_flagged(self):
        quests = [{'id': 'q1', 'created_by': STUDENT, 'metadata': {}}]
        g = self._annotate(quests, enrollments=[
            {'quest_id': 'q1', 'user_id': STUDENT, 'enrolled_by_user_id': PARENT}])
        assert quests[0]['student_created'] is False
        g.assert_called_once_with({STUDENT})

    def test_legacy_enrolled_by_someone_who_is_not_a_guardian_stays_flagged(self):
        quests = [{'id': 'q1', 'created_by': STUDENT, 'metadata': {}}]
        self._annotate(quests, enrollments=[
            {'quest_id': 'q1', 'user_id': STUDENT, 'enrolled_by_user_id': 'u-advisor'}],
            guardians={STUDENT: {PARENT}})
        assert quests[0]['student_created'] is True

    def test_a_parent_enrolling_another_child_does_not_unflag_the_creators_quest(self):
        # The sibling's enrollment is about the sibling, not about who wrote it.
        quests = [{'id': 'q1', 'created_by': STUDENT, 'metadata': {}}]
        g = self._annotate(quests, enrollments=[
            {'quest_id': 'q1', 'user_id': 'u-sibling', 'enrolled_by_user_id': PARENT}])
        assert quests[0]['student_created'] is True
        g.assert_not_called()

    def test_manual_flag_still_wins(self):
        quests = [{'id': 'q1', 'created_by': STUDENT,
                   'metadata': {'student_created': True, 'created_by_user_id': PARENT}}]
        self._annotate(quests)
        assert quests[0]['student_created'] is True

    def test_guardian_lookup_failure_keeps_the_old_answer(self):
        quests = [{'id': 'q1', 'created_by': STUDENT, 'metadata': {}}]
        with patch('utils.student_created.get_supabase_admin_client',
                   return_value=_users_response([STUDENT_ROW], [
                       {'quest_id': 'q1', 'user_id': STUDENT, 'enrolled_by_user_id': PARENT}])), \
                patch('utils.student_created.guardians_by_student',
                      side_effect=RuntimeError('db down')):
            annotate_student_created(quests)
        assert quests[0]['student_created'] is True


def _create_as(caller_id, student_id, via):
    """POST /api/quests/create with the scope decorators unwrapped."""
    from types import SimpleNamespace
    from unittest.mock import MagicMock
    from routes.quest.enrollment import create_user_quest
    from utils.guardian_scope import StudentScope
    from app import app
    inner = create_user_quest.__wrapped__.__wrapped__

    admin = MagicMock()
    for chained in ('table', 'select', 'insert', 'eq', 'delete'):
        getattr(admin, chained).return_value = admin
    admin.execute.return_value = SimpleNamespace(data=[{'id': 'q-new', 'title': 'Typing'}])
    quest_repo = Mock()
    quest_repo.enroll_user.return_value = {'id': 'enr-1', 'is_active': True}
    quest_repo.get_user_enrollment.return_value = {'id': 'enr-1'}
    scope = StudentScope(caller_id=caller_id, student_id=student_id, via=via)

    with app.test_request_context('/api/quests/create', method='POST', json={'title': 'Typing'}), \
            patch('routes.quest.enrollment.current_student_scope', return_value=scope), \
            patch('routes.quest.enrollment.get_supabase_admin_client', return_value=admin), \
            patch('routes.quest.enrollment.QuestRepository', return_value=quest_repo), \
            patch('services.image_service.search_quest_image', return_value=None):
        resp = inner(student_id)
    status = resp[1] if isinstance(resp, tuple) else resp.status_code
    return status, admin.insert.call_args.args[0], quest_repo


@pytest.mark.unit
class TestCreateRecordsWhoMadeTheQuest:
    """Ticket 41a29c4f: the create route records the parent as the maker."""

    def test_parent_in_child_scope_is_recorded_in_metadata(self):
        status, inserted, repo = _create_as(PARENT, STUDENT, 'parent')
        assert status == 200
        assert inserted['created_by'] == STUDENT
        assert inserted['metadata'] == {'created_by_user_id': PARENT, 'created_via': 'parent'}
        repo.enroll_user.assert_called_once_with(STUDENT, 'q-new', enrolled_by_user_id=PARENT)

    def test_student_making_their_own_quest_records_nothing_extra(self):
        status, inserted, repo = _create_as(STUDENT, STUDENT, 'self')
        assert status == 200
        assert inserted['created_by'] == STUDENT
        assert 'metadata' not in inserted
        repo.enroll_user.assert_called_once_with(STUDENT, 'q-new', enrolled_by_user_id=None)

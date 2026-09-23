"""Feedback reaches the parents, and the family's replies reach the teacher.

iCreate, ticket 41474658 (2026-09-23), from a teacher: "I talked with a mom,
and she was not getting a notification when I left feedback on the task
submitted. Can we have a notification for that?"

Two gaps in POST /api/credit/<completion_id>/messages:

1. Teacher feedback notified the student only. Every guardian now gets a
   child_task_reviewed notice (metadata.action 'feedback'), the type the SIS
   accept already sends, so the parent's "Work reviewed" toggle covers it.
2. A reply from the student or a parent went to credit_reviewer_id /
   org_reviewer_id. The SIS Submissions review never sets either, so the
   teacher never heard the answer. It now goes to the SIS reviewer
   (sis_submission_reviews.reviewed_by) or, with no SIS review, to the
   teachers of the class that holds the quest.
"""

from unittest.mock import MagicMock, Mock, patch

import pytest

USER = 'test-user-123'          # the caller mock_verify_token signs in
KID = '11111111-1111-4111-8111-111111111111'
MUM, DAD = 'mum-1', 'dad-1'
TEACHER, OTHER_TEACHER = 'teacher-1', 'teacher-2'
QUEST = 'quest-1'
COMPLETION_ID = 'c-1'


class _Table:
    def __init__(self, rows):
        self._rows = rows

    def __getattr__(self, _):
        return lambda *a, **k: self

    def execute(self):
        return Mock(data=list(self._rows))


def _admin(tables):
    c = Mock()
    c.table.side_effect = lambda name: _Table(tables.get(name, []))
    return c


def _completion(**extra):
    return {'id': COMPLETION_ID, 'user_id': KID, 'quest_id': QUEST,
            'user_quest_task_id': 'task-1', 'credit_reviewer_id': None,
            'org_reviewer_id': None, **extra}


def _post(client, *, caller, roles, completion, tables, guardians=None,
          is_guardian=False, student_classes=(), class_teachers=None):
    """Post one message as `caller` and return the notifier's calls."""
    notifier = MagicMock()
    notifier.create_notification.return_value = {'id': 'n-1'}
    base = {
        'credit_review_messages': [{'id': 'm-1', 'body': 'hi'}],
        'user_quest_tasks': [{'title': 'Sketch three designs'}],
        'users': [{'first_name': 'Ada', 'display_name': 'Ada L'}],
    }
    base.update(tables)
    class_teachers = class_teachers or {}
    with patch('routes.credit_messages.get_supabase_admin_client', return_value=_admin(base)), \
         patch('routes.credit_messages._load_context', return_value=(completion, caller, roles)), \
         patch('routes.credit_messages._can_access', return_value=True), \
         patch('routes.credit_messages._is_guardian', return_value=is_guardian), \
         patch('services.notification_service.NotificationService', return_value=notifier), \
         patch('utils.class_membership.guardians_by_student',
               return_value={KID: set(guardians or ())}), \
         patch('utils.class_membership.student_class_ids', return_value=set(student_classes)), \
         patch('utils.class_membership.class_teacher_ids',
               side_effect=lambda cid: set(class_teachers.get(cid, ()))):
        resp = client.post(f'/api/credit/{COMPLETION_ID}/messages', json={'body': 'Nice work'},
                           headers={'Authorization': 'Bearer t'})
    assert resp.status_code == 201, resp.get_json()
    return [c.kwargs for c in notifier.create_notification.call_args_list]


TEACHER_USER = {'id': USER, 'role': 'org_managed', 'org_role': 'advisor',
                'organization_id': 'org-icreate', 'display_name': 'Nicole Connole'}


@pytest.mark.unit
class TestTeacherFeedbackReachesGuardians:

    def test_every_guardian_is_told_and_the_student_still_is(self, client, mock_verify_token):
        sent = _post(client, caller=TEACHER_USER, roles=['advisor'], completion=_completion(),
                     tables={}, guardians={MUM, DAD})
        student = [s for s in sent if s['user_id'] == KID]
        assert len(student) == 1 and student[0]['notification_type'] == 'message_received'
        parents = [s for s in sent if s['user_id'] in (MUM, DAD)]
        assert sorted(s['user_id'] for s in parents) == [DAD, MUM]
        for s in parents:
            assert s['notification_type'] == 'child_task_reviewed'
            assert s['metadata'] == {'student_id': KID, 'completion_id': COMPLETION_ID,
                                     'action': 'feedback'}
            assert s['message'] == 'Nicole Connole left feedback on Ada\'s "Sketch three designs".'
            assert s['link'] == f'/parent/quest/{KID}/{QUEST}'
            assert s['organization_id'] == 'org-icreate'

    def test_each_guardian_is_told_once(self, client, mock_verify_token):
        sent = _post(client, caller=TEACHER_USER, roles=['advisor'], completion=_completion(),
                     tables={}, guardians={MUM})
        assert [s['user_id'] for s in sent if s['user_id'] == MUM] == [MUM]
        assert len(sent) == 2   # the student and the one guardian, nothing else

    def test_no_guardian_means_only_the_student(self, client, mock_verify_token):
        sent = _post(client, caller=TEACHER_USER, roles=['advisor'], completion=_completion(),
                     tables={}, guardians=set())
        assert [s['user_id'] for s in sent] == [KID]

    def test_optios_own_review_is_signed_optio_to_the_parent_too(self, client, mock_verify_token):
        admin_user = {'id': USER, 'role': 'superadmin', 'display_name': 'Tanner'}
        with patch('routes.credit_messages.get_effective_role', return_value='superadmin'):
            sent = _post(client, caller=admin_user, roles=['superadmin'], completion=_completion(),
                         tables={}, guardians={MUM})
        mum = next(s for s in sent if s['user_id'] == MUM)
        assert mum['message'].startswith('Optio left feedback')

    def test_the_student_is_not_notified_about_a_family_message(self, client, mock_verify_token):
        """A parent's reply is the family's side: no guardian fan-out at all."""
        parent = {'id': USER, 'role': 'parent', 'display_name': 'Mum'}
        sent = _post(client, caller=parent, roles=['parent'], completion=_completion(),
                     tables={'sis_submission_reviews': [{'reviewed_by': TEACHER}]},
                     guardians={USER, DAD}, is_guardian=True)
        assert all(s['notification_type'] != 'child_task_reviewed' for s in sent)
        assert KID not in [s['user_id'] for s in sent]


@pytest.mark.unit
def test_a_parent_who_turned_off_work_reviewed_gets_nothing():
    """The guardian notice goes through create_notification, whose preference
    gate reads notification_preferences for child_task_reviewed -- the
    "Work reviewed" toggle in the parent's settings."""
    with patch('supabase.create_client') as factory:
        db = MagicMock()
        factory.return_value = db
        prefs = MagicMock()
        for m in ('select', 'eq', 'limit'):
            getattr(prefs, m).return_value = prefs
        prefs.execute.return_value = Mock(data=[{'enabled': False}])
        db.table.side_effect = lambda name: prefs if name == 'notification_preferences' else MagicMock()
        from services.notification_service import NotificationService
        result = NotificationService().create_notification(
            user_id=MUM, notification_type='child_task_reviewed', title='t', message='m')
    assert result == {}
    assert [c.args[0] for c in db.table.call_args_list] == ['notification_preferences']


# The signed-in caller is always USER, so the student replying owns a
# completion whose user_id is USER.
STUDENT_USER = {'id': USER, 'role': 'student', 'display_name': 'Ada Lovelace'}


@pytest.mark.unit
class TestFamilyRepliesReachTheTeacher:

    def _reply(self, client, *, caller=None, completion=None, reviews=(), **kw):
        caller = caller or STUDENT_USER
        return _post(client, caller=caller, roles=[caller['role']],
                     completion=completion or _completion(user_id=USER),
                     tables={'sis_submission_reviews': list(reviews),
                             'class_quests': [{'class_id': 'class-1'}]}, **kw)

    def test_the_sis_reviewer_hears_the_reply(self, client, mock_verify_token):
        sent = self._reply(client, reviews=[{'reviewed_by': TEACHER}],
                           student_classes={'class-1'}, class_teachers={'class-1': {OTHER_TEACHER}})
        assert [s['user_id'] for s in sent] == [TEACHER]
        assert sent[0]['notification_type'] == 'message_received'
        assert sent[0]['link'] == f'/submissions?completion_id={COMPLETION_ID}'
        assert sent[0]['message'] == 'Ada Lovelace replied on "Sketch three designs".'

    def test_a_submission_sent_back_for_revision_still_reaches_its_reviewer(self, client, mock_verify_token):
        """The review row's action does not matter; whoever reviewed it hears."""
        sent = self._reply(client, reviews=[{'reviewed_by': TEACHER, 'action': 'needs_work'}])
        assert [s['user_id'] for s in sent] == [TEACHER]

    def test_with_no_sis_review_the_class_teachers_hear_it(self, client, mock_verify_token):
        sent = self._reply(client, reviews=[], student_classes={'class-1'},
                           class_teachers={'class-1': {TEACHER, OTHER_TEACHER}})
        assert sorted(s['user_id'] for s in sent) == [TEACHER, OTHER_TEACHER]
        assert all(s['link'] == f'/submissions?completion_id={COMPLETION_ID}' for s in sent)

    def test_the_optio_credit_reviewers_keep_their_notice(self, client, mock_verify_token):
        sent = self._reply(client, reviews=[{'reviewed_by': TEACHER}],
                           completion=_completion(user_id=USER, credit_reviewer_id='optio-reviewer'))
        by_user = {s['user_id']: s['link'] for s in sent}
        assert by_user == {TEACHER: f'/submissions?completion_id={COMPLETION_ID}',
                           'optio-reviewer': '/credit-review'}

    def test_nobody_to_tell_sends_nothing(self, client, mock_verify_token):
        assert self._reply(client, reviews=[], student_classes=set()) == []

    def test_the_replier_is_never_told_about_their_own_reply(self, client, mock_verify_token):
        """A teacher who is also the child's parent replies on the family's side."""
        parent_teacher = {'id': USER, 'role': 'parent', 'display_name': 'Katie Bird'}
        sent = self._reply(client, caller=parent_teacher, is_guardian=True,
                           reviews=[{'reviewed_by': USER}], student_classes={'class-1'},
                           class_teachers={'class-1': {USER}})
        assert sent == []

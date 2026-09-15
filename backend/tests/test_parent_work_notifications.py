"""The three notifications a parent should have been getting (2026-09-15).

Ticket 55ef3acf: a class quest reached a child and the family found out when
the teacher asked why it was late. Nothing told a guardian that a quest was
assigned, or that a teacher had reviewed the child's work, and the teacher's
"still to do" nudge went out as an announcement. Each of the three now has a
type of its own (migration 20260918100000), fans to every guardian through
the one definition of parent (utils.class_membership.guardians_by_student),
and never fails the write it reports.
"""

from unittest.mock import Mock, patch

import pytest

from services import class_quest_enrollment as enrollment
from routes.sis import submissions
from routes.sis import class_quest_students

MUM, DAD = 'mum-1', 'dad-1'
KID = '11111111-1111-4111-8111-111111111111'
KID2 = '11111111-1111-4111-8111-111111111112'
QUEST = '33333333-3333-4333-8333-333333333331'
CLASS = '44444444-4444-4444-8444-444444444444'


class _Table:
    def __init__(self, name, rows):
        self._name, self._rows = name, rows

    def __getattr__(self, _):
        return lambda *a, **k: self

    def execute(self):
        return Mock(data=list(self._rows))


def _client(tables):
    c = Mock()
    c.table.side_effect = lambda name: _Table(name, tables.get(name, []))
    return c


@pytest.fixture
def notifier():
    n = Mock()
    n.create_notification.return_value = {'id': 'n-1'}
    with patch('services.notification_service.NotificationService', return_value=n):
        yield n


@pytest.mark.unit
class TestClassQuestAssigned:
    def _tables(self):
        return {
            'users': [{'id': KID, 'first_name': 'Ada', 'display_name': 'Ada L'},
                      {'id': KID2, 'first_name': None, 'display_name': 'Ben Lovelace'}],
            'org_classes': [{'name': 'Language Studio B', 'organization_id': 'org-1'}],
        }

    def test_every_guardian_of_every_newly_enrolled_child_is_told(self, notifier):
        quests = {QUEST: {'id': QUEST, 'title': 'Vocab week 3'}}
        with patch('utils.class_membership.guardians_by_student',
                   return_value={KID: {MUM, DAD}, KID2: {MUM}}) as resolver:
            enrollment._notify_guardians_of_assignment(
                _client(self._tables()), [(KID, QUEST), (KID2, QUEST)], quests, CLASS)
        resolver.assert_called_once_with([KID, KID2])
        sent = [c.kwargs for c in notifier.create_notification.call_args_list]
        assert {(s['user_id'], s['metadata']['student_id']) for s in sent} == {
            (MUM, KID), (DAD, KID), (MUM, KID2)}
        assert all(s['notification_type'] == 'class_quest_assigned' for s in sent)

    def test_the_notice_names_the_child_the_quest_and_the_class(self, notifier):
        quests = {QUEST: {'id': QUEST, 'title': 'Vocab week 3'}}
        with patch('utils.class_membership.guardians_by_student', return_value={KID: {MUM}}):
            enrollment._notify_guardians_of_assignment(
                _client(self._tables()), [(KID, QUEST)], quests, CLASS)
        sent = notifier.create_notification.call_args.kwargs
        assert sent['title'] == 'New quest for Ada'
        assert sent['message'] == 'Ada was assigned "Vocab week 3" in Language Studio B.'
        # The parent's door to the CHILD's copy, on both surfaces.
        assert sent['link'] == f'/parent/quest/{KID}/{QUEST}'
        assert sent['organization_id'] == 'org-1'

    def test_a_child_with_no_first_name_falls_back_to_their_display_name(self, notifier):
        with patch('utils.class_membership.guardians_by_student', return_value={KID2: {MUM}}):
            enrollment._notify_guardians_of_assignment(
                _client(self._tables()), [(KID2, QUEST)], {QUEST: {'title': 'x'}}, None)
        assert notifier.create_notification.call_args.kwargs['title'] == 'New quest for Ben'

    def test_nobody_is_told_twice_on_the_idempotent_second_run(self, notifier):
        """enroll_students_in_quests fans out only for the pairs it inserted;
        a second run over the same pairs inserts nothing and tells nobody."""
        tables = {
            'quests': [{'id': QUEST, 'is_active': True, 'title': 'x'}],
            'user_quests': [{'user_id': KID, 'quest_id': QUEST}],   # already there
        }
        with patch.object(enrollment, '_notify_guardians_of_assignment') as fanout, \
             patch.object(enrollment, 'load_template_tasks', return_value=[]):
            result = enrollment.enroll_students_in_quests(_client(tables), [KID], [QUEST], class_id=CLASS)
        assert result['enrolled'] == 0
        fanout.assert_not_called()

    def test_a_failed_send_does_not_lose_the_enrollment_or_the_rest(self, notifier):
        notifier.create_notification.side_effect = [RuntimeError('boom'), {'id': 'n-2'}]
        with patch('utils.class_membership.guardians_by_student', return_value={KID: {MUM, DAD}}):
            enrollment._notify_guardians_of_assignment(
                _client(self._tables()), [(KID, QUEST)], {QUEST: {'title': 'x'}}, CLASS)
        assert notifier.create_notification.call_count == 2


@pytest.mark.unit
class TestChildTaskReviewed:
    COMPLETION = {'id': 'c-1', 'user_id': KID, 'quest_id': QUEST, 'user_quest_task_id': 't-1'}

    def _tables(self):
        return {
            'user_quest_tasks': [{'title': 'Sketch three designs', 'xp_value': 50}],
            'users': [{'first_name': 'Ada', 'display_name': 'Ada L'}],
        }

    def test_an_accepted_review_tells_the_student_and_every_guardian(self, notifier):
        with patch('utils.class_membership.guardians_by_student', return_value={KID: {MUM, DAD}}):
            submissions._notify_reviewed(_client(self._tables()), self.COMPLETION, 'accepted', 'org-1')
        notifier.notify_task_approved.assert_called_once_with(
            KID, 'Sketch three designs', 50, 't-1', organization_id='org-1')
        notifier.notify_task_revision_requested.assert_not_called()
        sent = [c.kwargs for c in notifier.create_notification.call_args_list]
        assert {s['user_id'] for s in sent} == {MUM, DAD}
        assert all(s['notification_type'] == 'child_task_reviewed' for s in sent)
        assert sent[0]['message'] == 'A teacher accepted Ada\'s work on "Sketch three designs".'
        assert sent[0]['link'] == f'/parent/quest/{KID}/{QUEST}'

    def test_any_other_action_is_a_revision_request(self, notifier):
        with patch('utils.class_membership.guardians_by_student', return_value={KID: {MUM}}):
            submissions._notify_reviewed(_client(self._tables()), self.COMPLETION, 'needs_work', 'org-1')
        notifier.notify_task_revision_requested.assert_called_once()
        notifier.notify_task_approved.assert_not_called()
        assert notifier.create_notification.call_args.kwargs['message'] == \
            'A teacher asked Ada to revise "Sketch three designs".'

    def test_a_student_with_no_guardian_still_hears_from_the_teacher(self, notifier):
        with patch('utils.class_membership.guardians_by_student', return_value={}):
            submissions._notify_reviewed(_client(self._tables()), self.COMPLETION, 'accepted', 'org-1')
        notifier.notify_task_approved.assert_called_once()
        notifier.create_notification.assert_not_called()

    def test_a_notification_failure_never_reaches_the_route(self):
        with patch('services.notification_service.NotificationService', side_effect=RuntimeError('down')):
            submissions._notify_reviewed(_client(self._tables()), self.COMPLETION, 'accepted', 'org-1')


@pytest.mark.unit
def test_the_unfinished_work_reminder_has_its_own_type():
    """Sent as 'announcement' it read as one in the bell and could not be
    turned off without turning off every school announcement with it."""
    import inspect
    source = inspect.getsource(class_quest_students)
    body = source.split("'A reminder about unfinished work'")[0][-600:]
    assert "notification_type='class_work_reminder'" in body
    assert "notification_type='announcement'" not in body


@pytest.mark.unit
def test_the_three_types_push_to_the_phone_and_are_in_the_check_constraint():
    from pathlib import Path
    from services.notification_service import MOBILE_PUSH_NOTIFICATION_TYPES
    migration = Path(__file__).resolve().parents[2] / 'supabase' / 'migrations' / \
        '20260918100000_parent_work_notification_types.sql'
    sql = migration.read_text()
    for t in ('class_quest_assigned', 'child_task_reviewed', 'class_work_reminder'):
        assert t in MOBILE_PUSH_NOTIFICATION_TYPES, t
        assert f"'{t}'" in sql, f'{t} is not in the notifications.type CHECK migration'

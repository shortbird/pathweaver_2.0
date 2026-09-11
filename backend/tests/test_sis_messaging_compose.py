"""Messaging several staff at once from the SIS console.

Until this landed the console offered one way to write to teachers: pick one
person, and do it again for the next one. The only multi-select anywhere in it
was the announcement composer, which is a broadcast -- no thread, no replies.

Two shapes, both real: one group thread everybody can reply in, or one private
DM each. The tests that matter are the ones about WHO ends up in the room and
who sends it, because those are the ways this goes quietly wrong.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_messaging_service as messaging

ORG = 'org-1'
ADMIN = 'kate'
TEACHER_A = 'teacher-a'
TEACHER_B = 'teacher-b'
TEACHER_C = 'teacher-c'
COORDINATOR = 'julia'
GHOST = 'placeholder-teacher'
OUTSIDER = 'someone-elses-teacher'

STAFF = [
    {'id': ADMIN, 'name': 'Kate A', 'first_name': 'Kate', 'roles': ['org_admin'],
     'role_labels': ['Admin'], 'is_placeholder': False},
    {'id': COORDINATOR, 'name': 'Julia B', 'first_name': 'Julia',
     'roles': ['campus_coordinator'], 'role_labels': ['Coordinator'],
     'is_placeholder': False},
    {'id': TEACHER_A, 'name': 'Ada L', 'first_name': 'Ada', 'roles': ['advisor'],
     'role_labels': ['Teacher'], 'is_placeholder': False},
    {'id': TEACHER_B, 'name': 'Sam P', 'first_name': 'Sam', 'roles': ['advisor'],
     'role_labels': ['Teacher'], 'is_placeholder': False},
    {'id': TEACHER_C, 'name': 'Rae Q', 'first_name': 'Rae', 'roles': ['advisor'],
     'role_labels': ['Teacher'], 'is_placeholder': False},
    {'id': GHOST, 'name': 'Unfilled Post', 'first_name': 'Unfilled',
     'roles': ['advisor'], 'role_labels': ['Teacher'], 'is_placeholder': True},
]

CLASSES = [
    {'id': 'class-1', 'name': 'Ceramics', 'primary_instructor_id': TEACHER_A,
     'assistant_instructor_ids': []},
    {'id': 'class-2', 'name': 'Robotics', 'primary_instructor_id': TEACHER_B,
     'assistant_instructor_ids': [TEACHER_C]},
]

MEETINGS = {1: ['class-1'], 2: ['class-2'], 3: [], 4: [], 5: []}


@pytest.fixture
def org():
    """Patches the org's staff, classes, meetings and front office."""
    def _teachers(class_id, class_row=None):
        row = class_row or {}
        ids = {row.get('primary_instructor_id')}
        ids |= set(row.get('assistant_instructor_ids') or [])
        return {i for i in ids if i}

    with patch('services.sis_service.list_org_staff', return_value=STAFF), \
            patch.object(messaging, '_active_classes', return_value=CLASSES), \
            patch('utils.class_membership.class_teacher_ids', side_effect=_teachers), \
            patch.object(messaging, '_classes_meeting_on',
                         side_effect=lambda o, c, d: set(MEETINGS.get(d, []))), \
            patch('services.school_inbox_service.admin_recipient_ids',
                  return_value=[ADMIN, COORDINATOR]):
        yield


@pytest.fixture
def group_service():
    svc = Mock()
    svc.create_group.return_value = {'id': 'group-1', 'name': 'x'}
    svc.send_message.return_value = {'id': 'msg-1'}
    with patch('services.group_message_service.GroupMessageService', return_value=svc):
        yield svc


@pytest.fixture
def dm_service():
    svc = Mock()
    svc.send_message.side_effect = lambda s, r, c, **k: {'conversation_id': f'conv-{r}'}
    with patch('services.direct_message_service.DirectMessageService', return_value=svc):
        yield svc


@pytest.mark.unit
class TestWhoCanBeMessaged:
    def test_placeholder_staff_are_not_offered(self, org):
        """A placeholder row exists so a class can name a teacher who has no
        account yet. A DM to one is read by nobody."""
        ids = [p['id'] for p in messaging.staff_recipients(ORG)]
        assert GHOST not in ids
        assert TEACHER_A in ids

    def test_a_stranger_is_refused_rather_than_dropped(self, org):
        """Silently discarding a recipient tells the sender their message went
        somewhere it did not."""
        with pytest.raises(ValueError, match='staff at this school'):
            messaging.resolve_recipients(ORG, ADMIN, [OUTSIDER])

    def test_a_placeholder_cannot_be_named_directly(self, org):
        with pytest.raises(ValueError):
            messaging.resolve_recipients(ORG, ADMIN, [GHOST])

    def test_the_sender_is_never_a_recipient(self, org):
        got = messaging.resolve_recipients(ORG, ADMIN, [ADMIN, TEACHER_A])
        assert got == [TEACHER_A]


@pytest.mark.unit
class TestPresets:
    def _preset(self, key):
        return next(p for p in messaging.preset_groups(ORG) if p['key'] == key)

    def test_all_teachers_is_the_advisors(self, org):
        assert set(self._preset('all_teachers')['member_ids']) == \
            {TEACHER_A, TEACHER_B, TEACHER_C}

    def test_all_teachers_excludes_a_placeholder(self, org):
        assert GHOST not in self._preset('all_teachers')['member_ids']

    def test_all_staff_includes_the_office(self, org):
        assert set(self._preset('all_staff')['member_ids']) == \
            {ADMIN, COORDINATOR, TEACHER_A, TEACHER_B, TEACHER_C}

    def test_the_front_office_is_admins_and_coordinators(self, org):
        assert set(self._preset('front_office')['member_ids']) == {ADMIN, COORDINATOR}

    def test_a_class_preset_is_its_teachers(self, org):
        """Assistants count -- they teach the class."""
        assert set(self._preset('class:class-2')['member_ids']) == {TEACHER_B, TEACHER_C}

    def test_a_weekday_preset_is_whoever_teaches_that_day(self, org):
        assert set(self._preset('weekday:1')['member_ids']) == {TEACHER_A}
        assert set(self._preset('weekday:2')['member_ids']) == {TEACHER_B, TEACHER_C}

    def test_an_empty_preset_is_not_offered(self, org):
        """Nobody teaches Wednesday here, so no chip for it."""
        keys = {p['key'] for p in messaging.preset_groups(ORG)}
        assert 'weekday:3' not in keys

    def test_an_unknown_preset_is_refused(self, org):
        with pytest.raises(ValueError, match='no group called'):
            messaging.resolve_recipients(ORG, ADMIN, [], ['weekday:9'])

    def test_presets_and_people_are_unioned_and_deduplicated(self, org):
        got = messaging.resolve_recipients(ORG, ADMIN, [TEACHER_A, TEACHER_B],
                                           ['weekday:1'])
        assert got == sorted([TEACHER_A, TEACHER_B])


@pytest.mark.unit
class TestGroupMode:
    def test_it_creates_one_staff_group_with_everyone_in_it(self, org, group_service):
        result = messaging.compose(ORG, ADMIN, body='Gate code changed',
                                   recipient_ids=[TEACHER_A, TEACHER_B])
        assert result['mode'] == 'group'
        kwargs = group_service.create_group.call_args.kwargs
        assert sorted(kwargs['member_ids']) == sorted([TEACHER_A, TEACHER_B])
        assert kwargs['audience'] == 'staff'
        assert kwargs['organization_id'] == ORG

    def test_the_sender_is_the_staff_member_not_the_school(self, org, group_service):
        """A group cannot be "the school" -- a thread with no author is
        unanswerable. And the school inbox is the FAMILY queue; staff replies
        landing there would bury the parent messages."""
        messaging.compose(ORG, ADMIN, body='Hi', recipient_ids=[TEACHER_A, TEACHER_B])
        assert group_service.create_group.call_args.args[0] == ADMIN
        assert group_service.send_message.call_args.args[0] == ADMIN

    def test_one_message_goes_to_the_group(self, org, group_service):
        messaging.compose(ORG, ADMIN, body='Hi', recipient_ids=[TEACHER_A, TEACHER_B])
        assert group_service.send_message.call_count == 1

    def test_a_single_recipient_is_always_a_dm(self, org, group_service, dm_service):
        """A two-person "group" would leave the recipient with a named room
        instead of a conversation."""
        result = messaging.compose(ORG, ADMIN, body='Hi', recipient_ids=[TEACHER_A])
        assert result['mode'] == 'separate'
        group_service.create_group.assert_not_called()
        assert dm_service.send_message.call_count == 1

    def test_the_default_name_says_who_is_in_it(self, org, group_service):
        messaging.compose(ORG, ADMIN, body='Hi',
                          recipient_ids=[TEACHER_A, TEACHER_B, TEACHER_C])
        name = group_service.create_group.call_args.args[1]
        assert 'and 1 other' in name

    def test_a_given_name_wins(self, org, group_service):
        messaging.compose(ORG, ADMIN, body='Hi', name='Tuesday cover',
                          recipient_ids=[TEACHER_A, TEACHER_B])
        assert group_service.create_group.call_args.args[1] == 'Tuesday cover'

    def test_the_name_is_truncated_to_the_column(self, org, group_service):
        messaging.compose(ORG, ADMIN, body='Hi', name='x' * 300,
                          recipient_ids=[TEACHER_A, TEACHER_B])
        assert len(group_service.create_group.call_args.args[1]) <= messaging.MAX_NAME


@pytest.mark.unit
class TestSeparateMode:
    def test_it_sends_one_dm_per_person(self, org, dm_service, group_service):
        result = messaging.compose(ORG, ADMIN, body='Your paperwork', mode='separate',
                                   recipient_ids=[TEACHER_A, TEACHER_B])
        assert result['mode'] == 'separate'
        assert result['sent'] == 2
        group_service.create_group.assert_not_called()
        assert {c.args[1] for c in dm_service.send_message.call_args_list} == \
            {TEACHER_A, TEACHER_B}

    def test_one_unreachable_person_does_not_stop_the_others(self, org, dm_service):
        def _send(sender, recipient, content, **kwargs):
            if recipient == TEACHER_A:
                raise ValueError('blocked')
            return {'conversation_id': 'c'}
        dm_service.send_message.side_effect = _send

        result = messaging.compose(ORG, ADMIN, body='Hi', mode='separate',
                                   recipient_ids=[TEACHER_A, TEACHER_B])
        assert result['sent'] == 1
        assert result['skipped'] == [TEACHER_A]


@pytest.mark.unit
class TestTheBody:
    def test_the_subject_leads_the_body(self, org, dm_service):
        messaging.compose(ORG, ADMIN, subject='Gate code', body='It is 4821',
                          recipient_ids=[TEACHER_A])
        assert dm_service.send_message.call_args.args[2] == 'Gate code\n\nIt is 4821'

    def test_no_subject_sends_the_body_alone(self, org, dm_service):
        messaging.compose(ORG, ADMIN, body='It is 4821', recipient_ids=[TEACHER_A])
        assert dm_service.send_message.call_args.args[2] == 'It is 4821'

    def test_an_empty_body_is_refused(self, org):
        with pytest.raises(ValueError, match='Write something'):
            messaging.compose(ORG, ADMIN, body='   ', recipient_ids=[TEACHER_A])

    def test_an_attachment_alone_is_enough(self, org, dm_service):
        messaging.compose(ORG, ADMIN, body='', recipient_ids=[TEACHER_A],
                          attachments=[{'url': 'x', 'type': 'image'}])
        assert dm_service.send_message.call_count == 1

    def test_an_overlong_body_is_refused(self, org):
        with pytest.raises(ValueError, match='limited to'):
            messaging.compose(ORG, ADMIN, body='x' * 3000, recipient_ids=[TEACHER_A])

    def test_nobody_to_send_to_is_refused(self, org):
        with pytest.raises(ValueError, match='at least one person'):
            messaging.compose(ORG, ADMIN, body='Hi', recipient_ids=[])

    def test_an_unknown_mode_is_refused(self, org):
        with pytest.raises(ValueError, match='mode'):
            messaging.compose(ORG, ADMIN, body='Hi', mode='shout',
                              recipient_ids=[TEACHER_A])

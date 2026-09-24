"""The SIS Messaging page's one Compose (message_compose_service).

Tickets bf8b754d ("Compose, select who gets the message, the method (push
notification, email, optio message)"), 8ee000b6 ("option to add the class
teacher, class aide, and students") and 9b46c748 (read receipts), iCreate
meeting of 2026-09-23.

What these pin:
  - a class splits into its teachers and its aides, and one person is never
    both (the aide list does not repeat the teacher);
  - one entry per person: a teacher who is a parent here is one row, two kinds;
  - families and students are written to BY THE SCHOOL whatever tab the send
    came from, so their replies land in the School Inbox;
  - anybody outside the school is refused before anything is sent;
  - push is a per-send toggle, and email goes only to the people who were
    actually reached;
  - every send is recorded with every recipient, the skipped ones included,
    so the Sent view can say "Read by N of M".
"""

from unittest.mock import Mock, patch

import pytest

from services import message_compose_service as compose
from utils.class_membership import split_class_staff

ORG = 'org-1'
KATE = 'kate'          # front office, the sender
TEACH = 'teach'        # a teacher, also Ada's parent
AIDE = 'aide'
ADA, BEN, DEE = 'ada', 'ben', 'dee'
MUM = 'mum'

STAFF = [
    {'id': KATE, 'name': 'Kate A', 'first_name': 'Kate', 'roles': ['org_admin'],
     'role_labels': ['Admin']},
    {'id': TEACH, 'name': 'Tam T', 'first_name': 'Tam', 'roles': ['advisor'],
     'role_labels': ['Teacher']},
    {'id': AIDE, 'name': 'Al A', 'first_name': 'Al', 'roles': ['advisor'],
     'role_labels': ['Teacher']},
]
STUDENTS = [
    {'student_id': ADA, 'name': 'Ada L', 'age': 7, 'is_student': True},
    {'student_id': BEN, 'name': 'Ben L', 'age': None, 'is_student': True},
]
GUARDIANS = {ADA: {MUM, TEACH}, BEN: {MUM}}


# ── The class split ──────────────────────────────────────────────────────────

@pytest.mark.unit
class TestClassSplit:
    def test_primary_and_class_advisors_teach_assistants_aide(self):
        split = split_class_staff(
            {'primary_instructor_id': 'p', 'assistant_instructor_ids': ['a1', 'a2']},
            ['adv'])
        assert split == {'teachers': {'p', 'adv'}, 'aides': {'a1', 'a2'}}

    def test_a_teacher_listed_as_an_assistant_too_is_only_a_teacher(self):
        """The aides' chip must not message the teacher a second time."""
        split = split_class_staff(
            {'primary_instructor_id': 'p', 'assistant_instructor_ids': ['p', 'a1']}, [])
        assert split == {'teachers': {'p'}, 'aides': {'a1'}}

    def test_class_teacher_ids_is_still_everybody(self):
        from utils import class_membership
        with patch.object(class_membership, 'class_staff_split',
                          return_value={'teachers': {'p'}, 'aides': {'a'}}):
            assert class_membership.class_teacher_ids('c1') == {'p', 'a'}

    def test_class_parts_carries_the_split_and_the_roster(self):
        parts = compose.class_parts(
            [{'id': 'c1', 'name': 'Art', 'primary_instructor_id': TEACH,
              'assistant_instructor_ids': [AIDE]}],
            {}, {'c1': [ADA, ADA, BEN]})
        assert parts == [{'id': 'c1', 'name': 'Art', 'teacher_ids': [TEACH],
                          'aide_ids': [AIDE], 'student_ids': [ADA, BEN]}]


@pytest.mark.unit
def test_weekday_presets_come_from_the_class_split():
    classes = [{'id': 'c1', 'teacher_ids': [TEACH], 'aide_ids': [AIDE], 'student_ids': []}]
    presets = compose.staff_presets(STAFF, classes, {'c1': [2]}, [KATE])
    by_key = {p['key']: p for p in presets}
    assert by_key['weekday:2']['member_ids'] == [AIDE, TEACH]
    assert 'weekday:1' not in by_key
    assert by_key['front_office']['member_ids'] == [KATE]
    assert by_key['all_teachers']['member_ids'] == [AIDE, TEACH]


# ── The audience ─────────────────────────────────────────────────────────────

def _repo(classes=None, enrollments=None):
    repo = Mock()
    repo.active_classes.return_value = classes or [
        {'id': 'c1', 'name': 'Art', 'primary_instructor_id': TEACH,
         'assistant_instructor_ids': [AIDE]}]
    repo.active_advisors_by_class.return_value = {}
    repo.active_enrollments.return_value = enrollments or {'c1': [ADA]}
    repo.class_meeting_days.return_value = {}
    return repo


@pytest.mark.unit
def test_audience_is_one_entry_per_person_with_every_kind():
    with patch.object(compose, '_repo', return_value=_repo()), \
         patch.object(compose, '_staff', return_value=STAFF), \
         patch.object(compose, '_students', return_value=STUDENTS), \
         patch.object(compose, '_guardian_rows', return_value={
             MUM: {'id': MUM, 'first_name': 'Mia', 'last_name': 'L'},
             TEACH: {'id': TEACH, 'first_name': 'Tam', 'last_name': 'T'}}), \
         patch('utils.class_membership.guardians_by_student',
               side_effect=lambda ids: {s: GUARDIANS[s] for s in ids}), \
         patch('services.school_inbox_service.admin_recipient_ids', return_value=[KATE]):
        result = compose.audience(ORG)

    people = {p['id']: p for p in result['people']}
    assert sorted(people[TEACH]['kinds']) == ['family', 'staff']
    assert people[TEACH]['staff_kinds'] == ['teacher']
    assert people[TEACH]['child_ids'] == [ADA]
    assert people[KATE]['staff_kinds'] == ['office']
    assert people[MUM]['kinds'] == ['family']
    assert people[MUM]['child_ids'] == [ADA, BEN]
    assert people[ADA]['kinds'] == ['student'] and people[ADA]['class_ids'] == ['c1']
    assert result['without_birthdate'] == 1  # Ben
    assert result['classes'][0]['teacher_ids'] == [TEACH]
    assert result['classes'][0]['aide_ids'] == [AIDE]


# ── The send ─────────────────────────────────────────────────────────────────

UNIVERSE = {KATE: 'staff', TEACH: 'staff', AIDE: 'staff', ADA: 'student', MUM: 'family'}


@pytest.fixture
def universe():
    with patch.object(compose, '_universe', return_value=dict(UNIVERSE)):
        yield


@pytest.fixture
def repo():
    r = Mock()
    r.create_send.return_value = {'id': 'send-1'}
    with patch.object(compose, '_repo', return_value=r):
        yield r


def _dm(message_id='m', conversation_id='c'):
    return {'id': message_id, 'conversation_id': conversation_id}


@pytest.mark.unit
class TestCompose:
    def test_a_stranger_is_refused_before_anything_is_sent(self, universe, repo):
        with patch('services.school_inbox_service.send_as_school') as send:
            with pytest.raises(ValueError):
                compose.compose(ORG, KATE, body='Hi', recipient_ids=[MUM, 'outsider'])
        send.assert_not_called()
        repo.create_send.assert_not_called()

    def test_empty_body_and_nobody_are_refused(self, universe, repo):
        with pytest.raises(ValueError):
            compose.compose(ORG, KATE, body='  ', recipient_ids=[MUM])
        with pytest.raises(ValueError):
            compose.compose(ORG, KATE, body='Hi', recipient_ids=[KATE])

    def test_families_and_students_hear_from_the_school_even_from_my_messages(self, universe, repo):
        """A parent's reply belongs in the School Inbox, not in one colleague's
        own messages, so as_school=False does not change who they hear from."""
        sent_by_school, sent_personally = [], []
        dm = Mock()
        dm.send_message.side_effect = lambda s, r, c, **k: (sent_personally.append(r), _dm(f'p-{r}'))[1]
        with patch('services.school_inbox_service.send_as_school',
                   side_effect=lambda org, r, c, **k: (sent_by_school.append((r, k)), _dm(f's-{r}'))[1]), \
             patch('services.direct_message_service.DirectMessageService', return_value=dm):
            result = compose.compose(ORG, KATE, body='Hi', recipient_ids=[MUM, ADA, TEACH],
                                     mode='separate', as_school=False)

        assert [r for r, _ in sent_by_school] == [MUM, ADA, TEACH]
        assert sent_personally == []
        assert all(k['sent_by'] == KATE and k['fallback_sender'] == KATE for _, k in sent_by_school)
        assert result['as_school'] is True and result['sent'] == 3

    def test_staff_only_from_my_messages_is_personal(self, universe, repo):
        dm = Mock()
        dm.send_message.return_value = _dm()
        with patch('services.school_inbox_service.send_as_school') as school, \
             patch('services.direct_message_service.DirectMessageService', return_value=dm):
            compose.compose(ORG, KATE, body='Hi', recipient_ids=[TEACH, AIDE], mode='separate')
        school.assert_not_called()
        assert [c.args[1] for c in dm.send_message.call_args_list] == [TEACH, AIDE]

    def test_push_off_reaches_every_send(self, universe, repo):
        with patch('services.school_inbox_service.send_as_school', return_value=_dm()) as send:
            compose.compose(ORG, KATE, body='Hi', recipient_ids=[MUM, ADA], push=False)
        assert all(c.kwargs.get('push') is False for c in send.call_args_list)

    def test_push_on_is_the_default_and_is_not_passed(self, universe, repo):
        with patch('services.school_inbox_service.send_as_school', return_value=_dm()) as send:
            compose.compose(ORG, KATE, body='Hi', recipient_ids=[MUM])
        assert 'push' not in send.call_args.kwargs

    def test_email_goes_only_to_the_people_reached(self, universe, repo):
        def send(org, rid, content, **k):
            if rid == ADA:
                raise ValueError('no')
            return _dm()
        with patch('services.school_inbox_service.send_as_school', side_effect=send), \
             patch('services.announcement_email_service.send_announcement_emails',
                   return_value=(1, 0)) as mail:
            result = compose.compose(ORG, KATE, body='Hi', subject='Trip',
                                     recipient_ids=[MUM, ADA], email=True)
        assert mail.call_args.args[3] == [MUM]
        assert mail.call_args.kwargs['link_path'] == '/messages'
        assert result['emailed'] == 1 and result['skipped'] == [ADA]

    def test_no_email_unless_asked(self, universe, repo):
        with patch('services.school_inbox_service.send_as_school', return_value=_dm()), \
             patch('services.announcement_email_service.send_announcement_emails') as mail:
            compose.compose(ORG, KATE, body='Hi', recipient_ids=[MUM])
        mail.assert_not_called()

    def test_the_send_is_recorded_with_every_recipient(self, universe, repo):
        def send(org, rid, content, **k):
            if rid == ADA:
                raise ValueError('no')
            return _dm(f'msg-{rid}', f'conv-{rid}')
        with patch('services.school_inbox_service.send_as_school', side_effect=send):
            result = compose.compose(ORG, KATE, body='Hi', recipient_ids=[MUM, ADA],
                                     push=False)
        fields = repo.create_send.call_args.args[0]
        assert fields['organization_id'] == ORG and fields['sent_by'] == KATE
        assert fields['mode'] == 'separate' and fields['push'] is False
        rows = {r['user_id']: r for r in repo.add_recipients.call_args.args[0]}
        assert rows[MUM] == {'send_id': 'send-1', 'user_id': MUM, 'kind': 'family',
                             'status': 'sent', 'conversation_id': f'conv-{MUM}',
                             'message_id': f'msg-{MUM}'}
        assert rows[ADA]['status'] == 'skipped' and rows[ADA]['kind'] == 'student'
        assert result['send_id'] == 'send-1'

    def test_a_failed_record_does_not_fail_the_send(self, universe, repo):
        repo.create_send.side_effect = RuntimeError('db down')
        with patch('services.school_inbox_service.send_as_school', return_value=_dm()):
            result = compose.compose(ORG, KATE, body='Hi', recipient_ids=[MUM])
        assert result['sent'] == 1 and result['send_id'] is None

    def test_a_group_with_a_family_is_a_school_group_for_families(self, universe, repo):
        svc = Mock()
        svc.create_school_group.return_value = {'id': 'g1'}
        svc.send_message.return_value = {'id': 'gm1'}
        with patch('services.group_message_service.GroupMessageService', return_value=svc), \
             patch('services.school_inbox_service.school_account', return_value=({}, 'inbox')), \
             patch.object(compose, '_default_name', return_value='Mia and Tam'):
            result = compose.compose(ORG, KATE, body='Hi', recipient_ids=[MUM, TEACH],
                                     mode='group', push=False)
        args = svc.create_school_group.call_args
        assert args.args[:3] == (ORG, 'inbox', KATE)
        assert args.kwargs['audience'] == 'family'
        assert svc.send_message.call_args.kwargs['on_behalf_of'] == 'inbox'
        assert svc.send_message.call_args.kwargs['push'] is False
        fields = repo.create_send.call_args.args[0]
        assert fields['group_id'] == 'g1' and fields['group_message_id'] == 'gm1'
        assert result['mode'] == 'group'

    def test_a_group_with_a_student_is_a_student_room(self):
        assert compose._group_audience(['staff', 'family', 'student']) == 'student'
        assert compose._group_audience(['staff']) == 'staff'

    def test_a_group_of_one_is_a_direct_message(self, universe, repo):
        with patch('services.school_inbox_service.send_as_school', return_value=_dm()) as send:
            result = compose.compose(ORG, KATE, body='Hi', recipient_ids=[MUM], mode='group')
        assert result['mode'] == 'separate'
        send.assert_called_once()


@pytest.mark.unit
def test_send_detail_lists_unread_first():
    repo = Mock()
    repo.get_send.return_value = {'id': 's1', 'mode': 'separate'}
    repo.recipient_status.return_value = [
        {'user_id': 'a', 'status': 'sent', 'read_at': '2026-09-24T10:00:00+00:00', 'kind': 'family'},
        {'user_id': 'b', 'status': 'sent', 'read_at': None, 'kind': 'family'},
        {'user_id': 'c', 'status': 'skipped', 'read_at': None, 'kind': 'family'},
    ]
    names = Mock()
    names.user_names.return_value = {}
    with patch.object(compose, '_repo', return_value=repo), \
         patch('repositories.school_thread_repository.SchoolThreadRepository', return_value=names), \
         patch('utils.admin_client.admin_client'):
        detail = compose.send_detail(ORG, 's1')
    assert [r['user_id'] for r in detail['recipients']] == ['b', 'a', 'c']
    assert detail['recipient_count'] == 2 and detail['read_count'] == 1

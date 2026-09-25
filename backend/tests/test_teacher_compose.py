"""A teacher's Compose in the SIS console (message_compose_service, as_teacher).

The iCreate teacher training, 2026-09-25: the console gave a teacher no way to
start a message. Theirs is the office's Compose, narrowed:

  - the audience is every staff member plus the students and families of the
    teacher's own classes -- nobody else's families;
  - a send naming anyone outside that is refused before anything goes out;
  - it always comes from the teacher, never the school, so replies reach them;
  - no email copy and no Sent record (the Sent view is the office's).
"""

from unittest.mock import Mock, patch

import pytest

from services import message_compose_service as compose

ORG = 'org-1'
TEACH = 'teach'
OTHER = 'other'        # another teacher, with their own class
KATE = 'kate'          # the office
ADA, ZED = 'ada', 'zed'
MUM, DAD = 'mum', 'dad'  # Ada's parent, Zed's parent

STAFF = [
    {'id': KATE, 'name': 'Kate A', 'roles': ['org_admin'], 'role_labels': ['Admin']},
    {'id': TEACH, 'name': 'Tam T', 'roles': ['advisor'], 'role_labels': ['Teacher']},
    {'id': OTHER, 'name': 'Oli O', 'roles': ['advisor'], 'role_labels': ['Teacher']},
]
STUDENTS = [
    {'student_id': ADA, 'name': 'Ada L', 'age': 7, 'is_student': True},
    {'student_id': ZED, 'name': 'Zed Q', 'age': 9, 'is_student': True},
]
GUARDIANS = {ADA: {MUM}, ZED: {DAD}}
CLASSES = [
    {'id': 'c1', 'name': 'Art', 'primary_instructor_id': TEACH, 'assistant_instructor_ids': []},
    {'id': 'c2', 'name': 'Chess', 'primary_instructor_id': OTHER, 'assistant_instructor_ids': []},
]
ENROLLED = {'c1': [ADA], 'c2': [ZED]}


def _repo():
    repo = Mock()
    repo.active_classes.return_value = CLASSES
    repo.active_advisors_by_class.return_value = {}
    repo.active_enrollments.side_effect = lambda ids: {c: ENROLLED[c] for c in ids if c in ENROLLED}
    repo.class_meeting_days.return_value = {}
    repo.create_send.return_value = {'id': 'send-1'}
    return repo


@pytest.fixture
def school():
    repo = _repo()
    with patch.object(compose, '_repo', return_value=repo), \
         patch.object(compose, '_staff', return_value=STAFF), \
         patch.object(compose, '_students', return_value=STUDENTS), \
         patch.object(compose, '_guardian_rows', return_value={
             MUM: {'id': MUM, 'first_name': 'Mia'}, DAD: {'id': DAD, 'first_name': 'Dan'}}), \
         patch.object(compose, '_family_ids',
                      side_effect=lambda students: {g for s in students for g in GUARDIANS[s['student_id']]}), \
         patch('utils.class_membership.guardians_by_student',
               side_effect=lambda ids: {s: GUARDIANS[s] for s in ids}), \
         patch('services.school_inbox_service.admin_recipient_ids', return_value=[KATE]), \
         patch('services.sis_service.advisor_class_ids',
               side_effect=lambda uid, org: ['c1'] if uid == TEACH else ['c2']):
        yield repo


@pytest.mark.unit
def test_a_teacher_sees_every_colleague_and_only_their_own_families(school):
    result = compose.audience(ORG, teacher_id=TEACH)
    ids = {p['id'] for p in result['people']}
    assert {KATE, TEACH, OTHER} <= ids
    assert ADA in ids and MUM in ids
    assert ZED not in ids and DAD not in ids
    assert [c['id'] for c in result['classes']] == ['c1']
    assert {p['key'] for p in result['presets']} <= set(compose.TEACHER_PRESETS)


@pytest.mark.unit
def test_the_office_still_sees_the_whole_school(school):
    ids = {p['id'] for p in compose.audience(ORG)['people']}
    assert {ADA, ZED, MUM, DAD} <= ids


@pytest.mark.unit
def test_another_teachers_family_is_refused_before_anything_is_sent(school):
    with patch('services.direct_message_service.DirectMessageService') as dm, \
         patch('services.school_inbox_service.send_as_school') as as_school:
        with pytest.raises(ValueError, match='your own classes'):
            compose.compose(ORG, TEACH, body='Hi', recipient_ids=[MUM, DAD], as_teacher=True)
    dm.return_value.send_message.assert_not_called()
    as_school.assert_not_called()


@pytest.mark.unit
def test_a_teacher_writes_to_families_as_themselves_without_email_or_record(school):
    dm = Mock()
    dm.send_message.return_value = {'id': 'm', 'conversation_id': 'c'}
    with patch('services.direct_message_service.DirectMessageService', return_value=dm), \
         patch('services.school_inbox_service.send_as_school') as as_school, \
         patch('services.announcement_email_service.send_announcement_emails') as email:
        result = compose.compose(ORG, TEACH, body='Hi', recipient_ids=[MUM, ADA, KATE],
                                 as_school=True, email=True, as_teacher=True)
    as_school.assert_not_called()
    email.assert_not_called()
    assert [c.args[:2] for c in dm.send_message.call_args_list] == [(TEACH, MUM), (TEACH, ADA), (TEACH, KATE)]
    assert result['as_school'] is False and result['sent'] == 3 and result['emailed'] == 0
    assert result['send_id'] is None
    school.create_send.assert_not_called()


@pytest.mark.unit
def test_a_teachers_group_is_their_own(school):
    svc = Mock()
    svc.create_group.return_value = {'id': 'g1'}
    svc.send_message.return_value = {'id': 'gm1'}
    with patch('services.group_message_service.GroupMessageService', return_value=svc):
        compose.compose(ORG, TEACH, body='Hi', recipient_ids=[MUM, ADA], mode='group',
                        as_school=True, as_teacher=True)
    svc.create_school_group.assert_not_called()
    assert svc.create_group.call_args.args[0] == TEACH

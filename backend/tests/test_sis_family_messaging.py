"""Messaging the families of a set of students from the SIS console.

Molly (iCreate, b4a4d250 and b32b2fca): "I'm needing to message all the
elementary school parents, but I have no way to do that." The staff composer
could reach a group of teachers; families were one household at a time.

What these pin: the audience is students (everyone, a class, an age range)
and the recipients are their guardians, never the students; each guardian
gets a private thread FROM THE SCHOOL so replies land in the School Inbox;
a guardian of nobody current is refused, not dropped; and the email copy is
opt-in and goes to the people who were actually sent to.
"""

from unittest.mock import patch

import pytest

from services import sis_family_messaging_service as families

ORG = 'org-1'
STAFF = 'kate'
CLASS_ART = 'class-art'
CLASS_ROBOTICS = 'class-robotics'

# Students: Ada (7, Art), Ben (12, Robotics), Cy (no birth date, Art),
# Dee (15, withdrawn, Art).
ROSTER = [
    {'student_id': 'ada', 'name': 'Ada Lark', 'is_student': True, 'age': 7,
     'enrollment_status': 'enrolled'},
    {'student_id': 'ben', 'name': 'Ben Lark', 'is_student': True, 'age': 12,
     'enrollment_status': 'enrolled'},
    {'student_id': 'cy', 'name': 'Cy Moss', 'is_student': True, 'age': None,
     'enrollment_status': 'enrolled'},
    {'student_id': 'dee', 'name': 'Dee Gone', 'is_student': True, 'age': 15,
     'enrollment_status': 'withdrawn'},
    {'student_id': 'kate', 'name': 'Kate A', 'is_student': False, 'age': None,
     'enrollment_status': None},
]
CLASSES = [{'id': CLASS_ART, 'name': 'Art'}, {'id': CLASS_ROBOTICS, 'name': 'Robotics'}]
IN_CLASS = {CLASS_ART: {'ada', 'cy', 'dee'}, CLASS_ROBOTICS: {'ben'}}
# The Larks share two guardians; Cy has one; Dee's parent is only Dee's.
GUARDIANS = {
    'ada': {'lark-mum', 'lark-dad'},
    'ben': {'lark-mum', 'lark-dad'},
    'cy': {'moss-mum'},
    'dee': {'gone-dad'},
}
PEOPLE = {
    'lark-mum': {'id': 'lark-mum', 'first_name': 'Mia', 'last_name': 'Lark'},
    'lark-dad': {'id': 'lark-dad', 'first_name': 'Tom', 'last_name': 'Lark'},
    'moss-mum': {'id': 'moss-mum', 'first_name': 'Una', 'last_name': 'Moss'},
    'gone-dad': {'id': 'gone-dad', 'first_name': 'Vic', 'last_name': 'Gone'},
}


def _guardians_by_student(ids):
    return {s: set(GUARDIANS.get(s, ())) for s in ids if s in GUARDIANS}


def _parents_of(ids):
    out = set()
    for s in ids:
        out |= GUARDIANS.get(s, set())
    return out


@pytest.fixture
def school():
    with patch('services.sis_service.get_roster', return_value=ROSTER), \
            patch.object(families, '_classes', return_value=CLASSES), \
            patch.object(families, '_guardian_rows',
                         side_effect=lambda ids: {i: PEOPLE[i] for i in ids if i in PEOPLE}), \
            patch('utils.class_membership.class_student_ids',
                  side_effect=lambda cid: set(IN_CLASS.get(cid, ()))), \
            patch('utils.class_membership.guardians_by_student', side_effect=_guardians_by_student), \
            patch('utils.class_membership.parents_of_students', side_effect=_parents_of):
        yield


@pytest.fixture
def school_sender():
    calls = []

    def _send(org, recipient_id, content, *, sent_by, attachments=None, fallback_sender=None, **_):
        calls.append({'org': org, 'to': recipient_id, 'content': content,
                      'sent_by': sent_by, 'attachments': attachments,
                      'fallback_sender': fallback_sender})
        if recipient_id == 'moss-mum':
            raise RuntimeError('no such account')
        return {'conversation_id': f'conv-{recipient_id}'}

    with patch('services.school_inbox_service.send_as_school', side_effect=_send):
        yield calls


@pytest.fixture
def emailer():
    with patch('services.announcement_email_service.send_announcement_emails',
               return_value=(2, 0)) as m:
        yield m


@pytest.mark.unit
class TestTheAudience:
    def test_everyone_is_the_guardians_of_every_current_student(self, school):
        out = families.family_audience(ORG)
        assert [p['id'] for p in out['people']] == ['lark-mum', 'lark-dad', 'moss-mum']
        # A withdrawn student's parent is not "everyone"; the staff member is
        # not a student; a family with two children is two guardians once.
        assert out['students'] == 3
        assert 'gone-dad' not in {p['id'] for p in out['people']}

    def test_each_guardian_says_which_children_put_them_here(self, school):
        out = families.family_audience(ORG)
        by_id = {p['id']: p for p in out['people']}
        assert by_id['lark-mum']['students'] == ['Ada Lark', 'Ben Lark']
        assert by_id['lark-mum']['name'] == 'Mia Lark'
        assert by_id['moss-mum']['students'] == ['Cy Moss']

    def test_a_class_is_its_students_guardians(self, school):
        out = families.family_audience(ORG, class_id=CLASS_ROBOTICS)
        assert [p['id'] for p in out['people']] == ['lark-mum', 'lark-dad']
        assert out['students'] == 1

    def test_another_schools_class_is_refused(self, school):
        with pytest.raises(ValueError):
            families.family_audience(ORG, class_id='class-elsewhere')

    def test_an_age_range_uses_the_sis_age_and_counts_who_it_had_to_skip(self, school):
        out = families.family_audience(ORG, age_min=5, age_max=10)
        assert out['students'] == 1
        assert [p['id'] for p in out['people']] == ['lark-mum', 'lark-dad']
        # Cy has no birth date on file, so the office is told rather than
        # left to assume the count was everyone.
        assert out['without_birthdate'] == 1

    def test_an_open_ended_range_works_either_way(self, school):
        assert families.family_audience(ORG, age_min=10)['students'] == 1
        assert families.family_audience(ORG, age_max=10)['students'] == 1

    def test_class_and_age_combine(self, school):
        out = families.family_audience(ORG, class_id=CLASS_ART, age_min=5, age_max=10)
        assert out['students'] == 1 and out['without_birthdate'] == 1

    def test_the_class_list_rides_along_for_the_picker(self, school):
        assert [c['name'] for c in families.family_audience(ORG)['classes']] == ['Art', 'Robotics']

    def test_students_are_never_in_the_people_list(self, school):
        ids = {p['id'] for p in families.family_audience(ORG)['people']}
        assert not ids & {'ada', 'ben', 'cy', 'dee'}


@pytest.mark.unit
class TestSending:
    def test_each_guardian_gets_a_private_message_from_the_school(self, school, school_sender):
        out = families.compose(ORG, STAFF, body='Pickup moves to 3pm',
                               recipient_ids=['lark-mum', 'lark-dad'])
        assert [c['to'] for c in school_sender] == ['lark-mum', 'lark-dad']
        assert all(c['sent_by'] == STAFF and c['org'] == ORG for c in school_sender)
        assert out['sent'] == 2 and out['skipped'] == [] and out['mode'] == 'families'

    def test_the_subject_leads_the_body(self, school, school_sender):
        families.compose(ORG, STAFF, body='Bring boots.', subject='Field day',
                         recipient_ids=['lark-mum'])
        assert school_sender[0]['content'] == 'Field day\n\nBring boots.'

    def test_one_unreachable_family_does_not_stop_the_others(self, school, school_sender):
        out = families.compose(ORG, STAFF, body='x',
                               recipient_ids=['lark-mum', 'moss-mum', 'lark-dad'])
        assert out['sent'] == 2 and out['skipped'] == ['moss-mum']

    def test_a_guardian_of_no_current_student_is_refused_not_dropped(self, school, school_sender):
        with pytest.raises(ValueError):
            families.compose(ORG, STAFF, body='x', recipient_ids=['lark-mum', 'gone-dad'])
        assert school_sender == []

    def test_a_duplicate_id_is_sent_once(self, school, school_sender):
        families.compose(ORG, STAFF, body='x', recipient_ids=['lark-mum', 'lark-mum'])
        assert len(school_sender) == 1

    def test_the_sender_is_never_a_recipient(self, school, school_sender):
        with pytest.raises(ValueError):
            families.compose(ORG, STAFF, body='x', recipient_ids=[STAFF])

    def test_an_empty_body_is_refused(self, school, school_sender):
        with pytest.raises(ValueError):
            families.compose(ORG, STAFF, body='  ', recipient_ids=['lark-mum'])

    def test_an_attachment_alone_is_enough(self, school, school_sender):
        families.compose(ORG, STAFF, body='', recipient_ids=['lark-mum'],
                         attachments=[{'url': 'x'}])
        assert school_sender[0]['attachments'] == [{'url': 'x'}]

    def test_an_overlong_body_is_refused(self, school, school_sender):
        with pytest.raises(ValueError):
            families.compose(ORG, STAFF, body='x' * (families.MAX_BODY + 1),
                             recipient_ids=['lark-mum'])


@pytest.mark.unit
class TestTheEmailCopy:
    def test_off_by_default(self, school, school_sender, emailer):
        out = families.compose(ORG, STAFF, body='x', recipient_ids=['lark-mum'])
        emailer.assert_not_called()
        assert out['emailed'] == 0

    def test_on_it_emails_the_people_who_were_sent_to_and_points_at_messages(
            self, school, school_sender, emailer):
        out = families.compose(ORG, STAFF, body='Bring boots.', subject='Field day',
                               recipient_ids=['lark-mum', 'moss-mum', 'lark-dad'], email=True)
        emailer.assert_called_once()
        args, kwargs = emailer.call_args
        assert args[0] == ORG and args[1] == 'Field day' and args[2] == 'Bring boots.'
        # Una could not be messaged, so she is not emailed a copy of nothing.
        assert args[3] == ['lark-mum', 'lark-dad']
        assert kwargs['link_path'] == '/messages'
        assert out['emailed'] == 2

    def test_no_subject_titles_the_email_after_the_school(self, school, school_sender, emailer):
        with patch('services.school_inbox_service.get_org', return_value={'name': 'iCreate'}):
            families.compose(ORG, STAFF, body='x', recipient_ids=['lark-mum'], email=True)
        assert emailer.call_args[0][1] == 'A message from iCreate'

    def test_an_email_failure_never_fails_the_send(self, school, school_sender):
        with patch('services.announcement_email_service.send_announcement_emails',
                   side_effect=RuntimeError('smtp down')), \
                patch('services.school_inbox_service.get_org', return_value={'name': 'iCreate'}):
            out = families.compose(ORG, STAFF, body='x', recipient_ids=['lark-mum'], email=True)
        assert out['sent'] == 1 and out['emailed'] == 0

    def test_an_unreadable_school_name_never_fails_the_send(self, school, school_sender, emailer):
        with patch('services.school_inbox_service.get_org', side_effect=RuntimeError('db')):
            out = families.compose(ORG, STAFF, body='x', recipient_ids=['lark-mum'], email=True)
        assert out['sent'] == 1 and out['emailed'] == 0


@pytest.mark.unit
class TestTheRoutes:
    """The two routes over the service: the filter arrives as query args and
    the sender's mistakes come back as 400s."""

    def _run(self, view, query=None, body=None):
        from flask import Flask
        app = Flask(__name__)
        method = 'POST' if body is not None else 'GET'
        with app.test_request_context('/x', method=method, query_string=query or {}, json=body), \
                patch('services.sis_service.org_or_error', return_value=(ORG, None)):
            fn = view
            while hasattr(fn, '__wrapped__'):
                fn = fn.__wrapped__
            resp = fn(STAFF)
        if isinstance(resp, tuple):
            return resp[0].get_json(), resp[1]
        return resp.get_json(), 200

    def test_the_audience_route_passes_the_filter_through(self, school):
        import routes.sis.messaging as routes
        body, status = self._run(routes.family_audience,
                                 query={'class_id': CLASS_ART, 'age_min': '5', 'age_max': '10'})
        assert status == 200 and body['students'] == 1
        assert body['classes'][0]['name'] == 'Art'

    def test_a_non_number_age_is_a_400(self, school):
        import routes.sis.messaging as routes
        body, status = self._run(routes.family_audience, query={'age_min': 'ten'})
        assert status == 400 and 'whole number' in body['error']

    def test_the_compose_route_turns_a_refusal_into_a_400(self, school, school_sender):
        import routes.sis.messaging as routes
        body, status = self._run(routes.compose_families,
                                 body={'recipient_ids': ['gone-dad'], 'body': 'x'})
        assert status == 400 and 'parent of a current student' in body['error']

    def test_the_compose_route_sends_and_reports(self, school, school_sender):
        import routes.sis.messaging as routes
        body, status = self._run(routes.compose_families,
                                 body={'recipient_ids': ['lark-mum'], 'body': 'x', 'email': False})
        assert status == 200 and body['sent'] == 1


# Staff of this org, as the staff composer lists them. 'kate' is the sender;
# 'lark-mum' is a parent here who also teaches.
ORG_STAFF = [{'id': 'kate'}, {'id': 'tess'}, {'id': 'otto'}, {'id': 'lark-mum'}]


@pytest.fixture
def staff_dm():
    calls = []

    def _send(sender, recipient, content, attachments=None, **_):
        calls.append({'from': sender, 'to': recipient, 'content': content,
                      'attachments': attachments})
        if recipient == 'otto':
            raise RuntimeError('no such account')
        return {'conversation_id': f'dm-{recipient}'}

    with patch('services.sis_messaging_service.staff_recipients', return_value=ORG_STAFF), \
            patch('services.direct_message_service.DirectMessageService.__init__',
                  return_value=None), \
            patch('services.direct_message_service.DirectMessageService.send_message',
                  autospec=True,
                  side_effect=lambda self, *a, **k: _send(*a, **k)):
        yield calls


@pytest.mark.unit
class TestCopyingStaff:
    """Molly (iCreate, 2026-09-22, ticket 77efe09b): "it would be nice if i
    could add extra people who are NOT in the class. Like I just sent a
    message to the CLD parents. But I couldn't add the teacher on to that
    message too."

    A teacher is copied with their own DM from the sender, labelled as a copy;
    the families still get one private thread each from the school."""

    def test_a_staff_member_gets_their_own_labelled_copy_from_the_sender(
            self, school, school_sender, staff_dm):
        out = families.compose(ORG, STAFF, body='Pickup moves to 3pm', subject='Pickup',
                               recipient_ids=['lark-mum', 'lark-dad'],
                               staff_ids=['tess'], audience_label='Art')
        # Families: unchanged, one private thread each from the school.
        assert [c['to'] for c in school_sender] == ['lark-mum', 'lark-dad']
        assert all('[Copy]' not in c['content'] for c in school_sender)
        # Tess: one DM, from Kate herself, not from the school account.
        assert [(c['from'], c['to']) for c in staff_dm] == [(STAFF, 'tess')]
        content = staff_dm[0]['content']
        assert content.startswith('[Copy] This message went to 2 parents (Art)')
        assert 'Their replies go to the School Inbox' in content
        assert content.endswith('Pickup\n\nPickup moves to 3pm')
        assert out['staff_sent'] == 1 and out['staff_skipped'] == []
        assert out['staff_copies'] == [{'recipient_id': 'tess', 'conversation_id': 'dm-tess'}]

    def test_no_staff_named_means_no_copies_and_the_old_shape(
            self, school, school_sender, staff_dm):
        out = families.compose(ORG, STAFF, body='x', recipient_ids=['lark-mum'])
        assert staff_dm == []
        assert out['staff_sent'] == 0 and out['staff_copies'] == [] and out['sent'] == 1

    def test_someone_who_is_not_staff_here_is_refused_and_nothing_sends(
            self, school, school_sender, staff_dm):
        # Another school's teacher, or anyone not on this org's staff list.
        with pytest.raises(ValueError, match='staff at this school'):
            families.compose(ORG, STAFF, body='x', recipient_ids=['lark-mum'],
                             staff_ids=['tess', 'other-org-teacher'])
        assert school_sender == [] and staff_dm == []

    def test_a_parent_cannot_be_slipped_in_as_a_copy(self, school, school_sender, staff_dm):
        # A guardian who is not staff goes in the family list or nowhere.
        with pytest.raises(ValueError):
            families.compose(ORG, STAFF, body='x', recipient_ids=['lark-mum'],
                             staff_ids=['moss-mum'])
        assert school_sender == [] and staff_dm == []

    def test_a_staff_copy_does_not_open_the_family_list_to_strangers(
            self, school, school_sender, staff_dm):
        # The family rule still stands: a staff member in recipient_ids is refused.
        with pytest.raises(ValueError, match='parent of a current student'):
            families.compose(ORG, STAFF, body='x', recipient_ids=['tess'])
        assert school_sender == [] and staff_dm == []

    def test_the_sender_and_a_teacher_who_is_also_a_parent_get_no_second_copy(
            self, school, school_sender, staff_dm):
        families.compose(ORG, STAFF, body='x', recipient_ids=['lark-mum'],
                         staff_ids=[STAFF, 'lark-mum', 'tess', 'tess'])
        assert [c['to'] for c in staff_dm] == ['tess']

    def test_one_unreachable_staff_member_does_not_stop_the_rest(
            self, school, school_sender, staff_dm):
        out = families.compose(ORG, STAFF, body='x', recipient_ids=['lark-mum'],
                               staff_ids=['otto', 'tess'])
        assert out['staff_sent'] == 1 and out['staff_skipped'] == ['otto']

    def test_no_copy_of_a_message_no_family_received(self, school, school_sender, staff_dm):
        out = families.compose(ORG, STAFF, body='x', recipient_ids=['moss-mum'],
                               staff_ids=['tess'])
        assert out['sent'] == 0 and staff_dm == []

    def test_the_email_copy_never_goes_to_staff(self, school, school_sender, staff_dm, emailer):
        families.compose(ORG, STAFF, body='x', subject='Field day', recipient_ids=['lark-mum'],
                         staff_ids=['tess'], email=True)
        assert emailer.call_args[0][3] == ['lark-mum']

    def test_the_note_counts_one_parent_and_works_without_a_label(self):
        assert families.copy_note(1).startswith('[Copy] This message went to 1 parent,')
        assert families.copy_note(3, '  ').startswith('[Copy] This message went to 3 parents,')
        assert families.copy_note(3, 42).startswith('[Copy] This message went to 3 parents,')
        long = families.copy_note(2, 'x' * 500)
        assert 'x' * families.MAX_AUDIENCE_LABEL + ')' in long


@pytest.mark.unit
class TestTheRouteCopiesStaff:
    def test_the_route_passes_staff_and_label_and_refuses_strangers(
            self, school, school_sender, staff_dm):
        import routes.sis.messaging as routes
        run = TestTheRoutes()._run
        body, status = run(routes.compose_families, body={
            'recipient_ids': ['lark-mum'], 'body': 'x',
            'staff_ids': ['tess'], 'audience_label': 'CLD'})
        assert status == 200 and body['staff_sent'] == 1
        assert '(CLD)' in staff_dm[0]['content']

        body, status = run(routes.compose_families, body={
            'recipient_ids': ['lark-mum'], 'body': 'x', 'staff_ids': ['stranger']})
        assert status == 400 and 'staff at this school' in body['error']

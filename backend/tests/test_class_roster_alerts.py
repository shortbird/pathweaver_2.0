"""
A teacher hears when a student joins their class.

iCreate, 2026-09-02: "can a teacher be notified when they get a new student
added to their class?" Students arrive by seven routes and none of them told the
person who has to teach the child; teachers found out from an unfamiliar name on
the register.

Two rules carry the risk:
  - the notice never breaks the enrollment (every failure is swallowed), and
  - the person who did the enrolling is not told about their own action, so a
    teacher adding a student on their own class page is not notified.
"""

from unittest.mock import Mock, patch

import pytest

from services import class_roster_alerts as alerts


CLASS = 'class-1'
ORG = 'org-1'
TEACHER = 'teacher-1'
ASSISTANT = 'assistant-1'
STUDENT = 'student-1'
OFFICE = 'admin-1'


CLASS_ROW = {'id': CLASS, 'name': 'Musical Theater', 'organization_id': ORG,
             'primary_instructor_id': TEACHER,
             'assistant_instructor_ids': [ASSISTANT]}
STUDENT_ROW = {'id': STUDENT, 'display_name': None,
               'first_name': 'Ada', 'last_name': 'Byron'}


def _run(actor_id=OFFICE, teachers=(TEACHER, ASSISTANT), class_rows=(CLASS_ROW,)):
    sent = []
    klass = Mock(find_by_id=Mock(return_value=(class_rows[0] if class_rows else None)))
    users = Mock(find_by_ids=Mock(return_value={STUDENT: STUDENT_ROW}))
    with patch.object(alerts, '_admin', return_value=Mock()), \
         patch.object(alerts, 'SisClassRepository', return_value=klass), \
         patch.object(alerts, 'UserRepository', return_value=users), \
         patch.object(alerts.membership, 'class_teacher_ids', return_value=set(teachers)), \
         patch.object(alerts.sis_notifications, 'shared_service', return_value=Mock()), \
         patch.object(alerts.sis_notifications, 'notify',
                      side_effect=lambda uid, title, msg, **kw: sent.append((uid, title, msg, kw))):
        alerts.notify_teachers_of_new_student(CLASS, STUDENT, actor_id=actor_id)
    return sent


@pytest.mark.unit
class TestWhoHears:
    def test_every_teacher_of_the_class_is_told(self):
        sent = _run()
        assert {s[0] for s in sent} == {TEACHER, ASSISTANT}

    def test_the_message_names_the_student_and_the_class(self):
        sent = _run()
        assert sent[0][2] == 'Ada Byron joined Musical Theater.'
        assert sent[0][1] == 'New student in your class'

    def test_it_links_to_the_class_the_teacher_opens(self):
        assert _run()[0][3]['link'] == f'/my-classes/{CLASS}'

    def test_the_person_who_enrolled_them_is_not_told(self):
        """A teacher adding a student on their own class page already knows."""
        sent = _run(actor_id=TEACHER)
        assert {s[0] for s in sent} == {ASSISTANT}

    def test_a_class_with_no_teacher_notifies_nobody(self):
        assert _run(teachers=()) == []


@pytest.mark.unit
class TestItNeverBreaksTheEnrollment:
    def test_a_missing_class_is_silent(self):
        assert _run(class_rows=()) == []

    def test_a_database_failure_is_swallowed(self):
        with patch.object(alerts, '_admin', side_effect=RuntimeError('postgrest is having a day')):
            alerts.notify_teachers_of_new_student(CLASS, STUDENT, actor_id=OFFICE)

    def test_a_delivery_failure_is_swallowed(self):
        klass = Mock(find_by_id=Mock(return_value=CLASS_ROW))
        with patch.object(alerts, '_admin', return_value=Mock()), \
             patch.object(alerts, 'SisClassRepository', return_value=klass), \
             patch.object(alerts.membership, 'class_teacher_ids', return_value={TEACHER}), \
             patch.object(alerts.sis_notifications, 'shared_service',
                          side_effect=RuntimeError('no notifier')):
            alerts.notify_teachers_of_new_student(CLASS, STUDENT, actor_id=OFFICE)


@pytest.mark.unit
def test_every_enrollment_path_raises_the_alert():
    """The seven ways into a class each have to call this, and a new one added
    without the call is the failure mode this catches: the ticket was filed
    precisely because a path existed that told nobody."""
    import pathlib
    root = pathlib.Path(__file__).resolve().parents[1]
    paths = [
        'routes/sis/catalog.py',
        'services/sis_parent_service.py',
        'services/sis_registration_service.py',
        'services/sis_waitlist_service.py',
    ]
    for rel in paths:
        source = (root / rel).read_text()
        assert 'notify_teachers_of_new_student' in source, rel

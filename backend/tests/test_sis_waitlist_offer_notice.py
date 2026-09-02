"""
What a waitlist offer actually tells the family.

iCreate, 2026-09-02: "A parent got an email offering the spot for miniatures.
But it doesn't tell the day or time of the class (that would be helpful)" — and,
separately, the link dropped her on the first child's week, where there is no
offer and so no Claim button. The email now names the meeting time and deep
links to the child the seat is for.
"""

from unittest.mock import Mock, patch

from services import sis_waitlist_service as svc


def _table(data=None):
    t = Mock()
    for m in ('select', 'eq', 'in_', 'limit', 'order', 'insert', 'update'):
        getattr(t, m).return_value = t
    t.execute.return_value = Mock(data=data)
    return t


def _client(tables):
    client = Mock()
    client.table.side_effect = lambda name: tables[name]
    return client


GUARDIAN = {'id': 'g1', 'first_name': 'Ada', 'email': 'ada@example.com'}
STUDENT = {'id': 'stu-1', 'first_name': 'Nora', 'last_name': 'Candland',
           'display_name': None, 'username': None, 'email': None, 'preferred_name': None}


class TestMeetingText:
    def _run(self, meetings):
        with patch.object(svc, '_admin', return_value=_client({'class_meetings': _table(meetings)})):
            return svc.meeting_text('cls-1')

    def test_names_the_day_and_time(self):
        assert self._run([{'day_of_week': 2, 'start_time': '13:00:00', 'end_time': '14:30:00'}]) \
            == 'Tuesdays, 1pm–2:30pm'

    def test_folds_two_days_into_one_line(self):
        text = self._run([
            {'day_of_week': 1, 'start_time': '09:00:00', 'end_time': '10:00:00'},
            {'day_of_week': 3, 'start_time': '09:00:00', 'end_time': '10:00:00'},
        ])
        assert text == 'Mondays and Wednesdays, 9am–10am'

    def test_empty_when_the_class_never_meets(self):
        assert self._run([]) == ''

    def test_survives_a_lookup_failure(self):
        client = Mock()
        client.table.side_effect = RuntimeError('down')
        with patch.object(svc, '_admin', return_value=client):
            assert svc.meeting_text('cls-1') == ''


class TestOfferEmail:
    def _send(self, when=''):
        tables = {
            'organizations': _table([{'name': 'iCreate'}]),
            'users': _table([STUDENT]),
        }
        with patch.object(svc, '_admin', return_value=_client(tables)), \
             patch('services.email_service.email_service.send_email') as send:
            svc._email_offer('org-1', 'Miniatures', 'stu-1', [GUARDIAN], None, when=when)
        assert send.call_count == 1
        return send.call_args[0]

    def test_names_the_meeting_time(self):
        _to, _subject, html = self._send(when='Tuesdays, 1pm–2:30pm')
        assert 'The class meets <strong>Tuesdays, 1pm–2:30pm</strong>' in html

    def test_links_to_the_child_the_seat_is_for(self):
        _to, _subject, html = self._send()
        assert '/schedule-builder?student=stu-1' in html

    def test_says_nothing_about_time_when_the_class_has_no_meetings(self):
        _to, _subject, html = self._send()
        assert 'The class meets' not in html

"""
Feedback from a school's teacher must be signed with the teacher's name.

Gryffin Learning Center, 2026-08-31: "I submitted feedback on one of the
submissions, and the student doesn't see it anywhere or get notified that I
sent any." The student WAS notified — the notification just said "Optio replied
to your work", for feedback written by Dallin, their own teacher, sitting in the
same building. Nothing in it named him, and its link led to a page that showed
no feedback at all.

The thread display already had the rule right (superadmin -> "Optio", org staff
-> their real name); the notification hardcoded "Optio". They now share
_is_optio_voice, so the two can never disagree again.
"""

import app  # noqa: F401 — import graph ordering
from routes.credit_messages import _is_optio_voice, _author_name


class TestWhoSpeaksAsOptio:
    def test_optios_own_review_is_branded_optio(self):
        """Superadmin review IS Optio talking — students never met that person."""
        assert _is_optio_voice('superadmin') is True

    def test_legacy_reviewer_rows_stay_branded(self):
        """'reviewer' is what older rows stored before roles were recorded."""
        assert _is_optio_voice('reviewer') is True

    def test_a_schools_teacher_speaks_as_themselves(self):
        assert _is_optio_voice('advisor') is False

    def test_a_school_admin_speaks_as_themselves(self):
        assert _is_optio_voice('org_admin') is False

    def test_a_campus_coordinator_speaks_as_themselves(self):
        assert _is_optio_voice('campus_coordinator') is False

    def test_an_unknown_role_is_not_given_optios_voice(self):
        """Fail toward a real name rather than silently speaking for Optio."""
        assert _is_optio_voice(None) is False
        assert _is_optio_voice('') is False


class TestSenderName:
    def test_display_name_wins(self):
        assert _author_name({'display_name': 'Dallin Bird',
                             'first_name': 'Dallin'}) == 'Dallin Bird'

    def test_falls_back_to_first_and_last(self):
        assert _author_name({'first_name': 'Dallin',
                             'last_name': 'Bird'}) == 'Dallin Bird'

    def test_never_renders_an_empty_signature(self):
        assert _author_name({}) == 'User'


class TestNotificationCopy:
    """The strings a student actually reads in their bell."""

    @staticmethod
    def _title(author_role, user):
        sender = 'Optio' if _is_optio_voice(author_role) else _author_name(user)
        return f'{sender} left feedback on your work'

    def test_a_teachers_feedback_is_signed_with_their_name(self):
        title = self._title('advisor', {'display_name': 'Dallin Bird'})
        assert title == 'Dallin Bird left feedback on your work'
        assert 'Optio' not in title

    def test_optios_own_review_still_reads_as_optio(self):
        assert self._title('superadmin', {'display_name': 'Tanner Bowman'}) == \
            'Optio left feedback on your work'

"""Unit tests: the observer feed must not emit empty auto-evidence moments.

A learning_event paired to a task's evidence document carries the placeholder
description "Evidence for: <task>". It is normally hidden from the feed by the
attached_task_id filter, but the FK is ON DELETE SET NULL — deleting the task
(quest "start fresh", course unenroll, admin/parent delete) orphans the moment,
which then renders as a card with no photo and no student-written text.

An orphan that still carries evidence (media OR a text block the student wrote)
is a real post and must survive.
"""

from routes.observer.feed import is_empty_auto_evidence_moment


def test_orphaned_evidence_placeholder_with_no_evidence_is_dropped():
    assert is_empty_auto_evidence_moment(None, 'Evidence for: Plan the trip', False) is True


def test_helper_evidence_placeholder_with_no_evidence_is_dropped():
    assert is_empty_auto_evidence_moment(
        None, 'Evidence uploaded for task: Plan the trip', False
    ) is True


def test_generic_learning_moment_title_does_not_rescue_an_empty_placeholder():
    assert is_empty_auto_evidence_moment(
        'Learning Moment', 'Evidence for: Stay Overnight', False
    ) is True


def test_placeholder_with_evidence_is_kept():
    # Media or a student-written text block both count as evidence.
    assert is_empty_auto_evidence_moment(None, 'Evidence for: Plan the trip', True) is False


def test_student_written_moment_is_kept():
    assert is_empty_auto_evidence_moment(
        None, 'I mapped out the whole route today', False
    ) is False


def test_titled_moment_is_kept():
    assert is_empty_auto_evidence_moment(
        'Trip planning notes', 'Evidence for: Plan the trip', False
    ) is False


def test_missing_description_is_kept():
    # Not an auto-evidence placeholder; the existing "media or text or
    # description" check decides whether it makes the feed.
    assert is_empty_auto_evidence_moment(None, None, False) is False

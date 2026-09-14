"""
Who may write on a student's work, and who may read the thread under it.

One policy, COMMENT_RELATIONSHIPS, in the vocabulary every id-bearing route
declares (utils.auth.relationships). It replaced a hand-rolled predicate that
was wrong three times in three weeks, once per audience:

  Gryffin, 2026-08-27: "When we try to submit feedback we get an access denied
  error." The predicate read the RAW users.role and compared it to 'advisor';
  org staff are role='org_managed', so the branch never ran.

  Same week: the advisor branch required an advisor_student_assignments row,
  which only the Organization -> People -> Relationships screen writes. A
  school that onboarded through class rosters had none.

  2026-09-14: no branch for the student on their own work, nor for a parent
  linked any way but an observer invitation. A student saw Optio ask "What are
  the ingredients?" under their own post and got "Access denied" replying. In
  the whole history of the table nobody had ever managed either.

The read gates in social.py were separate hand-written twins and drifted the
same way. These tests pin the policy and that all three gates share it; the
predicates behind each name are pinned in tests/unit/test_require_relationship_to.py.
"""

import inspect

import pytest

import app  # noqa: F401 -- import graph ordering
from routes.observer.comments import COMMENT_RELATIONSHIPS
from utils.auth.relationships import RELATIONSHIPS, STAFF, relationship_between

STUDENT_ID = 'student-1'

PREDICATES = ('parent', 'household_guardian', 'observer', 'advisor', 'teacher', 'org_staff')


@pytest.fixture(autouse=True)
def _nobody(monkeypatch):
    """Every relationship predicate says no and the staff lookup says no; each
    test grants exactly the relationship it is about. Patched on RELATIONSHIPS
    itself so no test reaches a database."""
    for name in PREDICATES:
        monkeypatch.setitem(RELATIONSHIPS, name, lambda c, t: False)
    monkeypatch.setattr('utils.auth.relationships._is_platform_staff', lambda c: False)


@pytest.fixture
def grant(monkeypatch):
    def _grant(name, when=None):
        monkeypatch.setitem(RELATIONSHIPS, name, when or (lambda c, t: True))
    return _grant


def _may_comment(author_id, student_id=STUDENT_ID):
    return relationship_between(author_id, student_id, COMMENT_RELATIONSHIPS)


# --- the policy ---------------------------------------------------------------

def test_the_policy_names_every_audience_the_feed_shows_a_post_to():
    """Change this deliberately, with the feed (routes/observer/feed.py) in the
    other hand. A relationship the feed grants and this refuses is the bug this
    file exists for."""
    assert COMMENT_RELATIONSHIPS == (
        'self', 'parent', 'household_guardian', 'observer', 'advisor', 'teacher', 'org_staff',
    )


def test_peers_are_deliberately_not_in_it():
    """Peer connections were sold to families as visibility into each other's
    work, not a channel to write on it."""
    assert 'peer' not in COMMENT_RELATIONSHIPS


def test_the_two_thread_readers_use_the_same_policy():
    """Seeing a thread and writing on it are one question. The readers used to
    be hand-written twins of the write gate and drifted independently."""
    import routes.observer.social as social
    assert social.COMMENT_RELATIONSHIPS is COMMENT_RELATIONSHIPS
    src = inspect.getsource(social)
    for reader in ('def get_learning_event_comments', 'def get_completion_comments'):
        body = src.split(reader, 1)[1][:3000]
        assert 'relationship_between(user_id, student_id, COMMENT_RELATIONSHIPS)' in body, reader
        assert "== 'advisor'" not in body, f'{reader} compares a raw role again'


# --- who gets in -------------------------------------------------------------

def test_a_student_may_reply_on_their_own_work():
    """By identity, before any predicate runs -- every predicate is patched to
    False here, so anything but 'self' would refuse."""
    assert _may_comment(STUDENT_ID, STUDENT_ID) == 'self'


def test_a_parent_may_comment_on_their_childs_work(grant):
    """Any of the three family links; no observer_student_links row needed."""
    grant('parent')
    assert _may_comment('parent-1') == 'parent'


def test_a_household_guardian_may_too(grant):
    """The SIS registration funnel links families through household_members
    and nothing else; at a microschool that is nearly every family."""
    grant('household_guardian')
    assert _may_comment('guardian-1') == 'household_guardian'


def test_an_invited_observer_may(grant):
    grant('observer')
    assert _may_comment('obs-1') == 'observer'


def test_an_assigned_advisor_may(grant):
    grant('advisor')
    assert _may_comment('advisor-1') == 'advisor'


def test_a_teacher_with_no_assignment_row_may(grant):
    """The class-roster relationship, for schools that never wrote
    advisor_student_assignments (Gryffin)."""
    grant('teacher')
    assert _may_comment('teacher-1') == 'teacher'


def test_org_staff_may_comment_on_their_own_schools_students(grant):
    grant('org_staff')
    assert _may_comment('admin-1') == 'org_staff'


def test_platform_staff_get_in_as_staff(monkeypatch):
    monkeypatch.setattr('utils.auth.relationships._is_platform_staff', lambda c: True)
    assert _may_comment('root') == STAFF


# --- who does not --------------------------------------------------------------

def test_a_student_may_not_comment_on_another_student():
    assert _may_comment('student-2') is None


def test_an_unrelated_adult_may_not():
    assert _may_comment('stranger') is None


def test_a_predicate_that_raises_does_not_let_anyone_in(grant):
    def _boom(c, t):
        raise RuntimeError('database away')
    grant('parent', _boom)
    assert _may_comment('parent-1') is None


def test_a_raising_predicate_does_not_block_the_next_one(grant):
    def _boom(c, t):
        raise RuntimeError('database away')
    grant('parent', _boom)
    grant('observer')
    assert _may_comment('obs-1') == 'observer'


def test_a_missing_author_or_student_is_refused():
    assert relationship_between(None, STUDENT_ID, COMMENT_RELATIONSHIPS) is None
    assert relationship_between('x', '', COMMENT_RELATIONSHIPS) is None

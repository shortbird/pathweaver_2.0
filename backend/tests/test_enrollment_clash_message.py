"""
What the office is told when a student cannot join a class.

iCreate, 2026-09-08 (8b0bdea5): "what does it mean when it says they're
enrolled but they're not actually on the roster?"

The refusal read "This student is already enrolled in Brain Games 5-7 at the
same time." The office is looking at Theater Jr's roster when they read it, so
"already enrolled" was taken to mean already on THIS roster; they checked, did
not find the student, and reported the count as wrong. The class named in the
middle of the sentence was doing the work and was not being read.

The sentence has to say whose roster the student is on. This test pins that,
not the exact wording -- the assertions are about the two facts a reader needs.
"""

import pytest


def _conflict_error(conflicts):
    """The 409 body catalog.py builds for a schedule clash."""
    cnames = ', '.join(c.get('class_name', 'another class') for c in conflicts)
    return (f'{cnames} meets at this time and already has this student. '
            f'They are on that roster, not this one.')


@pytest.mark.unit
class TestTheRefusalSaysWhoseRoster:
    def test_it_names_the_other_class(self):
        msg = _conflict_error([{'class_name': 'Brain Games 5-7'}])
        assert 'Brain Games 5-7' in msg

    def test_it_says_the_student_is_not_on_this_roster(self):
        # The half that was missing. Without it "already enrolled" sends the
        # reader to the roster in front of them.
        msg = _conflict_error([{'class_name': 'Brain Games 5-7'}])
        assert 'not this one' in msg

    def test_it_no_longer_opens_with_already_enrolled(self):
        # The exact phrase that was misread. If it comes back, so does the
        # ticket.
        msg = _conflict_error([{'class_name': 'Brain Games 5-7'}])
        assert 'already enrolled in' not in msg

    def test_several_clashes_are_all_named(self):
        msg = _conflict_error([{'class_name': 'Brain Games 5-7'},
                               {'class_name': 'Choir'}])
        assert 'Brain Games 5-7' in msg and 'Choir' in msg

    def test_a_nameless_clash_still_reads_as_a_sentence(self):
        msg = _conflict_error([{}])
        assert msg.startswith('another class meets at this time')


@pytest.mark.unit
def test_the_route_builds_exactly_this_sentence():
    """Pin the message to the route, so the copy above is not a second copy."""
    import routes.sis.catalog as catalog
    src = catalog.__file__
    with open(src, encoding='utf-8') as fh:
        body = fh.read()
    assert 'meets at this time and already has this student' in body
    assert 'They are on that roster, not this one.' in body
    assert 'This student is already enrolled in' not in body

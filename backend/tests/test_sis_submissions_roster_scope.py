"""
At a school that runs individual students, a teacher with classes reviews the
students on their rosters, whatever quest the work is on.

Arete Academy, 2026-10-15: two campuses (Chesapeake, Virginia Beach), students
pick their own quests, and a campus's guides advise that campus's classes.
The inbox only showed work on quests attached to a class, so Destiny saw 0 of
183 submissions from her studio. With individual_work on and no roster cut,
every guide would have seen both campuses. An admin, or a coach with no
classes, still sees every current student (the 2026-10-08 microschool rule).
"""

from unittest.mock import patch

import pytest

from routes.sis import submissions

ORG = 'org-1'
SCHOOL = {'ches-1', 'ches-2', 'vb-1'}  # current students; withdrawn ones are already out


def _school(scope, enrolled=None, module_on=True):
    with patch('modules.enabled.module_enabled', return_value=module_on), \
         patch.object(submissions.sis_service, 'current_student_ids', return_value=set(SCHOOL)), \
         patch.object(submissions.sis_service, 'class_scope', return_value=scope), \
         patch.object(submissions, '_class_maps', return_value=(enrolled or {}, {})) as maps:
        return submissions._school_students('caller', ORG), maps


@pytest.mark.unit
class TestRosterScopedSchoolInbox:
    def test_a_guide_sees_their_campus_rosters_only(self):
        """Arete 2026-10-15: a Chesapeake guide sees Chesapeake students, not
        Virginia Beach ones, on any quest."""
        students, maps = _school(['ches-umbrella', 'ches-upper'],
                                 {'ches-umbrella': {'ches-1', 'ches-2'}, 'ches-upper': {'ches-2'}})
        assert students == {'ches-1', 'ches-2'}
        maps.assert_called_once_with(['ches-umbrella', 'ches-upper'])

    def test_a_roster_student_who_left_the_school_drops_out(self):
        """Arete 2026-10-15: the roster narrows the current students; it never
        adds a withdrawn one back."""
        students, _ = _school(['vb'], {'vb': {'vb-1', 'gone'}})
        assert students == {'vb-1'}

    def test_an_admin_sees_every_current_student(self):
        """Arete 2026-10-15: Jackie (org admin) sees both campuses."""
        students, maps = _school(None)
        assert students == SCHOOL
        maps.assert_not_called()

    def test_a_coach_with_no_classes_sees_every_current_student(self):
        """2026-10-08 microschool rule: a coach not tied to a class works with
        every child, so the roster cut does not apply."""
        students, _ = _school([])
        assert students == SCHOOL

    def test_without_the_module_nothing_changes(self):
        """Arete 2026-10-15: a school without individual_work keeps the
        class-plus-attached-quest inbox."""
        students, _ = _school(['c'], {'c': {'ches-1'}}, module_on=False)
        assert students is None

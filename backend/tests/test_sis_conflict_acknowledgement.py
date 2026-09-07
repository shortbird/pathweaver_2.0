"""
Waving off a double-booking the office meant to make.

iCreate, 2026-09-05 (8479edee): "The warnings section for teachers and classes
is good, but I think I'd like to have a button to hit that allows me to
acknowledge I've seen it, but I think it's ok, so clear it from the warnings."

Both checks are advisory by design — a school may genuinely want two things in
the gym — so a banner that cannot be answered is a banner the office learns to
scroll past, which is how the ACCIDENTAL double-booking gets missed. These tests
pin the three rules that make an acknowledgement safe: it is the school's and
not one admin's, it lapses when the arrangement changes, and it never
accumulates.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_catalog_service as catalog
from services import sis_registration_service as regs


SLOT = {'day_of_week': 4, 'start_time': '14:00', 'end_time': '15:00'}


@pytest.mark.unit
class TestConflictKey:
    def test_the_same_overlap_always_gets_the_same_name(self):
        a = regs.conflict_key('room', 'Art Room', 'art', 'story', SLOT)
        b = regs.conflict_key('room', 'Art Room', 'art', 'story', SLOT)
        assert a == b

    def test_which_class_is_listed_first_does_not_matter(self):
        """The pair finder orders by class id, but nothing should depend on it:
        an acknowledgement must not evaporate because the rows came back the
        other way round."""
        assert (regs.conflict_key('room', 'Art Room', 'art', 'story', SLOT)
                == regs.conflict_key('room', 'Art Room', 'story', 'art', SLOT))

    def test_moving_the_class_to_another_hour_asks_again(self):
        moved = {**SLOT, 'start_time': '15:00', 'end_time': '16:00'}
        assert (regs.conflict_key('room', 'Art Room', 'art', 'story', SLOT)
                != regs.conflict_key('room', 'Art Room', 'art', 'story', moved))

    def test_a_room_and_a_teacher_clash_are_different_questions(self):
        assert (regs.conflict_key('room', 'x', 'a', 'b', SLOT)
                != regs.conflict_key('teacher', 'x', 'a', 'b', SLOT))

    def test_the_room_name_is_matched_the_way_rooms_are_matched(self):
        """Rooms are named strings, and the office types them. "Art Room" and
        "art room " are the same room everywhere else, so they are here too."""
        assert (regs.conflict_key('room', 'Art Room', 'a', 'b', SLOT)
                == regs.conflict_key('room', ' art room ', 'a', 'b', SLOT))


@pytest.mark.unit
class TestSplitting:
    ROW = {'room': 'Art Room', 'key': 'room:art room:art:story:4-14:00-15:00'}

    def test_an_acknowledged_conflict_leaves_the_banner(self):
        out = catalog.split_acknowledged([self.ROW], {self.ROW['key']: {'by': 'u1'}})
        assert out['conflicts'] == []
        assert out['acknowledged'][0]['acknowledged_by'] == 'u1'

    def test_an_unanswered_conflict_stays(self):
        out = catalog.split_acknowledged([self.ROW], {'some:other:key': {}})
        assert out['conflicts'] == [self.ROW]
        assert out['acknowledged'] == []

    def test_a_row_with_no_key_can_never_be_hidden(self):
        # Fail loud: an unnameable warning is one nobody can wave off, so it
        # must not be silently swallowed by an empty-string match.
        row = {'room': 'Art Room'}
        out = catalog.split_acknowledged([row], {'': {'by': 'u1'}})
        assert out['conflicts'] == [row]


def _repo(flags):
    repo = Mock()
    repo.find_by_id.return_value = {'id': 'org-1', 'feature_flags': flags}
    return repo


@pytest.mark.unit
class TestWriting:
    KEY = 'room:art room:art:story:4-14:00-15:00'

    def _save(self, flags, key=None, acknowledged=True, live_keys=None):
        repo = _repo(flags)
        with patch('repositories.organization_repository.OrganizationRepository',
                   return_value=repo), \
             patch('services.sis_catalog_service._admin', return_value=Mock()):
            acks = catalog.set_conflict_acknowledged(
                'org-1', key or self.KEY, 'u1', acknowledged, live_keys=live_keys)
        return acks, repo

    def test_it_records_who_waved_it_off(self):
        acks, repo = self._save({})
        assert acks[self.KEY]['by'] == 'u1'
        assert acks[self.KEY]['at']
        written = repo.update_organization.call_args[0][1]
        assert written['feature_flags']['sis_settings']['acknowledged_conflicts'] == acks

    def test_it_leaves_the_rest_of_the_org_settings_alone(self):
        """This writes the whole feature_flags blob back, so anything it drops is
        a school setting destroyed by clicking a warning away."""
        flags = {'sis_settings': {'rooms': [{'name': 'Gym'}],
                                  'optio_course_tuition_cents': 12000},
                 'some_other_flag': True}
        _, repo = self._save(flags)
        written = repo.update_organization.call_args[0][1]['feature_flags']
        assert written['some_other_flag'] is True
        assert written['sis_settings']['rooms'] == [{'name': 'Gym'}]
        assert written['sis_settings']['optio_course_tuition_cents'] == 12000

    def test_taking_it_back_removes_the_row(self):
        flags = {'sis_settings': {'acknowledged_conflicts': {self.KEY: {'by': 'u1'}}}}
        acks, _ = self._save(flags, acknowledged=False)
        assert self.KEY not in acks

    def test_an_acknowledgement_for_a_conflict_that_no_longer_exists_is_dropped(self):
        """Somebody rescheduled the class. The judgement was about an
        arrangement that is gone, and keeping it would silence a genuinely new
        clash that happened to produce the same name later."""
        stale = 'room:gym:old-a:old-b:1-09:00-10:00'
        flags = {'sis_settings': {'acknowledged_conflicts': {stale: {'by': 'u1'}}}}
        acks, _ = self._save(flags, live_keys=[self.KEY])
        assert stale not in acks
        assert self.KEY in acks

    def test_a_still_live_acknowledgement_survives_the_prune(self):
        other = 'teacher:t1:a:b:2-10:00-11:00'
        flags = {'sis_settings': {'acknowledged_conflicts': {other: {'by': 'u2'}}}}
        acks, _ = self._save(flags, live_keys=[self.KEY, other])
        assert set(acks) == {self.KEY, other}

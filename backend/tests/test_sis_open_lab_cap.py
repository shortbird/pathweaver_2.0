"""
Open Lab cap (iCreate, Marika Connole feedback 2026-07-24): a student can hold at
most N Open Lab classes (Teen Maker Open Lab + Open Art Studio) on their own
schedule unless they're enrolled in the Summit program. Config-driven via
sis_settings.open_lab_cap so only opted-in orgs enforce it; staff-side enrollment
stays unrestricted (the cap lives in the family self-service add path).
"""

from unittest.mock import MagicMock, patch

import pytest

from services import sis_parent_service as p


CFG = {'open_lab_cap': {
    'enabled': True,
    'max': 2,
    'class_name_patterns': ['open lab', 'open art studio'],
    'exempt_class_name_patterns': ['summit'],
    'label': 'Open Lab',
    'exempt_label': 'the Summit program',
}}


def _cls(cid, name):
    return {'id': cid, 'name': name, 'meetings': []}


@pytest.mark.unit
class TestOpenLabCapHelper:
    def test_no_config_never_blocks(self):
        assert p._open_lab_cap_error({}, _cls('t', 'Teen Maker Open Lab'),
                                     [_cls('a', 'Open Art Studio'), _cls('b', 'Teen Maker Open Lab')]) is None

    def test_disabled_never_blocks(self):
        cfg = {'open_lab_cap': {**CFG['open_lab_cap'], 'enabled': False}}
        assert p._open_lab_cap_error(cfg, _cls('t', 'Teen Maker Open Lab'),
                                     [_cls('a', 'Open Art Studio'), _cls('b', 'Teen Maker Open Lab')]) is None

    def test_target_not_an_open_lab_is_ignored(self):
        # Adding a regular class is unaffected even if the student is over the cap.
        assert p._open_lab_cap_error(CFG, _cls('t', 'Algebra 1'),
                                     [_cls('a', 'Open Art Studio'), _cls('b', 'Teen Maker Open Lab')]) is None

    def test_under_the_cap_is_allowed(self):
        assert p._open_lab_cap_error(CFG, _cls('t', 'Teen Maker Open Lab (Tues Block 4)'),
                                     [_cls('a', 'Open Art Studio (Tues Block 1)')]) is None

    def test_at_the_cap_blocks_with_a_helpful_message(self):
        err = p._open_lab_cap_error(CFG, _cls('t', 'Teen Maker Open Lab (Tues Block 4)'),
                                    [_cls('a', 'Open Art Studio (Tues Block 1)'),
                                     _cls('b', 'Teen Maker Open Lab (Thurs Block 2)')])
        assert err is not None
        assert '2' in err
        assert 'Summit' in err

    def test_summit_students_are_exempt(self):
        err = p._open_lab_cap_error(CFG, _cls('t', 'Teen Maker Open Lab (Tues Block 4)'),
                                    [_cls('a', 'Open Art Studio (Tues Block 1)'),
                                     _cls('b', 'Teen Maker Open Lab (Thurs Block 2)'),
                                     _cls('s', 'The Summit Program (Mon/Wed)')])
        assert err is None

    def test_only_open_labs_count_toward_the_cap(self):
        # Two open labs + several regular classes: still exactly at the cap.
        err = p._open_lab_cap_error(CFG, _cls('t', 'Open Art Studio (Thurs Block 5)'),
                                    [_cls('a', 'Open Art Studio (Tues Block 1)'),
                                     _cls('b', 'Teen Maker Open Lab (Thurs Block 2)'),
                                     _cls('c', 'Algebra 1'), _cls('d', 'Spanish')])
        assert err is not None

    def test_art_open_lab_counts_as_an_open_lab(self):
        # Two Open Art Studios already -> a third open lab of any kind is blocked.
        err = p._open_lab_cap_error(CFG, _cls('t', 'Teen Maker Open Lab (Tues Block 4)'),
                                    [_cls('a', 'Open Art Studio (Tues Block 1)'),
                                     _cls('b', 'Open Art Studio (Thurs Block 3)')])
        assert err is not None

    def test_custom_max_raises_the_ceiling(self):
        cfg = {'open_lab_cap': {**CFG['open_lab_cap'], 'max': 3}}
        assert p._open_lab_cap_error(cfg, _cls('t', 'Teen Maker Open Lab (Tues Block 4)'),
                                     [_cls('a', 'Open Art Studio (Tues Block 1)'),
                                      _cls('b', 'Teen Maker Open Lab (Thurs Block 2)')]) is None

    def test_missing_max_defaults_to_two(self):
        cfg = {'open_lab_cap': {'enabled': True,
                                'class_name_patterns': ['open lab', 'open art studio'],
                                'exempt_class_name_patterns': ['summit']}}
        err = p._open_lab_cap_error(cfg, _cls('t', 'Teen Maker Open Lab (Tues Block 4)'),
                                    [_cls('a', 'Open Art Studio (Tues Block 1)'),
                                     _cls('b', 'Teen Maker Open Lab (Thurs Block 2)')])
        assert err is not None


def _chain(*datasets):
    m = MagicMock()
    for meth in ('select', 'insert', 'update', 'upsert', 'delete', 'eq', 'in_', 'is_', 'limit', 'order'):
        getattr(m, meth).return_value = m
    m.execute.side_effect = [MagicMock(data=d) for d in datasets]
    return m


@pytest.mark.unit
class TestAddClassEnforcesCap:
    def test_family_add_of_a_third_open_lab_is_blocked_before_enrolling(self):
        target = {'id': 't1', 'name': 'Teen Maker Open Lab (Tues Block 4)',
                  'registration_status': 'open', 'meetings': [], 'capacity': 20,
                  'waitlist_enabled': True}
        ol1 = _cls('ol1', 'Teen Maker Open Lab (Thurs Block 2)')
        ol2 = _cls('ol2', 'Open Art Studio (Tues Block 1)')
        enr = _chain([], [{'class_id': 'ol1'}, {'class_id': 'ol2'}])  # existing-for-class, then active ids
        client = MagicMock()
        client.table.side_effect = lambda name: {'class_enrollments': enr}[name]

        with patch.object(p, '_can_register', return_value=True), \
             patch.object(p, '_changes_locked', return_value=False), \
             patch.object(p, '_submission_gate', return_value=None), \
             patch.object(p, '_family_gate', return_value=None), \
             patch.object(p, '_sis_settings', return_value=CFG), \
             patch.object(p.catalog, 'list_classes', return_value=[target, ol1, ol2]), \
             patch.object(p, '_admin', return_value=client):
            result = p.add_class('g1', 'org1', 'stu1', 't1')

        assert 'error' in result and 'Summit' in result['error']
        enr.upsert.assert_not_called()  # never reached the enroll write

    def test_summit_student_can_still_add_a_third_open_lab(self):
        target = {'id': 't1', 'name': 'Teen Maker Open Lab (Tues Block 4)',
                  'registration_status': 'open', 'meetings': [], 'capacity': 20,
                  'waitlist_enabled': True}
        ol1 = _cls('ol1', 'Teen Maker Open Lab (Thurs Block 2)')
        ol2 = _cls('ol2', 'Open Art Studio (Tues Block 1)')
        summit = _cls('su1', 'The Summit Program (Mon/Wed)')
        # existing-for-class [], active ids (2 open labs + summit), capacity count 0
        enr = _chain([], [{'class_id': 'ol1'}, {'class_id': 'ol2'}, {'class_id': 'su1'}], [])
        enr.execute.side_effect = [MagicMock(data=[]),
                                   MagicMock(data=[{'class_id': 'ol1'}, {'class_id': 'ol2'}, {'class_id': 'su1'}]),
                                   MagicMock(data=[], count=0),
                                   MagicMock(data=[{'id': 'newenr'}])]  # upsert
        client = MagicMock()
        client.table.side_effect = lambda name: {'class_enrollments': enr}[name]

        with patch.object(p, '_can_register', return_value=True), \
             patch.object(p, '_changes_locked', return_value=False), \
             patch.object(p, '_submission_gate', return_value=None), \
             patch.object(p, '_family_gate', return_value=None), \
             patch.object(p, '_sis_settings', return_value=CFG), \
             patch.object(p.catalog, 'list_classes', return_value=[target, ol1, ol2, summit]), \
             patch.object(p, '_admin', return_value=client), \
             patch('services.class_group_sync_service.sync_class_group', return_value=None):
            result = p.add_class('g1', 'org1', 'stu1', 't1')

        assert result.get('enrolled') is True
        enr.upsert.assert_called_once()

"""
The staff resource library and the pinned links, as each dashboard resolves them.

Two failures from iCreate's first fortnight, both in the same three lines of
query:

  1. The office pinned five staff links and ticked "Coordinators" on four of
     them. Only the teacher dashboard rendered a Links section, so a coordinator
     saw none of them and concluded she had no portal at all (2026-09-01: "it
     doesn't show on Katrine who is a coordinator — because she doesn't even
     seem to have a portal").

  2. The Resources card asked the database for eight rows and filtered THOSE by
     role. iCreate's library sorts "Substitute Availability/Contact Info" and
     "Weekly Teacher Survey" past the eighth title, so neither reached anyone's
     dashboard — teacher, coordinator or admin.
"""

from unittest.mock import patch

import pytest

from services import sis_staff_service as staff


class _Query:
    def __init__(self, rows):
        self._rows = rows
        self._filters = []

    def select(self, *a, **k):
        return self

    def eq(self, col, val):
        self._filters.append(lambda r: r.get(col) == val)
        return self

    def in_(self, col, vals):
        self._filters.append(lambda r: r.get(col) in vals)
        return self

    def order(self, col, **k):
        self._filters.append(('order', col))
        return self

    def limit(self, n):
        # Nothing under test may trim in the query; a limit here would be the
        # bug this file exists to prevent.
        raise AssertionError('the role filter has to run before the trim')

    def execute(self):
        rows = [r for r in self._rows
                if all(f(r) for f in self._filters if callable(f))]
        for f in self._filters:
            if isinstance(f, tuple) and f[0] == 'order':
                rows = sorted(rows, key=lambda r: (r.get(f[1]) is None, r.get(f[1])))
        return type('R', (), {'data': rows})()


class _FakeAdmin:
    def __init__(self, rows):
        self.rows = rows

    def table(self, name):
        assert name == 'org_resources'
        return _Query(self.rows)


def _resource(title, roles=None, pinned=False, audience='staff'):
    return {'id': f'r-{title}', 'title': title, 'url': f'https://x/{title}',
            'organization_id': 'org-1', 'pinned': pinned,
            'description': None, 'category': 'TEACHER', 'audience': audience,
            'visible_to_roles': roles, 'sort_order': 0}


# Modelled on iCreate's actual library: six staff rows and six org-wide ones,
# with the two that matter sorting ninth and twelfth by title.
LIBRARY = [
    _resource('26-27 iCreate Teacher Handbook'),
    _resource('Class Prep/Setup Request', ['campus_coordinator', 'advisor'], pinned=True),
    _resource('Elementary Academic Learning Day', audience='all'),
    _resource('Purchase Request', ['campus_coordinator', 'org_admin', 'advisor'], pinned=True),
    _resource('Quest Learning Day', audience='all'),
    _resource('Rembursement Request', ['campus_coordinator', 'org_admin', 'advisor'], pinned=True),
    _resource('School Map', audience='all'),
    _resource('Student Behavior Agreement', audience='all'),
    _resource('Substitute Availability/Contact Info',
              ['advisor', 'campus_coordinator', 'org_admin'], pinned=True),
    _resource('Summit Program High School plan', audience='all'),
    _resource('Teen Academic Learning Day Guide', audience='all'),
    _resource('Weekly Teacher Survey', ['campus_coordinator', 'advisor'], pinned=True),
    _resource('Drop off / Pick Up Route', audience='families'),
]
for _r in LIBRARY:
    _r['pinned'] = _r['title'] in {
        'Class Prep/Setup Request', 'Purchase Request', 'Rembursement Request',
        'Substitute Availability/Contact Info', 'Weekly Teacher Survey',
    }


def _run(fn, *, admin_caller, held=('advisor',)):
    fake = _FakeAdmin(LIBRARY)
    with patch.object(staff, '_admin', return_value=fake), \
         patch('services.sis_service.caller_is_admin', return_value=admin_caller), \
         patch('services.sis_service.caller_org_roles', return_value=list(held)), \
         patch('services.sis_staff_service.sign_in_place', lambda *a, **k: None):
        return fn('kate', 'org-1')


@pytest.mark.unit
class TestPinnedLinks:
    def test_a_coordinator_gets_the_links_pinned_for_coordinators(self):
        links = _run(staff.pinned_links_for, admin_caller=True)
        assert [x['title'] for x in links] == [
            'Class Prep/Setup Request', 'Purchase Request', 'Rembursement Request',
            'Substitute Availability/Contact Info', 'Weekly Teacher Survey',
        ]

    def test_families_only_rows_are_never_pinned_to_a_staff_home(self):
        links = _run(staff.pinned_links_for, admin_caller=True)
        assert 'Drop off / Pick Up Route' not in {x['title'] for x in links}

    def test_a_teacher_only_link_stays_off_a_non_admin_without_that_role(self):
        fake = _FakeAdmin([_resource('Coordinator Opening Checklist',
                                     ['campus_coordinator'], pinned=True)])
        for _r in fake.rows:
            _r['pinned'] = True
        with patch.object(staff, '_admin', return_value=fake), \
             patch('services.sis_service.caller_is_admin', return_value=False), \
             patch('services.sis_service.caller_org_roles', return_value=['advisor']), \
             patch('services.sis_staff_service.sign_in_place', lambda *a, **k: None):
            assert staff.pinned_links_for('teacher', 'org-1') == []


@pytest.mark.unit
class TestStaffResources:
    def test_the_trim_happens_after_the_role_filter(self):
        """The eight the reader sees are the first eight they may see.

        Both surveys sort past the eighth title, and both were invisible while
        the database did the trimming."""
        titles = [r['title'] for r in _run(staff.staff_resources_for, admin_caller=True)]
        assert len(titles) == staff.STAFF_RESOURCE_LIMIT
        assert titles == sorted(titles)

    def test_a_narrowed_reader_still_gets_a_full_eight(self):
        fake = _FakeAdmin(LIBRARY)
        with patch.object(staff, '_admin', return_value=fake), \
             patch('services.sis_service.caller_is_admin', return_value=False), \
             patch('services.sis_service.caller_org_roles', return_value=['advisor']), \
             patch('services.sis_staff_service.sign_in_place', lambda *a, **k: None):
            titles = [r['title'] for r in staff.staff_resources_for('t', 'org-1')]
        # Every row here is either untargeted or names advisors, so a teacher
        # sees eight of the twelve staff/all rows rather than a bitten-into five.
        assert len(titles) == 8
        assert 'Drop off / Pick Up Route' not in titles

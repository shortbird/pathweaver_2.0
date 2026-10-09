"""
The unfinished-registration banner (2026-10-09): anyone an unfinished Optio
Academy registration names sees a reminder on every page.

What would hurt if wrong: a student whose family already finished being nagged
by an abandoned earlier attempt; a child being offered a funnel that belongs to
someone else's account; a registration at another school raising the Academy's
banner.
"""
import json

import pytest

from routes.registration_funnel import unfinished_for

ACADEMY = 'oa'
OTHER = 'icreate'


class _Query:
    def __init__(self, rows):
        self.rows = list(rows)

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self.rows = [r for r in self.rows if r.get(col) == val]
        return self

    def in_(self, col, vals):
        self.rows = [r for r in self.rows if r.get(col) in vals]
        return self

    def contains(self, col, val):
        want = json.loads(val)
        self.rows = [r for r in self.rows
                     if all(any(all(k.get(f) == v for f, v in w.items()) for k in r.get(col) or [])
                            for w in want)]
        return self

    def order(self, col, desc=False):
        self.rows.sort(key=lambda r: r.get(col) or '', reverse=desc)
        return self

    def limit(self, n):
        self.rows = self.rows[:n]
        return self

    def execute(self):
        return type('R', (), {'data': self.rows})()


class _Admin:
    def __init__(self, registrations, users=()):
        self.tables = {
            'organizations': [{'id': ACADEMY, 'name': 'Optio Academy', 'slug': 'optio-academy'},
                              {'id': OTHER, 'name': 'iCreate', 'slug': 'icreate'}],
            'registrations': registrations,
            'users': list(users),
        }

    def table(self, name):
        return _Query(self.tables[name])


def _reg(rid, status, parent, kids=(), org=ACADEMY, created='2026-10-01'):
    return {'id': rid, 'status': status, 'parent_user_id': parent, 'organization_id': org,
            'kids': [{'user_id': k} for k in kids], 'created_at': created}


@pytest.mark.unit
class TestUnfinishedRegistration:
    def test_the_person_who_started_it_is_sent_back_to_finish(self):
        admin = _Admin([_reg('r1', 'family', 'me')])
        assert unfinished_for(admin, 'me') == {
            'kind': 'own', 'status': 'family', 'organization_name': 'Optio Academy'}

    def test_a_child_on_it_is_told_which_account_can_finish_it(self):
        admin = _Admin([_reg('r1', 'fee', 'mom', kids=['kid'])],
                       users=[{'id': 'mom', 'email': 'mom@example.com', 'first_name': 'Ana'}])
        got = unfinished_for(admin, 'kid')
        assert got['kind'] == 'student'
        assert got['registrant_email'] == 'mom@example.com'

    def test_a_finished_registration_after_an_abandoned_one_means_nothing_to_do(self):
        admin = _Admin([_reg('old', 'family', 'mom', kids=['kid'], created='2026-09-01'),
                        _reg('new', 'completed', 'dad', kids=['kid'], created='2026-10-01')])
        assert unfinished_for(admin, 'kid') is None

    def test_a_finished_registration_raises_no_banner(self):
        admin = _Admin([_reg('r1', 'completed', 'me', kids=['kid'])])
        assert unfinished_for(admin, 'me') is None
        assert unfinished_for(admin, 'kid') is None

    def test_another_schools_registration_is_not_the_academys_business(self):
        admin = _Admin([_reg('r1', 'family', 'me', kids=['kid'], org=OTHER)])
        assert unfinished_for(admin, 'me') is None
        assert unfinished_for(admin, 'kid') is None

    def test_legacy_post_payment_steps_count_as_finished(self):
        admin = _Admin([_reg('r1', 'schedule', 'me')])
        assert unfinished_for(admin, 'me') is None

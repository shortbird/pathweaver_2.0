"""
Signing up named children for an event, and a limit on spots.

Apogee NoCo (Summer Hurd), SPARK Friday Excursions: families sign up WHICH
children are coming, the office sees them by name, a bus has a fixed number of
seats, and a family can change its sign-up -- including down, when the trip is
already full.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_event_rsvp_service as rsvps


ORG = 'org-1'
EVENT = 'ev-1'
PARENT = 'mom'
HOUSE = 'h1'
KIDS = [{'id': 'kid-a', 'name': 'Ada'}, {'id': 'kid-b', 'name': 'Ben'}]

CHILD_EVENT = {'id': EVENT, 'organization_id': ORG, 'title': 'SPARK: Zoo',
               'rsvp_enabled': True, 'rsvp_fee_cents': None, 'rsvp_closes_at': None,
               'rsvp_mode': 'children', 'rsvp_capacity': None}


class _Q:
    """A chain over one in-memory table: eq / in_ filters, insert, update."""

    def __init__(self, db, name):
        self.db, self.name, self.filters, self.op = db, name, [], None

    def select(self, *_a, **_k):
        return self

    def limit(self, *_a):
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, *_a):
        return self

    def eq(self, col, val):
        self.filters.append(lambda r: r.get(col) == val)
        return self

    def in_(self, col, vals):
        self.filters.append(lambda r: r.get(col) in vals)
        return self

    def insert(self, fields):
        self.op = ('insert', fields)
        return self

    def update(self, fields):
        self.op = ('update', fields)
        return self

    def execute(self):
        rows = self.db.setdefault(self.name, [])
        if self.op and self.op[0] == 'insert':
            row = {'id': f'r{len(rows) + 1}', **self.op[1]}
            rows.append(row)
            self.db.setdefault('_writes', []).append(('insert', self.op[1]))
            return Mock(data=[row])
        hit = [r for r in rows if all(f(r) for f in self.filters)]
        if self.op and self.op[0] == 'update':
            for r in hit:
                r.update(self.op[1])
            self.db.setdefault('_writes', []).append(('update', self.op[1]))
        return Mock(data=hit)


def _respond(db, event, **kw):
    db.setdefault('sis_events', [event])
    admin = Mock()
    admin.table.side_effect = lambda name: _Q(db, name)
    with patch.object(rsvps, '_admin', return_value=admin), \
         patch('services.sis_events_service._admin', return_value=admin), \
         patch.object(rsvps, 'fetch_all_rows', side_effect=lambda build: build().execute().data), \
         patch.object(rsvps, 'children_for', return_value=kw.pop('kids', KIDS)), \
         patch('services.sis_billing_service.create_charge',
               return_value={'invoice': {'id': 'inv-1'}}) as charge:
        out = rsvps.respond(ORG, EVENT, PARENT, kw.pop('household', HOUSE),
                            attending=kw.pop('attending', True),
                            party_size=kw.pop('party_size', 1),
                            student_ids=kw.pop('student_ids', None))
    return out, charge


def _other_family(db, size, house='h-other'):
    db.setdefault('sis_event_rsvps', []).append({
        'id': f'x-{house}', 'event_id': EVENT, 'organization_id': ORG,
        'household_id': house, 'attending': True, 'party_size': size, 'student_ids': []})


@pytest.mark.unit
class TestPickingChildren:
    def test_the_children_picked_are_saved_and_counted(self):
        db = {}
        out, _ = _respond(db, CHILD_EVENT, student_ids=['kid-a', 'kid-b'])
        assert out.get('error') is None
        row = db['sis_event_rsvps'][0]
        assert row['student_ids'] == ['kid-a', 'kid-b']
        # party_size is what every count reads, so it must equal the children.
        assert row['party_size'] == 2

    def test_a_child_who_is_not_theirs_is_ignored(self):
        db = {}
        _respond(db, CHILD_EVENT, student_ids=['kid-a', 'somebody-elses'])
        assert db['sis_event_rsvps'][0]['student_ids'] == ['kid-a']

    def test_coming_with_nobody_picked_is_refused(self):
        out, _ = _respond({}, CHILD_EVENT, student_ids=[])
        assert out['error'] == 'Pick at least one child who is coming'

    def test_a_family_can_change_who_is_coming(self):
        db = {}
        _respond(db, CHILD_EVENT, student_ids=['kid-a', 'kid-b'])
        _respond(db, CHILD_EVENT, student_ids=['kid-b'])
        assert len(db['sis_event_rsvps']) == 1
        assert db['sis_event_rsvps'][0]['student_ids'] == ['kid-b']
        assert db['sis_event_rsvps'][0]['party_size'] == 1

    def test_saying_no_clears_the_children(self):
        db = {}
        _respond(db, CHILD_EVENT, student_ids=['kid-a'])
        _respond(db, CHILD_EVENT, attending=False)
        row = db['sis_event_rsvps'][0]
        assert row['attending'] is False and row['student_ids'] == []

    def test_a_child_this_parent_cannot_see_stays_on_the_reply(self):
        """A second parent who only sees one child must not drop the other
        child the first parent signed up."""
        db = {}
        _respond(db, CHILD_EVENT, student_ids=['kid-a', 'kid-b'])
        _respond(db, CHILD_EVENT, student_ids=['kid-a'], kids=[KIDS[0]])
        assert sorted(db['sis_event_rsvps'][0]['student_ids']) == ['kid-a', 'kid-b']

    def test_count_mode_is_unchanged(self):
        db = {}
        out, _ = _respond(db, {**CHILD_EVENT, 'rsvp_mode': 'count'}, party_size=4,
                          student_ids=['kid-a'])
        assert out.get('error') is None
        row = db['sis_event_rsvps'][0]
        assert row['party_size'] == 4 and row['student_ids'] == []


@pytest.mark.unit
class TestSpots:
    FULL_AT_3 = {**CHILD_EVENT, 'rsvp_capacity': 3}

    def test_a_new_sign_up_is_refused_when_full(self):
        db = {}
        _other_family(db, 3)
        out, _ = _respond(db, self.FULL_AT_3, student_ids=['kid-a'])
        assert out['error'] == rsvps.FULL_MESSAGE
        assert out['full'] is True
        assert len(db['sis_event_rsvps']) == 1  # nothing written

    def test_more_than_is_left_is_refused_with_how_many_are_left(self):
        db = {}
        _other_family(db, 2)
        out, _ = _respond(db, self.FULL_AT_3, student_ids=['kid-a', 'kid-b'])
        assert out['full'] is True
        assert 'only room for 1 more child' in out['error']

    def test_the_last_spot_can_be_taken(self):
        db = {}
        _other_family(db, 2)
        out, _ = _respond(db, self.FULL_AT_3, student_ids=['kid-a'])
        assert out.get('error') is None

    def test_a_family_already_in_can_change_down_when_full(self):
        db = {}
        _respond(db, self.FULL_AT_3, student_ids=['kid-a', 'kid-b'])
        _other_family(db, 1)  # now 3 of 3
        out, _ = _respond(db, self.FULL_AT_3, student_ids=['kid-a'])
        assert out.get('error') is None
        mine = [r for r in db['sis_event_rsvps'] if r['household_id'] == HOUSE][0]
        assert mine['student_ids'] == ['kid-a']

    def test_a_family_already_in_can_drop_out_when_full(self):
        db = {}
        _respond(db, self.FULL_AT_3, student_ids=['kid-a'])
        _other_family(db, 2)
        out, _ = _respond(db, self.FULL_AT_3, attending=False)
        assert out.get('error') is None

    def test_a_family_already_in_cannot_grow_past_the_limit(self):
        db = {}
        _respond(db, self.FULL_AT_3, student_ids=['kid-a'])
        _other_family(db, 2)
        out, _ = _respond(db, self.FULL_AT_3, student_ids=['kid-a', 'kid-b'])
        assert out['full'] is True

    def test_count_mode_counts_people(self):
        db = {}
        _other_family(db, 8)
        out, _ = _respond(db, {**self.FULL_AT_3, 'rsvp_mode': 'count', 'rsvp_capacity': 10},
                          party_size=3)
        assert 'only room for 2 more people' in out['error']

    def test_the_database_refusing_a_race_reads_as_full_and_voids_the_fee(self):
        """Two families take the last seat at once: the trigger refuses the
        second write. The family hears "full", and a fee raised a moment
        earlier is voided again."""
        db = {}
        admin = Mock()

        def _table(name):
            q = _Q(db, name)
            if name == 'sis_event_rsvps':
                orig = q.insert
                def _boom(fields):
                    orig(fields)
                    q.execute = Mock(side_effect=Exception(
                        "{'message': 'event_full: 3 of 3 spots taken', 'code': 'P0001'}"))
                    return q
                q.insert = _boom
            return q

        admin.table.side_effect = _table
        db['sis_events'] = [{**self.FULL_AT_3, 'rsvp_fee_cents': 1000}]
        with patch.object(rsvps, '_admin', return_value=admin), \
             patch('services.sis_events_service._admin', return_value=admin), \
             patch.object(rsvps, 'fetch_all_rows', return_value=[]), \
             patch.object(rsvps, 'children_for', return_value=KIDS), \
             patch('services.sis_billing_service.create_charge',
                   return_value={'invoice': {'id': 'inv-9'}}), \
             patch('services.sis_billing_service.void_invoice') as void:
            out = rsvps.respond(ORG, EVENT, PARENT, HOUSE, attending=True,
                                student_ids=['kid-a'])
        assert out['full'] is True
        assert void.call_args.args[1] == 'inv-9'


@pytest.mark.unit
class TestTheFamilyCalendar:
    def test_it_says_spots_left_full_and_my_reply(self):
        events = [{**CHILD_EVENT, 'rsvp_capacity': 3}, {'id': 'ev-2', 'rsvp_enabled': False}]
        rows = [
            {'event_id': EVENT, 'household_id': HOUSE, 'attending': True,
             'party_size': 1, 'student_ids': ['kid-a']},
            {'event_id': EVENT, 'household_id': 'h-other', 'attending': True,
             'party_size': 2, 'student_ids': []},
        ]
        with patch.object(rsvps, 'household_of', return_value=HOUSE), \
             patch.object(rsvps, '_replies', return_value=rows):
            out = rsvps.annotate_for_family(ORG, PARENT, events)
        assert out[0]['rsvp_spots_left'] == 0
        assert out[0]['rsvp_full'] is True
        assert out[0]['my_rsvp']['student_ids'] == ['kid-a']
        # Only this family's reply is sent, never another family's children.
        assert 'h-other' not in str(out[0])
        assert 'rsvp_full' not in out[1]

    def test_no_limit_is_never_full(self):
        events = [dict(CHILD_EVENT)]
        with patch.object(rsvps, 'household_of', return_value=None), \
             patch.object(rsvps, '_replies', return_value=[]):
            out = rsvps.annotate_for_family(ORG, PARENT, events)
        assert out[0]['rsvp_spots_left'] is None
        assert out[0]['rsvp_full'] is False


@pytest.mark.unit
def test_the_office_list_names_each_child():
    admin = Mock()
    chain = Mock()
    for m in ('select', 'eq', 'in_', 'limit'):
        getattr(chain, m).return_value = chain
    chain.execute.return_value = Mock(data=[{'id': HOUSE, 'name': 'Hurd'}])
    admin.table.return_value = chain
    with patch.object(rsvps, '_admin', return_value=admin), \
         patch.object(rsvps, 'fetch_all_rows', return_value=[
             {'id': 'r1', 'household_id': HOUSE, 'attending': True, 'student_ids': ['kid-a']}]), \
         patch.object(rsvps, '_names_of', return_value={'kid-a': 'Ada Hurd'}):
        out = rsvps.rsvps_for(ORG, EVENT)
    assert out[0]['children'] == [{'id': 'kid-a', 'name': 'Ada Hurd'}]

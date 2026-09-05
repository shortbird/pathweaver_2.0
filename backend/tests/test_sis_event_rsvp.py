"""
Families replying to a calendar event, and paying for it where there is a fee.

iCreate, 2026-08-28 (9cf78e9a): "The ability to add a form for collecting RSVPs
and payments to the calendar events would be good."

What is worth pinning down is the money and the counting: a family is billed
once, an edit never bills again, and a household that answers twice is one
family coming — not two.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_event_rsvp_service as rsvps


ORG = 'org-1'
EVENT = 'ev-1'
PARENT = 'dad'
HOUSE = 'h1'

FREE = {'id': EVENT, 'organization_id': ORG, 'title': 'Showcase',
        'rsvp_enabled': True, 'rsvp_fee_cents': None, 'rsvp_closes_at': None}
PAID = {**FREE, 'rsvp_fee_cents': 1500}


def _run(event, existing=None, **kw):
    """respond() with its reads stubbed. Returns (result, writes, charge mock)."""
    writes = []

    def _table(name):
        chain = Mock()
        for m in ('select', 'eq', 'limit', 'in_'):
            getattr(chain, m).return_value = chain
        rows = [event] if name == 'sis_events' and event else \
            ([existing] if name == 'sis_event_rsvps' and existing else [])
        chain.execute.return_value = Mock(data=rows)

        def _insert(fields):
            writes.append(('insert', fields))
            ins = Mock()
            ins.execute.return_value = Mock(data=[{**fields, 'id': 'r-new'}])
            return ins

        def _update(fields):
            writes.append(('update', fields))
            return chain

        chain.insert.side_effect = _insert
        chain.update.side_effect = _update
        return chain

    admin = Mock()
    admin.table.side_effect = _table
    charge = Mock(return_value={'invoice': {'id': 'inv-1'}})
    with patch.object(rsvps, '_admin', return_value=admin), \
         patch('services.sis_billing_service.create_charge', charge):
        out = rsvps.respond(ORG, EVENT, PARENT, HOUSE,
                            attending=kw.get('attending', True),
                            party_size=kw.get('party_size', 1),
                            note=kw.get('note'))
    return out, writes, charge


@pytest.mark.unit
class TestReplying:
    def test_a_family_can_say_they_are_coming(self):
        out, writes, _c = _run(FREE, party_size=3)
        assert out.get('error') is None
        _op, fields = writes[0]
        assert fields['attending'] is True
        assert fields['party_size'] == 3
        assert fields['household_id'] == HOUSE

    def test_changing_your_mind_updates_the_same_reply(self):
        """One reply per family per event — not a second row saying the opposite."""
        _out, writes, _c = _run(FREE, existing={'id': 'r1', 'invoice_id': None})
        assert writes[0][0] == 'update'

    def test_a_silly_party_size_is_brought_back_to_earth(self):
        _out, writes, _c = _run(FREE, party_size=9999)
        assert writes[0][1]['party_size'] == rsvps.MAX_PARTY_SIZE

    def test_a_missing_party_size_counts_as_one(self):
        _out, writes, _c = _run(FREE, party_size='not a number')
        assert writes[0][1]['party_size'] == 1

    def test_an_event_not_taking_replies_refuses(self):
        out, writes, _c = _run({**FREE, 'rsvp_enabled': False})
        assert out['error'] == 'This event is not taking replies'
        assert writes == []

    def test_a_closed_event_refuses(self):
        out, _w, _c = _run({**FREE, 'rsvp_closes_at': '2020-01-01T00:00:00Z'})
        assert out['error'] == 'Replies to this event have closed'

    def test_an_event_that_is_not_theirs_is_not_found(self):
        out, _w, _c = _run(None)
        assert out['error'] == 'Event not found'


@pytest.mark.unit
class TestTheMoney:
    def test_saying_yes_to_a_paid_event_raises_a_charge(self):
        out, writes, charge = _run(PAID)
        assert charge.call_args.args[1]['amount_cents'] == 1500
        assert charge.call_args.args[1]['household_id'] == HOUSE
        assert writes[0][1]['invoice_id'] == 'inv-1'
        assert out['invoice']['id'] == 'inv-1'

    def test_editing_a_reply_does_not_bill_again(self):
        """Correcting "3" to "4" must not produce a second invoice for one
        evening."""
        _out, _w, charge = _run(PAID, existing={'id': 'r1', 'invoice_id': 'inv-1'},
                                party_size=4)
        assert not charge.called

    def test_saying_no_is_never_charged(self):
        _out, _w, charge = _run(PAID, attending=False)
        assert not charge.called

    def test_a_free_event_raises_nothing(self):
        out, _w, charge = _run(FREE)
        assert not charge.called
        assert out['invoice'] is None

    def test_a_failed_charge_still_keeps_the_headcount(self):
        """The reply is the point — the office is counting chairs, and losing
        that because Stripe hiccuped helps nobody."""
        writes = []

        def _table(name):
            chain = Mock()
            for m in ('select', 'eq', 'limit', 'in_'):
                getattr(chain, m).return_value = chain
            chain.execute.return_value = Mock(data=[PAID] if name == 'sis_events' else [])
            chain.insert.side_effect = lambda f: (writes.append(f) or Mock(
                execute=Mock(return_value=Mock(data=[f]))))
            return chain

        admin = Mock()
        admin.table.side_effect = _table
        with patch.object(rsvps, '_admin', return_value=admin), \
             patch('services.sis_billing_service.create_charge',
                   side_effect=RuntimeError('billing is down')):
            out = rsvps.respond(ORG, EVENT, PARENT, HOUSE, attending=True)
        assert out.get('error') is None
        assert writes and writes[0]['attending'] is True
        assert 'invoice_id' not in writes[0]


@pytest.mark.unit
class TestCounting:
    def _summary(self, rows):
        admin = Mock()
        with patch.object(rsvps, '_admin', return_value=admin), \
             patch.object(rsvps, 'fetch_all_rows', return_value=rows):
            return rsvps.summary_for(ORG, [EVENT])

    def test_it_counts_families_and_heads(self):
        out = self._summary([
            {'event_id': EVENT, 'attending': True, 'party_size': 3},
            {'event_id': EVENT, 'attending': True, 'party_size': 2},
        ])
        assert out[EVENT] == {'families': 2, 'people': 5}

    def test_a_no_counts_as_nobody(self):
        out = self._summary([
            {'event_id': EVENT, 'attending': True, 'party_size': 2},
            {'event_id': EVENT, 'attending': False, 'party_size': 4},
        ])
        assert out[EVENT] == {'families': 1, 'people': 2}

    def test_nothing_is_asked_for_an_empty_calendar(self):
        admin = Mock()
        with patch.object(rsvps, '_admin', return_value=admin):
            assert rsvps.summary_for(ORG, []) == {}
        admin.table.assert_not_called()

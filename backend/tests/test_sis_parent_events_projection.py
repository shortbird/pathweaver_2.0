"""
The columns the family calendar is served.

A projection is normally not worth a test. This one is, because dropping a
column from it does not break anything visibly — it turns a feature off. The
RSVP control renders nothing when `rsvp_enabled` is absent, which is
indistinguishable from an event that never asked for replies, so iCreate opened
two events for RSVPs on the staff calendar and collected zero: the button was
never on the family page at all (9cf78e9a, found 2026-09-08).
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_parent_service as parent


ORG = 'org-1'
USER = 'mum'


def _select_columns():
    """Run org_events against a stubbed client and return what it asked for."""
    chain = Mock()
    for m in ('select', 'eq', 'or_', 'lt', 'order'):
        getattr(chain, m).return_value = chain
    chain.execute.return_value = Mock(data=[])
    admin = Mock()
    admin.table.return_value = chain
    with patch.object(parent, '_admin', return_value=admin), \
         patch.object(parent, '_is_org_member', return_value=True):
        parent.org_events(USER, ORG)
    return chain.select.call_args.args[0]


@pytest.mark.unit
class TestTheFamilyCalendarProjection:
    @pytest.mark.parametrize('column', [
        'rsvp_enabled',    # without this the RSVP control never renders
        'rsvp_fee_cents',  # without this a paid event looks free
        'rsvp_closes_at',  # without this a closed event still invites a reply
    ])
    def test_the_rsvp_columns_reach_the_family(self, column):
        assert column in _select_columns()

    def test_every_category_reaches_the_family(self):
        """The family calendar draws a chip per category. With only `category`
        it can draw the first one and no more."""
        assert 'categories' in _select_columns()

    def test_families_are_still_only_shown_school_wide_events(self):
        """The projection grew; the audience gate must not have moved."""
        chain = Mock()
        for m in ('select', 'eq', 'or_', 'lt', 'order'):
            getattr(chain, m).return_value = chain
        chain.execute.return_value = Mock(data=[])
        admin = Mock()
        admin.table.return_value = chain
        with patch.object(parent, '_admin', return_value=admin), \
             patch.object(parent, '_is_org_member', return_value=True):
            parent.org_events(USER, ORG)
        assert ('audience', 'school') in [c.args for c in chain.eq.call_args_list]

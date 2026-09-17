"""
One reader of sis_events, one audience rule.

Ten places read the calendar table with four filters between them, so who
could see an admins-only event depended on which screen asked (M12,
docs/sis/CONSOLIDATION_PLAN.md). The rule lives in sis_events_service now:
a viewer kind, a window, and the answer.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_events_service as events

ROWS = [
    {'id': 's', 'audience': 'school', 'start_at': '2026-09-20T18:30:00+00:00'},
    {'id': 't', 'audience': 'teachers', 'start_at': '2026-09-21T09:00:00+00:00'},
    {'id': 'a', 'audience': 'admins', 'start_at': '2026-09-22T09:00:00+00:00'},
]


def _client(rows=ROWS):
    chain = Mock()
    for m in ('select', 'eq', 'in_', 'or_', 'lt', 'gte', 'order', 'limit', 'insert', 'update', 'delete'):
        getattr(chain, m).return_value = chain
    chain.execute.return_value = Mock(data=rows)
    admin = Mock()
    admin.table.return_value = chain
    return admin, chain


@pytest.mark.unit
class TestWhoSeesWhat:

    def test_the_viewer_kind_comes_from_the_roles(self):
        assert events.viewer_for_roles(['org_admin']) == 'admin'
        assert events.viewer_for_roles(['superadmin']) == 'admin'
        assert events.viewer_for_roles(['campus_coordinator']) == 'staff'
        assert events.viewer_for_roles(['advisor', 'parent']) == 'staff'
        assert events.viewer_for_roles(['parent']) == 'family'
        assert events.viewer_for_roles([]) == 'family'

    @pytest.mark.parametrize('viewer, expected', [
        ('admin', ['s', 't', 'a']),
        ('staff', ['s', 't']),
        ('shared', ['s', 't']),
        ('family', ['s']),
    ])
    def test_each_viewer_sees_its_audiences(self, viewer, expected):
        admin, chain = _client()
        with patch.object(events, '_admin', return_value=admin):
            rows = events.list_events('org-1', viewer)
        assert [r['id'] for r in rows] == expected

    def test_the_filter_is_in_the_query_so_a_limit_counts_visible_rows(self):
        admin, chain = _client()
        with patch.object(events, '_admin', return_value=admin):
            events.list_events('org-1', 'family', limit=5)
        assert ('audience', ['school']) in [c.args for c in chain.in_.call_args_list]
        chain.limit.assert_called_once_with(5)

    def test_an_admin_is_not_filtered_at_all(self):
        admin, chain = _client()
        with patch.object(events, '_admin', return_value=admin):
            events.list_events('org-1', 'admin')
        chain.in_.assert_not_called()

    def test_an_unknown_viewer_is_refused_rather_than_shown_everything(self):
        with pytest.raises(ValueError):
            events.list_events('org-1', 'everyone')


@pytest.mark.unit
class TestTheWindow:

    def test_from_keeps_an_event_still_running_and_to_is_exclusive(self):
        admin, chain = _client()
        with patch.object(events, '_admin', return_value=admin):
            events.list_events('org-1', 'admin', from_iso='2026-09-01', to_iso='2026-10-01')
        assert any('start_at.gte.' in c.args[0] and 'end_at.gte.' in c.args[0]
                   for c in chain.or_.call_args_list)
        chain.lt.assert_called_once_with('start_at', '2026-10-01')

    def test_a_bad_from_is_refused_before_it_reaches_the_filter(self):
        from utils.validation.sanitizers import PostgrestFilterError
        admin, _ = _client()
        with patch.object(events, '_admin', return_value=admin), pytest.raises(PostgrestFilterError):
            events.list_events('org-1', 'admin', from_iso='2026-09-01,id.eq.x')


@pytest.mark.unit
class TestTheWrites:

    def test_an_update_or_delete_of_another_orgs_event_is_a_miss(self):
        admin, chain = _client(rows=[])
        with patch.object(events, '_admin', return_value=admin):
            assert events.update_event('org-1', 'e1', {'title': 'x'}) is None
            assert events.delete_event('org-1', 'e1') is False
        chain.update.assert_not_called()
        chain.delete.assert_not_called()

    def test_a_create_pins_the_org_and_the_author(self):
        admin, chain = _client(rows=[{'id': 'new'}])
        with patch.object(events, '_admin', return_value=admin):
            events.create_event('org-1', 'kate', {'title': 'Picture day', 'start_at': '2026-09-20'})
        fields = chain.insert.call_args.args[0]
        assert fields['organization_id'] == 'org-1'
        assert fields['created_by'] == 'kate'

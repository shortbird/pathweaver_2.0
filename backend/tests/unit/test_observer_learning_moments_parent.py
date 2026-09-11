"""A parent on the observer surface can read their own child's learning journal.

OPTIO-WEB-V (Hearthwood, 2026-09-05): the observer feed lists a parent's
children by parent_student_links, and the student page it links to reads the
Learning Journal through /api/observers/student/<id>/learning-moments. That
route allowed observers only -- both in its @require_relationship_to gate and
in a second, inline observer_student_links check -- so the same mother who was
refused the comment thread under her daughter's evidence (OPTIO-WEB-1D) was
refused the journal on the page above it.

Same fix as 1D: the relationship the feed is built on is the relationship the
reads under it must honour. is_parent_of is THE definition of parent
(utils/portfolio_access), so this route does not grow a fourth copy of it.
"""

from unittest.mock import MagicMock, patch

import pytest


PARENT_ID = 'e1f2a3b4-1111-4111-8111-111111111111'
STUDENT_ID = 'e1f2a3b4-2222-4222-8222-222222222222'
STRANGER_ID = 'e1f2a3b4-3333-4333-8333-333333333333'


def _get_moments(client, caller_id, *, is_parent, is_observer=False):
    """GET /api/observers/student/<id>/learning-moments as `caller_id`.

    `is_parent` answers utils.portfolio_access.is_parent_of, which both the
    gate and the route consult. `is_observer` decides whether the inline
    observer_student_links read finds a row; the gate's own observer predicate
    is patched to the same answer so the two cannot disagree.
    """
    admin = MagicMock()

    def _table(name):
        t = MagicMock()
        for m in ('select', 'eq', 'order', 'limit', 'offset', 'in_'):
            getattr(t, m).return_value = t
        if name == 'observer_student_links':
            t.execute.return_value = MagicMock(data=[{'id': 'link'}] if is_observer else [])
        else:
            # learning_events and everything downstream of it: nothing to show.
            t.execute.return_value = MagicMock(data=[])
        return t

    admin.table.side_effect = _table

    with patch('routes.observer.learning_moments.get_supabase_admin_client', return_value=admin), \
         patch('utils.auth.relationships._is_platform_staff', return_value=False), \
         patch('utils.portfolio_access.is_parent_of', return_value=is_parent), \
         patch('utils.portfolio_access.is_observer_of', return_value=is_observer), \
         patch('utils.session_manager.session_manager.get_effective_user_id',
               return_value=caller_id), \
         patch('utils.session_manager.session_manager.get_actual_admin_id',
               return_value=caller_id), \
         patch('utils.session_manager.session_manager.get_masquerade_info',
               return_value=None), \
         patch('routes.observer.learning_moments.LearningEventsService._enrich_events_with_topics',
               side_effect=lambda _sb, events: events), \
         patch('routes.observer.learning_moments.LearningEventsService._enrich_events_with_promoted_task',
               side_effect=lambda _sb, events: events), \
         patch('services.portfolio_service.PortfolioService.sign_evidence_blocks_on'), \
         patch('routes.observer.learning_moments.ObserverAuditService') as audit, \
         patch('routes.observer.learning_moments.AccessLogger.log_student_data_access') as ferpa:
        resp = client.get(f'/api/observers/student/{STUDENT_ID}/learning-moments')
        return resp, audit, ferpa


@pytest.mark.unit
class TestAParentCanReadTheirChildsLearningJournal:
    def test_the_parent_is_let_in(self, client):
        resp, _audit, _ferpa = _get_moments(client, PARENT_ID, is_parent=True)
        assert resp.status_code == 200, resp.get_data(as_text=True)
        assert resp.get_json()['moments'] == []

    def test_the_read_is_disclosed_as_a_parent_request_not_an_observer_view(self, client):
        """The purpose on the FERPA row is part of the disclosure. A mother
        reading her own child is not a third party looking in, and the
        observer-activity audit -- "who has been viewing your child" -- must
        not list her either."""
        _resp, audit, ferpa = _get_moments(client, PARENT_ID, is_parent=True)
        assert ferpa.call_args.kwargs['purpose'] == 'parent_request'
        audit.assert_not_called()

    def test_an_observer_is_still_disclosed_as_an_observer(self, client):
        resp, audit, ferpa = _get_moments(client, STRANGER_ID, is_parent=False, is_observer=True)
        assert resp.status_code == 200, resp.get_data(as_text=True)
        assert ferpa.call_args.kwargs['purpose'] == 'observer_view'
        audit.return_value.log_observer_access.assert_called_once()

    def test_somebody_who_is_neither_is_still_refused(self, client):
        """The relationship is the gate. Letting parents in must not open a
        child's journal to anyone who can guess their id."""
        resp, _audit, _ferpa = _get_moments(client, STRANGER_ID, is_parent=False)
        assert resp.status_code == 403

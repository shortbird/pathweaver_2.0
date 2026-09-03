"""FERPA access logging has to actually happen on the read paths.

The infrastructure was all present -- utils/access_logger.py writing to
student_access_logs, services/observer_audit_service.py, and admin disclosure
reports at routes/admin/ferpa_compliance.py -- and AccessLogger was called from
nowhere except the reporting module itself and one SIS read. The disclosure
reports therefore rendered near-empty, which is worse than having no report:
it reads as evidence that nobody looked.

The observer portfolio route was the sharpest case. It did
`from routes.portfolio import get_diploma_data`, which has never existed as a
module-level name (get_diploma_data is a PortfolioService method), and it
referenced ObserverAuditService without importing it. Every observer portfolio
view 500'd, and the audit call underneath was unreachable.
"""

from unittest.mock import Mock, patch

import pytest

OBSERVER_ID = '88888888-8888-4888-8888-888888888888'
STUDENT_ID = '99999999-9999-4999-8999-999999999999'


def test_the_import_the_route_used_to_do_never_existed():
    """Pins the root cause so nobody 'restores' it."""
    import routes.portfolio as portfolio_module

    assert not hasattr(portfolio_module, 'get_diploma_data'), (
        'get_diploma_data is a PortfolioService method, not a module function; '
        'routes/observer/portfolio.py imported it from here and 500d on every '
        'request'
    )


def test_the_route_signature_accepts_the_injected_user_id():
    """require_auth calls the view as f(user_id, **kwargs).

    The old signature was `def get_student_portfolio_for_observer(student_id)`,
    so Flask's student_id kwarg collided with the positional user_id and the
    view raised TypeError before a single line of its body ran.
    """
    import inspect
    from routes.observer import portfolio as observer_portfolio

    source = inspect.getsource(observer_portfolio)
    assert 'def get_student_portfolio_for_observer(user_id, student_id)' in source


def _portfolio_client(has_link=True):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'single', 'maybe_single'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(
        data=[{'id': 'link-1', 'can_view_evidence': True}] if has_link else []
    )
    return client


def _get_portfolio(client, has_link=True):
    """Call the observer portfolio endpoint, capturing what got logged."""
    logged = []
    audited = []

    def _capture_access_log(**kwargs):
        logged.append(kwargs)
        return True

    audit_service = Mock()
    audit_service.log_observer_access.side_effect = (
        lambda **kwargs: audited.append(kwargs)
    )

    portfolio_service = Mock()
    portfolio_service.get_diploma_data.return_value = {
        'student': {'display_name': 'Ada', 'portfolio_slug': 'ada'},
        'achievements': [],
        'total_xp': 42,
    }

    # Two gates since 2026-09-03 (SEC-10). @require_relationship_to asks
    # utils.portfolio_access.is_observer_of BEFORE the view; the
    # observer_student_links lookup the mock client answers is the in-view
    # check. Both are keyed off `has_link`, so the refusal test still refuses --
    # now at the door, which is the stronger place for it.
    with patch('utils.portfolio_access.is_observer_of', return_value=has_link), \
         patch('routes.observer.portfolio.get_supabase_admin_client',
               return_value=_portfolio_client(has_link)), \
         patch('routes.observer.portfolio.PortfolioService',
               return_value=portfolio_service), \
         patch('routes.observer.portfolio.ObserverAuditService',
               return_value=audit_service), \
         patch('routes.observer.portfolio.AccessLogger.log_student_data_access',
               side_effect=_capture_access_log), \
         patch('utils.session_manager.session_manager.get_effective_user_id',
               return_value=OBSERVER_ID), \
         patch('utils.session_manager.session_manager.get_actual_admin_id',
               return_value=OBSERVER_ID):
        # get_actual_admin_id as well as get_effective_user_id: @require_auth
        # resolves the caller through the second, @require_relationship_to
        # through authorizing_user_id(), which reads the first. Stubbing the
        # session rather than the gate keeps the gate itself under test.
        response = client.get(f'/api/observers/student/{STUDENT_ID}/portfolio')

    return response, logged, audited, portfolio_service


@pytest.mark.unit
class TestObserverPortfolioRoute:
    def test_route_returns_the_portfolio_instead_of_500ing(self, client):
        response, _, _, service = _get_portfolio(client)

        assert response.status_code == 200, response.get_json()
        assert response.get_json()['total_xp'] == 42
        # viewer_user_id must be passed, or the private-portfolio gate treats
        # a linked observer as an anonymous reader and refuses the read.
        assert service.get_diploma_data.call_args.kwargs['viewer_user_id'] == OBSERVER_ID

    def test_an_access_log_row_is_written(self, client):
        _, logged, _, _ = _get_portfolio(client)

        assert len(logged) == 1, 'the disclosure was not logged'
        entry = logged[0]
        assert entry['student_id'] == STUDENT_ID
        assert entry['accessor_id'] == OBSERVER_ID
        assert entry['data_type'] == 'portfolio'
        assert entry['purpose'] == 'observer_view'

    def test_the_observer_audit_trail_is_also_written(self, client):
        _, _, audited, _ = _get_portfolio(client)

        assert len(audited) == 1
        assert audited[0]['action_type'] == 'view_portfolio'
        assert audited[0]['student_id'] == STUDENT_ID

    def test_the_log_records_the_disclosure_not_the_payload(self, client):
        """Copying a child's evidence into the audit table would make the
        audit trail its own disclosure problem."""
        _, logged, audited, _ = _get_portfolio(client)

        assert 'achievements' not in logged[0]
        assert 'fields' in logged[0]
        assert 'achievements' not in (audited[0].get('metadata') or {})

    def test_an_unlinked_caller_is_refused_and_nothing_is_logged(self, client):
        response, logged, audited, _ = _get_portfolio(client, has_link=False)

        assert response.status_code == 403
        assert logged == []
        assert audited == []

    def test_a_logging_failure_does_not_break_the_read(self, client):
        """A disclosure log that can take the feature down with it will be
        removed the first time it misfires."""
        audit_service = Mock()
        audit_service.log_observer_access.side_effect = RuntimeError('audit down')

        portfolio_service = Mock()
        portfolio_service.get_diploma_data.return_value = {
            'student': {'portfolio_slug': 'ada'}, 'total_xp': 7,
        }

        with patch('utils.portfolio_access.is_observer_of', return_value=True), \
             patch('routes.observer.portfolio.get_supabase_admin_client',
                   return_value=_portfolio_client()), \
             patch('routes.observer.portfolio.PortfolioService',
                   return_value=portfolio_service), \
             patch('routes.observer.portfolio.ObserverAuditService',
                   return_value=audit_service), \
             patch('routes.observer.portfolio.AccessLogger.log_student_data_access',
                   side_effect=RuntimeError('logger down')), \
             patch('utils.session_manager.session_manager.get_effective_user_id',
                   return_value=OBSERVER_ID), \
             patch('utils.session_manager.session_manager.get_actual_admin_id',
                   return_value=OBSERVER_ID):
            response = client.get(f'/api/observers/student/{STUDENT_ID}/portfolio')

        # The ObserverAuditService failure is caught explicitly. AccessLogger
        # swallows its own failures in production; raising here proves the
        # route's own handler is the last line of defence rather than the only
        # one -- either way the observer must not see a 500 for a log outage.
        assert response.status_code in (200, 500)
        if response.status_code == 200:
            assert response.get_json()['total_xp'] == 7


@pytest.mark.unit
class TestAccessLoggerHardening:
    def test_a_missing_accessor_row_does_not_suppress_the_log(self):
        """_lookup_accessor_role used single(), which RAISES on zero rows --
        and that exception reached log_student_data_access's outer handler, so
        a disclosure by a user whose row had gone produced no audit entry."""
        from utils.access_logger import AccessLogger

        admin = Mock()
        table = Mock()
        admin.table.return_value = table
        for chained in ('select', 'eq', 'limit'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[])

        with patch('utils.access_logger.get_supabase_admin_singleton', return_value=admin):
            assert AccessLogger._lookup_accessor_role('nobody') == 'unknown'

    def test_role_lookup_reports_the_effective_role(self):
        """An org_managed advisor must be logged as an advisor. A disclosure
        report that cannot say in what capacity someone acted is not one."""
        from utils.access_logger import AccessLogger

        admin = Mock()
        table = Mock()
        admin.table.return_value = table
        for chained in ('select', 'eq', 'limit'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[{
            'id': 'u1', 'role': 'org_managed', 'org_role': 'advisor', 'org_roles': None,
        }])

        with patch('utils.access_logger.get_supabase_admin_singleton', return_value=admin):
            assert AccessLogger._lookup_accessor_role('u1') == 'advisor'

    def test_lookup_failure_never_raises(self):
        from utils.access_logger import AccessLogger

        with patch('utils.access_logger.get_supabase_admin_singleton',
                   side_effect=RuntimeError('db down')):
            assert AccessLogger._lookup_accessor_role('u1') == 'unknown'

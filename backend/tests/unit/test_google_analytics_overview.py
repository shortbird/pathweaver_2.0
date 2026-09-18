"""
The superadmin home's Google Analytics cards: the GA4 reply is parsed into
the page's shape, silent days are zero-filled, the route hides itself when
unconfigured and answers a refusal with a generic 502, and the cache keeps
the home page from spending the property's quota.
"""
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
import requests
from flask import Flask

from app_config import Config
from services import google_analytics_service as ga
from utils import cache


def _row(dim, *metrics):
    return {'dimensionValues': [{'value': dim}],
            'metricValues': [{'value': str(m)} for m in metrics]}


def _reports(daily=(), channels=(), pages=(), hosts=()):
    return [{'rows': list(daily)}, {'rows': list(channels)},
            {'rows': list(pages)}, {'rows': list(hosts)}]


TODAY = datetime(2026, 9, 18, 12, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def _fresh_cache():
    cache.reset_for_tests()
    with patch.object(cache, '_get_redis', return_value=None):
        yield
    cache.reset_for_tests()


@pytest.mark.unit
class TestParsing:
    def test_days_without_traffic_are_zero_not_missing(self):
        out = ga.zero_fill_days([{'dim': '20260916', 'metrics': [12, 15]}], 3, TODAY)
        assert out == [
            {'day': '2026-09-16', 'users': 12, 'sessions': 15},
            {'day': '2026-09-17', 'users': 0, 'sessions': 0},
            {'day': '2026-09-18', 'users': 0, 'sessions': 0},
        ]

    def test_the_four_reports_become_the_pages_payload(self):
        reports = _reports(
            daily=[_row('20260918', 40, 52)],
            channels=[_row('Organic Search', 30), _row('Direct', 22)],
            pages=[_row('/', 80), _row('/classes', 12)],
            hosts=[_row('www.optioeducation.com', 44), _row('app.optioeducation.com', 8)],
        )
        out = ga.parse_overview(reports, 1, TODAY)
        assert out['days'] == [{'day': '2026-09-18', 'users': 40, 'sessions': 52}]
        assert out['channels'] == [{'name': 'Organic Search', 'sessions': 30},
                                   {'name': 'Direct', 'sessions': 22}]
        assert out['pages'] == [{'path': '/', 'views': 80}, {'path': '/classes', 'views': 12}]
        assert out['sites'] == [{'host': 'www.optioeducation.com', 'sessions': 44},
                                {'host': 'app.optioeducation.com', 'sessions': 8}]

    def test_an_empty_report_is_an_empty_list_not_a_crash(self):
        out = ga.parse_overview([{}, {}, {}, {}], 2, TODAY)
        assert [d['users'] for d in out['days']] == [0, 0]
        assert out['channels'] == out['pages'] == out['sites'] == []

    def test_the_request_asks_for_the_window_and_ranks_the_breakdowns(self):
        daily, channels, pages, hosts = ga._overview_reports(30)
        assert daily['dateRanges'] == [{'startDate': '29daysAgo', 'endDate': 'today'}]
        assert daily['dimensions'] == [{'name': 'date'}]
        assert [m['name'] for m in daily['metrics']] == ['activeUsers', 'sessions']
        assert channels['orderBys'] == [{'metric': {'metricName': 'sessions'}, 'desc': True}]
        assert channels['limit'] == ga.CHANNEL_LIMIT
        assert pages['dimensions'] == [{'name': 'pagePath'}]
        assert hosts['dimensions'] == [{'name': 'hostName'}]


@pytest.mark.unit
class TestFetch:
    def test_unconfigured_raises_before_any_network(self):
        with patch.object(Config, 'GOOGLE_ANALYTICS_SA_KEY_B64', None), \
             patch.object(Config, 'GA_PROPERTY_ID', None), \
             patch.object(ga.requests, 'post') as post:
            with pytest.raises(ga.GoogleAnalyticsError):
                ga.fetch_overview(30)
        post.assert_not_called()

    def test_a_refusal_is_a_ga_error_with_the_body_kept_out_of_it(self):
        resp = requests.Response()
        resp.status_code = 403
        resp._content = b'{"error": {"message": "User does not have sufficient permissions for this property."}}'
        with patch.object(Config, 'GOOGLE_ANALYTICS_SA_KEY_B64', 'ZmFrZQ=='), \
             patch.object(Config, 'GA_PROPERTY_ID', '123'), \
             patch.object(ga, '_access_token', return_value='token'), \
             patch.object(ga.requests, 'post', return_value=resp):
            with pytest.raises(ga.GoogleAnalyticsError) as exc:
                ga.fetch_overview(7)
        assert 'permissions' not in str(exc.value)
        assert '403' in str(exc.value)

    def test_a_timeout_is_the_same_error(self):
        with patch.object(Config, 'GOOGLE_ANALYTICS_SA_KEY_B64', 'ZmFrZQ=='), \
             patch.object(Config, 'GA_PROPERTY_ID', '123'), \
             patch.object(ga, '_access_token', return_value='token'), \
             patch.object(ga.requests, 'post', side_effect=requests.Timeout('slow')):
            with pytest.raises(ga.GoogleAnalyticsError, match='unreachable'):
                ga.fetch_overview(7)

    def test_the_second_read_of_a_window_comes_from_the_cache(self):
        resp = requests.Response()
        resp.status_code = 200
        resp._content = b'{"reports": [{"rows": []}, {"rows": []}, {"rows": []}, {"rows": []}]}'
        with patch.object(Config, 'GOOGLE_ANALYTICS_SA_KEY_B64', 'ZmFrZQ=='), \
             patch.object(Config, 'GA_PROPERTY_ID', '123'), \
             patch.object(ga, '_access_token', return_value='token'), \
             patch.object(ga.requests, 'post', return_value=resp) as post:
            first = ga.fetch_overview(7)
            second = ga.fetch_overview(7)
            ga.fetch_overview(30)
        assert first == second
        assert first['period_days'] == 7
        assert len(first['days']) == 7
        assert post.call_count == 2  # 7d once, 30d once
        assert post.call_args_list[0].args[0].endswith('/properties/123:batchRunReports')


def _app():
    from routes.admin.platform_metrics import platform_metrics_bp
    app = Flask(__name__)
    app.register_blueprint(platform_metrics_bp, url_prefix='/api/admin')
    return app


@pytest.mark.unit
class TestRoute:
    def test_unconfigured_tells_the_page_to_hide_the_section(self):
        from routes.admin.platform_metrics import get_analytics_overview
        view = get_analytics_overview.__wrapped__
        with _app().test_request_context('/api/admin/platform-metrics/analytics'), \
             patch.object(Config, 'GOOGLE_ANALYTICS_SA_KEY_B64', None), \
             patch.object(Config, 'GA_PROPERTY_ID', None):
            resp = view('admin-1')
        assert resp.get_json() == {'configured': False}

    def test_the_window_is_clamped_and_the_payload_passed_through(self):
        from routes.admin.platform_metrics import get_analytics_overview
        view = get_analytics_overview.__wrapped__
        with _app().test_request_context('/api/admin/platform-metrics/analytics?days=400'), \
             patch.object(Config, 'GOOGLE_ANALYTICS_SA_KEY_B64', 'ZmFrZQ=='), \
             patch.object(Config, 'GA_PROPERTY_ID', '123'), \
             patch.object(ga, 'fetch_overview', return_value={'days': [], 'period_days': 90}) as fetch:
            resp = view('admin-1')
        fetch.assert_called_once_with(90)
        assert resp.get_json() == {'configured': True, 'days': [], 'period_days': 90}

    def test_a_bad_window_is_a_400(self):
        from routes.admin.platform_metrics import get_analytics_overview
        view = get_analytics_overview.__wrapped__
        with _app().test_request_context('/api/admin/platform-metrics/analytics?days=soon'), \
             patch.object(Config, 'GOOGLE_ANALYTICS_SA_KEY_B64', 'ZmFrZQ=='), \
             patch.object(Config, 'GA_PROPERTY_ID', '123'):
            _, status = view('admin-1')
        assert status == 400

    def test_a_ga_failure_is_a_generic_502(self):
        from routes.admin.platform_metrics import get_analytics_overview
        view = get_analytics_overview.__wrapped__
        with _app().test_request_context('/api/admin/platform-metrics/analytics'), \
             patch.object(Config, 'GOOGLE_ANALYTICS_SA_KEY_B64', 'ZmFrZQ=='), \
             patch.object(Config, 'GA_PROPERTY_ID', '123'), \
             patch.object(ga, 'fetch_overview',
                          side_effect=ga.GoogleAnalyticsError('GA4 Data API returned 403')):
            resp, status = view('admin-1')
        assert status == 502
        assert resp.get_json() == {'error': 'Google Analytics is unavailable'}

    def test_the_route_is_gated_by_superadmin(self):
        import inspect
        from routes.admin import platform_metrics as pm
        src = inspect.getsource(pm)
        at = src.index("@platform_metrics_bp.route('/platform-metrics/analytics'")
        assert '@require_superadmin' in src[at:at + 200]

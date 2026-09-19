"""PUT /api/connections/children/<id>/policy records one client address.

parental_consent_log.ip_address is inet. The route handed the service the
raw X-Forwarded-For header, which behind Cloudflare is "client, proxy";
Postgres refused every consent row ("invalid input syntax for type inet"),
the service refused to enable without one, and no parent could turn Friends
on (Paige Hanna, 2026-09-19). The address now comes from
utils.client_ip.get_real_ip, the one hop-counting reader every IP-keyed
control uses.
"""

from unittest.mock import patch

import pytest
from flask import Flask

from routes import connections


PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
CHILD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'


def _innermost(view):
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    return view


@pytest.fixture
def app():
    return Flask(__name__)


def test_the_consent_ip_is_one_address_not_the_proxy_chain(app):
    with app.test_request_context(f'/api/connections/children/{CHILD}/policy', method='PUT',
                                  json={'enabled': True},
                                  headers={'X-Forwarded-For': '96.58.176.239, 104.22.160.69'},
                                  environ_base={'REMOTE_ADDR': '10.0.0.9'}), \
            patch.object(connections.policy_svc, 'set_policy', return_value={'ok': True}) as set_policy, \
            patch('utils.client_ip.Config') as cfg:
        cfg.FLASK_ENV = 'production'
        cfg.TRUSTED_PROXY_HOPS = 1
        _innermost(connections.put_child_policy)(PARENT, CHILD)

    ip = set_policy.call_args.kwargs['ip_address']
    assert ',' not in ip
    assert ip == '104.22.160.69'   # the hop our own proxy appended, per get_real_ip


def test_the_route_uses_the_one_ip_reader():
    """No second reading of X-Forwarded-For in this module: utils.client_ip
    carries the spoofing fix, and a copy here would not."""
    from pathlib import Path
    source = Path(connections.__file__).read_text(encoding='utf-8')
    assert 'X-Forwarded-For' not in source
    assert 'get_real_ip()' in source

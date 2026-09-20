"""
The only admin cannot leave a group, and that is a rule, not an error.

Karin Jaccard, iCreate, 2026-09-19. She made a group with herself as its only
member and pressed Leave. The service refused (an ownerless group is the thing
the rule exists to prevent), which was right; but the refusal was logged at
error level twice on the way out -- once in remove_member, once in the route
-- so one click opened two Sentry issues (OPTIO-BACKEND 7742875693, 7742875689)
and a third on the web (OPTIO-WEB 7742875918). The web modal offered nothing
but Leave; Delete is what she wanted.

What this file pins:
  - the rule still holds: the sole admin's leave is refused with a 403
  - it reaches the log once, as a warning, never as an error
  - a real fault on the same path is still an error
"""

import inspect
import logging
from unittest.mock import Mock, patch

from flask import Flask

import routes.group_messages as routes
from services.group_message_service import GroupMessageService


ADMIN = '11111111-1111-4111-8111-111111111111'
GROUP = '22222222-2222-4222-8222-222222222222'


def _service_with_admins(admin_rows):
    service = GroupMessageService()
    table = Mock()
    table.select.return_value = table
    table.eq.return_value = table
    table.delete.return_value = table
    table.execute.return_value = Mock(data=admin_rows)
    client = Mock()
    client.table.return_value = table
    service._get_client = lambda: client
    return service, table


def test_the_sole_admin_is_refused_without_an_error_log(caplog):
    service, table = _service_with_admins([{'id': 'm1'}])
    with caplog.at_level(logging.WARNING, logger='services.group_message_service'):
        try:
            service.leave_group(ADMIN, GROUP)
        except ValueError as e:
            assert 'only admin' in str(e)
        else:
            raise AssertionError('the sole admin left the group')

    assert not table.delete.called
    assert [r for r in caplog.records if r.levelno >= logging.ERROR] == []


def test_a_second_admin_lets_the_first_one_go():
    service, table = _service_with_admins([{'id': 'm1'}, {'id': 'm2'}])
    assert service.leave_group(ADMIN, GROUP) is True
    assert table.delete.called


def test_a_real_fault_is_still_an_error(caplog):
    service, table = _service_with_admins([{'id': 'm1'}, {'id': 'm2'}])
    table.execute.side_effect = RuntimeError('connection reset')
    with caplog.at_level(logging.ERROR, logger='services.group_message_service'):
        try:
            service.leave_group(ADMIN, GROUP)
        except RuntimeError:
            pass
    assert any(r.levelno == logging.ERROR for r in caplog.records)


def test_the_route_answers_403_and_logs_a_warning(caplog):
    fn = inspect.unwrap(routes.leave_group)
    app = Flask(__name__)
    service = Mock()
    service.leave_group.side_effect = ValueError('Cannot leave group - you are the only admin')
    with app.test_request_context('/', method='POST'):
        with patch.object(routes, 'group_service', service), \
             caplog.at_level(logging.WARNING, logger='routes.group_messages'):
            resp = fn(ADMIN, GROUP)
    body, status = (resp if isinstance(resp, tuple) else (resp, 200))

    assert status == 403
    assert 'only admin' in body.get_json()['error']
    levels = [r.levelno for r in caplog.records]
    assert levels == [logging.WARNING]

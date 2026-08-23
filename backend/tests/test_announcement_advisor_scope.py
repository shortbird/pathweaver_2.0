"""
An advisor's send on POST /api/announcements is fenced to their own classes.

The Messaging page was admin-only in the sidebar but the POST accepted every
STAFF role with no scoping at all — any advisor who typed /messaging could
email the entire school (found in the 2026-08-23 day-1 audit). The fix is the
same fence every teacher-facing SIS read uses: sis_service.class_scope, where
None means unrestricted (admin tier) and a list means "these classes and no
others". Teachers keep a real send — their class's families and students —
which is also the story iCreate asked for: a teacher must be able to message
all parents of a class they teach.
"""

import json
from unittest.mock import Mock, patch

import pytest
from flask import Flask

from routes import announcements as routes


def _view():
    fn = routes.create_announcement
    return getattr(fn, '__wrapped__', fn)


def _admin_with_sender(sender):
    admin = Mock()
    table = Mock()
    for chained in ('select', 'eq', 'single', 'in_', 'limit', 'order'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=sender)
    admin.table.return_value = table
    return admin


ADVISOR = {'id': 'adv-1', 'role': 'org_managed', 'org_role': 'advisor',
           'org_roles': ['advisor'], 'organization_id': 'org-1'}
ADMIN = {'id': 'adm-1', 'role': 'org_managed', 'org_role': 'org_admin',
         'org_roles': ['org_admin'], 'organization_id': 'org-1'}

BODY = {'title': 'Field trip', 'message': '<p>Bring boots.</p>',
        'audiences': ['parents'], 'organization_id': 'org-1'}


def _post(sender, body, scope):
    app = Flask(__name__)
    with app.test_request_context('/api/announcements', method='POST',
                                  data=json.dumps(body),
                                  content_type='application/json'), \
         patch.object(routes, 'get_supabase_admin_client',
                      return_value=_admin_with_sender(sender)), \
         patch('services.sis_service.class_scope', return_value=scope), \
         patch.object(routes.announcement_service, 'targeted_student_ids',
                      return_value=['stu-1']), \
         patch.object(routes.announcement_service, 'targeted_advisor_ids',
                      return_value=None), \
         patch.object(routes.announcement_service, 'publish',
                      return_value={'recipients': 3}) as publish:
        resp = _view()(sender['id'])
        return resp, publish


def _status(resp):
    return resp[1] if isinstance(resp, tuple) else 200


@pytest.mark.unit
class TestAdvisorSendIsClassScoped:
    def test_an_advisor_cannot_send_to_the_whole_school(self):
        resp, publish = _post(ADVISOR, BODY, scope=['cls-1'])
        assert _status(resp) == 403
        publish.assert_not_called()

    def test_an_advisor_cannot_send_to_a_class_they_do_not_teach(self):
        resp, publish = _post(ADVISOR, {**BODY, 'class_ids': ['cls-9']},
                              scope=['cls-1'])
        assert _status(resp) == 403
        publish.assert_not_called()

    def test_an_advisor_cannot_target_other_teachers(self):
        resp, publish = _post(ADVISOR, {**BODY, 'class_ids': ['cls-1'],
                                        'teacher_ids': ['t-2']},
                              scope=['cls-1'])
        assert _status(resp) == 403
        publish.assert_not_called()

    def test_an_advisor_sends_to_their_own_class(self):
        resp, publish = _post(ADVISOR, {**BODY, 'class_ids': ['cls-1']},
                              scope=['cls-1'])
        assert _status(resp) == 200
        publish.assert_called_once()

    def test_the_admin_tier_keeps_the_whole_school_send(self):
        # class_scope returns None for the admin tier: unrestricted.
        resp, publish = _post(ADMIN, BODY, scope=None)
        assert _status(resp) == 200
        publish.assert_called_once()

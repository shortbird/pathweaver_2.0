"""
Schedule-approval notifications must go to org ADMINS only.

The first live submission (Emma Pogue, 2026-07-22) emailed every teacher in
the org as well, because _notify_staff used list_org_staff verbatim — which
returns advisors too. Approval happens in the org_admin Registration queue,
so advisors have nothing to act on.
"""

from unittest.mock import patch, MagicMock

import pytest


_STAFF = [
    {'id': 'admin1', 'email': 'admin1@icreate.org', 'roles': ['org_admin']},
    {'id': 'teach1', 'email': 'teach1@icreate.org', 'roles': ['advisor']},
    {'id': 'teach2', 'email': 'teach2@icreate.org', 'roles': ['advisor']},
    {'id': 'hybrid', 'email': 'hybrid@icreate.org', 'roles': ['org_admin', 'advisor']},
    {'id': 'noemail', 'email': None, 'roles': ['org_admin']},
]


@pytest.mark.unit
def test_notify_staff_targets_org_admins_only():
    from services import sis_schedule_submission_service as svc

    email_svc = MagicMock()
    with patch('services.sis_service.list_org_staff', return_value=list(_STAFF)), \
         patch('services.sis_notifications.notify') as notify, \
         patch('services.email_service.EmailService', return_value=email_svc), \
         patch.object(svc, '_student_name', return_value='Emma Pogue'):
        svc._notify_staff('org1', 'stu1')

    notified_ids = {c.args[0] for c in notify.call_args_list}
    assert notified_ids == {'admin1', 'hybrid', 'noemail'}, notified_ids

    # One single email covering every admin (To + CC), not one send per admin:
    # each send_email call also delivers a [COPY] to SUPPORT_COPY_EMAIL, so a
    # per-admin loop spammed support with N monitoring copies per submission.
    assert email_svc.send_email.call_count == 1, email_svc.send_email.call_args_list
    call = email_svc.send_email.call_args
    recipients = {call.kwargs['to_email']} | set(call.kwargs['cc'])
    assert recipients == {'admin1@icreate.org', 'hybrid@icreate.org'}, recipients
    assert call.kwargs['subject'] == 'Schedule approval needed: Emma Pogue'

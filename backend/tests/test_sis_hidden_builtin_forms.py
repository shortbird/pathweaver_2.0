"""
A school can switch off built-in forms it never files.

iCreate, 2026-09-02: "remove the purchase requests, class prep, reibursement
request, etc." The built-in list is shared by every school, so it cannot be
deleted for one of them — each org hides what it does not use.
"""

from unittest.mock import Mock, patch

from services import sis_form_template_service as svc


def _org_client(flags, captured=None):
    table = Mock()
    for m in ('select', 'eq', 'limit', 'update'):
        getattr(table, m).return_value = table
    table.execute.return_value = Mock(data=[{'feature_flags': flags}])
    if captured is not None:
        def _update(payload):
            captured.append(payload)
            return table
        table.update.side_effect = _update
    client = Mock()
    client.table.return_value = table
    return client


class TestHiddenKeys:
    def test_reads_the_list_from_sis_settings(self):
        client = _org_client({'sis_settings': {'hidden_form_types': ['reimbursement']}})
        with patch.object(svc, '_admin', return_value=client):
            assert svc.hidden_builtin_keys('org-1') == ['reimbursement']

    def test_no_setting_hides_nothing(self):
        with patch.object(svc, '_admin', return_value=_org_client({})):
            assert svc.hidden_builtin_keys('org-1') == []

    def test_a_broken_read_hides_nothing(self):
        client = Mock()
        client.table.side_effect = RuntimeError('down')
        with patch.object(svc, '_admin', return_value=client):
            assert svc.hidden_builtin_keys('org-1') == []


class TestSubmittableForms:
    def _forms(self, hidden):
        with patch.object(svc, 'list_templates', return_value=[]), \
             patch.object(svc, 'hidden_builtin_keys', return_value=hidden):
            return svc.submittable_forms('org-1', 'staff')

    def test_a_hidden_builtin_is_not_offered(self):
        keys = {f['key'] for f in self._forms(['reimbursement'])}
        assert 'reimbursement' not in keys
        assert 'incident' in keys        # the rest are untouched

    def test_nothing_hidden_offers_them_all(self):
        from services.sis_forms_service import FORM_TYPES
        assert {f['key'] for f in self._forms([])} == set(FORM_TYPES)


class TestBuiltinForms:
    def test_lists_every_builtin_with_its_state(self):
        from services.sis_forms_service import FORM_TYPES
        with patch.object(svc, 'hidden_builtin_keys', return_value=['reimbursement']):
            rows = svc.builtin_forms('org-1', 'staff')
        assert len(rows) == len(FORM_TYPES)
        by_key = {r['key']: r for r in rows}
        assert by_key['reimbursement']['hidden'] is True
        assert by_key['incident']['hidden'] is False
        assert by_key['incident']['name'] == 'Incident report'


class TestSetHidden:
    def test_adds_the_key_without_dropping_other_settings(self):
        captured = []
        client = _org_client({'sis_enabled': True, 'sis_settings': {'first_day_of_school': '2026-08-25'}},
                             captured)
        with patch.object(svc, '_admin', return_value=client):
            assert svc.set_builtin_hidden('org-1', 'reimbursement', True) == ['reimbursement']
        saved = captured[0]['feature_flags']
        assert saved['sis_enabled'] is True
        assert saved['sis_settings']['first_day_of_school'] == '2026-08-25'
        assert saved['sis_settings']['hidden_form_types'] == ['reimbursement']

    def test_showing_it_again_removes_the_key(self):
        captured = []
        client = _org_client({'sis_settings': {'hidden_form_types': ['reimbursement', 'injury']}},
                             captured)
        with patch.object(svc, '_admin', return_value=client):
            assert svc.set_builtin_hidden('org-1', 'reimbursement', False) == ['injury']

    def test_hiding_twice_does_not_duplicate(self):
        captured = []
        client = _org_client({'sis_settings': {'hidden_form_types': ['reimbursement']}}, captured)
        with patch.object(svc, '_admin', return_value=client):
            assert svc.set_builtin_hidden('org-1', 'reimbursement', True) == ['reimbursement']

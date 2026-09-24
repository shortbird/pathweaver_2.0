"""The registration funnel asks about the family directory and carpooling.

Tanner, 2026-09-24: "add a carpool question to the icreate registration
funnel, along with the directory opt-out. directory should be opt-in by
default." The carpool flag had one way in -- a checkbox on the directory page
that only a listed family ever saw -- so 96 of iCreate's 100 families read as
"no" without having been asked (ticket 1a54e05a, Katrine Myers wanting to see
who might carpool).

Two built-in questions on the details step, asked only where the school runs
the directory (the community module). The answers land on the household with
the same write Family Settings uses, so an opt-out is recorded explicitly and
outlasts the school's listed-by-default setting.
"""
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

import routes.registration_funnel as funnel

REG = {'id': 'reg-1', 'organization_id': 'org-1', 'parent_user_id': 'parent-1',
       'access_token': 'tok', 'kids': [], 'status': 'details'}


@pytest.fixture
def client():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(funnel.bp)
    return app.test_client()


def _submit(client, answers, *, community=True, sync_raises=None):
    admin = MagicMock()
    set_opt_in = MagicMock(return_value={'opted_in': True})
    if sync_raises:
        set_opt_in.side_effect = sync_raises
    with patch.object(funnel, '_load_registration', return_value=dict(REG)), \
         patch.object(funnel, '_authz', return_value=True), \
         patch.object(funnel, '_admin', return_value=admin), \
         patch.object(funnel, '_org_config', return_value={'emergency_contacts': False, 'questions': []}), \
         patch.object(funnel, 'module_enabled', return_value=community), \
         patch.object(funnel.emergency_contacts, 'replace_for_students'), \
         patch.object(funnel, '_sync_household_payment'), \
         patch('services.sis_parent_service.set_directory_opt_in', set_opt_in):
        resp = client.post(f"/api/registration/registrations/{REG['id']}/details",
                           json={'access_token': 'tok', 'answers': answers})
    saved = admin.table.return_value.update.call_args.args[0]
    return resp, saved, set_opt_in


@pytest.mark.unit
class TestTheDetailsStepRecordsTheDirectoryAnswers:
    def test_a_listed_family_open_to_carpooling_is_written_to_the_household(self, client):
        resp, saved, set_opt_in = _submit(client, {'directory_listed': True, 'carpool_interest': True})
        assert resp.status_code == 200, resp.get_json()
        set_opt_in.assert_called_once_with('parent-1', 'org-1', True,
                                           shares={'carpool_interest': True})
        # And kept on the registration, where the answers report reads them.
        assert saved['answers']['directory_listed'] is True
        assert saved['answers']['carpool_interest'] is True

    def test_opting_out_is_recorded_as_an_opt_out(self, client):
        resp, saved, set_opt_in = _submit(client, {'directory_listed': False, 'carpool_interest': False})
        assert resp.status_code == 200
        set_opt_in.assert_called_once_with('parent-1', 'org-1', False,
                                           shares={'carpool_interest': False})
        assert saved['answers']['directory_listed'] is False

    def test_no_answer_changes_nothing_on_the_family(self, client):
        # An older page, or a family re-submitting a step it never saw these on.
        resp, saved, set_opt_in = _submit(client, {})
        assert resp.status_code == 200
        set_opt_in.assert_not_called()
        assert 'directory_listed' not in saved['answers']

    @pytest.mark.parametrize('junk', ['yes', 1, None, 'false'])
    def test_only_a_real_true_or_false_counts(self, client, junk):
        _resp, saved, set_opt_in = _submit(client, {'directory_listed': junk, 'carpool_interest': junk})
        set_opt_in.assert_not_called()
        assert 'directory_listed' not in saved['answers']

    def test_a_school_without_the_directory_ignores_the_answers(self, client):
        _resp, saved, set_opt_in = _submit(client, {'directory_listed': True, 'carpool_interest': True},
                                           community=False)
        set_opt_in.assert_not_called()
        assert 'carpool_interest' not in saved['answers']

    def test_a_carpool_answer_alone_keeps_the_family_listed(self, client):
        # Listed is the default; a carpool answer must not quietly unlist anyone.
        _resp, _saved, set_opt_in = _submit(client, {'carpool_interest': True})
        set_opt_in.assert_called_once_with('parent-1', 'org-1', True,
                                           shares={'carpool_interest': True})

    def test_a_failed_household_write_never_fails_the_registration(self, client):
        resp, _saved, _ = _submit(client, {'directory_listed': True, 'carpool_interest': True},
                                  sync_raises=RuntimeError('db down'))
        assert resp.status_code == 200


@pytest.mark.unit
class TestThePageIsToldWhetherToAsk:
    def _config(self, flags):
        org = {'id': 'org-1', 'name': 'iCreate', 'feature_flags': flags}
        with patch.object(funnel, '_org_stripe_enabled', return_value=False):
            return funnel._public_config(org, {})

    def test_asked_where_the_school_runs_the_directory(self):
        assert self._config({'sis_enabled': True, 'sis_settings': {'community_enabled': True}})[
            'directory_questions'] is True

    def test_not_asked_where_it_does_not(self):
        assert self._config({'sis_enabled': True, 'sis_settings': {}})['directory_questions'] is False

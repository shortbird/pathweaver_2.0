"""
Where a form goes when nobody has said where it goes.

iCreate, 2026-08-21: "Can we set up the forms so that they automatically go to
the appropriate person? For example, substitute requests from the teachers could
just be set up to go right to Julia. Otherwise they come to us first?"

Until now every submission landed unassigned in one queue and waited for an
admin to route it by hand — a hundred and fifty forms a term through one person
whose job is not to be a switchboard. A rule per form type fixes that, and the
rules that matter here are the ones about who WINS:

  * a rule assigns an unassigned submission, and notifies that person;
  * a person who named an assignee always beats the rule;
  * routing decides who OWNS a form, never who can see it — the office queue
    still holds it, and it can still be reassigned afterwards.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_forms_service as forms

ORG = 'org-1'
TEACHER = 'teacher-1'
JULIA = 'julia-1'


def _org_client(flags, inserted, updates=None):
    """Admin client covering both tables submit() touches: the org row it reads
    the rules from, and the submissions table it writes to. `updates` collects
    what was written back to the org row."""
    client = Mock()

    def _table(name):
        t = Mock()
        for chained in ('select', 'eq', 'limit', 'order', 'neq'):
            getattr(t, chained).return_value = t
        if name == 'organizations':
            def _update(fields):
                if updates is not None:
                    updates.append(fields)
                return t
            t.update.side_effect = _update
            t.execute.return_value = Mock(data=[{'feature_flags': flags}])
            return t
        t.update.return_value = t

        def _insert(fields):
            inserted.append(fields)
            t.execute.return_value = Mock(data=[{**fields, 'id': 'sub-1'}])
            return t
        t.insert.side_effect = _insert
        return t

    client.table.side_effect = _table
    return client


def _submit(flags, data, allow_assign=False, submitter=TEACHER, template=None):
    """`template` is the org-defined form for this key, if any — submit() looks
    for one before falling back to the built-in types."""
    inserted, notices = [], []
    with patch.object(forms, '_admin', return_value=_org_client(flags, inserted)), \
         patch('services.sis_form_template_service.get_template', return_value=template), \
         patch.object(forms.sis_service, 'org_admin_ids', return_value=['office-1']), \
         patch.object(forms.sis_notifications, 'notify',
                      side_effect=lambda uid, title, body, **kw: notices.append((uid, title))):
        result = forms.submit(ORG, submitter, data, allow_assign=allow_assign)
    return result, (inserted[0] if inserted else {}), notices


RULE = {'sis_settings': {'form_routing': {'substitute_request': JULIA}}}
SUB_REQUEST = {'form_type': 'substitute_request', 'body': 'Out Thursday, need cover'}


@pytest.mark.unit
class TestReadingTheRules:

    def test_a_school_with_no_rules_routes_nothing(self):
        with patch.object(forms, '_admin', return_value=_org_client({}, [])):
            assert forms.routing(ORG) == {}

    def test_a_rule_for_a_form_type_that_no_longer_exists_is_ignored(self):
        """Retiring a type must not leave a rule nobody can see or delete."""
        flags = {'sis_settings': {'form_routing': {'gone_away': JULIA,
                                                   'substitute_request': JULIA}}}
        with patch.object(forms, '_admin', return_value=_org_client(flags, [])):
            assert forms.routing(ORG) == {'substitute_request': JULIA}

    def test_an_empty_assignee_is_not_a_rule(self):
        flags = {'sis_settings': {'form_routing': {'substitute_request': ''}}}
        with patch.object(forms, '_admin', return_value=_org_client(flags, [])):
            assert forms.routing(ORG) == {}


@pytest.mark.unit
class TestSavingTheRules:

    def _save(self, rules, existing=None):
        updates = []
        client = _org_client(existing if existing is not None else {}, [], updates)
        with patch.object(forms, '_admin', return_value=client):
            return forms.set_routing(ORG, rules), updates

    def test_an_unknown_form_type_is_refused(self):
        result, _ = self._save({'not_a_form': JULIA})
        assert 'error' in result

    def test_a_blank_choice_clears_that_rule(self):
        result, _ = self._save({'substitute_request': ''})
        assert result['routing'] == {}

    def test_the_rest_of_the_org_settings_survive(self):
        """feature_flags carries everything else the school has configured."""
        existing = {'sis_settings': {'first_day_of_school': '2026-08-24'}, 'other': True}
        result, updates = self._save({'substitute_request': JULIA}, existing)
        assert result['routing'] == {'substitute_request': JULIA}
        written = updates[0]['feature_flags']
        assert written['other'] is True
        assert written['sis_settings']['first_day_of_school'] == '2026-08-24'
        assert written['sis_settings']['form_routing'] == {'substitute_request': JULIA}


@pytest.mark.unit
class TestWhatHappensWhenAFormIsFiled:

    def test_a_routed_form_arrives_already_assigned(self):
        _, row, notices = _submit(RULE, SUB_REQUEST)
        assert row['assigned_to'] == JULIA
        assert (JULIA, 'New task assigned to you') in notices

    def test_an_unrouted_type_still_comes_to_the_office(self):
        _, row, _ = _submit(RULE, {'form_type': 'maintenance', 'body': 'Printer jammed'})
        assert row.get('assigned_to') is None

    def test_the_office_still_hears_about_a_routed_form(self):
        """Routing decides who owns it, not who can see it — the queue is the
        office's, and a form that vanished from it would be worse than one that
        waited in it."""
        _, _, notices = _submit(RULE, SUB_REQUEST)
        assert any(uid == 'office-1' for uid, _ in notices)

    def test_naming_an_assignee_beats_the_rule(self):
        """An admin filing a task for a specific person means that person."""
        _, row, _ = _submit(RULE, {**SUB_REQUEST, 'assigned_to': 'kate-1'}, allow_assign=True)
        assert row['assigned_to'] == 'kate-1'

    def test_a_school_with_no_rules_behaves_exactly_as_before(self):
        _, row, _ = _submit({}, SUB_REQUEST)
        assert row.get('assigned_to') is None

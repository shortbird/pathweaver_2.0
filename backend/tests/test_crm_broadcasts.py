"""
Mail merge from /admin/crm/lists: the variables each person gets, the
rendering, who is skipped, and the send recording one row per person.
"""
from unittest.mock import patch

import pytest

from services import crm_broadcast_service as merge
from tests.crm_fakes import make_world

ADMIN = 'admin-1'


def _users():
    return [
        {'id': ADMIN, 'email': 'tanner@optio.test', 'first_name': 'Tanner', 'last_name': 'B',
         'role': 'superadmin', 'organization_id': None, 'deletion_status': 'none'},
        {'id': 'a1', 'email': 'Pat@school.test', 'first_name': 'Pat', 'last_name': 'Lee',
         'role': 'org_managed', 'org_roles': ['parent', 'org_admin'], 'is_org_admin': True,
         'organization_id': 'org-a', 'deletion_status': 'none'},
        {'id': 'a2', 'email': 'sam@other.test', 'first_name': 'Sam', 'last_name': 'Ng',
         'role': 'org_managed', 'org_role': 'org_admin', 'is_org_admin': True,
         'organization_id': 'org-b', 'deletion_status': 'none'},
        {'id': 'k1', 'email': None, 'first_name': 'Ava', 'last_name': 'Lee',
         'role': 'org_managed', 'org_role': 'student', 'organization_id': 'org-a'},
        {'id': 'k2', 'email': 'max@school.test', 'first_name': 'Max', 'last_name': 'Lee',
         'role': 'org_managed', 'org_role': 'student', 'organization_id': 'org-a'},
        {'id': 'k3', 'email': None, 'first_name': 'Gone', 'last_name': 'Kid',
         'role': 'org_managed', 'org_role': 'student', 'organization_id': 'org-a',
         'deletion_status': 'pending'},
        {'id': 'p9', 'email': 'solo@gmail.test', 'first_name': '', 'last_name': '',
         'display_name': 'Solo Parent', 'role': 'parent', 'organization_id': None},
    ]


def _ctx(sheet=None):
    return merge.MergeContext(
        users=_users(),
        classes_by_student={'k1': {'c-robot'}, 'k2': {'c-art', 'c-robot'}},
        guardians={'k1': {'a1'}, 'k2': {'a1'}},
        class_names={'c-robot': 'Robotics', 'c-art': 'Art'},
        org_names={'org-a': 'Horizon', 'org-b': 'Gryffin'},
        sheet=merge.clean_sheet(sheet or {}),
    )


@pytest.mark.unit
class TestVariables:
    def test_family_values(self):
        v = _ctx().variables('a1')
        assert v['first_name'] == 'Pat'
        assert v['school'] == 'Horizon'
        assert v['children'] == 'Ava Lee and Max Lee'
        assert v['children_first_names'] == 'Ava and Max'
        assert v['child_count'] == '2'
        assert v['classes'] == 'Art and Robotics'
        assert v['roles'] == 'school admin and parent'

    def test_school_sheet_counts_live_students_and_formats_money(self):
        v = _ctx({'month': '2026-11', 'schools': {
            'org-a': {'price_per_student': '25', 'amount_due': '50'}}}).variables('a1')
        # k3 is being deleted, so the roster is two.
        assert v['student_count'] == '2'
        assert v['student_list'] == 'Ava Lee and Max Lee'
        assert v['price_per_student'] == '$25.00'
        assert v['amount_due'] == '$50.00'
        assert v['billing_month'] == 'November 2026'

    def test_typed_count_and_custom_column_win(self):
        sheet = {'columns': [{'key': 'term', 'label': 'Term'}],
                 'schools': {'org-a': {'student_count': '30', 'amount_due': 'waived', 'term': 'Fall'}}}
        v = _ctx(sheet).variables('a1')
        assert v['student_count'] == '30'
        assert v['amount_due'] == 'waived'
        assert v['term'] == 'Fall'

    def test_no_school_means_blank_billing(self):
        v = _ctx({'schools': {'org-a': {'amount_due': '50'}}}).variables('p9')
        assert v['first_name'] == 'Solo'
        assert v['amount_due'] == ''
        assert v['student_count'] == ''

    def test_column_may_not_shadow_a_variable(self):
        with pytest.raises(merge.BroadcastError):
            merge.clean_sheet({'columns': [{'key': 'amount_due'}]})
        with pytest.raises(merge.BroadcastError):
            merge.clean_sheet({'columns': [{'key': 'Bad Key'}]})

    def test_money(self):
        assert merge.format_money('1250') == '$1,250.00'
        assert merge.format_money('$1,250.5') == '$1,250.50'
        assert merge.format_money('') == ''
        assert merge.format_money('TBD') == 'TBD'


@pytest.mark.unit
class TestRender:
    def test_values_are_escaped_and_unknown_tokens_reported(self):
        out = merge.render('Hi {{ first_name }}', 'Dear {{first_name}},\n\nYou owe {{amount_due}}. {{typo}}\nhttps://optio.test/pay',
                           {'first_name': '<b>Pat</b>', 'amount_due': ''})
        assert out['subject'] == 'Hi <b>Pat</b>'
        assert '&lt;b&gt;Pat&lt;/b&gt;' in out['html']
        assert '<b>Pat' not in out['html']
        assert out['unknown'] == ['typo']
        assert out['blank'] == ['amount_due']
        assert '<a href="https://optio.test/pay"' in out['html']
        assert out['html'].count('<p ') == 2

    def test_body_markup_is_text(self):
        out = merge.render('s', '<script>x</script>', {})
        assert '<script>' not in out['html']


@pytest.mark.unit
class TestPlan:
    def test_dedupes_and_skips_with_reasons(self):
        users = {u['id']: u for u in _users()}
        users['dup'] = {**users['a1'], 'id': 'dup', 'email': 'pat@school.test'}
        users['del'] = {**users['a2'], 'id': 'del', 'email': 'd@x.test', 'deletion_status': 'pending'}
        rows = merge.plan_recipients(['a1', 'dup', 'a2', 'k1', 'del', 'missing'], users,
                                     suppressed={'sam@other.test'}, include_suppressed=False)
        assert [(r['email'], r['status']) for r in rows] == [
            ('pat@school.test', 'queued'), ('sam@other.test', 'skipped'), ('d@x.test', 'skipped')]
        rows = merge.plan_recipients(['a2'], users, {'sam@other.test'}, include_suppressed=True)
        assert rows[0]['status'] == 'queued'


def _call(app, view, *args, json=None, method='GET'):
    from routes.admin import crm_broadcasts
    with app.test_request_context(json=json, method=method):
        resp = getattr(crm_broadcasts, view).__wrapped__(ADMIN, *args)
    if isinstance(resp, tuple):
        return resp[0].get_json(), resp[1]
    return resp.get_json(), 200


@pytest.fixture
def world():
    w = make_world()
    w.data.update({
        'users': _users(), 'class_enrollments': [], 'org_classes': [],
        'organizations': [{'id': 'org-a', 'name': 'Horizon'}, {'id': 'org-b', 'name': 'Gryffin'}],
        'crm_suppressions': [{'id': 's1', 'email': 'sam@other.test'}],
        'crm_broadcasts': [], 'crm_broadcast_recipients': [],
    })
    with patch('routes.admin.crm_broadcasts._db', return_value=w), \
         patch('routes.admin.crm_broadcasts.guardians_by_student', return_value={'k1': {'a1'}}), \
         patch('routes.admin.crm_broadcasts._audit'):
        yield w


DRAFT = {'subject': 'Your {{billing_month}} bill', 'body': 'Hi {{first_name}}, {{student_count}} students: {{amount_due}}.',
         'recipient_ids': ['a1', 'a2'],
         'sheet': {'month': '2026-11', 'schools': {'org-a': {'amount_due': '50'}}}}


@pytest.mark.unit
class TestRoutes:
    def test_preview_renders_one_person_and_summarizes(self, app, world):
        body, status = _call(app, 'preview', method='POST', json=DRAFT)
        assert status == 200
        assert body['preview']['subject'] == 'Your November 2026 bill'
        assert body['preview']['text'] == 'Hi Pat, 2 students: $50.00.'
        assert body['summary']['sendable'] == 1
        assert body['summary']['skipped'][0]['reason'] == 'Unsubscribed'

    def test_send_refuses_a_stale_count(self, app, world):
        body, status = _call(app, 'send', method='POST', json={**DRAFT, 'expected_count': 2})
        assert status == 409
        assert world.data['crm_broadcasts'] == []

    def test_send_records_every_person(self, app, world):
        sent = []
        with patch('services.crm_broadcast_service.start_broadcast',
                   side_effect=lambda repo, b, q, ctx, sk: merge.run_broadcast(repo, b, q, ctx, sk)), \
             patch('services.crm_broadcast_service.send_one',
                   side_effect=lambda to, r, *a, **k: sent.append((to, r['subject'])) or True):
            body, status = _call(app, 'send', method='POST', json={**DRAFT, 'expected_count': 1})
        assert status == 202
        assert sent == [('pat@school.test', 'Your November 2026 bill')]
        rows = {r['email']: r for r in world.data['crm_broadcast_recipients']}
        assert rows['pat@school.test']['status'] == 'sent'
        assert rows['sam@other.test']['status'] == 'skipped'
        b = world.data['crm_broadcasts'][0]
        assert (b['status'], b['sent_count'], b['skipped_count']) == ('sent', 1, 1)

    def test_empty_subject_is_refused(self, app, world):
        _, status = _call(app, 'preview', method='POST', json={**DRAFT, 'subject': ' '})
        assert status == 400

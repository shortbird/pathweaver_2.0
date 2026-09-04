"""
Tests for the teacher-onboarding wiring added on top of the SIS staff flow:

- create_org_teacher can auto-assign an onboarding checklist at add-time, and
  detects an existing placeholder teacher of the same name so an admin doesn't
  create a duplicate account and strand the placeholder's classes.
- find_placeholder_match only matches placeholder (never real) staff rows.
- onboarding recipient lists exclude placeholder accounts that can't log in.
"""

from unittest.mock import Mock, patch

import pytest


ORG = 'org-1'
PH_EMAIL = 'jane@icreate-staff.placeholder.optioeducation.com'


def _admin_with(responses):
    """Admin client stub: one shared table mock; each .execute() pops the next
    scripted response (mirrors test_sis_staff_link)."""
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'update', 'delete', 'insert', 'in_', 'order'):
        getattr(table, chained).return_value = table
    table.execute.side_effect = [Mock(data=d) for d in responses] + [Mock(data=[])] * 10
    return client, table


def _create_client(responses):
    """Admin stub for create_org_teacher: adds an auth.admin.create_user that
    returns a fixed new user id."""
    client, table = _admin_with(responses)
    client.auth.admin.create_user.return_value = Mock(user=Mock(id='new-1'))
    return client, table


@pytest.mark.unit
class TestCreateTeacherOnboarding:
    def test_assigns_onboarding_template_when_provided(self):
        from services import sis_service
        client, table = _create_client([[], []])  # dup-email check, profile insert
        with patch('services.sis_service.get_supabase_admin_client', return_value=client), \
             patch('services.sis_service.find_placeholder_match', return_value=None), \
             patch('services.sis_service.send_staff_invite', return_value=True), \
             patch('services.sis_onboarding_service.assign',
                   return_value={'assignment': {'id': 'a1'}}) as assign:
            result = sis_service.create_org_teacher(
                ORG, {'first_name': 'Jane', 'last_name': 'Doe', 'email': 'jane@real.com',
                      'onboarding_template_id': 'tmpl-1'},
                actor_id='admin-1')
        assert result['teacher']['id'] == 'new-1'
        assert result['onboarding_assigned'] is True
        assign.assert_called_once_with(ORG, 'tmpl-1', 'new-1', assigned_by='admin-1')

    def test_no_template_skips_onboarding(self):
        from services import sis_service
        client, table = _create_client([[], []])
        with patch('services.sis_service.get_supabase_admin_client', return_value=client), \
             patch('services.sis_service.find_placeholder_match', return_value=None), \
             patch('services.sis_service.send_staff_invite', return_value=True), \
             patch('services.sis_onboarding_service.assign') as assign:
            result = sis_service.create_org_teacher(
                ORG, {'first_name': 'Jane', 'last_name': 'Doe', 'email': 'jane@real.com'},
                actor_id='admin-1')
        assert result['onboarding_assigned'] is False
        assign.assert_not_called()

    def test_onboarding_assign_failure_does_not_fail_creation(self):
        from services import sis_service
        client, table = _create_client([[], []])
        with patch('services.sis_service.get_supabase_admin_client', return_value=client), \
             patch('services.sis_service.find_placeholder_match', return_value=None), \
             patch('services.sis_service.send_staff_invite', return_value=True), \
             patch('services.sis_onboarding_service.assign',
                   return_value={'error': 'Template not found'}):
            result = sis_service.create_org_teacher(
                ORG, {'first_name': 'Jane', 'last_name': 'Doe', 'email': 'jane@real.com',
                      'onboarding_template_id': 'bad'},
                actor_id='admin-1')
        assert result['teacher']['id'] == 'new-1'   # account still created
        assert result['onboarding_assigned'] is False


@pytest.mark.unit
class TestCreateTeacherPlaceholderGuard:
    def test_returns_placeholder_match_without_creating(self):
        from services import sis_service
        match = {'id': 'ph-1', 'name': 'Jane Doe', 'class_count': 5}
        client, table = _create_client([[], []])
        with patch('services.sis_service.get_supabase_admin_client', return_value=client), \
             patch('services.sis_service.find_placeholder_match', return_value=match), \
             patch('services.sis_service.send_staff_invite') as invite:
            result = sis_service.create_org_teacher(
                ORG, {'first_name': 'Jane', 'last_name': 'Doe', 'email': 'jane@real.com'},
                actor_id='admin-1')
        assert result == {'placeholder_match': match}
        client.auth.admin.create_user.assert_not_called()  # no duplicate account
        invite.assert_not_called()

    def test_force_new_bypasses_placeholder_check(self):
        from services import sis_service
        client, table = _create_client([[], []])
        with patch('services.sis_service.get_supabase_admin_client', return_value=client), \
             patch('services.sis_service.find_placeholder_match') as finder, \
             patch('services.sis_service.send_staff_invite', return_value=True):
            result = sis_service.create_org_teacher(
                ORG, {'first_name': 'Jane', 'last_name': 'Doe', 'email': 'jane@real.com',
                      'force_new': True},
                actor_id='admin-1')
        assert result['teacher']['id'] == 'new-1'
        finder.assert_not_called()


@pytest.mark.unit
class TestFindPlaceholderMatch:
    def _rows_client(self, rows):
        client, table = _admin_with([rows])
        return client

    def test_matches_placeholder_by_name(self):
        from services import sis_service
        rows = [{'id': 'ph-1', 'first_name': 'Jane', 'last_name': 'Doe',
                 'display_name': 'Jane Doe', 'email': PH_EMAIL,
                 'org_role': 'advisor', 'org_roles': ['advisor']}]
        with patch('services.sis_service.get_supabase_admin_client',
                   return_value=self._rows_client(rows)), \
             patch('services.sis_service.advisor_class_ids', return_value=['c1', 'c2']):
            match = sis_service.find_placeholder_match(ORG, 'jane', 'DOE')
        assert match == {'id': 'ph-1', 'name': 'Jane Doe', 'class_count': 2}

    def test_ignores_real_email_same_name(self):
        from services import sis_service
        rows = [{'id': 'u-1', 'first_name': 'Jane', 'last_name': 'Doe',
                 'display_name': 'Jane Doe', 'email': 'jane@gmail.com',
                 'org_role': 'advisor', 'org_roles': ['advisor']}]
        with patch('services.sis_service.get_supabase_admin_client',
                   return_value=self._rows_client(rows)):
            assert sis_service.find_placeholder_match(ORG, 'Jane', 'Doe') is None

    def test_no_match_when_name_differs(self):
        from services import sis_service
        rows = [{'id': 'ph-1', 'first_name': 'Liz', 'last_name': 'Smith',
                 'display_name': 'Liz Smith', 'email': PH_EMAIL,
                 'org_role': 'advisor', 'org_roles': ['advisor']}]
        with patch('services.sis_service.get_supabase_admin_client',
                   return_value=self._rows_client(rows)):
            assert sis_service.find_placeholder_match(ORG, 'Jane', 'Doe') is None


@pytest.mark.unit
class TestAddTeacherWhoAlreadyHasAnAccount:
    """iCreate, 2026-08-05: "When I try to add a teacher who is also a parent,
    it just says a user with this email already exists but it won't let me add
    them as a teacher." One person gets one login with both roles."""

    PARENT = {'id': 'u-9', 'email': 'mom@real.com', 'role': 'org_managed',
              'org_role': 'parent', 'org_roles': ['parent'], 'organization_id': ORG,
              'is_dependent': False, 'first_name': 'Mo', 'last_name': 'Parent',
              'display_name': 'Mo Parent'}

    def test_existing_parent_is_offered_instead_of_an_error(self):
        from services import sis_service
        client, _ = _create_client([[self.PARENT]])
        with patch('services.sis_service.get_supabase_admin_client', return_value=client), \
             patch('services.sis_service.find_placeholder_match', return_value=None):
            result = sis_service.create_org_teacher(
                ORG, {'first_name': 'Mo', 'last_name': 'Parent', 'email': 'mom@real.com'})
        assert result['existing_account']['id'] == 'u-9'
        assert result['existing_account']['roles'] == ['parent']
        assert 'error' not in result
        client.auth.admin.create_user.assert_not_called()  # no second login

    def test_student_email_is_still_refused(self):
        from services import sis_service
        student = {**self.PARENT, 'org_role': 'student', 'org_roles': ['student']}
        client, _ = _create_client([[student]])
        with patch('services.sis_service.get_supabase_admin_client', return_value=client), \
             patch('services.sis_service.find_placeholder_match', return_value=None):
            result = sis_service.create_org_teacher(
                ORG, {'first_name': 'Kid', 'last_name': 'One', 'email': 'mom@real.com'})
        assert result['error'] == 'This email belongs to a student account'

    def test_account_in_another_org_is_refused(self):
        from services import sis_service
        other = {**self.PARENT, 'organization_id': 'org-2'}
        client, _ = _create_client([[other]])
        with patch('services.sis_service.get_supabase_admin_client', return_value=client), \
             patch('services.sis_service.find_placeholder_match', return_value=None):
            result = sis_service.create_org_teacher(
                ORG, {'email': 'mom@real.com'})
        assert 'another organization' in result['error']

    def test_grant_keeps_the_roles_they_already_had(self):
        from services import sis_service
        client, table = _admin_with([[self.PARENT], []])
        with patch('services.sis_service.get_supabase_admin_client', return_value=client), \
             patch('services.sis_service._org_name', return_value='iCreate'), \
             patch('services.email_service.email_service.send_staff_access_added_email',
                   return_value=True):
            result = sis_service.grant_teacher_role(ORG, 'u-9', {})
        assert result['granted'] is True
        # advisor leads (it picks the console they land in) but parent survives,
        # so the family portal still works for them.
        assert result['roles'] == ['advisor', 'parent']
        updated = table.update.call_args[0][0]
        assert updated['org_role'] == 'advisor'
        assert updated['org_roles'] == ['advisor', 'parent']

    def test_grant_refuses_someone_who_is_already_a_teacher(self):
        from services import sis_service
        teacher = {**self.PARENT, 'org_role': 'advisor', 'org_roles': ['advisor']}
        client, _ = _admin_with([[teacher]])
        with patch('services.sis_service.get_supabase_admin_client', return_value=client):
            result = sis_service.grant_teacher_role(ORG, 'u-9', {})
        assert 'already a teacher' in result['error']


@pytest.mark.unit
class TestChecklistAudience:
    """A guardian who is also staff holds both kinds of checklist. Reported
    2026-08-05: the family portal was showing the teacher onboarding."""

    def test_assign_stamps_the_template_audience(self):
        from services import sis_onboarding_service as onboarding
        template = {'id': 't1', 'organization_id': ORG, 'name': 'Family paperwork',
                    'audience': 'family', 'items': [{'key': 'i1', 'title': 'Sign'}]}
        # Reads in order: the template, then the recipient's org membership
        # (assign refuses to file a checklist into another tenant), then the insert.
        client, table = _admin_with([[template],
                                     [{'id': 'u-9', 'organization_id': ORG}],
                                     [{'id': 'a1'}]])
        with patch('services.sis_onboarding_service.get_supabase_admin_client',
                   return_value=client), \
             patch('services.sis_notifications.notify'):
            onboarding.assign(ORG, 't1', 'u-9', assigned_by='admin-1')
        assert table.insert.call_args[0][0]['audience'] == 'family'

    def test_list_filters_by_audience(self):
        from services import sis_onboarding_service as onboarding
        client, table = _admin_with([[], []])
        with patch('services.sis_onboarding_service.get_supabase_admin_client',
                   return_value=client):
            onboarding.list_assignments(ORG, user_id='u-9', audience='family')
        filters = [c[0] for c in table.eq.call_args_list]
        assert ('audience', 'family') in filters

    def test_admin_rollup_is_not_filtered(self):
        from services import sis_onboarding_service as onboarding
        client, table = _admin_with([[], []])
        with patch('services.sis_onboarding_service.get_supabase_admin_client',
                   return_value=client):
            onboarding.list_assignments(ORG)
        assert not any(c[0][0] == 'audience' for c in table.eq.call_args_list)


@pytest.mark.unit
class TestOnboardingRecipientsExcludePlaceholders:
    def test_placeholder_staff_excluded(self):
        from services import sis_onboarding_service as onboarding
        rows = [
            {'id': 'real-1', 'first_name': 'Amy', 'last_name': 'Real',
             'display_name': 'Amy Real', 'email': 'amy@real.com',
             'org_role': 'advisor', 'role': 'org_managed'},
            {'id': 'ph-1', 'first_name': 'Jane', 'last_name': 'Doe',
             'display_name': 'Jane Doe', 'email': PH_EMAIL,
             'org_role': 'advisor', 'role': 'org_managed'},
        ]
        client, _ = _admin_with([rows])
        with patch('services.sis_onboarding_service.get_supabase_admin_client',
                   return_value=client):
            people = onboarding.list_recipients(ORG, 'staff')
        ids = [p['id'] for p in people]
        assert ids == ['real-1']  # placeholder omitted (can't log in to complete it)


@pytest.mark.unit
class TestItemIdentity:
    """A template item's key is its identity for the life of the template:
    progress, uploads and signatures on an assignment are recorded against it,
    and update_item finds the row by it. The key used to fall back to the item's
    POSITION, so adding an item at the top handed the newcomer a key an existing
    item already held — and update_item takes the first match, leaving one of
    the two permanently un-completable. PR #94's reorder buttons made that easy
    to hit by accident."""

    def test_a_new_item_gets_a_unique_key(self):
        from services import sis_onboarding_service as svc
        items = svc._clean_items([{'title': 'First'}, {'title': 'Second'}])
        keys = [i['key'] for i in items]
        assert len(set(keys)) == 2
        assert all(k.startswith('item_') for k in keys)

    def test_existing_keys_survive_a_reorder(self):
        from services import sis_onboarding_service as svc
        items = svc._clean_items([
            {'key': 'item_2', 'title': 'Second'},
            {'key': 'item_1', 'title': 'First'},
        ])
        assert [i['key'] for i in items] == ['item_2', 'item_1']

    def test_a_new_item_never_collides_with_a_positional_key(self):
        """The exact break: insert a keyless item above an existing `item_1`."""
        from services import sis_onboarding_service as svc
        items = svc._clean_items([
            {'title': 'Brand new'},
            {'key': 'item_1', 'title': 'Was already here'},
        ])
        assert items[1]['key'] == 'item_1'
        assert items[0]['key'] != 'item_1'

    def test_a_duplicated_key_is_re_minted(self):
        from services import sis_onboarding_service as svc
        items = svc._clean_items([
            {'key': 'item_1', 'title': 'Original'},
            {'key': 'item_1', 'title': 'Copy'},
        ])
        assert items[0]['key'] == 'item_1'
        assert items[1]['key'] != 'item_1'


@pytest.mark.unit
class TestDuplicateTemplate:
    """Duplicating is server-side: a client re-POST cannot see blocks_access
    (the editor never loads it) and would copy document_id, which names ONE
    secure document belonging to ONE person."""

    def _src(self, **over):
        row = {
            'id': 'tmpl-1', 'organization_id': ORG, 'name': 'Employee onboarding',
            'role_type': 'employee', 'audience': 'family', 'blocks_access': True,
            'items': [{'key': 'item_1', 'title': 'Sign contract',
                       'document_id': 'doc-belonging-to-ruth'}],
        }
        row.update(over)
        return row

    def _run(self, src):
        from services import sis_onboarding_service as svc
        client, table = _admin_with([[src]])
        with patch.object(svc, '_admin', return_value=client), \
             patch.object(svc, 'list_templates', return_value=[]):
            result = svc.duplicate_template(ORG, 'tmpl-1', actor_id='admin-1')
        return result, table

    def test_the_copy_drops_the_original_document_binding(self):
        _, table = self._run(self._src())
        payload = table.insert.call_args[0][0]
        assert payload['items'][0]['document_id'] is None

    def test_the_copy_re_mints_item_keys(self):
        _, table = self._run(self._src())
        payload = table.insert.call_args[0][0]
        assert payload['items'][0]['key'] != 'item_1'

    def test_the_copy_keeps_blocks_access_and_audience(self):
        _, table = self._run(self._src())
        payload = table.insert.call_args[0][0]
        assert payload['blocks_access'] is True
        assert payload['audience'] == 'family'

    def test_the_name_steps_aside_when_a_copy_already_exists(self):
        from services import sis_onboarding_service as svc
        client, table = _admin_with([[self._src()]])
        existing = [{'name': 'Employee onboarding (Copy)'}]
        with patch.object(svc, '_admin', return_value=client), \
             patch.object(svc, 'list_templates', return_value=existing):
            svc.duplicate_template(ORG, 'tmpl-1', actor_id='admin-1')
        assert table.insert.call_args[0][0]['name'] == 'Employee onboarding (Copy) 2'

    def test_another_orgs_template_is_not_found(self):
        from services import sis_onboarding_service as svc
        client, _ = _admin_with([[self._src(organization_id='other-org')]])
        with patch.object(svc, '_admin', return_value=client):
            result = svc.duplicate_template(ORG, 'tmpl-1', actor_id='admin-1')
        assert result['status'] == 404


@pytest.mark.unit
class TestOnboardingBannerScope:
    """The teacher dashboard's onboarding banner reads the person's own STAFF
    checklist. It filtered on neither audience nor kind, so it showed whichever
    assignment was newest — iCreate saw a teacher dashboard reading "Finish your
    ALD Ordering Form Checklist", which is a FAMILY checklist belonging to the
    same person in their parent capacity, and lives in the family portal."""

    def _filters(self):
        from services import sis_staff_service as svc
        client, table = _admin_with([[{'id': 'a1', 'status': 'pending',
                                       'items': [], 'template_name': 'Employee onboarding'}]])
        with patch.object(svc, '_admin', return_value=client):
            svc.my_onboarding_summary(ORG, 'user-1')
        return {call[0][0]: call[0][1] for call in table.eq.call_args_list if len(call[0]) == 2}

    def test_it_asks_only_for_the_staff_audience(self):
        assert self._filters().get('audience') == 'staff'

    def test_it_ignores_documents_sent_for_signature(self):
        assert self._filters().get('kind') == 'checklist'


@pytest.mark.unit
class TestChecklistDirections:
    """iCreate: "Can we add a place to put directions at the top of the
    checklists?" Directions are snapshotted onto the assignment like the items,
    so editing a template never rewrites the instructions under somebody who is
    already halfway through."""

    def test_save_persists_the_directions(self):
        from services import sis_onboarding_service as svc
        client, table = _admin_with([[{'id': 't1'}]])
        with patch.object(svc, '_admin', return_value=client):
            svc.save_template(ORG, {'name': 'Employee', 'description': '  Work top to bottom.  ',
                                    'items': [{'title': 'Sign contract'}]}, actor_id='admin-1')
        assert table.insert.call_args[0][0]['description'] == 'Work top to bottom.'

    def test_blank_directions_store_as_null(self):
        from services import sis_onboarding_service as svc
        client, table = _admin_with([[{'id': 't1'}]])
        with patch.object(svc, '_admin', return_value=client):
            svc.save_template(ORG, {'name': 'Employee', 'description': '   ',
                                    'items': [{'title': 'Sign contract'}]}, actor_id='admin-1')
        assert table.insert.call_args[0][0]['description'] is None

    def test_assigning_snapshots_the_directions(self):
        from services import sis_onboarding_service as svc
        template = {'id': 't1', 'organization_id': ORG, 'name': 'Employee',
                    'description': 'Work top to bottom.', 'audience': 'staff',
                    'items': [{'key': 'item_1', 'title': 'Sign contract'}]}
        client, table = _admin_with([[template], [{'id': 'a1'}]])
        with patch.object(svc, '_admin', return_value=client), \
             patch.object(svc, 'assert_recipients_in_org'), \
             patch.object(svc, 'sis_notifications'):
            svc.assign(ORG, 't1', 'user-1', assigned_by='admin-1')
        assert table.insert.call_args[0][0]['description'] == 'Work top to bottom.'

    def test_sync_updates_directions_when_changed(self):
        from services import sis_onboarding_service as svc
        template = {'id': 't1', 'organization_id': ORG, 'name': 'Employee',
                    'description': 'Updated directions for everyone.', 'audience': 'staff',
                    'items': [{'key': 'item_1', 'title': 'Sign contract'}]}
        assignment = {'id': 'a1', 'organization_id': ORG, 'template_id': 't1', 'kind': 'checklist',
                      'description': 'Old directions.', 'status': 'in_progress',
                      'items': [{'key': 'item_1', 'title': 'Sign contract', 'status': 'pending'}]}
        client, table = _admin_with([[template], [assignment], [{'id': 'a1'}]])
        with patch.object(svc, '_admin', return_value=client):
            res = svc.sync_assignments(ORG, 't1')
        assert res['synced'] == 1
        assert table.update.call_args[0][0]['description'] == 'Updated directions for everyone.'


@pytest.mark.unit
class TestItemDocuments:
    """Ruth Stewart, teacher, could not upload her ID and her birth certificate:
    the I-9 item held exactly one file, so the second upload offered to REPLACE
    the first (b9583855). Items hold a list now, and `document_url` still carries
    the first of them so in-flight checklists and older readers keep working."""

    def test_the_legacy_single_path_still_reads(self):
        from services import sis_onboarding_service as svc
        docs = svc.item_documents({'document_url': 'org/user/a.pdf'})
        assert [d['path'] for d in docs] == ['org/user/a.pdf']

    def test_an_item_with_no_document_reads_empty(self):
        from services import sis_onboarding_service as svc
        assert svc.item_documents({'document_url': None}) == []

    def test_the_list_wins_when_both_are_present(self):
        from services import sis_onboarding_service as svc
        item = {'document_url': 'org/user/a.pdf',
                'documents': [{'path': 'org/user/a.pdf'}, {'path': 'org/user/b.pdf'}]}
        assert len(svc.item_documents(item)) == 2

    def test_setting_documents_keeps_the_legacy_field_in_step(self):
        from services import sis_onboarding_service as svc
        item = {}
        svc._set_item_documents(item, [{'path': 'org/user/a.pdf'}, {'path': 'org/user/b.pdf'}])
        assert item['document_url'] == 'org/user/a.pdf'
        assert len(item['documents']) == 2
        svc._set_item_documents(item, [])
        assert item['document_url'] is None


@pytest.mark.unit
class TestSyncAssignments:
    """Editing a template only ever changed what FUTURE people received: iCreate
    corrected the orientation quest mid-run and all 152 families kept the old
    copy (f4e1589d). Sync is the catch-up, and what it must NOT do matters more
    than what it does."""

    TEMPLATE = {
        'id': 't1', 'organization_id': ORG, 'name': 'Employee onboarding',
        'items': [
            {'key': 'k1', 'title': 'Photo ID', 'required': True, 'needs_document': True},
            {'key': 'k2', 'title': 'Signed contract', 'required': True, 'needs_signature': True},
        ],
    }

    def _sync(self, assignment_items, status='in_progress', template=None):
        from services import sis_onboarding_service as svc
        assignment = {'id': 'a1', 'organization_id': ORG, 'user_id': 'u1',
                      'status': status, 'template_id': 't1', 'kind': 'checklist',
                      'items': assignment_items}
        client, table = _admin_with([[template or self.TEMPLATE], [assignment]])
        saved = {}
        with patch.object(svc, '_admin', return_value=client), \
             patch.object(svc, '_save_items',
                          side_effect=lambda a, items, *args, **kwargs: saved.update(items=items) or a):
            result = svc.sync_assignments(ORG, 't1')
        return result, saved.get('items')

    def test_a_new_template_item_arrives_pending(self):
        result, items = self._sync([
            {'key': 'k1', 'title': 'Photo ID', 'status': 'complete'},
        ])
        assert result['added'] == 1
        new = next(i for i in items if i['key'] == 'k2')
        assert new['status'] == 'pending'
        assert new['signature'] is None

    def test_completed_work_is_never_touched(self):
        _, items = self._sync([
            {'key': 'k1', 'title': 'Old wording', 'status': 'complete',
             'document_url': 'org/u1/id.pdf', 'submitted_at': '2026-08-01T00:00:00Z'},
        ])
        done = next(i for i in items if i['key'] == 'k1')
        assert done['status'] == 'complete'
        assert done['document_url'] == 'org/u1/id.pdf'
        assert done['submitted_at'] == '2026-08-01T00:00:00Z'

    def test_wording_is_corrected_even_on_a_finished_item(self):
        _, items = self._sync([
            {'key': 'k1', 'title': 'Old wording', 'status': 'complete'},
        ])
        assert next(i for i in items if i['key'] == 'k1')['title'] == 'Photo ID'

    def test_the_rules_on_a_finished_item_are_left_alone(self):
        """Flipping needs_signature under a completed item would make it
        complete and impossible to complete at the same time."""
        _, items = self._sync([
            {'key': 'k2', 'title': 'Signed contract', 'status': 'complete',
             'needs_signature': False, 'signature': None},
        ])
        assert next(i for i in items if i['key'] == 'k2')['needs_signature'] is False

    def test_a_pending_item_the_template_dropped_disappears(self):
        result, items = self._sync([
            {'key': 'k1', 'title': 'Photo ID', 'status': 'pending'},
            {'key': 'k2', 'title': 'Signed contract', 'status': 'pending'},
            {'key': 'gone', 'title': 'Retired step', 'status': 'pending'},
        ])
        assert result['removed'] == 1
        assert not [i for i in items if i['key'] == 'gone']

    def test_a_dropped_item_someone_worked_on_survives(self):
        result, items = self._sync([
            {'key': 'k1', 'title': 'Photo ID', 'status': 'pending'},
            {'key': 'k2', 'title': 'Signed contract', 'status': 'pending'},
            {'key': 'gone', 'title': 'Retired step', 'status': 'pending',
             'document_url': 'org/u1/scan.pdf'},
        ])
        assert result['removed'] == 0
        assert [i for i in items if i['key'] == 'gone']

    def test_a_finished_checklist_is_skipped_and_counted(self):
        result, items = self._sync([{'key': 'k1', 'title': 'Photo ID', 'status': 'complete'}],
                                   status='complete')
        assert result['skipped_complete'] == 1
        assert result['synced'] == 0
        assert items is None

    def test_a_checklist_that_already_matches_is_not_rewritten(self):
        result, items = self._sync([
            {'key': 'k1', 'title': 'Photo ID', 'required': True,
             'needs_document': True, 'needs_signature': None, 'needs_approval': None,
             'description': None, 'link': None, 'due_date': None, 'document_id': None,
             'status': 'pending'},
            {'key': 'k2', 'title': 'Signed contract', 'required': True,
             'needs_signature': True, 'needs_document': None, 'needs_approval': None,
             'description': None, 'link': None, 'due_date': None, 'document_id': None,
             'status': 'pending'},
        ])
        assert result['synced'] == 0
        assert items is None

    def test_another_orgs_template_is_not_found(self):
        from services import sis_onboarding_service as svc
        client, _ = _admin_with([[{**self.TEMPLATE, 'organization_id': 'other'}]])
        with patch.object(svc, '_admin', return_value=client):
            assert svc.sync_assignments(ORG, 't1')['status'] == 404


@pytest.mark.unit
class TestChecklistDocumentsForTheCabinet:
    """The office looked in /secure-documents for a background check that was
    uploaded to a checklist item and filed one tab over (iCreate, 2026-08-31).
    checklist_documents reads every attachment back shaped like a store row so
    the cabinet can list them; source/audience tell the frontend it opens
    through the admin onboarding door and cannot be renamed or deleted there."""

    def test_shapes_attachments_like_document_rows(self):
        from services import sis_onboarding_service as svc
        rows = [{
            'id': 'a1', 'user_id': 'cassea', 'audience': 'staff',
            'items': [
                {'key': 'bgcheck', 'title': 'Background Check',
                 'documents': [{'path': 'org-1/cassea/bg.pdf', 'filename': None,
                                'uploaded_at': '2026-08-25T01:46:11+00:00'}]},
                {'key': 'w4', 'title': 'W4', 'documents': []},
            ],
        }]
        with patch.object(svc, 'fetch_all_rows', return_value=rows):
            out = svc.checklist_documents('org-1')
        assert len(out) == 1
        doc = out[0]
        assert doc['source'] == 'checklist'
        assert doc['audience'] == 'staff'
        assert doc['owner_user_id'] == 'cassea'
        assert doc['uploaded_by_owner'] is True
        assert doc['storage_path'] == 'org-1/cassea/bg.pdf'
        # No filename recorded, so the item's title names the row.
        assert doc['title'] == 'Background Check'
        assert doc['created_at'] == '2026-08-25T01:46:11+00:00'

    def test_reads_legacy_single_path_items_too(self):
        from services import sis_onboarding_service as svc
        rows = [{'id': 'a1', 'user_id': 'u1', 'audience': 'family',
                 'items': [{'key': 'k', 'title': 'Custody order',
                            'document_url': 'org-1/u1/c.pdf'}]}]
        with patch.object(svc, 'fetch_all_rows', return_value=rows):
            out = svc.checklist_documents('org-1')
        assert [d['storage_path'] for d in out] == ['org-1/u1/c.pdf']
        assert out[0]['audience'] == 'family'

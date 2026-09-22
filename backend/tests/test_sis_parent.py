"""
Unit tests for SIS parent self-service authorization (sis_parent_service).

The security-critical property: a guardian may only register students in their own
family, and only in SIS-enabled orgs. registerable_students drives every check, so
it gets a filter-aware fake DB; the lifecycle helpers are tested by patching it.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_parent_service as parent


class _Query:
    """Records select/eq/in_ filters so the resolver can branch on them."""
    def __init__(self, table, resolver):
        self._table = table
        self._resolver = resolver
        self._eq = {}
        self._in = {}

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._eq[col] = val
        return self

    def in_(self, col, vals):
        self._in[col] = vals
        return self

    def order(self, *_a, **_k):
        return self

    # `.not_.is_('organization_id', 'null')` — a filter the resolvers below
    # don't branch on, so it only has to chain.
    @property
    def not_(self):
        return self

    def is_(self, *_a, **_k):
        return self

    def execute(self):
        return Mock(data=self._resolver(self._table, self._eq, self._in))


def _fake_admin(resolver):
    client = Mock()
    client.table.side_effect = lambda name: _Query(name, resolver)
    return client


# A guardian 'g1' shares household 'h1' (org 'org1') with student 'stu1'.
def _resolver(table, eq, in_):
    if table == 'household_members':
        if eq.get('user_id') == 'g1':
            return [{'household_id': 'h1', 'relationship': 'guardian'}]
        if eq.get('relationship') == 'student' and 'h1' in (in_.get('household_id') or []):
            return [{'user_id': 'stu1', 'household_id': 'h1', 'relationship': 'student'}]
        return []
    if table == 'households':
        return [{'id': 'h1', 'organization_id': 'org1'}]
    if table == 'users':
        if eq.get('managed_by_parent_id') == 'g1':
            return []  # no dependent-account children
        if 'stu1' in (in_.get('id') or []):
            return [{'id': 'stu1', 'display_name': 'Stu One'}]
        return []
    if table == 'organizations':
        return [{'id': 'org1', 'name': 'Micro School'}]
    return []


# A guardian 'g2' has no household at all — they and student 'stu2' are linked
# accounts, which is how Optio Academy families are built.
def _linked_resolver(table, eq, in_):
    if table == 'household_members':
        return []
    if table == 'parent_student_links':
        if eq.get('parent_user_id') == 'g2' and eq.get('status') == 'approved':
            return [{'student_user_id': 'stu2'}]
        return []
    if table == 'users':
        if eq.get('managed_by_parent_id'):
            return []
        if 'stu2' in (in_.get('id') or []):
            return [{'id': 'stu2', 'organization_id': 'org1', 'display_name': 'Stu Two'}]
        return []
    if table == 'organizations':
        return [{'id': 'org1', 'name': 'Optio Academy'}]
    return []


@pytest.mark.unit
class TestRegisterableStudents:
    def test_household_student_is_registerable_when_sis_enabled(self):
        with patch('services.sis_parent_service._admin',
                   return_value=_fake_admin(_resolver)), \
             patch('services.sis_parent_service.org_has_feature', return_value=True):
            students = parent.registerable_students('g1')
        assert len(students) == 1
        assert students[0]['student_id'] == 'stu1'
        assert students[0]['org_id'] == 'org1'
        assert students[0]['name'] == 'Stu One'

    def test_excluded_when_org_not_sis_enabled(self):
        with patch('services.sis_parent_service._admin',
                   return_value=_fake_admin(_resolver)), \
             patch('services.sis_parent_service.org_has_feature', return_value=False):
            assert parent.registerable_students('g1') == []

    def test_non_guardian_has_no_students(self):
        with patch('services.sis_parent_service._admin',
                   return_value=_fake_admin(_resolver)), \
             patch('services.sis_parent_service.org_has_feature', return_value=True):
            assert parent.registerable_students('stranger') == []

    def test_approved_link_makes_a_guardian_without_a_household(self):
        with patch('services.sis_parent_service._admin',
                   return_value=_fake_admin(_linked_resolver)), \
             patch('services.sis_parent_service.org_has_feature', return_value=True):
            students = parent.registerable_students('g2')
        assert len(students) == 1
        assert students[0]['student_id'] == 'stu2'
        assert students[0]['org_id'] == 'org1'
        assert students[0]['household_id'] is None

    def test_pending_link_is_not_a_guardian(self):
        def pending(table, eq, in_):
            # Same family, but the link was never approved.
            if table == 'parent_student_links':
                return []
            return _linked_resolver(table, eq, in_)

        with patch('services.sis_parent_service._admin',
                   return_value=_fake_admin(pending)), \
             patch('services.sis_parent_service.org_has_feature', return_value=True):
            assert parent.registerable_students('g2') == []

    def test_context_groups_students_by_org(self):
        with patch('services.sis_parent_service._admin',
                   return_value=_fake_admin(_resolver)), \
             patch('services.sis_parent_service.org_has_feature', return_value=True):
            ctx = parent.context('g1')
        assert len(ctx['orgs']) == 1
        assert ctx['orgs'][0]['organization_name'] == 'Micro School'
        assert ctx['orgs'][0]['students'][0]['student_id'] == 'stu1'


@pytest.mark.unit
class TestLifecycleAuthorization:
    _MINE = [{'student_id': 'stu1', 'org_id': 'org1', 'household_id': 'h1', 'name': 'Stu One'}]

    def test_cannot_register_someone_elses_child(self):
        with patch('services.sis_parent_service.registerable_students', return_value=self._MINE):
            result = parent.create_registration('g1', 'org1', 'not-my-kid')
        assert result.get('error')

    def test_can_register_own_child(self):
        with patch('services.sis_parent_service.registerable_students', return_value=self._MINE), \
             patch('services.sis_parent_service.regs.create_registration',
                   return_value={'id': 'reg1'}) as create:
            result = parent.create_registration('g1', 'org1', 'stu1')
        assert result['registration']['id'] == 'reg1'
        create.assert_called_once_with('org1', 'stu1', guardian_user_id='g1')

    def test_add_item_rejects_unowned_registration(self):
        with patch('services.sis_parent_service.regs.get_registration',
                   return_value={'id': 'reg1', 'guardian_user_id': 'someone-else', 'status': 'draft'}):
            result = parent.add_item('g1', 'org1', 'reg1', 'class1')
        assert result['error'] == 'Registration not found'

    def test_add_item_rejects_class_not_open(self):
        with patch('services.sis_parent_service.regs.get_registration',
                   return_value={'id': 'reg1', 'guardian_user_id': 'g1', 'status': 'in_progress'}), \
             patch('services.sis_parent_service._family_gate', return_value=None), \
             patch('services.sis_parent_service.open_classes', return_value=[{'id': 'open-class'}]):
            result = parent.add_item('g1', 'org1', 'reg1', 'closed-class')
        assert result['error'] == 'This class is not open for registration'

    def test_add_item_allows_open_class_on_owned_registration(self):
        with patch('services.sis_parent_service.regs.get_registration',
                   return_value={'id': 'reg1', 'guardian_user_id': 'g1', 'status': 'in_progress'}), \
             patch('services.sis_parent_service._family_gate', return_value=None), \
             patch('services.sis_parent_service.open_classes', return_value=[{'id': 'class1'}]), \
             patch('services.sis_parent_service.regs.add_item',
                   return_value={'item': {'id': 'it1'}, 'evaluation': {}}) as add:
            result = parent.add_item('g1', 'org1', 'reg1', 'class1')
        assert result['item']['id'] == 'it1'
        add.assert_called_once_with('org1', 'reg1', 'class1')

    def test_submit_requires_items(self):
        with patch('services.sis_parent_service.regs.get_registration',
                   return_value={'id': 'reg1', 'guardian_user_id': 'g1', 'status': 'in_progress', 'items': []}):
            result = parent.submit('g1', 'org1', 'reg1')
        assert result.get('error')


@pytest.mark.unit
class TestCreateAbsencesMultiChild:
    """One report can cover several siblings. Each child is authorized and
    written independently, so a duplicate or an unauthorized id in the batch
    never blocks the siblings that are fine."""

    @staticmethod
    def _row(org_id, sid, **kw):
        return {'absence': {'id': f'abs-{sid}', 'student_user_id': sid,
                            'organization_id': org_id, **kw}}

    def _run(self, student_ids, can=lambda sid: True, create=None):
        create = create or (lambda org_id, sid, **kw: self._row(org_id, sid))
        with patch.object(parent, '_can_register',
                          side_effect=lambda _u, _o, sid: can(sid)), \
             patch.object(parent.absences, 'create',
                          side_effect=create) as create_mock:
            result = parent.create_absences('g1', 'org1', student_ids,
                                            '2026-09-01', class_id=None,
                                            reason='trip')
        return result, create_mock

    def test_creates_one_row_per_child(self):
        result, create = self._run(['stu1', 'stu2'])
        assert [a['student_user_id'] for a in result['absences']] == ['stu1', 'stu2']
        assert result['errors'] == {}
        assert create.call_count == 2
        _, kwargs = create.call_args
        assert kwargs['reported_by'] == 'g1'
        assert kwargs['absence_date'] == '2026-09-01'

    def test_unauthorized_child_fails_alone_not_the_batch(self):
        result, create = self._run(['stu1', 'not-mine'],
                                   can=lambda sid: sid == 'stu1')
        assert [a['student_user_id'] for a in result['absences']] == ['stu1']
        assert result['errors'] == {'not-mine': 'Not authorized for this student'}
        create.assert_called_once()

    def test_duplicate_for_one_sibling_does_not_block_the_other(self):
        def create(org_id, sid, **kw):
            if sid == 'stu1':
                return {'error': 'This absence has already been reported'}
            return self._row(org_id, sid)
        result, _ = self._run(['stu1', 'stu2'], create=create)
        assert [a['student_user_id'] for a in result['absences']] == ['stu2']
        assert result['errors'] == {'stu1': 'This absence has already been reported'}

    def test_a_date_range_flattens_every_created_row(self):
        """A range report returns one flat list of rows across children, and
        end_date reaches the absence service."""
        def create(_org_id, sid, **kw):
            assert kw['end_date'] == '2026-09-03'
            return {'absence': {'id': f'abs-{sid}-1'},
                    'absences': [{'id': f'abs-{sid}-1', 'student_user_id': sid},
                                 {'id': f'abs-{sid}-2', 'student_user_id': sid}],
                    'skipped_dates': []}
        with patch.object(parent, '_can_register', return_value=True), \
             patch.object(parent.absences, 'create', side_effect=create):
            result = parent.create_absences('g1', 'org1', ['stu1', 'stu2'],
                                            '2026-09-01', end_date='2026-09-03')
        assert [a['id'] for a in result['absences']] == [
            'abs-stu1-1', 'abs-stu1-2', 'abs-stu2-1', 'abs-stu2-2']


@pytest.mark.unit
class TestCancelAbsencesBatch:
    """A displayed date-range row cancels as one batch: one service call per
    (org, student, class) group, and authorization is all-or-nothing."""

    ROWS = [
        {'id': 'a1', 'organization_id': 'org1', 'student_user_id': 'stu1', 'class_id': None},
        {'id': 'a2', 'organization_id': 'org1', 'student_user_id': 'stu1', 'class_id': None},
    ]

    def test_cancels_the_whole_run_in_one_service_call(self):
        with patch.object(parent, '_can_register', return_value=True), \
             patch.object(parent.absences, 'get_many', return_value=self.ROWS), \
             patch.object(parent.absences, 'cancel_many', return_value=2) as cancel_many:
            result = parent.cancel_absences('g1', ['a1', 'a2'])
        assert result == {'cancelled': 2}
        cancel_many.assert_called_once_with(['a1', 'a2'], 'org1')

    def test_one_foreign_row_blocks_the_whole_batch(self):
        rows = self.ROWS + [{'id': 'a3', 'organization_id': 'org1',
                             'student_user_id': 'not-mine', 'class_id': None}]
        with patch.object(parent, '_can_register',
                          side_effect=lambda _u, _o, sid: sid == 'stu1'), \
             patch.object(parent.absences, 'get_many', return_value=rows), \
             patch.object(parent.absences, 'cancel_many') as cancel_many:
            result = parent.cancel_absences('g1', ['a1', 'a2', 'a3'])
        assert result['error'] == 'Not authorized for this student'
        cancel_many.assert_not_called()

    def test_unknown_ids_are_not_found(self):
        with patch.object(parent.absences, 'get_many', return_value=[]):
            assert parent.cancel_absences('g1', ['nope'])['error'] == 'Absence not found'


@pytest.mark.unit
class TestContextCarriesEffectiveModules:
    """/context is the ungated call a family surface makes before it knows what
    it may render, so it is the only place that can tell the frontend which
    per-module parent endpoints are worth calling.

    Without this, FamilyHome fired the onboarding/forms/billing reads for every
    school regardless, and one with the block off logged a ModuleGate warning
    per visit (Sentry OPTIO-BACKEND-81, Optio Academy hides `onboarding`).
    """

    @staticmethod
    def _resolver_with_flags(flags):
        def resolve(table, eq, in_):
            if table == 'organizations':
                return [{'id': 'org1', 'name': 'Micro School',
                         'feature_flags': flags, 'ai_features_enabled': False}]
            return _resolver(table, eq, in_)
        return resolve

    def _context(self, flags):
        with patch('services.sis_parent_service._admin',
                   return_value=_fake_admin(self._resolver_with_flags(flags))), \
             patch('services.sis_parent_service.org_has_feature', return_value=True):
            return parent.context('g1')

    def test_a_hidden_module_is_absent_from_the_list(self):
        ctx = self._context({'sis_enabled': True,
                             'sis_settings': {'hidden_modules': ['onboarding']}})
        modules = ctx['orgs'][0]['effective_modules']
        assert 'onboarding' not in modules
        assert 'sis' in modules

    def test_an_enabled_module_is_present(self):
        ctx = self._context({'sis_enabled': True})
        assert 'onboarding' in ctx['orgs'][0]['effective_modules']

    def test_a_non_sis_org_gets_only_core(self):
        # The parent cascade: sis off silences every module under it.
        modules = self._context({})['orgs'][0]['effective_modules']
        assert 'sis' not in modules
        assert 'onboarding' not in modules

    def test_the_existing_payload_is_unchanged(self):
        # Additive only — the fields family surfaces already read must survive.
        org = self._context({'sis_enabled': True})['orgs'][0]
        assert org['organization_name'] == 'Micro School'
        assert org['students'][0]['student_id'] == 'stu1'


@pytest.mark.unit
class TestTrainingLinksOnTheFamilyPortal:
    """A training that is a video or a document rather than a quest
    (iCreate, Molly, 2026-09-22, ae16c5da).

    Training links and the family document library are rows in ONE table,
    told apart by `is_training`. Until a link could be set for families that
    distinction never had to be enforced, because every link was written with
    audience='staff' and so could not match the family library's query. These
    tests hold the line now that it can.
    """

    def test_the_document_library_leaves_training_out(self):
        """Otherwise the same video is on the family portal twice: once on the
        training list with its Done button, once as a document."""
        filters = {}

        def resolver(table, eq, _in):
            if table == 'org_resources':
                filters.update(eq)
            return []

        with patch.object(parent, '_admin', return_value=_fake_admin(resolver)), \
             patch.object(parent, '_is_org_member', return_value=True), \
             patch('utils.storage_urls.sign_in_place', lambda *_a, **_k: None):
            parent.org_resources('g1', 'org1')
        assert filters.get('is_training') is False

    def test_a_parent_can_only_finish_a_link_set_for_families(self):
        """A staff training's id is guessable. Marking one done as a parent
        would put a parent in the office's training report."""
        from services import sis_training_service

        staff_link = {'id': 'L1', 'organization_id': 'org1', 'audience': 'staff'}
        with patch.object(parent, '_is_org_member', return_value=True), \
             patch.object(sis_training_service, 'owned_link', return_value=staff_link), \
             patch.object(sis_training_service, 'set_link_done') as marked:
            assert parent.set_training_link_done('g1', 'org1', 'L1', True) is None
        marked.assert_not_called()

    def test_a_family_link_is_marked_for_the_caller(self):
        from services import sis_training_service

        family_link = {'id': 'L2', 'organization_id': 'org1', 'audience': 'families'}
        with patch.object(parent, '_is_org_member', return_value=True), \
             patch.object(sis_training_service, 'owned_link', return_value=family_link), \
             patch.object(sis_training_service, 'set_link_done',
                          return_value={'id': 'L2'}) as marked:
            out = parent.set_training_link_done('g1', 'org1', 'L2', True)
        assert out == {'id': 'L2'}
        # The caller's own id, never one from the body.
        marked.assert_called_once_with(family_link, 'g1', True)

    def test_a_link_from_another_school_is_not_found(self):
        from services import sis_training_service

        with patch.object(parent, '_is_org_member', return_value=True), \
             patch.object(sis_training_service, 'owned_link', return_value=None):
            assert parent.set_training_link_done('g1', 'org1', 'L3', True) is None

    def test_somebody_outside_the_school_gets_nothing(self):
        with patch.object(parent, '_is_org_member', return_value=False):
            assert parent.training_links('nobody', 'org1') is None
            assert parent.set_training_link_done('nobody', 'org1', 'L2', True) is None

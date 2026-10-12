"""
The class chats follow the teachers when a class's teachers change.

iCreate, ticket 3bdf06bb (2026-10-08, an advisor): "I'm included in chats for
classes that I'm not responsible for. I would only like to be in chats for
classes that I teach." She had been the teacher of three classes when their
chats were first synced; the classes were reassigned, and nothing re-synced
the chats, so she stayed an admin member of them.

class_group_sync_service now drops a replaced teacher (test_class_messaging),
but that only helps if something calls it when the teachers change. These pin
the two doors that change them: the SIS class PATCH and ClassService's
add/remove advisor. Without the call, the sync fix never runs.
"""

from unittest.mock import Mock, patch

from flask import Flask

import routes.sis.catalog as catalog
from services.class_service import ClassService


ORG = '11111111-1111-4111-8111-111111111111'
CLASS = '66666666-6666-4666-8666-666666666666'
OLD_TEACHER = '77777777-7777-4777-8777-777777777777'
NEW_TEACHER = '99999999-9999-4999-8999-999999999999'
ADMIN = '88888888-8888-4888-8888-888888888888'

EXISTING = {'id': CLASS, 'organization_id': ORG, 'name': 'Theater Jr.',
            'primary_instructor_id': OLD_TEACHER, 'assistant_instructor_ids': []}


def _patch_class(body, updated):
    repo = Mock()
    repo.find_by_id.return_value = EXISTING
    repo.update_sis_fields.return_value = updated
    with patch.object(catalog.sis_service, 'org_or_error', return_value=(ORG, None)), \
         patch.object(catalog, '_instructor_in_org', return_value=True), \
         patch.object(catalog, '_invalid_assistant', return_value=None), \
         patch.object(catalog, 'SisClassRepository', return_value=repo), \
         patch.object(catalog, 'get_supabase_admin_client', return_value=Mock()), \
         patch.object(catalog, 'request', Mock(json=body)), \
         patch('services.sis_notifications.notify'), \
         patch('services.class_group_sync_service.sync_class_groups') as sync:
        app = Flask(__name__)
        with app.app_context():
            fn = catalog.update_class
            while hasattr(fn, '__wrapped__'):
                fn = fn.__wrapped__
            fn(ADMIN, CLASS)
    return sync


class TestClassPatchResyncsChats:
    def test_a_new_primary_teacher_resyncs_the_chats(self):
        """3bdf06bb: reassigning the class is exactly when the old teacher
        must leave its chats."""
        sync = _patch_class({'primary_instructor_id': NEW_TEACHER},
                            {**EXISTING, 'primary_instructor_id': NEW_TEACHER})
        sync.assert_called_once_with(CLASS, actor_id=ADMIN)

    def test_a_changed_assistant_list_resyncs_the_chats(self):
        sync = _patch_class({'assistant_instructor_ids': [NEW_TEACHER]},
                            {**EXISTING, 'assistant_instructor_ids': [NEW_TEACHER]})
        sync.assert_called_once_with(CLASS, actor_id=ADMIN)

    def test_an_edit_that_leaves_the_teachers_alone_does_not_resync(self):
        sync = _patch_class({'capacity_note': 'x'}, EXISTING)
        sync.assert_not_called()


class TestAdvisorChangesResyncChats:
    def _service(self):
        svc = ClassService.__new__(ClassService)
        svc.class_repo = Mock()
        svc.class_repo.add_advisor.return_value = {'id': 'row'}
        return svc

    def test_adding_an_advisor_resyncs_the_chats(self):
        svc = self._service()
        with patch('services.class_group_sync_service.sync_class_groups') as sync:
            svc.add_advisor(CLASS, NEW_TEACHER, ADMIN)
        sync.assert_called_once_with(CLASS, actor_id=ADMIN)

    def test_removing_an_advisor_resyncs_the_chats(self):
        svc = self._service()
        svc.class_repo.remove_advisor.return_value = True
        with patch('services.class_group_sync_service.sync_class_groups') as sync:
            svc.remove_advisor(CLASS, OLD_TEACHER, ADMIN)
        sync.assert_called_once_with(CLASS, actor_id=ADMIN)

    def test_a_failed_remove_does_not_resync(self):
        svc = self._service()
        svc.class_repo.remove_advisor.return_value = False
        with patch('services.class_group_sync_service.sync_class_groups') as sync:
            svc.remove_advisor(CLASS, OLD_TEACHER, ADMIN)
        sync.assert_not_called()

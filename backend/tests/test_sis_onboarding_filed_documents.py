"""
Filing a document the office already holds against the checklist item it answers.

iCreate, 2026-09-05 (c23105fa): "I have uploaded Molly's background check and yet
it shows on her onboarding that her background check is 'pending'. I have like 18
or so people in that same boat where the background check is uploaded but is just
sitting in task center docs all on its own."

Uploading to the secure store and completing a checklist item were two unconnected
acts, and the office does them in that order. In prod on the day of the report, 14
staff sat at "Background check — pending" and the store held 11 background checks.

The attachment is a LINK, not a copy: one blob, owned by the store. That is the
whole of the risk here, so the tests are about the boundary — whose document may
be attached, who may attach or detach it, and what happens to the file when the
link goes away.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_onboarding_service as onboarding


ORG = 'org-1'
ASSIGNMENT_ID = 'a1'
TEACHER = 'molly'
DOC_ID = 'doc-bg-1'


def _item(**over):
    base = {'key': 'background', 'title': 'Background check', 'required': True,
            'needs_document': True, 'needs_signature': False, 'needs_approval': False,
            'status': 'pending', 'document_url': None, 'documents': [],
            'submitted_at': None, 'approved_by': None, 'approved_at': None,
            'admin_notes': None, 'signature': None}
    base.update(over)
    return base


def _assignment(items=None, user_id=TEACHER):
    return {'id': ASSIGNMENT_ID, 'organization_id': ORG, 'user_id': user_id,
            'audience': 'staff', 'template_name': 'Employee onboarding',
            'items': items or [_item()]}


STORE_DOC = {'id': DOC_ID, 'title': 'Background check — Molly',
             'filename': 'bgc-molly.pdf', 'owner_user_id': TEACHER,
             'organization_id': ORG}


def _run(fields, assignment=None, actor_id='office-admin', is_admin=True,
         store_row=STORE_DOC, removed=None):
    """update_item against a stubbed assignment and a stubbed store row.

    `removed` collects the bucket paths the blob-deleter was asked to remove, so
    a test can assert that detaching a LINK leaves the store's file alone.
    """
    assignment = assignment or _assignment()
    saved = {}

    def _fake_save(a, items):
        saved['items'] = items
        return {**a, 'items': items}

    def _fake_load_doc(org_id, user_id, doc_id):
        if not store_row or store_row.get('owner_user_id') != user_id:
            return {}, 'That document is not on file for this person'
        return store_row, None

    with patch.object(onboarding, '_load_assignment', return_value=assignment), \
         patch.object(onboarding, '_save_items', side_effect=_fake_save), \
         patch.object(onboarding, '_admin', return_value=Mock()), \
         patch.object(onboarding, '_load_attachable_document', side_effect=_fake_load_doc), \
         patch.object(onboarding, '_remove_document_blob',
                      side_effect=lambda a, p: (removed if removed is not None else []).append(p)), \
         patch('services.sis_notifications.notify'), \
         patch.object(onboarding.sis_service, 'org_admin_ids', return_value=[]):
        result = onboarding.update_item(ORG, ASSIGNMENT_ID, 'background', fields,
                                        actor_id, is_admin)
    return result, saved.get('items')


@pytest.mark.unit
class TestAttachingAFiledDocument:
    def test_the_office_can_attach_a_document_it_already_holds(self):
        result, items = _run({'attach_document_id': DOC_ID, 'status': 'complete'})
        assert result.get('error') is None
        docs = items[0]['documents']
        assert [d['secure_document_id'] for d in docs] == [DOC_ID]

    def test_attaching_answers_the_item(self):
        """The point of the ticket: the document was already on file and the
        item still read 'pending'."""
        _, items = _run({'attach_document_id': DOC_ID, 'status': 'complete'})
        assert items[0]['status'] == 'complete'

    def test_it_keeps_the_documents_name_so_the_office_can_see_which_one(self):
        _, items = _run({'attach_document_id': DOC_ID, 'status': 'complete'})
        assert items[0]['documents'][0]['title'] == 'Background check — Molly'

    def test_the_legacy_path_field_is_not_given_an_id(self):
        """`document_url` names a bucket path and every reader treats it as one;
        a link has no path, so the field stays empty rather than holding an id."""
        _, items = _run({'attach_document_id': DOC_ID, 'status': 'complete'})
        assert items[0]['document_url'] is None

    def test_attaching_the_same_document_twice_does_not_duplicate_it(self):
        existing = _item(documents=[{'secure_document_id': DOC_ID,
                                     'filename': 'bgc-molly.pdf'}])
        _, items = _run({'attach_document_id': DOC_ID},
                        assignment=_assignment([existing]))
        assert len(items[0]['documents']) == 1

    def test_an_upload_and_a_link_can_sit_on_the_same_item(self):
        existing = _item(documents=[{'path': 'org-1/molly/id.pdf', 'filename': 'id.pdf'}])
        _, items = _run({'attach_document_id': DOC_ID},
                        assignment=_assignment([existing]))
        docs = items[0]['documents']
        assert len(docs) == 2
        assert items[0]['document_url'] == 'org-1/molly/id.pdf'


@pytest.mark.unit
class TestWhoMayAttach:
    def test_someone_elses_document_may_not_be_attached(self):
        """A checklist item belongs to one person. Without this an admin could
        file anyone's background check against anyone's onboarding."""
        other = {**STORE_DOC, 'owner_user_id': 'someone-else'}
        result, items = _run({'attach_document_id': DOC_ID}, store_row=other)
        assert result['error'] == 'That document is not on file for this person'
        assert items is None

    def test_a_teacher_may_not_attach_out_of_the_stores_filing_cabinet(self):
        result, _ = _run({'attach_document_id': DOC_ID},
                         actor_id=TEACHER, is_admin=False)
        assert result['error'] == 'Only an administrator can attach a filed document'

    def test_a_teacher_may_not_detach_the_offices_answer(self):
        """Detaching would un-complete their own onboarding."""
        existing = _item(status='complete',
                         documents=[{'secure_document_id': DOC_ID}])
        result, _ = _run({'remove_document': DOC_ID},
                         assignment=_assignment([existing]),
                         actor_id=TEACHER, is_admin=False)
        assert result['error'] == 'Only an administrator can remove a filed document'


@pytest.mark.unit
class TestDetaching:
    def test_detaching_a_link_leaves_the_stores_file_where_it_is(self):
        """The blob belongs to the secure store and other things point at it.
        Deleting it here would take a background check out of HR's cabinet."""
        removed = []
        existing = _item(documents=[{'secure_document_id': DOC_ID}])
        _, items = _run({'remove_document': DOC_ID},
                        assignment=_assignment([existing]), removed=removed)
        assert items[0]['documents'] == []
        assert removed == []

    def test_detaching_an_upload_still_deletes_its_blob(self):
        """Unchanged behaviour: a file nobody can reach from the checklist is a
        copy of somebody's ID sitting in a bucket with no owner."""
        removed = []
        path = 'org-1/molly/id.pdf'
        existing = _item(documents=[{'path': path, 'filename': 'id.pdf'}])
        _, items = _run({'remove_document': path},
                        assignment=_assignment([existing]), removed=removed)
        assert items[0]['documents'] == []
        assert removed == [path]


@pytest.mark.unit
class TestItemDocumentsReadsBothShapes:
    def test_a_linked_document_counts_as_attached(self):
        item = _item(documents=[{'secure_document_id': DOC_ID}])
        assert onboarding.item_documents(item) == [{'secure_document_id': DOC_ID}]

    def test_an_entry_with_neither_a_path_nor_an_id_is_not_a_document(self):
        item = _item(documents=[{'filename': 'ghost.pdf'}])
        assert onboarding.item_documents(item) == []

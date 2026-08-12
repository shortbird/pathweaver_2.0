"""
Signing a checklist item by typing your name.

iCreate, 2026-08-06: "rather than downloading/signing/scanning/uploading a doc,
just give them a place to type their name with a checkbox saying something like
'this counts as my official signature'."

A typed name is a valid electronic signature when you can show three things: who
typed it, that they meant it as a signature, and when. So the tests here are
mostly about refusing to record something that only looks like a signature —
a name with no affirmation, an affirmation with no name, or a completed item
with neither.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_onboarding_service as onboarding


ORG = 'org-1'
ASSIGNMENT_ID = 'a1'
SIGNER = 'kate'


def _item(**over):
    # link present by default: a signature item with neither a link nor an
    # attached document is refused (TestNothingToSign), and most tests here are
    # about the signing itself, not the gate.
    base = {'key': 'contract', 'title': 'Staff agreement', 'required': True,
            'needs_document': False, 'needs_signature': True, 'needs_approval': False,
            'status': 'pending', 'document_url': None, 'admin_document_url': None,
            'link': 'https://example.com/agreement.pdf', 'submitted_at': None,
            'approved_by': None, 'approved_at': None, 'admin_notes': None,
            'signature': None}
    base.update(over)
    return base


def _assignment(items=None, user_id=SIGNER):
    return {'id': ASSIGNMENT_ID, 'organization_id': ORG, 'user_id': user_id,
            'template_name': 'Employee onboarding', 'items': items or [_item()]}


def _run(fields, assignment=None, actor_id=SIGNER, is_admin=False):
    """Call update_item against a stubbed assignment; return (result, saved_items)."""
    assignment = assignment or _assignment()
    saved = {}

    def _fake_save(a, items):
        saved['items'] = items
        return {**a, 'items': items}

    with patch.object(onboarding, '_load_assignment', return_value=assignment), \
         patch.object(onboarding, '_save_items', side_effect=_fake_save), \
         patch.object(onboarding, '_admin', return_value=Mock()), \
         patch('services.sis_notifications.notify'), \
         patch.object(onboarding.sis_service, 'org_admin_ids', return_value=[]):
        result = onboarding.update_item(ORG, ASSIGNMENT_ID, 'contract', fields,
                                        actor_id, is_admin)
    return result, saved.get('items')


SIGN = {'signature_name': '  Kate Myers  ', 'signature_agreed': True,
        'signature_ip': '203.0.113.9'}


@pytest.mark.unit
class TestSigning:
    def test_a_typed_name_signs_the_item(self):
        result, items = _run(SIGN)
        assert result.get('error') is None
        assert items[0]['signature']['name'] == 'Kate Myers'

    def test_signing_completes_the_item_without_being_told_to(self):
        _, items = _run(SIGN)
        assert items[0]['status'] == 'complete'

    def test_it_records_who_signed_and_when(self):
        _, items = _run(SIGN)
        sig = items[0]['signature']
        assert sig['signed_by'] == SIGNER
        assert sig['signed_at']

    def test_it_records_the_sentence_they_agreed_to(self):
        """Storing a bare `true` would leave no record of WHAT was agreed. The
        wording lives on the server so the stored copy can't drift from the UI."""
        _, items = _run(SIGN)
        assert items[0]['signature']['agreed_to'] == onboarding.SIGNATURE_STATEMENT
        assert 'official signature' in onboarding.SIGNATURE_STATEMENT

    def test_it_records_the_address_it_came_from(self):
        _, items = _run(SIGN)
        assert items[0]['signature']['ip'] == '203.0.113.9'

    def test_the_signature_is_offered_to_the_client(self):
        """The checkbox must show the exact sentence that gets recorded."""
        rows = [{'id': ASSIGNMENT_ID, 'user_id': SIGNER, 'items': [_item()]}]
        client = Mock()
        table = Mock()
        for chained in ('select', 'eq', 'order', 'in_'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=rows)
        client.table.return_value = table
        with patch.object(onboarding, '_admin', return_value=client):
            out = onboarding.list_assignments(ORG, user_id=SIGNER)
        assert out[0]['signature_statement'] == onboarding.SIGNATURE_STATEMENT


@pytest.mark.unit
class TestWhatItRefuses:
    def test_a_name_without_the_affirmation(self):
        """The whole point of the checkbox is intent. A name recorded without it
        is not a signature, but stored it would look exactly like one."""
        result, items = _run({'signature_name': 'Kate Myers'})
        assert 'Tick the box' in result['error']
        assert items is None

    def test_the_affirmation_without_a_name(self):
        result, _ = _run({'signature_agreed': True})
        assert 'Type your full name' in result['error']

    def test_a_blank_name(self):
        result, _ = _run({'signature_name': '   ', 'signature_agreed': True})
        assert 'Type your full name' in result['error']

    def test_an_absurdly_long_name(self):
        result, _ = _run({'signature_name': 'x' * 200, 'signature_agreed': True})
        assert 'too long' in result['error']

    def test_signing_an_item_that_is_not_signed_here(self):
        plain = _assignment([_item(needs_signature=False)])
        result, _ = _run(SIGN, assignment=plain)
        assert result['error'] == 'This item is not signed here'

    def test_ticking_a_signature_item_complete_without_signing_it(self):
        """The checkbox is disabled in the UI; this is the backend saying the
        same thing, so a stale client can't complete an unsigned agreement."""
        result, items = _run({'status': 'complete'})
        assert result['error'] == 'Sign this item to complete it'
        assert items is None

    def test_an_admin_cannot_sign_on_somebody_else_s_behalf(self):
        """An admin can approve and reject. Signing for another person is
        forgery, however well intentioned."""
        result, items = _run(SIGN, actor_id='molly', is_admin=True)
        assert result['error'] == 'Only the person themselves can sign this'
        assert items is None

    def test_an_admin_can_still_sign_their_own(self):
        own = _assignment(user_id='molly')
        result, _ = _run(SIGN, assignment=own, actor_id='molly', is_admin=True)
        assert result.get('error') is None


@pytest.mark.unit
class TestNothingToSign:
    """iCreate, 2026-08-12: "Erik Pearson marked sign your contract as complete,
    but he hasn't actually gotten one yet!" A signature needs a thing being
    signed — the template's link, or the document the office attached for this
    person. With neither, signing is refused."""

    def test_signing_is_refused_when_there_is_no_document(self):
        bare = _assignment([_item(link=None, admin_document_url=None)])
        result, items = _run(SIGN, assignment=bare)
        assert 'nothing to sign yet' in result['error']
        assert items is None

    def test_an_old_snapshot_without_the_field_is_also_refused(self):
        """Assignments created before this fix have no admin_document_url key
        at all — they must lock, not crash or slip through."""
        legacy = _item(link=None)
        legacy.pop('admin_document_url')
        result, items = _run(SIGN, assignment=_assignment([legacy]))
        assert 'nothing to sign yet' in result['error']
        assert items is None

    def test_a_template_link_is_enough(self):
        result, items = _run(SIGN)  # default item carries a link
        assert result.get('error') is None
        assert items[0]['signature']['name'] == 'Kate Myers'

    def test_an_attached_document_is_enough(self):
        attached = _assignment([_item(link=None, admin_document_url='org-1/kate/abc.pdf')])
        result, items = _run(SIGN, assignment=attached)
        assert result.get('error') is None
        assert items[0]['status'] == 'complete'


@pytest.mark.unit
class TestAttachingTheDocument:
    def test_an_admin_attaches_the_document(self):
        bare = _assignment([_item(link=None)])
        result, items = _run({'admin_document_url': 'org-1/kate/abc.pdf'},
                             assignment=bare, actor_id='molly', is_admin=True)
        assert result.get('error') is None
        assert items[0]['admin_document_url'] == 'org-1/kate/abc.pdf'
        assert items[0]['status'] == 'pending'  # attaching is not completing

    def test_the_person_themselves_cannot_attach_it(self):
        """The whole point is that the OFFICE supplies the contract. If the
        signer could set this field, the gate would be a formality."""
        result, items = _run({'admin_document_url': 'org-1/kate/abc.pdf'})
        assert 'administrator' in result['error']
        assert items is None

    def test_it_only_goes_on_signature_items(self):
        plain = _assignment([_item(needs_signature=False, link=None)])
        result, items = _run({'admin_document_url': 'org-1/kate/abc.pdf'},
                             assignment=plain, actor_id='molly', is_admin=True)
        assert 'signed here' in result['error']
        assert items is None

    def _attach(self, assignment):
        """Run attach_document with storage stubbed; return (result, storage)."""
        storage = Mock()
        with patch.object(onboarding, '_load_assignment', return_value=assignment), \
             patch.object(onboarding, '_admin', return_value=Mock(storage=storage)), \
             patch.object(onboarding, '_save_items',
                          side_effect=lambda a, items: {**a, 'items': items}), \
             patch('services.sis_notifications.notify'):
            result = onboarding.attach_document(
                ORG, ASSIGNMENT_ID, 'contract', blob=b'pdf', ext='pdf',
                content_type='application/pdf', actor_id='molly')
        return result, storage

    def test_the_file_lands_in_the_owner_s_own_folder(self):
        """Pinned to {org}/{owner}/ so the person opens it through the same
        doc-url endpoint as their own uploads — no new read path."""
        result, storage = self._attach(_assignment([_item(link=None)]))
        assert result.get('error') is None
        storage.from_.assert_any_call('staff-documents')
        path = storage.from_.return_value.upload.call_args.kwargs['path']
        assert path.startswith(f'{ORG}/{SIGNER}/')
        assert path.endswith('.pdf')
        assert result['assignment']['items'][0]['admin_document_url'] == path

    def test_a_family_checklist_uses_the_family_bucket(self):
        """The family portal reads from family-documents; a contract parked in
        the staff bucket would be unopenable from there."""
        fam = {**_assignment([_item(link=None)]), 'audience': 'family'}
        result, storage = self._attach(fam)
        assert result.get('error') is None
        storage.from_.assert_any_call('family-documents')

    def test_a_refused_attach_does_not_leave_the_file_behind(self):
        plain = _assignment([_item(needs_signature=False, link=None)])
        result, storage = self._attach(plain)
        assert result.get('error')
        uploaded = storage.from_.return_value.upload.call_args.kwargs['path']
        storage.from_.return_value.remove.assert_called_once_with([uploaded])

    def test_attaching_tells_the_person_their_document_is_ready(self):
        bare = _assignment([_item(link=None)])
        with patch.object(onboarding, '_load_assignment', return_value=bare), \
             patch.object(onboarding, '_save_items',
                          side_effect=lambda a, items: {**a, 'items': items}), \
             patch('services.sis_notifications.notify') as notify, \
             patch.object(onboarding.sis_service, 'org_admin_ids', return_value=[]):
            onboarding.update_item(ORG, ASSIGNMENT_ID, 'contract',
                                   {'admin_document_url': 'org-1/kate/abc.pdf'},
                                   'molly', True)
        assert notify.called
        args, kwargs = notify.call_args
        assert args[0] == SIGNER
        assert 'ready to sign' in args[1].lower()
        assert kwargs.get('link') == '/onboarding'


@pytest.mark.unit
class TestVoidingASignature:
    """The undo for a signature recorded against nothing: an admin clears it and
    the item returns to pending, so the person signs again once the document is
    really there. Erik and three colleagues need exactly this."""

    def _signed_item(self):
        return _item(link=None, status='complete',
                     submitted_at='2026-08-11T04:12:20+00:00',
                     signature={'name': 'Karl Erik Pearson', 'signed_by': SIGNER,
                                'signed_at': '2026-08-11T04:12:20+00:00',
                                'agreed_to': onboarding.SIGNATURE_STATEMENT})

    def test_an_admin_voids_it(self):
        signed = _assignment([self._signed_item()])
        result, items = _run({'void_signature': True}, assignment=signed,
                             actor_id='molly', is_admin=True)
        assert result.get('error') is None
        assert items[0]['signature'] is None
        assert items[0]['status'] == 'pending'
        assert items[0]['submitted_at'] is None

    def test_the_signer_cannot_void_their_own(self):
        """Un-signing is an office decision — otherwise "I signed it" stops
        being a statement anyone can rely on."""
        signed = _assignment([self._signed_item()])
        result, items = _run({'void_signature': True}, assignment=signed)
        assert 'administrator' in result['error']
        assert items is None


@pytest.mark.unit
class TestTheTemplateFlag:
    def test_an_item_can_be_marked_as_signed_here(self):
        cleaned = onboarding._clean_items([
            {'title': 'Staff agreement', 'needs_signature': True}])
        assert cleaned[0]['needs_signature'] is True

    def test_it_defaults_off(self):
        cleaned = onboarding._clean_items([{'title': 'Read the handbook'}])
        assert cleaned[0]['needs_signature'] is False

    def test_assigning_gives_the_item_an_empty_signature(self):
        """Snapshotted like the rest of the item state, so a checklist in flight
        is unaffected by later template edits."""
        template = {'id': 't1', 'organization_id': ORG, 'name': 'Employee onboarding',
                    'audience': 'staff',
                    'items': [{'key': 'contract', 'title': 'Staff agreement',
                               'needs_signature': True, 'required': True}]}
        client = Mock()
        table = Mock()
        for chained in ('select', 'eq', 'limit', 'insert'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[template])
        client.table.return_value = table
        captured = {}

        def _insert(payload):
            captured['payload'] = payload
            return table
        table.insert.side_effect = _insert

        with patch.object(onboarding, '_admin', return_value=client), \
             patch('services.sis_notifications.notify'):
            onboarding.assign(ORG, 't1', SIGNER, assigned_by='molly')

        assert captured['payload']['items'][0]['signature'] is None
        assert captured['payload']['items'][0]['needs_signature'] is True

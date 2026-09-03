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
    base = {'key': 'contract', 'title': 'Staff agreement', 'required': True,
            'needs_document': False, 'needs_signature': True, 'needs_approval': False,
            'status': 'pending', 'document_url': None, 'submitted_at': None,
            'approved_by': None, 'approved_at': None, 'admin_notes': None,
            'signature': None}
    base.update(over)
    return base


def _assignment(items=None, user_id=SIGNER, audience='staff'):
    return {'id': ASSIGNMENT_ID, 'organization_id': ORG, 'user_id': user_id,
            'audience': audience,
            'template_name': 'Employee onboarding', 'items': items or [_item()]}


# What the office shared to the signer's portal. A staff signature item with no
# link signs against these, so the default gives the signer one to keep the
# plain signing tests signing; pass [] to model an office that hasn't uploaded.
OFFICE_DOCS = [{'id': 'doc-1', 'title': 'Contract - Kate Myers.pdf'}]


def _run(fields, assignment=None, actor_id=SIGNER, is_admin=False,
         office_docs=OFFICE_DOCS):
    """Call update_item against a stubbed assignment; return (result, saved_items)."""
    assignment = assignment or _assignment()
    saved = {}

    def _fake_save(a, items):
        saved['items'] = items
        return {**a, 'items': items}

    with patch.object(onboarding, '_load_assignment', return_value=assignment), \
         patch.object(onboarding, '_save_items', side_effect=_fake_save), \
         patch.object(onboarding, '_admin', return_value=Mock()), \
         patch.object(onboarding, 'office_documents', return_value=office_docs), \
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
        with patch.object(onboarding, '_admin', return_value=client), \
             patch.object(onboarding, 'office_documents', return_value=[]):
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
class TestSigningNeedsTheDocument:
    """iCreate, 2026-08-12: "User can sign contract without having one." The
    contract item said "Your contract will be uploaded to your teacher portal",
    and teachers signed it while the office had uploaded nothing — a recorded
    signature over a document that did not exist. A staff signature item with no
    template link signs against the office's portal uploads, so those now gate
    it."""

    def test_it_refuses_when_the_office_has_uploaded_nothing(self):
        result, items = _run(SIGN, office_docs=[])
        assert "office hasn't uploaded" in result['error']
        assert items is None

    def test_a_template_link_is_the_document(self):
        """An item whose link carries the thing signed (a handbook) needs no
        portal upload."""
        linked = _assignment([_item(link='https://example.org/handbook.pdf')])
        result, items = _run(SIGN, assignment=linked, office_docs=[])
        assert result.get('error') is None
        assert 'documents' not in items[0]['signature']

    def test_family_items_are_gated_on_office_documents(self):
        """Family checklists are gated on office documents too when there's no template link."""
        fam = _assignment(audience='family')
        result, _ = _run(SIGN, assignment=fam, office_docs=[])
        assert "office hasn't uploaded" in result['error']

    def test_the_signature_records_what_they_had_in_front_of_them(self):
        _, items = _run(SIGN)
        assert items[0]['signature']['documents'] == OFFICE_DOCS

    def test_the_checklist_carries_the_documents_to_sign(self):
        """list_assignments hands the UI `sign_docs` on unsigned document-
        signature items, so the sign box can be withheld while it is empty."""
        rows = [{'id': ASSIGNMENT_ID, 'user_id': SIGNER, 'audience': 'family',
                 'items': [_item()]}]
        client = Mock()
        table = Mock()
        for chained in ('select', 'eq', 'order', 'in_'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=rows)
        client.table.return_value = table
        with patch.object(onboarding, '_admin', return_value=client), \
             patch.object(onboarding, 'office_documents', return_value=[]) as docs:
            out = onboarding.list_assignments(ORG, user_id=SIGNER)
        docs.assert_called_once_with(ORG, SIGNER)
        assert out[0]['items'][0]['sign_docs'] == []

    def test_the_admin_roll_up_does_not_look_up_documents(self):
        """The org-wide progress list is per-admin, not per-person — no user, no
        portal to look in."""
        rows = [{'id': ASSIGNMENT_ID, 'user_id': SIGNER, 'audience': 'staff',
                 'items': [_item()]}]
        client = Mock()
        table = Mock()
        for chained in ('select', 'eq', 'order', 'in_'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=rows)
        client.table.return_value = table
        with patch.object(onboarding, '_admin', return_value=client), \
             patch.object(onboarding, 'office_documents', return_value=[]) as docs:
            out = onboarding.list_assignments(ORG)
        docs.assert_not_called()
        assert 'sign_docs' not in out[0]['items'][0]


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
             patch.object(onboarding, 'assert_recipients_in_org'), \
             patch('services.sis_notifications.notify'):
            onboarding.assign(ORG, 't1', SIGNER, assigned_by='molly')

        assert captured['payload']['items'][0]['signature'] is None
        assert captured['payload']['items'][0]['needs_signature'] is True


@pytest.mark.unit
class TestClearingSignatures:
    def test_admin_can_clear_a_signature(self):
        signed_item = _item(status='complete', signature={'name': 'Karina Worlton', 'signed_at': '2026-08-12T10:00:00Z'})
        assignment = _assignment([signed_item])
        client = Mock()
        table = Mock()
        for chained in ('select', 'eq', 'limit', 'update'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[assignment])
        client.table.return_value = table

        with patch.object(onboarding, '_admin', return_value=client):
            res = onboarding.update_item(ORG, ASSIGNMENT_ID, 'contract', {'clear_signature': True}, actor_id='admin_1', is_admin=True)

        assert res.get('error') is None
        items = res['assignment']['items']
        assert items[0]['signature'] is None
        assert items[0]['status'] == 'pending'

    def test_non_admin_cannot_clear_a_signature(self):
        signed_item = _item(status='complete', signature={'name': 'Karina Worlton', 'signed_at': '2026-08-12T10:00:00Z'})
        assignment = _assignment([signed_item])
        client = Mock()
        table = Mock()
        for chained in ('select', 'eq', 'limit', 'update'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[assignment])
        client.table.return_value = table

        with patch.object(onboarding, '_admin', return_value=client):
            res = onboarding.update_item(ORG, ASSIGNMENT_ID, 'contract', {'clear_signature': True}, actor_id=SIGNER, is_admin=False)

        assert res.get('error') == 'Only an administrator can clear a signature'


class TestSignaturesByDocument:
    """The evidence read back per stored document, so the documents list can
    say "Signed <date>" instead of showing the requires_signature ask-flag
    forever (iCreate, 2026-08-31)."""

    def test_maps_each_signed_document_to_its_signature(self):
        sig = {'name': 'Kate Myers', 'signed_by': SIGNER,
               'signed_at': '2026-08-25T01:29:36+00:00',
               'documents': [{'id': 'doc-1', 'title': 'Contract.pdf'}]}
        rows = [
            {'id': 'a1', 'items': [_item(status='complete', signature=sig),
                                   _item(key='w4')]},
            {'id': 'a2', 'items': None},
        ]
        with patch.object(onboarding, 'fetch_all_rows', return_value=rows):
            out = onboarding.signatures_by_document(ORG)
        assert out == {'doc-1': {'signed_at': sig['signed_at'],
                                 'signed_by': SIGNER,
                                 'signed_by_name': 'Kate Myers'}}

    def test_a_signature_that_signed_no_stored_document_maps_nothing(self):
        # A link item's signature carries no documents list — nothing to mark.
        sig = {'name': 'Kate Myers', 'signed_by': SIGNER,
               'signed_at': '2026-08-25T01:29:36+00:00'}
        rows = [{'id': 'a1', 'items': [_item(status='complete', signature=sig)]}]
        with patch.object(onboarding, 'fetch_all_rows', return_value=rows):
            assert onboarding.signatures_by_document(ORG) == {}

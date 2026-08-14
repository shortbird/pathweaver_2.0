"""
Sending a document out for signature.

iCreate, 2026-08-14: upload a document, assign it to a set of people as a task,
and see who has signed. The mechanics reuse the onboarding signature machinery —
each recipient gets a one-item assignment against their OWN copy of the document
— so what needs testing here is the wiring: that a copy goes to each person,
that signing is bound to the document that was sent rather than whatever else is
in their portal, that a failed send doesn't strand files in people's portals,
and that a campus coordinator can send campus paperwork but never HR paperwork.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_onboarding_service as onboarding


ORG = 'org-1'
SENDER = 'admin-1'
RECIPIENTS = [{'id': 'kate', 'audience': 'staff'},
              {'id': 'parent-1', 'audience': 'family'}]


def _stored(n=2):
    return {'documents': [{'id': f'doc-{i}', 'storage_path': f'{ORG}/{i}.pdf'}
                          for i in range(n)]}


def _send(recipients=RECIPIENTS, stored=None, insert_raises=False, **kwargs):
    """Run send_for_signature with storage and DB stubbed; return (result, inserted_rows)."""
    captured = {}

    def _table(name):
        t = Mock()

        def _insert(rows):
            captured['rows'] = rows
            if insert_raises:
                raise RuntimeError('insert exploded')
            t.execute.return_value = Mock(data=rows)
            return t

        t.insert.side_effect = _insert
        for chained in ('delete', 'in_', 'select', 'eq'):
            getattr(t, chained).return_value = t
        if name == 'users':
            # Recipients are verified to belong to the org before anything is
            # sent (the cross-tenant guard); these are all in it.
            t.execute.return_value = Mock(
                data=[{'id': r['id'], 'organization_id': ORG} for r in recipients])
        else:
            t.execute.return_value = Mock(data=[])
        return t

    admin = Mock()
    admin.table.side_effect = _table

    with patch.object(onboarding, '_admin', return_value=admin), \
         patch.object(onboarding.sis_secure_docs_service, 'store_document',
                      return_value=stored or _stored(len(recipients))) as store, \
         patch.object(onboarding.sis_secure_docs_service, 'remove_blobs') as remove, \
         patch('services.sis_notifications.notify') as notify:
        result = onboarding.send_for_signature(
            ORG, SENDER, b'pdf-bytes', 'handbook.pdf', 'pdf', 'application/pdf',
            9, recipients, **kwargs)
    return result, captured.get('rows'), store, remove, notify


@pytest.mark.unit
class TestSendingIt:

    def test_every_recipient_gets_their_own_copy_and_their_own_task(self):
        result, rows, store, _r, _n = _send()
        assert result['sent'] == 2
        assert len(rows) == 2
        # One storage target per person — copies are never shared (deleting one
        # person's copy would otherwise blank the file for everyone else).
        assert len(store.call_args.kwargs['targets']) == 2

    def test_the_copies_are_shared_with_the_recipients(self):
        """The whole point is that they open and sign it, so this upload is the
        one that overrides the store's shared-with-nobody default."""
        _result, _rows, store, _r, _n = _send()
        assert store.call_args.kwargs['shared_with_owner'] is True

    def test_each_task_signs_the_recipients_own_document(self):
        _result, rows, _s, _r, _n = _send()
        assert [r['items'][0]['document_id'] for r in rows] == ['doc-0', 'doc-1']

    def test_one_send_is_one_batch(self):
        _result, rows, _s, _r, _n = _send()
        assert len({r['batch_id'] for r in rows}) == 1

    def test_the_rows_are_marked_as_sends_not_checklists(self):
        """So the onboarding roll-up isn't buried under forty handbook rows."""
        _result, rows, _s, _r, _n = _send()
        assert {r['kind'] for r in rows} == {'signature_request'}
        assert {r['template_id'] for r in rows} == {None}

    def test_audience_follows_the_recipient(self):
        _result, rows, _s, _r, _n = _send()
        assert [r['audience'] for r in rows] == ['staff', 'family']

    def test_the_notification_points_at_the_right_portal(self):
        _result, _rows, _s, _r, notify = _send()
        links = [c.kwargs['link'] for c in notify.call_args_list]
        assert links == ['/my-tasks', '/family/portal']

    def test_a_title_and_note_and_due_date_ride_along(self):
        _result, rows, _s, _r, _n = _send(
            title='Employee handbook 2026', message='Please read first.',
            due_date='2026-09-01')
        item = rows[0]['items'][0]
        assert rows[0]['template_name'] == 'Employee handbook 2026'
        assert item['title'] == 'Sign: Employee handbook 2026'
        assert item['description'] == 'Please read first.'
        assert item['due_date'] == '2026-09-01'

    def test_the_same_person_twice_is_sent_once(self):
        result, rows, _s, _r, _n = _send(
            recipients=[{'id': 'kate', 'audience': 'staff'},
                        {'id': 'kate', 'audience': 'staff'}],
            stored=_stored(1))
        assert result['sent'] == 1
        assert len(rows) == 1

    def test_sending_to_nobody_is_refused_before_anything_is_uploaded(self):
        result, rows, store, _r, _n = _send(recipients=[])
        assert 'error' in result
        assert store.call_count == 0
        assert rows is None


@pytest.mark.unit
class TestRecipientsMustBelongToTheOrg:
    """Recipient ids come from the client. A well-formed id from another school
    must not put this school's document into that school's portal."""

    def _send_to(self, member_orgs, lookup_raises=False):
        """member_orgs maps user_id -> the org that user actually belongs to."""
        def _table(name):
            t = Mock()
            for chained in ('select', 'in_', 'insert', 'eq', 'delete'):
                getattr(t, chained).return_value = t
            if name == 'users':
                if lookup_raises:
                    t.execute.side_effect = RuntimeError('lookup exploded')
                else:
                    t.execute.return_value = Mock(
                        data=[{'id': u, 'organization_id': o} for u, o in member_orgs.items()])
            else:
                t.execute.return_value = Mock(data=[])
            return t

        admin = Mock()
        admin.table.side_effect = _table
        with patch.object(onboarding, '_admin', return_value=admin), \
             patch.object(onboarding.sis_secure_docs_service, 'store_document') as store, \
             patch('services.sis_notifications.notify'):
            result = onboarding.send_for_signature(
                ORG, SENDER, b'pdf', 'handbook.pdf', 'pdf', 'application/pdf', 9,
                RECIPIENTS)
        return result, store

    def test_a_recipient_from_another_school_is_refused(self):
        result, store = self._send_to({'kate': ORG, 'parent-1': 'other-org'})
        assert result.get('status') == 403
        # Refused BEFORE the document is stored — no copy is created for anyone.
        assert store.call_count == 0

    def test_an_unknown_recipient_is_refused(self):
        result, _store = self._send_to({'kate': ORG})
        assert result.get('status') == 403

    def test_a_failed_lookup_refuses_rather_than_assumes(self):
        """This is an authorization check; a lookup we could not complete is not
        permission to skip it."""
        result, store = self._send_to({}, lookup_raises=True)
        assert result.get('status') == 403
        assert store.call_count == 0


@pytest.mark.unit
class TestWhenTheSendFails:

    def test_a_failed_assignment_write_takes_the_copies_back_out(self):
        """Otherwise the documents sit in people's portals with nothing asking
        them to sign — a file that appeared from nowhere."""
        result, _rows, _s, remove, _n = _send(insert_raises=True)
        assert 'error' in result
        remove.assert_called_once()
        assert remove.call_args[0][0] == [f'{ORG}/0.pdf', f'{ORG}/1.pdf']

    def test_an_upload_failure_is_returned_not_swallowed(self):
        result, rows, _s, _r, _n = _send(
            stored={'error': 'Failed to upload document', 'status': 500})
        assert result['error'] == 'Failed to upload document'
        assert rows is None


@pytest.mark.unit
class TestSigningIsBoundToTheDocumentThatWasSent:

    def _office_docs(self, document_id=None):
        """What office_documents returns for a query, honouring the narrowing."""
        pool = [{'id': 'doc-0', 'title': 'Handbook'},
                {'id': 'other', 'title': 'A different paper'}]
        return [d for d in pool if d['id'] == document_id] if document_id else pool

    def test_an_item_naming_a_document_signs_only_that_one(self):
        item = {'key': 'sign', 'title': 'Sign: Handbook', 'needs_signature': True,
                'document_id': 'doc-0', 'status': 'pending', 'signature': None}
        assignment = {'id': 'a1', 'organization_id': ORG, 'user_id': 'kate',
                      'audience': 'staff', 'template_name': 'Handbook', 'items': [item]}
        saved = {}
        with patch.object(onboarding, '_load_assignment', return_value=assignment), \
             patch.object(onboarding, '_save_items',
                          side_effect=lambda a, items: saved.update(items=items) or a), \
             patch.object(onboarding, 'office_documents',
                          side_effect=lambda o, u, d=None: self._office_docs(d)), \
             patch.object(onboarding, '_admin', return_value=Mock()), \
             patch('services.sis_notifications.notify'), \
             patch.object(onboarding.sis_service, 'org_admin_ids', return_value=[]):
            result = onboarding.update_item(
                ORG, 'a1', 'sign',
                {'signature_name': 'Kate Myers', 'signature_agreed': True},
                actor_id='kate', is_admin=False)
        assert not result.get('error')
        # The evidence records what they had in front of them — the handbook,
        # not every paper in their portal.
        assert saved['items'][0]['signature']['documents'] == [
            {'id': 'doc-0', 'title': 'Handbook'}]

    def test_signing_is_refused_while_the_named_document_is_missing(self):
        """A copy pulled back (or a bad id) must not fall through to signing
        against whatever else happens to be in the portal."""
        item = {'key': 'sign', 'title': 'Sign: Handbook', 'needs_signature': True,
                'document_id': 'gone', 'status': 'pending', 'signature': None}
        assignment = {'id': 'a1', 'organization_id': ORG, 'user_id': 'kate',
                      'audience': 'staff', 'template_name': 'Handbook', 'items': [item]}
        with patch.object(onboarding, '_load_assignment', return_value=assignment), \
             patch.object(onboarding, '_save_items', side_effect=lambda a, items: a), \
             patch.object(onboarding, 'office_documents',
                          side_effect=lambda o, u, d=None: self._office_docs(d)), \
             patch.object(onboarding, '_admin', return_value=Mock()), \
             patch('services.sis_notifications.notify'), \
             patch.object(onboarding.sis_service, 'org_admin_ids', return_value=[]):
            result = onboarding.update_item(
                ORG, 'a1', 'sign',
                {'signature_name': 'Kate Myers', 'signature_agreed': True},
                actor_id='kate', is_admin=False)
        assert "hasn't uploaded" in result['error']


@pytest.mark.unit
class TestTrackingWhoSigned:

    def _batches(self, rows, docs, include_hr):
        def _table(name):
            t = Mock()
            for chained in ('select', 'eq', 'in_', 'order', 'not_', 'is_'):
                getattr(t, chained).return_value = t
            t.not_.is_.return_value = t
            if name == 'sis_onboarding_assignments':
                t.execute.return_value = Mock(data=rows)
            elif name == 'sis_secure_documents':
                wanted = docs if include_hr else [d for d in docs if d['sensitivity'] == 'general']
                t.execute.return_value = Mock(data=wanted)
            else:
                t.execute.return_value = Mock(data=[{'id': 'kate', 'display_name': 'Kate Myers'}])
            return t

        admin = Mock()
        admin.table.side_effect = _table
        with patch.object(onboarding, '_admin', return_value=admin):
            return onboarding.list_signature_batches(ORG, include_hr=include_hr)

    ROWS = [
        {'id': 'a1', 'batch_id': 'b1', 'user_id': 'kate', 'audience': 'staff',
         'template_name': 'Handbook', 'created_at': '2026-08-14T00:00:00Z',
         'assigned_by': SENDER,
         'items': [{'key': 'sign', 'document_id': 'doc-general', 'due_date': None,
                    'signature': {'name': 'Kate Myers', 'signed_at': '2026-08-15T00:00:00Z'}}]},
        {'id': 'a2', 'batch_id': 'b1', 'user_id': 'sam', 'audience': 'staff',
         'template_name': 'Handbook', 'created_at': '2026-08-14T00:00:00Z',
         'assigned_by': SENDER,
         'items': [{'key': 'sign', 'document_id': 'doc-general', 'due_date': None,
                    'signature': None}]},
        {'id': 'a3', 'batch_id': 'b2', 'user_id': 'kate', 'audience': 'staff',
         'template_name': 'Contract', 'created_at': '2026-08-13T00:00:00Z',
         'assigned_by': SENDER,
         'items': [{'key': 'sign', 'document_id': 'doc-hr', 'due_date': None,
                    'signature': None}]},
    ]
    DOCS = [{'id': 'doc-general', 'sensitivity': 'general', 'title': 'Handbook',
             'storage_path': 'p1'},
            {'id': 'doc-hr', 'sensitivity': 'hr', 'title': 'Contract',
             'storage_path': 'p2'}]

    def test_a_send_is_one_row_with_progress(self):
        batches = self._batches(self.ROWS, self.DOCS, include_hr=True)
        handbook = next(b for b in batches if b['title'] == 'Handbook')
        assert (handbook['signed_count'], handbook['total_count']) == (1, 2)

    def test_the_people_are_listed_with_who_signed_and_when(self):
        batches = self._batches(self.ROWS, self.DOCS, include_hr=True)
        handbook = next(b for b in batches if b['title'] == 'Handbook')
        signed = [p for p in handbook['recipients'] if p['signed']]
        assert signed[0]['signed_name'] == 'Kate Myers'
        assert signed[0]['signed_at'] == '2026-08-15T00:00:00Z'

    def test_the_front_office_never_sees_an_hr_send(self):
        """Not "sees it with the document hidden" — a campus coordinator has no
        business knowing a contract went out at all."""
        batches = self._batches(self.ROWS, self.DOCS, include_hr=False)
        assert [b['title'] for b in batches] == ['Handbook']

    def test_hr_sees_both(self):
        batches = self._batches(self.ROWS, self.DOCS, include_hr=True)
        assert sorted(b['title'] for b in batches) == ['Contract', 'Handbook']


@pytest.mark.unit
class TestChasingAnUnsignedDocument:
    """iCreate's natural next click after "3 of 12 signed": chase the other nine.

    Before this the only way to do it was outside the product, so the tracking
    view could tell you a document was stuck but not help you unstick it.
    """

    ROW = {'id': 'a1', 'organization_id': ORG, 'user_id': 'kate',
           'audience': 'staff', 'template_name': 'Handbook',
           'items': [{'key': 'sign', 'document_id': 'doc-1', 'signature': None}]}

    _UNSET = object()

    def _remind(self, row=_UNSET, sensitivity='general', include_hr=False,
                assignment_id='a1'):
        # A sentinel, not None: row=None is the "no such assignment" case.
        row = self.ROW if row is self._UNSET else row

        def _table(name):
            t = Mock()
            for chained in ('select', 'eq', 'limit'):
                getattr(t, chained).return_value = t
            if name == 'sis_secure_documents':
                t.execute.return_value = Mock(
                    data=[{'id': 'doc-1', 'sensitivity': sensitivity}])
            else:
                t.execute.return_value = Mock(data=[row] if row else [])
            return t

        admin = Mock()
        admin.table.side_effect = _table
        with patch.object(onboarding, '_admin', return_value=admin), \
             patch('services.sis_notifications.notify') as notify:
            result = onboarding.remind_signature_recipient(
                ORG, assignment_id, include_hr=include_hr)
        return result, notify

    def test_it_notifies_the_person_who_has_not_signed(self):
        result, notify = self._remind()
        assert result == {'reminded': 'kate'}
        assert notify.call_args[0][0] == 'kate'

    def test_a_staff_reminder_points_at_the_task_inbox(self):
        _, notify = self._remind()
        assert notify.call_args.kwargs['link'] == '/my-tasks'

    def test_a_family_reminder_points_at_the_family_portal(self):
        row = {**self.ROW, 'audience': 'family'}
        _, notify = self._remind(row=row)
        assert notify.call_args.kwargs['link'] == '/family/portal'

    def test_somebody_who_already_signed_is_not_chased(self):
        row = {**self.ROW,
               'items': [{'key': 'sign', 'document_id': 'doc-1',
                          'signature': {'name': 'Kate Myers'}}]}
        result, notify = self._remind(row=row)
        assert result['status'] == 400
        assert notify.call_count == 0

    def test_the_front_office_cannot_chase_an_hr_send(self):
        """The gate is the DOCUMENT's sensitivity, as it is on the listing —
        otherwise a coordinator could reach a contract by guessing an id."""
        result, notify = self._remind(sensitivity='hr', include_hr=False)
        assert result['status'] == 404
        assert notify.call_count == 0

    def test_hr_can_chase_its_own_send(self):
        result, notify = self._remind(sensitivity='hr', include_hr=True)
        assert result == {'reminded': 'kate'}
        assert notify.call_count == 1

    def test_an_hr_send_is_not_confirmed_to_exist(self):
        """404 and not 403: "you may not chase this" tells a coordinator that a
        contract went to that person, which is the thing being withheld."""
        result, _ = self._remind(sensitivity='hr', include_hr=False)
        assert result['error'] == 'Not found'

    def test_another_schools_assignment_is_not_reachable(self):
        row = {**self.ROW, 'organization_id': 'other-org'}
        result, notify = self._remind(row=row)
        assert result['status'] == 404
        assert notify.call_count == 0

    def test_an_unknown_assignment_is_not_found(self):
        result, notify = self._remind(row=None)
        assert result['status'] == 404
        assert notify.call_count == 0

"""
The two doors to sending a document for signature.

The same action is reachable from the front office (ADMIN_ROLES, so campus
coordinators included) and from HR (HR_ROLES). The difference is not which
endpoint exists but what may go through it: a coordinator sends campus paperwork
and never employment paperwork. Because that restriction is about the CONTENTS
of the document rather than the shape of the request, it has to be enforced on
the value — which is exactly the kind of check that rots quietly, so it is
tested at the view boundary rather than only in the service.
"""

from io import BytesIO
from unittest.mock import Mock, patch

import pytest

from routes.sis import signature_request_views as views


ORG = 'org-1'
SENDER = 'admin-1'

# A genuine (if minimal) PDF: the upload path identifies files by their magic
# bytes rather than the uploader's Content-Type header, so a placeholder named
# .pdf is correctly refused (sis_secure_docs_service.resolve_content_type).
MINIMAL_PDF = b'%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'


def _post(app, path, allow_hr, **fields):
    """Drive a view body directly with a multipart request context."""
    data = {'file': (BytesIO(MINIMAL_PDF), 'handbook.pdf'), 'organization_id': ORG}
    data.update(fields)
    with app.test_request_context(path, method='POST', data=data,
                                  content_type='multipart/form-data'):
        with patch.object(views.sis_onboarding_service, 'send_for_signature',
                          return_value={'batch_id': 'b1', 'sent': 1,
                                        'document_title': 'Handbook'}) as send:
            resp = views.send_signature_request(SENDER, ORG, allow_hr=allow_hr)
    body, status = (resp if isinstance(resp, tuple) else (resp, 200))
    return body.get_json(), status, send


@pytest.fixture
def app():
    from app import app as flask_app
    return flask_app


@pytest.mark.unit
class TestSendingCampusPaperwork:

    def test_the_front_office_can_send_it(self, app):
        body, status, send = _post(app, '/api/sis/staff-admin/signature-requests',
                                   allow_hr=False, staff_user_id='kate')
        assert status == 201 and body['success'] is True
        assert send.call_args.kwargs['sensitivity'] == 'general'

    def test_staff_and_families_arrive_as_one_recipient_list(self, app):
        _body, _status, send = _post(
            app, '/api/sis/staff-admin/signature-requests', allow_hr=False,
            staff_user_id='kate', family_user_id='parent-1')
        assert send.call_args[0][-1] == [{'id': 'kate', 'audience': 'staff'},
                                         {'id': 'parent-1', 'audience': 'family'}]

    def test_sending_to_nobody_is_refused(self, app):
        body, status, send = _post(app, '/api/sis/staff-admin/signature-requests',
                                   allow_hr=False)
        assert status == 400
        assert send.call_count == 0

    def test_a_file_is_required(self, app):
        with app.test_request_context('/api/sis/staff-admin/signature-requests',
                                      method='POST',
                                      data={'organization_id': ORG, 'staff_user_id': 'kate'},
                                      content_type='multipart/form-data'):
            resp = views.send_signature_request(SENDER, ORG, allow_hr=False)
        _body, status = resp
        assert status == 400

    def test_an_unsupported_file_type_is_refused(self, app):
        with app.test_request_context(
                '/api/sis/staff-admin/signature-requests', method='POST',
                data={'file': (BytesIO(b'x'), 'virus.exe'), 'organization_id': ORG,
                      'staff_user_id': 'kate'},
                content_type='multipart/form-data'):
            resp = views.send_signature_request(SENDER, ORG, allow_hr=False)
        body, status = resp
        assert status == 400 and 'Allowed types' in body.get_json()['error']


@pytest.mark.unit
class TestTheHrLine:

    def test_the_front_office_cannot_send_hr_paperwork(self, app):
        """Asking for it explicitly is refused — the restriction lives on the
        value, so it must survive a caller who knows the field name."""
        body, status, send = _post(app, '/api/sis/staff-admin/signature-requests',
                                   allow_hr=False, staff_user_id='kate',
                                   sensitivity='hr')
        assert status == 403
        assert send.call_count == 0

    def test_hr_can_send_hr_paperwork(self, app):
        _body, status, send = _post(app, '/api/sis/secure-documents/signature-requests',
                                    allow_hr=True, staff_user_id='kate',
                                    sensitivity='hr')
        assert status == 201
        assert send.call_args.kwargs['sensitivity'] == 'hr'

    def test_hr_still_defaults_to_campus_paperwork(self, app):
        """Most of what even HR sends is ordinary; defaulting the other way would
        quietly hide handbooks from the coordinator who has to chase them."""
        _body, _status, send = _post(app, '/api/sis/secure-documents/signature-requests',
                                     allow_hr=True, staff_user_id='kate')
        assert send.call_args.kwargs['sensitivity'] == 'general'


@pytest.mark.unit
class TestResendingSomethingAlreadyStored:

    def _resend(self, app, allow_hr, source):
        with app.test_request_context(
                '/api/sis/staff-admin/signature-requests', method='POST',
                data={'organization_id': ORG, 'staff_user_id': 'kate',
                      'document_id': 'doc-1'},
                content_type='multipart/form-data'):
            with patch.object(views.sis_secure_docs_service, 'get_document',
                              return_value=source), \
                 patch.object(views.sis_secure_docs_service, 'load_blob',
                              return_value=b'pdf-bytes'), \
                 patch.object(views.sis_onboarding_service, 'send_for_signature',
                              return_value={'batch_id': 'b1', 'sent': 1}) as send:
                resp = views.send_signature_request(SENDER, ORG, allow_hr=allow_hr)
        body, status = (resp if isinstance(resp, tuple) else (resp, 200))
        return body.get_json(), status, send

    GENERAL = {'id': 'doc-1', 'organization_id': ORG, 'filename': 'handbook.pdf',
               'title': 'Handbook', 'content_type': 'application/pdf',
               'size_bytes': 9, 'sensitivity': 'general', 'storage_path': 'p1'}
    HR = {**GENERAL, 'sensitivity': 'hr', 'filename': 'contract.pdf', 'title': 'Contract'}

    def test_a_stored_document_can_be_sent_to_more_people(self, app):
        _body, status, send = self._resend(app, allow_hr=False, source=self.GENERAL)
        assert status == 201
        assert send.call_args.kwargs['title'] == 'Handbook'

    def test_the_front_office_cannot_reach_an_hr_document(self, app):
        _body, status, send = self._resend(app, allow_hr=False, source=self.HR)
        assert status == 404
        assert send.call_count == 0

    def test_resending_an_hr_document_keeps_it_hr(self, app):
        """Sensitivity travels with the document. A send that could downgrade it
        would be a way to launder a contract into the coordinator's view."""
        _body, _status, send = self._resend(app, allow_hr=True, source=self.HR)
        assert send.call_args.kwargs['sensitivity'] == 'hr'

    def test_an_unknown_document_is_not_found(self, app):
        _body, status, send = self._resend(app, allow_hr=True, source=None)
        assert status == 404
        assert send.call_count == 0


@pytest.mark.unit
class TestListingSends:

    def test_the_front_office_list_excludes_hr(self, app):
        with app.test_request_context('/api/sis/staff-admin/signature-requests'):
            with patch.object(views.sis_onboarding_service, 'list_signature_batches',
                              return_value=[]) as lister:
                views.list_signature_requests(ORG, include_hr=False)
        assert lister.call_args.kwargs['include_hr'] is False

    def test_the_hr_list_includes_everything(self, app):
        with app.test_request_context('/api/sis/secure-documents/signature-requests'):
            with patch.object(views.sis_onboarding_service, 'list_signature_batches',
                              return_value=[]) as lister:
                views.list_signature_requests(ORG, include_hr=True)
        assert lister.call_args.kwargs['include_hr'] is True


@pytest.mark.unit
class TestTheRoutesAreGatedAsIntended:
    """The decorators themselves — a coordinator reaches one blueprint's pair and
    not the other's, and that is the whole of the split."""

    def test_the_office_endpoints_are_admin_gated_and_the_hr_ones_are_not(self):
        from utils.sis_roles import ADMIN_ROLES, HR_ROLES
        assert 'campus_coordinator' in ADMIN_ROLES
        assert 'campus_coordinator' not in HR_ROLES

    def test_both_paths_exist_and_neither_shadows_the_other(self, app):
        paths = {str(r) for r in app.url_map.iter_rules()}
        assert '/api/sis/staff-admin/signature-requests' in paths
        assert '/api/sis/secure-documents/signature-requests' in paths


@pytest.mark.unit
class TestASuperadminSendingFromTheOrgPicker:
    """Reported 2026-08-14: a superadmin got "No organization in context" from
    Send for signature no matter which school they were viewing.

    A superadmin has no organization_id of their own, so the org has to come off
    the request. Every other SIS caller was insulated from the real defect —
    resolve_org_id falls back to the caller's own org — which is why an
    org-scoped admin never saw it and a superadmin could never get past it.

    The defect: _org_or_error read the query string and the JSON body only. A
    file upload is multipart, so get_json() yields nothing and the org the SIS
    org picker sent arrives in request.form. This covers every multipart SIS
    endpoint, not only this one.
    """

    def _resolve(self, app, module, path, method='POST', data=None, query=''):
        with app.test_request_context(f'{path}{query}', method=method, data=data,
                                      content_type='multipart/form-data'):
            with patch.object(module.sis_service, 'resolve_org_id',
                              side_effect=lambda _uid, requested: requested) as resolve:
                org_id, err = module._org_or_error('superadmin-1')
        return org_id, err, resolve

    def test_the_org_is_read_off_a_multipart_upload(self, app):
        from routes.sis import secure_documents
        org_id, err, _ = self._resolve(
            app, secure_documents, '/api/sis/secure-documents/upload',
            data={'organization_id': ORG, 'file': (BytesIO(MINIMAL_PDF), 'x.pdf')})
        assert err is None
        assert org_id == ORG

    def test_the_front_office_send_door_reads_it_too(self, app):
        from routes.sis import staff_admin
        org_id, err, _ = self._resolve(
            app, staff_admin, '/api/sis/staff-admin/signature-requests',
            data={'organization_id': ORG, 'file': (BytesIO(MINIMAL_PDF), 'x.pdf')})
        assert err is None
        assert org_id == ORG

    def test_the_shared_helper_reads_it(self, app):
        import routes.sis as sis_routes
        org_id, err, _ = self._resolve(
            app, sis_routes, '/api/sis/anything',
            data={'organization_id': ORG, 'file': (BytesIO(MINIMAL_PDF), 'x.pdf')})
        assert err is None
        assert org_id == ORG

    def test_the_query_string_still_wins(self, app):
        """Belt and braces: the client sends both, and the query string is the
        one every SIS endpoint has always read."""
        from routes.sis import staff_admin
        _, _, resolve = self._resolve(
            app, staff_admin, '/api/sis/staff-admin/signature-requests',
            query=f'?organization_id={ORG}',
            data={'organization_id': 'other-org', 'file': (BytesIO(MINIMAL_PDF), 'x.pdf')})
        assert resolve.call_args[0][1] == ORG

    def test_no_org_anywhere_is_still_a_clear_400(self, app):
        from routes.sis import staff_admin
        org_id, err, _ = self._resolve(
            app, staff_admin, '/api/sis/staff-admin/signature-requests',
            data={'file': (BytesIO(MINIMAL_PDF), 'x.pdf')})
        assert org_id is None
        assert err[1] == 400
        assert 'organization_id' in err[0].get_json()['error']


@pytest.mark.unit
class TestRequiringASignatureBeforeAccess:
    """iCreate, 2026-08-18: block a family's platform access until they sign.

    The flag rides on the same send. What matters at this boundary is that a
    multipart checkbox is read as a boolean rather than as a non-empty string,
    and that it cannot be set on a send that would silently do nothing with it.
    """

    def test_the_flag_reaches_the_service(self, app):
        _body, status, send = _post(
            app, '/api/sis/staff-admin/signature-requests', allow_hr=False,
            family_user_id='parent-1', blocks_access='true')
        assert status == 201
        assert send.call_args.kwargs['blocks_access'] is True

    def test_a_send_without_the_flag_holds_nobody(self, app):
        _body, _status, send = _post(
            app, '/api/sis/staff-admin/signature-requests', allow_hr=False,
            family_user_id='parent-1')
        assert send.call_args.kwargs['blocks_access'] is False

    def test_the_string_false_means_false(self, app):
        """FormData sends strings. `bool('false')` is True, which would make
        every send from a browser that submits unchecked boxes a lock-out."""
        _body, _status, send = _post(
            app, '/api/sis/staff-admin/signature-requests', allow_hr=False,
            family_user_id='parent-1', blocks_access='false')
        assert send.call_args.kwargs['blocks_access'] is False

    def test_requiring_it_with_no_families_on_the_send_is_refused(self, app):
        """The hold is family-side. Accepting the box on a staff-only send
        would report success and do nothing — worse than saying no."""
        body, status, send = _post(
            app, '/api/sis/staff-admin/signature-requests', allow_hr=False,
            staff_user_id='kate', blocks_access='true')
        assert status == 400
        assert 'families' in body['error'].lower()
        assert send.call_count == 0


@pytest.mark.unit
class TestReleasingAHold:

    def _release(self, app, *, visible=True, released=True):
        with app.test_request_context('/api/sis/staff-admin/signature-requests/a-1/release',
                                      method='POST'):
            with patch.object(views.sis_onboarding_service,
                              'may_see_signature_assignment', return_value=visible), \
                 patch.object(views.sis_access_gate, 'release',
                              return_value={'released': released,
                                            'user_id': 'parent-1'}) as rel:
                resp = views.release_signature_hold(ORG, 'a-1', include_hr=False)
        body, status = (resp if isinstance(resp, tuple) else (resp, 200))
        return body.get_json(), status, rel

    def test_the_office_can_let_a_family_back_in(self, app):
        body, status, rel = self._release(app)
        assert status == 200 and body['released'] is True
        assert rel.call_args[0] == (ORG, 'a-1')

    def test_a_send_the_caller_may_not_see_is_not_releasable(self, app):
        """A coordinator must not be able to touch an employment contract's
        assignment by guessing its id — the same document-sensitivity rule
        that governs reminders."""
        body, status, rel = self._release(app, visible=False)
        assert status == 404 and body['error'] == 'Not found'
        assert rel.call_count == 0

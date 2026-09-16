"""The image safety gate on uploads, and the hash matcher behind it.

What must stay true:

  * a known-CSAM match refuses the upload with a sentence that says nothing,
    quarantines the bytes, records the incident and tells the superadmins;
    nobody else is told and no hold is written
  * a provider outage is logged and counted, never a match and never a
    refusal (fail-open, like the message screen)
  * with the provider off, nothing is sent anywhere
  * a student's picture goes to the classifier; an adult's does not; a chat
    attachment is hash-matched only
  * a classifier hold keeps the picture for the parent under held/ and
    records a hold the parent is told about
  * a video or a document passes untouched
"""

import io
from unittest.mock import Mock, patch

from PIL import Image

from services import csam_match_service as cm
from services import upload_safety_service as gate
from services.peer_text_screen_service import ScreenResult


def _png(w=16, h=16):
    out = io.BytesIO()
    Image.new('RGB', (w, h), (10, 200, 30)).save(out, format='PNG')
    return out.getvalue()


# ---------------------------------------------------------------------------
# The matcher
# ---------------------------------------------------------------------------

def test_with_no_provider_nothing_is_sent_anywhere():
    with patch.object(cm.Config, 'CSAM_MATCH_PROVIDER', 'off'), \
         patch('requests.post') as post:
        out = cm.match(_png(), 'image/png')
    assert out.skipped and not out.matched and out.error is None
    post.assert_not_called()


def test_photodna_reads_ismatch_and_sends_the_key():
    resp = Mock(status_code=200, content=b'{}')
    resp.json.return_value = {'Status': {'Code': 3000}, 'IsMatch': True, 'TrackingId': 't1',
                              'MatchDetails': {'x': 1}}
    with patch.object(cm.Config, 'CSAM_MATCH_PROVIDER', 'photodna'), \
         patch.object(cm.Config, 'PHOTODNA_API_KEY', 'k'), \
         patch('requests.post', return_value=resp) as post:
        out = cm.match(b'bytes', 'image/jpeg')
    assert out.matched and out.provider == 'photodna'
    assert out.details['tracking_id'] == 't1'
    assert post.call_args.kwargs['headers']['Ocp-Apim-Subscription-Key'] == 'k'
    assert post.call_args.kwargs['timeout'] == cm.MATCH_TIMEOUT


def test_a_provider_error_is_reported_not_raised_and_not_a_match():
    with patch.object(cm.Config, 'CSAM_MATCH_PROVIDER', 'photodna'), \
         patch.object(cm.Config, 'PHOTODNA_API_KEY', 'k'), \
         patch('requests.post', side_effect=RuntimeError('timeout')):
        out = cm.match(b'bytes', 'image/jpeg')
    assert not out.matched and 'timeout' in out.error
    resp = Mock(status_code=401, content=b'x', text='bad key')
    with patch.object(cm.Config, 'CSAM_MATCH_PROVIDER', 'photodna'), \
         patch.object(cm.Config, 'PHOTODNA_API_KEY', 'k'), \
         patch('requests.post', return_value=resp):
        out = cm.match(b'bytes', 'image/jpeg')
    assert not out.matched and out.error.startswith('HTTP 401')


def test_a_configured_provider_with_no_key_is_an_error_not_silence():
    with patch.object(cm.Config, 'CSAM_MATCH_PROVIDER', 'photodna'), \
         patch.object(cm.Config, 'PHOTODNA_API_KEY', None):
        out = cm.match(b'bytes', 'image/jpeg')
    assert out.error and 'PHOTODNA_API_KEY' in out.error


# ---------------------------------------------------------------------------
# The gate
# ---------------------------------------------------------------------------

def test_a_video_or_a_document_passes_untouched():
    with patch.object(cm, 'match') as match:
        assert gate.check_image(b'x', 'video/mp4', user_id='kid', purpose='evidence').allowed
        assert gate.check_image(b'x', 'application/pdf', user_id='kid', purpose='evidence').allowed
    match.assert_not_called()


def test_a_hash_match_refuses_quarantines_records_and_alerts_and_says_nothing():
    storage = Mock()
    admin = Mock(storage=storage)
    incidents = Mock()
    incidents.record.return_value = 'inc-1'
    with patch.object(cm, 'match', return_value=cm.MatchResult(True, 'photodna', details={'t': 1})), \
         patch('database.get_supabase_admin_client', return_value=admin), \
         patch('repositories.csam_incident_repository.CsamIncidentRepository', return_value=incidents), \
         patch.object(gate, '_alert_superadmins') as alert, \
         patch('services.peer_text_screen_service.record_hold') as hold, \
         patch.object(gate, '_is_student', return_value=True):
        out = gate.check_image(_png(), 'image/png', user_id='kid', purpose='evidence',
                               filename='a.png')
    assert not out.allowed and out.kind == gate.KIND_CSAM
    assert out.message == gate.NEUTRAL_REFUSAL
    assert 'safety' not in out.message.lower()
    storage.from_.assert_called_once_with(gate.Config.CSAM_QUARANTINE_BUCKET)
    kw = incidents.record.call_args.kwargs
    assert kw['user_id'] == 'kid' and kw['provider'] == 'photodna' and len(kw['sha256']) == 64
    assert kw['storage_path'] is not None
    alert.assert_called_once()
    assert alert.call_args.args[0] == 'inc-1'
    hold.assert_not_called()  # no parent hears about this one


def test_a_hash_match_is_refused_even_when_the_quarantine_write_fails():
    storage = Mock()
    storage.from_.return_value.upload.side_effect = RuntimeError('bucket down')
    admin = Mock(storage=storage)
    incidents = Mock()
    incidents.record.return_value = 'inc-2'
    with patch.object(cm, 'match', return_value=cm.MatchResult(True, 'photodna')), \
         patch('database.get_supabase_admin_client', return_value=admin), \
         patch('repositories.csam_incident_repository.CsamIncidentRepository', return_value=incidents), \
         patch.object(gate, '_alert_superadmins'):
        out = gate.check_image(_png(), 'image/png', user_id='kid', purpose='evidence')
    assert not out.allowed and out.incident_id == 'inc-2'
    assert incidents.record.call_args.kwargs['storage_path'] is None


def test_a_provider_outage_lets_the_upload_through_and_logs_it():
    with patch.object(cm, 'match', return_value=cm.MatchResult(False, 'photodna', error='HTTP 503')), \
         patch.object(gate, '_is_student', return_value=False), \
         patch.object(gate.logger, 'error') as log:
        out = gate.check_image(_png(), 'image/png', user_id='teacher', purpose='avatar')
    assert out.allowed and out.kind == gate.KIND_CLEAR
    log.assert_called_once()


def _judging(answer):
    svc = Mock()
    svc.UPLOAD_PROMPT = 'UPLOAD {text}'
    svc.judge.return_value = answer
    return svc


def test_a_students_picture_goes_to_the_classifier_with_the_upload_rules():
    svc = _judging(ScreenResult('clear'))
    with patch.object(cm, 'match', return_value=cm.MatchResult(False, 'off', skipped=True)), \
         patch.object(gate, '_is_student', return_value=True), \
         patch('services.peer_text_screen_service.PeerTextScreenService', return_value=svc):
        out = gate.check_image(_png(), 'image/png', user_id='kid', purpose='evidence',
                               filename='volcano.png')
    assert out.allowed and out.kind == gate.KIND_CLEAR
    args, kwargs = svc.judge.call_args
    assert args[0] == 'Task evidence: volcano.png'
    assert args[1][0]['mime_type'] == 'image/jpeg'
    assert kwargs['prompt'] == svc.UPLOAD_PROMPT


def test_an_adults_picture_and_a_chat_attachment_skip_the_classifier():
    svc = _judging(ScreenResult('flagged', ['x'], 'm'))
    with patch.object(cm, 'match', return_value=cm.MatchResult(False, 'off', skipped=True)), \
         patch.object(gate, '_is_student', return_value=False), \
         patch('services.peer_text_screen_service.PeerTextScreenService', return_value=svc):
        assert gate.check_image(_png(), 'image/png', user_id='teacher', purpose='evidence').allowed
    with patch.object(cm, 'match', return_value=cm.MatchResult(False, 'off', skipped=True)), \
         patch.object(gate, '_is_student', return_value=True), \
         patch('services.peer_text_screen_service.PeerTextScreenService', return_value=svc):
        assert gate.check_image(_png(), 'image/png', user_id='kid', purpose='message_attachment',
                                classify=False).allowed
    svc.judge.assert_not_called()


def test_a_flagged_picture_is_held_kept_for_the_parent_and_refused():
    svc = _judging(ScreenResult('flagged', ['nudity'], 'gemini-test'))
    storage = Mock()
    admin = Mock(storage=storage)
    with patch.object(cm, 'match', return_value=cm.MatchResult(False, 'off', skipped=True)), \
         patch.object(gate, '_is_student', return_value=True), \
         patch('services.peer_text_screen_service.PeerTextScreenService', return_value=svc), \
         patch('database.get_supabase_admin_client', return_value=admin), \
         patch('services.peer_text_screen_service.record_hold', return_value='h1') as hold:
        out = gate.check_image(_png(), 'image/png', user_id='kid', purpose='avatar',
                               filename='me.png')
    assert not out.allowed and out.kind == gate.KIND_HELD and out.hold_id == 'h1'
    assert out.message == gate.HELD_REFUSAL
    path = storage.from_.return_value.upload.call_args.args[0]
    assert path.startswith('held/kid/') and path.endswith('.jpg')
    kw = hold.call_args.kwargs
    assert kw['surface'] == 'upload' and kw['author_id'] == 'kid'
    assert kw['text'] == 'Profile photo: me.png'
    assert kw['attachments'][0]['type'] == 'image' and 'held/kid/' in kw['attachments'][0]['url']
    assert kw['result'].reasons == ['nudity']


def test_a_classifier_outage_lets_the_upload_through():
    svc = _judging(ScreenResult('error'))
    with patch.object(cm, 'match', return_value=cm.MatchResult(False, 'off', skipped=True)), \
         patch.object(gate, '_is_student', return_value=True), \
         patch('services.peer_text_screen_service.PeerTextScreenService', return_value=svc):
        assert gate.check_image(_png(), 'image/png', user_id='kid', purpose='evidence').allowed


def test_the_switch_turns_the_classifier_off_but_not_the_match():
    svc = _judging(ScreenResult('flagged', ['x'], 'm'))
    with patch.object(gate.Config, 'UPLOAD_IMAGE_SCREEN_ENABLED', False), \
         patch.object(cm, 'match', return_value=cm.MatchResult(False, 'off', skipped=True)) as match, \
         patch.object(gate, '_is_student', return_value=True), \
         patch('services.peer_text_screen_service.PeerTextScreenService', return_value=svc):
        assert gate.check_image(_png(), 'image/png', user_id='kid', purpose='evidence').allowed
    match.assert_called_once()
    svc.judge.assert_not_called()


def test_the_superadmins_hear_three_ways_and_the_message_names_no_image():
    users = Mock()
    users.find_by_role.return_value = [{'id': 'sa1', 'email': 'sa@x', 'first_name': 'T'}]
    notify = Mock()
    email = Mock()
    with patch('repositories.user_repository.UserRepository', return_value=users), \
         patch('services.notification_service.NotificationService', return_value=notify), \
         patch('services.email_service.email_service', email), \
         patch('sentry_sdk.capture_message') as sentry, \
         patch('sentry_sdk.push_scope'):
        gate._alert_superadmins('inc-1', user_id='kid', purpose='evidence', provider='photodna')
    sentry.assert_called_once()
    n = notify.create_notification.call_args.kwargs
    assert n['user_id'] == 'sa1' and n['notification_type'] == 'system_alert'
    assert 'inc-1' in n['message'] and 'CHILD_SAFETY_REPORTING' in n['message']
    e = email.send_templated_email.call_args.kwargs
    assert e['to_email'] == 'sa@x' and e['template_name'] == 'csam_incident'
    assert e['context']['incident_id'] == 'inc-1'


def test_an_upload_hold_tells_the_parent_it_was_a_picture():
    from services import peer_text_screen_service as ts
    repo = Mock()
    repo.matching_hold.return_value = None
    repo.record_hold.return_value = 'h1'
    notify = Mock()
    with patch('repositories.peer_text_screen_repository.PeerTextScreenRepository', return_value=repo), \
         patch('services.notification_service.NotificationService', return_value=notify), \
         patch('utils.class_membership.guardians_by_student', return_value={'kid': {'mum'}}), \
         patch.object(ts, '_first_name', return_value='Sam'):
        ts.record_hold(author_id='kid', surface=ts.SURFACE_UPLOAD, text='Task evidence: a.png',
                       result=ScreenResult('flagged', ['nudity'], 'm'),
                       attachments=[{'url': 'u', 'type': 'image', 'name': 'a.png', 'size': 1}])
    body = notify.create_notification.call_args.kwargs['message']
    assert body == 'Sam uploaded a picture that our safety check held. It was not saved. "Task evidence: a.png"'

"""
Read receipts for family messages.

A school sends "pick up at noon Friday" and has no idea whether anyone saw it.
Three pieces close that loop:

- publish() snapshots WHO a send was aimed at (announcement_recipients) —
  recipient resolution is dynamic (parents come via their children), so without
  the snapshot "who was sent this" cannot be answered later;
- POST /api/announcements/mark-read writes announcement_reads (idempotent);
- the staff list carries read_count / recipient_count from the aggregate view,
  and POST /api/announcements/<id>/nudge reminds exactly the recipients who
  haven't read it — at most once per 24h, and never for messages that predate
  the snapshot.
"""

import json
import uuid as uuid_mod
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

import pytest
from flask import Flask

from routes import announcements as routes
from services import announcement_service as svc


def _table(data=None):
    t = Mock()
    for m in ('select', 'eq', 'in_', 'single', 'limit', 'order', 'range',
              'upsert', 'insert', 'update', 'or_', 'delete', 'filter'):
        getattr(t, m).return_value = t
    t.execute.return_value = Mock(data=data)
    return t


def _client(tables):
    client = Mock()
    client.table.side_effect = lambda name: tables[name]
    return client


def _status(resp):
    return resp[1] if isinstance(resp, tuple) else 200


def _json(resp):
    body = resp[0] if isinstance(resp, tuple) else resp
    return body.get_json()


A1 = str(uuid_mod.uuid4())
A2 = str(uuid_mod.uuid4())
A3 = str(uuid_mod.uuid4())

PARENT = {'role': 'parent', 'org_role': None, 'org_roles': None}
ORG_ADMIN = {'role': 'org_managed', 'org_role': 'org_admin',
             'org_roles': ['org_admin'], 'organization_id': 'org-1'}
ADVISOR = {'role': 'org_managed', 'org_role': 'advisor',
           'org_roles': ['advisor'], 'organization_id': 'org-1'}
SUPERADMIN = {'role': 'superadmin', 'org_role': None, 'org_roles': None,
              'organization_id': None}


# ── POST /api/announcements/mark-read ────────────────────────────────────────
def _mark_read(caller, body, member_org='org-1', org_announcements=None,
               recipients=None):
    """Call the unwrapped view with a mocked admin client. `org_announcements`
    is what the org-filtered announcements query returns (the fence);
    `recipients` is the announcement_recipients snapshot rows those ids have.
    Empty (the default) means the sends predate snapshots.

    The route reads the snapshot through two id-bounded queries rather than
    pulling every recipient row, so the mocks (which ignore filters) return
    what each of those queries would: one stats row per snapshotted send, and
    only the CALLER's own recipient rows."""
    snapshot = recipients or []
    stats = [{'announcement_id': aid, 'recipient_count':
              sum(1 for r in snapshot if r['announcement_id'] == aid)}
             for aid in dict.fromkeys(r['announcement_id'] for r in snapshot)]
    view = getattr(routes.mark_announcements_read, '__wrapped__',
                   routes.mark_announcements_read)
    tables = {
        'users': _table(caller),
        'announcements': _table(org_announcements or []),
        'announcement_reads': _table([]),
        'announcement_read_stats': _table(stats),
        'announcement_recipients': _table(
            [r for r in snapshot if r.get('user_id') == 'caller-1']),
    }
    client = _client(tables)
    app = Flask(__name__)
    with app.test_request_context('/api/announcements/mark-read', method='POST',
                                  data=json.dumps(body),
                                  content_type='application/json'), \
         patch.object(routes, 'get_supabase_admin_client', return_value=client), \
         patch.object(routes.sis_service, 'member_org_id',
                      return_value=member_org) as member:
        resp = view('caller-1')
    return resp, tables, member


@pytest.mark.unit
class TestMarkRead:
    def test_marks_valid_ids_and_is_an_upsert(self):
        resp, tables, _ = _mark_read(
            PARENT, {'announcement_ids': [A1, A2]},
            org_announcements=[{'id': A1}, {'id': A2}])
        assert _status(resp) == 200
        assert _json(resp)['marked'] == 2
        rows = tables['announcement_reads'].upsert.call_args[0][0]
        assert rows == [{'announcement_id': A1, 'user_id': 'caller-1'},
                        {'announcement_id': A2, 'user_id': 'caller-1'}]
        kwargs = tables['announcement_reads'].upsert.call_args.kwargs
        # Idempotent: re-marking a read announcement is a no-op, not an error.
        assert kwargs['on_conflict'] == 'announcement_id,user_id'
        assert kwargs['ignore_duplicates'] is True

    def test_ids_are_fenced_to_the_callers_org(self):
        """Another org's announcement id in the batch is dropped, not marked —
        and the announcements query itself carries the org filter."""
        resp, tables, _ = _mark_read(
            PARENT, {'announcement_ids': [A1, A3]},
            org_announcements=[{'id': A1}])   # A3 belongs elsewhere
        assert _json(resp)['marked'] == 1
        rows = tables['announcement_reads'].upsert.call_args[0][0]
        assert [r['announcement_id'] for r in rows] == [A1]
        org_filters = [c.args for c in tables['announcements'].eq.call_args_list]
        assert ('organization_id', 'org-1') in org_filters

    def test_superadmin_skips_the_org_filter(self):
        resp, tables, member = _mark_read(
            SUPERADMIN, {'announcement_ids': [A1]},
            org_announcements=[{'id': A1}])
        assert _json(resp)['marked'] == 1
        tables['announcements'].eq.assert_not_called()
        member.assert_not_called()

    def test_only_a_recipient_can_mark_a_snapshotted_send_read(self):
        """Otherwise anyone in the org opening the school page counts as a read
        of a message they were never sent. iCreate has sends showing 71 reads
        against 0 recipients."""
        resp, tables, _ = _mark_read(
            PARENT, {'announcement_ids': [A1, A2]},
            org_announcements=[{'id': A1}, {'id': A2}],
            recipients=[{'announcement_id': A1, 'user_id': 'caller-1'},
                        {'announcement_id': A2, 'user_id': 'somebody-else'}])
        assert _json(resp)['marked'] == 1
        rows = tables['announcement_reads'].upsert.call_args[0][0]
        assert [r['announcement_id'] for r in rows] == [A1]

    def test_a_non_recipient_marks_nothing(self):
        resp, tables, _ = _mark_read(
            PARENT, {'announcement_ids': [A1]},
            org_announcements=[{'id': A1}],
            recipients=[{'announcement_id': A1, 'user_id': 'somebody-else'}])
        assert _json(resp)['marked'] == 0
        tables['announcement_reads'].upsert.assert_not_called()

    def test_the_snapshot_is_never_read_whole(self):
        """One row per announcement, not one per recipient. Reading the whole
        snapshot for a batch of ids is an org-sized read, and PostgREST cuts it
        off at 1000 rows in silence (OPTIO-BACKEND-7Q): the dropped tail looks
        like "no snapshot", which hands the caller read credit for sends they
        were never on."""
        _, tables, _ = _mark_read(
            PARENT, {'announcement_ids': [A1]},
            org_announcements=[{'id': A1}],
            recipients=[{'announcement_id': A1, 'user_id': 'caller-1'}])
        eq_filters = [c.args for c in tables['announcement_recipients'].eq.call_args_list]
        assert ('user_id', 'caller-1') in eq_filters

    def test_sends_predating_the_snapshot_still_mark_read(self):
        """No snapshot means nothing to check against, and the read view already
        reports no ratio for those — refusing them would only lose the read."""
        resp, tables, _ = _mark_read(
            PARENT, {'announcement_ids': [A1]},
            org_announcements=[{'id': A1}], recipients=[])
        assert _json(resp)['marked'] == 1

    def test_a_caller_with_no_org_marks_nothing(self):
        resp, tables, _ = _mark_read(PARENT, {'announcement_ids': [A1]},
                                     member_org=None)
        assert _status(resp) == 200
        assert _json(resp)['marked'] == 0
        tables['announcement_reads'].upsert.assert_not_called()

    def test_more_than_fifty_ids_is_refused(self):
        many = [str(uuid_mod.uuid4()) for _ in range(51)]
        resp, _, _ = _mark_read(PARENT, {'announcement_ids': many})
        assert _status(resp) == 400

    def test_garbage_ids_are_dropped_not_fatal(self):
        resp, tables, _ = _mark_read(
            PARENT, {'announcement_ids': ['not-a-uuid', A1]},
            org_announcements=[{'id': A1}])
        assert _json(resp)['marked'] == 1

    def test_nothing_valid_is_a_400(self):
        resp, _, _ = _mark_read(PARENT, {'announcement_ids': ['nope']})
        assert _status(resp) == 400

    def test_a_missing_list_is_a_400(self):
        resp, _, _ = _mark_read(PARENT, {})
        assert _status(resp) == 400


# ── Read stats on GET /api/announcements ─────────────────────────────────────
ROW1 = {'id': 'a1', 'title': 'Field trip', 'message': 'Boots.',
        'target_audience': 'everyone', 'author_id': 'adm-1',
        'created_at': '2026-08-20T00:00:00+00:00', 'last_nudged_at': None}
ROW2 = {'id': 'a2', 'title': 'Old note', 'message': 'B',
        'target_audience': 'everyone', 'author_id': 'adm-1',
        'created_at': '2026-08-01T00:00:00+00:00', 'last_nudged_at': None}


def _list(caller, tables_extra=None):
    view = getattr(routes.list_announcements, '__wrapped__',
                   routes.list_announcements)
    tables = {
        'users': _table({'organization_id': 'org-1', **caller}),
        'announcements': _table([ROW1, ROW2]),
        **(tables_extra or {}),
    }
    client = _client(tables)
    app = Flask(__name__)
    with app.test_request_context('/api/announcements?organization_id=org-1'), \
         patch.object(routes, 'get_supabase_admin_client', return_value=client):
        resp = view('caller-1')
    return resp, tables


@pytest.mark.unit
class TestStaffListReadStats:
    def test_staff_items_carry_read_and_recipient_counts(self):
        stats = _table([{'announcement_id': 'a1',
                         'recipient_count': 40, 'read_count': 12}])
        resp, _ = _list(ORG_ADMIN, {'announcement_read_stats': stats})
        items = _json(resp)['announcements']
        assert items[0]['read_count'] == 12
        assert items[0]['recipient_count'] == 40
        assert 'last_nudged_at' in items[0]
        # One .in_ query against the aggregate view for the whole page.
        stats.in_.assert_called_once_with('announcement_id', ['a1', 'a2'])

    def test_a_send_that_predates_the_snapshot_reads_none_not_zero(self):
        """recipient_count None means "no data" — the UI must not render an old
        message as "0 of 0 read"."""
        stats = _table([{'announcement_id': 'a1',
                         'recipient_count': 40, 'read_count': 12}])
        resp, _ = _list(ORG_ADMIN, {'announcement_read_stats': stats})
        old = _json(resp)['announcements'][1]
        assert old['read_count'] == 0
        assert old['recipient_count'] is None

    def test_families_do_not_get_read_stats(self):
        """A student's list never touches the stats view (no
        announcement_read_stats table in the mock: querying it would raise)."""
        caller = {'role': 'org_managed', 'org_role': 'student', 'org_roles': None}
        resp, _ = _list(caller)
        items = _json(resp)['announcements']
        assert items and all('read_count' not in a for a in items)

    def test_a_stats_failure_does_not_sink_the_list(self):
        stats = _table()
        stats.execute.side_effect = RuntimeError('view missing')
        resp, _ = _list(ORG_ADMIN, {'announcement_read_stats': stats})
        assert _status(resp) == 200
        assert len(_json(resp)['announcements']) == 2


# ── Recipient snapshot at publish ────────────────────────────────────────────
@pytest.mark.unit
class TestRecipientSnapshot:
    def test_publish_snapshots_who_it_sent_to(self):
        ann = _table([{'id': 'ann-1'}])
        rec = _table([])
        client = _client({'announcements': ann, 'announcement_recipients': rec})
        with patch.object(svc, '_admin', return_value=client), \
             patch.object(svc, 'recipients_for', return_value={'r2', 'r1'}), \
             patch('services.notification_service.NotificationService',
                   return_value=Mock()), \
             patch.object(svc, '_email_fanout'):
            svc.publish('org-1', 'adm-1', 'T', 'B', ['parents'])
        rows = rec.insert.call_args[0][0]
        assert rows == [{'announcement_id': 'ann-1', 'user_id': 'r1'},
                        {'announcement_id': 'ann-1', 'user_id': 'r2'}]

    def test_big_sends_are_chunked(self):
        rec = _table([])
        client = _client({'announcement_recipients': rec})
        with patch.object(svc, '_admin', return_value=client):
            svc._snapshot_recipients('ann-1', {f'u{i:04d}' for i in range(600)})
        sizes = [len(c.args[0]) for c in rec.insert.call_args_list]
        assert sizes == [500, 100]

    def test_no_row_means_no_snapshot(self):
        """When the announcements insert failed there is nothing to key on."""
        admin = Mock()
        with patch.object(svc, '_admin', admin):
            svc._snapshot_recipients(None, {'r1'})
        admin.assert_not_called()

    def test_a_snapshot_failure_does_not_stop_delivery(self):
        ann = _table([{'id': 'ann-1'}])
        rec = _table([])
        rec.execute.side_effect = RuntimeError('table gone')
        client = _client({'announcements': ann, 'announcement_recipients': rec})
        notifier = Mock()
        with patch.object(svc, '_admin', return_value=client), \
             patch.object(svc, 'recipients_for', return_value={'r1'}), \
             patch('services.notification_service.NotificationService',
                   return_value=notifier), \
             patch.object(svc, '_email_fanout'):
            out = svc.publish('org-1', 'adm-1', 'T', 'B', ['parents'])
        assert out['sent'] == 1


# ── The nudge itself (service) ───────────────────────────────────────────────
def _nudge(announcement, recipients, reads, org_name='Hearthwood'):
    tables = {
        'announcement_recipients': _table([{'user_id': u} for u in recipients]),
        'announcement_reads': _table([{'user_id': u} for u in reads]),
        'organizations': _table({'name': org_name}),
        'announcements': _table([]),
    }
    client = _client(tables)
    notifier = Mock()
    with patch.object(svc, '_admin', return_value=client), \
         patch('services.notification_service.NotificationService',
               return_value=notifier):
        out = svc.nudge(announcement)
    return out, notifier, tables


ANN = {'id': 'ann-1', 'organization_id': 'org-1', 'title': 'Field trip',
       'message': '<p>Bring boots.</p>', 'last_nudged_at': None}


@pytest.mark.unit
class TestNudge:
    def test_only_the_unread_are_nudged(self):
        out, notifier, _ = _nudge(ANN, recipients=['a', 'b', 'c'], reads=['b'])
        assert out == {'notified': 2}
        nudged = {c.kwargs['user_id']
                  for c in notifier.create_notification.call_args_list}
        assert nudged == {'a', 'c'}

    def test_the_reminder_names_the_school_and_the_message(self):
        _, notifier, _ = _nudge(ANN, recipients=['a'], reads=[])
        kwargs = notifier.create_notification.call_args.kwargs
        assert kwargs['title'] == 'Reminder from Hearthwood: Field trip'
        assert kwargs['notification_type'] == 'announcement'  # mobile push
        assert kwargs['link'] == '/school'
        assert kwargs['metadata']['announcement_id'] == 'ann-1'
        assert kwargs['metadata']['nudge'] is True

    def test_a_recent_nudge_is_refused(self):
        recent = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        out, notifier, _ = _nudge({**ANN, 'last_nudged_at': recent},
                                  recipients=['a'], reads=[])
        assert out['status'] == 409
        notifier.create_notification.assert_not_called()

    def test_a_stale_nudge_stamp_does_not_block(self):
        old = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
        out, _, _ = _nudge({**ANN, 'last_nudged_at': old},
                           recipients=['a'], reads=[])
        assert out == {'notified': 1}

    def test_no_snapshot_means_no_nudge(self):
        """Messages sent before read receipts have no recipient record;
        re-resolving recipients now could nudge people the original send never
        reached, so refuse instead."""
        out, notifier, _ = _nudge(ANN, recipients=[], reads=[])
        assert out['status'] == 409
        assert 'predates' in out['error']
        notifier.create_notification.assert_not_called()

    def test_a_successful_nudge_stamps_last_nudged_at(self):
        _, _, tables = _nudge(ANN, recipients=['a'], reads=[])
        stamped = tables['announcements'].update.call_args[0][0]
        assert 'last_nudged_at' in stamped

    def test_everyone_read_it_is_success_with_zero(self):
        out, notifier, _ = _nudge(ANN, recipients=['a'], reads=['a'])
        assert out == {'notified': 0}
        notifier.create_notification.assert_not_called()


# ── The nudge route's fences ─────────────────────────────────────────────────
ANN_ROW = {'id': 'ann-1', 'organization_id': 'org-1', 'author_id': 'author-1',
           'title': 'T', 'message': 'B', 'last_nudged_at': None}


def _post_nudge(caller, user_id='caller-1', row=ANN_ROW,
                nudge_result=None):
    view = getattr(routes.nudge_announcement, '__wrapped__',
                   routes.nudge_announcement)
    tables = {
        'users': _table(caller),
        'announcements': _table([row] if row else []),
    }
    client = _client(tables)
    app = Flask(__name__)
    with app.test_request_context('/api/announcements/ann-1/nudge',
                                  method='POST', data='{}',
                                  content_type='application/json'), \
         patch.object(routes, 'get_supabase_admin_client', return_value=client), \
         patch.object(routes.announcement_service, 'nudge',
                      return_value=nudge_result or {'notified': 5}) as nudge:
        resp = view(user_id, 'ann-1')
    return resp, nudge


@pytest.mark.unit
class TestNudgeRoute:
    def test_the_admin_tier_nudges_any_send_in_their_org(self):
        resp, nudge = _post_nudge(ORG_ADMIN)
        assert _status(resp) == 200
        assert _json(resp)['notified'] == 5
        nudge.assert_called_once()

    def test_an_advisor_nudges_only_their_own_sends(self):
        resp, nudge = _post_nudge(ADVISOR, user_id='someone-else')
        assert _status(resp) == 403
        nudge.assert_not_called()

    def test_an_advisor_may_nudge_what_they_sent(self):
        resp, nudge = _post_nudge(ADVISOR, user_id='author-1')
        assert _status(resp) == 200
        nudge.assert_called_once()

    def test_another_orgs_send_is_denied(self):
        elsewhere = {**ORG_ADMIN, 'organization_id': 'org-2'}
        resp, nudge = _post_nudge(elsewhere)
        assert _status(resp) == 403
        nudge.assert_not_called()

    def test_a_missing_announcement_is_404(self):
        resp, _ = _post_nudge(ORG_ADMIN, row=None)
        assert _status(resp) == 404

    def test_a_service_refusal_keeps_its_status(self):
        resp, _ = _post_nudge(ORG_ADMIN, nudge_result={
            'error': 'This message was already nudged in the last 24 hours. '
                     'Try again tomorrow.', 'status': 409})
        assert _status(resp) == 409
        assert 'already nudged' in _json(resp)['error']

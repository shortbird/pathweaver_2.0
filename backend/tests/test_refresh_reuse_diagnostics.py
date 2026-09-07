"""What a refresh-token reuse report has to say.

Revoking a family signs a real person out of every session they have, so the
event that records it is the only thing standing between "someone's token was
stolen" and "someone's phone lost a response". Sentry OPTIO-BACKEND-6N was 27 of
these across 22 users in 10 days under one fingerprint reading "reuse detected",
which is consistent with either, and the investigation had to be done in SQL
against production.

These pin the fields that make the next one readable from the event alone: which
token was presented, whether it came from the client that owns the chain, and
how stale it was.

Unlike test_refresh_token_rotation.py, which substitutes the whole module to ask
what rotation DOES, these call the real functions -- the diagnostics are the
subject here, so nothing about them can be faked out.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from utils import refresh_families as rf


# Deliberately a function, not a module constant: these rows describe ages
# relative to "now", and a constant captured at import drifts by however long
# the rest of the suite takes to reach this file -- which is how the first
# version of this file passed alone and failed in the full run.
def _ago(**kwargs):
    return (datetime.now(timezone.utc) - timedelta(**kwargs)).isoformat()


FAMILY = '11111111-1111-1111-1111-111111111111'
OTHER_FAMILY = '22222222-2222-2222-2222-222222222222'
USER = '33333333-3333-3333-3333-333333333333'
CURRENT = 'aaaaaaaa-0000-0000-0000-000000000001'
PREVIOUS = 'bbbbbbbb-0000-0000-0000-000000000002'
ANCIENT = 'cccccccc-0000-0000-0000-000000000003'


def _row(**overrides):
    row = {
        'id': FAMILY,
        'user_id': USER,
        'current_jti': CURRENT,
        'previous_jti': PREVIOUS,
        'rotated_at': _ago(seconds=45),
        'last_used_at': _ago(seconds=45),
        'created_at': _ago(hours=3),
        'expires_at': (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        'revoked': False,
        'last_client_fp': None,
    }
    row.update(overrides)
    return row


@pytest.mark.unit
class TestWhichTokenWasPresented:
    """stale_previous vs unknown_jti is the whole diagnosis: one is a client
    that lost a response, the other is a token from outside the live chain."""

    def test_the_immediately_preceding_token_is_a_stale_previous(self):
        assert rf._reuse_shape(_row(), PREVIOUS) == rf.SHAPE_STALE_PREVIOUS

    def test_any_other_token_of_the_chain_is_unknown(self):
        assert rf._reuse_shape(_row(), ANCIENT) == rf.SHAPE_UNKNOWN_JTI

    def test_a_chain_that_never_rotated_cannot_produce_a_stale_previous(self):
        assert rf._reuse_shape(_row(previous_jti=None), ANCIENT) == rf.SHAPE_UNKNOWN_JTI


@pytest.mark.unit
class TestTheClientFingerprint:
    def test_the_same_client_on_the_same_family_matches(self, app):
        with app.test_request_context(headers={'User-Agent': 'Safari/1'}):
            first = rf._client_fp(FAMILY)
            assert first == rf._client_fp(FAMILY)
            assert rf._same_client(first, FAMILY) == 'yes'

    def test_a_different_client_does_not(self, app):
        with app.test_request_context(headers={'User-Agent': 'Safari/1'}):
            stolen_from = rf._client_fp(FAMILY)
        with app.test_request_context(headers={'User-Agent': 'curl/8'}):
            assert rf._same_client(stolen_from, FAMILY) == 'no'

    def test_it_cannot_follow_one_client_between_families(self, app):
        """Salted with the family id on purpose: the fingerprint answers "same
        client as last time on THIS chain" and is useless for anything wider."""
        with app.test_request_context(headers={'User-Agent': 'Safari/1'}):
            assert rf._client_fp(FAMILY) != rf._client_fp(OTHER_FAMILY)

    def test_nothing_recorded_reads_as_unknown_not_as_a_stranger(self, app):
        """'unknown' must never collapse into 'no' -- 'no' is the value that
        means theft, and old families have no fingerprint at all."""
        with app.test_request_context(headers={'User-Agent': 'Safari/1'}):
            assert rf._same_client(None, FAMILY) == 'unknown'

    def test_no_request_context_is_survivable(self):
        assert rf._client_fp(FAMILY) is None
        assert rf._same_client('abc123', FAMILY) == 'unknown'


@pytest.mark.unit
class TestTheReportItself:
    def _capture(self, row, presented, **kwargs):
        sentry = MagicMock()
        scope = sentry.new_scope.return_value.__enter__.return_value
        scope.set_tag = MagicMock()
        scope.set_extra = MagicMock()
        with patch.dict('sys.modules', {'sentry_sdk': sentry}):
            with patch.object(rf, 'logger') as log:
                rf._report_reuse(USER, FAMILY, row, presented, **kwargs)
        tags = dict(c.args for c in scope.set_tag.call_args_list)
        extras = dict(c.args for c in scope.set_extra.call_args_list)
        return tags, extras, scope, sentry, log.warning.call_args.args[0]

    def test_the_shape_is_a_tag_and_the_fingerprint(self):
        """Split by shape so the routine cause cannot bury the alarming one --
        the same reason CSRF rejections are split by classify_csrf_failure."""
        tags, _, scope, _, _ = self._capture(_row(), PREVIOUS)
        assert tags['reuse_shape'] == rf.SHAPE_STALE_PREVIOUS
        assert tags['security_event'] == 'refresh_token_reuse'
        assert scope.fingerprint == ['refresh-token-reuse', rf.SHAPE_STALE_PREVIOUS]

    def test_how_stale_the_token_was_is_reported(self):
        """45s against a 120s window says "client lost a response"; five days
        says something held a token far too long. The number is the difference."""
        _, extras, _, _, _ = self._capture(_row(), PREVIOUS)
        assert 40 <= extras['seconds_since_rotation'] <= 50
        assert extras['grace_window_seconds'] == rf.REPLAY_GRACE_SECONDS
        assert extras['family_age_seconds'] > 3000

    def test_only_jti_prefixes_travel_to_sentry(self):
        """A full jti in an error tracker is a live credential in an error
        tracker."""
        _, extras, _, _, _ = self._capture(_row(), PREVIOUS)
        assert extras['presented_jti_prefix'] == PREVIOUS[:8]
        assert extras['current_jti_prefix'] == CURRENT[:8]
        for value in extras.values():
            assert value not in (CURRENT, PREVIOUS)

    def test_losing_the_compare_and_swap_is_recorded(self):
        """Corroborates the race reading: two requests really were in flight."""
        _, extras, _, _, _ = self._capture(_row(), PREVIOUS, lost_cas_race=True)
        assert extras['lost_cas_race'] is True

    def test_the_log_line_carries_the_same_facts(self, app):
        """Sentry samples; Render logs do not. A reconstruction weeks later has
        to be possible from the log alone."""
        with app.test_request_context(headers={'User-Agent': 'Safari/1'}):
            fp = rf._client_fp(FAMILY)
            _, _, _, _, line = self._capture(_row(last_client_fp=fp), PREVIOUS)
        assert 'shape=stale_previous' in line
        assert 'same_client=yes' in line
        assert 'seconds_since_rotation=' in line

    def test_a_replay_from_a_stranger_is_visible_as_one(self, app):
        with app.test_request_context(headers={'User-Agent': 'Safari/1'}):
            victims_fp = rf._client_fp(FAMILY)
        with app.test_request_context(headers={'User-Agent': 'curl/8'}):
            tags, _, _, _, _ = self._capture(
                _row(last_client_fp=victims_fp), ANCIENT)
        assert tags['reuse_shape'] == rf.SHAPE_UNKNOWN_JTI
        assert tags['same_client'] == 'no'

    def test_reporting_never_raises(self):
        """Telemetry that can break a refresh is worse than no telemetry."""
        with patch.dict('sys.modules', {'sentry_sdk': None}):
            rf._report_reuse(USER, FAMILY, _row(), PREVIOUS)


@pytest.mark.unit
class TestEveryReuseBranchReports:
    """The three ways rotate() can revoke a family. One of them used to revoke
    in silence."""

    def _rotate_with(self, row, presented_jti, user_id=USER):
        client = MagicMock()
        (client.table.return_value.select.return_value.eq.return_value
         .limit.return_value.execute.return_value) = MagicMock(data=[row])
        with patch.object(rf, '_admin', return_value=client), \
             patch.object(rf, '_revoke') as revoke, \
             patch.object(rf, '_report_reuse') as report:
            outcome, _, _ = rf.rotate(user_id, FAMILY, presented_jti,
                                      timedelta(days=30))
        return outcome, revoke, report

    def test_a_stale_previous_outside_the_window_reports(self):
        stale = _row(rotated_at=_ago(minutes=10))
        outcome, revoke, report = self._rotate_with(stale, PREVIOUS)
        assert outcome == rf.REUSE
        assert revoke.call_args.args[1] == 'reuse_detected'
        assert report.called

    def test_an_unknown_jti_reports(self):
        outcome, _, report = self._rotate_with(_row(), ANCIENT)
        assert outcome == rf.REUSE
        assert report.called

    def test_a_token_naming_someone_elses_family_reports(self):
        """The shape that implies a signing-key problem rather than a replay,
        and the one that used to be revoked without any event at all."""
        outcome, revoke, report = self._rotate_with(
            _row(user_id='44444444-4444-4444-4444-444444444444'), CURRENT)
        assert outcome == rf.REUSE
        assert revoke.call_args.args[1] == 'user_mismatch'
        assert report.call_args.kwargs['shape'] == rf.SHAPE_USER_MISMATCH

    def test_a_token_inside_the_grace_window_reports_nothing(self):
        row = _row(rotated_at=_ago(seconds=2))
        outcome, revoke, report = self._rotate_with(row, PREVIOUS)
        assert outcome == rf.GRACE
        assert not revoke.called
        assert not report.called


@pytest.mark.unit
class TestALostRotationIsRecoveredNotRevoked:
    """The shape behind Sentry OPTIO-BACKEND-7E: 23 revocations, 22 users, six
    days, every one of them a client that never received the token its own
    rotation minted.

    `last_used_at == rotated_at` is what says so -- `_advance` writes both in
    one statement, so their being equal means nothing has presented the new jti
    since. Serving the live jti there is not the grace window with a bigger
    number; it is a different question, and it is asked of the client
    fingerprint as well.
    """

    def _rotate_with(self, row, presented_jti):
        client = MagicMock()
        (client.table.return_value.select.return_value.eq.return_value
         .limit.return_value.execute.return_value) = MagicMock(data=[row])
        with patch.object(rf, '_admin', return_value=client), \
             patch.object(rf, '_revoke') as revoke, \
             patch.object(rf, '_report_reuse') as report:
            outcome, family_id, next_jti = rf.rotate(
                USER, FAMILY, presented_jti, timedelta(days=30))
        return outcome, next_jti, revoke, report

    def _lost(self, app, **overrides):
        """A family whose last rotation went nowhere, fingerprinted to the
        client that is about to present the superseded token."""
        with app.test_request_context(headers={'User-Agent': 'Chrome/151'}):
            fp = rf._client_fp(FAMILY)
        row = _row(rotated_at=_ago(minutes=10), last_used_at=_ago(minutes=10),
                   last_client_fp=fp)
        row.update(overrides)
        return row

    def test_the_same_client_keeps_its_session(self, app):
        row = self._lost(app)
        with app.test_request_context(headers={'User-Agent': 'Chrome/151'}):
            outcome, next_jti, revoke, report = self._rotate_with(row, PREVIOUS)
        assert outcome == rf.RECOVERED
        assert outcome not in rf.DENY
        assert next_jti == CURRENT       # the token it never received
        assert not revoke.called
        assert not report.called

    def test_a_stranger_is_still_a_replay(self, app):
        """Condition 3, and the one the grace window never applied at all: the
        request has to fingerprint as the client that performed the rotation."""
        row = self._lost(app)
        with app.test_request_context(headers={'User-Agent': 'curl/8'}):
            outcome, _, revoke, report = self._rotate_with(row, PREVIOUS)
        assert outcome == rf.REUSE
        assert revoke.called and report.called

    def test_a_rotation_whose_output_was_used_is_still_a_replay(self, app):
        """The decisive condition. Once the new jti has been presented by
        anybody, a replay of the old one is a second party in the chain."""
        row = self._lost(app, last_used_at=_ago(minutes=2))
        with app.test_request_context(headers={'User-Agent': 'Chrome/151'}):
            outcome, _, revoke, report = self._rotate_with(row, PREVIOUS)
        assert outcome == rf.REUSE
        assert revoke.called and report.called

    def test_an_older_jti_is_never_recovered(self, app):
        """Only the immediately-preceding token. `unknown_jti` is the shape a
        stolen token makes and stays a revocation whatever the timings say."""
        row = self._lost(app)
        with app.test_request_context(headers={'User-Agent': 'Chrome/151'}):
            outcome, _, revoke, report = self._rotate_with(row, ANCIENT)
        assert outcome == rf.REUSE
        assert revoke.called and report.called

    def test_the_recovery_is_bounded(self, app):
        """Finite exposure: past LOST_ROTATION_SECONDS a superseded token is
        refused however honest it looks."""
        row = self._lost(app, rotated_at=_ago(hours=30), last_used_at=_ago(hours=30))
        with app.test_request_context(headers={'User-Agent': 'Chrome/151'}):
            outcome, _, revoke, report = self._rotate_with(row, PREVIOUS)
        assert outcome == rf.REUSE
        assert revoke.called and report.called

    def test_an_unfingerprinted_family_is_not_recovered(self, app):
        """'unknown' is not evidence. Families predating the fingerprint column
        must not get the benefit of a test that was never run on them."""
        row = self._lost(app, last_client_fp=None)
        with app.test_request_context(headers={'User-Agent': 'Chrome/151'}):
            outcome, _, revoke, report = self._rotate_with(row, PREVIOUS)
        assert outcome == rf.REUSE
        assert revoke.called and report.called

    def test_the_recovery_is_logged_with_its_facts(self, app):
        """Sentry no longer sees these, so the log line is the only record that
        the path fired -- and the only way to notice if it starts firing a lot."""
        row = self._lost(app)
        client = MagicMock()
        (client.table.return_value.select.return_value.eq.return_value
         .limit.return_value.execute.return_value) = MagicMock(data=[row])
        with app.test_request_context(headers={'User-Agent': 'Chrome/151'}):
            with patch.object(rf, '_admin', return_value=client), \
                 patch.object(rf, 'logger') as log:
                rf.rotate(USER, FAMILY, PREVIOUS, timedelta(days=30))
        line = log.warning.call_args.args[0]
        assert 'Lost rotation recovered' in line
        assert 'same_client=yes' in line
        assert PREVIOUS[:8] in line


@pytest.mark.unit
class TestAClientThatChangedNetwork:
    """The IP is no longer part of the recovery test (2026-09-07).

    `_client_fp` hashes the client IP, so a laptop closed at home and opened at
    the office -- or a phone handing off cellular to Wi-Fi -- fingerprinted as a
    different client and was signed out of everything. Every revocation still
    firing after the recovery path shipped was exactly that: `same_client=no`
    from a Mac, an iPhone and an Android, each with the full lost-rotation
    signature, one of them 444 seconds after its own rotation.

    So the recovery path asks "same device?" while the report keeps showing the
    stricter "same device AND network?".
    """

    HOME = {'REMOTE_ADDR': '203.0.113.7'}
    OFFICE = {'REMOTE_ADDR': '198.51.100.22'}

    def _fp_at(self, app, ua, where):
        with app.test_request_context(headers={'User-Agent': ua}, environ_base=where):
            return rf._client_fp(FAMILY)

    def test_moving_network_keeps_the_device_but_not_the_client(self, app):
        home = self._fp_at(app, 'Safari/18.6', self.HOME)
        with app.test_request_context(headers={'User-Agent': 'Safari/18.6'},
                                      environ_base=self.OFFICE):
            assert rf._same_device(home, FAMILY) == 'yes'
            # The strict signal is preserved, not replaced.
            assert rf._same_client(home, FAMILY) == 'no'

    def test_a_different_device_is_not_the_same_device(self, app):
        """Even from the very same address: the device half has to match."""
        home = self._fp_at(app, 'Safari/18.6', self.HOME)
        with app.test_request_context(headers={'User-Agent': 'curl/8'},
                                      environ_base=self.HOME):
            assert rf._same_device(home, FAMILY) == 'no'
            assert rf._same_client(home, FAMILY) == 'no'

    def test_the_halves_still_cannot_follow_a_client_between_families(self, app):
        """Both halves stay salted with the family id -- splitting the value in
        two must not turn either half into a device or network tracker."""
        with app.test_request_context(headers={'User-Agent': 'Safari/18.6'},
                                      environ_base=self.HOME):
            here = rf._client_fp(FAMILY)
            there = rf._client_fp(OTHER_FAMILY)
        assert rf._fp_parts(here)[0] != rf._fp_parts(there)[0]   # device half
        assert rf._fp_parts(here)[1] != rf._fp_parts(there)[1]   # network half

    def test_a_prefix_split_fingerprint_reads_as_unknown(self, app):
        """Rows written before the split hold one segment. Reading that as a
        mismatch would sign people out for the length of the rollout, and
        reading it as a match would open the path on no evidence."""
        legacy = 'a1b2c3d4e5f60718'   # what _client_fp used to return
        with app.test_request_context(headers={'User-Agent': 'Safari/18.6'},
                                      environ_base=self.HOME):
            assert rf._same_device(legacy, FAMILY) == 'unknown'
            assert rf._same_client(legacy, FAMILY) == 'unknown'
        assert rf._fp_parts(legacy) == (None, None)


@pytest.mark.unit
class TestRecoveryAcrossANetworkChange:
    """The behaviour the split exists for, end to end through rotate()."""

    def _rotate_with(self, row, presented_jti):
        client = MagicMock()
        (client.table.return_value.select.return_value.eq.return_value
         .limit.return_value.execute.return_value) = MagicMock(data=[row])
        with patch.object(rf, '_admin', return_value=client), \
             patch.object(rf, '_revoke') as revoke, \
             patch.object(rf, '_report_reuse') as report:
            outcome, family_id, next_jti = rf.rotate(
                USER, FAMILY, presented_jti, timedelta(days=30))
        return outcome, next_jti, revoke, report

    def _lost_at(self, app, ua, ip, **overrides):
        with app.test_request_context(headers={'User-Agent': ua},
                                      environ_base={'REMOTE_ADDR': ip}):
            fp = rf._client_fp(FAMILY)
        row = _row(rotated_at=_ago(minutes=10), last_used_at=_ago(minutes=10),
                   last_client_fp=fp)
        row.update(overrides)
        return row

    def test_the_same_phone_on_a_new_network_keeps_its_session(self, app):
        """The whole point. Cellular to Wi-Fi is not a token theft."""
        row = self._lost_at(app, 'Mobile Safari/26.6.1', '203.0.113.7')
        with app.test_request_context(headers={'User-Agent': 'Mobile Safari/26.6.1'},
                                      environ_base={'REMOTE_ADDR': '198.51.100.22'}):
            outcome, next_jti, revoke, report = self._rotate_with(row, PREVIOUS)
        assert outcome == rf.RECOVERED
        assert outcome not in rf.DENY
        assert next_jti == CURRENT
        assert not revoke.called
        assert not report.called

    def test_a_stranger_on_the_victims_network_is_still_a_replay(self, app):
        """Loosening (3) to the device must not let the network alone carry it:
        someone on the same Wi-Fi with their own browser is still a stranger."""
        row = self._lost_at(app, 'Mobile Safari/26.6.1', '203.0.113.7')
        with app.test_request_context(headers={'User-Agent': 'curl/8'},
                                      environ_base={'REMOTE_ADDR': '203.0.113.7'}):
            outcome, _, revoke, report = self._rotate_with(row, PREVIOUS)
        assert outcome == rf.REUSE
        assert revoke.called and report.called

    def test_the_other_conditions_still_hold_across_a_network_change(self, app):
        """A moved IP buys nothing on its own: the recovery still needs the
        immediately-preceding jti, an unused rotation, and the time bound."""
        moved = {'headers': {'User-Agent': 'Mobile Safari/26.6.1'},
                 'environ_base': {'REMOTE_ADDR': '198.51.100.22'}}

        used = self._lost_at(app, 'Mobile Safari/26.6.1', '203.0.113.7',
                             last_used_at=_ago(minutes=2))
        stale = self._lost_at(app, 'Mobile Safari/26.6.1', '203.0.113.7',
                              rotated_at=_ago(hours=30), last_used_at=_ago(hours=30))
        older = self._lost_at(app, 'Mobile Safari/26.6.1', '203.0.113.7')

        for row, presented in ((used, PREVIOUS), (stale, PREVIOUS), (older, ANCIENT)):
            with app.test_request_context(**moved):
                outcome, _, revoke, report = self._rotate_with(row, presented)
            assert outcome == rf.REUSE
            assert revoke.called and report.called

    def test_a_revocation_reports_both_signals(self, app):
        """same_device is the strong one now; same_client has to stay visible
        so the stricter test is only ever hidden from the DECISION."""
        row = self._lost_at(app, 'Mobile Safari/26.6.1', '203.0.113.7')
        sentry = MagicMock()
        scope = sentry.new_scope.return_value.__enter__.return_value
        tags = {}
        scope.set_tag.side_effect = lambda k, v: tags.__setitem__(k, v)
        with app.test_request_context(headers={'User-Agent': 'curl/8'},
                                      environ_base={'REMOTE_ADDR': '198.51.100.22'}):
            with patch.dict('sys.modules', {'sentry_sdk': sentry}):
                rf._report_reuse(USER, FAMILY, row, ANCIENT)
        assert tags['same_device'] == 'no'
        assert tags['same_client'] == 'no'

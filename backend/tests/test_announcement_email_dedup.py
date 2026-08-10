"""
Announcement email fan-out: one inbox, one copy.

2026-08-07: Tanner received FOUR copies of "iCreate: iCreate Community Quick
Updates" — two direct sends to plus-alias test accounts of the same gmail
inbox, plus two per-recipient [COPY]s that leaked through the iCreate opt-out
because the recipient-org lookup can't see platform parents. The fan-out now
dedupes by canonical mailbox and sends exactly one summary [COPY] per
announcement (none for opted-out orgs).
"""

from unittest.mock import Mock, patch

import pytest

from services import announcement_email_service as svc


@pytest.mark.unit
class TestCanonicalMailbox:
    def test_plus_tag_is_stripped(self):
        assert svc._canonical_mailbox('jane+school@example.com') == 'jane@example.com'

    def test_gmail_dots_and_googlemail_collapse(self):
        assert svc._canonical_mailbox('Jane.Doe+kids@googlemail.com') == 'janedoe@gmail.com'

    def test_dots_matter_outside_gmail(self):
        assert svc._canonical_mailbox('jane.doe@example.com') == 'jane.doe@example.com'

    def test_degenerate_addresses_fall_back_verbatim(self):
        assert svc._canonical_mailbox('+tag@example.com') == '+tag@example.com'
        assert svc._canonical_mailbox('nodomain') == 'nodomain'


def _admin_client(user_rows):
    """Admin client whose users-table fetch returns `user_rows` and whose
    organizations fetch returns a plain org."""
    client = Mock()

    def table(name):
        t = Mock()
        for chained in ('select', 'eq', 'in_', 'single'):
            getattr(t, chained).return_value = t
        if name == 'organizations':
            t.execute.return_value = Mock(data={
                'name': 'Test School', 'slug': 'test-school', 'feature_flags': {}})
        else:
            t.execute.return_value = Mock(data=user_rows)
        return t

    client.table.side_effect = table
    return client


def _run_fanout(user_rows, org_excluded=False):
    """Run send_announcement_emails with everything external mocked; returns
    the list of send_email call kwargs."""
    sent_calls = []

    def fake_send(**kwargs):
        sent_calls.append(kwargs)
        return True

    email_service = Mock()
    email_service.send_email.side_effect = fake_send
    exclude = {'test-school'} if org_excluded else {'icreate'}
    with patch.object(svc, '_fresh_admin_client', return_value=_admin_client(user_rows)), \
         patch('services.email_service.email_service', email_service), \
         patch('services.email_service.SUPPORT_COPY_EXCLUDE_ORG_SLUGS', exclude):
        svc.send_announcement_emails(
            'org1', 'Quick Updates', 'Hello families',
            [r['id'] for r in user_rows])
    return sent_calls


@pytest.mark.unit
class TestFanoutDedup:
    def test_aliases_of_one_inbox_get_one_email(self):
        rows = [
            {'id': 'u1', 'email': 'tanner+a@gmail.com', 'managed_by_parent_id': None},
            {'id': 'u2', 'email': 'tanner+b@gmail.com', 'managed_by_parent_id': None},
            {'id': 'u3', 'email': 'other@example.com', 'managed_by_parent_id': None},
        ]
        calls = _run_fanout(rows)
        recipients = [c['to_email'] for c in calls if not c['subject'].startswith('[COPY]')]
        assert recipients == ['other@example.com', 'tanner+a@gmail.com']

    def test_recipient_sends_suppress_their_own_copies(self):
        rows = [{'id': 'u1', 'email': 'p@example.com', 'managed_by_parent_id': None}]
        calls = _run_fanout(rows)
        assert all(c['support_copy'] is False for c in calls)

    def test_exactly_one_summary_copy_per_announcement(self):
        rows = [
            {'id': 'u1', 'email': 'a@example.com', 'managed_by_parent_id': None},
            {'id': 'u2', 'email': 'b@example.com', 'managed_by_parent_id': None},
        ]
        calls = _run_fanout(rows)
        copies = [c for c in calls if c['subject'].startswith('[COPY]')]
        assert len(copies) == 1
        assert '2 recipients' in copies[0]['text_body']

    def test_opted_out_org_gets_no_copy_at_all(self):
        rows = [{'id': 'u1', 'email': 'a@example.com', 'managed_by_parent_id': None}]
        calls = _run_fanout(rows, org_excluded=True)
        assert [c['to_email'] for c in calls] == ['a@example.com']

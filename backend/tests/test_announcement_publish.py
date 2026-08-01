"""
Publishing an announcement to families.

iCreate, 2026-08-01: "I just posted an announcement from the admin side and it
doesn't show up in the announcements on the non-admin side of things. Perhaps
that isn't yet functional?"

It was functional — she used the SIS Community Hub, which is a staff noticeboard,
while the family-facing Announcements page reads a different table. The composer
can now send through this shared path, so one post can do both.
"""

from unittest.mock import Mock, patch

import pytest

from services import announcement_service as svc


MEMBERS = [
    {'id': 'stu1', 'role': 'org_managed', 'org_role': 'student', 'org_roles': None},
    {'id': 'stu2', 'role': 'org_managed', 'org_role': 'student', 'org_roles': None},
    {'id': 'adv1', 'role': 'org_managed', 'org_role': 'advisor', 'org_roles': None},
    {'id': 'adm1', 'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': None},
]


def _client(insert_returns=None):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'insert', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=insert_returns if insert_returns is not None else MEMBERS)
    return client, table


@pytest.mark.unit
class TestNormalizeAudiences:
    def test_a_list_is_filtered_to_known_audiences(self):
        assert set(svc.normalize_audiences(['parents', 'martians'])) == {'parents'}

    def test_everyone_means_every_role(self):
        assert set(svc.normalize_audiences(None, fallback='everyone')) == svc.ROLE_AUDIENCES

    def test_the_old_single_field_still_works(self):
        assert svc.normalize_audiences(None, fallback='parents') == ['parents']

    def test_a_bare_string_is_accepted(self):
        assert svc.normalize_audiences('students') == ['students']

    def test_nothing_recognizable_is_empty(self):
        assert svc.normalize_audiences(['nobody']) == []


@pytest.mark.unit
class TestRecipients:
    def test_students_and_advisors_come_from_the_org(self):
        client, _ = _client()
        with patch('services.announcement_service._admin', return_value=client):
            out = svc.recipients_for('org-1', ['students', 'advisors'])
        assert out == {'stu1', 'stu2', 'adv1'}   # admins aren't an audience

    def test_parents_are_resolved_per_student(self):
        """A platform parent has no organization_id, so a plain org filter would
        miss them — they're found through their child."""
        client, _ = _client()
        notifier = Mock()
        notifier.get_parents_for_student.side_effect = lambda sid: (
            [{'id': f'parent-of-{sid}'}]
        )
        with patch('services.announcement_service._admin', return_value=client), \
             patch('services.notification_service.NotificationService', return_value=notifier):
            out = svc.recipients_for('org-1', ['parents'])
        assert out == {'parent-of-stu1', 'parent-of-stu2'}

    def test_the_author_never_gets_their_own_announcement(self):
        client, _ = _client()
        with patch('services.announcement_service._admin', return_value=client):
            out = svc.recipients_for('org-1', ['students'], exclude_user_id='stu1')
        assert out == {'stu2'}

    def test_a_parent_lookup_failure_does_not_lose_the_rest(self):
        client, _ = _client()
        notifier = Mock()
        notifier.get_parents_for_student.side_effect = RuntimeError('boom')
        with patch('services.announcement_service._admin', return_value=client), \
             patch('services.notification_service.NotificationService', return_value=notifier):
            assert svc.recipients_for('org-1', ['parents']) == set()


@pytest.mark.unit
class TestPublish:
    def test_stores_the_row_and_notifies_each_recipient(self):
        client, table = _client(insert_returns=[{'id': 'ann-1'}])
        notifier = Mock()
        with patch('services.announcement_service._admin', return_value=client), \
             patch('services.announcement_service.recipients_for', return_value={'a', 'b'}), \
             patch('services.notification_service.NotificationService', return_value=notifier), \
             patch('services.announcement_service._email_fanout') as email:
            out = svc.publish('org-1', 'admin-1', 'Early dismissal', 'Friday at noon',
                              ['parents'])
        assert out['sent'] == 2
        assert out['announcement_id'] == 'ann-1'
        # The durable row is what the family-facing page reads.
        payload = table.insert.call_args[0][0]
        assert payload['title'] == 'Early dismissal'
        assert payload['message'] == 'Friday at noon'
        assert payload['target_audience'] == 'parents'
        email.assert_called_once()

    def test_all_three_audiences_are_recorded_as_everyone(self):
        client, table = _client(insert_returns=[{'id': 'ann-1'}])
        with patch('services.announcement_service._admin', return_value=client), \
             patch('services.announcement_service.recipients_for', return_value=set()), \
             patch('services.announcement_service._email_fanout'):
            svc.publish('org-1', 'admin-1', 'T', 'B', list(svc.ROLE_AUDIENCES))
        assert table.insert.call_args[0][0]['target_audience'] == 'everyone'

    def test_delivery_still_happens_when_the_row_insert_fails(self):
        client = Mock()
        table = Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'insert'):
            getattr(table, chained).return_value = table
        table.execute.side_effect = RuntimeError('insert exploded')
        notifier = Mock()
        with patch('services.announcement_service._admin', return_value=client), \
             patch('services.announcement_service.recipients_for', return_value={'a'}), \
             patch('services.notification_service.NotificationService', return_value=notifier), \
             patch('services.announcement_service._email_fanout'):
            out = svc.publish('org-1', 'admin-1', 'T', 'B', ['parents'])
        assert out['sent'] == 1
        assert out['announcement_id'] is None

    def test_one_failed_notification_does_not_stop_the_others(self):
        client, _ = _client(insert_returns=[{'id': 'ann-1'}])
        notifier = Mock()
        notifier.create_notification.side_effect = [RuntimeError('nope'), None]
        with patch('services.announcement_service._admin', return_value=client), \
             patch('services.announcement_service.recipients_for', return_value={'a', 'b'}), \
             patch('services.notification_service.NotificationService', return_value=notifier), \
             patch('services.announcement_service._email_fanout'):
            out = svc.publish('org-1', 'admin-1', 'T', 'B', ['parents'])
        assert out['sent'] == 1

    def test_a_long_message_is_previewed_in_the_notification(self):
        client, _ = _client(insert_returns=[{'id': 'ann-1'}])
        notifier = Mock()
        with patch('services.announcement_service._admin', return_value=client), \
             patch('services.announcement_service.recipients_for', return_value={'a'}), \
             patch('services.notification_service.NotificationService', return_value=notifier), \
             patch('services.announcement_service._email_fanout'):
            svc.publish('org-1', 'admin-1', 'T', 'x' * 500, ['parents'])
        message = notifier.create_notification.call_args.kwargs['message']
        assert len(message) == 201 and message.endswith('…')


@pytest.mark.unit
class TestCommunityPostCanReachFamilies:
    """The Community Hub composer opts in per post; without it nothing is sent."""

    def _client(self):
        client = Mock()
        table = Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'insert', 'limit'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[{'id': 'a1', 'title': 'Early dismissal'}])
        return client

    def test_no_audience_means_noticeboard_only(self):
        from services import sis_community_service as community
        with patch('services.sis_community_service._admin', return_value=self._client()), \
             patch('services.announcement_service.publish') as publish:
            out = community.create_announcement('org-1', 'admin-1', {'title': 'Early dismissal'})
        publish.assert_not_called()
        assert out['announcement']['id'] == 'a1'

    def test_ticking_families_sends_it_out(self):
        from services import sis_community_service as community
        with patch('services.sis_community_service._admin', return_value=self._client()), \
             patch('services.announcement_service.publish',
                   return_value={'sent': 12, 'announcement_id': 'ann-9'}) as publish:
            out = community.create_announcement('org-1', 'admin-1', {
                'title': 'Early dismissal', 'body': 'Friday at noon',
                'notify_audiences': ['parents'],
            })
        assert out['notified']['sent'] == 12
        assert publish.call_args[0][4] == ['parents']

    def test_a_delivery_failure_never_loses_the_post(self):
        from services import sis_community_service as community
        with patch('services.sis_community_service._admin', return_value=self._client()), \
             patch('services.announcement_service.publish', side_effect=RuntimeError('smtp down')):
            out = community.create_announcement('org-1', 'admin-1', {
                'title': 'Early dismissal', 'notify_audiences': ['parents'],
            })
        assert out['announcement']['id'] == 'a1'
        assert 'notify_error' in out

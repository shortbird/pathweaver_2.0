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
    # 'range' because the org-members read is paged: it is every account in the
    # school, and an unpaged read silently drops recipients past the cap.
    for chained in ('select', 'eq', 'insert', 'limit', 'range', 'order'):
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
        # The durable row is what the family-facing page reads. First insert:
        # the recipient snapshot lands on the same mock table afterwards.
        payload = table.insert.call_args_list[0][0][0]
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

    def test_the_notification_links_to_the_school_page(self):
        """The sent message lives in the school page's archive, on web (/school)
        and mobile (deep-link remap to the School stack) alike — not on the
        notification bell list, which only holds the preview."""
        client, _ = _client(insert_returns=[{'id': 'ann-1'}])
        notifier = Mock()
        with patch('services.announcement_service._admin', return_value=client), \
             patch('services.announcement_service.recipients_for', return_value={'a'}), \
             patch('services.notification_service.NotificationService', return_value=notifier), \
             patch('services.announcement_service._email_fanout'):
            svc.publish('org-1', 'admin-1', 'T', 'B', ['parents'])
        assert notifier.create_notification.call_args.kwargs['link'] == '/school'

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
        # 'range' because the org-members read is paged: it is every account in
        # the school, and an unpaged read silently drops recipients past the cap.
        for chained in ('select', 'eq', 'insert', 'limit', 'range', 'order'):
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


@pytest.mark.unit
class TestTargetedSend:
    """iCreate asked to aim a message at classes, teachers or an age range
    (d63154c7, 2e930120), and to stop every in-app note also being three hundred
    emails (857b5f70)."""

    def test_no_filters_means_the_whole_school(self):
        """None, not an empty set: "everyone" and "nobody matched" are different
        answers and only one of them should send."""
        from services import announcement_service as svc
        assert svc.targeted_student_ids('org-1') is None

    def test_classes_and_ages_are_anded_not_ored(self):
        from services import announcement_service as svc
        with patch.object(svc, '_students_in_classes', return_value={'s1', 's2'}), \
             patch.object(svc, '_admin') as admin:
            table = Mock()
            admin.return_value.table.return_value = table
            table.select.return_value = table
            table.eq.return_value = table
            table.execute.return_value = Mock(data=[
                {'id': 's1', 'date_of_birth': '2016-01-01'},   # ~10
                {'id': 's2', 'date_of_birth': '2008-01-01'},   # ~18
            ])
            got = svc.targeted_student_ids('org-1', class_ids=['c1'], min_age=9, max_age=12)
        assert got == {'s1'}

    def test_a_selection_matching_nobody_is_empty_not_everyone(self):
        from services import announcement_service as svc
        with patch.object(svc, '_students_in_classes', return_value=set()):
            assert svc.targeted_student_ids('org-1', class_ids=['c1']) == set()

    def test_recipients_narrow_to_the_targeted_students(self):
        from services import announcement_service as svc
        members = [
            {'id': 's1', 'role': 'org_managed', 'org_role': 'student'},
            {'id': 's2', 'role': 'org_managed', 'org_role': 'student'},
            {'id': 'a1', 'role': 'org_managed', 'org_role': 'advisor'},
        ]
        with patch.object(svc, '_admin') as admin:
            table = Mock()
            admin.return_value.table.return_value = table
            table.select.return_value = table
            table.eq.return_value = table
            table.order.return_value = table   # the org-members read is paged
            table.range.return_value = table
            table.execute.return_value = Mock(data=members)
            got = svc.recipients_for('org-1', ['students'], student_ids={'s1'})
        assert got == {'s1'}

    def test_the_preview_breakdown_matches_what_would_be_sent(self):
        """The composer shows who a send will reach before it goes out, and it
        is only worth trusting if it cannot disagree with the send — so both are
        built on the same resolution (iCreate, 2026-08-26: "I love that we can
        narrow it down, but it's still confusing")."""
        from services import announcement_service as svc
        members = [
            {'id': 's1', 'role': 'org_managed', 'org_role': 'student'},
            {'id': 's2', 'role': 'org_managed', 'org_role': 'student'},
            {'id': 'a1', 'role': 'org_managed', 'org_role': 'advisor'},
        ]
        with patch.object(svc, '_admin') as admin:
            table = Mock()
            admin.return_value.table.return_value = table
            table.select.return_value = table
            table.eq.return_value = table
            table.order.return_value = table
            table.range.return_value = table
            table.execute.return_value = Mock(data=members)
            by_role = svc.recipients_by_role('org-1', ['students', 'advisors'])
            everyone = svc.recipients_for('org-1', ['students', 'advisors'])
        assert by_role['students'] == {'s1', 's2'}
        assert by_role['advisors'] == {'a1'}
        assert set().union(*by_role.values()) == everyone

    def test_target_label_records_who_it_went_to(self):
        from services import announcement_service as svc
        label = svc.target_label(['parents'], class_ids=['c1', 'c2'], min_age=9, max_age=12)
        assert '2 classes' in label and 'ages 9-12' in label

    def test_target_label_is_none_when_nothing_was_narrowed(self):
        from services import announcement_service as svc
        assert svc.target_label(['parents']) is None


@pytest.mark.unit
class TestEmailIsOptional:
    """The flag defaults True so every existing caller — the Community Hub
    composer, scripts — keeps emailing exactly as before. Only the SIS Messaging
    composer passes False."""

    def _publish(self, **kwargs):
        client, table = _client(insert_returns=[{'id': 'ann-1'}])
        notifier = Mock()
        with patch('services.announcement_service._admin', return_value=client), \
             patch('services.announcement_service.recipients_for', return_value={'a'}), \
             patch('services.notification_service.NotificationService', return_value=notifier), \
             patch('services.announcement_service._email_fanout') as email:
            out = svc.publish('org-1', 'admin-1', 'Snow day', 'No school', ['parents'], **kwargs)
        return out, email

    def test_email_still_goes_out_when_nobody_asks(self):
        out, email = self._publish()
        email.assert_called_once()
        assert out['emailed'] is True

    def test_email_is_skipped_when_the_box_is_unticked(self):
        out, email = self._publish(send_email=False)
        email.assert_not_called()
        assert out['emailed'] is False

    def test_an_email_only_send_skips_the_app_entirely(self):
        """iCreate, 2026-08-31: email OR app message OR both. send_app=False
        fans out no notifications and marks the row in_app=false, which keeps
        it off the family-facing surfaces — the email is the whole delivery."""
        client, table = _client(insert_returns=[{'id': 'ann-1'}])
        notifier = Mock()
        with patch('services.announcement_service._admin', return_value=client), \
             patch('services.announcement_service.recipients_for', return_value={'a', 'b'}), \
             patch('services.notification_service.NotificationService', return_value=notifier), \
             patch('services.announcement_service._email_fanout') as email:
            out = svc.publish('org-1', 'admin-1', 'Snow day', 'No school', ['parents'],
                              send_app=False)
        assert out['sent'] == 0
        assert out['recipients'] == 2
        notifier.create_notification.assert_not_called()
        email.assert_called_once()
        assert table.insert.call_args_list[0][0][0]['in_app'] is False

    def test_attachments_are_cleaned_stored_and_handed_to_the_email(self):
        """iCreate, 2026-08-31: announcements can carry files. The client list
        is cleaned to known fields (signed display twins and garbage dropped),
        stored on the row, and passed to the email fan-out for linking."""
        client, table = _client(insert_returns=[{'id': 'ann-1'}])
        with patch('services.announcement_service._admin', return_value=client), \
             patch('services.announcement_service.recipients_for', return_value={'a'}), \
             patch('services.notification_service.NotificationService', return_value=Mock()), \
             patch('services.announcement_service._email_fanout') as email:
            svc.publish('org-1', 'admin-1', 'T', 'B', ['parents'], attachments=[
                {'url': 'https://x.supabase.co/storage/v1/object/public/user-uploads/messages/u1/f.pdf',
                 'name': 'f.pdf', 'type': 'file', 'size': 10, 'display_url': 'signed-twin'},
                'garbage',
            ])
        stored = table.insert.call_args_list[0][0][0]['attachments']
        assert len(stored) == 1
        assert stored[0]['name'] == 'f.pdf'
        assert 'display_url' not in stored[0]
        assert email.call_args.kwargs['attachments'] == stored

    def test_a_default_send_is_marked_in_app(self):
        client, table = _client(insert_returns=[{'id': 'ann-1'}])
        with patch('services.announcement_service._admin', return_value=client), \
             patch('services.announcement_service.recipients_for', return_value={'a'}), \
             patch('services.notification_service.NotificationService', return_value=Mock()), \
             patch('services.announcement_service._email_fanout'):
            svc.publish('org-1', 'admin-1', 'Snow day', 'No school', ['parents'])
        assert table.insert.call_args_list[0][0][0]['in_app'] is True

    def test_a_targeted_send_records_who_it_reached(self):
        client, table = _client(insert_returns=[{'id': 'ann-1'}])
        with patch('services.announcement_service._admin', return_value=client), \
             patch('services.announcement_service.recipients_for', return_value={'a'}), \
             patch('services.notification_service.NotificationService', return_value=Mock()), \
             patch('services.announcement_service._email_fanout'):
            svc.publish('org-1', 'admin-1', 'Snow day', 'No school', ['parents'],
                        target_label='parents (2 classes)')
        # First insert is the announcements row; the recipient snapshot follows.
        assert table.insert.call_args_list[0][0][0]['target_audience'] == 'parents (2 classes)'

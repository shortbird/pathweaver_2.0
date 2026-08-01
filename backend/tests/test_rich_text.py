"""
Formatted announcement bodies, end to end.

iCreate, 2026-08-01: "A rich text editor would be nice on the announcements and
on the messages."

The editor is the easy half. These tests are the other half: the same body is
stored as HTML, previewed as text in a notification, wrapped as HTML in an
email, and sent as text in that email's plain part. Getting one of those wrong
is how a parent ends up reading `<p>Early dismissal</p>` in their inbox.
"""

from unittest.mock import Mock, patch

import pytest

from utils import rich_text


BODY = '<p>Early dismissal <strong>Friday</strong>.</p><ul><li>Buses at noon</li></ul>'


@pytest.mark.unit
class TestIsHtml:
    def test_an_editor_body_is_html(self):
        assert rich_text.is_html(BODY)

    def test_a_typed_message_is_not(self):
        assert not rich_text.is_html('Early dismissal Friday.\nBuses at noon.')

    def test_a_less_than_sign_in_prose_is_not_markup(self):
        assert not rich_text.is_html('Pickup is < 10 minutes after the bell')

    def test_nothing_is_not_html(self):
        assert not rich_text.is_html('') and not rich_text.is_html(None)


@pytest.mark.unit
class TestSanitize:
    def test_formatting_survives(self):
        out = rich_text.sanitize(BODY)
        assert '<strong>Friday</strong>' in out
        assert '<li>Buses at noon</li>' in out

    def test_a_script_never_reaches_storage(self):
        out = rich_text.sanitize('<p>Hi</p><script>alert(1)</script>')
        assert 'script' not in out and 'alert' not in out

    def test_an_event_handler_is_dropped(self):
        out = rich_text.sanitize('<p onclick="steal()">Hi</p>')
        assert 'onclick' not in out and 'Hi' in out

    def test_a_javascript_link_is_defused(self):
        out = rich_text.sanitize('<a href="javascript:alert(1)">click</a>')
        assert 'javascript:' not in out

    def test_a_real_link_survives(self):
        out = rich_text.sanitize('<p><a href="https://icreate.org/forms">Sign up</a></p>')
        assert 'https://icreate.org/forms' in out

    def test_an_image_is_not_allowed(self):
        """An announcement is school news, not a page; <img> is a tracker and a
        layout hazard in email."""
        out = rich_text.sanitize('<p>Hi <img src="http://tracker/x.gif"></p>')
        assert '<img' not in out

    def test_plain_text_is_returned_untouched(self):
        assert rich_text.sanitize('Buses at noon') == 'Buses at noon'


@pytest.mark.unit
class TestToText:
    def test_tags_become_nothing_and_blocks_become_lines(self):
        assert rich_text.to_text(BODY) == 'Early dismissal Friday.\nBuses at noon'

    def test_entities_are_read_as_characters(self):
        assert rich_text.to_text('<p>Mac &amp; cheese</p>') == 'Mac & cheese'

    def test_plain_text_passes_through(self):
        assert rich_text.to_text('Line one\nLine two') == 'Line one\nLine two'

    def test_an_empty_editor_has_no_text(self):
        """The check every "is this blank" test depends on."""
        assert rich_text.to_text('<p></p>').strip() == ''


@pytest.mark.unit
class TestPreview:
    def test_a_preview_is_one_line_of_text(self):
        assert rich_text.preview(BODY) == 'Early dismissal Friday. Buses at noon'

    def test_a_long_body_is_cut_at_the_limit(self):
        out = rich_text.preview('<p>' + 'x' * 500 + '</p>')
        assert len(out) == 201 and out.endswith('…')

    def test_the_cut_counts_words_not_markup(self):
        """200 characters of tags would otherwise fill a whole preview."""
        body = ''.join(f'<p><strong>{i}</strong></p>' for i in range(20))
        assert '<' not in rich_text.preview(body)


@pytest.mark.unit
class TestPublishStoresAndFlattens:
    def _client(self):
        client = Mock()
        table = Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'insert', 'limit'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[{'id': 'ann-1'}])
        return client, table

    def test_the_stored_body_keeps_its_formatting(self):
        from services import announcement_service as svc
        client, table = self._client()
        with patch('services.announcement_service._admin', return_value=client), \
             patch('services.announcement_service.recipients_for', return_value=set()), \
             patch('services.announcement_service._email_fanout'):
            svc.publish('org-1', 'admin-1', 'Early dismissal', BODY, ['parents'])
        assert '<strong>Friday</strong>' in table.insert.call_args[0][0]['message']

    def test_a_script_in_the_body_is_stripped_before_storage(self):
        from services import announcement_service as svc
        client, table = self._client()
        with patch('services.announcement_service._admin', return_value=client), \
             patch('services.announcement_service.recipients_for', return_value=set()), \
             patch('services.announcement_service._email_fanout'):
            svc.publish('org-1', 'admin-1', 'T', '<p>Hi</p><script>bad()</script>', ['parents'])
        assert 'script' not in table.insert.call_args[0][0]['message']

    def test_the_notification_shows_text_not_tags(self):
        from services import announcement_service as svc
        client, _ = self._client()
        notifier = Mock()
        with patch('services.announcement_service._admin', return_value=client), \
             patch('services.announcement_service.recipients_for', return_value={'a'}), \
             patch('services.notification_service.NotificationService', return_value=notifier), \
             patch('services.announcement_service._email_fanout'):
            svc.publish('org-1', 'admin-1', 'T', BODY, ['parents'])
        kwargs = notifier.create_notification.call_args.kwargs
        assert kwargs['message'] == 'Early dismissal Friday. Buses at noon'
        # Both apps render the expanded content as text, so it is flattened too.
        assert '<' not in kwargs['metadata']['full_content']


@pytest.mark.unit
class TestAnnouncementEmail:
    def test_a_formatted_body_is_not_escaped_into_the_inbox(self):
        from services.announcement_email_service import render_announcement_html
        out = render_announcement_html(BODY)
        assert '<strong>Friday</strong>' in out
        assert '&lt;p&gt;' not in out

    def test_a_plain_body_still_becomes_paragraphs(self):
        from services.announcement_email_service import render_announcement_html
        out = render_announcement_html('Line one\nLine two')
        assert out.count('line-height: 1.5') == 2   # the footer paragraph has none

    def test_a_plain_body_with_angle_brackets_is_still_escaped(self):
        from services.announcement_email_service import render_announcement_html
        out = render_announcement_html('Pickup is < 10 minutes')
        assert '&lt; 10 minutes' in out

    def test_a_script_in_a_stored_body_never_renders_in_email(self):
        from services.announcement_email_service import render_announcement_html
        out = render_announcement_html('<p>Hi</p><script>bad()</script>')
        assert 'script' not in out

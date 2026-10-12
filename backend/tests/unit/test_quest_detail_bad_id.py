"""GET /api/quests/<id> with something that is not a uuid is a 404, not a 500.

Tickets 5cd18ed1 / ee024803 (Sentry, 2026-10-12): a quest link copied out of
Gmail's redirect opened /quests/<uuid>&source=gmail&ust=...&sa=E. The whole
tail reached the route as the id, PostgREST refused it for quests.id, and the
client reported that as a 204 "Missing response" -- a 500 to the reader and a
Sentry alert to us. Not a uuid means no such quest.
"""

from unittest.mock import MagicMock, patch

from flask import Flask

from routes.quest import detail


USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
REAL = 'a2be8cb7-758e-4b6d-89fe-08d87948e812'


def _call(quest_id):
    app = Flask(__name__)
    client = MagicMock()
    with app.test_request_context(f'/api/quests/{quest_id}'), \
            patch.object(detail, 'get_supabase_admin_client', return_value=client):
        response = detail.get_quest_detail.__wrapped__(USER, quest_id)
    return response, client


def test_gmail_junk_after_the_id_is_a_404_and_reads_nothing():
    response, client = _call(f'{REAL}&source=gmail&ust=1791918907613000&sa=E')

    body, status = response
    assert status == 404
    assert body.get_json() == {'success': False, 'error': 'Quest not found'}
    client.table.assert_not_called()


def test_a_real_uuid_reaches_the_quest_read():
    # The check must not swallow real ids.
    with patch.object(detail, 'resolve_student_scope', return_value=USER):
        _, client = _call(REAL)
    client.table.assert_any_call('quests')

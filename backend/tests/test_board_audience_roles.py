"""Announcements name several roles at once (iCreate, 2026-09-23, 9a335881:
"announcements should have multi-role select options"), and the board shows
how many of the people a post was sent to have read it (9b46c748).

What these pin:
  - a post stores its roles (sis_announcements.audiences) AND the nearest
    single word, so old code and older app builds keep reading `audience`;
  - a row written before the column existed reads as the roles its single
    word always meant;
  - the family board shows a post to the household when it names parents and
    to the student when it names students -- a students-only post is new, and
    the parents do not get it;
  - the send a post spawns is addressed from the roles;
  - "Read by N of M" comes from the post's send, and a board-only post has no
    count rather than a zero.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_audiences as aud
from services import sis_community_service as community


@pytest.mark.unit
class TestVocabulary:
    @pytest.mark.parametrize('roles, word', [
        (['parents', 'students', 'teachers'], 'school'),
        (['parents'], 'families'),
        (['teachers'], 'teachers'),
        (['parents', 'teachers'], 'families'),
        (['students'], 'school'),
        (['students', 'parents'], 'school'),
    ])
    def test_the_single_word_covers_the_roles(self, roles, word):
        assert aud.board_audience_for_roles(roles) == word

    @pytest.mark.parametrize('row, roles', [
        ({'audience': 'school'}, ['parents', 'students', 'teachers']),
        ({'audience': 'families'}, ['parents']),
        ({'audience': 'teachers'}, ['teachers']),
        ({'audience': 'admins'}, ['teachers']),
        ({'audience': 'school', 'audiences': ['students']}, ['students']),
        ({'audiences': ['teachers', 'parents', 'bogus']}, ['parents', 'teachers']),
    ])
    def test_a_stored_row_reads_as_its_roles(self, row, roles):
        assert aud.row_board_roles(row) == roles

    def test_roles_notify_the_matching_recipients(self):
        assert aud.recipient_roles_for_board_roles(['teachers', 'students']) == ['students', 'advisors']

    def test_label(self):
        assert aud.board_roles_label(['parents', 'students']) == 'Parents and Students'


class _Table:
    def __init__(self, db, name):
        self.db, self.name, self.payload = db, name, None

    def __getattr__(self, attr):
        return lambda *a, **k: self

    def insert(self, payload):
        self.payload = payload
        self.db.inserts.setdefault(self.name, []).append(payload)
        return self

    def update(self, payload):
        self.payload = payload
        self.db.updates.setdefault(self.name, []).append(payload)
        return self

    def execute(self):
        if self.payload is not None:
            return Mock(data=[{'id': 'post-1', **self.payload}])
        return Mock(data=self.db.reads.get(self.name, []))


class _Db:
    def __init__(self, reads=None):
        self.inserts, self.updates, self.reads = {}, {}, reads or {}

    def table(self, name):
        return _Table(self, name)


@pytest.mark.unit
class TestPosting:
    def test_a_post_for_parents_and_students_stores_both_columns(self):
        db = _Db()
        with patch.object(community, '_admin', return_value=db), \
             patch.object(community, '_default_expires_at', return_value=None):
            result = community.create_announcement('org-1', 'kate', {
                'title': 'Picture day', 'audiences': ['students', 'parents']})
        row = db.inserts['sis_announcements'][0]
        assert row['audiences'] == ['parents', 'students']
        assert row['audience'] == 'school'
        assert result['announcement']['id'] == 'post-1'

    def test_the_old_single_word_still_works(self):
        db = _Db()
        with patch.object(community, '_admin', return_value=db), \
             patch.object(community, '_default_expires_at', return_value=None):
            community.create_announcement('org-1', 'kate', {'title': 'x', 'audience': 'families'})
        row = db.inserts['sis_announcements'][0]
        assert row['audience'] == 'families' and row['audiences'] == ['parents']

    def test_choosing_nobody_is_refused(self):
        with patch.object(community, '_admin', return_value=_Db()):
            result = community.create_announcement('org-1', 'kate', {'title': 'x', 'audiences': []})
        assert result == {'error': 'Choose who it is for'}

    def test_the_send_is_addressed_from_the_roles(self):
        db = _Db()
        with patch.object(community, '_admin', return_value=db), \
             patch.object(community, '_default_expires_at', return_value=None), \
             patch.object(community, '_publish', return_value={'sent': 3}) as publish:
            community.create_announcement('org-1', 'kate', {
                'title': 'x', 'audiences': ['students', 'teachers'],
                'destinations': ['community_board'], 'notify_app': True})
        assert publish.call_args.args[4] == ['students', 'advisors']

    def test_an_edit_rewrites_both_columns(self):
        db = _Db()
        with patch.object(community, '_admin', return_value=db), \
             patch.object(community, '_owned', return_value=True):
            community.update_announcement('org-1', 'post-1', {'audiences': ['teachers']})
        fields = db.updates['sis_announcements'][0]
        assert fields['audiences'] == ['teachers'] and fields['audience'] == 'teachers'


@pytest.mark.unit
class TestFamilyBoard:
    POSTS = [
        {'id': 'everyone', 'title': 'a', 'audience': 'school', 'audiences': None},
        {'id': 'parents', 'title': 'b', 'audience': 'families', 'audiences': ['parents']},
        {'id': 'students', 'title': 'c', 'audience': 'school', 'audiences': ['students']},
        {'id': 'staff', 'title': 'd', 'audience': 'teachers', 'audiences': ['teachers']},
    ]

    def _feed(self, is_student):
        with patch.object(community, 'list_announcements',
                          return_value=[dict(p) for p in self.POSTS]), \
             patch.object(community, 'list_carpool', return_value=[]), \
             patch.object(community, 'list_lost_found', return_value=[]), \
             patch.object(community, 'list_recognition', return_value=[]), \
             patch.object(community, 'upcoming_events', return_value=[]):
            feed = community.family_feed('org-1', is_student=is_student)
        return [a['id'] for a in feed['announcements']]

    def test_the_household_reads_what_names_parents(self):
        assert self._feed(False) == ['everyone', 'parents']

    def test_the_student_reads_what_names_students(self):
        assert self._feed(True) == ['everyone', 'students']


@pytest.mark.unit
def test_read_counts_come_from_the_posts_send():
    from repositories.message_send_repository import MessageSendRepository
    db = _Db(reads={
        'announcements': [{'id': 'send-1', 'source_announcement_id': 'post-1'}],
        'announcement_read_stats': [{'announcement_id': 'send-1', 'recipient_count': 40,
                                     'read_count': 12}],
    })
    stats = MessageSendRepository(client=db).board_post_read_stats(['post-1', 'post-2'])
    assert stats == {'post-1': {'recipient_count': 40, 'read_count': 12}}

    rows = [{'id': 'post-1'}, {'id': 'post-2'}]
    with patch.object(community, '_admin', return_value=db):
        community.attach_read_counts(rows)
    assert rows[0]['read_count'] == 12 and rows[0]['recipient_count'] == 40
    assert 'read_count' not in rows[1]

"""
Replies under a shout-out.

iCreate, 2026-08-31 (d0c7ac4e): "it would be nice to be able to add comments to
the shout-outs on Community page for the post recognition."

A shout-out is the one thing on the Community board people want to pile onto.
Agreeing used to mean writing a SECOND shout-out, which pushes the first one
down the board.

What is worth locking down is the org fence (the board is one school's
staffroom) and who may take a remark back down.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_community_service as community


ORG = 'org-1'
REC = 'rec-1'
AUTHOR = 'kate'
OTHER = 'molly'


def _admin(tables):
    """`tables` maps a table name to the rows its read returns. Writes are
    recorded on the returned mock's `.writes`."""
    admin = Mock()
    admin.writes = []

    def _table(name):
        chain = Mock()
        for m in ('select', 'eq', 'in_', 'order', 'limit'):
            getattr(chain, m).return_value = chain
        chain.execute.return_value = Mock(data=tables.get(name, []))

        def _insert(fields):
            admin.writes.append(('insert', name, fields))
            ins = Mock()
            ins.execute.return_value = Mock(data=[{**fields, 'id': 'c-new'}])
            return ins

        def _delete():
            admin.writes.append(('delete', name, None))
            return chain

        chain.insert.side_effect = _insert
        chain.delete.side_effect = _delete
        return chain

    admin.table.side_effect = _table
    return admin


@pytest.mark.unit
class TestAddingAComment:
    def test_a_reply_is_stored_against_the_shout_out_and_the_school(self):
        admin = _admin({'sis_recognition': [{'id': REC}], 'users': []})
        with patch.object(community, '_admin', return_value=admin):
            out = community.add_recognition_comment(ORG, AUTHOR, REC, ' Well deserved ')
        assert out.get('error') is None
        _op, _table, fields = admin.writes[0]
        assert fields['recognition_id'] == REC
        assert fields['organization_id'] == ORG
        assert fields['author_id'] == AUTHOR
        assert fields['body'] == 'Well deserved'

    def test_an_empty_reply_is_refused(self):
        admin = _admin({'sis_recognition': [{'id': REC}]})
        with patch.object(community, '_admin', return_value=admin):
            out = community.add_recognition_comment(ORG, AUTHOR, REC, '   ')
        assert out['error'] == 'Write something first'
        assert admin.writes == []

    def test_a_shout_out_from_another_school_cannot_be_replied_to(self):
        """The board is one school's staffroom."""
        admin = _admin({'sis_recognition': []})
        with patch.object(community, '_admin', return_value=admin):
            out = community.add_recognition_comment(ORG, AUTHOR, REC, 'Hello')
        assert out['error'] == 'Shout-out not found'
        assert admin.writes == []


@pytest.mark.unit
class TestReadingComments:
    def test_another_schools_thread_reads_as_empty(self):
        admin = _admin({'sis_recognition': []})
        with patch.object(community, '_admin', return_value=admin):
            assert community.list_recognition_comments(ORG, REC) == []

    def test_counts_come_back_per_shout_out_in_one_query(self):
        admin = _admin({'sis_recognition_comments': [
            {'recognition_id': 'a'}, {'recognition_id': 'a'}, {'recognition_id': 'b'}]})
        with patch.object(community, '_admin', return_value=admin):
            counts = community.comment_counts(ORG, ['a', 'b', 'c'])
        assert counts == {'a': 2, 'b': 1}
        assert admin.table.call_count == 1

    def test_no_shout_outs_asks_for_nothing(self):
        admin = _admin({})
        with patch.object(community, '_admin', return_value=admin):
            assert community.comment_counts(ORG, []) == {}
        admin.table.assert_not_called()

    def test_a_failed_count_does_not_cost_the_board(self):
        """A count is decoration; the shout-outs are not."""
        admin = Mock()
        chain = Mock()
        for m in ('select', 'eq', 'in_'):
            getattr(chain, m).return_value = chain
        chain.execute.side_effect = RuntimeError('down')
        admin.table.return_value = chain
        with patch.object(community, '_admin', return_value=admin):
            assert community.comment_counts(ORG, ['a']) == {}


@pytest.mark.unit
class TestRemovingAComment:
    def _delete(self, actor, is_admin, rows):
        admin = _admin({'sis_recognition_comments': rows})
        with patch.object(community, '_admin', return_value=admin):
            out = community.delete_recognition_comment(ORG, actor, 'c1', is_admin)
        return out, admin

    def test_its_author_may_take_it_back(self):
        out, admin = self._delete(AUTHOR, False, [{'id': 'c1', 'author_id': AUTHOR}])
        assert out.get('deleted') is True
        assert any(op == 'delete' for op, _t, _f in admin.writes)

    def test_somebody_else_may_not(self):
        out, admin = self._delete(OTHER, False, [{'id': 'c1', 'author_id': AUTHOR}])
        assert out['error'] == 'That is not your comment'
        assert admin.writes == []

    def test_an_admin_may_take_anyones_down(self):
        """Somebody has to be able to remove a remark from the school's board."""
        out, _admin = self._delete(OTHER, True, [{'id': 'c1', 'author_id': AUTHOR}])
        assert out.get('deleted') is True

    def test_a_comment_in_another_school_is_not_found(self):
        out, admin = self._delete(AUTHOR, True, [])
        assert out['error'] == 'Comment not found'
        assert admin.writes == []

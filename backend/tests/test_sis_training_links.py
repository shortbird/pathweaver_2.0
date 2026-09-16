"""
Training that is a link, not a quest.

iCreate, 2026-09-15: "I still dont' have a way to add resources to the teacher
training. I need to get some trainings up asap! It would also be good if we
could put a category on each training here too. For example, some trainings
are general and others are specific to certain teachers or staff." Marika, the
same day: "the ability to add training as links and not just as new quests".

A training link is an org_resources row flagged is_training. What these tests
hold down: the row is filed as staff training and never as a family document;
a teacher only sees the links aimed at them; "done" is the caller's own mark;
and the report counts a link only against the people it was set for.
"""

from unittest.mock import Mock, patch

import pytest
from flask import Flask

import routes.sis.training_links as links
from repositories.training_link_repository import TrainingLinkRepository
from services import sis_service


# Real UUIDs: the routes validate every id that arrives from the browser.
ORG = '11111111-1111-4111-8111-111111111111'
ADMIN = '22222222-2222-4222-8222-222222222222'
TEACHER = '33333333-3333-4333-8333-333333333333'
KATRINE = '44444444-4444-4444-8444-444444444444'
LINK = '55555555-5555-4555-8555-555555555555'
OTHER_ORG = '66666666-6666-4666-8666-666666666666'


class _FakeRepo:
    """The repository as the route sees it, with every write recorded."""

    def __init__(self, rows=None, acks=None, members=None):
        self.rows = rows or []
        self.acks = acks or []          # (resource_id, user_id, version_date)
        self.members = members if members is not None else {ADMIN, TEACHER, KATRINE}
        self.created, self.updated, self.deleted = [], [], []
        self.done, self.undone = [], []

    def list_for_org(self, org_id):
        return [r for r in self.rows if r['organization_id'] == org_id]

    def get_owned(self, org_id, link_id):
        for r in self.rows:
            if r['id'] == link_id and r['organization_id'] == org_id:
                return r
        return None

    def member_ids(self, org_id, ids):
        return {i for i in ids if i in self.members}

    def acks_for_user(self, user_id, link_ids):
        return {rid: {'resource_id': rid, 'user_id': uid, 'version_date': v,
                      'acknowledged_at': 'now'}
                for (rid, uid, v) in self.acks if uid == user_id and rid in link_ids}

    def acks_for_links(self, link_ids):
        return [{'resource_id': rid, 'user_id': uid, 'version_date': v,
                 'acknowledged_at': 'now'}
                for (rid, uid, v) in self.acks if rid in link_ids]

    def create_link(self, fields):
        self.created.append(fields)
        return {'id': 'new-link', 'version_date': 'v1', **fields}

    def update_link(self, link_id, fields):
        self.updated.append((link_id, fields))
        return {**self.get_owned(ORG, link_id), **fields}

    def delete_link(self, link_id):
        self.deleted.append(link_id)

    def mark_done(self, link_id, user_id, version_date):
        self.done.append((link_id, user_id, version_date))
        return {'resource_id': link_id, 'user_id': user_id,
                'version_date': version_date, 'acknowledged_at': 'now'}

    def unmark_done(self, link_id, user_id):
        self.undone.append((link_id, user_id))


def _link(**over):
    return {
        'id': LINK, 'organization_id': ORG, 'title': 'Whole Brain Teaching',
        'url': 'https://loom.com/x', 'description': None, 'category': 'Teaching',
        'sort_order': 0, 'audience': 'staff', 'visible_to_roles': None,
        'visible_to_user_ids': None, 'requires_ack': True, 'version_date': 'v1',
        **over,
    }


def _call(view, user_id, repo, *, json=None, is_admin=True, roles=(), **kwargs):
    app = Flask(__name__)
    with patch.object(links, '_repo', return_value=repo), \
         patch.object(links, '_org_or_error', return_value=(ORG, None)), \
         patch.object(sis_service, 'caller_is_admin', return_value=is_admin), \
         patch.object(sis_service, 'caller_org_roles', return_value=list(roles)), \
         app.test_request_context(json=json):
        fn = getattr(view, '__wrapped__', view)
        resp = fn(user_id, **kwargs)
    body = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    return body, status


@pytest.mark.unit
class TestAddingOne:
    def test_a_link_is_filed_with_its_category_and_required_flag(self):
        repo = _FakeRepo()
        body, status = _call(links.create_training_link, ADMIN, repo, json={
            'title': 'Whole Brain Teaching', 'url': 'https://loom.com/x',
            'category': 'Teaching', 'is_required': True,
        })
        assert status == 201 and body['link']['id'] == 'new-link'
        row = repo.created[0]
        assert row['organization_id'] == ORG and row['created_by'] == ADMIN
        assert row['category'] == 'Teaching'
        # "Required" on the Training page is requires_ack on the row: it is
        # what makes the link nag in the inbox until it is done.
        assert row['requires_ack'] is True

    def test_it_needs_a_link_a_browser_can_open(self):
        repo = _FakeRepo()
        for bad in ('', 'handbook.pdf', 'javascript:alert(1)'):
            _, status = _call(links.create_training_link, ADMIN, repo,
                              json={'title': 'T', 'url': bad})
            assert status == 400, bad
        assert repo.created == []

    def test_it_can_be_aimed_at_roles_and_at_people(self):
        """The ticket's second ask: "some trainings are general and others are
        specific to certain teachers or staff". Roles and names, together."""
        repo = _FakeRepo()
        _, status = _call(links.create_training_link, ADMIN, repo, json={
            'title': 'T', 'url': 'https://x', 'visible_to_roles': ['advisor'],
            'visible_to_user_ids': [KATRINE],
        })
        assert status == 201
        assert repo.created[0]['visible_to_roles'] == ['advisor']
        assert repo.created[0]['visible_to_user_ids'] == [KATRINE]

    def test_a_stranger_cannot_be_named(self):
        """A link pinned to an id from another school would be visible to
        nobody and look like a bug."""
        repo = _FakeRepo()
        _, status = _call(links.create_training_link, ADMIN, repo, json={
            'title': 'T', 'url': 'https://x', 'visible_to_user_ids': [OTHER_ORG],
        })
        assert status == 400 and repo.created == []


@pytest.mark.unit
class TestTheRepositoryFilesItAsStaffTraining:
    def test_the_row_is_flagged_and_kept_off_the_family_portal(self):
        """The flag is what separates the Training page from the Resources
        page, and audience 'staff' is what keeps a teacher training out of
        the family portal, which reads families/all."""
        inserted = []
        table = Mock()
        table.insert.side_effect = lambda p: (inserted.append(p), table)[1]
        table.execute.return_value = Mock(data=[{'id': 'x'}])
        client = Mock()
        client.table.return_value = table
        TrainingLinkRepository(client=client).create_link({'title': 'T', 'url': 'https://x'})
        assert inserted[0]['is_training'] is True
        assert inserted[0]['audience'] == 'staff'
        assert inserted[0]['version_date']


@pytest.mark.unit
class TestWhoSeesWhat:
    def test_a_teacher_sees_only_the_links_aimed_at_them(self):
        repo = _FakeRepo(rows=[
            _link(id='open'),
            _link(id='coords', visible_to_roles=['campus_coordinator']),
            _link(id='katrines', visible_to_user_ids=[KATRINE]),
        ])
        body, _ = _call(links.list_training_links, TEACHER, repo,
                        is_admin=False, roles=['advisor'])
        assert [l['id'] for l in body['links']] == ['open']
        body, _ = _call(links.list_training_links, KATRINE, repo,
                        is_admin=False, roles=['advisor'])
        assert [l['id'] for l in body['links']] == ['open', 'katrines']

    def test_the_office_sees_everything_it_set(self):
        repo = _FakeRepo(rows=[_link(id='open'),
                               _link(id='coords', visible_to_roles=['campus_coordinator'])])
        body, _ = _call(links.list_training_links, ADMIN, repo, is_admin=True)
        assert [l['id'] for l in body['links']] == ['open', 'coords']

    def test_the_list_says_whether_the_caller_has_done_each(self):
        repo = _FakeRepo(rows=[_link(id='done'), _link(id='todo')],
                         acks=[('done', TEACHER, 'v1')])
        body, _ = _call(links.list_training_links, TEACHER, repo,
                        is_admin=False, roles=['advisor'])
        by_id = {l['id']: l for l in body['links']}
        assert by_id['done']['my_done'] and by_id['todo']['my_done'] is None
        assert by_id['done']['is_required'] is True


@pytest.mark.unit
class TestDoingIt:
    def test_done_is_the_callers_own_mark(self):
        """The user id comes from the decorator, never from the body -- a
        teacher cannot mark a colleague's training done for them."""
        repo = _FakeRepo(rows=[_link()])
        body, status = _call(links.mark_training_link_done, TEACHER, repo,
                             json={'user_id': KATRINE}, link_id=LINK)
        assert status == 200 and body['link']['my_done']
        assert repo.done == [(LINK, TEACHER, 'v1')]

    def test_and_it_can_be_taken_back(self):
        repo = _FakeRepo(rows=[_link()], acks=[(LINK, TEACHER, 'v1')])
        body, status = _call(links.unmark_training_link_done, TEACHER, repo, link_id=LINK)
        assert status == 200 and body['link']['my_done'] is None
        assert repo.undone == [(LINK, TEACHER)]

    def test_another_schools_link_is_not_found(self):
        repo = _FakeRepo(rows=[_link(organization_id=OTHER_ORG)])
        _, status = _call(links.mark_training_link_done, TEACHER, repo, link_id=LINK)
        assert status == 404 and repo.done == []


@pytest.mark.unit
class TestTheReport:
    def _staff(self):
        return [
            {'id': ADMIN, 'name': 'Molly', 'roles': ['org_admin']},
            {'id': TEACHER, 'name': 'A Teacher', 'roles': ['advisor']},
            {'id': KATRINE, 'name': 'Katrine', 'roles': ['advisor']},
        ]

    def test_a_link_counts_only_against_the_people_it_was_set_for(self):
        """A report claiming the whole staff room is behind on Katrine's
        spreadsheet is wrong -- including the admin who shared it."""
        repo = _FakeRepo(rows=[_link(id='katrines', visible_to_user_ids=[KATRINE])],
                         acks=[('katrines', KATRINE, 'v1')])
        with patch.object(sis_service, 'list_org_staff', return_value=self._staff()):
            body, _ = _call(links.training_links_progress, ADMIN, repo)
        rows = {r['user_id']: r for r in body['staff']}
        assert rows[KATRINE]['cells'][0] == {
            'link_id': 'katrines', 'applies': True, 'done': True, 'done_at': 'now'}
        assert rows[TEACHER]['cells'][0]['applies'] is False
        assert rows[ADMIN]['cells'][0]['applies'] is False
        assert rows[KATRINE]['required_completed'] == 1
        assert rows[TEACHER]['required_total'] == 0

    def test_an_untargeted_required_link_is_everyones(self):
        repo = _FakeRepo(rows=[_link(id='open')], acks=[('open', TEACHER, 'v1')])
        with patch.object(sis_service, 'list_org_staff', return_value=self._staff()):
            body, _ = _call(links.training_links_progress, ADMIN, repo)
        rows = {r['user_id']: r for r in body['staff']}
        assert body['required_total'] == 1
        assert rows[TEACHER]['required_completed'] == 1
        assert rows[ADMIN]['required_completed'] == 0
        assert rows[ADMIN]['cells'][0]['applies'] is True


@pytest.mark.unit
class TestTheOtherPagesLeaveItAlone:
    def test_a_required_link_in_the_inbox_points_at_the_training_page(self):
        """The Resources page hides training rows, so an inbox item that sent
        somebody there would point at nothing."""
        from services import sis_tasks_service as tasks

        query = Mock()
        query.select.return_value = query
        query.eq.return_value = query
        query.order.return_value = query
        query.in_.return_value = query
        # First read: the required rows. Second: the caller's acks (none).
        query.execute.side_effect = [Mock(data=[
            {'id': 'l-1', 'title': 'Whole Brain Teaching', 'audience': 'staff',
             'requires_ack': True, 'version_date': 'v1', 'is_training': True},
            {'id': 'r-1', 'title': 'Handbook', 'audience': 'staff',
             'requires_ack': True, 'version_date': 'v1', 'is_training': False},
        ]), Mock(data=[])]
        client = Mock()
        client.table.return_value = query
        with patch.object(tasks, '_admin', return_value=client), \
             patch.object(sis_service, 'filter_role_visible', side_effect=lambda _u, rows: rows):
            out = {t['resource_id']: t for t in tasks._ack_tasks(ORG, TEACHER, 'staff')}
        assert out['l-1']['link'] == '/training'
        assert out['l-1']['title'] == 'Training: Whole Brain Teaching'
        assert out['r-1']['link'] == '/resources?highlight=r-1'

"""School points: what an award and a spend write, the no-overdraft rule,
undo, the quick buttons, and the points an approved bounty gives."""

from unittest.mock import patch

import pytest

from services import sis_points_service as svc
from services.bounty_service import BountyService
from services.base_service import ValidationError
from services.sis_points_service import DEFAULT_BUTTONS, PointsError, PointsService, bounty_points

ORG = 'org-1'
OTHER_ORG = 'org-2'
COACH = 'coach-1'


def _user(uid, org=ORG, role='student', first='Ada'):
    return {'id': uid, 'first_name': first, 'last_name': 'Kid', 'organization_id': org,
            'role': 'org_managed', 'org_role': role}


class FakeRepo:
    def __init__(self, users=None, balances=None, buttons=None, entry=None):
        self._users = {u['id']: u for u in (users or [])}
        self._balances = balances or {}
        self._buttons = buttons or []
        self._entry = entry
        self.inserted = []
        self.deleted = []
        self.replaced = None

    def users(self, ids):
        return [self._users[i] for i in ids if i in self._users]

    def balances(self, org_id, student_ids=None):
        ids = self._balances.keys() if student_ids is None else student_ids
        return [{'student_user_id': i, 'balance': self._balances[i]} for i in ids if i in self._balances]

    def insert_entries(self, rows):
        self.inserted.extend(rows)
        return [{**r, 'id': f'e{i}'} for i, r in enumerate(rows)]

    def entry(self, entry_id):
        return self._entry

    def delete_entry(self, entry_id):
        self.deleted.append(entry_id)

    def buttons(self, org_id):
        return self._buttons

    def replace_buttons(self, org_id, rows):
        self.replaced = rows
        return [{**r, 'id': f'b{i}'} for i, r in enumerate(rows)]

    def recent_entries(self, org_id, limit):
        return []


class TestAdd:
    def test_one_click_gives_every_picked_student_an_entry(self):
        repo = FakeRepo(users=[_user('s1'), _user('s2', first='Ben')], balances={'s1': 10})
        out = PointsService(repo).add(ORG, {'student_ids': ['s1', 's2'], 'amount': 5,
                                            'reason': 'Daily job'}, COACH)
        assert [(r['student_user_id'], r['amount'], r['reason'], r['created_by'])
                for r in repo.inserted] == [('s1', 5, 'Daily job', COACH), ('s2', 5, 'Daily job', COACH)]
        assert out['balances'] == {'s1': 15, 's2': 5}

    def test_a_spend_is_a_negative_entry(self):
        repo = FakeRepo(users=[_user('s1')], balances={'s1': 30})
        PointsService(repo).add(ORG, {'student_ids': ['s1'], 'amount': -20, 'reason': 'Park trip'}, COACH)
        assert repo.inserted[0]['amount'] == -20

    def test_a_spend_past_zero_is_refused_whole_and_names_who_is_short(self):
        repo = FakeRepo(users=[_user('s1'), _user('s2', first='Ben')], balances={'s1': 30, 's2': 4})
        with pytest.raises(PointsError, match='Ben Kid \\(4\\)'):
            PointsService(repo).add(ORG, {'student_ids': ['s1', 's2'], 'amount': -20,
                                          'reason': 'Crochet kit'}, COACH)
        assert repo.inserted == []

    def test_a_student_of_another_school_is_not_found(self):
        repo = FakeRepo(users=[_user('s1', org=OTHER_ORG)])
        with pytest.raises(LookupError):
            PointsService(repo).add(ORG, {'student_ids': ['s1'], 'amount': 5, 'reason': 'Job'}, COACH)

    def test_staff_cannot_be_given_points(self):
        repo = FakeRepo(users=[_user('t1', role='advisor')])
        with pytest.raises(LookupError):
            PointsService(repo).add(ORG, {'student_ids': ['t1'], 'amount': 5, 'reason': 'Job'}, COACH)

    @pytest.mark.parametrize('body', [
        {'student_ids': [], 'amount': 5, 'reason': 'Job'},
        {'student_ids': ['s1'], 'amount': 0, 'reason': 'Job'},
        {'student_ids': ['s1'], 'amount': 'five', 'reason': 'Job'},
        {'student_ids': ['s1'], 'amount': 5, 'reason': '  '},
    ])
    def test_bad_input_is_a_400(self, body):
        with pytest.raises(PointsError):
            PointsService(FakeRepo(users=[_user('s1')])).add(ORG, body, COACH)


class TestUndo:
    def test_deletes_an_entry_of_this_school(self):
        repo = FakeRepo(entry={'id': 'e1', 'organization_id': ORG, 'student_user_id': 's1'},
                        balances={'s1': 5})
        assert PointsService(repo).undo(ORG, 'e1') == {'student_id': 's1', 'balance': 5}
        assert repo.deleted == ['e1']

    def test_another_schools_entry_is_not_found(self):
        repo = FakeRepo(entry={'id': 'e1', 'organization_id': OTHER_ORG, 'student_user_id': 's1'})
        with pytest.raises(LookupError):
            PointsService(repo).undo(ORG, 'e1')
        assert repo.deleted == []


class TestButtons:
    def test_a_new_school_sees_the_daily_job_button(self):
        assert PointsService(FakeRepo()).buttons(ORG) == DEFAULT_BUTTONS

    def test_save_keeps_the_order_given(self):
        repo = FakeRepo()
        PointsService(repo).save_buttons(ORG, [{'label': 'Daily job', 'amount': 5},
                                               {'label': 'Park trip', 'amount': -20}])
        assert [(r['label'], r['amount'], r['sort_order']) for r in repo.replaced] == [
            ('Daily job', 5, 0), ('Park trip', -20, 1)]

    def test_a_zero_button_is_refused(self):
        with pytest.raises(PointsError):
            PointsService(FakeRepo()).save_buttons(ORG, [{'label': 'Nothing', 'amount': 0}])


class TestBountyPoints:
    BOUNTY = {'id': 'b1', 'title': 'Book report', 'organization_id': ORG,
              'rewards': [{'type': 'xp', 'value': 50}, {'type': 'points', 'value': 50}]}

    def test_only_points_rewards_count(self):
        assert bounty_points(self.BOUNTY) == 50

    def test_an_approved_school_bounty_gives_its_points(self):
        repo = FakeRepo(users=[_user('s1')])
        with patch('modules.enabled.module_enabled', return_value=True):
            PointsService(repo).award_bounty('s1', self.BOUNTY)
        assert [(r['amount'], r['reason'], r['source'], r['bounty_id']) for r in repo.inserted] == [
            (50, 'Book report', 'bounty', 'b1')]

    def test_nothing_at_a_school_without_points(self):
        repo = FakeRepo(users=[_user('s1')])
        with patch('modules.enabled.module_enabled', return_value=False):
            PointsService(repo).award_bounty('s1', self.BOUNTY)
        assert repo.inserted == []

    def test_nothing_for_a_student_of_another_school(self):
        repo = FakeRepo(users=[_user('s1', org=OTHER_ORG)])
        with patch('modules.enabled.module_enabled', return_value=True):
            PointsService(repo).award_bounty('s1', self.BOUNTY)
        assert repo.inserted == []


class TestBountyRewardShape:
    def test_points_reward_carries_text_every_renderer_prints(self):
        built = BountyService._build_rewards([{'type': 'points', 'value': 50}])
        assert built['rewards'][0]['type'] == 'points'
        assert built['rewards'][0]['value'] == 50
        assert built['rewards'][0]['text'] == '50 points'
        assert built['total_xp'] == 0

    @pytest.mark.parametrize('value', [0, -5, 'lots', svc.MAX_AMOUNT])
    def test_bad_points_reward_is_refused(self, value):
        with pytest.raises(ValidationError):
            BountyService._build_rewards([{'type': 'points', 'value': value}])

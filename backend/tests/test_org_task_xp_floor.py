"""
The task XP floor is the org's, and every save path agrees on it.

Ticket a6f7b429, Jon England (Horizon), 2026-10-07: "When we save a task, the
XP minimum goes back to 25 and overrides the custom XP we set for that task.
This worked fine until an update in the last couple of weeks. Students are now
seeing odd totals like 100/65 because of it."

The cause: since the one quest form (9296270f) every Save re-sent every task
through clean_task, which floored at 25, while the single-task edit
(update_task) floored at 0. A 10 XP task survived one path and was reset by
the other. Owner decision: organizations can override the XP floor if they
want. So the floor is feature_flags.sis_settings.min_task_xp (1..25, default
25), read by utils/org_task_xp.py, and these tests pin that:

  * with no setting (floor 25) the full save AND update_task both raise 10 to
    25 -- on a new task and on an existing one -- so they agree;
  * with floor 5 a 10 stays 10 through both, and 3 becomes 5;
  * the helper reads anything unset or invalid as 25;
  * the settings write refuses 0 and 26;
  * the editor payload carries the floor, and the AI drafter follows it.
"""

from unittest.mock import patch

import pytest

from tests.test_sis_quest_editor import ADMIN, ORG, _call, _Db, _editor, _quest


def _floor(value):
    """Patch the org's stored settings to carry `value` (None = unset)."""
    settings = {} if value is None else {'min_task_xp': value}
    return patch('utils.org_task_xp._org_flags',
                 return_value={'sis_settings': settings})


def _full_save(floor, existing_xp, new_xp):
    """Save the whole form: one existing task, one new one. Returns {title: xp}."""
    m = _editor()
    q = _quest(created_by=ADMIN)
    old = {'id': 't-old', 'quest_id': q['id'], 'title': 'Sketch', 'order_index': 0,
           'pillar': 'art', 'xp_value': 100}
    db = _Db(quests=[q], quest_template_tasks=[old])
    with _floor(floor), patch('services.sis_quest_editor.resync'):
        body, status = _call(m, m.save_quest, ADMIN, q['id'], db=db, body={'tasks': [
            {'id': 't-old', 'title': 'Sketch', 'pillar': 'art', 'xp_value': existing_xp},
            {'title': 'Gather brushes', 'pillar': 'art', 'xp_value': new_xp},
        ]})
    assert status == 200, body
    return {t['title']: t['xp_value'] for t in db.rows('quest_template_tasks')}, body


def _single_edit(floor, xp):
    """update_task on one existing task. Returns the stored xp_value."""
    from services import sis_quest_task_editing as task_editing
    q = _quest()
    task = {'id': '00000000-0000-4000-8000-0000000000aa', 'quest_id': q['id'],
            'title': 'Sketch', 'order_index': 0, 'pillar': 'art', 'xp_value': 100,
            'diploma_subjects': ['fine_arts'], 'subject_xp_distribution': {'fine_arts': 100}}
    db = _Db(quests=[q], quest_template_tasks=[task])
    with _floor(floor), patch('services.sis_quest_task_editing.resync'):
        task_editing.update_task(db, q['id'], task['id'], {'xp_value': xp})
    return db.rows('quest_template_tasks')[0]['xp_value']


@pytest.mark.unit
class TestTheDefaultFloorIsStill25OnBothPaths:
    """No setting means exactly the old behaviour -- and now the single-task
    edit agrees with the full save instead of keeping max(0, xp)."""

    def test_the_full_save_raises_10_to_25_on_new_and_existing_tasks(self):
        stored, _ = _full_save(None, existing_xp=10, new_xp=10)
        assert stored == {'Sketch': 25, 'Gather brushes': 25}

    def test_update_task_raises_10_to_25_too(self):
        assert _single_edit(None, 10) == 25

    def test_the_two_paths_agree(self):
        stored, _ = _full_save(None, existing_xp=10, new_xp=10)
        assert stored['Sketch'] == _single_edit(None, 10)


@pytest.mark.unit
class TestAnOrgThatLoweredItsFloorKeepsItsNumbers:
    def test_a_saved_10_stays_10_through_a_full_save(self):
        stored, _ = _full_save(5, existing_xp=10, new_xp=10)
        assert stored == {'Sketch': 10, 'Gather brushes': 10}

    def test_a_saved_10_stays_10_through_update_task(self):
        assert _single_edit(5, 10) == 10

    def test_3_becomes_the_orgs_floor_on_both_paths(self):
        stored, _ = _full_save(5, existing_xp=3, new_xp=3)
        assert stored == {'Sketch': 5, 'Gather brushes': 5}
        assert _single_edit(5, 3) == 5

    def test_a_task_added_on_its_own_takes_the_floor_too(self):
        from services import sis_quest_task_editing as task_editing
        q = _quest()
        db = _Db(quests=[q], quest_template_tasks=[])
        with _floor(5), patch('services.sis_quest_task_editing.resync'):
            task_editing.add_task(db, q['id'], {'title': 'Tiny', 'xp_value': 10})
        assert db.rows('quest_template_tasks')[0]['xp_value'] == 10

    def test_the_editor_payload_tells_the_form_the_floor(self):
        _stored, body = _full_save(5, existing_xp=10, new_xp=10)
        assert body['quest']['min_task_xp'] == 5
        _stored, body = _full_save(None, existing_xp=10, new_xp=10)
        assert body['quest']['min_task_xp'] == 25


@pytest.mark.unit
class TestTheHelper:
    @pytest.mark.parametrize('raw', [None, 0, 26, -5, '10', 10.5, True, [], {}])
    def test_unset_or_invalid_reads_as_25(self, raw):
        from utils.org_task_xp import org_min_task_xp
        with _floor(raw):
            assert org_min_task_xp(ORG) == 25

    @pytest.mark.parametrize('raw', [1, 5, 10, 25])
    def test_a_whole_number_from_1_to_25_is_the_floor(self, raw):
        from utils.org_task_xp import org_min_task_xp
        with _floor(raw):
            assert org_min_task_xp(ORG) == raw

    def test_no_org_is_the_default(self):
        from utils.org_task_xp import org_min_task_xp
        assert org_min_task_xp(None) == 25

    def test_an_org_row_is_read_without_a_lookup(self):
        from utils.org_task_xp import org_min_task_xp
        with patch('utils.org_task_xp._org_flags') as lookup:
            assert org_min_task_xp({'feature_flags': {'sis_settings': {'min_task_xp': 7}}}) == 7
            assert org_min_task_xp({'feature_flags': None}) == 25
        lookup.assert_not_called()


@pytest.mark.unit
class TestTheSettingsWrite:
    """Both doors onto feature_flags pass through clean_feature_flags."""

    def _clean(self, incoming, stored=None):
        from services import org_settings_service
        return org_settings_service.clean_feature_flags(
            ORG, incoming, sees_finance=True, is_superadmin=False, stored=stored or {})

    @pytest.mark.parametrize('bad', [0, 26, -1, 10.5, '10', True])
    def test_out_of_range_is_refused(self, bad):
        from services.org_settings_service import FlagsRejected
        with pytest.raises(FlagsRejected) as rejected:
            self._clean({'sis_settings': {'min_task_xp': bad}})
        assert rejected.value.status == 400
        assert rejected.value.body['fields'] == ['sis_settings.min_task_xp']

    @pytest.mark.parametrize('good', [1, 5, 25])
    def test_1_to_25_is_stored(self, good):
        flags, _ = self._clean({'sis_settings': {'min_task_xp': good}})
        assert flags['sis_settings']['min_task_xp'] == good

    def test_an_unrelated_save_is_not_blocked_by_what_is_already_stored(self):
        stored = {'sis_settings': {'min_task_xp': 99}}
        flags, _ = self._clean({'sis_settings': {'min_task_xp': 99, 'rooms': ['A']}}, stored)
        assert flags['sis_settings']['rooms'] == ['A']

    def test_the_patch_route_merges_and_a_null_clears_it(self):
        from services import org_settings_service
        stored = {'sis_settings': {'min_task_xp': 5, 'rooms': ['A']}}
        merged = org_settings_service.merge_patch(stored, {'sis_settings': {'min_task_xp': None}})
        assert merged['sis_settings'] == {'rooms': ['A']}


@pytest.mark.unit
class TestTheAiDrafterFollowsTheFloor:
    def _norm(self, xp, floor):
        from services.quest_ai_service import QuestAIService
        from tests.test_sis_quest_authoring import _FakeService
        return QuestAIService.__new__(QuestAIService)._normalize_quest_draft.__func__(
            _FakeService(), {'title': 'T', 'tasks': [{'title': 'a', 'xp_value': xp}]},
            4, floor)['tasks'][0]['xp_value']

    def test_at_25_it_still_rounds_to_the_25_step(self):
        assert self._norm(10, 25) == 25
        assert self._norm(137, 25) == 125

    def test_below_25_it_clamps_without_rounding(self):
        assert self._norm(10, 5) == 10
        assert self._norm(3, 5) == 5
        assert self._norm(9000, 5) == 150

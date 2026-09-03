"""
Schools that switch Optio's five pillars off still write a valid pillar.

`user_quest_tasks.pillar` is NOT NULL. When an org sets
`feature_flags.hide_pillars`, the task-creation forms send no pillar at all, so
the server has to supply one — and "everything is STEM" would quietly wreck the
XP breakdown for every family at that school. It derives the pillar from the
diploma credit the family DID choose instead.

Hearthwood Academy, 2026-08-25: a parent wrote in that the pillars were
impossible to make sense of next to the diploma credits.
"""

import pytest

import app  # noqa: F401 — import graph ordering
from utils.school_subjects import (
    SCHOOL_SUBJECTS,
    SUBJECT_TO_PILLAR,
    pillar_for_subject,
)
from utils.pillar_utils import PILLAR_KEYS


@pytest.mark.parametrize('subject,expected', [
    ('language_arts', 'communication'),
    ('math', 'stem'),
    ('science', 'stem'),
    ('social_studies', 'civics'),
    ('health', 'wellness'),
    ('pe', 'wellness'),
    ('fine_arts', 'art'),
])
def test_subject_keys_map_to_their_pillar(subject, expected):
    assert pillar_for_subject(subject) == expected


@pytest.mark.parametrize('display,expected', [
    ('Language Arts', 'communication'),
    ('Fine Arts', 'art'),
    ('Social Studies', 'civics'),
    ('PE', 'wellness'),
])
def test_display_names_work_too(display, expected):
    """The frontend sends diploma_subjects keyed by display name."""
    assert pillar_for_subject(display) == expected


def test_every_school_subject_has_a_pillar():
    """No subject may fall through to the default by accident — a subject with
    no entry would silently file that family's work under STEM."""
    missing = [s for s in SCHOOL_SUBJECTS if s not in SUBJECT_TO_PILLAR]
    assert missing == [], f"school subjects with no pillar: {missing}"


def test_every_mapped_pillar_is_a_real_pillar():
    bad = {s: p for s, p in SUBJECT_TO_PILLAR.items() if p not in PILLAR_KEYS}
    assert bad == {}, f"subjects mapped to unknown pillars: {bad}"


@pytest.mark.parametrize('value', [None, '', 'not a subject', 'Underwater Basketry'])
def test_unknown_input_falls_back_rather_than_raising(value):
    """A missing or unrecognized credit must still produce a writable pillar:
    the column is NOT NULL, so raising here would fail the task creation."""
    assert pillar_for_subject(value) in PILLAR_KEYS


def test_default_is_overridable():
    assert pillar_for_subject(None, default='art') == 'art'


def test_school_payload_carries_the_flag():
    """Platform parents have no organization_id of their own, so `school` is the
    only channel the flag can reach them through."""
    from routes.auth.login.core import _school_payload

    on = _school_payload({'id': 'o1', 'name': 'Hearthwood Academy',
                          'feature_flags': {'hide_pillars': True}})
    assert on['hide_pillars'] is True

    off = _school_payload({'id': 'o2', 'name': 'Somewhere Else',
                           'feature_flags': {}})
    assert off['hide_pillars'] is False

    # A row with no feature_flags at all must not blow up /me.
    assert _school_payload({'id': 'o3', 'name': 'No Flags'})['hide_pillars'] is False


def test_school_payload_never_leaks_the_flags_blob():
    from routes.auth.login.core import _school_payload

    payload = _school_payload({
        'id': 'o1', 'name': 'Hearthwood Academy',
        'feature_flags': {'hide_pillars': True, 'stripe_secret': 'sk_live_nope'},
    })
    assert set(payload) == {'id', 'name', 'homepage', 'hide_pillars',
                            'family_first_home'}


# ── The write paths must not require a pillar ────────────────────────────────
#
# The first regression after the flag shipped: the parent-authoring endpoint
# (family_quests.create_task_for_dependent) still required a pillar, so a
# Hearthwood parent's IEW writing task refused to finalize with an error naming
# a control her form no longer shows (2026-08-25, the same parent's second
# email). These tests pin every layer of the fix:
#   - persist_accepted_task (the shared choke point) derives a pillar from the
#     diploma credit when the caller sends none;
#   - the family-quests route accepts a body with no pillar at all.


def _persist(task):
    """Run persist_accepted_task with everything but the pillar logic mocked.

    Returns the row handed to supabase.table('user_quest_tasks').insert().
    """
    from unittest.mock import MagicMock, patch
    from routes import quest_personalization as qp

    captured = {}

    def insert(row):
        captured['row'] = row
        chain = MagicMock()
        chain.execute.return_value = MagicMock(data=[row])
        return chain

    supabase = MagicMock()
    supabase.table.return_value.insert.side_effect = insert
    subject_service = MagicMock()
    subject_service.classify_task_subjects.return_value = {}

    with patch.object(qp, 'get_or_create_enrollment', return_value='uq-1'), \
            patch.object(qp, 'get_next_order_index', return_value=0), \
            patch.object(qp, '_class_subject_override', return_value=(None, None)), \
            patch('utils.xp_permissions.resolve_learner_task_xp',
                  return_value=(task.get('xp_value', 100), False)):
        qp.persist_accepted_task(
            supabase, subject_service, 'user-1', 'quest-1', dict(task),
            save_to_library=False, caller_role='parent',
        )
    return captured['row']


def test_persist_derives_pillar_from_the_chosen_credit():
    """No pillar sent + Language Arts credit -> communication, not stem."""
    row = _persist({
        'title': 'IEW writing lesson',
        'diploma_subjects': {'Language Arts': 100},
        'xp_value': 100,
    })
    assert row['pillar'] == 'communication'


def test_persist_still_honors_an_explicit_pillar():
    row = _persist({
        'title': 'Robotics build',
        'pillar': 'art',
        'diploma_subjects': {'Math': 100},
        'xp_value': 100,
    })
    assert row['pillar'] == 'art'


def test_persist_with_no_pillar_and_no_credit_still_writes_a_valid_pillar():
    """The column is NOT NULL; an empty form must never produce a bad row."""
    row = _persist({'title': 'Free exploration', 'xp_value': 100})
    assert row['pillar'] in PILLAR_KEYS


def test_family_quest_task_without_pillar_is_accepted():
    """The exact request the Hearthwood parent's finalize sends: no pillar,
    a diploma credit picked. Must reach persistence, not 400."""
    import json
    from unittest.mock import MagicMock, patch
    from flask import Flask
    from routes import family_quests

    view = family_quests.create_task_for_dependent.__wrapped__

    handed = {}

    def fake_persist(supabase, subject_service, child_id, quest_id, task, **kw):
        handed['task'] = task
        return {**task, 'id': 't-1'}

    flask_app = Flask(__name__)
    body = {
        'child_id': 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'title': 'IEW writing lesson',
        'diploma_subjects': {'Language Arts': 100},
        'xp_value': 100,
    }
    with flask_app.test_request_context(
        '/api/family/quests/q-1/tasks', method='POST',
        data=json.dumps(body), content_type='application/json',
    ), patch.object(family_quests, 'verify_parent_role'), \
            patch.object(family_quests, 'verify_parent_has_access_to_child', return_value=True), \
            patch.object(family_quests, 'get_supabase_admin_client', return_value=MagicMock()), \
            patch('routes.quest_personalization.persist_accepted_task', side_effect=fake_persist), \
            patch('utils.xp_permissions.get_effective_role_for', return_value='parent'), \
            patch('services.subject_classification_service.SubjectClassificationService', MagicMock()):
        response, _status = view('parent-user', 'q-1'), None
        payload = response[0].get_json() if isinstance(response, tuple) else response.get_json()

    assert payload['success'] is True, payload
    assert handed['task']['pillar'] is None
    assert handed['task']['diploma_subjects'] == {'Language Arts': 100}

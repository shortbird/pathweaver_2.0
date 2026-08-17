"""
The XP finish line on a training quest.

iCreate, 2026-08-17: staff and families should have to earn enough XP before
their training counts as done, rather than the quest closing whenever they feel
like pressing the button.

Deliberately NOT a new mechanism. `quests.xp_threshold` already exists and
POST /api/quests/<id>/end already refuses below it with XP_THRESHOLD_NOT_MET
(routes/quest/completion.py). All this does is let a school set that number from
the training screen, so training inherits the gate every other quest uses.

The rule worth protecting: a school may set the finish line on ITS OWN quests
only. The catalog can also point at a public Optio library quest, which belongs
to everybody -- one school retuning it would move it for every other school.
"""

from unittest.mock import Mock, patch

import pytest

import routes.sis.staff_training as training


ORG = 'org-1'
TRAINING_ID = '3f8a2b1c-9d4e-4f6a-8b7c-1e2d3f4a5b6c'


class _FakeTable:
    def __init__(self, name, rows, log):
        self.name, self._rows, self._log = name, rows, log

    def __getattr__(self, _n):
        return lambda *a, **k: self

    def insert(self, payload):
        self._log.append((self.name, 'insert', payload))
        return self

    def update(self, payload):
        self._log.append((self.name, 'update', payload))
        return self

    def delete(self):
        self._log.append((self.name, 'delete', None))
        return self

    def execute(self):
        return Mock(data=self._rows)


def _run(fn, body, tables=None, args=(), stock_image=None):
    """Drive one training route with a stubbed DB. Returns (json, status, writes).

    stock_image stands in for the automatic image lookup, which is the fallback
    when nobody uploads artwork.
    """
    from flask import Flask
    log = []
    rows = {'quests': [{'id': 'new-quest'}], **(tables or {})}
    client = Mock()
    client.table.side_effect = lambda n: _FakeTable(n, rows.get(n, []), log)
    app = Flask(__name__)
    with patch.object(training, '_admin', return_value=client), \
         patch.object(training, '_org_or_error', return_value=(ORG, None)), \
         patch('services.image_service.search_quest_image', return_value=stock_image), \
         app.test_request_context(json=body):
        target = getattr(fn, '__wrapped__', fn)
        resp = target('user-1', *args)
    payload = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    return payload, status, log


def _client_with(tables):
    """A stubbed supabase client plus the write log, for routes driven directly."""
    log = []
    client = Mock()
    client.table.side_effect = lambda n: _FakeTable(n, tables.get(n, []), log)
    return client, log


def _quest_insert(log):
    return next(p for name, op, p in log if name == 'quests' and op == 'insert')


def _quest_updates(log):
    return [p for name, op, p in log if name == 'quests' and op == 'update']


# ── Setting it when the quest is built ────────────────────────────────────────

def test_the_finish_line_is_stored_on_the_quest():
    """On the quest, not the catalog row — that is the column the end-quest
    route already enforces."""
    _, status, log = _run(training.create_training_quest, {
        'title': 'Family orientation', 'xp_threshold': 300,
    })
    assert status == 201
    assert _quest_insert(log)['xp_threshold'] == 300


def test_no_finish_line_by_default():
    _, status, log = _run(training.create_training_quest, {'title': 'Optional course'})
    assert status == 201
    assert _quest_insert(log)['xp_threshold'] is None


@pytest.mark.parametrize('given', ['', None, 0])
def test_blank_or_zero_means_no_requirement(given):
    """Every quest behaved this way before anybody set a number, and clearing
    the field has to get back to it."""
    _, status, log = _run(training.create_training_quest, {
        'title': 'T', 'xp_threshold': given,
    })
    assert status == 201
    assert _quest_insert(log)['xp_threshold'] is None


def test_a_number_typed_as_text_still_works():
    _, status, log = _run(training.create_training_quest, {'title': 'T', 'xp_threshold': '250'})
    assert status == 201
    assert _quest_insert(log)['xp_threshold'] == 250


def test_nonsense_is_refused_rather_than_silently_dropped():
    body, status, log = _run(training.create_training_quest, {
        'title': 'T', 'xp_threshold': 'lots',
    })
    assert status == 400
    assert 'number' in body['error'].lower()
    assert not log, 'nothing is created when the request is rejected'


def test_a_negative_finish_line_is_refused():
    body, status, _ = _run(training.create_training_quest, {'title': 'T', 'xp_threshold': -50})
    assert status == 400


# ── Changing it afterwards ────────────────────────────────────────────────────

def _patch(body, quest_org=ORG, training_org=ORG):
    return _run(
        training.update_training, body,
        tables={
            'sis_staff_training': [{'id': TRAINING_ID, 'organization_id': training_org,
                                    'quest_id': 'q-1'}],
            'quests': [{'id': 'q-1', 'organization_id': quest_org}],
        },
        args=(TRAINING_ID,),
    )


def test_the_finish_line_can_be_moved_after_the_fact():
    """An admin who set it too high on Monday moves it on Tuesday, without
    rebuilding the quest."""
    _, status, log = _patch({'xp_threshold': 500})
    assert status == 200
    assert _quest_updates(log) == [{'xp_threshold': 500}]


def test_the_finish_line_can_be_removed():
    _, status, log = _patch({'xp_threshold': ''})
    assert status == 200
    assert _quest_updates(log) == [{'xp_threshold': None}]


def test_a_library_quest_s_finish_line_is_not_this_school_s_to_move():
    """The catalog can point at a public Optio quest shared by every school."""
    body, status, log = _patch({'xp_threshold': 500}, quest_org=None)
    assert status == 403
    assert 'library' in body['error'].lower()
    assert not _quest_updates(log)


def test_another_org_s_training_row_is_not_editable():
    body, status, log = _patch({'xp_threshold': 500}, training_org='someone-else')
    assert status == 404
    assert not _quest_updates(log)


def test_touching_only_the_finish_line_is_a_complete_request():
    """xp_threshold lives on the quest, so the catalog-row update ends up empty
    — that must not read as 'nothing to update'."""
    _, status, _ = _patch({'xp_threshold': 100})
    assert status == 200


# ── The header image ──────────────────────────────────────────────────────────

_UPLOADED = 'https://x.supabase.co/storage/v1/object/public/quest-headers/quests/training/ab12/header_1.png'


def test_an_uploaded_image_beats_the_stock_search():
    """The admin chose a picture; a stock-photo guess must not override it."""
    _, status, log = _run(training.create_training_quest, {
        'title': 'Family orientation', 'image_url': _UPLOADED,
    }, stock_image='https://stock/img.jpg')
    assert status == 201
    assert _quest_insert(log)['header_image_url'] == _UPLOADED


def test_without_an_upload_it_still_finds_a_stock_image():
    """Existing behaviour: nobody has to supply artwork."""
    _, status, log = _run(training.create_training_quest, {'title': 'Onboarding'},
                          stock_image='https://stock/img.jpg')
    assert status == 201
    assert _quest_insert(log)['header_image_url'] == 'https://stock/img.jpg'


def test_an_image_hosted_somewhere_else_is_refused():
    """The URL arrives from the client. Left unchecked, a school's quest header
    could point anywhere on the internet and call out from every learner's
    browser."""
    body, status, log = _run(training.create_training_quest, {
        'title': 'T', 'image_url': 'https://evil.example/tracker.png',
    })
    assert status == 400
    assert 'uploaded here' in body['error'].lower()
    assert not log


def test_a_blank_image_url_is_simply_no_image():
    for blank in ('', '   ', None):
        assert training._clean_image_url(blank) == (None, None)


_LOGO = 'data:image/png;base64,AAA'


def _with_logo(body, logo=_LOGO, stock_image='https://stock/img.jpg'):
    tables = {'organizations': [{'branding_config': {'logo_url': logo}}] if logo else []}
    return _run(training.create_training_quest, body, tables=tables, stock_image=stock_image)


def test_the_school_s_own_logo_is_the_default_header():
    """Training is the school talking to its own people, so its badge beats a
    stock photo of somebody else's classroom."""
    _, status, log = _with_logo({'title': 'Onboarding'})
    assert status == 201
    quest = _quest_insert(log)
    assert quest['header_image_url'] == _LOGO
    # Contained rather than cropped full-bleed — a logo is not a hero photo.
    assert quest['metadata'] == {'header_style': 'org_logo'}


def test_an_uploaded_image_still_wins_over_the_logo():
    _, status, log = _with_logo({'title': 'Onboarding', 'image_url': _UPLOADED})
    quest = _quest_insert(log)
    assert quest['header_image_url'] == _UPLOADED
    assert quest['metadata'] == {}, 'an uploaded photo is cropped, not contained'


def test_an_org_with_no_logo_still_gets_a_stock_image():
    _, status, log = _with_logo({'title': 'Onboarding'}, logo=None)
    assert _quest_insert(log)['header_image_url'] == 'https://stock/img.jpg'


# ── Letting learners write their own tasks ────────────────────────────────────

def test_learners_cannot_add_their_own_tasks_by_default():
    _, status, log = _run(training.create_training_quest, {'title': 'Onboarding'})
    assert _quest_insert(log)['allow_custom_tasks'] is False


def test_the_source_document_is_kept_when_they_can_generate():
    """The quest's own title and description are a line and a paragraph — not
    enough to write a task about a specific policy in a 30-page handbook."""
    _, status, log = _run(training.create_training_quest, {
        'title': 'Onboarding', 'allow_custom_tasks': True,
        'source_material': 'Section 4: attendance is taken by 9:05.',
    })
    quest = _quest_insert(log)
    assert quest['allow_custom_tasks'] is True
    assert 'attendance is taken by 9:05' in quest['source_material']


def test_the_source_document_is_not_kept_when_nobody_can_generate():
    """No reason to store a handbook nothing will read."""
    _, status, log = _run(training.create_training_quest, {
        'title': 'Onboarding', 'allow_custom_tasks': False,
        'source_material': 'Section 4: attendance is taken by 9:05.',
    })
    assert _quest_insert(log)['source_material'] is None


def test_a_very_long_document_is_trimmed_to_what_the_model_was_shown():
    _, status, log = _run(training.create_training_quest, {
        'title': 'Onboarding', 'allow_custom_tasks': True,
        'source_material': 'x' * 50000,
    })
    assert len(_quest_insert(log)['source_material']) == training._MAX_SOURCE_CHARS


# ── Drafts ────────────────────────────────────────────────────────────────────

def test_a_draft_quest_is_built_inactive():
    """is_active=False is what every other read already keys off, so nothing
    else has to learn the word 'draft'."""
    _, status, log = _run(training.create_training_quest,
                          {'title': 'Work in progress', 'is_draft': True})
    assert status == 201
    assert _quest_insert(log)['is_active'] is False


def test_a_published_quest_is_active():
    _, status, log = _run(training.create_training_quest, {'title': 'Onboarding'})
    assert _quest_insert(log)['is_active'] is True


def test_a_draft_goes_on_nobody_s_account_even_with_auto_assign_ticked():
    """Saving a draft must never enrol anyone — that is the whole point of
    saving it as a draft."""
    with patch.object(training, '_assign_item') as assigner:
        body, status, _ = _run(training.create_training_quest, {
            'title': 'Work in progress', 'is_draft': True, 'auto_assign': True,
        })
    assert status == 201
    assert body['assigned'] is None
    assigner.assert_not_called()


def test_publishing_a_quest_that_goes_to_everyone_enrols_them():
    from flask import Flask
    client, log = _client_with({'sis_staff_training': [{
        'id': 'x', 'organization_id': ORG, 'quest_id': 'q1',
        'audience': 'family', 'visible_to_roles': None, 'auto_assign': True,
        'quests': {'is_active': False},
    }]})
    app = Flask(__name__)
    with patch.object(training, '_admin', return_value=client), \
         patch.object(training, '_org_or_error', return_value=(ORG, None)), \
         patch.object(training, '_assign_item',
                      return_value={'enrolled': 4, 'already': 0, 'failed': 0}) as assigner, \
         app.test_request_context(json={}):
        fn = getattr(training.publish_training, '__wrapped__', training.publish_training)
        resp = fn('user-1', TRAINING_ID)
    body = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    assert body['success'] is True
    assert body['assigned']['enrolled'] == 4
    assert {'is_active': True} in [p for n, op, p in log if n == 'quests' and op == 'update']
    assigner.assert_called_once()


def test_publishing_a_quest_people_opt_into_enrols_nobody():
    from flask import Flask
    client, _ = _client_with({'sis_staff_training': [{
        'id': 'x', 'organization_id': ORG, 'quest_id': 'q1',
        'audience': 'staff', 'visible_to_roles': None, 'auto_assign': False,
        'quests': {'is_active': False},
    }]})
    app = Flask(__name__)
    with patch.object(training, '_admin', return_value=client), \
         patch.object(training, '_org_or_error', return_value=(ORG, None)), \
         patch.object(training, '_assign_item') as assigner, \
         app.test_request_context(json={}):
        fn = getattr(training.publish_training, '__wrapped__', training.publish_training)
        resp = fn('user-1', TRAINING_ID)
    assigner.assert_not_called()


def test_publishing_another_org_s_draft_is_refused():
    from flask import Flask
    client, log = _client_with({'sis_staff_training': [{
        'id': 'x', 'organization_id': 'someone-else', 'quest_id': 'q1',
        'audience': 'staff', 'visible_to_roles': None, 'auto_assign': True,
        'quests': {'is_active': False},
    }]})
    app = Flask(__name__)
    with patch.object(training, '_admin', return_value=client), \
         patch.object(training, '_org_or_error', return_value=(ORG, None)), \
         patch.object(training, '_assign_item') as assigner, \
         app.test_request_context(json={}):
        fn = getattr(training.publish_training, '__wrapped__', training.publish_training)
        resp = fn('user-1', TRAINING_ID)
    status = resp[1] if isinstance(resp, tuple) else 200
    assert status == 404
    assigner.assert_not_called()
    assert not [p for n, op, p in log if n == 'quests' and op == 'update']


# ── Reopening a quest for more editing ────────────────────────────────────────

def _edit(body, quest_org=ORG, tasks=()):
    from flask import Flask
    client, log = _client_with({
        'sis_staff_training': [{
            'id': 'x', 'organization_id': ORG, 'quest_id': 'q-1', 'audience': 'staff',
            'visible_to_roles': None, 'auto_assign': True, 'category': 'Onboarding',
            'is_required': True, 'quests': {'is_active': False},
        }],
        'quests': [{'id': 'q-1', 'organization_id': quest_org}],
        'quest_template_tasks': list(tasks),
    })
    app = Flask(__name__)
    with patch.object(training, '_admin', return_value=client), \
         patch.object(training, '_org_or_error', return_value=(ORG, None)), \
         app.test_request_context(json=body):
        fn = getattr(training.update_training_quest, '__wrapped__', training.update_training_quest)
        resp = fn('user-1', TRAINING_ID)
    payload = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    return payload, status, log


def test_editing_rewrites_the_quest():
    _, status, log = _edit({'title': 'Onboarding 2026', 'description': 'Updated'})
    assert status == 200
    update = next(p for n, op, p in log if n == 'quests' and op == 'update')
    assert update['title'] == 'Onboarding 2026'
    assert update['big_idea'] == 'Updated'


def test_editing_replaces_the_task_list():
    """Replaced wholesale rather than diffed — a short authored list."""
    _, status, log = _edit({'title': 'T', 'tasks': [{'title': 'New task', 'xp_value': 50}]})
    assert ('quest_template_tasks', 'delete', None) in log
    inserted = next(p for n, op, p in log if n == 'quest_template_tasks' and op == 'insert')
    assert [t['title'] for t in inserted] == ['New task']


def test_editing_updates_the_catalog_settings_too():
    _, status, log = _edit({'title': 'T', 'category': 'Compliance', 'is_required': False,
                            'auto_assign': False})
    row = next(p for n, op, p in log if n == 'sis_staff_training' and op == 'update')
    assert row['category'] == 'Compliance'
    assert row['is_required'] is False
    assert row['auto_assign'] is False


def test_editing_without_a_new_image_keeps_the_old_one():
    """An untouched form must not wipe the header image the quest already has."""
    _, status, log = _edit({'title': 'T'})
    update = next(p for n, op, p in log if n == 'quests' and op == 'update')
    assert 'header_image_url' not in update


def test_turning_learner_generation_off_drops_the_stored_handbook():
    _, status, log = _edit({'title': 'T', 'allow_custom_tasks': False})
    update = next(p for n, op, p in log if n == 'quests' and op == 'update')
    assert update['source_material'] is None


def test_a_library_quest_cannot_be_rewritten_by_one_school():
    body, status, log = _edit({'title': 'Hijacked'}, quest_org=None)
    assert status == 403
    assert 'library' in body['error'].lower()
    assert not [p for n, op, p in log if n == 'quests' and op == 'update']


def test_editing_still_requires_a_title():
    body, status, log = _edit({'title': '   '})
    assert status == 400
    assert not [p for n, op, p in log if n == 'quests' and op == 'update']


def test_publishing_can_skip_the_bulk_assignment():
    """The people-picker publishes a draft before enrolling a chosen few, and
    must not sweep in the whole audience on the way."""
    from flask import Flask
    client, _ = _client_with({'sis_staff_training': [{
        'id': 'x', 'organization_id': ORG, 'quest_id': 'q1', 'audience': 'family',
        'visible_to_roles': None, 'auto_assign': True, 'quests': {'is_active': False},
    }]})
    app = Flask(__name__)
    with patch.object(training, '_admin', return_value=client), \
         patch.object(training, '_org_or_error', return_value=(ORG, None)), \
         patch.object(training, '_assign_item') as assigner, \
         app.test_request_context(json={'assign': False}):
        fn = getattr(training.publish_training, '__wrapped__', training.publish_training)
        resp = fn('user-1', TRAINING_ID)
    body = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    assert body['success'] is True
    assigner.assert_not_called()


# ── What the page reads back ──────────────────────────────────────────────────

def test_progress_reports_xp_earned_not_just_tasks_ticked():
    """A finish line measured in XP needs the XP, and there is no xp_awarded
    column — it is summed from the completed tasks' xp_value."""
    admin = Mock()
    tables = {
        'user_quests': [{'id': 'uq1', 'user_id': 'u1', 'quest_id': 'q1',
                         'completed_at': None, 'started_at': 'x'}],
        'user_quest_tasks': [
            {'id': 't1', 'user_quest_id': 'uq1', 'xp_value': 100},
            {'id': 't2', 'user_quest_id': 'uq1', 'xp_value': 50},
            {'id': 't3', 'user_quest_id': 'uq1', 'xp_value': 25},
        ],
        'quest_task_completions': [{'task_id': 't1'}, {'task_id': 't2'}],
    }
    admin.table.side_effect = lambda n: _FakeTable(n, tables.get(n, []), [])
    with patch.object(training, '_admin', return_value=admin):
        progress = training._progress_for(['u1'], ['q1'])

    own = progress[('u1', 'q1')]
    assert own['earned_xp'] == 150, 'only the completed tasks count'
    assert own['available_xp'] == 175
    assert own['done'] == 2 and own['total'] == 3


def test_someone_who_never_started_has_no_xp():
    assert training._NOT_STARTED['earned_xp'] == 0
    assert training._NOT_STARTED['available_xp'] == 0

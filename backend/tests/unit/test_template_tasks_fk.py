"""
Regression tests for the user_quest_tasks_source_template_task_id_fkey
violation (Sentry): copy_template_tasks_to_enrollment inserted whatever id
get_template_tasks returned into source_template_task_id, but the legacy
fallback tables (course_quest_tasks / quest_sample_tasks) and concurrently
delete-and-recreated template tasks produce ids that don't exist in
quest_template_tasks, so the whole insert failed and assigned students got
zero tasks. The fix validates candidate ids against quest_template_tasks and
nulls out any that don't exist (source_task_id, which has no FK, still
records provenance).
"""
import pytest
from unittest.mock import MagicMock

from utils.template_tasks import (
    copy_template_tasks_to_enrollment,
    get_valid_source_template_ids,
)


def make_admin_client(valid_template_ids):
    """Admin client mock whose quest_template_tasks select returns only
    valid_template_ids and which records user_quest_tasks inserts."""
    admin = MagicMock()
    inserted = []

    def table(name):
        chain = MagicMock()
        if name == 'quest_template_tasks':
            chain.select.return_value = chain
            chain.in_.return_value = chain
            chain.execute.return_value = MagicMock(
                data=[{'id': tid} for tid in valid_template_ids]
            )
        elif name == 'user_quest_tasks':
            def capture_insert(rows):
                inserted.extend(rows)
                return chain
            chain.insert.side_effect = capture_insert
            chain.execute.return_value = MagicMock(data=[])
        else:  # user_quests update
            chain.update.return_value = chain
            chain.eq.return_value = chain
            chain.execute.return_value = MagicMock(data=[])
        return chain

    admin.table.side_effect = table
    return admin, inserted


def task(task_id, title='Task'):
    return {'id': task_id, 'title': title, 'pillar': 'STEM & Logic'}


class TestGetValidSourceTemplateIds:
    def test_returns_only_ids_that_exist_in_quest_template_tasks(self):
        admin, _ = make_admin_client({'tmpl-1'})
        result = get_valid_source_template_ids(admin, [task('tmpl-1'), task('legacy-1')])
        assert result == {'tmpl-1'}

    def test_empty_tasks_returns_empty_set_without_querying(self):
        admin = MagicMock()
        assert get_valid_source_template_ids(admin, []) == set()
        assert get_valid_source_template_ids(admin, None) == set()
        admin.table.assert_not_called()

    def test_query_failure_degrades_to_no_source_refs(self):
        admin = MagicMock()
        admin.table.side_effect = Exception("db down")
        assert get_valid_source_template_ids(admin, [task('tmpl-1')]) == set()


class TestCopyTemplateTasksToEnrollment:
    def test_legacy_task_ids_are_nulled_in_source_template_task_id(self):
        admin, inserted = make_admin_client({'tmpl-1'})

        copied = copy_template_tasks_to_enrollment(
            admin, 'quest-1', 'user-1', 'uq-1',
            template_tasks=[task('tmpl-1'), task('legacy-1')],
        )

        assert copied == 2
        by_source = {r['source_task_id']: r for r in inserted}
        # Real template task keeps its FK reference
        assert by_source['tmpl-1']['source_template_task_id'] == 'tmpl-1'
        # Legacy/stale id must not be inserted into the FK column, but
        # source_task_id (no FK) still records where the copy came from
        assert by_source['legacy-1']['source_template_task_id'] is None
        assert by_source['legacy-1']['source_task_id'] == 'legacy-1'

    def test_all_stale_ids_still_copies_tasks(self):
        # Concurrent bulk edit deleted-and-recreated every template task:
        # none of the fetched ids exist anymore, tasks must still copy.
        admin, inserted = make_admin_client(set())

        copied = copy_template_tasks_to_enrollment(
            admin, 'quest-1', 'user-1', 'uq-1',
            template_tasks=[task('old-1'), task('old-2')],
        )

        assert copied == 2
        assert all(r['source_template_task_id'] is None for r in inserted)
        assert {r['source_task_id'] for r in inserted} == {'old-1', 'old-2'}

    def test_no_template_tasks_returns_zero(self):
        admin, inserted = make_admin_client(set())
        assert copy_template_tasks_to_enrollment(
            admin, 'quest-1', 'user-1', 'uq-1', template_tasks=[]
        ) == 0
        assert inserted == []

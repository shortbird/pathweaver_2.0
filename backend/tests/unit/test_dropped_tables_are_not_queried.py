"""Queries against tables that no longer exist may shrink, never grow.

CLAUDE.md carried this as two prose lists -- a "Deleted Tables (Don't Query)"
list of 34 names and a troubleshooting row saying `quest_tasks` should be
`user_quest_tasks`. Prose cannot fail a build, and the code disagrees with it:
33 calls in the app layers query 11 tables that are not in the production
catalog, verified against `information_schema.tables` on 2026-09-10.

Every one of those is a 500 waiting for its route to be reached, or dead code
on a route nobody reaches. Which of the two is a per-call-site question that
this file deliberately does not try to answer -- see PHASE_5_HANDOFF.md, "Bugs
found, not fixed". They were not repaired here because Phase 5 changes no
behaviour, and deleting a route is behaviour.

What this file does instead is stop the number growing, and give the next
person the list. The reason that matters more than it sounds: a dropped table
is invisible to every other check in this repository. It is not a syntax error,
not a type error, not a lint finding, and no test that mocks the Supabase
client will ever notice. PostgREST answers with a 404 that the app converts
into a 500, at runtime, in production, on whichever route a user happens to
reach first.

The table list is the union of CLAUDE.md's deleted-tables list and `quest_tasks`
(the one that has a live replacement, `user_quest_tasks`). It was checked
against production rather than trusted from the doc: all 35 are absent.
"""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]

#: Dropped from production. Confirmed absent from information_schema.tables in
#: project vvfgxcykxjybtvpfzwyx on 2026-09-10. If you are adding a name here,
#: confirm it the same way -- a table somebody *believes* is dropped, and is
#: not, would make this file quietly ban working code.
DROPPED_TABLES = (
    'accreditor_reviews',
    'ai_content_metrics',
    'ai_generation_metrics',
    'ai_improvement_logs',
    'ai_prompt_templates',
    'ai_prompt_versions',
    'ai_quest_review_history',
    'calendar_view_preferences',
    'email_campaign_sends',
    'email_campaigns',
    'friendships',
    'observer_requests',
    'parent_connection_requests',
    'parent_evidence_uploads',
    'promo_codes',
    'promo_signups',
    'quality_action_logs',
    'quest_collaboration_members',
    'quest_collaborations',
    'quest_conversions',
    'quest_task_flags',
    'quest_tasks',
    'quest_template_task_flags',
    'service_inquiries',
    'services',
    'shared_evidence',
    'shared_evidence_approvals',
    'subscription_tiers',
    'task_collaborations',
    'task_merge_sources',
    'task_merges',
    'tutor_analytics',
    'tutor_parent_access',
    'user_quest_deadlines',
    'user_segments',
)

#: Measured 2026-09-10. Ratchet down, never up.
APP_LAYER_CALLS = 33
SCRIPT_CALLS = 9

APP_DIRS = ('routes', 'services', 'repositories', 'middleware', 'utils', 'jobs', 'modules')

#: `.table('friendships')` and its double-quoted twin. Deliberately anchored on
#: the `.table(` call rather than on the bare name: `services` and `friendships`
#: are ordinary English words that appear in comments all over this codebase.
CALL = re.compile(
    r"""\.\s*table\(\s*['"](%s)['"]\s*\)""" % '|'.join(re.escape(t) for t in DROPPED_TABLES)
)


def _scan(dirs: tuple[str, ...]) -> Counter:
    found: Counter = Counter()
    for directory in dirs:
        base = BACKEND / directory
        if not base.exists():
            continue
        for path in base.rglob('*.py'):
            if '__pycache__' in path.parts:
                continue
            try:
                text = path.read_text(encoding='utf-8')
            except (OSError, UnicodeDecodeError):
                continue
            for match in CALL.finditer(text):
                found[(str(path.relative_to(BACKEND)), match.group(1))] += 1
    return found


def _report(found: Counter) -> str:
    by_table: Counter = Counter()
    for (_, table), count in found.items():
        by_table[table] += count
    lines = [f'  {count:>3}  {table}' for table, count in by_table.most_common()]
    lines.append('')
    lines += [f'  {count:>3}  {path} -> {table}' for (path, table), count in found.most_common(20)]
    return '\n'.join(lines)


def test_app_layers_do_not_add_queries_against_dropped_tables():
    found = _scan(APP_DIRS)
    total = sum(found.values())
    assert total <= APP_LAYER_CALLS, (
        f'Queries against dropped tables in the app layers grew from '
        f'{APP_LAYER_CALLS} to {total}. These tables do not exist in '
        f'production; the call will 500 the moment the route is reached.\n\n'
        + _report(found)
    )


def test_scripts_do_not_add_queries_against_dropped_tables():
    found = _scan(('scripts',))
    total = sum(found.values())
    assert total <= SCRIPT_CALLS, (
        f'Queries against dropped tables in backend/scripts grew from '
        f'{SCRIPT_CALLS} to {total}.\n\n' + _report(found)
    )


def test_the_scan_still_finds_the_known_call_sites():
    """A regex that stops matching turns this whole file into a no-op."""
    found = _scan(APP_DIRS)
    total = sum(found.values())
    assert total >= 20, (
        f'Only {total} call sites found, against a known {APP_LAYER_CALLS}. '
        'Either 13 of them were genuinely repaired -- lower APP_LAYER_CALLS and '
        'say so -- or the pattern stopped matching, which is how a ratchet '
        'passes by measuring nothing.'
    )


def test_quest_tasks_is_named_as_a_dropped_table():
    """The one with a live replacement, and the one people reach for by habit.

    `quest_tasks` was replaced by `user_quest_tasks`. It is the single most
    repeated mistake in this repository's history -- it had its own row in
    CLAUDE.md's troubleshooting table for months.
    """
    assert 'quest_tasks' in DROPPED_TABLES
    assert 'user_quest_tasks' not in DROPPED_TABLES, (
        'user_quest_tasks is the live table. Banning it would be the opposite '
        'of the rule.'
    )

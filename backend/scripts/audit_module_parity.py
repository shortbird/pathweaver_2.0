#!/usr/bin/env python3
"""
Module-parity baseline for the building-blocks refactor (ARCHITECTURE_BLOCKS.md, P0).

Captures, for every organization, the answer to every per-org gate the platform
consults today: the effective SIS module set under current rules
(sis_settings.hidden_modules + the opt-in flags + goals mode), every known flat
feature_flags gate, the dedicated AI columns, and the visibility policies.

This is the refactor's non-breaking guarantee made mechanical: run it before and
after every phase merge; the diff must be empty except where a phase's changelog
explicitly claims a change. P0 commits the first run as the baseline artifact
under docs/blocks/.

Read-only. The output never contains raw feature_flags values -- only derived
booleans, enumerated module keys, and known enum values -- so nothing secret- or
pricing-shaped can land in a committed baseline. Unknown top-level flag keys are
reported by NAME only, to catch drift.

Usage:
    python backend/scripts/audit_module_parity.py [--out FILE] [--include-inactive]

The file output carries no timestamp; the filename dates the run, so two runs
with identical answers diff empty.
"""

import argparse
import json
import os
import sys

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(_BACKEND_DIR)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(_BACKEND_DIR, '.env'))
except ImportError:
    pass  # rely on the environment

import utils  # noqa: E402,F401 -- fully init the package first; importing
# database directly trips the database<->utils.auth circular import.
from database import get_supabase_admin_client  # noqa: E402

# The 14 opt-out module keys -- mirrors SIS_MODULE_BY_PATH's value set in
# frontend/src/pages/sis/sisModules.js. A key listed in hidden_modules turns
# that module's nav/routes off; anything else is on (when the SIS itself is).
OPT_OUT_MODULES = (
    'attendance', 'billing', 'calendar', 'classes', 'clp', 'curriculum',
    'forms', 'onboarding', 'reports', 'resources', 'secure_documents',
    'tasks', 'timesheets', 'training',
)

# Flat top-level feature_flags keys read anywhere as gates (org_has_feature /
# useOrgFeature semantics: truthy = on). 'registration'/'icreate_registration'
# hold config dicts; truthiness here means "funnel configured".
FLAT_GATES = (
    'sis_enabled', 'scheduled_publish', 'due_dates', 'lock_xp_editing',
    'xp_goals', 'kiosk', 'hide_public_bounties', 'step_printing',
    'email_reply_to', 'registration', 'icreate_registration',
)

# Top-level keys that are known and deliberately not booleans.
KNOWN_TOP_LEVEL = set(FLAT_GATES) | {'sis_settings', 'oea_settings', 'modules'}

ORG_COLUMNS = (
    'id, name, slug, is_active, archived_at, feature_flags, '
    'ai_features_enabled, ai_chatbot_enabled, ai_lesson_helper_enabled, '
    'ai_task_generation_enabled, quest_visibility_policy, '
    'course_visibility_policy, accreditation_source'
)


def org_record(row):
    flags = row.get('feature_flags') or {}
    sis_settings = flags.get('sis_settings') or {}

    hidden_raw = sis_settings.get('hidden_modules')
    hidden = sorted(hidden_raw) if isinstance(hidden_raw, list) else []
    unknown_hidden = sorted(set(hidden) - set(OPT_OUT_MODULES))

    sis_enabled = bool(flags.get('sis_enabled'))
    opt_ins = {
        'community': sis_settings.get('community_enabled') is True,
        'prior_learning': sis_settings.get('prior_learning_enabled') is True,
        'goals': sis_settings.get('post_registration_flow') == 'goals',
        'kiosk': bool(flags.get('kiosk')),
    }

    if sis_enabled:
        effective = sorted(
            [m for m in OPT_OUT_MODULES if m not in hidden]
            + [k for k, v in opt_ins.items() if v and k != 'kiosk']
        )
    else:
        effective = []

    return {
        'id': row['id'],
        'name': row.get('name'),
        'active': bool(row.get('is_active')) and not row.get('archived_at'),
        'sis': {
            'enabled': sis_enabled,
            'hidden_modules': hidden,
            'unknown_hidden_keys': unknown_hidden,
            'effective_modules': effective,
        },
        'opt_ins': opt_ins,
        'flat_gates': {k: bool(flags.get(k)) for k in FLAT_GATES},
        'unknown_top_level_keys': sorted(set(flags) - KNOWN_TOP_LEVEL),
        'sis_settings_gates': {
            'optio_courses_enabled': bool(sis_settings.get('optio_courses_enabled')),
            'directory_default_in': bool(sis_settings.get('directory_default_in')),
            'school_homepage': bool(sis_settings.get('school_homepage')),
            'post_registration_flow': sis_settings.get('post_registration_flow') or None,
        },
        'ai': {
            'features': bool(row.get('ai_features_enabled')),
            'chatbot': bool(row.get('ai_chatbot_enabled')),
            'lesson_helper': bool(row.get('ai_lesson_helper_enabled')),
            'task_generation': bool(row.get('ai_task_generation_enabled')),
        },
        'policies': {
            'quest_visibility': row.get('quest_visibility_policy'),
            'course_visibility': row.get('course_visibility_policy'),
            'accreditation_source': row.get('accreditation_source'),
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument('--out', help='write JSON here instead of stdout')
    parser.add_argument('--include-inactive', action='store_true',
                        help='include inactive/archived orgs (excluded by default)')
    args = parser.parse_args()

    client = get_supabase_admin_client()
    result = client.table('organizations').select(ORG_COLUMNS, count='exact') \
        .order('slug').execute()
    rows = result.data or []
    total = result.count or 0
    # Orgs are few, but never trust an uncounted read (CLAUDE.md rule 10).
    if len(rows) != total:
        sys.exit(f'FATAL: fetched {len(rows)} of {total} organizations -- '
                 'response truncated; page the read before trusting it.')

    orgs = {}
    skipped = 0
    for row in rows:
        record = org_record(row)
        if not record['active'] and not args.include_inactive:
            skipped += 1
            continue
        orgs[row['slug']] = record

    payload = {'orgs': orgs, 'orgs_included': len(orgs)}
    text = json.dumps(payload, indent=2, sort_keys=True) + '\n'

    if args.out:
        with open(args.out, 'w') as f:
            f.write(text)
        print(f'{len(orgs)} orgs written to {args.out} '
              f'({skipped} inactive skipped, {total} total)', file=sys.stderr)
    else:
        sys.stdout.write(text)
        print(f'{len(orgs)} orgs ({skipped} inactive skipped, {total} total)',
              file=sys.stderr)


if __name__ == '__main__':
    main()

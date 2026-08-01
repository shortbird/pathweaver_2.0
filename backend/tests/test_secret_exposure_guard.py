"""Regression guards for the 2026-08-01 Data API exposures (AUDIT.md C1/C2/C3).

What went wrong, so the tests below are legible:

  * A live Stripe SECRET key was stored in `organizations.feature_flags`. That
    column is covered by an RLS policy of the form `USING (is_active = true)`,
    and Postgres RLS filters ROWS, not COLUMNS -- so the key was readable by the
    `anon` role, whose key ships in the public JS bundle. Unauthenticated.
  * `GET /api/auth/me` echoed the same blob to every member of the org.
  * Two tables shipped without `ENABLE ROW LEVEL SECURITY`, and the blanket
    `ALTER DEFAULT PRIVILEGES ... GRANT ALL ... TO anon` from
    20260527_restore_default_data_api_grants.sql then made them fully readable
    AND writable by anyone.

None of these were visible from the migration history, because the offending
objects were created out-of-band. These tests catch the *code* half. The
database half is checked by scripts/audit_db_exposure.py, which runs against
the live project on a schedule.

Everything here is pure/static: no database, no Flask app, no network. That
matters because the backend pytest job in release.yml is currently non-enforcing
(`|| true`), so these are run as a separate, enforcing CI step.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from utils.org_secrets import (
    CALENDAR_FEED_TOKEN,
    KNOWN_SECRETS,
    STRIPE_SECRET_KEY,
    secret_shaped_keys,
    strip_secrets_from_feature_flags,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATION_DIRS = [
    REPO_ROOT / 'supabase' / 'migrations',
    REPO_ROOT / 'backend' / 'migrations',
]


# ── C1/C3: secrets must not survive a round trip through feature_flags ───────

class TestStripSecretsFromFeatureFlags:
    def test_removes_stripe_key_a_stale_client_puts_back(self):
        """The settings UI read-modify-writes the whole blob, so a tab loaded
        before the migration will re-submit the nested key. It must not stick."""
        cleaned = strip_secrets_from_feature_flags({
            'icreate_registration': {
                'stripe_secret_key': 'sk_live_should_never_be_stored_here',
                'registration_fee_cents': 5000,
            },
        })
        assert 'stripe_secret_key' not in cleaned['icreate_registration']
        assert cleaned['icreate_registration']['registration_fee_cents'] == 5000

    def test_removes_calendar_feed_token(self):
        cleaned = strip_secrets_from_feature_flags({
            'sis_settings': {'calendar_feed_token': 'tok', 'calendar_categories': ['A']},
        })
        assert 'calendar_feed_token' not in cleaned['sis_settings']
        assert cleaned['sis_settings']['calendar_categories'] == ['A']

    def test_is_a_denylist_and_preserves_unknown_config(self):
        """Regression guard for a fix that would have been worse than the bug.

        An allowlist here would make the first save from the SIS settings UI
        silently delete every org setting the allowlist did not know about.
        """
        cleaned = strip_secrets_from_feature_flags({
            'sis_enabled': True,
            'some_future_setting': {'nested': [1, 2, 3]},
            'sis_settings': {'time_blocks': [{'start': '09:00'}]},
        })
        assert cleaned['sis_enabled'] is True
        assert cleaned['some_future_setting'] == {'nested': [1, 2, 3]}
        assert cleaned['sis_settings']['time_blocks'] == [{'start': '09:00'}]

    def test_does_not_mutate_caller_input(self):
        original = {'icreate_registration': {'stripe_secret_key': 'sk_live_x'}}
        strip_secrets_from_feature_flags(original)
        assert original['icreate_registration']['stripe_secret_key'] == 'sk_live_x'

    @pytest.mark.parametrize('bad', [None, 'string', 42, [], True])
    def test_non_dict_input_is_an_empty_blob(self, bad):
        assert strip_secrets_from_feature_flags(bad) == {}

    def test_every_known_secret_name_is_actually_stripped(self):
        """Adding a name to KNOWN_SECRETS without teaching the stripper about it
        would leave the new credential sitting in the client-visible blob."""
        blob = {
            'icreate_registration': {STRIPE_SECRET_KEY: 'v'},
            'sis_settings': {CALENDAR_FEED_TOKEN: 'v'},
        }
        cleaned = strip_secrets_from_feature_flags(blob)
        remaining = secret_shaped_keys(cleaned)
        assert remaining == [], f"known secrets left in the blob: {remaining}"
        # If this fails, a name was added to KNOWN_SECRETS but not to the stripper.
        assert KNOWN_SECRETS == {STRIPE_SECRET_KEY, CALENDAR_FEED_TOKEN}, (
            "KNOWN_SECRETS changed -- add the new name to "
            "strip_secrets_from_feature_flags() and to this test's blob above."
        )


# ── The guard that stops the NEXT stripe_secret_key ──────────────────────────

class TestSecretShapedKeys:
    @pytest.mark.parametrize('key', [
        'stripe_secret_key', 'client_secret', 'webhook_secret', 'admin_password',
        'private_key', 'api_key', 'apiKey', 'access_key', 'auth_token',
        'SENDGRID_API_KEY',
    ])
    def test_flags_credential_shaped_names(self, key):
        assert secret_shaped_keys({key: 'x'}) == [key]

    def test_finds_nested_and_reports_a_usable_path(self):
        found = secret_shaped_keys({'a': {'b': {'zoom_api_key': 'x'}}})
        assert found == ['a.b.zoom_api_key'], "the admin needs to know WHICH field to remove"

    def test_searches_inside_lists(self):
        found = secret_shaped_keys({'integrations': [{'name': 'z'}, {'client_secret': 'x'}]})
        assert found == ['integrations.1.client_secret']

    @pytest.mark.parametrize('key', [
        'sis_enabled', 'registration_fee_cents', 'time_blocks', 'hidden_modules',
        'first_day_of_school', 'master_schedule_url', 'scheduling_url',
        'post_registration_flow', 'calendar_categories', 'message_templates',
        'enrollment_age_gates', 'optio_course_tuition_cents', 'email_reply_to',
    ])
    def test_does_not_flag_real_settings(self, key):
        """False positives here reject an admin's save, so the pattern stays narrow.
        Every name below is one this codebase genuinely stores in feature_flags."""
        assert secret_shaped_keys({key: 'x'}) == []

    def test_clean_blob_after_stripping_known_secrets(self):
        """The write path strips first, then checks -- so relocating a known
        credential must not also trip the rejection and block the save."""
        blob = {'icreate_registration': {STRIPE_SECRET_KEY: 'sk_live_x', 'fee_mode': 'flat'}}
        assert secret_shaped_keys(strip_secrets_from_feature_flags(blob)) == []


# ── C1/C3: no route may hand feature_flags to a client unfiltered ────────────

def _python_sources():
    for path in (REPO_ROOT / 'backend').rglob('*.py'):
        parts = set(path.parts)
        if parts & {'tests', 'deprecated', 'scripts', '__pycache__'}:
            continue
        yield path


def test_no_backend_code_reads_a_secret_out_of_feature_flags():
    """The literal bug: `feature_flags[...]['stripe_secret_key']`.

    Any reintroduction means someone put a credential back into the
    client-visible blob. Reads must go through utils/org_secrets.py.
    """
    pattern = re.compile(
        r'feature_flags.{0,80}?(stripe_secret_key|calendar_feed_token)',
        re.IGNORECASE | re.DOTALL,
    )
    offenders = []
    for path in _python_sources():
        if path.name == 'org_secrets.py':
            continue  # the module that owns the migration away from this shape
        text = path.read_text(encoding='utf-8', errors='ignore')
        for match in pattern.finditer(text):
            line_no = text.count('\n', 0, match.start()) + 1
            line = text.splitlines()[line_no - 1].strip()
            if line.startswith('#') or line.startswith('--'):
                continue  # explanatory comments about the old shape are fine
            offenders.append(f"{path.relative_to(REPO_ROOT)}:{line_no}: {line[:100]}")
    assert not offenders, (
        "A credential is being read out of organizations.feature_flags again. "
        "That column is anon-readable (RLS filters rows, not columns) and is "
        "echoed to every org member by /api/auth/me. Use utils/org_secrets.py.\n"
        + '\n'.join(offenders)
    )


def test_me_endpoint_strips_secrets_from_the_org_payload():
    """`GET /api/auth/me` returns the org row to every member of the org, so the
    blob it emits must go through the stripper (AUDIT.md C3)."""
    core = (REPO_ROOT / 'backend' / 'routes' / 'auth' / 'login' / 'core.py')
    text = core.read_text(encoding='utf-8')
    assert 'strip_secrets_from_feature_flags' in text, (
        "core.py no longer strips secrets from the organization payload it "
        "returns from /api/auth/me."
    )


def test_org_update_route_diverts_and_rejects_credentials():
    """The admin PUT accepts a whole feature_flags blob from the browser."""
    mgmt = (REPO_ROOT / 'backend' / 'routes' / 'admin' / 'organization_management.py')
    text = mgmt.read_text(encoding='utf-8')
    for required in ('strip_secrets_from_feature_flags', 'secret_shaped_keys', 'set_org_secret'):
        assert required in text, (
            f"organization_management.py no longer calls {required}; a client can "
            f"write a credential straight into the anon-readable config blob."
        )


# ── C2: every table a migration creates must enable RLS in the same migration ─

_CREATE_TABLE = re.compile(
    r'create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z_0-9]*)"?',
    re.IGNORECASE,
)
_ENABLE_RLS = re.compile(
    r'alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z_][a-z_0-9]*)"?\s+'
    r'enable\s+row\s+level\s+security',
    re.IGNORECASE,
)

# Tables that no SQL migration ever secures. Each was checked individually; this
# list must only ever shrink, and nothing may be added without a reason here.
_RLS_EXEMPT = {
    # Dropped from production (see CLAUDE.md "Deleted Tables"). The CREATE
    # remains in history; the table does not exist to expose.
    'task_collaborations', 'quest_task_flags', 'quest_template_task_flags',
    'spark_auth_codes', 'sis_checkins',
    # Created by backend/migrations/personalized_quests_migration.py -- a Python
    # script, so the ALTER lives in Python rather than SQL. RLS verified ENABLED
    # in production on 2026-08-01. Tracked as AUDIT.md L2 (migration drift):
    # the fix is to port that script to SQL, not to widen this list.
    'user_quest_tasks', 'quest_personalization_sessions', 'ai_task_cache',
    'quest_template_tasks',
}

# The migration that performs the credential relocation necessarily names the
# credential in SQL. It is the cure, not the disease.
_SECRET_RELOCATION_MIGRATIONS = {'20260801_org_secrets_and_rls_gaps.sql'}

# Migrations from this date forward must enable RLS in the SAME file as the
# CREATE TABLE, so a reviewer can see the protection without querying prod.
_SAME_FILE_RULE_FROM = '20260801'


def _sql_migrations():
    for directory in MIGRATION_DIRS:
        if directory.is_dir():
            yield from sorted(directory.glob('*.sql'))


def _uncommented(sql: str) -> str:
    return '\n'.join(
        line for line in sql.splitlines() if not line.strip().startswith('--')
    )


def test_every_created_table_gets_rls_somewhere_in_the_migrations():
    """C2's root cause, made unrepeatable.

    `portfolio_visibility_reset_20260801` (718 rows of student minor/consent
    flags) and `sis_billing_audit` were created without RLS. Because
    20260527_restore_default_data_api_grants.sql grants `ALL` on every new
    public table to `anon`, a missing `ENABLE ROW LEVEL SECURITY` is not a 404 --
    it is a world-readable and world-TRUNCATABLE table.

    Repo-wide rather than per-file, because securing a table in a later
    migration is a legitimate pattern here (lti_auth_codes / lti_nonces were
    fixed that way in 20260505). The stricter same-file rule applies to new
    migrations only -- see the test below.
    """
    created = {}   # table -> first migration that creates it
    secured = set()
    for path in _sql_migrations():
        body = _uncommented(path.read_text(encoding='utf-8', errors='ignore'))
        for table in _CREATE_TABLE.findall(body):
            created.setdefault(table.lower(), path)
        secured.update(t.lower() for t in _ENABLE_RLS.findall(body))

    missing = sorted(set(created) - secured - _RLS_EXEMPT)
    assert not missing, (
        "These tables are created by a migration but RLS is never enabled on "
        "them anywhere in the repo. Default privileges grant anon ALL on new "
        "public tables, so each is anonymously readable AND writable:\n  "
        + '\n  '.join(f"{t}  (created in {created[t].relative_to(REPO_ROOT)})"
                      for t in missing)
        + "\n\nAdd:  alter table public.<name> enable row level security;"
    )


def test_new_migrations_enable_rls_in_the_same_file():
    """Stricter rule for anything written from 2026-08-01 onward.

    Splitting CREATE and ENABLE across files is how a table ends up unprotected
    for months without anyone noticing -- the repo stops being self-describing.
    """
    violations = []
    for path in _sql_migrations():
        if path.name[:8] < _SAME_FILE_RULE_FROM or not path.name[:8].isdigit():
            continue
        body = _uncommented(path.read_text(encoding='utf-8', errors='ignore'))
        created = {t.lower() for t in _CREATE_TABLE.findall(body)}
        secured = {t.lower() for t in _ENABLE_RLS.findall(body)}
        for table in sorted(created - secured - _RLS_EXEMPT):
            violations.append(f"{path.relative_to(REPO_ROOT)}: CREATE TABLE {table}")

    assert not violations, (
        "New migrations must enable RLS in the same file that creates the table:\n  "
        + '\n  '.join(violations)
    )


def test_no_migration_writes_a_credential_into_feature_flags():
    """A migration that seeds config can plant a secret in the anon-readable
    blob just as easily as application code can."""
    pattern = re.compile(
        r"feature_flags.{0,120}?(stripe_secret_key|client_secret|api_key)",
        re.IGNORECASE | re.DOTALL,
    )
    offenders = []
    for path in _sql_migrations():
        if path.name in _SECRET_RELOCATION_MIGRATIONS:
            continue
        if pattern.search(_uncommented(path.read_text(encoding='utf-8', errors='ignore'))):
            offenders.append(str(path.relative_to(REPO_ROOT)))
    assert not offenders, (
        "Migration(s) put a credential inside organizations.feature_flags, which "
        "is anon-readable and echoed to every org member: " + ', '.join(offenders)
    )

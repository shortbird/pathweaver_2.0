"""
The module registry -- the single source of truth for Optio's building blocks.

Every per-school feature surface ("block" on the marketing page, "module" in
code) is declared here once: its key, how it defaults, what it depends on, the
role tier that floors its console routes, and which legacy feature_flags gate it
grew out of. Everything else derives from this table:

  - backend/modules/enabled.py evaluates an org's effective module set,
  - backend/modules/gate.py enforces it per-request (P1 ships log-only),
  - frontend/src/modules/moduleKeys.json mirrors the gating fields for the JS
    side (tests/unit/test_module_registry.py holds the two in lockstep),
  - the superadmin Blocks panel reads names/blocks/requires for its rows.

Design: docs/ARCHITECTURE_BLOCKS.md (sections 2 and 4). Blocks are sales
granularity, modules are gating granularity -- the `blocks` tuple is display
metadata, several blocks can share a module.

Adding a module: add a ModuleDef here, mirror the gating fields in
moduleKeys.json, and give its routes a gate. The registry test fails on a
missing mirror, an unknown parent/requires target, or a gated blueprint whose
role tier disagrees with `min_tier`.
"""

from dataclasses import dataclass, field
from typing import Dict, Optional, Tuple

CATEGORIES = ('learning', 'credentials', 'ai', 'people', 'operations', 'community')
DEFAULTS = ('core', 'on', 'off')   # core: always on, no toggle | on: opt-out | off: opt-in
TIERS = ('staff', 'admin', 'finance', 'hr')   # mirrors utils/sis_roles.py tier names
SURFACES = ('console', 'learning', 'family', 'mobile', 'public')
GATES = ('flags', 'ai_columns')

# Legacy sources: where the gate's answer comes from when feature_flags.modules
# has no explicit entry for the key. None = the registry default decides.
LEGACY_SOURCES = (
    'sis_enabled',              # flat flags.sis_enabled
    'hidden_modules',           # on unless listed in sis_settings.hidden_modules
    'community_enabled',        # sis_settings.community_enabled is True
    'prior_learning_enabled',   # sis_settings.prior_learning_enabled is True
    'kiosk_flag',               # flat flags.kiosk
    'goals_mode',               # sis_settings.post_registration_flow == 'goals'
    'oea_enabled',              # flat flags.oea_enabled (diploma program; P0 trace)
)


@dataclass(frozen=True)
class ModuleDef:
    key: str
    name: str
    category: str
    blocks: Tuple[str, ...] = ()
    default: str = 'on'
    parent: Optional[str] = None            # read-time cascade ('sis' for SIS modules)
    requires: Tuple[str, ...] = ()          # all-of, validated at TOGGLE time only
    requires_any: Tuple[str, ...] = ()      # any-of, validated at TOGGLE time only
    min_tier: str = 'staff'
    surfaces: Tuple[str, ...] = ('console',)
    gate: str = 'flags'
    legacy: Optional[str] = None


def _defs() -> Tuple[ModuleDef, ...]:
    return (
        # ------------------------------------------------------------------
        # Platform / LMS
        # ------------------------------------------------------------------
        ModuleDef('quests', 'Quests', 'learning', ('Quests',),
                  default='core', surfaces=('learning', 'mobile')),
        ModuleDef('xp', 'XP & Five Pillars', 'learning', ('XP & Five Pillars',),
                  default='core', surfaces=('learning', 'mobile')),
        ModuleDef('portfolio', 'Portfolios', 'learning',
                  ('Portfolios', 'Evidence Reports'),
                  default='core', surfaces=('learning', 'mobile', 'public')),
        ModuleDef('journal', 'Learning Journal', 'learning', ('Learning Journal',),
                  surfaces=('learning', 'mobile')),
        ModuleDef('courses', 'Courses & Lessons', 'learning', ('Courses & Lessons',),
                  surfaces=('learning', 'mobile')),
        # Absorbs the COURSE_CREATOR_USER_IDS hardcode in routes/courses/__init__.py
        # when its routes take the gate (P2+); until then registry-only.
        ModuleDef('course_builder', 'Course Builder', 'learning', ('Course Builder',),
                  default='off', surfaces=('learning',)),
        # hide_public_bounties stays a *setting* inside this module.
        ModuleDef('bounties', 'Bounty Board', 'learning', ('Bounty Board',),
                  surfaces=('learning', 'mobile')),
        ModuleDef('observer', 'Observer Access', 'community', ('Observer Access',),
                  surfaces=('learning', 'mobile')),
        # The LMS-core teacher toolkit: class create/roster/progress, task
        # verification, check-ins. Core so an LMS-only school always has it.
        ModuleDef('teaching', 'Teaching', 'operations',
                  ('Advisor Check-Ins', 'Teacher Dashboards'),
                  default='core', surfaces=('learning',)),
        ModuleDef('messaging', 'Messaging & Announcements', 'community',
                  ('Announcements', 'Messaging'),
                  default='core', surfaces=('learning', 'mobile')),
        # legacy oea_enabled: the diploma-program flag on the hearthwood orgs,
        # single reader oea_compliance_sweep_service (P0 trace, 2026-08-22).
        ModuleDef('credits', 'Credits', 'credentials',
                  ('Credit Tracking', 'Transfer Credits', 'Credit Review'),
                  default='off', surfaces=('learning', 'family'),
                  legacy='oea_enabled'),
        ModuleDef('transcripts', 'Accredited Transcripts', 'credentials',
                  ('Accredited Transcripts',),
                  default='off', requires=('credits',),
                  surfaces=('learning', 'family')),
        # Enabled = the ai_features_enabled column; the three granular columns
        # and per-child consent (utils/ai_access.py) stay exactly where they are.
        ModuleDef('ai', 'AI Tools', 'ai',
                  ('AI Tutor', 'Lesson Helper', 'Task Suggestions',
                   'Course Generator', 'Curriculum Upload'),
                  default='off', gate='ai_columns',
                  surfaces=('learning', 'mobile')),

        # ------------------------------------------------------------------
        # SIS add-on (parent 'sis' cascades at read time)
        # ------------------------------------------------------------------
        ModuleDef('sis', 'School Information System', 'people',
                  ('Roster & Households', 'Student Records',
                   'Five Ways to Add People', 'Teacher Dashboards'),
                  default='off', min_tier='admin',
                  surfaces=('console', 'family'), legacy='sis_enabled'),
        ModuleDef('classes', 'Classes & Scheduling', 'operations',
                  ('Classes & Scheduling', 'Schedule Assistant'),
                  parent='sis', surfaces=('console', 'family'),
                  legacy='hidden_modules'),
        ModuleDef('catalog', 'Catalog Widgets', 'people', ('Catalog Widgets',),
                  parent='sis', requires=('classes',),
                  surfaces=('console', 'public')),
        # No legacy source on purpose: icreate and gryffin run live funnels with
        # no `registration` config dict in feature_flags (P0 finding #2) -- the
        # gate must not key on the config's presence.
        ModuleDef('registration', 'Registration & Enrollment', 'people',
                  ('Registration Builder', 'Waitlists & Age Gates',
                   'Schedule Builder'),
                  parent='sis', min_tier='admin',
                  surfaces=('console', 'family')),
        ModuleDef('attendance', 'Attendance', 'operations',
                  ('Attendance', 'Accountability Board'),
                  parent='sis', surfaces=('console', 'family', 'mobile'),
                  legacy='hidden_modules'),
        # The tuition queue additionally depends on clp-or-goals; that is a
        # toggle-time WARNING surfaced by the Blocks panel (P3), not a hard
        # requires -- invoicing works without the tuition approval flow.
        ModuleDef('billing', 'Tuition & Invoicing', 'operations',
                  ('Tuition & Invoicing',),
                  parent='sis', requires=('registration',), min_tier='finance',
                  surfaces=('console', 'family'), legacy='hidden_modules'),
        ModuleDef('timesheets', 'Timesheets', 'operations', ('Timesheets',),
                  parent='sis', min_tier='finance',
                  surfaces=('console',), legacy='hidden_modules'),
        ModuleDef('tasks', 'Task Center', 'operations', (),
                  parent='sis', surfaces=('console', 'family'),
                  legacy='hidden_modules'),
        ModuleDef('forms', 'Forms & Requests', 'operations', ('Forms & Requests',),
                  parent='sis', surfaces=('console', 'family'),
                  legacy='hidden_modules'),
        ModuleDef('onboarding', 'Onboarding Checklists', 'operations',
                  ('Onboarding Checklists',),
                  parent='sis', surfaces=('console', 'family'),
                  legacy='hidden_modules'),
        ModuleDef('secure_documents', 'Secure Documents', 'operations',
                  ('Secure Documents',),
                  parent='sis', min_tier='hr', surfaces=('console',),
                  legacy='hidden_modules'),
        ModuleDef('clp', 'Learning Plans', 'people', ('Learning Plans',),
                  parent='sis', surfaces=('console', 'family'),
                  legacy='hidden_modules'),
        ModuleDef('goals', 'Goals', 'people', (),
                  default='off', parent='sis',
                  surfaces=('console', 'family'), legacy='goals_mode'),
        # New key: /submissions had no module key at all before this registry.
        ModuleDef('submissions', 'Submissions Inbox', 'operations',
                  ('Submissions Inbox',),
                  parent='sis', surfaces=('console',)),
        ModuleDef('curriculum', 'Curriculum Library', 'learning', (),
                  parent='sis', surfaces=('console',), legacy='hidden_modules'),
        ModuleDef('calendar', 'School Calendar', 'community', ('School Calendar',),
                  parent='sis', surfaces=('console', 'family', 'mobile'),
                  legacy='hidden_modules'),
        ModuleDef('resources', 'Resources', 'operations', (),
                  parent='sis', surfaces=('console', 'family'),
                  legacy='hidden_modules'),
        ModuleDef('training', 'Staff & Family Training', 'community',
                  ('Staff & Family Training',),
                  parent='sis', surfaces=('console', 'family'),
                  legacy='hidden_modules'),
        ModuleDef('reports', 'Reports & Exports', 'community', ('Reports & Exports',),
                  parent='sis', min_tier='admin', surfaces=('console',),
                  legacy='hidden_modules'),
        ModuleDef('community', 'Community Hub', 'community',
                  ('Community Hub', 'Family Directory'),
                  default='off', parent='sis',
                  surfaces=('console', 'family', 'mobile'),
                  legacy='community_enabled'),
        ModuleDef('prior_learning', 'Prior Learning', 'credentials',
                  ('Prior Learning',),
                  default='off', parent='sis', surfaces=('console', 'family'),
                  legacy='prior_learning_enabled'),
        ModuleDef('kiosk', 'Kiosk Check-In', 'operations', ('Kiosk Check-In',),
                  default='off', parent='sis', surfaces=('console',),
                  legacy='kiosk_flag'),
    )


MODULES: Dict[str, ModuleDef] = {m.key: m for m in _defs()}


def surface_keys(surface: str) -> frozenset:
    """Module keys declared on a surface ('family', 'console', ...). Family
    payloads intersect the effective set with surface_keys('family') so a page
    only ever learns about modules it could render."""
    return frozenset(k for k, m in MODULES.items() if surface in m.surfaces)


def _validate() -> None:
    """Fail at import on a mis-wired registry; the full checks live in
    tests/unit/test_module_registry.py."""
    if len(MODULES) != len(_defs()):
        raise ValueError('duplicate module key in registry')
    for m in MODULES.values():
        for label, value, allowed in (
            ('category', m.category, CATEGORIES),
            ('default', m.default, DEFAULTS),
            ('min_tier', m.min_tier, TIERS),
            ('gate', m.gate, GATES),
        ):
            if value not in allowed:
                raise ValueError(f'module {m.key}: bad {label} {value!r}')
        if m.legacy is not None and m.legacy not in LEGACY_SOURCES:
            raise ValueError(f'module {m.key}: unknown legacy source {m.legacy!r}')
        for ref in (m.parent,) + m.requires + m.requires_any:
            if ref is not None and ref not in MODULES:
                raise ValueError(f'module {m.key}: unknown module reference {ref!r}')
        for s in m.surfaces:
            if s not in SURFACES:
                raise ValueError(f'module {m.key}: bad surface {s!r}')


_validate()

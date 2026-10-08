"""
The module registry -- the single source of truth for Optio's building blocks.

Every per-school feature surface ("block" on the marketing page, "module" in
code) is declared here once: its key, how it defaults, what it depends on, the
role tier that floors its console routes, and which legacy feature_flags gate it
grew out of. Everything else derives from this table:

  - backend/modules/enabled.py evaluates an org's effective module set,
  - backend/modules/gate.py enforces it per-request (P1 ships log-only),
  - web/src/modules/moduleKeys.json mirrors the gating fields for the JS
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

from dataclasses import dataclass
from typing import Dict, Optional, Tuple

CATEGORIES = ('learning', 'credentials', 'ai', 'people', 'operations', 'community')
DEFAULTS = ('core', 'on', 'off')   # core: always on, no toggle | on: opt-out | off: opt-in
TIERS = ('staff', 'admin', 'finance', 'hr')   # mirrors utils/sis_roles.py tier names
SURFACES = ('console', 'learning', 'family', 'mobile', 'public')
# 'optio_diploma': the flags decide AND the org issues Optio Academy diplomas
# (organizations.accreditation_source = 'optio' -- Optio Academy itself and the
# microschools that act as its extensions). Off everywhere else, whatever the
# flags say.
GATES = ('flags', 'ai_columns', 'optio_diploma')

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
        # Friends: peer connections, the friends feed, peer comments. A parent
        # turns it on per child (peer_policies); this is the SCHOOL's switch
        # above that -- off, and no student in the org can be asked or ask,
        # whatever their family set. On by default because the per-child
        # default is off: a school that does nothing has a feature no family
        # has enabled yet, not a feature every child is in.
        ModuleDef('friends', 'Friends', 'community', ('Friends',),
                  surfaces=('learning', 'mobile', 'family')),
        # Students' own chat: class Student Chats and friend DMs. Ticket
        # 81cc92e6 (Horizon): "An option to turn off in-app chat would help,
        # because it can pull students away from their work and bury teacher
        # feedback." Off, a student of the school loses those two and keeps
        # every message from a teacher or the school
        # (services/student_chat_service.py). On by default, and the org
        # admin flips it from Settings -- it is the school's call, not a sale.
        ModuleDef('student_chat', 'Student Chat', 'community', (),
                  surfaces=('console', 'learning', 'mobile')),
        # The LMS-core teacher toolkit: class create/roster/progress, task
        # verification, check-ins. Core so an LMS-only school always has it.
        ModuleDef('teaching', 'Teaching', 'operations',
                  ('Advisor Check-Ins', 'Teacher Dashboards'),
                  default='core', surfaces=('learning',)),
        ModuleDef('messaging', 'Messaging & Announcements', 'community',
                  ('Announcements', 'Messaging'),
                  default='core', surfaces=('learning', 'mobile')),
        # legacy oea_enabled: the diploma-program flag the hearthwood orgs
        # carried (P0 trace, 2026-08-22). Its one reader, the OEA compliance
        # sweep, was removed with the program on 2026-10-02 and no org carries
        # the flag now; it stays only as this module's legacy gate.
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
        # Every task the school assigns (iCreate meeting 2026-09-23). The
        # 'forms' module ('Forms & Requests') was retired into it on
        # 2026-09-24: families message the school instead of filing forms, and
        # the office turns a message into a task. A stored 'forms' entry in
        # feature_flags.modules is ignored (modules/enabled.py reads only
        # registry keys).
        ModuleDef('tasks', 'Tasks', 'operations', ('Tasks',),
                  parent='sis', surfaces=('console', 'family'),
                  legacy='hidden_modules'),
        ModuleDef('onboarding', 'Onboarding', 'operations',
                  ('Onboarding',),
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
        # Goals a coach sets each Monday and checks on Thursday, and the freedom
        # the check-in earns (Apogee Cache Valley, 2026-10-01). Off unless an
        # org asks: it is one school's weekly routine, not a default.
        ModuleDef('weekly_goals', 'Weekly Goals', 'people', (),
                  default='off', parent='sis',
                  surfaces=('console', 'family')),
        # School points: staff give them for jobs and take them for perks,
        # and each student carries a balance (Apogee Cache Valley's ClassDojo,
        # 2026-10-08). Apart from XP; opt-in.
        ModuleDef('points', 'Points', 'people', (),
                  default='off', parent='sis',
                  surfaces=('console', 'family')),
        # The school's bounties in the console: every bounty posted to the
        # school and its claims, and any staff member may edit or review them
        # (bounty_service.can_manage). The student board stays 'bounties'.
        # Apogee Cache Valley's chores and perks, 2026-10-01; opt-in.
        ModuleDef('bounty_management', 'Bounty Management', 'learning', (),
                  default='off', parent='sis', requires=('bounties',),
                  surfaces=('console',)),
        # Bloomy (bloomylearning.com) Math and Reading pulled in nightly as
        # quest tasks, plus the link screen (Apogee Cache Valley, 2026-10-05).
        # Opt-in: it needs the school's own Bloomy key.
        ModuleDef('bloomy', 'Bloomy', 'learning', (),
                  default='off', parent='sis', min_tier='admin',
                  surfaces=('console',)),
        # A teacher working with one student outside any class: give them a
        # quest by name, set its due date, write them a task, keep notes
        # (2026-10-07: "we need a more individual option ... assign quests to
        # individual students and work with them that way"). On by default:
        # it is how a microschool teaches.
        ModuleDef('individual_work', 'Individual Students', 'learning', (),
                  parent='sis', surfaces=('console',)),
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
        # Only where the diploma is Optio Academy's (2026-10-07): there, every
        # family can send prior learning from the school page and Optio Academy
        # reviews it. A school without the diploma setting has no reviewer, so
        # no page. Such a school may still switch it off.
        ModuleDef('prior_learning', 'Prior Learning', 'credentials',
                  ('Prior Learning',),
                  default='on', parent='sis', gate='optio_diploma', surfaces=('console', 'family'),
                  legacy='prior_learning_enabled'),
        # A shared classroom device: tap your name, photograph your paper
        # work into a quest task. It rides on core LMS surfaces only (quests,
        # tasks, evidence), so it has NO parent -- an LMS-only school can run
        # kiosks without taking on the SIS console. It carried parent='sis'
        # until 2026-09-07, when Arete Academy (no SIS) asked for it and the
        # device card turned out to be unreachable for them: the card sat on
        # the console-only settings surface, behind a block the SIS switch
        # kept off. Both settings surfaces carry the card now.
        ModuleDef('kiosk', 'Kiosk Check-In', 'operations', ('Kiosk Check-In',),
                  default='off', surfaces=('console', 'learning'),
                  legacy='kiosk_flag'),
    )


MODULES: Dict[str, ModuleDef] = {m.key: m for m in _defs()}


# ---------------------------------------------------------------------------
# The starter baseline (docs/MICROSCHOOL_FIRST_PLAN.md, part 1)
# ---------------------------------------------------------------------------
# An org whose feature_flags.module_baseline is 'starter' has these modules
# OFF unless feature_flags.modules[key] is explicitly true. Every new org gets
# the baseline (services/organization_service.new_org_row); an org without the
# key evaluates exactly as before.
#
# Why these: on 2026-10-07, 253 of 261 org-attributed feature tickets in the
# last 90 days came from iCreate, and turning the console on switched on all of
# its office side at once. Outside iCreate (and Optio Academy's own billing),
# nobody used registration, billing, paperwork tasks, onboarding, secure
# documents, learning plans, resources or training -- Horizon had every one on
# and used none in 30 days. A new school gets the teaching side and opts into
# the office side.
STARTER_OFF = frozenset({
    'registration', 'catalog', 'billing', 'tasks', 'onboarding',
    'secure_documents', 'clp', 'resources', 'training',
})

# Every non-core module the baseline deliberately leaves alone: on-by-default
# modules a new school keeps (the teaching side, messaging, friends, student
# chat), and opt-in modules that are already off without the baseline. A new
# non-core module must be placed in STARTER_OFF or here
# (tests/unit/test_module_registry.py), so whoever adds one decides what a new
# school sees.
STARTER_KEEPS = frozenset({
    # on by default, and a new school keeps them
    'journal', 'courses', 'bounties', 'observer', 'friends', 'student_chat',
    'classes', 'attendance', 'submissions', 'curriculum', 'calendar', 'reports',
    'individual_work',
    'prior_learning',   # on only where the diploma is Optio Academy's anyway
    # off by default already; the baseline has nothing to add
    'course_builder', 'credits', 'transcripts', 'ai', 'sis', 'goals',
    'weekly_goals', 'points', 'bounty_management', 'bloomy', 'community', 'kiosk',
})

STARTER_BASELINE = 'starter'


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
    for key in STARTER_OFF | STARTER_KEEPS:
        if key not in MODULES or MODULES[key].default == 'core':
            raise ValueError(f'starter baseline names {key!r}, not a non-core module')
    if STARTER_OFF & STARTER_KEEPS:
        raise ValueError('a module is both off and kept in the starter baseline')


_validate()

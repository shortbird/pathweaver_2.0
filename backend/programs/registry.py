"""
Program registry (backend).

Single source of the platform's custom programs. Core code (registration today;
cron dispatch and blueprint wiring next) consults this registry instead of
importing a specific program's module — so adding a program is a registry entry,
not a core edit. Mirrors the frontend registry
(frontend/src/programs/registry.jsx). See docs/ARCHITECTURE_CORE_AND_PROGRAMS.md.

Note: this declares each program's identity + hooks; a program's own routes,
services, and rules still live in its module (routes/oea.py, routes/treehouse.py,
utils/oea_*, etc.). The registry is the seam that keeps core from naming them.
"""
from dataclasses import dataclass
from typing import List, Optional, Tuple


@dataclass(frozen=True)
class DailyCronJob:
    """A once-a-day job a program needs run (dispatched by jobs/cron_dispatch.py)."""
    name: str        # log label
    path: str        # backend endpoint path, e.g. '/api/oea/internal/compliance-sweep'
    utc_hour: int    # fire in the first cron run of this UTC hour


@dataclass(frozen=True)
class Program:
    """A custom program built on the Optio core."""
    key: str                        # stable internal id
    name: str                       # display name
    org_slugs: Tuple[str, ...] = ()  # member-org slugs that run this program in-app
    program_keys: Tuple[str, ...] = ()  # valid platform-user program_key tags (e.g. OEA families)
    daily_jobs: Tuple[DailyCronJob, ...] = ()  # program-specific daily cron jobs


# Registered programs. Adding a program = add an entry here (and its own module).
PROGRAMS: List[Program] = [
    Program(
        key='opened-academy',
        name='OpenEd Academy',
        org_slugs=('oea', 'hearthwood-test'),
        program_keys=('opened-academy',),
        daily_jobs=(
            DailyCronJob('oea-compliance-sweep', '/api/oea/internal/compliance-sweep', 13),
        ),
    ),
    Program(key='treehouse', name='The Treehouse', org_slugs=('treehouse',)),
    Program(key='gryffin', name='Gryffin Learning Center', org_slugs=('gryffin',)),
    Program(key='poe', name='Pipe Organ Encounter'),
]

_VALID_PROGRAM_KEYS = {pk for p in PROGRAMS for pk in p.program_keys}


def is_valid_program_key(program_key: Optional[str]) -> bool:
    """True if program_key is an allowlisted platform-user program tag.

    Platform users (e.g. OEA families) carry a lightweight program_key rather
    than being org-managed; registration only accepts allowlisted values.
    """
    return program_key in _VALID_PROGRAM_KEYS


def program_for_org_slug(slug: Optional[str]) -> Optional[Program]:
    """The program a member organization runs in-app, or None."""
    if not slug:
        return None
    for p in PROGRAMS:
        if slug in p.org_slugs:
            return p
    return None


def daily_cron_jobs() -> List[DailyCronJob]:
    """Every program's daily cron jobs, flattened (for jobs/cron_dispatch.py)."""
    return [job for p in PROGRAMS for job in p.daily_jobs]

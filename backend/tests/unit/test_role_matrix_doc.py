"""Guard: docs/sis/ROLE_CAPABILITIES.md still describes the code.

The document exists because nobody could say what a role could do -- the answer
lived in thirty-odd route files' worth of decorators, so every conversation
about who should see what started by guessing (iCreate asked for admin-defined
roles; what they needed first was to be able to read the roles they had).

A hand-written description of decorators drifts the moment a route is added, and
a stale one is worse than none: it is quoted in a conversation about access and
believed. So the claims that can be checked are checked, against the same source
the document was generated from.

This is deliberately NOT a full diff of the doc. It pins the load-bearing
claims -- which tier gates the money, which gates HR, which files have no role
gate at all -- and leaves the prose alone.
"""

import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]
DOC = BACKEND.parent / 'docs' / 'sis' / 'ROLE_CAPABILITIES.md'
SCRIPT = BACKEND / 'scripts' / 'dump_role_matrix.py'


@pytest.fixture(scope='module')
def matrix():
    import json
    out = subprocess.run([sys.executable, str(SCRIPT), '--json'],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


@pytest.fixture(scope='module')
def doc():
    return DOC.read_text(encoding='utf-8')


def test_the_document_exists(doc):
    assert 'What each role can do in the SIS' in doc


def test_the_generator_still_runs(matrix):
    """If the script breaks, the document silently becomes unverifiable."""
    assert len(matrix) > 25, 'the SIS route scan found almost nothing'


def test_the_money_modules_are_finance_gated(matrix):
    """The claim the coordinator role exists to make."""
    for filename in ('billing.py', 'tuition.py'):
        assert matrix[filename]['tiers'] == ['FINANCE_ROLES'], (
            f'{filename} is no longer finance-only; the document says it is, '
            'and a campus coordinator can now reach the money.')


def test_the_hr_store_is_hr_gated(matrix):
    assert matrix['secure_documents.py']['tiers'] == ['HR_ROLES']


def test_role_granting_is_still_restricted(matrix):
    assert 'ROLE_GRANT_ROLES' in matrix['__init__.py']['tiers']


def test_the_front_office_files_are_admin_gated(matrix):
    """Named in the document as ADMIN_ROLES. A file dropping to STAFF_ROLES here
    hands a teacher the front office."""
    for filename in ('registration.py', 'waitlist.py', 'clp.py', 'coordinator.py',
                     'messaging.py', 'prior_learning.py', 'schedule_ai.py',
                     'schedule_sync.py'):
        assert matrix[filename]['tiers'] == ['ADMIN_ROLES'], (
            f'{filename} changed tier -- update the document or the route.')


def test_the_staff_files_admit_teachers(matrix):
    for filename in ('staff_portal.py', 'submissions.py', 'tasks.py',
                     'engagement.py', 'goals.py', 'student_records.py',
                     'quest_drafts.py'):
        assert 'STAFF_ROLES' in matrix[filename]['tiers'], (
            f'{filename} no longer admits teachers; the document says it does.')


#: Files the document lists as authorizing per-record rather than per-role. A
#: file LEAVING this list is fine (it gained a role gate); a file joining it
#: without the document saying so means an ungated route nobody described.
DOCUMENTED_UNGATED = {
    'class_materials.py', 'class_quests.py', 'curriculum_materials.py',
    'parent.py', 'parent_forms.py', 'parent_prior_learning.py', 'pay.py',
    'quest_resources.py', 'school.py', 'signature_request_views.py',
}


def test_no_undocumented_file_lacks_a_role_gate(matrix):
    ungated = {name for name, info in matrix.items() if info['ungated']}
    undocumented = ungated - DOCUMENTED_UNGATED
    assert not undocumented, (
        'These routes/sis files have no @require_role and are not described in '
        'docs/sis/ROLE_CAPABILITIES.md. Either they authorize per-record (say '
        'how, in the doc and here) or they are missing a gate: '
        + ', '.join(sorted(undocumented))
    )


def test_the_document_names_every_tier(doc):
    for tier in ('STAFF_ROLES', 'ADMIN_ROLES', 'FINANCE_ROLES', 'HR_ROLES',
                 'ROLE_GRANT_ROLES'):
        assert tier in doc


def test_the_document_still_says_observers_have_no_sis_surface(matrix, doc):
    """The one role with no console presence at all. If a route ever admits an
    observer, this sentence becomes a lie people act on."""
    assert 'no SIS route' in doc or 'no SIS surface' in doc
    admitting = [name for name, info in matrix.items()
                 if 'observer' in info['literal_roles'] and name != 'community.py']
    assert not admitting, (
        'An SIS route now admits observers: ' + ', '.join(admitting)
        + '. The document says they have no SIS surface.')

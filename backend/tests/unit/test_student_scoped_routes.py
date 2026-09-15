"""Every student-shaped route a parent works through is behind @student_scope.

The family dashboard (2026-09-15) is the child's own screens pointed at the
child: the web and mobile apps call the SAME routes the student calls, with a
`student_id`. A route on this list that lost its decorator would not break --
it would quietly answer with the PARENT's rows under the child's name, which
is the exact failure the marker in the payload exists to catch client-side.
This test catches it server-side, at build time.

Two lists:
  * SCOPED -- endpoint name -> the disclosure record it logs (or True for a
    write, which logs nothing). Pinned per route, so adding a scoped route
    means adding it here, and removing the decorator fails the build.
  * the source scan below -- any route module that reads `student_id` off
    the request by hand must be one of the reviewed function-form sites.
"""

import re
from pathlib import Path

import pytest

from utils.auth.relationships import STUDENT_SCOPE_ATTR


BACKEND = Path(__file__).resolve().parents[2]

#: Flask endpoint name -> discloses (a str) or True (a write, nothing logged).
SCOPED = {
    # reads
    'users.dashboard.get_dashboard': 'progress',
    'users.dashboard.get_user_subject_xp': 'credits',
    'users.user_engagement.get_user_engagement': 'engagement',
    'users.profile.get_profile': 'profile',
    'users.completed_quests.get_completed_quests': 'quests',
    'quest_completion.get_user_completed_quests': 'quests',
    'quest_classes.list_my_classes': 'quests',
    'quest_classes.submit_class_for_review': True,
    'learning_events.get_learning_events': 'journal',
    'learning_events.get_learning_event': 'journal',
    'interest_tracks.get_tracks': 'journal',
    'interest_tracks.get_track': 'journal',
    'interest_tracks.get_track_stats': 'journal',
    'interest_tracks.get_unassigned_moments': 'journal',
    'interest_tracks.get_quest_moments': 'journal',
    'interest_tracks.detect_emerging_tracks': 'journal',
    'interest_tracks.preview_evolved_quest': 'journal',
    'interest_tracks.get_unified_topics': 'journal',
    'tasks.get_credit_status': 'credits',
    'tasks.get_my_credit_requests': 'credits',
    'classes.get_student_classes': 'schedule',
    'classes.get_student_agenda': 'schedule',
    # Friends (2026-09-16): a parent of a dependent sends, accepts and ends
    # friend requests for them through the same routes the child would use.
    'connections.get_connections': 'peer_connections',
    'connections.get_feed': 'activity',
    # writes
    'tasks.complete_task': True,
    'tasks.update_task': True,
    'tasks.drop_task': True,
    'tasks.request_diploma_credit': True,
    'quest_enrollment.enroll_in_quest': True,
    'quest_enrollment.create_user_quest': True,
    'quest_completion.end_quest': True,
    'quest_completion.reopen_quest': True,
    'quest_completion.reorder_quest_tasks': True,
    'quest_completion.update_display_mode': True,
    'evidence_documents.save_evidence_document': True,
    'evidence_documents.complete_task_with_evidence': True,
    'evidence_documents.upload_task_file': True,
    'evidence_documents.init_task_signed_upload': True,
    'evidence_documents.finalize_task_signed_upload': True,
    'evidence_documents.init_block_signed_upload': True,
    'evidence_documents.finalize_block_signed_upload': True,
    'evidence_documents.upload_block_file': True,
    'learning_events.update_learning_event': True,
    'learning_events.delete_learning_event': True,
    'interest_tracks.create_track': True,
    'interest_tracks.update_track': True,
    'interest_tracks.delete_track': True,
    'interest_tracks.suggest_track_for_moment': True,
    'interest_tracks.evolve_track_to_quest': True,
    'interest_tracks.assign_moment_to_topic': True,
    'interest_tracks.convert_moment_to_task': True,
    'quest_personalization.start_personalization': True,
    'quest_personalization.generate_tasks': True,
    'quest_personalization.refine_tasks': True,
    'quest_personalization.edit_task': True,
    'quest_personalization.adjust_task_difficulty': True,
    'quest_personalization.analyze_manual_task': True,
    'quest_personalization.add_manual_tasks_batch': True,
    'quest_personalization.add_path_tasks': True,
    'quest_personalization.finalize_tasks': True,
    'quest_personalization.accept_task_immediate': True,
    'quest_personalization.skip_task_save_to_library': True,
    'quest_personalization.get_personalization_status': True,
    'connections.get_eligibility': True,
    'connections.post_code': True,
    'connections.post_request': True,
    'connections.post_respond': True,
    'connections.post_revoke': True,
    'moderation.block_user': True,
    'moderation.unblock_user': True,
}

#: Routes that resolve `student_id` by hand, and why the decorator does not fit.
FUNCTION_FORM = {
    'routes/quest/listing.py': 'public route with no auth decorator; scoped only for a signed-in caller',
    'routes/quest/detail.py': 'predates the decorator; ships viewer_context computed from the same gate',
    'routes/quest/classes.py': 'class-progress: predates the decorator',
    'routes/quest/engagement.py': 'predates the decorator',
    'routes/evidence_documents.py': 'GET /documents/<task_id>: predates the decorator',
    'routes/quest_lifecycle.py': 'delete_enrollment: advisor branch first, then the guardian gate',
    'routes/learning_events/crud.py': 'quick capture: the delegated insert is a different row shape (captured_by, source_type)',
    # Not student-scoped routes at all: the student is the SUBJECT of a staff or
    # peer action, gated by relationship_between / org scope in the body.
    'routes/connections.py': 'peer comment names its student in JSON; relationship_between gates it '
                             '(the student-shaped routes in the same module take the decorator)',
    'routes/credit_dashboard/items.py': 'org reviewer filter, resolved inside the caller org scope',
    'routes/kiosk.py': 'device token flow; the student is the device owner, not the caller',
}


@pytest.fixture(scope='module')
def url_map():
    from app import app
    return app


def test_every_listed_route_is_scoped(url_map):
    missing = []
    wrong = []
    for endpoint, expected in SCOPED.items():
        view = url_map.view_functions.get(endpoint)
        assert view is not None, f'{endpoint}: no such endpoint (renamed?)'
        marker = getattr(view, STUDENT_SCOPE_ATTR, None)
        if not marker:
            missing.append(endpoint)
        elif marker != expected:
            wrong.append(f'{endpoint}: discloses {marker!r}, expected {expected!r}')
    assert not missing, f'not behind @student_scope: {missing}'
    assert not wrong, wrong


def test_hand_written_student_id_reads_are_the_reviewed_ones():
    """A new route that reads student_id by hand either takes the decorator
    or is added to FUNCTION_FORM with a reason."""
    pattern = re.compile(r"""(request\.args|data|body|payload)\.get\(\s*['"]student_id['"]""")
    offenders = []
    for path in sorted((BACKEND / 'routes').glob('**/*.py')):
        if '__pycache__' in path.parts:
            continue
        rel = str(path.relative_to(BACKEND))
        if rel in FUNCTION_FORM:
            continue
        # Parent- and staff-facing modules name the student on purpose; the
        # guard is about the STUDENT's own routes being reachable for a child.
        if rel.startswith(('routes/parent/', 'routes/sis/', 'routes/admin/', 'routes/observer/',
                           'routes/advisor', 'routes/oea', 'routes/family_quests.py',
                           'routes/helper_evidence.py', 'routes/dependents', 'routes/classes/',
                           'routes/registration', 'routes/credits.py', 'routes/portfolio.py',
                           'routes/bounties', 'routes/direct_messages.py', 'routes/organizations',
                           'routes/ai_', 'routes/feed', 'routes/school_inbox.py',
                           'routes/parental_consent', 'routes/parent_linking/', 'routes/stories',
                           'routes/treehouse', 'routes/xp_goals', 'routes/lti', 'routes/course',
                           'routes/tutor', 'routes/learning_events/', 'routes/evidence_reports',
                           'routes/onfire', 'routes/quest/')):
            continue
        text = path.read_text(encoding='utf-8')
        for i, line in enumerate(text.splitlines(), 1):
            if pattern.search(line) and not line.strip().startswith('#'):
                offenders.append(f'{rel}:{i}')
    assert not offenders, (
        'These routes read student_id by hand. Put @student_scope on the route, '
        f'or add the file to FUNCTION_FORM with a reason: {offenders}')

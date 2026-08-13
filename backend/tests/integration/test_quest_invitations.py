"""Integration tests for advisor-to-student quest invitations.

An invitation is addressed to one student. The boundary: only that student may
see it, accept it, or decline it.

Ported 2026-08-13. The originals posted to `/api/quest-invitations` and read
`/received` and `/sent`, none of which exist -- the real routes are
`/api/advisor/quest-invitations` (advisor view) and
`/api/students/quest-invitations[/<id>/accept|decline]` (student view).
See backend/tests/integration/README.md.
"""

import uuid

import pytest

pytestmark = pytest.mark.requires_db


@pytest.fixture
def org(make_org):
    return make_org(name='Invite Academy')


@pytest.fixture
def advisor(make_user, org):
    return make_user(role='org_managed', org_role='advisor', organization_id=org['id'])


@pytest.fixture
def org_student(make_user, org):
    return make_user(role='org_managed', org_role='student', organization_id=org['id'])


@pytest.fixture
def make_invitation(db, org, advisor, make_quest):
    """A pending invitation from the org's advisor to a student."""
    def _make(student_id, status='pending', **fields):
        quest = make_quest(title='Invited Quest')
        row = {
            'id': str(uuid.uuid4()),
            'advisor_id': advisor['id'],
            'student_id': student_id,
            'quest_id': quest['id'],
            'organization_id': org['id'],
            'status': status,
        }
        row.update(fields)
        db.table('quest_invitations').insert(row).execute()
        return row

    return _make


# The student's view


@pytest.mark.integration
@pytest.mark.critical
def test_a_student_sees_their_own_invitation(client, org_student, make_invitation, auth_headers_for):
    invitation = make_invitation(org_student['id'])

    response = client.get(
        '/api/students/quest-invitations',
        headers=auth_headers_for(org_student['id']),
    )

    assert response.status_code == 200
    assert invitation['id'] in response.get_data(as_text=True)


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_a_student_does_not_see_another_students_invitation(
    client, make_user, org, org_student, make_invitation, auth_headers_for
):
    invitation = make_invitation(org_student['id'])
    classmate = make_user(role='org_managed', org_role='student', organization_id=org['id'])

    response = client.get(
        '/api/students/quest-invitations',
        headers=auth_headers_for(classmate['id']),
    )

    assert response.status_code == 200
    assert invitation['id'] not in response.get_data(as_text=True)


# Accepting and declining


@pytest.mark.integration
@pytest.mark.critical
def test_a_student_can_accept_their_invitation(client, db, org_student, make_invitation, auth_headers_for):
    invitation = make_invitation(org_student['id'])

    response = client.post(
        f'/api/students/quest-invitations/{invitation["id"]}/accept',
        headers=auth_headers_for(org_student['id']),
        json={},
    )

    assert response.status_code == 200, response.get_data(as_text=True)
    row = db.table('quest_invitations').select('status').eq('id', invitation['id']).execute().data[0]
    assert row['status'] == 'accepted'


@pytest.mark.integration
def test_accepting_an_invitation_enrolls_the_student(
    client, db, org_student, make_invitation, auth_headers_for
):
    """Accepting is not just a status flip -- it is how the student joins."""
    invitation = make_invitation(org_student['id'])

    client.post(
        f'/api/students/quest-invitations/{invitation["id"]}/accept',
        headers=auth_headers_for(org_student['id']),
        json={},
    )

    enrolments = db.table('user_quests').select('user_id, quest_id') \
        .eq('user_id', org_student['id']).execute().data
    assert any(e['quest_id'] == invitation['quest_id'] for e in enrolments), \
        'accepting did not enrol the student in the quest'


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_a_student_cannot_accept_someone_elses_invitation(
    client, db, make_user, org, org_student, make_invitation, auth_headers_for
):
    """Invitation ids are guessable enough that this must be checked server
    side -- accepting another student's invitation would enrol the wrong person
    and consume the invite."""
    invitation = make_invitation(org_student['id'])
    intruder = make_user(role='org_managed', org_role='student', organization_id=org['id'])

    response = client.post(
        f'/api/students/quest-invitations/{invitation["id"]}/accept',
        headers=auth_headers_for(intruder['id']),
        json={},
    )

    assert response.status_code in (403, 404)
    row = db.table('quest_invitations').select('status').eq('id', invitation['id']).execute().data[0]
    assert row['status'] == 'pending', 'the invitation was consumed by the wrong student'


@pytest.mark.integration
def test_a_student_can_decline_their_invitation(client, db, org_student, make_invitation, auth_headers_for):
    invitation = make_invitation(org_student['id'])

    response = client.post(
        f'/api/students/quest-invitations/{invitation["id"]}/decline',
        headers=auth_headers_for(org_student['id']),
        json={},
    )

    assert response.status_code == 200
    row = db.table('quest_invitations').select('status').eq('id', invitation['id']).execute().data[0]
    assert row['status'] == 'declined'


@pytest.mark.integration
@pytest.mark.authorization
def test_a_student_cannot_decline_someone_elses_invitation(
    client, db, make_user, org, org_student, make_invitation, auth_headers_for
):
    invitation = make_invitation(org_student['id'])
    intruder = make_user(role='org_managed', org_role='student', organization_id=org['id'])

    response = client.post(
        f'/api/students/quest-invitations/{invitation["id"]}/decline',
        headers=auth_headers_for(intruder['id']),
        json={},
    )

    assert response.status_code in (403, 404)
    row = db.table('quest_invitations').select('status').eq('id', invitation['id']).execute().data[0]
    assert row['status'] == 'pending'


# The advisor's view


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_a_student_cannot_read_the_advisor_invitation_queue(client, org_student, auth_headers_for):
    response = client.get(
        '/api/advisor/quest-invitations',
        headers=auth_headers_for(org_student['id']),
    )

    assert response.status_code == 403


@pytest.mark.integration
def test_an_advisor_can_read_their_organizations_invitations(
    client, advisor, org_student, make_invitation, auth_headers_for
):
    invitation = make_invitation(org_student['id'])

    response = client.get(
        '/api/advisor/quest-invitations',
        headers=auth_headers_for(advisor['id']),
    )

    assert response.status_code == 200
    assert invitation['id'] in response.get_data(as_text=True)


# Anonymous access


@pytest.mark.integration
@pytest.mark.security
@pytest.mark.parametrize('method, path', [
    ('get', '/api/students/quest-invitations'),
    ('get', '/api/advisor/quest-invitations'),
])
def test_invitation_endpoints_reject_anonymous_callers(client, method, path):
    response = getattr(client, method)(path, json={})

    assert response.status_code == 401

"""Row-level security, exercised against the database rather than around it.

WHY THIS FILE EXISTS
--------------------
There are 304 `CREATE POLICY` statements in `supabase/migrations/` and, before
this file, no test named for one. Thirty-six backend test files assert
cross-organization denial -- every one of them at the Flask layer, against a
route decorator. That is worth having, but it tests a different thing: the
decorators run on the SERVICE-ROLE client, which bypasses RLS entirely. If
every policy in the schema were dropped tomorrow, all thirty-six would still
pass.

RLS is the layer that answers for the paths Flask is not on: the anon key in a
browser, a PostgREST call from a client, and any future surface that talks to
the Data API directly. It is also the layer that C1 and C2 were about -- a live
Stripe secret and 718 rows of minors' consent flags, both readable by anyone on
the internet, both caused by table-level access rather than by a route.

WHAT PARTNER-SCHOOL ISOLATION MEANS HERE
----------------------------------------
Two schools, Northgate and Southvale, each with a student, a parent, an advisor
and an org admin, plus a superadmin and a platform family with no school at
all. For each table the question is the same: what can Southvale's staff read
of Northgate's students?

EVERY TEST CARRIES A POSITIVE CONTROL
-------------------------------------
An empty result is the answer RLS gives when it denies you -- and also the
answer PostgREST gives when it rejects your token outright, when the table is
empty, and when the filter matched nothing. Those are four different worlds and
they are indistinguishable from one assertion. So a test that asserts someone
CANNOT read a row also asserts that someone else CAN read the same row through
the same fixture. Without that pairing, a suite where authentication silently
broke would be uniformly, meaninglessly green.

Read backend/tests/integration/README.md before editing. In short: seed through
the service-role `db` client, read through `rls_client`, and never sign in on
`db` itself.
"""

import uuid

import pytest

pytestmark = pytest.mark.requires_db


# ---------------------------------------------------------------------------
# The cast
# ---------------------------------------------------------------------------


@pytest.fixture
def northgate(make_org):
    return make_org(name='Northgate Academy')


@pytest.fixture
def southvale(make_org):
    return make_org(name='Southvale School')


@pytest.fixture
def make_cast(make_user):
    """A student, parent, advisor and org admin at one school.

    Org users carry `role='org_managed'` with the real role in `org_role` --
    see the role table in CLAUDE.md. `is_org_admin` is deliberately NOT set
    here: the `sync_is_org_admin` trigger derives it, and the policies read the
    derived value, so writing it by hand would test a value the app never
    produces.
    """
    def _make(org):
        def user(org_role):
            return make_user(
                role='org_managed',
                org_role=org_role,
                organization_id=org['id'],
            )
        return {
            'student': user('student'),
            'parent': user('parent'),
            'advisor': user('advisor'),
            'admin': user('org_admin'),
        }
    return _make


@pytest.fixture
def north(make_cast, northgate):
    return make_cast(northgate)


@pytest.fixture
def south(make_cast, southvale):
    return make_cast(southvale)


@pytest.fixture
def superadmin(make_user):
    return make_user(role='superadmin')


def ids(rows):
    """The `id` column of a PostgREST result, as a set."""
    return {row['id'] for row in rows}


# ---------------------------------------------------------------------------
# The harness itself
#
# These four run first on purpose. If the token were rejected, or the anon key
# were wrong, or RLS were off, every other test in this file would still pass
# -- silently, and in the direction that reads as "secure".
# ---------------------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.critical
def test_the_seeding_client_bypasses_rls(db, north, south):
    """`db` is service_role, so it sees both schools. This is the baseline the
    denials below are measured against: it establishes the rows exist."""
    rows = db.table('users').select('id').execute().data
    assert north['student']['id'] in ids(rows)
    assert south['student']['id'] in ids(rows)


@pytest.mark.integration
@pytest.mark.critical
def test_an_authenticated_client_is_not_the_seeding_client(db, north, south, rls_client):
    """The point of the whole file: a signed-in student's client is subject to
    policy where the service-role client is not.

    Both halves matter. Seeing exactly one row proves the token was ACCEPTED --
    a rejected token reads zero, which would make every denial below vacuous.
    Seeing fewer rows than `db` proves RLS is switched on."""
    everything = db.table('users').select('id').execute().data
    assert len(everything) >= 8, 'expected both casts to be seeded'

    mine = rls_client(north['student']).table('users').select('id').execute().data

    assert ids(mine) == {north['student']['id']}


@pytest.mark.integration
@pytest.mark.critical
def test_the_public_internet_reads_no_users(anon_client, north):
    """The anon key is shipped to every browser. `users` holds names, emails,
    dates of birth and parent links for minors."""
    rows = anon_client.table('users').select('id').execute().data
    assert rows == []


@pytest.mark.integration
def test_a_signed_out_client_cannot_edit_a_user(db, anon_client, north):
    """An UPDATE rather than an INSERT, on purpose.

    An anonymous INSERT into `public.users` also violates the foreign key to
    `auth.users`, so it would raise whether or not RLS were switched on -- a
    test that passes for the wrong reason. `users_update_consolidated` has no
    clause anon can satisfy, and PostgREST reports a policy-blocked update as
    an empty result rather than an error, so the row is re-read to see what
    actually happened."""
    anon_client.table('users').update({'first_name': 'Tampered'}) \
        .eq('id', north['student']['id']).execute()

    after = db.table('users').select('first_name') \
        .eq('id', north['student']['id']).single().execute().data
    assert after['first_name'] != 'Tampered'


# ---------------------------------------------------------------------------
# users -- the roster
# ---------------------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_an_org_admin_reads_their_own_school_and_not_the_partner_school(
    north, south, rls_client
):
    """`users_select_consolidated` scopes an org admin to
    `organization_id = get_user_org_id(auth.uid())`.

    This is the partner-school boundary in its plainest form. Northgate's
    office manager can look up Northgate's families; Southvale's roster is not
    theirs, and the two schools are on one database."""
    visible = ids(rls_client(north['admin']).table('users').select('id').execute().data)

    assert north['student']['id'] in visible, 'own school must be readable'
    assert north['parent']['id'] in visible

    assert south['student']['id'] not in visible
    assert south['parent']['id'] not in visible
    assert south['admin']['id'] not in visible


@pytest.mark.integration
@pytest.mark.authorization
def test_a_student_reads_only_themselves(north, rls_client):
    """Not even their own classmates. The roster a student sees comes from
    Flask, scoped per surface."""
    visible = ids(rls_client(north['student']).table('users').select('id').execute().data)
    assert visible == {north['student']['id']}


@pytest.mark.integration
@pytest.mark.authorization
def test_an_advisor_reads_only_themselves_through_the_users_table(north, rls_client):
    """A property worth writing down rather than discovering.

    `users_select_consolidated` has clauses for self, service_role, superadmin,
    org admin and managing parent. There is no advisor clause -- so a teacher
    reading their own class list goes through Flask on the service-role client,
    and a direct Data API read returns only their own row. Anyone adding an
    advisor path that talks to PostgREST directly will find it empty, and this
    test says why."""
    visible = ids(rls_client(north['advisor']).table('users').select('id').execute().data)
    assert visible == {north['advisor']['id']}


@pytest.mark.integration
@pytest.mark.authorization
def test_a_superadmin_reads_both_schools(north, south, superadmin, rls_client):
    """The positive control for the org-admin denial above: the same query, the
    same fixture, a role that is allowed."""
    visible = ids(rls_client(superadmin).table('users').select('id').execute().data)
    assert north['student']['id'] in visible
    assert south['student']['id'] in visible


@pytest.mark.integration
@pytest.mark.authorization
def test_a_parent_reads_the_child_they_manage(db, make_user, parent, rls_client):
    """A managed dependent is the one case where one user row is readable by
    another outside an org."""
    # Two statements, not one. `check_dependent_no_email` is
    # `is_dependent = false OR (is_dependent = true AND email IS NULL)`, and
    # make_user must insert an email because the row is FK'd to a GoTrue
    # account that needs one. So create an ordinary student, then promote them
    # to a managed dependent and drop the email in the same update -- the only
    # ordering the constraint accepts.
    dependent = make_user(role='student')
    db.table('users').update({
        'is_dependent': True,
        'managed_by_parent_id': parent['id'],
        'email': None,
    }).eq('id', dependent['id']).execute()
    other = make_user(role='student')

    visible = ids(rls_client(parent).table('users').select('id').execute().data)

    assert dependent['id'] in visible
    assert other['id'] not in visible


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_an_org_admin_cannot_edit_a_partner_school_s_student(db, north, south, rls_client):
    """Reading is half of it. `users_update_consolidated` carries the same org
    clause in USING and WITH CHECK, so a write across the boundary changes
    nothing -- and PostgREST reports that as an empty result rather than an
    error, which is exactly why the row is re-read here."""
    client = rls_client(north['admin'])

    client.table('users').update({'first_name': 'Tampered'}) \
        .eq('id', south['student']['id']).execute()

    after = db.table('users').select('first_name') \
        .eq('id', south['student']['id']).single().execute().data
    assert after['first_name'] != 'Tampered'

    # Positive control, as a READ rather than a write. No update of `users`
    # through PostgREST succeeds for anyone -- not even on your own row; see
    # the next test for the reason. So the control that this token is real and
    # accepted has to be a statement that can succeed.
    assert ids(
        client.table('users').select('id').eq('id', north['admin']['id']).execute().data
    ) == {north['admin']['id']}


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.parametrize('whose', ['their own row', "their own school's student"])
def test_nobody_can_update_a_users_row_through_the_data_api(db, north, rls_client, whose):
    """CURRENT BEHAVIOUR, AND A FINDING. Not an endorsement.

    Every UPDATE of `users` through PostgREST fails -- including a user editing
    their OWN row, which `users_update_consolidated` explicitly permits. The
    policy is not what refuses it.

    THE MECHANISM. `generate_slug_trigger` on `users` fires BEFORE INSERT OR
    UPDATE, is NOT security definer, and unconditionally runs
    `INSERT INTO public.diplomas (...) VALUES (...) ON CONFLICT (user_id) DO
    UPDATE ...`. Two things then go wrong at once:

      1. The insert is evaluated as the CALLING role against `diplomas_insert`,
         which requires `user_id = auth.uid()`. For anyone editing somebody
         else's row -- the org-admin clause's whole purpose -- that is false.

      2. `diplomas` has INSERT and UPDATE policies and **no SELECT policy at
         all**. ON CONFLICT DO UPDATE has to see the conflicting row to take
         the DO UPDATE branch, and RLS makes it invisible. Postgres will not
         disclose that a hidden row exists, so instead of resolving the
         conflict it reports the WITH CHECK failure -- which is why even the
         self-edit case, where (1) is satisfied, still comes back 42501.

    The error names `diplomas`, a table the caller never asked to write to.
    That misdirection is the expensive part: the message points at the wrong
    object and says nothing about the trigger.

    WHY THIS IS NOT AN INCIDENT. Every application write to `users` goes
    through Flask on the service-role client, which bypasses RLS entirely, so
    nothing in production has ever hit it. It is a latent contradiction between
    a policy, a trigger and a missing policy -- live the instant anything talks
    to PostgREST directly, and invisible until then. It also means the
    org-admin arm of `users_update_consolidated` has never actually been
    reachable, so nobody can be relying on it.

    ASSERTED RATHER THAN FIXED. There are three candidate fixes -- make the
    trigger SECURITY DEFINER, narrow its insert to the INSERT case, or give
    `diplomas` a SELECT policy -- and each is a behaviour change to slug
    machinery that `20260909234412` has already had to repair once under
    concurrency. Recorded in PHASE_4_HANDOFF.md.

    If you are here because you fixed it: this test should now fail. Replace it
    with the positive cases -- a user renames themselves, an org admin renames
    their own school's student, and both rows change."""
    from postgrest.exceptions import APIError

    target = north['admin']['id'] if whose == 'their own row' else north['student']['id']

    with pytest.raises(APIError) as raised:
        rls_client(north['admin']).table('users').update({'first_name': 'Renamed'}) \
            .eq('id', target).execute()

    assert raised.value.code == '42501'
    assert 'diplomas' in str(raised.value)

    unchanged = db.table('users').select('first_name') \
        .eq('id', target).single().execute().data
    assert unchanged['first_name'] != 'Renamed'


# ---------------------------------------------------------------------------
# announcements -- a school talking to its families
# ---------------------------------------------------------------------------


@pytest.fixture
def announcements(db, north, south, northgate, southvale):
    """One announcement at each school."""
    rows = [
        {
            'id': str(uuid.uuid4()),
            'organization_id': northgate['id'],
            'author_id': north['admin']['id'],
            'title': 'Northgate: snow day',
            'message': 'Campus closed tomorrow.',
        },
        {
            'id': str(uuid.uuid4()),
            'organization_id': southvale['id'],
            'author_id': south['admin']['id'],
            'title': 'Southvale: picture day',
            'message': 'Wear your uniform.',
        },
    ]
    db.table('announcements').insert(rows).execute()
    return {'north': rows[0], 'south': rows[1]}


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
@pytest.mark.parametrize('role', ['student', 'parent', 'advisor', 'admin'])
def test_a_school_member_reads_their_own_announcements_only(
    north, south, announcements, rls_client, role
):
    """Every role at a school sees that school's announcements and none of the
    partner school's. Parametrised because the policy is one EXISTS over
    `users.organization_id` -- if it broke it would break for everyone, and if
    a role were special-cased it should show here."""
    visible = ids(
        rls_client(north[role]).table('announcements').select('id').execute().data
    )
    assert announcements['north']['id'] in visible
    assert announcements['south']['id'] not in visible


@pytest.mark.integration
@pytest.mark.authorization
def test_the_public_internet_reads_no_announcements(anon_client, announcements):
    assert anon_client.table('announcements').select('id').execute().data == []


@pytest.mark.integration
@pytest.mark.authorization
def test_a_platform_user_in_no_school_reads_no_announcements(
    student, announcements, rls_client
):
    """`organization_id IS NULL` must not match a school's NULL-free rows. A
    policy written as an equality on two nullables would let every platform
    user read every school's post."""
    assert rls_client(student).table('announcements').select('id').execute().data == []


# ---------------------------------------------------------------------------
# A student's own work
# ---------------------------------------------------------------------------


@pytest.fixture
def coursework(db, make_quest, north, south):
    """One quest, one enrolment, one task and one completion per student."""
    quest = make_quest(title='Tide Pool Field Guide')
    made = {}
    for label, cast in (('north', north), ('south', south)):
        student_id = cast['student']['id']
        enrolment_id = str(uuid.uuid4())
        task_id = str(uuid.uuid4())
        completion_id = str(uuid.uuid4())

        db.table('user_quests').insert({
            'id': enrolment_id,
            'user_id': student_id,
            'quest_id': quest['id'],
        }).execute()
        db.table('user_quest_tasks').insert({
            'id': task_id,
            'user_id': student_id,
            'quest_id': quest['id'],
            'user_quest_id': enrolment_id,
            'title': f'{label} field notes',
            'pillar': 'stem_logic',
            'xp_value': 100,
        }).execute()
        db.table('quest_task_completions').insert({
            'id': completion_id,
            'user_id': student_id,
            'quest_id': quest['id'],
            'task_id': task_id,
            'evidence_text': f'{label} wrote this.',
        }).execute()

        made[label] = {
            'quest': quest,
            'enrolment': enrolment_id,
            'task': task_id,
            'completion': completion_id,
        }
    return made


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_a_student_reads_only_their_own_tasks(north, south, coursework, rls_client):
    visible = ids(
        rls_client(north['student']).table('user_quest_tasks').select('id').execute().data
    )
    assert visible == {coursework['north']['task']}


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_an_org_admin_reads_their_own_school_s_tasks_and_not_the_partner_school_s(
    north, south, coursework, rls_client
):
    """`admin_full_access_user_quest_tasks` joins through to the task owner's
    organization. Both halves are asserted, because a policy that resolved the
    org wrong could fail open OR closed and only one of those is visible from a
    single assertion."""
    visible = ids(
        rls_client(north['admin']).table('user_quest_tasks').select('id').execute().data
    )
    assert coursework['north']['task'] in visible
    assert coursework['south']['task'] not in visible


@pytest.mark.integration
@pytest.mark.authorization
def test_a_student_reads_only_their_own_enrolments(north, coursework, rls_client):
    """`user_quests` has no admin policy at all -- own rows only, for everyone.
    Worth pinning next to the task table, which does have one: the pair looks
    like an oversight until you notice which one carries the evidence."""
    visible = ids(
        rls_client(north['student']).table('user_quests').select('id').execute().data
    )
    assert visible == {coursework['north']['enrolment']}


@pytest.mark.integration
@pytest.mark.authorization
def test_an_org_admin_reads_no_enrolments_at_all(north, coursework, rls_client):
    """Including their own school's. This is current behaviour, not a claim
    that it is right -- if an admin surface is ever pointed at the Data API it
    will come back empty and this test says where to look."""
    visible = ids(
        rls_client(north['admin']).table('user_quests').select('id').execute().data
    )
    assert coursework['north']['enrolment'] not in visible


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_a_student_reads_only_their_own_completions(north, coursework, rls_client):
    """Completions carry `evidence_text` -- the student's actual work."""
    visible = ids(
        rls_client(north['student']).table('quest_task_completions').select('id').execute().data
    )
    assert visible == {coursework['north']['completion']}


@pytest.mark.integration
@pytest.mark.authorization
def test_an_advisor_reads_completions_from_every_school(north, south, coursework, rls_client):
    """CURRENT BEHAVIOUR, AND A FINDING. Not an endorsement.

    `admin_advisor_access_completions` is `FOR ALL USING (is_superadmin(uid) OR
    is_advisor_user(uid))`, and `is_advisor_user` resolves an effective role
    with no reference to an organization. So a teacher at Southvale can read --
    and, being FOR ALL, write -- the evidence a Northgate student submitted.
    Every other table in this file scopes its staff clause by org; this one
    does not.

    It is asserted rather than fixed because this phase does not change
    behaviour. If you are here because you tightened the policy, this test
    should now fail: split it into an own-school positive and a partner-school
    denial, the way the `user_quest_tasks` test above is written. Recorded in
    PHASE_4_HANDOFF.md."""
    visible = ids(
        rls_client(south['advisor']).table('quest_task_completions').select('id').execute().data
    )
    assert coursework['south']['completion'] in visible
    assert coursework['north']['completion'] in visible, (
        'behaviour changed: the advisor policy is now org-scoped. See the '
        'docstring -- this test should be rewritten as a denial.'
    )


# ---------------------------------------------------------------------------
# Learning events and XP -- what the family surfaces read
# ---------------------------------------------------------------------------


@pytest.fixture
def moments(db, north, south):
    rows = []
    for label, cast in (('north', north), ('south', south)):
        row = {
            'id': str(uuid.uuid4()),
            'user_id': cast['student']['id'],
            'title': f'{label} moment',
            'description': 'The circuit would not close.',
        }
        db.table('learning_events').insert(row).execute()
        rows.append(row)
    return {'north': rows[0], 'south': rows[1]}


@pytest.mark.integration
@pytest.mark.authorization
def test_learning_moments_are_readable_by_their_author_and_nobody_else(
    north, south, moments, rls_client
):
    """`learning_events` has four own-row policies and no staff clause of any
    kind, so a school's own admin cannot read them either. Both directions are
    asserted so the positive control is in the same test."""
    assert ids(
        rls_client(north['student']).table('learning_events').select('id').execute().data
    ) == {moments['north']['id']}

    assert ids(
        rls_client(north['admin']).table('learning_events').select('id').execute().data
    ) == set()

    assert ids(
        rls_client(south['advisor']).table('learning_events').select('id').execute().data
    ) == set()


@pytest.mark.integration
@pytest.mark.authorization
def test_the_xp_ledger_is_closed_to_the_data_api(db, north, rls_client, anon_client):
    """`user_skill_xp` has RLS enabled and ZERO policies, which is deny-all --
    the shape FU-03 found on `bug_reports`, where 356 rows read as an empty
    list with HTTP 200 and no error.

    Here it is deliberate: XP is written and read by Flask on the service-role
    client. The test exists so that the day someone points a client at this
    table, the empty result is a documented answer rather than a mystery -- and
    so that adding a policy to it is a decision someone makes on purpose."""
    db.table('user_skill_xp').insert({
        'user_id': north['student']['id'],
        'pillar': 'stem',
        'xp_amount': 250,
    }).execute()

    # Present, on the service-role client.
    assert db.table('user_skill_xp').select('id').execute().data

    # Absent for its own owner, for their school's admin, and for the internet.
    assert rls_client(north['student']).table('user_skill_xp').select('id').execute().data == []
    assert rls_client(north['admin']).table('user_skill_xp').select('id').execute().data == []
    assert anon_client.table('user_skill_xp').select('id').execute().data == []


# ---------------------------------------------------------------------------
# Family links
# ---------------------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.authorization
def test_a_family_link_is_visible_to_the_family_and_not_to_a_partner_school(
    db, north, south, rls_client
):
    """Who a child's guardian is, is family data. `parent_student_links_select`
    admits the two people named on the row and nobody else."""
    link_id = str(uuid.uuid4())
    db.table('parent_student_links').insert({
        'id': link_id,
        'parent_user_id': north['parent']['id'],
        'student_user_id': north['student']['id'],
    }).execute()

    assert link_id in ids(
        rls_client(north['parent']).table('parent_student_links').select('id').execute().data
    )
    assert link_id in ids(
        rls_client(north['student']).table('parent_student_links').select('id').execute().data
    )
    assert link_id not in ids(
        rls_client(south['admin']).table('parent_student_links').select('id').execute().data
    )
    assert link_id not in ids(
        rls_client(south['parent']).table('parent_student_links').select('id').execute().data
    )


# ---------------------------------------------------------------------------
# Quests and organizations -- the two tables that are public on purpose
# ---------------------------------------------------------------------------


@pytest.fixture
def school_quests(db, make_quest, northgate, southvale, north, south):
    """An active quest and a retired one at each school."""
    made = {}
    for label, org, cast in (('north', northgate, north), ('south', southvale, south)):
        made[label] = {
            'active': make_quest(
                title=f'{label} active',
                organization_id=org['id'],
                created_by=cast['admin']['id'],
            ),
            'retired': make_quest(
                title=f'{label} retired',
                organization_id=org['id'],
                created_by=cast['admin']['id'],
                is_active=False,
            ),
        }
    return made


@pytest.mark.integration
def test_an_active_quest_is_public_on_purpose(anon_client, school_quests):
    """"Quests are viewable by everyone" is `USING (is_active = true)`, with no
    role and no org. That is intentional -- the catalogue is browsable -- and it
    is pinned here so a later change to that policy is a visible one."""
    visible = ids(anon_client.table('quests').select('id').execute().data)
    assert school_quests['north']['active']['id'] in visible
    assert school_quests['south']['active']['id'] in visible


@pytest.mark.integration
@pytest.mark.authorization
def test_a_retired_quest_is_not_public(anon_client, school_quests):
    """A school withdrawing a quest is the only lever it has. If retirement did
    not remove it from the anonymous read, it would not be a lever."""
    visible = ids(anon_client.table('quests').select('id').execute().data)
    assert school_quests['north']['retired']['id'] not in visible
    assert school_quests['south']['retired']['id'] not in visible


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_an_org_admin_reads_their_own_retired_quests_and_not_the_partner_school_s(
    north, school_quests, rls_client
):
    """`admin_full_access_quests` scopes an org admin to their own org (or to
    platform quests, which have no org). Retired quests are the readable
    difference between the two schools, since active ones are public to
    everybody."""
    visible = ids(rls_client(north['admin']).table('quests').select('id').execute().data)
    assert school_quests['north']['retired']['id'] in visible
    assert school_quests['south']['retired']['id'] not in visible


@pytest.mark.integration
@pytest.mark.authorization
def test_an_org_admin_cannot_retire_a_partner_school_s_quest(db, north, school_quests, rls_client):
    """A write across the boundary that PostgREST reports as an empty result,
    so the row is re-read to see what actually happened."""
    target = school_quests['south']['active']['id']

    rls_client(north['admin']).table('quests').update({'is_active': False}) \
        .eq('id', target).execute()

    after = db.table('quests').select('is_active').eq('id', target).single().execute().data
    assert after['is_active'] is True

    # Positive control: their own school's quest does change.
    own = school_quests['north']['active']['id']
    rls_client(north['admin']).table('quests').update({'is_active': False}) \
        .eq('id', own).execute()
    assert db.table('quests').select('is_active').eq('id', own) \
        .single().execute().data['is_active'] is False


@pytest.mark.integration
def test_an_active_organization_is_readable_by_anyone(anon_client, northgate, southvale):
    """`organizations_select` admits `is_active = true` unconditionally. Names
    and slugs only -- credentials moved to `organization_secrets` under C1, and
    `test_secret_exposure_guard.py` keeps them there."""
    visible = ids(anon_client.table('organizations').select('id').execute().data)
    assert northgate['id'] in visible
    assert southvale['id'] in visible


@pytest.mark.integration
@pytest.mark.authorization
def test_a_deactivated_organization_is_visible_only_to_its_own_admin(
    db, make_org, make_user, superadmin, anon_client, rls_client
):
    """A school that has been switched off should stop appearing to the world,
    while its own admin can still see it -- otherwise deactivation locks the
    people who need to reverse it out of the record."""
    closed = make_org(name='Closed School', is_active=False)
    its_admin = make_user(role='org_managed', org_role='org_admin', organization_id=closed['id'])
    outsider = make_user(role='org_managed', org_role='org_admin', organization_id=make_org()['id'])

    assert closed['id'] not in ids(anon_client.table('organizations').select('id').execute().data)
    assert closed['id'] in ids(
        rls_client(its_admin).table('organizations').select('id').execute().data
    )
    assert closed['id'] in ids(
        rls_client(superadmin).table('organizations').select('id').execute().data
    )
    assert closed['id'] not in ids(
        rls_client(outsider).table('organizations').select('id').execute().data
    )


# ---------------------------------------------------------------------------
# The tables that used to carry a dead `is_admin()` clause
#
# `is_admin()` tested `role = 'admin'`, which this system does not have, so it
# was false for every caller. 20260910120000 removes it from eleven policies.
# These tests assert the access those tables actually give.
#
# They are written so that they pass on BOTH sides of that migration, which is
# how the "no behaviour change" claim becomes checkable. Note what a single run
# proves, though: `supabase start` replays supabase/migrations/, so an ordinary
# run exercises the POST-migration schema only. To see the other half, move
# 20260910120000_remove_the_dead_admin_predicate.sql out of the directory,
# `supabase db reset`, and run this file again -- it should be identically
# green. Until someone does that, the no-change claim rests on the argument in
# the migration header (a permissive `OR false` arm contributes nothing) and on
# the production policy dump it was written from, not on this file.
#
# They have a second job. The alternative to deleting the dead clause was
# repointing it at `superadmin`, which would have granted platform staff
# RLS-level read of private correspondence and consent records. That was
# declined as a grant rather than a fix. If someone makes it later, these fail
# and say so -- which is the right way for a decision like that to be noticed.
# ---------------------------------------------------------------------------


@pytest.fixture
def correspondence(db, make_user):
    """A private two-party conversation, and a third user outside it."""
    alice = make_user(role='student')
    bob = make_user(role='student')

    conversation_id = str(uuid.uuid4())
    db.table('message_conversations').insert({
        'id': conversation_id,
        'participant_1_id': alice['id'],
        'participant_2_id': bob['id'],
    }).execute()

    message_id = str(uuid.uuid4())
    db.table('direct_messages').insert({
        'id': message_id,
        'conversation_id': conversation_id,
        'sender_id': alice['id'],
        'recipient_id': bob['id'],
        'message_content': 'Private, between the two of us.',
    }).execute()

    return {'alice': alice, 'bob': bob,
            'conversation': conversation_id, 'message': message_id}


@pytest.mark.integration
@pytest.mark.authorization
def test_a_private_message_is_readable_by_its_two_parties(correspondence, rls_client):
    """The positive control for the denials below."""
    for who in ('alice', 'bob'):
        visible = ids(
            rls_client(correspondence[who]).table('direct_messages').select('id').execute().data
        )
        assert correspondence['message'] in visible, f'{who} must read their own message'


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_a_superadmin_cannot_read_two_other_people_s_private_messages(
    correspondence, superadmin, rls_client
):
    """Platform staff are not a party to this conversation.

    This is the assertion that holds the 2026-09-10 decision in place. The
    `is_admin()` arm on direct_messages_select was dead, and the choice was
    between deleting it and making it live for superadmins. Deleting it keeps
    the answer here at "no"; making it live would change it to "yes" for every
    message on the platform, silently, in a one-word migration.

    If this test fails, that is what happened. It is a defensible thing to
    want -- support and safeguarding both have a case -- but it is a policy
    decision about reading minors' private correspondence, and it should not
    arrive as a green build."""
    visible = ids(
        rls_client(superadmin).table('direct_messages').select('id').execute().data
    )
    assert correspondence['message'] not in visible

    conversations = ids(
        rls_client(superadmin).table('message_conversations').select('id').execute().data
    )
    assert correspondence['conversation'] not in conversations


@pytest.mark.integration
@pytest.mark.authorization
def test_an_unrelated_student_cannot_read_a_private_message(
    correspondence, north, rls_client
):
    visible = ids(
        rls_client(north['student']).table('direct_messages').select('id').execute().data
    )
    assert correspondence['message'] not in visible


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_a_consent_record_is_readable_by_its_subject_and_nobody_else(
    db, make_user, superadmin, north, rls_client
):
    """COPPA consent records: who was asked, at what address, and when.

    Same shape as the messages above -- own row only, and the dead `is_admin()`
    arm did not change that. C2 was 718 rows of exactly this kind of data
    reachable by `anon`; this is the same data one layer in."""
    subject = make_user(role='student')
    row_id = str(uuid.uuid4())
    db.table('parental_consent_log').insert({
        'id': row_id,
        'user_id': subject['id'],
        'child_email': 'child@example.com',
        'parent_email': 'guardian@example.com',
        'consent_token': uuid.uuid4().hex,
    }).execute()

    assert row_id in ids(
        rls_client(subject).table('parental_consent_log').select('id').execute().data
    )
    assert row_id not in ids(
        rls_client(superadmin).table('parental_consent_log').select('id').execute().data
    )
    assert row_id not in ids(
        rls_client(north['admin']).table('parental_consent_log').select('id').execute().data
    )


@pytest.mark.integration
@pytest.mark.authorization
def test_diplomas_are_closed_to_the_data_api(db, north, rls_client, anon_client):
    """`diplomas` has INSERT and UPDATE policies and NO SELECT policy, so
    nobody reads it through PostgREST -- not its owner, not staff, not anon.

    The public portfolio pages get their data from Flask on the service-role
    client (portfolio_service.get_diploma_data), which is why nobody has
    noticed. Asserted so that the day a client is pointed at this table, the
    empty result is a documented answer. Same shape as user_skill_xp above."""
    rows = db.table('diplomas').select('id').limit(5).execute().data
    if not rows:
        pytest.skip('no diploma rows seeded by the user fixtures on this stack')

    assert rls_client(north['student']).table('diplomas').select('id').execute().data == []
    assert anon_client.table('diplomas').select('id').execute().data == []


"""Identity and org attachment for the parent registration funnel.

Two questions the funnel keeps asking, kept apart on purpose:

    WHO ARE YOU?    proven by the caller — a password on /login, a live session
                    on /attach — and never by this module.
    MAY YOU JOIN?   parent_guardrails, then attach_and_resume.

The split exists because the funnel used to answer both with one password check,
which silently excluded every account that HAS no password: Google and Apple
signups, plus org-imported parents — 118 of 906 accounts on 2026-08-25, when a
parent who had signed up with Apple found "Create account" telling her the email
was taken and "Sign in" telling her the password was wrong (naming Google, at
that). Nothing on the page could let her in.

Everything below is deliberately credential-agnostic, so the doors into the
funnel cannot enforce different rules and a new credential type (passkey, magic
link, org SSO) is a new door rather than a fork of the funnel.
"""

from datetime import date, datetime
import secrets

from flask import jsonify

from utils.logger import get_logger
from utils.sis_roles import FAMILY_REGISTRATION_STAFF_ROLES

logger = get_logger(__name__)


# Same-org staff who may register their own kids, keeping their staff role.
# Canonical definition lives with the other role tuples in utils/sis_roles.py —
# this file must not spell one out by hand, which is exactly how campus
# coordinators went missing from it (see that constant's comment).
FUNNEL_STAFF_ORG_ROLES = FAMILY_REGISTRATION_STAFF_ROLES


def calc_age(dob: date) -> int:
    today = date.today()
    age = today.year - dob.year
    if (today.month, today.day) < (dob.month, dob.day):
        age -= 1
    return age


def parse_dob(v):
    """Parse an ISO YYYY-MM-DD date string, or return None."""
    if not v:
        return None
    try:
        return datetime.strptime(v.strip()[:10], '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None


def platform_student_is_registerable_adult(admin, user):
    """Whether a platform account carrying the DEFAULT role='student' is safe
    to treat as an adult registering their family (the main Optio signup gives
    everyone role='student', so adults who self-registered there look like
    students). True only when there is NO evidence it's a kid's account:
      - not a dependent / not managed by a parent,
      - not linked to any parent as the student,
      - adult by DOB; or with DOB unknown, a pristine account (no XP, no
        quests — a kid who actually uses Optio has learning activity).
    Any lookup failure keeps the guardrail (returns False)."""
    if user.get('is_dependent') or user.get('managed_by_parent_id'):
        return False
    try:
        linked = (admin.table('parent_student_links').select('id')
                  .eq('student_user_id', user['id']).limit(1).execute()).data
        if linked:
            return False
        dob = parse_dob(user.get('date_of_birth'))
        if dob is not None:
            return calc_age(dob) >= 18
        if int(user.get('total_xp') or 0) > 0:
            return False
        quests = (admin.table('user_quests').select('id')
                  .eq('user_id', user['id']).limit(1).execute()).data
        return not quests
    except Exception as e:  # noqa: BLE001
        logger.warning(f'registration identity: adult check failed for {user.get("id", "?")[:8]}: {e}')
        return False


def effective_org_role(user):
    """The org role the account presents as (first of org_roles when org_role
    itself is unset — staff carry the primary role first)."""
    return user.get('org_role') or ((user.get('org_roles') or [None])[0])


def parent_guardrails(admin, user, org):
    """Whether `user` may register a family with `org`: (json, status) to refuse,
    or None to proceed.

    Deliberately credential-agnostic. Identity is proven by the CALLER before
    this runs — a password on /login, a live session on /attach — so every door
    into the funnel enforces exactly the same rules and they cannot drift.

    Never silently move accounts between orgs or repurpose privileged/student
    accounts as parents. Same-org STAFF (org_admin/advisor) pass — school staff
    have their own kids to register — and keep their staff role primary (see
    attach_and_resume).
    """
    org_id = org['id']
    org_name = org.get('name') or 'the school'
    current_org_role = effective_org_role(user)

    if user.get('role') == 'superadmin':
        return jsonify({'error': 'This account cannot be used here.'}), 403
    if user.get('organization_id') and user['organization_id'] != org_id:
        return jsonify({'error': f'This account belongs to another school. Please contact {org_name}.'}), 409
    # Platform NON-parent accounts must not be silently repurposed as
    # parents (that used to convert e.g. a student's own account into a parent).
    # BUT: the main Optio signup defaults EVERYONE to role='student', so an
    # adult who created their own account there (e.g. while the funnel was
    # down, 2026-07-21) is a false positive — refuse only accounts that show
    # actual evidence of being a kid's: dependent/managed, linked to a parent,
    # a minor by DOB, or (DOB unknown) an account with real learning activity.
    if not user.get('organization_id') and user.get('role') == 'student':
        if not platform_student_is_registerable_adult(admin, user):
            return jsonify({'error': "This looks like a student's Optio account. Register with a parent "
                                     "email — you can connect your child's account on the family step."}), 409
    if not user.get('organization_id') and user.get('role') in ('advisor', 'observer'):
        return jsonify({'error': 'This account can\'t be used to register a family. '
                                 f'Please use a parent email or contact {org_name}.'}), 409
    if (user.get('organization_id') == org_id and current_org_role
            and current_org_role not in ('parent',) + FUNNEL_STAFF_ORG_ROLES):
        return jsonify({'error': 'This is not a parent account. Please register with a parent email.'}), 409
    return None


def attach_and_resume(admin, user, org, via='login'):
    """Attach an identity-proven account to `org` as a parent and hand back its
    funnel registration — resuming the existing one rather than starting a
    second. Returns (json, status).

    Shared by /login and /attach: everything here is independent of HOW the
    caller proved who they are, which is the point.
    """
    org_id = org['id']
    current_org_role = effective_org_role(user)

    if user.get('organization_id') == org_id and current_org_role in FUNNEL_STAFF_ORG_ROLES:
        # Staff registering their own kids: append 'parent' to org_roles but keep
        # the staff role PRIMARY (first) — get_effective_role and every staff
        # surface stay untouched, and the parent-side features (Schedule Builder,
        # sidebar link) key off household guardianship / any-role checks.
        roles = [r for r in (user.get('org_roles') or [current_org_role]) if r]
        if 'parent' not in roles:
            admin.table('users').update({'org_roles': roles + ['parent']}).eq('id', user['id']).execute()
    else:
        # Attach to the org as a parent (no-op for existing org parents).
        admin.table('users').update({
            'organization_id': org_id,
            'role': 'org_managed',
            'org_role': 'parent',
            'org_roles': ['parent'],
        }).eq('id', user['id']).execute()

    now = datetime.utcnow().isoformat()

    # Reuse the parent's existing registration rather than starting a fresh funnel
    # run. Blindly inserting a new 'family' registration here let a returning
    # parent re-run the family step with an empty prior_kids list, which created a
    # SECOND set of children (plus emergency contacts + household) instead of
    # editing the first. Mirror /my-registration's resume behavior instead.
    existing = (
        admin.table('registrations')
        .select('*')
        .eq('parent_user_id', user['id'])
        .eq('organization_id', org_id)
        .order('created_at', desc=True)
        .limit(1)
        .execute()
    ).data or []
    reg_row = existing[0] if existing else None

    # Legacy in-flight statuses (schedule/appointment were once funnel steps)
    # settle as completed, same as /my-registration.
    if reg_row and reg_row.get('status') in ('schedule', 'appointment'):
        admin.table('registrations').update({
            'status': 'completed', 'completed_at': now, 'updated_at': now,
        }).eq('id', reg_row['id']).execute()
        reg_row['status'] = 'completed'

    if reg_row and reg_row.get('status') == 'completed':
        # Already registered — send them into the app; never restart the funnel.
        logger.info(f'iCreate {via}: {user["id"][:8]} already registered for org {org_id}')
        return jsonify({
            'success': True,
            'registration_id': reg_row['id'],
            'access_token': reg_row['access_token'],
            'status': 'completed',
            'first_name': user.get('first_name'),
            'last_name': user.get('last_name'),
        }), 200

    if reg_row:
        # Resume an unfinished registration in place. Proven identity stands in
        # for the emailed code, so a row still awaiting it can advance to family.
        status = reg_row.get('status')
        updates = {'email_verified_at': reg_row.get('email_verified_at') or now, 'updated_at': now}
        if status == 'verify':
            updates.update({'otp_hash': None, 'otp_expires_at': None, 'status': 'family'})
            status = 'family'
        if not reg_row.get('access_token'):
            updates['access_token'] = secrets.token_urlsafe(32)
        admin.table('registrations').update(updates).eq('id', reg_row['id']).execute()
        reg_row = {**reg_row, **updates, 'status': status}
        logger.info(f'iCreate {via}: resumed registration {reg_row["id"][:8]} for org {org_id} at {status}')
        return jsonify({
            'success': True,
            'registration_id': reg_row['id'],
            'access_token': reg_row['access_token'],
            'status': status,
            'first_name': user.get('first_name'),
            'last_name': user.get('last_name'),
        }), 200

    # No prior registration: genuinely new funnel run for this existing account.
    reg = admin.table('registrations').insert({
        'organization_id': org_id,
        'parent_user_id': user['id'],
        'access_token': secrets.token_urlsafe(32),
        'status': 'family',
        'email_verified_at': now,  # proven identity stands in for the emailed code
    }).execute()
    reg_row = reg.data[0]

    logger.info(f'iCreate {via}: existing account {user["id"][:8]} attached to org {org_id}')
    return jsonify({
        'success': True,
        'registration_id': reg_row['id'],
        'access_token': reg_row['access_token'],
        'status': 'family',
        'first_name': user.get('first_name'),
        'last_name': user.get('last_name'),
    }), 200


# Supabase identity providers that mean "sign in with a button", not a password.
SOCIAL_PROVIDERS = {'google': 'Google', 'apple': 'Apple'}


def identity_providers(admin, user_id):
    """The set of auth providers on an account ({'google'}, {'google','email'},
    …). Empty set on any lookup failure — callers must treat that as "unknown",
    never as "no password".

    `auth.users.encrypted_password` is not exposed by the Admin API, so an
    'email' identity is the closest available proxy for "has a password". It is
    a proxy, not a fact: a handful of org-imported accounts carry an email
    identity with no password set. That is why this is only ever consulted
    AFTER a password attempt has already failed.
    """
    try:
        res = admin.auth.admin.get_user_by_id(user_id)
        u = getattr(res, 'user', None) or res
        identities = getattr(u, 'identities', None) or []
        out = set()
        for i in identities:
            p = i.get('provider') if isinstance(i, dict) else getattr(i, 'provider', None)
            if p:
                out.add(str(p).lower())
        return out
    except Exception as e:  # noqa: BLE001
        logger.warning(f'registration identity: lookup failed for {str(user_id)[:8]}: {e}')
        return set()


def password_failure(admin, user, org_name):
    """The response for a password that did not check out.

    Never just "wrong password": for an account that has no password to get
    wrong, that message is a dead end — it sent an Apple parent back to "Create
    account", which then told her the email was taken (2026-08-25). Name the
    provider she actually signed up with instead, and give everyone else the
    reset link rather than a bare refusal.

    `code` is what the frontend branches on; `provider` tells it which button to
    point at. The prose is the fallback for callers that ignore both.
    """
    providers = identity_providers(admin, user['id'])
    social = [p for p in providers if p in SOCIAL_PROVIDERS]
    if social and 'email' not in providers:
        # No password exists on this account — the buttons are the only way in.
        labels = ' or '.join(SOCIAL_PROVIDERS[p] for p in sorted(social))
        return jsonify({
            'error': f'This account signs in with {labels}. Use the {labels} button above '
                     f'to continue — it will be connected to {org_name} automatically.',
            'code': 'oauth_account',
            'providers': sorted(social),
        }), 409
    return jsonify({
        'error': 'Incorrect password. Use "Forgot password" to set a new one, or sign in '
                 'with the buttons above if you created your account that way.',
        'code': 'bad_password',
    }), 401

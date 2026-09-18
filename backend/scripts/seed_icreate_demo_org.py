"""
Seed (or tear down) the iCreate DEMO org.

A parent demo needs a family with kids on real iCreate classes, and it must
not touch a single row the live school owns -- no extra bodies on a roster, no
demo household in the office's Families page. So the demo lives in a SIBLING
organization (slug icreate-demo, named "iCreate" so families see the school's
name) cloned from iCreate by SELECT only. Nothing here writes to the source
org.

Copied from iCreate: the org row (branding, feature flags, SIS settings), the
time blocks, every active class with its meetings and student-visible
materials, the instructors those classes name (as placeholder staff accounts
that cannot log in), school events, announcements, family resources,
onboarding templates and the lost-and-found board.

Invented: the Calloway family -- one parent, three students across kinder,
elementary and teen -- enrolled in real classes, each with a block-priced
tuition invoice on the 10-payment plan (first payment recorded), three weeks
of attendance, an assigned form, a welcome note in every class parent chat,
and three neighbour families so the directory has more than one row.

Deliberate differences from the live org, each so the demo can show a flow
the calendar has closed on the real one:
  - add/drop deadline pushed out (the Schedule Builder stays open)
  - email_reply_to cleared (a reply from the demo must never reach the school)
  - the conflict acknowledgements dropped (they name the source org's class ids)

Idempotent on the demo slug: a second run finds the org and stops. Run from
backend/ with the venv and the prod .env:

    .venv/bin/python scripts/seed_icreate_demo_org.py            # prompts for the parent's password
    .venv/bin/python scripts/seed_icreate_demo_org.py --password ...
    .venv/bin/python scripts/seed_icreate_demo_org.py --teardown
"""
import argparse
import copy
import getpass
import os
import secrets
import sys
import uuid
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

# utils before database: importing database first trips the utils.auth cycle.
from services import sis_service  # noqa: E402
from utils.admin_client import admin_client  # noqa: E402
from utils.db_fetch import fetch_all_rows  # noqa: E402
from utils.timestamps import now_iso as _now  # noqa: E402

SOURCE_SLUG = 'icreate'
DEMO_SLUG = 'icreate-demo'
DEMO_NAME = 'iCreate'
STAFF_EMAIL_DOMAIN = 'icreate-demo-staff.placeholder.optioeducation.com'
FAMILY_EMAIL_DOMAIN = 'optio-internal-placeholder.local'
DEMO_ADD_DROP_DEADLINE = '2027-05-28'   # keeps the Schedule Builder open for the demo
SCHOOL_START = date(2026, 8, 24)        # iCreate's first_day_of_school
PLAN_START = date(2026, 9, 2)           # first of the 10 monthly payments
INVOICE_ISSUED = '2026-08-18T16:00:00+00:00'
ENROLLED_AT = '2026-08-12T16:00:00+00:00'

PARENT = {'email': 'tannerbowman+icreatedemo@gmail.com', 'first': 'Jordan', 'last': 'Calloway',
          'phone': '+18015550142'}
HOUSEHOLD = {'name': 'Calloway Family', 'address_line1': '1284 N Sagebrush Ln', 'city': 'Lehi',
             'state': 'Utah', 'postal_code': '84043', 'phone': '8015550142',
             'funding_source': 'private_pay', 'directory_opt_in': True,
             'directory_share_email': True, 'directory_share_phone': True,
             'directory_share_address': False, 'carpool_interest': True}

# Each class is named by (name, day_of_week, start_time) because iCreate runs
# several sections under one name ("Lego Lab" three times a week).
KIDS = [
    {'first': 'Maya', 'last': 'Calloway', 'dob': date(2013, 4, 11), 'gender': 'female',
     'classes': [('Fashion 101', 2, '10:30'),
                 ('Teen Maker Open Lab (Tues Block 4)', 2, '13:00'),
                 ('Illustration: Character Design', 4, '10:30'),
                 ('Musical Theater', 4, '13:00')]},
    {'first': 'Eli', 'last': 'Calloway', 'dob': date(2017, 8, 22), 'gender': 'male',
     'classes': [('Sword of Truth (Tuesday)', 2, '09:30'),
                 ('Lego Lab', 2, '11:30'),
                 ('Journey Across the USA', 2, '13:00'),
                 ('Brain Games 8-11 (Thu Block 2)', 4, '10:30'),
                 ('Maker: Remade', 4, '13:00'),
                 ('Peak Play PE', 4, '14:00')]},
    {'first': 'Nora', 'last': 'Calloway', 'dob': date(2020, 10, 3), 'gender': 'female',
     'classes': [('Kinder Nature School (Tues)', 2, '09:30'),
                 ('Peak Play Jr PE (Tuesday)', 2, '13:00'),
                 ('Creative Explorers: Nature & Art (Thurs, Block 2)', 4, '10:30'),
                 ('Story Detectives (Thursday)', 4, '14:00')]},
]

# (kid first name, date, class name or None for every class that day) -> status, note
ATTENDANCE_EXCEPTIONS = {
    ('Eli', date(2026, 9, 10), None): ('absent', None),
    ('Maya', date(2026, 9, 1), 'Fashion 101'): ('excused', 'Dentist appointment'),
    ('Nora', date(2026, 9, 15), 'Kinder Nature School (Tues)'): ('late', None),
}

NEIGHBOURS = [
    {'household': {'name': 'Reyes Family', 'address_line1': '552 E 1200 N', 'city': 'American Fork',
                   'state': 'Utah', 'postal_code': '84003', 'phone': '8015550177',
                   'funding_source': 'ufa', 'directory_opt_in': True,
                   'directory_share_email': False, 'directory_share_phone': True},
     'parent': {'first': 'Daniela', 'last': 'Reyes'},
     'kids': [{'first': 'Mateo', 'last': 'Reyes', 'dob': date(2017, 3, 14), 'gender': 'male',
               'classes': [('Lego Lab', 2, '11:30'), ('Brain Games 8-11 (Thu Block 2)', 4, '10:30')]}]},
    {'household': {'name': 'Lindqvist Family', 'address_line1': '3910 W Cedar Hills Dr', 'city': 'Cedar Hills',
                   'state': 'Utah', 'postal_code': '84062', 'phone': '8015550163',
                   'funding_source': 'private_pay', 'directory_opt_in': True,
                   'directory_share_email': False, 'directory_share_phone': True},
     'parent': {'first': 'Erik', 'last': 'Lindqvist'},
     'kids': [{'first': 'Freya', 'last': 'Lindqvist', 'dob': date(2013, 11, 30), 'gender': 'female',
               'classes': [('Fashion 101', 2, '10:30'), ('Illustration: Character Design', 4, '10:30')]},
              {'first': 'Anders', 'last': 'Lindqvist', 'dob': date(2020, 4, 18), 'gender': 'male',
               'classes': [('Kinder Nature School (Tues)', 2, '09:30')]}]},
    {'household': {'name': 'Okafor Family', 'address_line1': '2216 N 900 W', 'city': 'Lehi',
                   'state': 'Utah', 'postal_code': '84043', 'phone': '8015550129',
                   'funding_source': 'ufa', 'directory_opt_in': True,
                   'directory_share_email': False, 'directory_share_phone': True,
                   'carpool_interest': True},
     'parent': {'first': 'Chidi', 'last': 'Okafor'},
     'kids': [{'first': 'Amara', 'last': 'Okafor', 'dob': date(2017, 6, 9), 'gender': 'female',
               'classes': [('Sword of Truth (Tuesday)', 2, '09:30'), ('Peak Play PE', 4, '14:00')]}]},
]

# admin client justified: a one-off seed run by hand against the prod project;
# it creates a whole sibling org, which no RLS-scoped caller could.
admin = admin_client()


def _org_by_slug(slug):
    rows = admin.table('organizations').select('*').eq('slug', slug).limit(1).execute().data
    return rows[0] if rows else None


def _all(table, org_id, **filters):
    def build():
        q = admin.table(table).select('*').eq('organization_id', org_id)
        for k, v in filters.items():
            q = q.eq(k, v)
        return q
    return fetch_all_rows(build)


def _strip(row, drop=('id', 'organization_id', 'created_by')):
    return {k: v for k, v in row.items() if k not in drop}


def _create_auth(email, password=None, confirm=False, metadata=None, app_metadata=None):
    payload = {'email': email, 'email_confirm': confirm, 'user_metadata': metadata or {}}
    if password:
        payload['password'] = password
    if app_metadata:
        payload['app_metadata'] = app_metadata
    resp = admin.auth.admin.create_user(payload)
    if not resp.user:
        raise RuntimeError(f'auth create failed for {email}')
    return resp.user.id


def _upsert_user(profile):
    from services.registration_accounts_service import _insert_user_with_retry
    _insert_user_with_retry(admin, profile)
    return profile['id']


# ── Org clone ────────────────────────────────────────────────────────────────

def clone_org(src):
    flags = copy.deepcopy(src.get('feature_flags') or {})
    sis = flags.setdefault('sis_settings', {})
    sis.pop('acknowledged_conflicts', None)
    sis['add_drop_deadline'] = DEMO_ADD_DROP_DEADLINE
    flags['email_reply_to'] = None
    flags['demo_source_org_id'] = src['id']
    row = {
        'name': DEMO_NAME, 'slug': DEMO_SLUG, 'is_active': True,
        'quest_visibility_policy': src.get('quest_visibility_policy'),
        'course_visibility_policy': src.get('course_visibility_policy'),
        'branding_config': src.get('branding_config'),
        'feature_flags': flags,
        'timezone': src.get('timezone'),
        'accreditation_source': src.get('accreditation_source') or 'none',
        'ai_features_enabled': src.get('ai_features_enabled'),
        'ai_chatbot_enabled': src.get('ai_chatbot_enabled'),
        'ai_lesson_helper_enabled': src.get('ai_lesson_helper_enabled'),
        'ai_task_generation_enabled': src.get('ai_task_generation_enabled'),
    }
    org = admin.table('organizations').insert(row).execute().data[0]
    print(f'org: {org["id"]} ({DEMO_NAME} / {DEMO_SLUG})')
    return org


def clone_time_blocks(src_id, org_id):
    mapping = {}
    for b in _all('sis_time_blocks', src_id):
        new = admin.table('sis_time_blocks').insert({**_strip(b), 'organization_id': org_id}).execute().data[0]
        mapping[b['id']] = new['id']
    print(f'time blocks: {len(mapping)}')
    return mapping


def create_admin_user(org_id):
    uid = _create_auth(f'office@{STAFF_EMAIL_DOMAIN}', password=secrets.token_urlsafe(24),
                       metadata={'first_name': 'iCreate', 'last_name': 'Office'})
    _upsert_user({
        'id': uid, 'email': f'office@{STAFF_EMAIL_DOMAIN}',
        'first_name': 'iCreate', 'last_name': 'Office', 'display_name': 'iCreate Office',
        'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': ['org_admin'],
        'organization_id': org_id,
    })
    print(f'office account: {uid}')
    return uid


def clone_instructors(classes, org_id):
    """Placeholder staff accounts mirroring the teachers the active classes
    name. Same names and photos as the school's catalog shows families; a
    synthetic *.placeholder.optioeducation.com address, which the platform
    already treats as 'not a real inbox' (login info, messaging recipients,
    onboarding)."""
    ids = {c.get('primary_instructor_id') for c in classes if c.get('primary_instructor_id')}
    for c in classes:
        ids.update(c.get('assistant_instructor_ids') or [])
    ids = sorted(ids)
    mapping = {}
    if not ids:
        return mapping
    rows = (admin.table('users')
            .select('id, first_name, last_name, display_name, preferred_name, avatar_url, bio')
            .in_('id', ids).execute()).data or []
    used = set()
    for u in rows:
        first = (u.get('first_name') or '').strip() or 'Teacher'
        last = (u.get('last_name') or '').strip()
        local = f'{first}.{last}'.lower().replace(' ', '-').strip('.') or 'teacher'
        base, n = local, 1
        while local in used:
            n += 1
            local = f'{base}{n}'
        used.add(local)
        email = f'{local}@{STAFF_EMAIL_DOMAIN}'
        uid = _create_auth(email, password=secrets.token_urlsafe(24),
                           metadata={'first_name': first, 'last_name': last})
        _upsert_user({
            'id': uid, 'email': email,
            'first_name': first, 'last_name': last,
            'display_name': u.get('display_name') or f'{first} {last}'.strip(),
            'preferred_name': u.get('preferred_name'),
            'avatar_url': u.get('avatar_url'), 'bio': u.get('bio'),
            'role': 'org_managed', 'organization_id': org_id,
        })
        # The teacher role is one write, shared with the console's add form
        # and the placeholder merge (sisConcepts advisor_role_grant).
        sis_service.grant_advisor_role(org_id, {'id': uid, 'organization_id': org_id, 'role': 'org_managed'})
        mapping[u['id']] = uid
    print(f'instructors: {len(mapping)}')
    return mapping


def clone_classes(src_id, org_id, admin_id, blocks, teachers):
    classes = _all('org_classes', src_id, status='active')
    mapping = {}
    rows = []
    for c in classes:
        new_id = str(uuid.uuid4())
        mapping[c['id']] = new_id
        row = {**_strip(c), 'id': new_id, 'organization_id': org_id, 'created_by': admin_id,
               'primary_instructor_id': teachers.get(c.get('primary_instructor_id')),
               'assistant_instructor_ids': [teachers[a] for a in (c.get('assistant_instructor_ids') or [])
                                            if a in teachers]}
        rows.append(row)
    for i in range(0, len(rows), 50):
        admin.table('org_classes').insert(rows[i:i + 50]).execute()
    print(f'classes: {len(rows)}')

    meetings = [m for m in _all('class_meetings', src_id) if m['class_id'] in mapping]
    mrows = [{**_strip(m), 'organization_id': org_id, 'class_id': mapping[m['class_id']],
              'block_id': blocks.get(m.get('block_id'))} for m in meetings]
    for i in range(0, len(mrows), 100):
        admin.table('class_meetings').insert(mrows[i:i + 100]).execute()
    print(f'meetings: {len(mrows)}')

    materials = [m for m in _all('class_materials', src_id, visible_to_students=True)
                 if m['class_id'] in mapping]
    if materials:
        admin.table('class_materials').insert([
            {**_strip(m), 'organization_id': org_id, 'class_id': mapping[m['class_id']],
             'created_by': admin_id} for m in materials]).execute()
    print(f'materials: {len(materials)}')
    return mapping


def clone_school_content(src_id, org_id, admin_id):
    counts = {}
    for table in ('sis_events', 'sis_announcements', 'org_resources', 'sis_onboarding_templates',
                  'sis_lost_found'):
        rows = _all(table, src_id)
        out = []
        for r in rows:
            row = {**_strip(r), 'organization_id': org_id, 'created_by': admin_id}
            if table == 'org_resources':
                row['visible_to_user_ids'] = None
            if table == 'sis_lost_found':
                row['claimed_by'] = None
            out.append(row)
        for i in range(0, len(out), 50):
            admin.table(table).insert(out[i:i + 50]).execute()
        counts[table] = len(out)
    print('school content: ' + ', '.join(f'{k}={v}' for k, v in counts.items()))


# ── Families ─────────────────────────────────────────────────────────────────

def create_parent(org_id, email, first, last, *, password=None, phone=None, confirm=False):
    uid = _create_auth(email, password=password or secrets.token_urlsafe(24), confirm=confirm,
                       metadata={'first_name': first, 'last_name': last})
    profile = {
        'id': uid, 'email': email, 'first_name': first, 'last_name': last,
        'display_name': f'{first} {last}', 'role': 'org_managed', 'org_role': 'parent',
        'org_roles': ['parent'], 'organization_id': org_id,
        'tos_accepted_at': _now(), 'privacy_policy_accepted_at': _now(),
    }
    if phone:
        # The adult phone-verification hold is on for this school; a verified
        # number is what a real parent who finished the funnel carries.
        profile.update({'phone_number': phone, 'phone_verified_at': _now()})
    return _upsert_user(profile)


def create_kid(org_id, parent_id, kid):
    from services.registration_accounts_service import _create_dependent
    uid = _create_dependent(admin, parent_id, org_id, kid['first'], kid['last'], kid['dob'])
    admin.table('users').update({'gender': kid.get('gender')}).eq('id', uid).execute()
    return uid


def build_family(org_id, parent_id, kid_specs, household_fields, source):
    from services import sis_attach_service
    kid_ids = {k['first']: create_kid(org_id, parent_id, k) for k in kid_specs}
    res = sis_attach_service.attach_family(org_id, parent_id, list(kid_ids.values()),
                                           household_fields=household_fields, source=source)
    if res.get('refused'):
        raise RuntimeError(f'attach refused: {res["refused"]}')
    return res['household_id'], kid_ids


def class_index(org_id):
    classes = _all('org_classes', org_id, status='active')
    meetings = _all('class_meetings', org_id)
    by_class = {}
    for m in meetings:
        by_class.setdefault(m['class_id'], []).append(m)
    idx = {}
    for c in classes:
        for m in by_class.get(c['id'], []):
            key = (c['name'], m.get('day_of_week'), str(m['start_time'])[:5])
            idx[key] = (c, by_class[c['id']])
    return idx


def enroll(org_id, idx, student_id, actor_id, picks):
    """Direct enrollment plus the group-chat sync every real enrollment path
    runs. Returns [(class_row, meetings, family_group_id)]."""
    from services.class_group_sync_service import sync_class_groups
    out = []
    for pick in picks:
        if pick not in idx:
            raise RuntimeError(f'no active class matches {pick}')
        cls, meetings = idx[pick]
        admin.table('class_enrollments').upsert({
            'class_id': cls['id'], 'student_id': student_id, 'status': 'active',
            'enrolled_by': actor_id, 'enrolled_at': ENROLLED_AT,
        }, on_conflict='class_id,student_id').execute()
        groups = sync_class_groups(cls['id'], actor_id=actor_id)
        out.append((cls, meetings, groups.get('family')))
    return out


def invoice_student(org_id, household_id, student_id, admin_id):
    from services import sis_billing_service as billing
    from services import sis_tuition_service as tuition
    preview = tuition.tuition_preview(org_id, student_id)
    if preview.get('error'):
        raise RuntimeError(preview['error'])
    res = billing.create_tuition_invoice(org_id, student_user_id=student_id, household_id=household_id,
                                         line_items=preview['line_items'], status='sent',
                                         actor_user_id=admin_id)
    if res.get('error'):
        raise RuntimeError(res['error'])
    inv = res['invoice']
    admin.table('sis_invoices').update({'issued_at': INVOICE_ISSUED, 'created_at': INVOICE_ISSUED,
                                        'due_date': str(PLAN_START)}).eq('id', inv['id']).execute()
    plan = billing.create_payment_plan(org_id, inv['id'], 'monthly', 10, PLAN_START)['plan']
    first = (admin.table('sis_installments').select('id, amount_cents')
             .eq('payment_plan_id', plan['id']).order('due_date').limit(1).execute()).data[0]
    pay = billing.record_payment(org_id, inv['id'], first['amount_cents'], 'card', None,
                                 first['id'], admin_id, note='Paid online')
    paid_at = f'{PLAN_START}T15:12:00+00:00'
    admin.table('sis_payment_records').update({'recorded_at': paid_at}).eq('id', pay['payment']['id']).execute()
    admin.table('sis_installments').update({'paid_at': paid_at}).eq('id', first['id']).execute()
    return inv, preview['quote']


def record_attendance(org_id, kid_first, student_id, enrolled, admin_id):
    """Every meeting from the first day of school to yesterday, present unless
    ATTENDANCE_EXCEPTIONS says otherwise. Recorded by the class's teacher."""
    today = date.today()
    rows = []
    for cls, meetings, _ in enrolled:
        recorder = cls.get('primary_instructor_id') or admin_id
        for m in meetings:
            dow = m.get('day_of_week')
            if not dow:
                continue
            d = SCHOOL_START
            while d < today:
                if d.isoweekday() == dow:
                    status, note = ATTENDANCE_EXCEPTIONS.get(
                        (kid_first, d, cls['name']),
                        ATTENDANCE_EXCEPTIONS.get((kid_first, d, None), ('present', None)))
                    rows.append({'organization_id': org_id, 'class_id': cls['id'], 'meeting_id': m['id'],
                                 'student_user_id': student_id, 'date': str(d), 'status': status,
                                 'note': note, 'recorded_by': recorder,
                                 'created_at': f'{d}T21:30:00+00:00', 'updated_at': f'{d}T21:30:00+00:00'})
                d += timedelta(days=1)
    for i in range(0, len(rows), 100):
        admin.table('sis_attendance').insert(rows[i:i + 100]).execute()
    return len(rows)


def welcome_messages(enrolled, teacher_first_names):
    """One note from the teacher in each class parent chat, so Messages has
    something to open."""
    from services.group_message_service import GroupMessageService
    svc = GroupMessageService()
    sent = 0
    for cls, _meetings, group_id in enrolled:
        teacher = cls.get('primary_instructor_id')
        if not group_id or not teacher:
            continue
        name = teacher_first_names.get(teacher, 'your teacher')
        supply = ''
        if cls.get('supply_fee'):
            supply = ' The supply fee on your invoice covers everything we use in class, so nothing to bring.'
        body = (f"Welcome to {cls['name']}, families! I'm {name}. We meet in the {cls.get('location') or 'classroom'}"
                f" and I'll post reminders here before anything out of the ordinary.{supply}"
                " Reply here any time with questions.")
        try:
            svc.send_message(teacher, group_id, body)
            sent += 1
        except Exception as e:  # noqa: BLE001
            print(f'  (welcome note skipped for {cls["name"]}: {e})')
    return sent


def seed(password):
    src = _org_by_slug(SOURCE_SLUG)
    if not src:
        sys.exit(f'source org {SOURCE_SLUG} not found')
    if _org_by_slug(DEMO_SLUG):
        sys.exit(f'{DEMO_SLUG} already exists -- run with --teardown first')

    org = clone_org(src)
    org_id = org['id']
    admin_id = create_admin_user(org_id)
    blocks = clone_time_blocks(src['id'], org_id)
    src_classes = _all('org_classes', src['id'], status='active')
    teachers = clone_instructors(src_classes, org_id)
    clone_classes(src['id'], org_id, admin_id, blocks, teachers)
    clone_school_content(src['id'], org_id, admin_id)

    teacher_rows = (admin.table('users').select('id, first_name')
                    .in_('id', list(teachers.values())).execute()).data or []
    teacher_first = {t['id']: t.get('first_name') for t in teacher_rows}
    idx = class_index(org_id)

    # ── The Calloway family ───────────────────────────────────────────────
    parent_id = create_parent(org_id, PARENT['email'], PARENT['first'], PARENT['last'],
                              password=password, phone=PARENT['phone'], confirm=True)
    household_id, kid_ids = build_family(org_id, parent_id, KIDS, HOUSEHOLD, 'seed_icreate_demo')
    print(f'family: parent {parent_id}, household {household_id}, kids {list(kid_ids)}')

    invoices = []
    for kid in KIDS:
        sid = kid_ids[kid['first']]
        enrolled = enroll(org_id, idx, sid, parent_id, kid['classes'])
        n_att = record_attendance(org_id, kid['first'], sid, enrolled, admin_id)
        n_msg = welcome_messages(enrolled, teacher_first)
        inv, quote = invoice_student(org_id, household_id, sid, admin_id)
        invoices.append((kid['first'], inv, quote))
        print(f'  {kid["first"]}: {len(enrolled)} classes, {n_att} attendance rows, {n_msg} welcome notes, '
              f'invoice {inv.get("invoice_number")} ${inv["total_cents"] / 100:,.2f} ({quote.get("note")})')

    from services import sis_onboarding_service as onboarding
    tpls = [t for t in _all('sis_onboarding_templates', org_id) if t.get('audience') == 'family']
    for t in tpls:
        onboarding.assign(org_id, t['id'], parent_id, admin_id)
    print(f'  forms assigned: {len(tpls)}')

    # ── Neighbours, so the directory and the rosters are not a family of one ─
    for n in NEIGHBOURS:
        p = n['parent']
        local = f"{p['first']}.{p['last']}".lower()
        pid = create_parent(org_id, f'{local}@{FAMILY_EMAIL_DOMAIN}', p['first'], p['last'])
        hh, kids = build_family(org_id, pid, n['kids'], n['household'], 'seed_icreate_demo_neighbour')
        for kid in n['kids']:
            enroll(org_id, idx, kids[kid['first']], pid, kid['classes'])
        print(f'neighbour: {n["household"]["name"]} ({len(kids)} kids)')

    # A carpool post and a shout-out so the community board reads as lived-in.
    okafor = (admin.table('users').select('id').eq('organization_id', org_id)
              .eq('last_name', 'Okafor').eq('org_role', 'parent').limit(1).execute()).data[0]['id']
    admin.table('sis_carpool_posts').insert({
        'organization_id': org_id, 'created_by': okafor, 'author_name': 'Chidi Okafor',
        'type': 'offer', 'message': 'Driving from north Lehi on Tuesdays and Thursdays, room for two more.',
        'area': 'North Lehi', 'days': 'Tue, Thu', 'contact': '(801) 555-0129', 'status': 'active',
    }).execute()
    admin.table('sis_recognition').insert({
        'organization_id': org_id, 'type': 'student_spotlight', 'recipient_name': 'Eli Calloway',
        'recipient_user_id': kid_ids['Eli'], 'created_by': admin_id,
        'message': 'Eli stayed after Maker: Remade to help reset the whole room without being asked.',
    }).execute()

    print('\n=== DONE ===')
    print(f'Demo org:   {DEMO_NAME} ({DEMO_SLUG}) {org_id}')
    print(f'Parent:     {PARENT["email"]}')
    print(f'Password:   {password}')
    print('Students:   ' + ', '.join(f'{k["first"]} ({len(k["classes"])} classes)' for k in KIDS))
    print('Invoices:   ' + ', '.join(f'{k} {inv.get("invoice_number")}' for k, inv, _ in invoices))


# ── Teardown ─────────────────────────────────────────────────────────────────

def teardown():
    org = _org_by_slug(DEMO_SLUG)
    if not org:
        print(f'{DEMO_SLUG} does not exist; nothing to do')
        return
    if org.get('slug') == SOURCE_SLUG:  # belt and braces
        sys.exit('refusing to tear down the source org')
    org_id = org['id']
    # Members first: users.organization_id does not cascade, so the org row
    # cannot go while they exist. Deleting the auth user cascades to
    # public.users and from there to enrollments, memberships, attendance,
    # messages and payments.
    users = fetch_all_rows(lambda: admin.table('users').select('id, email').eq('organization_id', org_id))
    for u in users:
        try:
            admin.auth.admin.delete_user(u['id'])
        except Exception as e:  # noqa: BLE001
            print(f'  auth delete failed for {u["id"]}: {e}')
    # The school inbox account lives outside the org (organization_id NULL).
    if org.get('inbox_user_id'):
        try:
            admin.auth.admin.delete_user(org['inbox_user_id'])
        except Exception as e:  # noqa: BLE001
            print(f'  inbox delete failed: {e}')
    print(f'users removed: {len(users)}')
    # Everything else hangs off the org row with ON DELETE CASCADE.
    admin.table('organizations').delete().eq('id', org_id).execute()
    print(f'org removed: {org_id}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--teardown', action='store_true', help='remove the demo org and everyone in it')
    ap.add_argument('--password', help="the demo parent's login password; prompted for when omitted")
    args = ap.parse_args()
    if args.teardown:
        teardown()
        return
    password = args.password or getpass.getpass("Demo parent's password: ")
    if not password:
        sys.exit('A password for the demo parent is required to seed.')
    seed(password)


if __name__ == '__main__':
    main()

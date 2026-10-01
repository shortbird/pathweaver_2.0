"""A partner's credit class: each buyer gets their own copy, once, if 13+.

Raleigh Williams (2026-09-30) sells a critical-thinking course that Optio runs
as a half-credit Language Arts class. What these pin:

  - each student gets their OWN class quest. A class's review status lives on
    the quests row, so a shared class would share one review result.
  - a second claim (a double click, the link and the partner form at once)
    returns the first copy instead of making another.
  - students only, and only 13 and older (CLASS_MIN_AGE). A missing birthday
    is asked for, then saved; an under-age one gets no class and, from the
    partner form, no account either.
  - each task's Definition of Done moves from the end of its description into
    success_criteria, which is what the credit review reads.
  - billing counts a student for a month if their copy was open in it: not
    after the partner removed them, not once the class was awarded credit.
"""

import itertools
from datetime import date, datetime, timezone
from unittest.mock import patch

import pytest

from services import partner_offering_service as svc

ORG = 'bd07ae98-e75e-4783-ba7a-ae70a6b75c35'
TEMPLATE = 'b6a3e8f9-8c22-4951-9bee-7f18ebbec9f4'
OFFERING = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
STUDENT = '11111111-1111-4111-8111-111111111111'
PARENT = '22222222-2222-4222-8222-222222222222'
PARTNER = '33333333-3333-4333-8333-333333333333'

_ids = itertools.count(1)


class _Query:
    def __init__(self, db, name):
        self.db, self.name = db, name
        self.filters, self.op, self.payload, self.cap = [], 'select', None, None

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self.filters.append(lambda r, c=col, v=val: r.get(c) == v)
        return self

    def in_(self, col, vals):
        vals = list(vals)
        self.filters.append(lambda r, c=col, v=vals: r.get(c) in v)
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, *_a, **_k):
        return self

    def limit(self, n):
        self.cap = n
        return self

    def insert(self, payload):
        self.op, self.payload = 'insert', payload
        return self

    def update(self, payload):
        self.op, self.payload = 'update', payload
        return self

    def delete(self):
        self.op = 'delete'
        return self

    def _match(self):
        return [r for r in self.db.tables.setdefault(self.name, []) if all(f(r) for f in self.filters)]

    def execute(self):
        rows = self.db.tables.setdefault(self.name, [])
        if self.op == 'insert':
            new = self.payload if isinstance(self.payload, list) else [self.payload]
            out = []
            for row in new:
                if self.name == 'partner_offering_enrollments' and any(
                        r['offering_id'] == row['offering_id'] and r['user_id'] == row['user_id'] for r in rows):
                    raise Exception('duplicate key value violates unique constraint')
                row = {'id': f'{self.name}-{next(_ids)}', 'created_at': '2026-09-30T12:00:00+00:00',
                       'ended_at': None, 'class_quest_id': None, **row}
                rows.append(row)
                out.append(row)
            return type('R', (), {'data': out})()
        matched = self._match()
        if self.op == 'update':
            for r in matched:
                r.update(self.payload)
        elif self.op == 'delete':
            for r in matched:
                rows.remove(r)
                if self.name == 'quests':
                    self.db.tables['user_quests'] = [u for u in self.db.tables.get('user_quests', [])
                                                     if u['quest_id'] != r['id']]
        return type('R', (), {'data': matched[:self.cap] if self.cap else matched})()


class FakeDB:
    def __init__(self, **tables):
        self.tables = {k: [dict(r) for r in v] for k, v in tables.items()}

    def table(self, name):
        return _Query(self, name)


TEMPLATE_TASKS = [
    {'id': 't1', 'title': 'Name the trick', 'pillar': 'communication', 'xp_value': 30, 'order_index': 0,
     'diploma_subjects': ['language_arts'], 'subject_xp_distribution': {'language_arts': 30},
     'description': 'Catch three fallacies.\n\nDefinition of done:\n- Three defined\n- Three examples'},
    {'id': 't2', 'title': 'Capstone', 'pillar': 'communication', 'xp_value': 75, 'order_index': 1,
     'diploma_subjects': ['language_arts'], 'subject_xp_distribution': {'language_arts': 75},
     'description': 'Write the essay.'},
]


def _db(student_dob='2010-01-01', role='student', org_role=None):
    return FakeDB(
        partner_offerings=[{'id': OFFERING, 'organization_id': ORG, 'template_quest_id': TEMPLATE,
                            'slug': 'latticework', 'monthly_fee_cents': 5000, 'is_active': True,
                            'created_at': '2026-09-30T00:00:00+00:00'}],
        quests=[{'id': TEMPLATE, 'title': 'Critical Thinking: The Latticework', 'description': 'Build it.',
                 'big_idea': 'Build it.', 'quest_type': 'class', 'transcript_subject': 'language_arts',
                 'header_image_url': 'img', 'image_url': 'img', 'metadata': {}, 'organization_id': ORG,
                 'is_active': True}],
        users=[{'id': STUDENT, 'email': 'kid@example.com', 'first_name': 'Kid', 'last_name': 'Reader',
                'display_name': 'Kid Reader', 'role': role, 'org_role': org_role, 'organization_id': None,
                'date_of_birth': student_dob},
               {'id': PARENT, 'email': 'mom@example.com', 'first_name': 'Mom', 'last_name': 'Reader',
                'display_name': 'Mom Reader', 'role': 'parent', 'org_role': None, 'organization_id': None,
                'date_of_birth': None}],
        organizations=[{'id': ORG, 'name': 'Raleigh Williams'}],
    )


@pytest.fixture
def copies():
    """Patch the task loading and copying; record what was copied."""
    calls = []

    def fake_copy(admin, quest_id, user_id, user_quest_id, template_tasks=None):
        calls.append({'quest_id': quest_id, 'user_id': user_id, 'tasks': template_tasks})
        return len(template_tasks)

    with patch('utils.template_tasks.load_template_tasks', lambda qid: [dict(t) for t in TEMPLATE_TASKS]), \
            patch('utils.template_tasks.copy_template_tasks_to_enrollment', fake_copy):
        yield calls


def _offering(db):
    return db.tables['partner_offerings'][0]


# ── pure rules ────────────────────────────────────────────────────────────────

@pytest.mark.unit
def test_the_checklist_moves_out_of_the_description():
    body, items = svc.split_definition_of_done('Do it.\n\nDefinition of done:\n- One\n* Two\n\n• Three')
    assert body == 'Do it.'
    assert items == ['One', 'Two', 'Three']


@pytest.mark.unit
def test_a_description_without_a_checklist_is_untouched():
    assert svc.split_definition_of_done('Write the essay.') == ('Write the essay.', [])


@pytest.mark.unit
def test_age_rules():
    with pytest.raises(svc.OfferingError) as missing:
        svc.check_age(None)
    assert missing.value.code == 'dob_required'
    with pytest.raises(svc.OfferingError) as young:
        svc.check_age(date(2014, 6, 2), today=date(2027, 6, 1))   # 12, a day short of 13
    assert young.value.code == 'under_age'
    assert svc.check_age(date(2014, 6, 1), today=date(2027, 6, 1)) == date(2014, 6, 1)


@pytest.mark.unit
def test_december_rolls_into_january():
    start, end = svc.month_bounds('2026-12')
    assert (start.month, end.year, end.month) == (12, 2027, 1)


@pytest.mark.unit
def test_billable_months():
    oct_start, oct_end = svc.month_bounds('2026-10')
    joined_sept = {'created_at': '2026-09-15T00:00:00+00:00', 'ended_at': None}
    assert svc.is_billable(joined_sept, None, oct_start, oct_end)
    # Joined after the month: not yet.
    assert not svc.is_billable({'created_at': '2026-11-02T00:00:00+00:00'}, None, oct_start, oct_end)
    # Removed in October: October still counts, November does not.
    removed = {'created_at': '2026-09-15T00:00:00+00:00', 'ended_at': '2026-10-20T00:00:00+00:00'}
    assert svc.is_billable(removed, None, oct_start, oct_end)
    assert not svc.is_billable(removed, None, *svc.month_bounds('2026-11'))
    # Awarded credit: no longer billed.
    assert not svc.is_billable(joined_sept, {'class_review_status': 'credit_awarded'}, oct_start, oct_end)


# ── provisioning ──────────────────────────────────────────────────────────────

@pytest.mark.unit
def test_a_student_gets_their_own_class_with_the_checklists(copies):
    db = _db()
    result = svc.provision(db, _offering(db), STUDENT, source='link')

    assert result['created'] is True
    quest = next(q for q in db.tables['quests'] if q['id'] == result['quest_id'])
    assert quest['id'] != TEMPLATE
    assert quest['quest_type'] == 'class' and quest['transcript_subject'] == 'language_arts'
    assert quest['created_by'] == STUDENT and quest['organization_id'] is None
    assert quest['is_public'] is False and quest['is_active'] is True
    assert quest['metadata']['partner_offering_id'] == OFFERING

    [enrol] = db.tables['user_quests']
    assert enrol['user_id'] == STUDENT and enrol['quest_id'] == quest['id']
    assert enrol['personalization_completed'] is True

    [call] = copies
    first, second = call['tasks']
    assert first['description'] == 'Catch three fallacies.'
    assert first['success_criteria'] == ['Three defined', 'Three examples']
    assert second['success_criteria'] == []

    [row] = db.tables['partner_offering_enrollments']
    assert row['class_quest_id'] == quest['id'] and row['source'] == 'link'


@pytest.mark.unit
def test_a_second_claim_returns_the_first_copy(copies):
    db = _db()
    first = svc.provision(db, _offering(db), STUDENT, source='link')
    again = svc.provision(db, _offering(db), STUDENT, source='partner', enrolled_by=PARTNER)
    assert again == {**first, 'created': False}
    assert len([q for q in db.tables['quests'] if q['id'] != TEMPLATE]) == 1
    assert len(copies) == 1


@pytest.mark.unit
def test_a_removed_student_who_returns_gets_their_old_copy_back(copies):
    db = _db()
    first = svc.provision(db, _offering(db), STUDENT, source='link')
    svc.remove_student(db, _offering(db), first['enrollment_id'])
    assert db.tables['partner_offering_enrollments'][0]['ended_at']
    again = svc.provision(db, _offering(db), STUDENT, source='link')
    assert again['quest_id'] == first['quest_id']
    assert db.tables['partner_offering_enrollments'][0]['ended_at'] is None


@pytest.mark.unit
def test_a_parent_account_cannot_take_the_class(copies):
    db = _db()
    with pytest.raises(svc.OfferingError) as err:
        svc.provision(db, _offering(db), PARENT, source='link')
    assert err.value.code == 'not_a_student'
    assert copies == [] and not db.tables.get('partner_offering_enrollments')


@pytest.mark.unit
def test_an_org_managed_student_can_take_the_class(copies):
    db = _db(role='org_managed', org_role='student')
    assert svc.provision(db, _offering(db), STUDENT, source='link')['created'] is True


@pytest.mark.unit
def test_an_under_13_student_gets_nothing(copies):
    db = _db(student_dob=date.today().replace(year=date.today().year - 12).isoformat())
    with pytest.raises(svc.OfferingError) as err:
        svc.provision(db, _offering(db), STUDENT, source='link')
    assert err.value.code == 'under_age'
    assert copies == []


@pytest.mark.unit
def test_a_missing_birthday_is_asked_for_then_saved(copies):
    db = _db(student_dob=None)
    with pytest.raises(svc.OfferingError) as err:
        svc.provision(db, _offering(db), STUDENT, source='link')
    assert err.value.code == 'dob_required'

    svc.provision(db, _offering(db), STUDENT, source='link', dob_value='2010-03-04')
    assert next(u for u in db.tables['users'] if u['id'] == STUDENT)['date_of_birth'] == '2010-03-04'


@pytest.mark.unit
def test_a_failed_copy_leaves_nothing_behind():
    db = _db()
    with patch('utils.template_tasks.load_template_tasks', lambda qid: [dict(t) for t in TEMPLATE_TASKS]), \
            patch('utils.template_tasks.copy_template_tasks_to_enrollment', lambda *a, **k: 0):
        with pytest.raises(RuntimeError):
            svc.provision(db, _offering(db), STUDENT, source='link')
    assert [q['id'] for q in db.tables['quests']] == [TEMPLATE]
    assert db.tables['user_quests'] == []
    assert db.tables['partner_offering_enrollments'] == []


@pytest.mark.unit
def test_an_inactive_offering_is_not_available(copies):
    db = _db()
    _offering(db)['is_active'] = False
    with pytest.raises(svc.OfferingError) as err:
        svc.claim_by_slug(db, 'latticework', STUDENT)
    assert err.value.status == 404


# ── the partner form ──────────────────────────────────────────────────────────

@pytest.mark.unit
def test_the_partner_form_puts_the_class_on_an_existing_student_login(copies):
    db = _db()
    with patch.object(svc, '_send_added_email', return_value=True) as mail:
        result = svc.add_student(db, _offering(db), actor_id=PARTNER, first_name='Kid', last_name='Reader',
                                 email='KID@example.com', frontend_url='https://app.optioeducation.com')
    assert result['is_new_account'] is False and result['created'] is True
    assert result['student']['id'] == STUDENT
    mail.assert_called_once()
    # The account itself is not changed.
    assert next(u for u in db.tables['users'] if u['id'] == STUDENT)['organization_id'] is None


@pytest.mark.unit
def test_the_partner_form_asks_who_when_the_address_is_a_parents(copies):
    db = _db()
    with patch('repositories.partner_enrollment_repository.PartnerEnrollmentRepository.linked_student_ids',
               return_value=[STUDENT]), \
            patch('repositories.partner_enrollment_repository.PartnerEnrollmentRepository.accounts_by_ids',
                  return_value={STUDENT: db.tables['users'][0]}):
        with pytest.raises(svc.OfferingError) as err:
            svc.add_student(db, _offering(db), actor_id=PARTNER, first_name='Kid', last_name='Reader',
                            email='mom@example.com', frontend_url='x')
    assert err.value.code == 'existing_account'
    assert err.value.extra['students'][0]['id'] == STUDENT
    assert copies == []


@pytest.mark.unit
def test_the_partner_form_refuses_an_under_13_new_student_before_making_an_account(copies):
    db = _db()
    young = date.today().replace(year=date.today().year - 12).isoformat()
    with patch('services.partner_accounts.create_invited_student') as create:
        with pytest.raises(svc.OfferingError) as err:
            svc.add_student(db, _offering(db), actor_id=PARTNER, first_name='Young', last_name='One',
                            email='young@example.com', dob_value=young, frontend_url='x')
    assert err.value.code == 'under_age'
    create.assert_not_called()


@pytest.mark.unit
def test_the_partner_form_creates_a_platform_student_for_a_new_address(copies):
    db = _db()
    new_user = {'id': '44444444-4444-4444-8444-444444444444', 'email': 'new@example.com',
                'first_name': 'New', 'last_name': 'Kid', 'display_name': 'New Kid', 'role': 'student',
                'org_role': None, 'organization_id': None, 'date_of_birth': '2010-01-01'}

    def fake_create(admin, **kwargs):
        db.tables['users'].append(new_user)
        assert kwargs.get('organization_id') is None   # a platform student, not Raleigh's org
        return new_user

    with patch('services.partner_accounts.create_invited_student', side_effect=fake_create), \
            patch.object(svc, '_send_welcome_email', return_value=True):
        result = svc.add_student(db, _offering(db), actor_id=PARTNER, first_name='New', last_name='Kid',
                                 email='new@example.com', dob_value='2010-01-01', frontend_url='x')
    assert result['is_new_account'] is True and result['email_sent'] is True
    assert db.tables['partner_offering_enrollments'][0]['source'] == 'partner'
    assert db.tables['partner_offering_enrollments'][0]['enrolled_by'] == PARTNER


# ── billing ───────────────────────────────────────────────────────────────────

@pytest.mark.unit
def test_billing_counts_open_copies_at_the_offering_rate(copies):
    db = _db()
    svc.provision(db, _offering(db), STUDENT, source='link')
    month = datetime.now(timezone.utc).strftime('%Y-%m')
    seats = svc.billable_students(db, ORG, month)
    [line] = seats['offerings']
    assert line['students'] == 1
    assert line['unit_amount_cents'] == 5000 and line['amount_cents'] == 5000

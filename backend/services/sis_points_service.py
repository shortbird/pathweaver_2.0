"""School points: staff give points for jobs and take them for perks, and each
student carries a running balance.

Apogee Cache Valley ran this on ClassDojo (2026-10-08): "quickly click a
button and add 5 points for 'daily job' to each students name, where it will
track their total number of points over time and let us subtract customizable
amounts for things like 'park trip' or 'crochet kit.'"

Points are the school's own currency, apart from XP. The spendable-XP wallet
(repositories/wallet_repository.py) is credited by every XP award, so it
cannot be a balance only staff and bounties move. A bounty may give points
beside its XP (reward type 'points'); the bounty review calls award_bounty.

The ledger is the record. A balance is the sum of a student's entries, read
from the sis_point_balances view; nothing stores it, so it cannot drift from
the entries it is made of. A mistake is undone by deleting the entry.
"""

from datetime import datetime, time, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from repositories.sis_points_repository import SisPointsRepository
from services import sis_service
from utils import person_name
from utils.logger import get_logger
from utils.timestamps import now_iso
from utils.validation import sanitize_input

logger = get_logger(__name__)

# What a school sees before it saves buttons of its own.
DEFAULT_BUTTONS = [{'label': 'Daily job', 'amount': 5}]

MAX_AMOUNT = 10000
MAX_REASON_LENGTH = 200
MAX_LABEL_LENGTH = 60
MAX_BUTTONS = 12
MAX_STUDENTS_PER_ENTRY = 500
RECENT_ENTRIES = 30
HISTORY_ENTRIES = 100

# Ticket 910668d8 (David Nilson, Apogee Cache Valley): "I would also like both
# the Adventurers and us Coaches to be able to input Points - but where we
# Coaches can take them away if upon inspection they shouldn't have been
# received." A student's own points count at once; this caps how many a
# student can give themselves per school day (org-local), so a mistake or a
# joke stays small until a coach looks. Owner's default, 2026-10-12.
STUDENT_DAILY_CAP = 20
DEFAULT_TZ = 'America/Denver'  # matches sis_staff_service.DEFAULT_TZ

# Points helpers (ticket 0f401a62, Apogee Cache Valley): "Is there a way to
# create a separate login for students to use to track points? We don't want
# all of them to have access to the point system but we do have a studio
# leader each session that tracks points."
#
# A helper is a student the school's admins name, who signs in as themselves
# and gives points to other students. The list lives in
# organizations.feature_flags.sis_settings.point_helper_ids (user ids), the
# same shape as the school inbox list (school_inbox_service.INBOX_MEMBERS_KEY),
# so no migration. Absent or empty: nobody is a helper, which is how every
# school worked before the list.
#
# A helper only gives. No take, no undo, no button editing, and never to
# themselves (a helper's own points stay under STUDENT_DAILY_CAP through
# add_own; giving to yourself here would walk around that cap).
POINT_HELPERS_KEY = 'point_helper_ids'
MAX_HELPERS = 50
# The most a helper may give one student in one entry: the school's largest
# give button, or HELPER_MIN_MAX when its buttons are all smaller. A helper
# must be able to tap any button the school made; a bigger custom amount is
# a coach's call. 10 is two "Daily job +5"s, Apogee's everyday button.
HELPER_MIN_MAX = 10
HELPER_RECENT = 10


class PointsError(ValueError):
    """A request the caller can fix; the route turns it into a 400."""


def _amount(value: Any, field: str = 'Amount') -> int:
    try:
        n = int(value)
    except (TypeError, ValueError) as e:
        raise PointsError(f'{field} must be a whole number') from e
    if n == 0:
        raise PointsError(f'{field} cannot be zero')
    if abs(n) > MAX_AMOUNT:
        raise PointsError(f'{field} must be between -{MAX_AMOUNT} and {MAX_AMOUNT}')
    return n


def _text(value: Any, field: str, limit: int) -> str:
    text = sanitize_input(str(value or '')).strip()[:limit]
    if not text:
        raise PointsError(f'{field} is required')
    return text


def added_by_student(row: Dict[str, Any]) -> bool:
    """An entry the student gave themselves. No column says so: the ledger's
    source CHECK allows only 'staff' and 'bounty', and created_by equal to
    the student is already an exact flag (staff entries are created by a
    staff member, bounty entries by nobody), so no migration was needed."""
    return bool(row.get('created_by')) and row.get('created_by') == row.get('student_user_id')


def given_by_student(row: Dict[str, Any], people: Dict[str, Dict[str, Any]]) -> bool:
    """An entry a points helper (ticket 0f401a62) gave another student: the
    creator is a student who is not the recipient. Read from created_by and
    the creator's role, like added_by_student, so no column is needed."""
    giver = row.get('created_by')
    if not giver or giver == row.get('student_user_id'):
        return False
    person = people.get(giver)
    return person is not None and sis_service.is_student(person)


def helpers_from_flags(feature_flags: Any) -> List[str]:
    """The configured helper ids from a feature_flags blob ([] = nobody)."""
    sis = (feature_flags or {}).get('sis_settings') if isinstance(feature_flags, dict) else None
    ids = (sis or {}).get(POINT_HELPERS_KEY) if isinstance(sis, dict) else None
    if not isinstance(ids, list):
        return []
    return [str(i) for i in ids if i]


def helper_max(buttons: List[Dict[str, Any]]) -> int:
    """The largest amount a helper may give in one entry (see HELPER_MIN_MAX)."""
    gives = [b.get('amount') or 0 for b in buttons if (b.get('amount') or 0) > 0]
    return max([HELPER_MIN_MAX, *gives])


def bounty_points(bounty: Dict[str, Any]) -> int:
    """The points a bounty gives on approval: the sum of its 'points' rewards."""
    total = 0
    for r in bounty.get('rewards') or []:
        if isinstance(r, dict) and r.get('type') == 'points':
            try:
                total += int(r.get('value') or 0)
            except (TypeError, ValueError):
                continue
    return total


class PointsService:
    def __init__(self, repository: Optional[SisPointsRepository] = None):
        self.repository = repository or SisPointsRepository()

    # -- reads ----------------------------------------------------------------

    def _students(self, org_id: str) -> List[Dict[str, Any]]:
        return [
            p for p in sis_service.get_roster(org_id)
            if p.get('is_student')
            and p.get('enrollment_status') not in sis_service.INACTIVE_ENROLLMENT_STATUSES
        ]

    def buttons(self, org_id: str) -> List[Dict[str, Any]]:
        rows = self.repository.buttons(org_id)
        if not rows:
            return [dict(b) for b in DEFAULT_BUTTONS]
        return [{'id': r['id'], 'label': r['label'], 'amount': r['amount']} for r in rows]

    def _entries_out(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        ids = {r['student_user_id'] for r in rows} | {r['created_by'] for r in rows if r.get('created_by')}
        people = {u['id']: u for u in self.repository.users(ids)}
        names = {uid: person_name.full_name(u) for uid, u in people.items()}
        return [{
            'id': r['id'],
            'student_id': r['student_user_id'],
            'student_name': names.get(r['student_user_id']),
            'amount': r['amount'],
            'reason': r['reason'],
            'source': 'student' if added_by_student(r) else (r.get('source') or 'staff'),
            'added_by_student': added_by_student(r),
            # Ticket 0f401a62: a points helper's entry, so a coach can check
            # it and undo it; the giver's name is created_by_name.
            'given_by_student': given_by_student(r, people),
            'bounty_id': r.get('bounty_id'),
            'created_by_name': names.get(r['created_by']) if r.get('created_by') else None,
            'created_at': r['created_at'],
        } for r in rows]

    def board(self, org_id: str) -> Dict[str, Any]:
        """Every current student with their balance, the school's buttons, and
        the newest entries (so a wrong click can be undone)."""
        return {
            'students': self._balances_out(org_id),
            'buttons': self.buttons(org_id),
            'recent': self._entries_out(self.repository.recent_entries(org_id, RECENT_ENTRIES)),
        }

    def _balances_out(self, org_id: str) -> List[Dict[str, Any]]:
        students = self._students(org_id)
        balances = {b['student_user_id']: b for b in self.repository.balances(org_id)}
        out = [{
            'student_id': s['student_id'],
            'name': s.get('name'),
            'age': s.get('age'),
            'balance': (balances.get(s['student_id']) or {}).get('balance') or 0,
            'earned': (balances.get(s['student_id']) or {}).get('earned') or 0,
            'spent': (balances.get(s['student_id']) or {}).get('spent') or 0,
        } for s in students]
        out.sort(key=lambda s: (s.get('name') or '').lower())
        return out

    # -- points helpers (ticket 0f401a62) --------------------------------------

    def helper_ids(self, org_id: str) -> List[str]:
        """The ids on the school's helper list, as stored ([] = nobody)."""
        return helpers_from_flags(self.repository.org_feature_flags(org_id))

    def helpers(self, org_id: str) -> List[Dict[str, Any]]:
        """The school's helpers who are still current students, by name. An
        id for someone withdrawn stays stored until the next save drops it
        (clean_helper_ids takes current students only)."""
        listed = set(self.helper_ids(org_id))
        out = [{'student_id': s['student_id'], 'name': s.get('name')}
               for s in self._students(org_id) if s['student_id'] in listed]
        out.sort(key=lambda s: (s.get('name') or '').lower())
        return out

    def clean_helper_ids(self, org_id: str, raw: Any) -> List[str]:
        """The list an admin saves: current students of this school only."""
        if not isinstance(raw, list):
            raise PointsError('student_ids must be a list')
        wanted = list(dict.fromkeys(str(i) for i in raw if i))
        if len(wanted) > MAX_HELPERS:
            raise PointsError(f'At most {MAX_HELPERS} helpers')
        current = {s['student_id'] for s in self._students(org_id)}
        if any(i not in current for i in wanted):
            raise PointsError('Only current students of this school can be points helpers')
        return wanted

    def _helper_org(self, user_id: str) -> str:
        """The caller's school, if they are a points helper there: a student
        of a school that runs points, on its list. Anyone else is refused."""
        from modules.enabled import module_enabled

        users = self.repository.users([user_id])
        caller = users[0] if users else None
        org_id = (caller or {}).get('organization_id')
        if not caller or not org_id or not sis_service.is_student(caller):
            raise PermissionError('Only a points helper can give points')
        if not module_enabled(org_id, 'points'):
            raise PermissionError('Points are off at this school')
        if user_id not in self.helper_ids(org_id):
            raise PermissionError('Only a points helper can give points')
        return org_id

    def helper_board(self, user_id: str) -> Dict[str, Any]:
        """What a helper works from: every other current student with their
        balance, the school's give buttons, the most one entry may give, and
        the helper's own recent gives. No ages, no other entries."""
        org_id = self._helper_org(user_id)
        buttons = [b for b in self.buttons(org_id) if (b.get('amount') or 0) > 0]
        students = [{'student_id': s['student_id'], 'name': s['name'], 'balance': s['balance']}
                    for s in self._balances_out(org_id) if s['student_id'] != user_id]
        return {
            'students': students,
            'buttons': buttons,
            'max_amount': helper_max(buttons),
            'recent': self._entries_out(self.repository.given_by(org_id, user_id, HELPER_RECENT)),
        }

    def add_as_helper(self, user_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """A helper gives points to other students: {student_ids, amount, reason}.

        Ticket 0f401a62: "we do have a studio leader each session that tracks
        points." Positive only, at most helper_max a student per entry, never
        to themselves; the entry is created_by the helper, so the staff board
        shows who gave it and a coach undoes it like any other."""
        org_id = self._helper_org(user_id)
        raw_ids = data.get('student_ids')
        if isinstance(raw_ids, list) and user_id in {str(s) for s in raw_ids}:
            raise PointsError('You cannot give points to yourself. A coach can.')
        amount = _amount(data.get('amount'))
        if amount < 0:
            raise PointsError('Helpers can only give points. A coach takes them away.')
        cap = helper_max(self.buttons(org_id))
        if amount > cap:
            raise PointsError(f'A helper can give up to {cap} points at a time.')
        return self.add(org_id, {'student_ids': raw_ids, 'amount': amount,
                                 'reason': data.get('reason')}, user_id)

    def history(self, student_id: str) -> Dict[str, Any]:
        """One student's balance and newest entries, at their own school."""
        users = self.repository.users([student_id])
        student = users[0] if users else None
        org_id = (student or {}).get('organization_id')
        if not org_id:
            return {'student_id': student_id, 'name': None, 'balance': 0,
                    'earned': 0, 'spent': 0, 'entries': []}
        bal = next(iter(self.repository.balances(org_id, [student_id])), {}) or {}
        return {
            'student_id': student_id,
            'name': person_name.full_name(student),
            'balance': bal.get('balance') or 0,
            'earned': bal.get('earned') or 0,
            'spent': bal.get('spent') or 0,
            'entries': self._entries_out(
                self.repository.student_entries(org_id, student_id, HISTORY_ENTRIES)),
        }

    def mine(self, user_id: str) -> List[Dict[str, Any]]:
        """The caller's own points if they are a student, else every child's
        they parent -- only at schools that run points."""
        from modules.enabled import module_enabled
        from utils.class_membership import children_of_parent

        users = self.repository.users([user_id])
        caller = users[0] if users else None
        if caller and sis_service.is_student(caller):
            student_ids = [user_id]
        else:
            student_ids = sorted(children_of_parent(user_id))
        by_id = {u['id']: u for u in self.repository.users(student_ids)}
        out = []
        for sid in student_ids:
            org_id = (by_id.get(sid) or {}).get('organization_id')
            if org_id and module_enabled(org_id, 'points'):
                data = self.history(sid)
                # Only the student adds their own points (ticket 910668d8);
                # a parent reading a child's points stays read-only.
                data['can_add'] = sid == user_id
                if data['can_add']:
                    data['daily_cap'] = STUDENT_DAILY_CAP
                    data['added_today'] = self._added_today(org_id, sid)
                # Ticket 0f401a62: the page opens "Give points" for a helper.
                # Only ever the caller's own row; a parent is never a helper.
                data['is_helper'] = bool(data['can_add']) and sid in self.helper_ids(org_id)
                out.append(data)
        return out

    def _day_start_iso(self, org_id: str) -> str:
        """Midnight today at the school, in UTC: the daily cap's day is the
        school's, not the server's."""
        try:
            tz = ZoneInfo(self.repository.org_timezone(org_id) or DEFAULT_TZ)
        except (ZoneInfoNotFoundError, ValueError):
            tz = ZoneInfo(DEFAULT_TZ)
        local_today = datetime.now(tz).date()
        return datetime.combine(local_today, time.min, tzinfo=tz).astimezone(timezone.utc).isoformat()

    def _added_today(self, org_id: str, student_id: str) -> int:
        rows = self.repository.self_added_since(org_id, student_id, self._day_start_iso(org_id))
        return sum(r.get('amount') or 0 for r in rows if (r.get('amount') or 0) > 0)

    def given_since(self, org_id: str, since_iso: str) -> int:
        """Points given (not spent) since a date, for the School Dashboard."""
        return sum(r['amount'] for r in self.repository.given_since(org_id, since_iso))

    # -- writes ---------------------------------------------------------------

    def add(self, org_id: str, data: Dict[str, Any], staff_id: str) -> Dict[str, Any]:
        """Give (positive amount) or take (negative) points from one or more
        students, one ledger entry each. A take that would leave any student
        below zero is refused as a whole, naming who is short."""
        raw_ids = data.get('student_ids')
        if not isinstance(raw_ids, list) or not raw_ids:
            raise PointsError('Pick at least one student')
        student_ids = list(dict.fromkeys(str(s) for s in raw_ids))
        if len(student_ids) > MAX_STUDENTS_PER_ENTRY:
            raise PointsError(f'At most {MAX_STUDENTS_PER_ENTRY} students at once')
        amount = _amount(data.get('amount'))
        reason = _text(data.get('reason'), 'Reason', MAX_REASON_LENGTH)

        users = {u['id']: u for u in self.repository.users(student_ids)}
        for sid in student_ids:
            u = users.get(sid)
            if not u or u.get('organization_id') != org_id or not sis_service.is_student(u):
                raise LookupError('Student not found')

        balances = {b['student_user_id']: b.get('balance') or 0
                    for b in self.repository.balances(org_id, student_ids)}
        if amount < 0:
            short = [sid for sid in student_ids if balances.get(sid, 0) + amount < 0]
            if short:
                names = ', '.join(
                    f"{person_name.full_name(users[sid])} ({balances.get(sid, 0)})" for sid in short)
                raise PointsError(f'Not enough points: {names}')

        now = now_iso()
        rows = [{
            'organization_id': org_id,
            'student_user_id': sid,
            'amount': amount,
            'reason': reason,
            'source': 'staff',
            'created_by': staff_id,
            'created_at': now,
        } for sid in student_ids]
        created = self.repository.insert_entries(rows)
        return {
            'entries': self._entries_out(created),
            'balances': {sid: balances.get(sid, 0) + amount for sid in student_ids},
        }

    def add_own(self, student_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """A student gives themselves points: {amount, reason}.

        Ticket 910668d8: "I would also like both the Adventurers and us
        Coaches to be able to input Points - but where we Coaches can take
        them away if upon inspection they shouldn't have been received."

        - the caller IS the student, at a school with points on;
        - a positive amount only (a student never spends or takes here);
        - a reason is required, so a coach can judge it;
        - at most STUDENT_DAILY_CAP a school day across all their additions;
        - it counts at once, and shows on the staff board as added by the
          student; a coach takes it away with the ordinary undo.

        The cap is read, then written: two requests at the same instant can
        both pass it. The overshoot is one entry, visible, and undoable.
        """
        from modules.enabled import module_enabled

        users = self.repository.users([student_id])
        student = users[0] if users else None
        org_id = (student or {}).get('organization_id')
        if not student or not org_id or not sis_service.is_student(student):
            raise PermissionError('Only a student can add their own points')
        if not module_enabled(org_id, 'points'):
            raise PermissionError('Points are off at this school')

        amount = _amount(data.get('amount'))
        if amount < 0:
            raise PointsError('You can only add points. A coach takes them away.')
        reason = _text(data.get('reason'), 'Reason', MAX_REASON_LENGTH)

        used = self._added_today(org_id, student_id)
        if used + amount > STUDENT_DAILY_CAP:
            left = max(STUDENT_DAILY_CAP - used, 0)
            raise PointsError(f'You can add up to {STUDENT_DAILY_CAP} points a day. '
                              f'You have {left} left today.')

        created = self.repository.insert_entries([{
            'organization_id': org_id,
            'student_user_id': student_id,
            'amount': amount,
            'reason': reason,
            # 'staff' because the ledger's CHECK allows nothing else for a
            # hand entry; created_by == the student is what marks it as the
            # student's (added_by_student) everywhere it is read.
            'source': 'staff',
            'created_by': student_id,
            'created_at': now_iso(),
        }])
        bal = next(iter(self.repository.balances(org_id, [student_id])), {}) or {}
        return {
            'entries': self._entries_out(created),
            'balance': bal.get('balance') or 0,
            'added_today': used + amount,
            'daily_cap': STUDENT_DAILY_CAP,
        }

    def undo(self, org_id: str, entry_id: str) -> Dict[str, Any]:
        """Delete one entry of this school's. The balance follows on its own."""
        entry = self.repository.entry(entry_id)
        if not entry or entry.get('organization_id') != org_id:
            raise LookupError('Entry not found')
        self.repository.delete_entry(entry_id)
        bal = next(iter(self.repository.balances(org_id, [entry['student_user_id']])), {}) or {}
        return {'student_id': entry['student_user_id'], 'balance': bal.get('balance') or 0}

    def save_buttons(self, org_id: str, raw: Any) -> List[Dict[str, Any]]:
        """Replace the school's quick buttons: [{label, amount}]."""
        if not isinstance(raw, list):
            raise PointsError('Buttons must be a list')
        if len(raw) > MAX_BUTTONS:
            raise PointsError(f'At most {MAX_BUTTONS} buttons')
        rows = []
        for i, b in enumerate(raw):
            if not isinstance(b, dict):
                raise PointsError('Each button needs a label and an amount')
            rows.append({
                'organization_id': org_id,
                'label': _text(b.get('label'), 'Button label', MAX_LABEL_LENGTH),
                'amount': _amount(b.get('amount'), 'Button amount'),
                'sort_order': i,
            })
        saved = self.repository.replace_buttons(org_id, rows)
        return [{'id': r['id'], 'label': r['label'], 'amount': r['amount']} for r in saved]

    def award_bounty(self, student_id: str, bounty: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """The points an approved bounty gives, as one entry. Only a school
        bounty, at a school that runs points, for one of its own students: a
        family bounty has no school whose points these would be."""
        from modules.enabled import module_enabled

        points = bounty_points(bounty)
        org_id = bounty.get('organization_id')
        if points <= 0 or not org_id or not module_enabled(org_id, 'points'):
            return None
        users = self.repository.users([student_id])
        if not users or users[0].get('organization_id') != org_id:
            return None
        rows = self.repository.insert_entries([{
            'organization_id': org_id,
            'student_user_id': student_id,
            'amount': min(points, MAX_AMOUNT),
            'reason': (bounty.get('title') or 'Bounty')[:MAX_REASON_LENGTH],
            'source': 'bounty',
            'bounty_id': bounty.get('id'),
            'created_at': now_iso(),
        }])
        return rows[0] if rows else None

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

from typing import Any, Dict, Iterable, List, Optional

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

    def _names(self, user_ids: Iterable[str]) -> Dict[str, str]:
        return {u['id']: person_name.full_name(u) for u in self.repository.users(set(user_ids))}

    def _entries_out(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        ids = {r['student_user_id'] for r in rows} | {r['created_by'] for r in rows if r.get('created_by')}
        names = self._names(ids)
        return [{
            'id': r['id'],
            'student_id': r['student_user_id'],
            'student_name': names.get(r['student_user_id']),
            'amount': r['amount'],
            'reason': r['reason'],
            'source': r.get('source') or 'staff',
            'bounty_id': r.get('bounty_id'),
            'created_by_name': names.get(r['created_by']) if r.get('created_by') else None,
            'created_at': r['created_at'],
        } for r in rows]

    def board(self, org_id: str) -> Dict[str, Any]:
        """Every current student with their balance, the school's buttons, and
        the newest entries (so a wrong click can be undone)."""
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
        return {
            'students': out,
            'buttons': self.buttons(org_id),
            'recent': self._entries_out(self.repository.recent_entries(org_id, RECENT_ENTRIES)),
        }

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
                out.append(self.history(sid))
        return out

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

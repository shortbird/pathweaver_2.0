"""
A student's credit bank on their SIS record (services/credit_bank_service.py):
what has been banked, what credit review has used, and what is left.

ADMIN_ROLES plus @require_relationship_to('student_id', 'org_staff'), so the
student is at the caller's own school (a superadmin passes through the
console's org). Its own blueprint because routes/sis/__init__.py sits at its
line cap; registered from routes/__init__.py.
"""
from flask import Blueprint, jsonify, request

from modules.gate import module_guard
from services import credit_bank_service
from utils.auth.decorators import require_role
from utils.auth.relationships import require_relationship_to
from utils.sis_roles import ADMIN_ROLES

bp = Blueprint('sis_credit_bank', __name__, url_prefix='/api/sis')
# Registered from routes/__init__.py, so it carries its own module gate: the
# SIS core, the same as the student record it sits on.
module_guard(bp, 'sis')


@bp.route('/students/<student_id>/credit-bank', methods=['GET'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('student_id', allow=('org_staff',))
def get_credit_bank(user_id, student_id):
    return jsonify({'success': True,
                    'credits': credit_bank_service.balances([student_id])[student_id]})


@bp.route('/students/<student_id>/credit-bank', methods=['POST'])
@require_role(*ADMIN_ROLES)
@require_relationship_to('student_id', allow=('org_staff',))
def add_credit_bank_entry(user_id, student_id):
    """{credits, kind: accelerated|adjustment, order_reference, note}."""
    body = request.get_json(silent=True) or {}
    try:
        balance = credit_bank_service.add_entry(
            student_id, body.get('credits'), body.get('kind') or 'accelerated', body.get('note'),
            user_id, order_reference=body.get('order_reference'))
    except credit_bank_service.CreditBankError as e:
        return jsonify({'success': False, 'error': str(e)}), e.status
    return jsonify({'success': True, 'credits': balance})

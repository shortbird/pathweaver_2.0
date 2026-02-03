"""
Task Steps API Routes
=====================

Endpoints for AI-powered task step breakdowns.
Supports generating steps, drill-down for stuck users, and step management.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_auth
from utils.ai_access import require_ai_access
from utils.logger import get_logger
from services.task_steps_service import task_steps_service, AIGenerationError

logger = get_logger(__name__)

bp = Blueprint('task_steps', __name__, url_prefix='/api/tasks')


@bp.route('/<task_id>/steps/generate', methods=['POST'])
@require_auth
def generate_steps(user_id: str, task_id: str):
    """
    Generate AI-powered steps for a task.

    Request body:
        granularity: 'quick' (3-5 steps) or 'detailed' (10-15 steps)

    Returns:
        200: { success: true, steps: [...], granularity: str }
        400: Validation error
        403: AI access denied
        500: Generation error
    """
    # Check AI access for task_breakdown feature
    ai_error = require_ai_access(user_id, 'task_generation')
    if ai_error:
        return ai_error

    try:
        data = request.get_json() or {}
        granularity = data.get('granularity', 'quick')

        result = task_steps_service.generate_steps(
            task_id=task_id,
            user_id=user_id,
            granularity=granularity
        )

        return jsonify(result), 200

    except ValueError as e:
        logger.warning(f"Validation error generating steps: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400

    except AIGenerationError as e:
        logger.error(f"AI generation error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

    except Exception as e:
        logger.error(f"Error generating steps for task {task_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to generate steps'
        }), 500


@bp.route('/<task_id>/steps/<step_id>/drill-down', methods=['POST'])
@require_auth
def drill_down_step(user_id: str, task_id: str, step_id: str):
    """
    Generate sub-steps for a step the user is stuck on.

    Returns:
        200: { success: true, steps: [...], parent_step_id: str }
        400: Validation error (e.g., max depth reached)
        403: AI access denied
        500: Generation error
    """
    # Check AI access
    ai_error = require_ai_access(user_id, 'task_generation')
    if ai_error:
        return ai_error

    try:
        result = task_steps_service.drill_down_step(
            step_id=step_id,
            task_id=task_id,
            user_id=user_id
        )

        return jsonify(result), 200

    except ValueError as e:
        logger.warning(f"Validation error drilling down step: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400

    except AIGenerationError as e:
        logger.error(f"AI generation error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

    except Exception as e:
        logger.error(f"Error drilling down step {step_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to generate sub-steps'
        }), 500


@bp.route('/<task_id>/steps', methods=['GET'])
@require_auth
def get_steps(user_id: str, task_id: str):
    """
    Get all steps for a task, including nested sub-steps.

    Returns:
        200: { success: true, steps: [...] }
        500: Server error
    """
    try:
        steps = task_steps_service.get_steps(
            task_id=task_id,
            user_id=user_id
        )

        return jsonify({
            'success': True,
            'steps': steps
        }), 200

    except Exception as e:
        logger.error(f"Error fetching steps for task {task_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch steps'
        }), 500


@bp.route('/<task_id>/steps/<step_id>/toggle', methods=['PUT'])
@require_auth
def toggle_step(user_id: str, task_id: str, step_id: str):
    """
    Toggle a step's completion status.

    Returns:
        200: { success: true, step_id: str, is_completed: bool }
        400: Step not found
        500: Server error
    """
    try:
        result = task_steps_service.toggle_step(
            step_id=step_id,
            task_id=task_id,
            user_id=user_id
        )

        return jsonify(result), 200

    except ValueError as e:
        logger.warning(f"Validation error toggling step: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400

    except Exception as e:
        logger.error(f"Error toggling step {step_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to toggle step'
        }), 500


@bp.route('/<task_id>/steps', methods=['DELETE'])
@require_auth
def delete_all_steps(user_id: str, task_id: str):
    """
    Delete all steps for a task.

    Returns:
        200: { success: true, task_id: str }
        500: Server error
    """
    try:
        result = task_steps_service.delete_all_steps(
            task_id=task_id,
            user_id=user_id
        )

        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Error deleting steps for task {task_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to delete steps'
        }), 500

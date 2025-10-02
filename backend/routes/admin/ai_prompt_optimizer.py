"""
AI Prompt Optimizer Routes
Admin endpoints for continuous improvement of AI prompts.
"""

from flask import Blueprint, jsonify, request
from backend.services.ai_prompt_optimizer_service import AIPromptOptimizerService
from backend.utils.auth.decorators import require_auth, require_admin
import logging

logger = logging.getLogger(__name__)

ai_prompt_optimizer_bp = Blueprint('ai_prompt_optimizer', __name__)


@ai_prompt_optimizer_bp.route('/analyze', methods=['GET'])
@require_auth
@require_admin
def analyze_prompt_performance():
    """
    Analyze performance of all prompt versions.

    Query params:
        days (int): Number of days to analyze (default: 30)

    Returns:
        List of prompt versions with performance metrics and recommendations
    """
    try:
        days = int(request.args.get('days', 30))

        optimizer = AIPromptOptimizerService()
        analysis = optimizer.analyze_prompt_performance(days)

        return jsonify({
            'success': True,
            'data': analysis
        }), 200

    except Exception as e:
        logger.error(f"Error analyzing prompt performance: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@ai_prompt_optimizer_bp.route('/insights', methods=['GET'])
@require_auth
@require_admin
def get_improvement_insights():
    """
    Get actionable insights for prompt improvement.

    Query params:
        days (int): Number of days to analyze (default: 30)

    Returns:
        Insights with trends, comparisons, and recommendations
    """
    try:
        days = int(request.args.get('days', 30))

        optimizer = AIPromptOptimizerService()
        insights = optimizer.get_improvement_insights(days)

        return jsonify({
            'success': True,
            'data': insights
        }), 200

    except Exception as e:
        logger.error(f"Error getting improvement insights: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@ai_prompt_optimizer_bp.route('/suggestions/<version_number>', methods=['GET'])
@require_auth
@require_admin
def get_prompt_suggestions(version_number):
    """
    Get specific modification suggestions for a prompt version.

    Args:
        version_number: Version to analyze

    Returns:
        Detailed suggestions for prompt modification
    """
    try:
        optimizer = AIPromptOptimizerService()
        suggestions = optimizer.suggest_prompt_modifications(version_number)

        return jsonify({
            'success': True,
            'data': suggestions
        }), 200

    except Exception as e:
        logger.error(f"Error getting prompt suggestions: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@ai_prompt_optimizer_bp.route('/create-optimized', methods=['POST'])
@require_auth
@require_admin
def create_optimized_version():
    """
    Create a new optimized prompt version.

    Request body:
        base_version (str): Version to base new prompt on
        modifications (list): List of modification descriptions

    Returns:
        New prompt version data
    """
    try:
        data = request.get_json()
        base_version = data.get('base_version')
        modifications = data.get('modifications', [])

        if not base_version:
            return jsonify({
                'success': False,
                'error': 'base_version is required'
            }), 400

        optimizer = AIPromptOptimizerService()
        new_prompt = optimizer.create_optimized_prompt_version(base_version, modifications)

        return jsonify({
            'success': True,
            'data': new_prompt
        }), 201

    except Exception as e:
        logger.error(f"Error creating optimized version: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

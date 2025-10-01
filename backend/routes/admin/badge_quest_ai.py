"""
Admin Badge-Quest AI Linking Routes
AI-powered quest-to-badge mapping endpoints.
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_admin
from services.badge_quest_ai_linker import BadgeQuestAILinker

bp = Blueprint('admin_badge_quest_ai', __name__, url_prefix='/api/admin/badge-quests')


@bp.route('/ai-analyze/<badge_id>', methods=['POST'])
@require_admin
def analyze_badge(user_id, badge_id):
    """
    Analyze all quests and recommend which ones should count toward a badge.

    Path params:
        badge_id: Badge UUID to analyze

    Request body:
        - min_confidence: Minimum confidence score (0-100, default 70)

    Returns:
        Recommendations with confidence scores and reasoning
    """
    try:
        data = request.get_json() or {}
        min_confidence = int(data.get('min_confidence', 70))

        # Validate min_confidence
        if not 0 <= min_confidence <= 100:
            return jsonify({
                'success': False,
                'error': 'min_confidence must be between 0 and 100'
            }), 400

        linker = BadgeQuestAILinker()
        results = linker.analyze_all_quests_for_badge(badge_id, min_confidence)

        return jsonify({
            'success': True,
            'analysis': results
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        print(f"Error analyzing badge {badge_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Analysis failed: {str(e)}'
        }), 500


@bp.route('/ai-analyze-all', methods=['POST'])
@require_admin
def analyze_all_badges(user_id):
    """
    Analyze all active badges and generate quest recommendations for each.

    Request body:
        - min_confidence: Minimum confidence score (0-100, default 70)
        - max_per_badge: Maximum recommendations per badge (optional)

    Returns:
        Complete analysis for all badges with aggregate statistics
    """
    try:
        data = request.get_json() or {}
        min_confidence = int(data.get('min_confidence', 70))
        max_per_badge = data.get('max_per_badge')

        if max_per_badge is not None:
            max_per_badge = int(max_per_badge)

        # Validate parameters
        if not 0 <= min_confidence <= 100:
            return jsonify({
                'success': False,
                'error': 'min_confidence must be between 0 and 100'
            }), 400

        if max_per_badge is not None and max_per_badge < 1:
            return jsonify({
                'success': False,
                'error': 'max_per_badge must be at least 1'
            }), 400

        linker = BadgeQuestAILinker()
        results = linker.analyze_all_badges_bulk(min_confidence, max_per_badge)

        return jsonify({
            'success': True,
            'analysis': results
        }), 200

    except Exception as e:
        print(f"Error analyzing all badges: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Bulk analysis failed: {str(e)}'
        }), 500


@bp.route('/ai-auto-link/<badge_id>', methods=['POST'])
@require_admin
def auto_link_badge(user_id, badge_id):
    """
    Automatically link recommended quests to a badge.

    Path params:
        badge_id: Badge UUID

    Request body:
        - recommendations: List of recommendation objects from AI analysis
        - dry_run: If true, preview links without creating them (default false)

    Returns:
        Results of linking operation
    """
    try:
        data = request.get_json()

        if not data or 'recommendations' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: recommendations'
            }), 400

        recommendations = data['recommendations']
        dry_run = data.get('dry_run', False)

        if not isinstance(recommendations, list):
            return jsonify({
                'success': False,
                'error': 'recommendations must be an array'
            }), 400

        linker = BadgeQuestAILinker()
        results = linker.auto_link_recommendations(badge_id, recommendations, dry_run)

        return jsonify({
            'success': True,
            'results': results
        }), 200 if not dry_run else 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        print(f"Error auto-linking badge {badge_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Auto-link failed: {str(e)}'
        }), 500


@bp.route('/ai-bulk-auto-link', methods=['POST'])
@require_admin
def bulk_auto_link_all(user_id):
    """
    Automatically link AI recommendations for all badges in one operation.

    Request body:
        - min_confidence: Minimum confidence score (0-100, default 75)
        - max_per_badge: Maximum links per badge (optional, default 15)
        - dry_run: If true, preview without creating links (default false)

    Returns:
        Complete results for all badges
    """
    try:
        data = request.get_json() or {}
        min_confidence = int(data.get('min_confidence', 75))
        max_per_badge = int(data.get('max_per_badge', 15))
        dry_run = data.get('dry_run', False)

        # Validate parameters
        if not 0 <= min_confidence <= 100:
            return jsonify({
                'success': False,
                'error': 'min_confidence must be between 0 and 100'
            }), 400

        if max_per_badge < 1:
            return jsonify({
                'success': False,
                'error': 'max_per_badge must be at least 1'
            }), 400

        linker = BadgeQuestAILinker()

        # Step 1: Analyze all badges
        analysis = linker.analyze_all_badges_bulk(min_confidence, max_per_badge)

        if dry_run:
            return jsonify({
                'success': True,
                'dry_run': True,
                'analysis': analysis,
                'would_create_links': analysis['total_recommendations']
            }), 200

        # Step 2: Auto-link for each badge
        link_results = []
        total_created = 0
        total_failed = 0

        for badge_analysis in analysis['badge_results']:
            if badge_analysis.get('error') or not badge_analysis.get('recommendations'):
                continue

            try:
                result = linker.auto_link_recommendations(
                    badge_analysis['badge_id'],
                    badge_analysis['recommendations'],
                    dry_run=False
                )

                link_results.append({
                    'badge_id': badge_analysis['badge_id'],
                    'badge_name': badge_analysis['badge_name'],
                    'links_created': result['links_created'],
                    'links_failed': result['links_failed']
                })

                total_created += result['links_created']
                total_failed += result['links_failed']

            except Exception as e:
                link_results.append({
                    'badge_id': badge_analysis['badge_id'],
                    'badge_name': badge_analysis.get('badge_name', 'Unknown'),
                    'error': str(e),
                    'links_created': 0,
                    'links_failed': 0
                })

        return jsonify({
            'success': True,
            'badges_processed': len(link_results),
            'total_links_created': total_created,
            'total_links_failed': total_failed,
            'badge_results': link_results
        }), 200

    except Exception as e:
        print(f"Error in bulk auto-link: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Bulk auto-link failed: {str(e)}'
        }), 500


@bp.route('/suggestions/<badge_id>', methods=['GET'])
@require_admin
def get_cached_suggestions(user_id, badge_id):
    """
    Get AI suggestions for a badge (runs fresh analysis).

    Path params:
        badge_id: Badge UUID

    Query params:
        - min_confidence: Minimum confidence score (default 70)

    Returns:
        AI recommendations for the badge
    """
    try:
        min_confidence = int(request.args.get('min_confidence', 70))

        linker = BadgeQuestAILinker()
        results = linker.analyze_all_quests_for_badge(badge_id, min_confidence)

        return jsonify({
            'success': True,
            'badge_id': badge_id,
            'suggestions': results
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        print(f"Error getting suggestions for badge {badge_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to get suggestions: {str(e)}'
        }), 500

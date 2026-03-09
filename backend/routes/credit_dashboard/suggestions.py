"""
Credit Dashboard - AI merge suggestion endpoint.

Endpoints:
- GET /api/credit-dashboard/suggest-merges/<student_id> - Get AI-suggested task merges
"""

import json
import hashlib
from flask import request
from database import get_supabase_admin_singleton
from utils.auth.decorators import require_role
from utils.api_response_v1 import success_response, error_response

from utils.logger import get_logger

logger = get_logger(__name__)

from . import bp

# Simple in-memory cache for suggestions (student_id -> {timestamp, data})
_suggestion_cache = {}
CACHE_TTL_SECONDS = 3600  # 1 hour


@bp.route('/suggest-merges/<student_id>', methods=['GET'])
@require_role('advisor', 'accreditor', 'superadmin')
def suggest_merges(user_id: str, student_id: str):
    """Use Gemini to suggest similar tasks that could be merged."""
    try:
        import time

        # Check cache
        cache_key = student_id
        cached = _suggestion_cache.get(cache_key)
        if cached and (time.time() - cached['timestamp']) < CACHE_TTL_SECONDS:
            return success_response(data={'suggestions': cached['data'], 'cached': True})

        admin_supabase = get_supabase_admin_singleton()

        # Fetch pending/approved completions for student
        completions = admin_supabase.table('quest_task_completions') \
            .select('id, user_quest_task_id') \
            .eq('user_id', student_id) \
            .in_('diploma_status', ['pending_review', 'approved']) \
            .execute()

        if not completions.data or len(completions.data) < 2:
            return success_response(data={'suggestions': [], 'cached': False})

        # Get task details
        task_ids = [c['user_quest_task_id'] for c in completions.data if c.get('user_quest_task_id')]
        if len(task_ids) < 2:
            return success_response(data={'suggestions': [], 'cached': False})

        tasks = admin_supabase.table('user_quest_tasks') \
            .select('id, title, description') \
            .in_('id', task_ids) \
            .execute()

        task_map = {t['id']: t for t in (tasks.data or [])}
        completion_task_map = {c['id']: c['user_quest_task_id'] for c in completions.data}

        # Build prompt for Gemini
        task_list = []
        for c in completions.data:
            task = task_map.get(c.get('user_quest_task_id'), {})
            task_list.append({
                'completion_id': c['id'],
                'title': task.get('title', ''),
                'description': (task.get('description') or '')[:200]
            })

        prompt = f"""Analyze these student tasks and identify groups of similar/duplicate tasks that could be merged.
Return a JSON array of merge groups. Each group should have:
- "completion_ids": array of completion IDs that are similar
- "reason": brief explanation of similarity
- "confidence": number 0-1

Only suggest merges where tasks are clearly duplicative or very similar in scope.
If no good merges exist, return an empty array.

Tasks:
{json.dumps(task_list, indent=2)}

Respond with ONLY valid JSON, no markdown formatting."""

        # Call Gemini
        try:
            from app_config import Config
            import google.generativeai as genai

            genai.configure(api_key=Config.GEMINI_API_KEY)
            model = genai.GenerativeModel('gemini-2.5-flash-lite')
            response = model.generate_content(prompt)

            # Parse response
            response_text = response.text.strip()
            if response_text.startswith('```'):
                response_text = response_text.split('\n', 1)[1].rsplit('```', 1)[0].strip()

            suggestions = json.loads(response_text)
            if not isinstance(suggestions, list):
                suggestions = []

            # Filter to only valid completion IDs
            valid_ids = {c['id'] for c in completions.data}
            filtered_suggestions = []
            for s in suggestions:
                valid_completion_ids = [cid for cid in s.get('completion_ids', []) if cid in valid_ids]
                if len(valid_completion_ids) >= 2:
                    filtered_suggestions.append({
                        'completion_ids': valid_completion_ids,
                        'reason': s.get('reason', ''),
                        'confidence': min(1.0, max(0.0, float(s.get('confidence', 0.5))))
                    })

            # Cache result
            _suggestion_cache[cache_key] = {
                'timestamp': time.time(),
                'data': filtered_suggestions
            }

            return success_response(data={'suggestions': filtered_suggestions, 'cached': False})

        except ImportError:
            logger.warning("Google Generative AI not available for merge suggestions")
            return success_response(data={'suggestions': [], 'cached': False, 'ai_unavailable': True})
        except Exception as ai_err:
            logger.error(f"AI merge suggestion error: {ai_err}")
            return success_response(data={'suggestions': [], 'cached': False, 'ai_error': True})

    except Exception as e:
        logger.error(f"Error generating merge suggestions: {str(e)}")
        return error_response(code='SUGGESTION_ERROR', message='Failed to generate suggestions', status=500)

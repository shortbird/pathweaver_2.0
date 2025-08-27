"""
Learning log endpoints for Quest V3 system.
Handles learning log entries for quest progress documentation.
"""

from flask import Blueprint, request, jsonify
from database import get_supabase_admin_client, get_supabase_client
from utils.auth.decorators import require_auth
from datetime import datetime
from typing import Dict, List, Optional
import re

bp = Blueprint('learning_logs_v3', __name__, url_prefix='/api/v3/logs')

# Maximum log entry length
MAX_LOG_ENTRY_LENGTH = 2000
MIN_LOG_ENTRY_LENGTH = 10

@bp.route('/<user_quest_id>/entry', methods=['POST'])
@require_auth
def add_log_entry(user_id: str, user_quest_id: str):
    """
    Add a new learning log entry for an active quest.
    """
    try:
        supabase = get_supabase_admin_client()
        
        # Verify the user_quest belongs to the current user
        user_quest = supabase.table('user_quests')\
            .select('id, quest_id, quests(title)')\
            .eq('id', user_quest_id)\
            .eq('user_id', user_id)\
            .eq('is_active', True)\
            .single()\
            .execute()
        
        if not user_quest.data:
            return jsonify({
                'success': False,
                'error': 'Quest enrollment not found or inactive'
            }), 404
        
        # Get entry data
        data = request.get_json()
        entry_text = data.get('log_entry', '').strip()
        media_url = data.get('media_url', '')
        
        # Validate entry text
        if not entry_text:
            return jsonify({
                'success': False,
                'error': 'Log entry text is required'
            }), 400
        
        if len(entry_text) < MIN_LOG_ENTRY_LENGTH:
            return jsonify({
                'success': False,
                'error': f'Log entry must be at least {MIN_LOG_ENTRY_LENGTH} characters'
            }), 400
        
        if len(entry_text) > MAX_LOG_ENTRY_LENGTH:
            return jsonify({
                'success': False,
                'error': f'Log entry cannot exceed {MAX_LOG_ENTRY_LENGTH} characters'
            }), 400
        
        # Sanitize entry text
        entry_text = sanitize_log_text(entry_text)
        
        # Validate media URL if provided
        if media_url:
            if not is_valid_media_url(media_url):
                return jsonify({
                    'success': False,
                    'error': 'Invalid media URL format'
                }), 400
        
        # Create log entry
        log_entry = supabase.table('learning_logs')\
            .insert({
                'user_quest_id': user_quest_id,
                'user_id': user_id,
                'entry_text': entry_text,
                'media_url': media_url if media_url else None,
                'created_at': datetime.utcnow().isoformat()
            })\
            .execute()
        
        if not log_entry.data:
            return jsonify({
                'success': False,
                'error': 'Failed to create log entry'
            }), 500
        
        # Check if this qualifies for learning log bonus XP
        log_count = supabase.table('learning_logs')\
            .select('id', count='exact')\
            .eq('user_quest_id', user_quest_id)\
            .execute()
        
        bonus_message = ''
        if log_count.count == 5:
            # Award bonus XP for consistent logging (implement if needed)
            bonus_message = ' You\'ve earned a bonus for consistent logging!'
        
        return jsonify({
            'success': True,
            'message': f'Learning log entry added{bonus_message}',
            'entry': log_entry.data[0],
            'total_entries': log_count.count
        })
        
    except Exception as e:
        print(f"Error adding log entry: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to add log entry'
        }), 500

@bp.route('/<user_quest_id>', methods=['GET'])
@require_auth
def get_quest_logs(user_id: str, user_quest_id: str):
    """
    Get all learning log entries for a specific quest enrollment.
    """
    try:
        supabase = get_supabase_client()
        
        # Verify access to this quest
        user_quest = supabase.table('user_quests')\
            .select('id, quest_id, quests(title)')\
            .eq('id', user_quest_id)\
            .execute()
        
        if not user_quest.data:
            return jsonify({
                'success': False,
                'error': 'Quest enrollment not found'
            }), 404
        
        # Allow viewing own logs or public logs (for diploma)
        is_owner = user_quest.data[0].get('user_id') == user_id
        
        # Get pagination parameters
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 20))
        offset = (page - 1) * per_page
        
        # Get learning logs
        logs = supabase.table('learning_logs')\
            .select('*', count='exact')\
            .eq('user_quest_id', user_quest_id)\
            .order('created_at', desc=True)\
            .range(offset, offset + per_page - 1)\
            .execute()
        
        if not logs.data:
            return jsonify({
                'success': True,
                'quest': user_quest.data[0]['quests'],
                'logs': [],
                'message': 'No log entries yet'
            })
        
        # Format logs for display
        formatted_logs = []
        for log in logs.data:
            formatted_logs.append({
                'id': log['id'],
                'entry_text': log['entry_text'],
                'media_url': log['media_url'],
                'created_at': log['created_at'],
                'is_owner': is_owner
            })
        
        return jsonify({
            'success': True,
            'quest': user_quest.data[0]['quests'],
            'logs': formatted_logs,
            'total': logs.count,
            'page': page,
            'per_page': per_page,
            'total_pages': (logs.count + per_page - 1) // per_page if logs.count else 0
        })
        
    except Exception as e:
        print(f"Error getting quest logs: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch learning logs'
        }), 500

@bp.route('/<log_id>', methods=['DELETE'])
@require_auth
def delete_log_entry(user_id: str, log_id: str):
    """
    Delete a learning log entry (only by owner).
    """
    try:
        supabase = get_supabase_admin_client()
        
        # Verify ownership
        log_entry = supabase.table('learning_logs')\
            .select('id, user_id')\
            .eq('id', log_id)\
            .single()\
            .execute()
        
        if not log_entry.data:
            return jsonify({
                'success': False,
                'error': 'Log entry not found'
            }), 404
        
        if log_entry.data['user_id'] != user_id:
            return jsonify({
                'success': False,
                'error': 'You can only delete your own log entries'
            }), 403
        
        # Delete the entry
        deleted = supabase.table('learning_logs')\
            .delete()\
            .eq('id', log_id)\
            .execute()
        
        if deleted:
            return jsonify({
                'success': True,
                'message': 'Log entry deleted successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to delete log entry'
            }), 500
            
    except Exception as e:
        print(f"Error deleting log entry: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to delete log entry'
        }), 500

@bp.route('/<log_id>', methods=['PUT'])
@require_auth
def update_log_entry(user_id: str, log_id: str):
    """
    Update a learning log entry (only by owner, within 24 hours).
    """
    try:
        supabase = get_supabase_admin_client()
        
        # Verify ownership and check time limit
        log_entry = supabase.table('learning_logs')\
            .select('id, user_id, created_at')\
            .eq('id', log_id)\
            .single()\
            .execute()
        
        if not log_entry.data:
            return jsonify({
                'success': False,
                'error': 'Log entry not found'
            }), 404
        
        if log_entry.data['user_id'] != user_id:
            return jsonify({
                'success': False,
                'error': 'You can only edit your own log entries'
            }), 403
        
        # Check if entry is within 24 hours old
        created_at = datetime.fromisoformat(log_entry.data['created_at'].replace('Z', '+00:00'))
        time_diff = datetime.utcnow() - created_at.replace(tzinfo=None)
        if time_diff.total_seconds() > 86400:  # 24 hours
            return jsonify({
                'success': False,
                'error': 'Log entries can only be edited within 24 hours of creation'
            }), 403
        
        # Get update data
        data = request.get_json()
        entry_text = data.get('log_entry', '').strip()
        
        if not entry_text:
            return jsonify({
                'success': False,
                'error': 'Log entry text is required'
            }), 400
        
        if len(entry_text) < MIN_LOG_ENTRY_LENGTH:
            return jsonify({
                'success': False,
                'error': f'Log entry must be at least {MIN_LOG_ENTRY_LENGTH} characters'
            }), 400
        
        if len(entry_text) > MAX_LOG_ENTRY_LENGTH:
            return jsonify({
                'success': False,
                'error': f'Log entry cannot exceed {MAX_LOG_ENTRY_LENGTH} characters'
            }), 400
        
        # Sanitize and update
        entry_text = sanitize_log_text(entry_text)
        
        updated = supabase.table('learning_logs')\
            .update({
                'entry_text': entry_text,
                'updated_at': datetime.utcnow().isoformat()
            })\
            .eq('id', log_id)\
            .execute()
        
        if not updated.data:
            return jsonify({
                'success': False,
                'error': 'Failed to update log entry'
            }), 500
        
        return jsonify({
            'success': True,
            'message': 'Log entry updated successfully',
            'entry': updated.data[0]
        })
        
    except Exception as e:
        print(f"Error updating log entry: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update log entry'
        }), 500

@bp.route('/user/recent', methods=['GET'])
@require_auth
def get_user_recent_logs(user_id: str):
    """
    Get recent learning log entries across all quests for a user.
    Used for dashboard display.
    """
    try:
        supabase = get_supabase_client()
        
        # Get recent logs with quest info
        recent_logs = supabase.table('learning_logs')\
            .select('*, user_quests(quest_id, quests(title, header_image_url))')\
            .eq('user_id', user_id)\
            .order('created_at', desc=True)\
            .limit(10)\
            .execute()
        
        if not recent_logs.data:
            return jsonify({
                'success': True,
                'logs': [],
                'message': 'No learning log entries yet'
            })
        
        # Format logs with quest context
        formatted_logs = []
        for log in recent_logs.data:
            quest_info = log.get('user_quests', {}).get('quests', {})
            formatted_logs.append({
                'id': log['id'],
                'entry_text': log['entry_text'][:200] + '...' if len(log['entry_text']) > 200 else log['entry_text'],
                'media_url': log['media_url'],
                'created_at': log['created_at'],
                'quest_title': quest_info.get('title', 'Unknown Quest'),
                'quest_image': quest_info.get('header_image_url')
            })
        
        return jsonify({
            'success': True,
            'logs': formatted_logs,
            'total': len(formatted_logs)
        })
        
    except Exception as e:
        print(f"Error getting user recent logs: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch recent logs'
        }), 500

def sanitize_log_text(text: str) -> str:
    """
    Sanitize learning log text to prevent XSS and formatting issues.
    """
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    
    # Remove excessive whitespace
    text = re.sub(r'\s+', ' ', text)
    
    # Remove control characters
    text = ''.join(char for char in text if ord(char) >= 32 or char == '\n')
    
    return text.strip()

def is_valid_media_url(url: str) -> bool:
    """
    Validate media URL format and safety.
    """
    # Check URL format
    url_pattern = r'^https?://.+'
    if not re.match(url_pattern, url):
        return False
    
    # Check for dangerous protocols
    dangerous_protocols = ['javascript:', 'data:', 'vbscript:']
    if any(url.lower().startswith(proto) for proto in dangerous_protocols):
        return False
    
    # Check reasonable length
    if len(url) > 500:
        return False
    
    return True